import { Router } from 'express';
import { Category, Product } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../shared/errors.js';
import { catalogueWrite, categoryInput, createProduct, updateProduct, deactivateProduct, deleteCategory, readId } from './service.js';

export function productRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('products:view'), async (_req, res) => {
    res.json({ products: await Product.find().sort({ name: 1, _id: 1 }).lean() });
  });
  router.get('/:id', requirePermission('products:view'), async (req, res) => {
    const product = await Product.findById(readId(req.params.id)).lean();
    if (!product) throw new HttpError(404, 'Product not found.');
    res.json({ product });
  });
  router.post('/', requirePermission('products:create'), async (req, res) => {
    res.status(201).json({ product: await createProduct(req.body) });
  });
  router.patch('/:id', requirePermission('products:update'), async (req, res) => {
    res.json({ product: await updateProduct(req.params.id, req.body) });
  });
  // D means deactivate/retire in SRS §13.1, including products without history.
  router.delete('/:id', requirePermission('products:deactivate'), async (req, res) => {
    res.json({ product: await deactivateProduct(req.params.id) });
  });
  return router;
}

export function categoryRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('products:view'), async (_req, res) => {
    res.json({ categories: await Category.find().sort({ name: 1, _id: 1 }).lean() });
  });
  router.post('/', requirePermission('products:create'), async (req, res) => {
    const category = await catalogueWrite(() => Category.create(categoryInput(req.body)));
    res.status(201).json({ category });
  });
  router.patch('/:id', requirePermission('products:update'), async (req, res) => {
    const id = readId(req.params.id);
    const input = categoryInput(req.body);
    const category = await catalogueWrite(() => Category.findByIdAndUpdate(id, { $set: input }, { runValidators: true, returnDocument: 'after' }));
    if (!category) throw new HttpError(404, 'Category not found.');
    res.json({ category });
  });
  router.delete('/:id', requirePermission('products:deactivate'), async (req, res) => {
    await deleteCategory(req.params.id);
    res.status(204).end();
  });
  return router;
}
