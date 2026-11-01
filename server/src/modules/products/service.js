import mongoose from 'mongoose';
import { Category, Product, Inventory } from '../../database/models.js';
import { HttpError } from '../shared/errors.js';

export function readId(id, field = 'id') {
  if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(400, `${field} must be a valid record ID.`);
  return id;
}

function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Supply only the documented fields.');
  }
  if (!Object.keys(body).length || required.some((key) => body[key] === undefined)) {
    throw new HttpError(400, `Required fields: ${required.join(', ') || allowed.join(', ')}.`);
  }
  return { ...body };
}

function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `${field} must contain 1–${max} characters.`);
  }
  return value.trim();
}

export function categoryInput(body) {
  const input = fields(body, ['name'], ['name']);
  return { name: text(input.name, 'Category name', 80) };
}

export function productInput(body, creating = false) {
  const allowed = ['sku', 'name', 'categoryId', 'sellingPriceMinor', 'minimumStock'];
  const input = fields(body, allowed, creating ? allowed : []);
  if ('sku' in input) input.sku = text(input.sku, 'SKU', 40).toUpperCase();
  if ('name' in input) input.name = text(input.name, 'Product name', 150);
  if ('categoryId' in input) readId(input.categoryId, 'categoryId');
  for (const field of ['sellingPriceMinor', 'minimumStock']) {
    if (field in input && (!Number.isSafeInteger(input[field]) || input[field] < 0)) {
      throw new HttpError(400, `${field} must be a nonnegative safe integer.`);
    }
  }
  return input;
}

export async function catalogueWrite(operation) {
  try { return await operation(); }
  catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'SKU or category name already exists.');
    if (error.name === 'ValidationError') throw new HttpError(400, 'Invalid product or category fields.');
    throw error;
  }
}

// Touch the category in the same transaction as a reference write. This serializes
// product creation/reclassification with category deletion (a read check alone races).
async function lockCategory(id, session) {
  const category = await Category.findOneAndUpdate({ _id: id }, { $inc: { __v: 1 } }, { session });
  if (!category) throw new HttpError(404, 'Category not found.');
}

export async function createProduct(body) {
  const input = productInput(body, true);
  return catalogueWrite(() => mongoose.connection.transaction(async (session) => {
    await lockCategory(input.categoryId, session);
    const [product] = await Product.create([input], { session });
    await Inventory.create([{ productId: product._id, availableQty: 0 }], { session });
    return product;
  }));
}

export async function updateProduct(id, body) {
  readId(id);
  const input = productInput(body);
  return catalogueWrite(() => mongoose.connection.transaction(async (session) => {
    if (input.categoryId) await lockCategory(input.categoryId, session);
    const product = await Product.findByIdAndUpdate(id, { $set: input }, { session, returnDocument: 'after' });
    if (!product) throw new HttpError(404, 'Product not found.');
    return product;
  }));
}

export async function deactivateProduct(id) {
  readId(id);
  const product = await Product.findByIdAndUpdate(id, { $set: { status: 'INACTIVE' } }, { returnDocument: 'after' });
  if (!product) throw new HttpError(404, 'Product not found.');
  return product;
}

export async function deleteCategory(id) {
  readId(id);
  return mongoose.connection.transaction(async (session) => {
    await lockCategory(id, session);
    if (await Product.exists({ categoryId: id }).session(session)) {
      throw new HttpError(409, 'Category is used by products and cannot be deleted.');
    }
    await Category.deleteOne({ _id: id }, { session });
  });
}
