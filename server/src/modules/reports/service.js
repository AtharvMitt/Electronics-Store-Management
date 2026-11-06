import mongoose from 'mongoose';
import { Inventory, Sale } from '../../database/models.js';
import { HttpError } from '../shared/errors.js';

export function dateRange(query) {
  if (Object.keys(query).some((key) => !['from', 'to'].includes(key))) throw new HttpError(400, 'Only from and to date filters are supported.');
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
  return range;
}

export async function salesReport(query) {
  const date = dateRange(query);
  const sales = await Sale.find(Object.keys(date).length ? { saleDate: date } : {}).sort({ saleDate: -1, _id: -1 }).lean();
  const totalMinor = sales.reduce((total, sale) => {
    if (!Number.isSafeInteger(total + sale.totalMinor)) throw new HttpError(409, 'Report total exceeds the supported monetary limit.');
    return total + sale.totalMinor;
  }, 0);
  const unitsSold = sales.reduce((total, sale) => sale.items.reduce((sum, item) => {
    if (!Number.isSafeInteger(sum + item.quantity)) throw new HttpError(409, 'Report unit count exceeds the supported limit.');
    return sum + item.quantity;
  }, total), 0);
  return {
    sales,
    transactionCount: sales.length,
    totalMinor,
    unitsSold,
  };
}

function inventoryFilters(query, { lowStock = false } = {}) {
  const allowed = lowStock ? ['categoryId'] : ['categoryId', 'status', 'stockStatus'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unsupported inventory report filter.');
  if (query.categoryId !== undefined && !mongoose.isObjectIdOrHexString(query.categoryId)) throw new HttpError(400, 'categoryId must be a valid record ID.');
  const status = query.status ?? 'ACTIVE';
  if (!['ACTIVE', 'INACTIVE', 'ALL'].includes(status)) throw new HttpError(400, 'status must be ACTIVE, INACTIVE, or ALL.');
  const stockStatus = query.stockStatus ?? 'ALL';
  if (!['LOW_STOCK', 'IN_STOCK', 'ALL'].includes(stockStatus)) throw new HttpError(400, 'stockStatus must be LOW_STOCK, IN_STOCK, or ALL.');
  return { categoryId: query.categoryId ? new mongoose.Types.ObjectId(query.categoryId) : null, status, stockStatus };
}

function summarizeInventory(inventory) {
  const totalUnits = inventory.reduce((total, row) => {
    if (!Number.isSafeInteger(total + row.availableQty)) throw new HttpError(409, 'Inventory unit count exceeds the supported limit.');
    return total + row.availableQty;
  }, 0);
  return { inventory, productCount: inventory.length, totalUnits };
}

export async function inventoryReport(query = {}) {
  const filters = inventoryFilters(query);
  const inventory = await Inventory.aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    ...(filters.status === 'ALL' ? [] : [{ $match: { 'product.status': filters.status } }]),
    ...(filters.categoryId ? [{ $match: { 'product.categoryId': filters.categoryId } }] : []),
    { $lookup: { from: 'categories', localField: 'product.categoryId', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' }, { $sort: { 'product.name': 1, productId: 1 } },
    { $project: { productId: 1, sku: '$product.sku', name: '$product.name', category: '$category.name',
      productStatus: '$product.status', availableQty: 1, minimumStock: '$product.minimumStock',
      lowStock: { $lte: ['$availableQty', '$product.minimumStock'] },
      stockStatus: { $cond: [{ $lte: ['$availableQty', '$product.minimumStock'] }, 'LOW_STOCK', 'IN_STOCK'] } } },
    ...(filters.stockStatus === 'ALL' ? [] : [{ $match: { stockStatus: filters.stockStatus } }]),
  ]);
  return summarizeInventory(inventory);
}

export async function lowStockReport(query = {}) {
  const filters = inventoryFilters(query, { lowStock: true });
  const inventory = (await inventoryReport({ ...(filters.categoryId ? { categoryId: String(filters.categoryId) } : {}), status: 'ACTIVE' }))
    .inventory.filter((row) => row.lowStock);
  return summarizeInventory(inventory);
}
