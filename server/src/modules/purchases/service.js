import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Product, Purchase, PurchaseReceipt, Supplier, User } from '../../database/models.js';
import { PURCHASE_STATUSES } from '../../database/definitions.js';
import { can } from '../auth/permissions.js';
import { applyStockChange, recordId } from '../inventory/service.js';
import { HttpError } from '../shared/errors.js';

const normalizedId = (id, field) => new mongoose.Types.ObjectId(recordId(id, field)).toString();
const fingerprintOf = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const conflict = () => new HttpError(409, 'This Idempotency-Key already belongs to a different purchase operation.');

function fields(value, allowed, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, message);
  }
}
export function purchaseRequestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(value)) throw new HttpError(400, 'A valid Idempotency-Key header is required.');
  return value;
}
export function calendarDate(value, field = 'orderDate') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${field} must be a date in YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, `${field} must be a valid calendar date.`);
  return date;
}
function linesInput(items, receipt = false) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new HttpError(400, 'Provide between 1 and 100 purchase items.');
  const lines = items.map((item) => {
    fields(item, receipt ? ['productId', 'quantity'] : ['productId', 'orderedQty', 'unitCostMinor'], 'Supply only the documented purchase item fields.');
    const productId = normalizedId(item.productId, 'productId');
    const quantity = receipt ? item.quantity : item.orderedQty;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new HttpError(400, 'Purchase and receipt quantities must be positive safe integers.');
    if (receipt) return { productId, quantity };
    if (!Number.isSafeInteger(item.unitCostMinor) || item.unitCostMinor < 0) throw new HttpError(400, 'unitCostMinor must be a nonnegative safe integer.');
    return { productId, orderedQty: quantity, unitCostMinor: item.unitCostMinor };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw new HttpError(400, 'A product may appear only once in a purchase or receipt.');
  return lines;
}
export function purchaseInput(body, partial = false) {
  fields(body, ['supplierId', 'orderDate', 'status', 'items'], 'Supply only supplierId, orderDate, status and items.');
  if (!partial && ['supplierId', 'orderDate', 'items'].some((key) => body[key] === undefined)) throw new HttpError(400, 'supplierId, orderDate and items are required.');
  const input = {};
  if (body.supplierId !== undefined) input.supplierId = normalizedId(body.supplierId, 'supplierId');
  if (body.orderDate !== undefined) input.orderDate = calendarDate(body.orderDate).toISOString().slice(0, 10);
  if (body.items !== undefined) input.items = linesInput(body.items);
  if (!partial || body.status !== undefined) {
    input.status = body.status ?? 'ORDERED';
    if (!(partial ? ['DRAFT', 'ORDERED', 'CANCELLED'] : ['DRAFT', 'ORDERED']).includes(input.status)) throw new HttpError(400, 'Choose a valid purchase order status; receipt statuses are calculated by the server.');
  }
  return input;
}
async function authorize(createdBy, permission, session = null) {
  const actor = await User.findById(recordId(createdBy, 'createdBy')).session(session).lean();
  if (!actor || actor.status !== 'ACTIVE' || !can(actor, permission)) throw new HttpError(403, 'You do not have permission to do this.');
  return actor;
}
async function activeSupplier(id, session) {
  const supplier = await Supplier.findOneAndUpdate({ _id: id, status: 'ACTIVE' }, { $inc: { __v: 1 } }, { session, returnDocument: 'after' });
  if (supplier) return supplier;
  if (!await Supplier.exists({ _id: id }).session(session)) throw new HttpError(404, 'Supplier not found.');
  throw new HttpError(409, 'Choose an active supplier for a new or edited purchase order.');
}
const snapshot = (supplier) => Object.fromEntries(['name', 'contactName', 'phone', 'email', 'address'].map((field) => [field, supplier[field] || '']));
async function storedLines(items, session) {
  let totalMinor = 0;
  const stored = [];
  for (const line of items) {
    const product = await Product.findOneAndUpdate({ _id: line.productId, status: 'ACTIVE' }, { $inc: { __v: 1 } }, { session });
    if (!product) {
      if (!await Product.exists({ _id: line.productId }).session(session)) throw new HttpError(404, 'Product not found.');
      throw new HttpError(409, 'Inactive products cannot be added to purchase orders.');
    }
    const lineTotalMinor = line.orderedQty * line.unitCostMinor;
    if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(totalMinor + lineTotalMinor)) throw new HttpError(400, 'Purchase total exceeds the supported monetary limit.');
    totalMinor += lineTotalMinor;
    stored.push({ ...line, sku: product.sku, name: product.name, receivedQty: 0, lineTotalMinor });
  }
  return { items: stored, totalMinor };
}
async function replay(model, requestId, fingerprint, session = null) {
  const previous = await model.findOne({ requestId }).session(session).lean();
  if (previous && previous.requestFingerprint !== fingerprint) throw conflict();
  return previous;
}

