import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test, mock } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User, Category, Product, Inventory, InventoryTransaction, Sale } from '../src/database/models.js';
import { ROLES } from '../src/database/definitions.js';
import { hashPassword } from '../src/modules/shared/passwords.js';

const databaseName = `techzone_test_sales_${randomBytes(6).toString('hex')}`;
const app = createApp(), cookies = {}, actors = {};
let category;
let requestSequence = 0;
const id = () => new mongoose.Types.ObjectId().toString();
const call = (method, path, role = 'ADMIN') => request(app)[method](`/api${path}`).set('Cookie', cookies[role]);
const postSale = (role, body, key = `sale-request-${++requestSequence}`) => call('post', '/sales', role).set('Idempotency-Key', key).send(body);
async function fixture({ quantity = 5, price = 1250, minimumStock = 1, status = 'ACTIVE', categoryId = category._id } = {}) {
  const product = await Product.create({ sku: `SALE-${randomBytes(5).toString('hex')}`, name: 'Sale test product', categoryId, sellingPriceMinor: price, minimumStock, status });
  await Inventory.create({ productId: product._id, availableQty: quantity });
  return product;
}

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; sales/report tests require a MongoDB replica set.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url'), passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    actors[role] = await User.create({ name: role, email: `${role}@example.test`, passwordHash, role });
    const response = await request(app).post('/api/auth/login').send({ email: actors[role].email, password }).expect(200);
    cookies[role] = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  }
  category = await Category.create({ name: 'Sale products' });
});

after(async () => {
  mock.restoreAll();
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-SALE-01, TC-SALE-04, TC-SALE-05: authorized sale captures details, deducts stored stock and is retrievable', async () => {
  const p = await fixture({ quantity: 5, price: 1299 });
  const sale = (await postSale('SALES', { items: [{ productId: String(p._id), quantity: 2 }] }, 'repeatable-sale-1').expect(201)).body.sale;
  assert.match(sale.transactionNumber, /^SALE-[A-F0-9]{24}$/);
  assert.equal(sale.totalMinor, 2598);
  assert.equal(sale.items[0].unitPriceMinor, 1299);
  assert.equal(sale.items[0].lineTotalMinor, 2598);
  assert.equal(String(sale.createdBy), String(actors.SALES._id));
  assert.equal((await Inventory.findOne({ productId: p._id })).availableQty, 3);
  const history = await InventoryTransaction.find({ sourceType: 'SALE', sourceId: sale._id }).lean();
  assert.equal(history.length, 1); assert.equal(history[0].changeQty, -2);
  assert.equal((await call('get', `/sales/${sale._id}`, 'MANAGER').expect(200)).body.sale.totalMinor, 2598);
  assert.equal((await call('get', '/sales', 'PURCHASE').expect(200)).body.sales.length, 1);
  const retry = (await postSale('SALES', { items: [{ productId: String(p._id), quantity: 2 }] }, 'repeatable-sale-1').expect(201)).body.sale;
  assert.equal(retry._id, sale._id);
  assert.equal((await Inventory.findOne({ productId: p._id })).availableQty, 3);
  await postSale('SALES', { items: [{ productId: String(p._id), quantity: 1 }] }, 'repeatable-sale-1').expect(409);
  await call('post', '/sales', 'SALES').send({ items: [{ productId: String(p._id), quantity: 1 }] }).expect(400);
  for (const role of ROLES.filter((name) => !['ADMIN', 'SALES'].includes(name))) await postSale(role, { items: [{ productId: String(p._id), quantity: 1 }] }).expect(403);
  await request(app).post('/api/sales').send({ items: [{ productId: String(p._id), quantity: 1 }] }).expect(401);
});

