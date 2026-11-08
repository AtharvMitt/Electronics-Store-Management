import { Router } from 'express';
import { Supplier } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { recordId } from '../inventory/service.js';
import { HttpError } from '../shared/errors.js';
import { getSuppliers, supplierInput, updateSupplier } from './service.js';

export function supplierRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('suppliers:view'), async (req, res) => res.json({ suppliers: await getSuppliers(req.query) }));
  router.get('/:id', requirePermission('suppliers:view'), async (req, res) => {
    const supplier = await Supplier.findById(recordId(req.params.id, 'supplierId')).lean();
    if (!supplier) throw new HttpError(404, 'Supplier not found.');
    res.json({ supplier });
  });
  router.post('/', requirePermission('suppliers:manage'), async (req, res) => {
    res.status(201).json({ supplier: await Supplier.create(supplierInput(req.body, true)) });
  });
  router.patch('/:id', requirePermission('suppliers:manage'), async (req, res) => res.json({ supplier: await updateSupplier(req.params.id, supplierInput(req.body)) }));
  router.delete('/:id', requirePermission('suppliers:manage'), async (req, res) => res.json({ supplier: await updateSupplier(req.params.id, { status: 'INACTIVE' }) }));
  return router;
}
