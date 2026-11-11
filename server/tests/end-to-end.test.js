// Issue #21: one store workflow across every module, driven only through the HTTP API
// with each role's own login. Steps run in order and share state, like a real day.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { ROLES } from '../src/database/definitions.js';
import { InventoryTransaction, Sale } from '../src/database/models.js';
import { seedDevelopment } from '../src/database/seed.js';

const databaseName = `techzone_test_e2e_${randomBytes(6).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
const app = createApp();
const as = {};
const state = {};
const key = (label) => `e2e-${label}-${randomBytes(6).toString('hex')}`;

// One logged-in client per role: as.SALES.post('/sales', body, { key }).
function client(cookie) {
  const send = (method, path, body, { key: idempotencyKey } = {}) => {
    let req = request(app)[method](`/api${path}`).set('Cookie', cookie);
    if (idempotencyKey) req = req.set('Idempotency-Key', idempotencyKey);
    return body === undefined ? req : req.send(body);
  };
  return {
    cookie,
    get: (path) => send('get', path),
    post: (path, body, options) => send('post', path, body, options),
    patch: (path, body) => send('patch', path, body),
    delete: (path) => send('delete', path),
  };
}

async function stock() {
  const { body } = await as.INVENTORY.get('/inventory?search=E2E-CBL').expect(200);
  return Object.fromEntries(body.inventory.map((row) => [row.sku, row.availableQty]));
}

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; end-to-end tests must run against MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await seedDevelopment({ password, environment: 'test' });
  for (const role of ROLES) {
    const response = await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@techzone.example.test`, password }).expect(200);
    as[role] = client(/tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0]);
    state[role] = response.body.user.id;
  }
});

after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('1. inventory staff set up a category and two products, which start with zero stock', async () => {
  const { body: { category } } = await as.INVENTORY.post('/categories', { name: 'E2E Cables' }).expect(201);
  const product = (sku, name, sellingPriceMinor, minimumStock) => as.INVENTORY.post('/products', { sku, name, categoryId: category._id, sellingPriceMinor, minimumStock }).expect(201);
  state.cable = (await product('E2E-CBL-001', 'E2E HDMI Cable', 49900, 3)).body.product;
  state.adapter = (await product('E2E-CBL-002', 'E2E USB Adapter', 19900, 2)).body.product;
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 0, 'E2E-CBL-002': 0 });
  await as.SALES.post('/products', { sku: 'E2E-NOPE', name: 'Not allowed', categoryId: category._id, sellingPriceMinor: 1, minimumStock: 0 }).expect(403);
});

test('2. a sale is blocked while there is no stock', async () => {
  await as.SALES.post('/sales', { items: [{ productId: state.cable._id, quantity: 1 }] }, { key: key('empty') }).expect(409);
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 0, 'E2E-CBL-002': 0 });
});

test('3. purchase staff add a supplier and order stock; ordering alone does not change stock', async () => {
  state.supplier = (await as.PURCHASE.post('/suppliers', { name: 'E2E Electronics Wholesale', contactName: 'R. Kumar', phone: '+91 80 4000 1234' }).expect(201)).body.supplier;
  const { body: { purchase } } = await as.PURCHASE.post('/purchases', {
    supplierId: state.supplier._id, orderDate: '2026-11-09',
    items: [{ productId: state.cable._id, orderedQty: 10, unitCostMinor: 30000 }, { productId: state.adapter._id, orderedQty: 5, unitCostMinor: 10000 }],
  }, { key: key('order') }).expect(201);
  assert.equal(purchase.status, 'ORDERED');
  assert.equal(purchase.totalMinor, 10 * 30000 + 5 * 10000);
  state.purchase = purchase;
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 0, 'E2E-CBL-002': 0 });
});

test('4. goods arrive in two deliveries; stock rises by exactly what was received', async () => {
  const receive = (items, label) => as.PURCHASE.post(`/purchases/${state.purchase._id}/receipts`, { items }, { key: key(label) });
  const first = await receive([{ productId: state.cable._id, quantity: 6 }], 'first').expect(201);
  assert.equal(first.body.purchase.status, 'PARTIAL');
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 6, 'E2E-CBL-002': 0 });

  await receive([{ productId: state.cable._id, quantity: 5 }], 'too-many').expect(409);
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 6, 'E2E-CBL-002': 0 });

  const second = await receive([{ productId: state.cable._id, quantity: 4 }, { productId: state.adapter._id, quantity: 5 }], 'second').expect(201);
  assert.equal(second.body.purchase.status, 'RECEIVED');
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 10, 'E2E-CBL-002': 5 });
});

test('5. inventory staff write off a damaged adapter with a reason', async () => {
  await as.INVENTORY.post(`/inventory/${state.adapter._id}/adjustments`, { changeQty: -1, reason: 'Damaged in delivery' }).expect(201);
  await as.SALES.post(`/inventory/${state.adapter._id}/adjustments`, { changeQty: -1, reason: 'Not allowed' }).expect(403);
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 10, 'E2E-CBL-002': 4 });
});

