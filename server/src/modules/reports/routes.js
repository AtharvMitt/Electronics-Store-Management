import { Router } from 'express';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { inventoryReport, lowStockReport, salesReport } from './service.js';

export function reportRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/sales', requirePermission('reports:sales'), async (req, res) => res.json(await salesReport(req.query)));
  router.get('/inventory', requirePermission('reports:inventory'), async (req, res) => res.json(await inventoryReport(req.query)));
  router.get('/low-stock', requirePermission('reports:inventory'), async (req, res) => res.json(await lowStockReport(req.query)));
  return router;
}
