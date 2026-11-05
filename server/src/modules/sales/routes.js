import { Router } from 'express';
import { Sale } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../shared/errors.js';
import { recordId } from '../inventory/service.js';
import { getSales, recordSale, requestKeyInput, saleInput } from './service.js';

export function saleRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('sales:view'), async (req, res) => res.json({ sales: await getSales(req.query) }));
  router.get('/:id', requirePermission('sales:view'), async (req, res) => {
    const sale = await Sale.findById(recordId(req.params.id)).lean();
    if (!sale) throw new HttpError(404, 'Sale not found.');
    res.json({ sale });
  });
  router.post('/', requirePermission('sales:create'), async (req, res) => {
    const sale = await recordSale({ items: saleInput(req.body), createdBy: req.user._id, requestId: requestKeyInput(req.get('Idempotency-Key')) });
    res.status(201).json({ sale });
  });
  return router;
}
