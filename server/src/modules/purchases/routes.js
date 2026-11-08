import { Router } from 'express';
import { Purchase, PurchaseReceipt } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { recordId } from '../inventory/service.js';
import { HttpError } from '../shared/errors.js';
import { purchaseHistoryFilters, purchaseRequestKey, recordPurchase, updatePurchase, receivePurchase } from './service.js';

export function purchaseRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('purchases:view'), async (req, res) => res.json({ purchases: await Purchase.find(purchaseHistoryFilters(req.query)).sort({ orderDate: -1, _id: -1 }).lean() }));
  router.get('/:id', requirePermission('purchases:view'), async (req, res) => {
    const purchase = await Purchase.findById(recordId(req.params.id, 'purchaseId')).lean();
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    const receipts = await PurchaseReceipt.find({ purchaseId: purchase._id }).sort({ receivedAt: -1, _id: -1 }).lean();
    res.json({ purchase, receipts });
  });
  router.post('/', requirePermission('purchases:manage'), async (req, res) => res.status(201).json({ purchase: await recordPurchase({ body: req.body, createdBy: req.user._id, requestId: purchaseRequestKey(req.get('Idempotency-Key')) }) }));
  router.patch('/:id', requirePermission('purchases:manage'), async (req, res) => res.json({ purchase: await updatePurchase({ id: req.params.id, body: req.body, createdBy: req.user._id }) }));
  router.post('/:id/receipts', requirePermission('purchases:receive'), async (req, res) => res.status(201).json(await receivePurchase({ id: req.params.id, body: req.body, receivedBy: req.user._id, requestId: purchaseRequestKey(req.get('Idempotency-Key')) })));
  return router;
}