test('6. a multi-item sale deducts exact quantities, and a retried request is not counted twice', async () => {
  const saleKey = key('sale');
  const body = { items: [{ productId: state.cable._id, quantity: 8 }, { productId: state.adapter._id, quantity: 2 }] };
  const { body: { sale } } = await as.SALES.post('/sales', body, { key: saleKey }).expect(201);
  assert.equal(sale.totalMinor, 8 * 49900 + 2 * 19900);
  state.sale = sale;
  const retry = await as.SALES.post('/sales', body, { key: saleKey });
  assert.ok([200, 201].includes(retry.status), `retry returned ${retry.status}`);
  assert.equal(retry.body.sale._id, sale._id);
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 2, 'E2E-CBL-002': 2 });
});

test('7. a sale that fails on one line deducts nothing from any line', async () => {
  await as.SALES.post('/sales', { items: [{ productId: state.cable._id, quantity: 1 }, { productId: state.adapter._id, quantity: 3 }] }, { key: key('partial') }).expect(409);
  await as.SALES.post('/sales', { items: [{ productId: state.cable._id, quantity: 3 }] }, { key: key('over') }).expect(409);
  assert.deepEqual(await stock(), { 'E2E-CBL-001': 2, 'E2E-CBL-002': 2 });
  assert.equal(await Sale.countDocuments(), 1);
});

test('8. both products now show as low stock, including the one exactly at its minimum', async () => {
  const low = (await as.INVENTORY.get('/inventory?search=E2E-CBL&lowStockOnly=true').expect(200)).body.inventory.map((row) => row.sku).sort();
  assert.deepEqual(low, ['E2E-CBL-001', 'E2E-CBL-002']);
  const report = (await as.MANAGER.get('/reports/low-stock').expect(200)).body.inventory.map((row) => row.sku);
  assert.ok(report.includes('E2E-CBL-001') && report.includes('E2E-CBL-002'));
});

test('9. the manager\'s reports match the stored sale and stock', async () => {
  const sales = (await as.MANAGER.get('/reports/sales?from=2026-01-01&to=2099-12-31').expect(200)).body;
  assert.equal(sales.transactionCount, 1);
  assert.equal(sales.totalMinor, state.sale.totalMinor);
  assert.equal(sales.unitsSold, 10);
  const inventory = (await as.MANAGER.get('/reports/inventory').expect(200)).body.inventory;
  const rows = Object.fromEntries(inventory.filter((row) => row.sku.startsWith('E2E-CBL')).map((row) => [row.sku, row.availableQty]));
  assert.deepEqual(rows, await stock());
  const history = (await as.PURCHASE.get(`/purchases/${state.purchase._id}`).expect(200)).body;
  assert.equal(history.receipts.length, 2);
});

test('TC-INV-05: 10. every stock change is traceable to its source and actor, and the history adds up to current stock', async () => {
  const current = await stock();
  for (const product of [state.cable, state.adapter]) {
    const events = await InventoryTransaction.find({ productId: product._id }).lean();
    const total = events.reduce((sum, event) => sum + event.changeQty, 0);
    assert.equal(total, current[product.sku], `${product.sku} history should add up to its stock`);
    for (const event of events) {
      const expectedActor = { PURCHASE: state.PURCHASE, SALE: state.SALES, ADJUSTMENT: state.INVENTORY }[event.sourceType];
      assert.equal(String(event.createdBy), expectedActor, `${product.sku} ${event.sourceType} actor`);
    }
  }
  const sources = (await InventoryTransaction.find({ productId: state.adapter._id }).lean()).map((event) => event.sourceType).sort();
  assert.deepEqual(sources, ['ADJUSTMENT', 'PURCHASE', 'SALE']);
});

test('11. a deactivated product keeps its stock and history but cannot be sold or reordered', async () => {
  await as.ADMIN.delete(`/products/${state.adapter._id}`).expect(200);
  await as.SALES.post('/sales', { items: [{ productId: state.adapter._id, quantity: 1 }] }, { key: key('inactive') }).expect(409);
  await as.PURCHASE.post('/purchases', { supplierId: state.supplier._id, orderDate: '2026-11-09', items: [{ productId: state.adapter._id, orderedQty: 1, unitCostMinor: 100 }] }, { key: key('reorder') }).expect(409);
  const row = (await as.MANAGER.get('/reports/inventory?status=ALL').expect(200)).body.inventory.find((entry) => entry.sku === 'E2E-CBL-002');
  assert.equal(row.availableQty, 2);
  assert.equal(row.productStatus, 'INACTIVE');
});

test('12. after logging out, the same session cannot record a sale', async () => {
  await as.SALES.post('/auth/logout').expect(204);
  await as.SALES.post('/sales', { items: [{ productId: state.cable._id, quantity: 1 }] }, { key: key('after-logout') }).expect(401);
  assert.equal((await stock())['E2E-CBL-001'], 2);
});