export async function recordPurchase({ body, createdBy, requestId }) {
  const input = purchaseInput(body);
  createdBy = normalizedId(createdBy, 'createdBy'); requestId = purchaseRequestKey(requestId);
  const fingerprint = fingerprintOf({ createdBy, ...input }), id = new mongoose.Types.ObjectId();
  try {
    return await mongoose.connection.transaction(async (session) => {
      await authorize(createdBy, 'purchases:manage', session);
      const previous = await replay(Purchase, requestId, fingerprint, session);
      if (previous) return previous;
      const supplier = await activeSupplier(input.supplierId, session);
      const lines = await storedLines(input.items, session);
      const purchase = new Purchase({ _id: id, orderNumber: `PO-${id.toString().toUpperCase()}`, requestId, requestFingerprint: fingerprint,
        supplierId: supplier._id, supplierSnapshot: snapshot(supplier), orderDate: calendarDate(input.orderDate), status: input.status, createdBy, ...lines });
      await purchase.save({ session });
      return purchase.toObject();
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    await authorize(createdBy, 'purchases:manage');
    const previous = await replay(Purchase, requestId, fingerprint);
    if (!previous) throw error;
    return previous;
  }
}

async function lockedPurchase(id, session) {
  const purchase = await Purchase.findByIdAndUpdate(recordId(id, 'purchaseId'), { $inc: { __v: 1 } }, { session, returnDocument: 'after' });
  if (!purchase) throw new HttpError(404, 'Purchase not found.');
  return purchase;
}

export async function updatePurchase({ id, body, createdBy }) {
  const input = purchaseInput(body, true);
  return mongoose.connection.transaction(async (session) => {
    await authorize(createdBy, 'purchases:manage', session);
    const purchase = await lockedPurchase(id, session);
    if (!['DRAFT', 'ORDERED'].includes(purchase.status)) throw new HttpError(409, 'Only unreceived draft or ordered purchases can be edited or cancelled.');
    if (purchase.status === 'ORDERED' && input.status === 'DRAFT') throw new HttpError(409, 'An ordered purchase cannot be moved back to draft.');
    if (input.status === 'CANCELLED') {
      if (Object.keys(input).length !== 1) throw new HttpError(400, 'Cancel the purchase separately from editing its details.');
    } else {
      const supplier = await activeSupplier(input.supplierId || purchase.supplierId, session);
      if (input.supplierId && input.supplierId !== String(purchase.supplierId)) { purchase.supplierId = supplier._id; purchase.supplierSnapshot = snapshot(supplier); }
      if (input.items) Object.assign(purchase, await storedLines(input.items, session));
      if (input.orderDate) purchase.orderDate = calendarDate(input.orderDate);
    }
    if (input.status) purchase.status = input.status;
    await purchase.save({ session });
    return purchase.toObject();
  });
}

export async function receivePurchase({ id, body, receivedBy, requestId }) {
  id = normalizedId(id, 'purchaseId'); receivedBy = normalizedId(receivedBy, 'receivedBy'); requestId = purchaseRequestKey(requestId);
  fields(body, ['items'], 'Supply only the received items.');
  const items = linesInput(body.items, true), fingerprint = fingerprintOf({ purchaseId: id, receivedBy, items });
  const receiptId = new mongoose.Types.ObjectId();
  let abortedError;
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      await authorize(receivedBy, 'purchases:receive', session);
      const previous = await replay(PurchaseReceipt, requestId, fingerprint, session);
      if (previous) return { receipt: previous, purchase: await Purchase.findById(id).session(session).lean() };
      const purchase = await lockedPurchase(id, session);
      if (!['ORDERED', 'PARTIAL'].includes(purchase.status)) throw new HttpError(409, 'Only ordered or partially received purchases can receive goods.');
      for (const item of items) {
        const line = purchase.items.find((entry) => String(entry.productId) === item.productId);
        if (!line) throw new HttpError(400, 'Receipt products must belong to this purchase.');
        if (item.quantity > line.orderedQty - line.receivedQty) throw new HttpError(409, `Received quantity exceeds the remaining quantity for ${line.sku}.`);
        line.receivedQty += item.quantity;
      }
      purchase.status = purchase.items.every((line) => line.receivedQty === line.orderedQty) ? 'RECEIVED' : 'PARTIAL';
      await purchase.save({ session });
      const inventoryTransactionIds = [];
      for (const item of items) {
        try {
          const result = await applyStockChange({ productId: item.productId, changeQty: item.quantity, createdBy: receivedBy, sourceType: 'PURCHASE', sourceId: purchase._id }, { session });
          inventoryTransactionIds.push(result.transaction._id);
        } catch (error) {
          // The shared service eagerly aborts caller-owned transactions. The
          // driver aborts ordinary callback errors again, masking their status.
          // Let it observe the completed abort, then propagate the real error.
          // Mongo errors still reach the driver for transient-error retries.
          if (!session.inTransaction() && !(error instanceof mongoose.mongo.MongoError)) { abortedError = error; return null; }
          throw error;
        }
      }
      const [receipt] = await PurchaseReceipt.create([{ _id: receiptId, requestId, requestFingerprint: fingerprint, purchaseId: purchase._id,
        receivedBy, receivedAt: new Date(), items, inventoryTransactionIds }], { session });
      return { receipt: receipt.toObject(), purchase: purchase.toObject() };
    });
    if (abortedError) throw abortedError;
    return result;
  } catch (error) {
    if (error.code !== 11000) throw error;
    await authorize(receivedBy, 'purchases:receive');
    const previous = await replay(PurchaseReceipt, requestId, fingerprint);
    if (!previous) throw error;
    return { receipt: previous, purchase: await Purchase.findById(id).lean() };
  }
}