test('TC-SALE-02, TC-SALE-03, TC-BR-08: invalid quantities, unknown fields and insufficient stock reject without partial records', async () => {
  const first = await fixture({ quantity: 4 }), second = await fixture({ quantity: 1 });
  const count = await Sale.countDocuments(), eventCount = await InventoryTransaction.countDocuments();
  for (const quantity of [0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    await postSale('SALES', { items: [{ productId: String(first._id), quantity }] }).expect(400);
  }
  await postSale('SALES', { items: [{ productId: 'bad', quantity: 1 }] }).expect(400);
  await postSale('SALES', { items: [], createdBy: String(actors.ADMIN._id) }).expect(400);
  await postSale('SALES', { items: [{ productId: String(first._id), quantity: 2 }, { productId: String(second._id), quantity: 2 }] }, 'retry-after-restock').expect(409);
  assert.equal(await Sale.countDocuments(), count); assert.equal(await InventoryTransaction.countDocuments(), eventCount);
  assert.equal((await Inventory.findOne({ productId: first._id })).availableQty, 4);
  await postSale('SALES', { items: [{ productId: String(first._id), quantity: 5 }] }).expect(409);
  await postSale('SALES', { items: [{ productId: String(id()), quantity: 1 }] }).expect(404);
  await Inventory.updateOne({ productId: second._id }, { $set: { availableQty: 3 } });
  await postSale('SALES', { items: [{ productId: String(first._id), quantity: 2 }, { productId: String(second._id), quantity: 2 }] }, 'retry-after-restock').expect(201);
});

test('concurrent requests with the same idempotency key create one sale and one stock change', async () => {
  const p = await fixture({ quantity: 1, price: 500 });
  const key = 'concurrent-idempotency-key';
  const requests = await Promise.all([
    postSale('SALES', { items: [{ productId: String(p._id), quantity: 1 }] }, key),
    postSale('SALES', { items: [{ productId: String(p._id), quantity: 1 }] }, key),
  ]);
  assert.deepEqual(requests.map((response) => response.status), [201, 201], JSON.stringify(requests.map((response) => response.body)));
  assert.equal(requests[0].body.sale._id, requests[1].body.sale._id);
  assert.equal((await Inventory.findOne({ productId: p._id })).availableQty, 0);
  assert.equal(await Sale.countDocuments({ requestId: key }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceType: 'SALE', sourceId: requests[0].body.sale._id }), 1);
});

test('failed audit writes roll back sale records and every stock deduction', async () => {
  const first = await fixture({ quantity: 5 }), second = await fixture({ quantity: 6 });
  const beforeSales = await Sale.countDocuments(), beforeEvents = await InventoryTransaction.countDocuments();
  const stub = mock.method(InventoryTransaction, 'create', async () => { throw new Error('Forced audit failure'); });
  try {
    await postSale('SALES', { items: [
      { productId: String(first._id), quantity: 2 }, { productId: String(second._id), quantity: 3 },
    ] }, 'audit-retry-key').expect(500);
  } finally { stub.mock.restore(); }
  assert.equal(await Sale.countDocuments(), beforeSales); assert.equal(await InventoryTransaction.countDocuments(), beforeEvents);
  assert.equal((await Inventory.findOne({ productId: first._id })).availableQty, 5);
  assert.equal((await Inventory.findOne({ productId: second._id })).availableQty, 6);
  const retry = await postSale('SALES', { items: [
    { productId: String(first._id), quantity: 2 }, { productId: String(second._id), quantity: 3 },
  ] }, 'audit-retry-key').expect(201);
  assert.equal(await Sale.countDocuments(), beforeSales + 1);
  assert.equal((await Inventory.findOne({ productId: first._id })).availableQty, 3);
  assert.equal((await Inventory.findOne({ productId: second._id })).availableQty, 3);
  assert.equal((await call('get', `/sales?transactionNumber=${retry.body.sale.transactionNumber}`, 'SALES').expect(200)).body.sales.length, 1);
});

