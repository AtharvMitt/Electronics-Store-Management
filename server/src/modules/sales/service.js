import mongoose from 'mongoose';
import { Inventory, Product, Sale, User } from '../../database/models.js';
import { can } from '../auth/permissions.js';
import { HttpError } from '../shared/errors.js';
import { applyStockChange, recordId } from '../inventory/service.js';

export function saleInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => key !== 'items') || !Array.isArray(body.items)
    || body.items.length < 1 || body.items.length > 100) {
    throw new HttpError(400, 'Provide between 1 and 100 sale items.');
  }
  const items = body.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some((key) => !['productId', 'quantity'].includes(key))) {
      throw new HttpError(400, 'Each sale item must contain only productId and quantity.');
    }
    const productId = recordId(item.productId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new HttpError(400, 'Sale quantities must be positive safe integers.');
    return { productId: new mongoose.Types.ObjectId(productId).toString(), quantity: item.quantity };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) throw new HttpError(400, 'A product may appear only once in a sale.');
  return items;
}

export function requestKeyInput(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(value)) throw new HttpError(400, 'A valid Idempotency-Key header is required.');
  return value;
}

function sameSaleItems(sale, items) {
  return sale.items.length === items.length && sale.items.every((line, index) =>
    String(line.productId) === items[index].productId && line.quantity === items[index].quantity);
}

// Keep concurrent retries on this API process on the same transaction. The
// unique MongoDB index remains the durable guard across restarts/processes.
const pendingSales = new Map();

export async function recordSale(input) {
  const { items, createdBy, requestId } = input;
  recordId(createdBy, 'createdBy');
  requestKeyInput(requestId);
  const fingerprint = JSON.stringify({ createdBy: String(createdBy), items });
  const pending = pendingSales.get(requestId);
  if (pending) {
    if (pending.fingerprint !== fingerprint) throw new HttpError(409, 'This Idempotency-Key already belongs to a different sale.');
    return pending.promise;
  }
  const promise = createSale({ items, createdBy, requestId });
  const entry = { fingerprint, promise };
  pendingSales.set(requestId, entry);
  try {
    return await promise;
  } finally {
    if (pendingSales.get(requestId) === entry) pendingSales.delete(requestId);
  }
}

async function createSale({ items, createdBy, requestId }) {
  const saleId = new mongoose.Types.ObjectId();
  try {
    return await mongoose.connection.transaction(async (session) => {
    const existing = await Sale.findOne({ requestId }).session(session).lean();
    if (existing) {
      if (String(existing.createdBy) !== String(createdBy) || !sameSaleItems(existing, items)) throw new HttpError(409, 'This Idempotency-Key already belongs to a different sale.');
      return existing;
    }
    const actor = await User.findById(createdBy).session(session).lean();
    if (!actor || actor.status !== 'ACTIVE' || !can(actor, 'sales:create')) throw new HttpError(403, 'You do not have permission to do this.');
    const saleItems = [];
    let totalMinor = 0;
    for (const line of items) {
      const product = await Product.findOne({ _id: line.productId, status: 'ACTIVE' }).session(session).lean();
      if (!product) {
        if (await Product.exists({ _id: line.productId }).session(session)) throw new HttpError(409, 'Inactive products cannot be sold.');
        throw new HttpError(404, 'Product not found.');
      }
      const inventory = await Inventory.findOne({ productId: product._id }).session(session).lean();
      if (!inventory) throw new HttpError(409, 'Inventory record is missing. Ask an administrator to repair the product setup.');
      if (inventory.availableQty < line.quantity) throw new HttpError(409, `Insufficient stock for ${product.sku}.`);
      const lineTotalMinor = product.sellingPriceMinor * line.quantity;
      if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(totalMinor + lineTotalMinor)) throw new HttpError(400, 'Sale total exceeds the supported monetary limit.');
      totalMinor += lineTotalMinor;
      saleItems.push({ productId: product._id, sku: product.sku, name: product.name, quantity: line.quantity,
        unitPriceMinor: product.sellingPriceMinor, lineTotalMinor });
    }
    const sale = new Sale({ _id: saleId, transactionNumber: `SALE-${saleId.toString().toUpperCase()}`, requestId,
      saleDate: new Date(), createdBy: actor._id, totalMinor, items: saleItems });
    await sale.save({ session });
    for (const item of saleItems) {
      await applyStockChange({ productId: item.productId, changeQty: -item.quantity, createdBy: actor._id,
        sourceType: 'SALE', sourceId: sale._id }, { session });
    }
    return sale.toObject();
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await Sale.findOne({ requestId }).lean();
    if (!existing) throw error;
    if (String(existing.createdBy) !== String(createdBy) || !sameSaleItems(existing, items)) throw new HttpError(409, 'This Idempotency-Key already belongs to a different sale.');
    return existing;
  }
}

export function saleHistoryFilters(query) {
  if (Object.keys(query).some((key) => !['transactionNumber', 'from', 'to'].includes(key))) throw new HttpError(400, 'Unsupported sales history filter.');
  const filter = {};
  if (query.transactionNumber !== undefined) {
    if (typeof query.transactionNumber !== 'string' || !query.transactionNumber.trim() || query.transactionNumber.length > 40) {
      throw new HttpError(400, 'transactionNumber must contain 1–40 characters.');
    }
    filter.transactionNumber = query.transactionNumber.trim();
  }
  const range = {};
  for (const key of ['from', 'to']) {
    if (query[key] === undefined) continue;
    if (typeof query[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[key])) throw new HttpError(400, `${key} must be a date in YYYY-MM-DD format.`);
    const date = new Date(`${query[key]}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== query[key]) throw new HttpError(400, `${key} is not a valid calendar date.`);
    if (key === 'from') range.$gte = date;
    else { date.setUTCDate(date.getUTCDate() + 1); range.$lt = date; }
  }
  if (range.$gte && range.$lt && range.$gte >= range.$lt) throw new HttpError(400, 'from must be on or before to.');
  if (Object.keys(range).length) filter.saleDate = range;
  return filter;
}

export async function getSales(query = {}) {
  return Sale.find(saleHistoryFilters(query)).sort({ saleDate: -1, _id: -1 }).lean();
}