export function purchaseHistoryFilters(query = {}) {
  if (Object.keys(query).some((key) => !['supplierId', 'from', 'to', 'status', 'orderNumber'].includes(key))) throw new HttpError(400, 'Unsupported purchase history filter.');
  const filter = {};
  if (query.supplierId !== undefined) filter.supplierId = recordId(query.supplierId, 'supplierId');
  if (query.status !== undefined) {
    if (!PURCHASE_STATUSES.includes(query.status)) throw new HttpError(400, 'Choose a valid purchase status.');
    filter.status = query.status;
  }
  if (query.orderNumber !== undefined) {
    if (typeof query.orderNumber !== 'string' || !query.orderNumber.trim() || query.orderNumber.length > 40) throw new HttpError(400, 'orderNumber must contain 1–40 characters.');
    filter.orderNumber = query.orderNumber.trim();
  }
  const range = {};
  if (query.from !== undefined) range.$gte = calendarDate(query.from, 'from');
  if (query.to !== undefined) { range.$lt = calendarDate(query.to, 'to'); range.$lt.setUTCDate(range.$lt.getUTCDate() + 1); }
  if (range.$gte && range.$lt && range.$gte >= range.$lt) throw new HttpError(400, 'from must be on or before to.');
  if (Object.keys(range).length) filter.orderDate = range;
  return filter;
}
