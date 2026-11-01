import { Router } from 'express';
import { Inventory } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { adjustStock, adjustmentInput, recordId } from './service.js';

export function inventoryRoutes() {
  const router = Router();
  router.use(requireAuth);
  // Minimal read contract for adjustment/reload; #10 owns search/filtering.
  router.get('/', requirePermission('inventory:view'), async (_req, res) => {
    const inventory = await Inventory.aggregate([
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' }, { $match: { 'product.status': 'ACTIVE' } },
      { $sort: { 'product.name': 1, productId: 1 } },
      { $project: { _id: 1, productId: 1, availableQty: 1, updatedAt: 1, sku: '$product.sku', name: '$product.name' } },
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
