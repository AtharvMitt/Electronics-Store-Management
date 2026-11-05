import mongoose from 'mongoose';
import { Inventory, InventoryTransaction, Product, User } from '../../database/models.js';
import { can } from '../auth/permissions.js';
import { HttpError } from '../shared/errors.js';

export function recordId(id, field = 'productId') {
  if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(400, `${field} must be a valid record ID.`);
  return id;
}

export function inventoryFilters(query) {
  const allowed = ['search', 'categoryId', 'lowStockOnly'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unsupported inventory filter.');
  const search = query.search ?? '';
  if (typeof search !== 'string' || search.length > 100) throw new HttpError(400, 'search must be at most 100 characters.');
  const categoryId = query.categoryId;
  if (categoryId !== undefined) recordId(categoryId, 'categoryId');
  const lowStockOnly = query.lowStockOnly ?? 'false';
  if (!['true', 'false'].includes(lowStockOnly)) throw new HttpError(400, 'lowStockOnly must be true or false.');
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    search: escaped ? new RegExp(escaped, 'i') : null,
    productMatch: categoryId ? { 'product.categoryId': new mongoose.Types.ObjectId(categoryId) } : {},
    lowStockOnly: lowStockOnly === 'true',
  };
}

export function adjustmentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['changeQty', 'reason'].includes(key))) {
    throw new HttpError(400, 'Supply only changeQty and reason.');
  }
  if (!Number.isSafeInteger(body.changeQty)) throw new HttpError(400, 'changeQty must be a signed safe integer.');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 250) {
    throw new HttpError(400, 'reason must contain 1–250 characters.');
  }
  return { changeQty: body.changeQty, reason: body.reason.trim() };
}

const sourcePermission = { ADJUSTMENT: 'inventory:adjust', PURCHASE: 'purchases:receive', SALE: 'sales:create' };

// Trusted backend contract for #16/#18: source documents must already exist in
// the same transaction. HTTP callers cannot supply sourceType/sourceId/createdBy.
export async function applyStockChange({ productId, changeQty, createdBy, sourceType, sourceId, reason }, { session } = {}) {
  recordId(productId); recordId(createdBy, 'createdBy');
  if (!Object.hasOwn(sourcePermission, sourceType)) throw new HttpError(400, 'Unsupported stock source type.');
  if (!Number.isSafeInteger(changeQty)) throw new HttpError(400, 'changeQty must be a signed safe integer.');
  if ((sourceType === 'PURCHASE' && changeQty <= 0) || (sourceType === 'SALE' && changeQty >= 0)) {
    throw new HttpError(400, 'Purchase changes must be positive and sale changes negative.');
  }
  if (sourceType === 'ADJUSTMENT') ({ reason } = adjustmentInput({ changeQty, reason }));
  else recordId(sourceId, 'sourceId');
  if (session && !session.inTransaction()) throw new Error('Stock changes require an active transaction session.');
  const eventId = new mongoose.Types.ObjectId();

  async function apply(transactionSession) {
    // Re-read the actor from MongoDB; a caller's role/authority is never trusted.
    const actor = await User.findById(createdBy).session(transactionSession).lean();
    if (!actor || actor.status !== 'ACTIVE' || !can(actor, sourcePermission[sourceType])) {
      throw new HttpError(403, 'You do not have permission to do this.');
    }
    // Serialize against product retirement as well as other stock changes.
    const product = await Product.findOneAndUpdate({ _id: productId, status: 'ACTIVE' }, { $inc: { __v: 1 } }, { session: transactionSession });
    if (!product) {
      if (!await Product.exists({ _id: productId }).session(transactionSession)) throw new HttpError(404, 'Product not found.');
      throw new HttpError(409, 'Inactive products cannot receive new stock changes.');
    }
    const bounds = changeQty < 0 ? { $gte: -changeQty } : { $lte: Number.MAX_SAFE_INTEGER - changeQty };
    const inventory = await Inventory.findOneAndUpdate({ productId, availableQty: bounds }, { $inc: { availableQty: changeQty } }, { session: transactionSession, returnDocument: 'after' });
    if (!inventory) {
      if (!await Inventory.exists({ productId }).session(transactionSession)) {
        throw new HttpError(409, 'Inventory record is missing. Ask an administrator to repair the product setup.');
      }
      throw new HttpError(409, changeQty < 0 ? 'Insufficient stock for this change.' : 'Stock would exceed the safe integer limit.');
    }
    const [transaction] = await InventoryTransaction.create([{
      _id: eventId, productId, changeQty, sourceType,
      sourceId: sourceType === 'ADJUSTMENT' ? eventId : sourceId, createdBy,
      ...(sourceType === 'ADJUSTMENT' ? { reason } : {}),
    }], { session: transactionSession });
    return { inventory, transaction };
  }

  if (!session) return mongoose.connection.transaction(apply);
  try { return await apply(session); }
  catch (error) {
    // Do not let a caller catch a failed audit append and commit only the stock.
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  }
}

export function adjustStock({ productId, changeQty, reason, createdBy }, options) {
  return applyStockChange({ productId, changeQty, reason, createdBy, sourceType: 'ADJUSTMENT' }, options);
}
