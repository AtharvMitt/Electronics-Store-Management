import { Router } from 'express';
import { Inventory } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { adjustStock, adjustmentInput, inventoryFilters, recordId } from './service.js';

export function inventoryRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('inventory:view'), async (req, res) => {
    const filters = inventoryFilters(req.query);
    const inventory = await Inventory.aggregate([
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' }, { $match: { 'product.status': 'ACTIVE', ...filters.productMatch } },
      { $lookup: { from: 'categories', localField: 'product.categoryId', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      ...(filters.lowStockOnly ? [{ $match: { $expr: { $lte: ['$availableQty', '$product.minimumStock'] } } }] : []),
      ...(filters.search ? [{ $match: { $or: [
        { 'product.name': filters.search }, { 'product.sku': filters.search }, { 'category.name': filters.search },
      ] } }] : []),
      { $sort: { 'product.name': 1, productId: 1 } },
      { $project: { _id: 1, productId: 1, availableQty: 1, minimumStock: '$product.minimumStock',
        lowStock: { $lte: ['$availableQty', '$product.minimumStock'] }, updatedAt: 1,
        sku: '$product.sku', name: '$product.name', categoryId: '$category._id', category: '$category.name' } },
    ]);
    res.json({ inventory });
  });
  router.post('/:productId/adjustments', requirePermission('inventory:adjust'), async (req, res) => {
    const productId = recordId(req.params.productId);
    const input = adjustmentInput(req.body);
    res.status(201).json(await adjustStock({ productId, ...input, createdBy: req.user._id }));
  });
  return router;
}