test('TC-SALE-06, TC-SALE-07, TC-REP-01, TC-REP-02, TC-REP-04, TC-REP-05: reports enforce permissions, date filters, empty states and stored transaction totals', async () => {
  const p = await fixture({ quantity: 7, price: 101 });
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`), end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const baseline = await Sale.find({ saleDate: { $gte: start, $lt: end } }).lean();
  const firstSale = (await postSale('SALES', { items: [{ productId: String(p._id), quantity: 2 }] }).expect(201)).body.sale;
  const secondSale = (await postSale('SALES', { items: [{ productId: String(p._id), quantity: 1 }] }).expect(201)).body.sale;
  assert.notEqual(firstSale.transactionNumber, secondSale.transactionNumber);
  const report = (await call('get', `/reports/sales?from=${today}&to=${today}`, 'MANAGER').expect(200)).body;
  const stored = await Sale.find({ saleDate: { $gte: start, $lt: end } }).lean();
  assert.equal(report.transactionCount, stored.length);
  assert.equal(report.transactionCount, baseline.length + 2);
  assert.equal(report.totalMinor, stored.reduce((total, sale) => total + sale.totalMinor, 0));
  assert.equal(report.unitsSold, stored.reduce((total, sale) => total + sale.items.reduce((sum, item) => sum + item.quantity, 0), 0));
  const history = (await call('get', `/sales?transactionNumber=${firstSale.transactionNumber}&from=${today}&to=${today}`, 'SALES').expect(200)).body.sales;
  assert.equal(history.length, 1); assert.equal(history[0]._id, firstSale._id);
  await call('get', '/sales?transactionNumber=', 'SALES').expect(400);
  await call('get', '/sales?unexpected=true', 'SALES').expect(400);
  const empty = (await call('get', '/reports/sales?from=2000-01-01&to=2000-01-02', 'SALES').expect(200)).body;
  assert.deepEqual(empty, { sales: [], transactionCount: 0, totalMinor: 0, unitsSold: 0 });
  for (const query of ['?from=not-a-date', '?from=2026-02-30', '?from=2026-11-05&to=2026-11-04', '?unknown=1']) {
    await call('get', `/reports/sales${query}`, 'SALES').expect(400);
  }
  for (const role of ROLES.filter((name) => !['ADMIN', 'SALES', 'MANAGER'].includes(name))) await call('get', '/reports/sales', role).expect(403);
  for (const role of ROLES.filter((name) => !['ADMIN', 'INVENTORY', 'MANAGER'].includes(name))) await call('get', '/reports/inventory', role).expect(403);
  const inventory = (await call('get', '/reports/inventory', 'INVENTORY').expect(200)).body;
  assert.equal(inventory.inventory.find((row) => row.productId === String(p._id)).availableQty, 4);
  assert.equal(inventory.inventory.find((row) => row.productId === String(p._id)).lowStock, false);
  const reportCategory = await Category.create({ name: 'Report filters' });
  const equality = await fixture({ quantity: 2, minimumStock: 2, categoryId: reportCategory._id });
  const inactive = await fixture({ quantity: 4, minimumStock: 1, status: 'INACTIVE', categoryId: reportCategory._id });
  const filtered = (await call('get', `/reports/inventory?categoryId=${reportCategory._id}&status=ALL`, 'INVENTORY').expect(200)).body;
  assert.equal(filtered.productCount, 2);
  assert.ok(filtered.inventory.some((row) => row.productStatus === 'INACTIVE' && row.productId === String(inactive._id)));
  const active = (await call('get', `/reports/inventory?categoryId=${reportCategory._id}&status=ACTIVE`, 'INVENTORY').expect(200)).body;
  assert.deepEqual(active.inventory.map((row) => row.productId), [String(equality._id)]);
  assert.equal(active.inventory[0].stockStatus, 'LOW_STOCK');
  const lowOnly = (await call('get', `/reports/inventory?categoryId=${reportCategory._id}&status=ALL&stockStatus=LOW_STOCK`, 'INVENTORY').expect(200)).body;
  assert.deepEqual(lowOnly.inventory.map((row) => row.productId), [String(equality._id)]);
  const alerts = (await call('get', `/reports/low-stock?categoryId=${reportCategory._id}`, 'MANAGER').expect(200)).body;
  assert.deepEqual(alerts.inventory.map((row) => row.productId), [String(equality._id)]);
  await call('get', '/reports/inventory?status=UNKNOWN', 'INVENTORY').expect(400);
  await call('get', '/reports/inventory?stockStatus=UNKNOWN', 'INVENTORY').expect(400);
  await call('get', '/reports/inventory?categoryId=bad', 'INVENTORY').expect(400);
  await call('get', '/reports/low-stock?unknown=1', 'INVENTORY').expect(400);
  await request(app).get('/api/reports/sales').expect(401);
});
