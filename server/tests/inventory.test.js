import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test, mock } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User, Category, Product, Inventory, InventoryTransaction } from '../src/database/models.js';
import { ROLES } from '../src/database/definitions.js';
import { hashPassword } from '../src/modules/shared/passwords.js';
import { adjustStock, applyStockChange } from '../src/modules/inventory/service.js';

const databaseName = `techzone_test_inventory_${randomBytes(6).toString('hex')}`;
const app = createApp();
const cookies = {}, actors = {};
let category;
const id = () => new mongoose.Types.ObjectId().toString();
const adjust = (productId, body, role = 'INVENTORY') => request(app).post(`/api/inventory/${productId}/adjustments`).set('Cookie', cookies[role]).send(body);
async function fixture(quantity = 0, status = 'ACTIVE', withInventory = true) {
  const product = await Product.create({ sku: randomBytes(6).toString('hex'), name: 'Stock test', categoryId: category._id, sellingPriceMinor: 100, minimumStock: 0, status });
  if (withInventory) await Inventory.create({ productId: product._id, availableQty: quantity });
  return product;
}
const stock = async (product) => (await Inventory.findOne({ productId: product._id })).availableQty;
const change = (product, changeQty, overrides = {}) => ({ productId: product._id, changeQty, reason: 'Count correction', createdBy: actors.INVENTORY._id, ...overrides });

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; inventory tests require a MongoDB replica set.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url'), passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    actors[role] = await User.create({ name: role, email: `${role}@example.test`, passwordHash, role });
    const response = await request(app).post('/api/auth/login').send({ email: actors[role].email, password }).expect(200);
    cookies[role] = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  }
  category = await Category.create({ name: 'Test stock' });
});
after(async () => {
  mock.restoreAll();
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-INV-02: increase/decrease target the right product and persist with complete audit details', async () => {
  const target = await fixture(), other = await fixture(17);
  const first = await adjust(target._id, { changeQty: 8, reason: '  Counted delivery shelf  ' }).expect(201);
  assert.equal(first.body.inventory.availableQty, 8);
  const second = await adjust(target._id, { changeQty: -3, reason: 'Damaged units' }, 'ADMIN').expect(201);
  assert.equal(second.body.inventory.availableQty, 5);
  assert.equal(await stock(target), 5); assert.equal(await stock(other), 17);
  const events = await InventoryTransaction.find({ productId: target._id }).sort({ createdAt: 1 }).lean();
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.changeQty), [8, -3]);
  assert.equal(events[0].reason, 'Counted delivery shelf');
  assert.equal(String(events[0].createdBy), String(actors.INVENTORY._id));
  assert.equal(String(events[1].createdBy), String(actors.ADMIN._id));
  for (const event of events) {
    assert.equal(event.sourceType, 'ADJUSTMENT'); assert.equal(String(event.sourceId), String(event._id));
    assert.ok(event.createdAt instanceof Date);
  }
  // A new HTTP read after mutations obtains database state, not the submitted quantity.
  for (const role of ROLES) {
    const response = await request(app).get('/api/inventory').set('Cookie', cookies[role]).expect(200);
    assert.equal(response.body.inventory.find((r) => r.productId === String(target._id)).availableQty, 5);
  }
});

test('zero confirmation, exact depletion and safe-integer upper boundary are supported', async () => {
  const p = await fixture(2);
  await adjust(p._id, { changeQty: 0, reason: 'Count confirmed' }).expect(201);
  assert.equal(await stock(p), 2);
  await adjust(p._id, { changeQty: -2, reason: 'Remove all damaged stock' }).expect(201);
  assert.equal(await stock(p), 0);
  const max = await fixture(Number.MAX_SAFE_INTEGER - 1);
  await adjust(max._id, { changeQty: 1, reason: 'Boundary check' }).expect(201);
  assert.equal(await stock(max), Number.MAX_SAFE_INTEGER);
  await adjust(max._id, { changeQty: 1, reason: 'Overflow' }).expect(409);
  assert.equal(await stock(max), Number.MAX_SAFE_INTEGER);
  assert.equal(await InventoryTransaction.countDocuments({ productId: max._id }), 1);
  await adjust(max._id, { changeQty: -Number.MAX_SAFE_INTEGER, reason: 'Exact upper-bound depletion' }).expect(201);
  assert.equal(await stock(max), 0);
});

test('TC-INV-03: insufficient stock cannot commit a negative balance or history', async () => {
  const p = await fixture(3);
  const response = await adjust(p._id, { changeQty: -4, reason: 'Too many' }).expect(409);
  assert.match(response.body.error.message, /Insufficient stock/);
  assert.equal(await stock(p), 3);
  assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 0);
});

test('malformed/unsafe/fractional quantities, missing reasons and unsupported client operations are rejected', async () => {
  const p = await fixture(5);
  for (const changeQty of [undefined, null, '3', 1.5, -0.5, {}, [], true, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1]) {
    await adjust(p._id, { changeQty, reason: 'Invalid' }).expect(400);
  }
  for (const reason of [undefined, null, 7, '', ' ', 'x'.repeat(251)]) {
    await adjust(p._id, { changeQty: 1, reason }).expect(400);
  }
  for (const extra of [{ sourceType: 'PURCHASE' }, { createdBy: String(actors.ADMIN._id) }, { operation: 'set' }, { role: 'ADMIN' }, { sourceId: id() }]) {
    await adjust(p._id, { changeQty: 1, reason: 'Invalid operation', ...extra }).expect(400);
  }
  assert.equal(await stock(p), 5);
  assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 0);
});

test('authentication/authorization reject every unauthorized role and role claims', async () => {
  const p = await fixture();
  await request(app).post(`/api/inventory/${p._id}/adjustments`).send({ changeQty: 1, reason: 'No session' }).expect(401);
  await request(app).get('/api/inventory').expect(401);
  for (const role of ['PURCHASE', 'SALES', 'MANAGER']) {
    await adjust(p._id, { changeQty: 1, reason: 'Denied', role: 'ADMIN' }, role).expect(403);
    await assert.rejects(adjustStock(change(p, 1, { createdBy: actors[role]._id, role: 'ADMIN' })), { status: 403 });
  }
  await assert.rejects(adjustStock(change(p, 1, { createdBy: id() })), { status: 403 });
  await User.updateOne({ _id: actors.INVENTORY._id }, { $set: { status: 'INACTIVE' } });
  try { await assert.rejects(adjustStock(change(p, 1)), { status: 403 }); }
  finally { await User.updateOne({ _id: actors.INVENTORY._id }, { $set: { status: 'ACTIVE' } }); }
  assert.equal(await stock(p), 0);
});

test('invalid/missing/inactive products and missing inventory never create duplicate stock rows', async () => {
  await adjust('not-an-id', { changeQty: 1, reason: 'Invalid ID' }).expect(400);
  await adjust(id(), { changeQty: 1, reason: 'Missing product' }).expect(404);
  const inactive = await fixture(4, 'INACTIVE');
  await adjust(inactive._id, { changeQty: 1, reason: 'Retired' }).expect(409);
  const missing = await fixture(0, 'ACTIVE', false);
  await adjust(missing._id, { changeQty: 1, reason: 'Missing stock' }).expect(409);
  assert.equal(await Inventory.countDocuments({ productId: missing._id }), 0);
  const list = await request(app).get('/api/inventory').set('Cookie', cookies.ADMIN).expect(200);
  assert.ok(!list.body.inventory.some((r) => r.productId === String(inactive._id)));
});

test('failed audit append rolls back stock; failed stock write cannot append history', async () => {
  const p = await fixture(5);
  const historyStub = mock.method(InventoryTransaction, 'create', async () => { throw new Error('Forced audit failure'); });
  try { await adjust(p._id, { changeQty: 3, reason: 'Rollback audit' }).expect(500); }
  finally { historyStub.mock.restore(); }
  assert.equal(await stock(p), 5); assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 0);
  const stockStub = mock.method(Inventory, 'findOneAndUpdate', async () => { throw new Error('Forced stock failure'); });
  try { await adjust(p._id, { changeQty: 3, reason: 'Rollback stock' }).expect(500); }
  finally { stockStub.mock.restore(); }
  assert.equal(await stock(p), 5); assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 0);
});

test('concurrent additions and competing removals do not lose updates or oversell', async () => {
  const p = await fixture();
  await Promise.all(Array.from({ length: 6 }, () => adjustStock(change(p, 1))));
  assert.equal(await stock(p), 6);
  const outcomes = await Promise.allSettled([adjustStock(change(p, -4)), adjustStock(change(p, -4))]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((r) => r.status === 'rejected').reason.status, 409);
  assert.equal(await stock(p), 2);
  const events = await InventoryTransaction.find({ productId: p._id }).lean();
  assert.equal(events.length, 7); assert.equal(events.reduce((sum, e) => sum + e.changeQty, 0), 2);
});

test('service works independently and composes into a caller transaction with full rollback', async () => {
  const p = await fixture(5);
  const result = await adjustStock(change(p, 2));
  assert.equal(result.inventory.availableQty, 7);
  await assert.rejects(mongoose.connection.transaction(async (session) => {
    await adjustStock(change(p, -3), { session });
    throw new Error('Later source transaction failure');
  }), /Later source transaction failure/);
  assert.equal(await stock(p), 7); assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 1);
  const session = await mongoose.startSession();
  try { await assert.rejects(adjustStock(change(p, 1), { session }), /active transaction/); }
  finally { await session.endSession(); }
});

test('caller cannot catch an audit failure and commit the stock change alone', async () => {
  const p = await fixture(5);
  const session = await mongoose.startSession(); session.startTransaction();
  const stub = mock.method(InventoryTransaction, 'create', async () => { throw new Error('Audit failed'); });
  try {
    await assert.rejects(adjustStock(change(p, 1), { session }), /Audit failed/);
    assert.equal(session.inTransaction(), false);
    await assert.rejects(session.commitTransaction());
  } finally { stub.mock.restore(); await session.endSession(); }
  assert.equal(await stock(p), 5); assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 0);
});

test('future purchase/sale callers use existing source/actor references and the same atomic stock rules', async () => {
  const p = await fixture();
  const purchaseId = new mongoose.Types.ObjectId(), saleId = new mongoose.Types.ObjectId();
  // The sale source must meet the new sales collection validator; purchase remains a future source fixture.
  await mongoose.connection.db.collection('purchases').insertOne({ _id: purchaseId });
  await mongoose.connection.db.collection('sales').insertOne({ _id: saleId, transactionNumber: `SALE-${saleId}`, requestId: `stock-fixture-${saleId}`, saleDate: new Date(),
    createdBy: actors.SALES._id, totalMinor: 0, items: [{ productId: p._id, sku: p.sku, name: p.name, quantity: 1, unitPriceMinor: 0, lineTotalMinor: 0 }],
    createdAt: new Date(), updatedAt: new Date() });
  await applyStockChange(change(p, 4, { sourceType: 'PURCHASE', sourceId: purchaseId, createdBy: actors.PURCHASE._id }));
  await applyStockChange(change(p, -2, { sourceType: 'SALE', sourceId: saleId, createdBy: actors.SALES._id }));
  assert.equal(await stock(p), 2);
  for (const [sourceType, changeQty] of [['PURCHASE', -1], ['SALE', 1], ['UNKNOWN', 1]]) {
    await assert.rejects(applyStockChange(change(p, changeQty, { sourceType, sourceId: purchaseId })), { status: 400 });
  }
  await assert.rejects(applyStockChange(change(p, 1, { sourceType: 'PURCHASE', sourceId: id(), createdBy: actors.PURCHASE._id })), /Source transaction does not exist/);
  assert.equal(await stock(p), 2);
  assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 2);
  const rolledBackSource = new mongoose.Types.ObjectId();
  await assert.rejects(mongoose.connection.transaction(async (session) => {
    await mongoose.connection.db.collection('purchases').insertOne({ _id: rolledBackSource }, { session });
    await applyStockChange(change(p, 3, { sourceType: 'PURCHASE', sourceId: rolledBackSource, createdBy: actors.PURCHASE._id }), { session });
    throw new Error('Source finalization failed');
  }), /Source finalization failed/);
  assert.equal(await mongoose.connection.db.collection('purchases').findOne({ _id: rolledBackSource }), null);
  assert.equal(await stock(p), 2);
  assert.equal(await InventoryTransaction.countDocuments({ productId: p._id }), 2);
});

test('TC-INV-01/04: stored stock search, category/low-stock filters, clearing and invalid filters', async () => {
  const accessories = await Category.create({ name: 'Accessories' });
  const thresholdCategory = await Category.create({ name: 'Threshold fixtures' });
  const equality = await fixture(2);
  await Product.updateOne({ _id: equality._id }, { $set: { minimumStock: 2, name: 'Wireless Mouse', categoryId: thresholdCategory._id } });
  const above = await fixture(3);
  await Product.updateOne({ _id: above._id }, { $set: { minimumStock: 2, name: 'USB Keyboard', categoryId: accessories._id } });
  const query = (params = '') => request(app).get(`/api/inventory${params}`).set('Cookie', cookies.INVENTORY);
  const all = (await query().expect(200)).body.inventory;
  assert.equal(all.find((row) => row.productId === String(equality._id)).availableQty, 2);
  assert.equal(all.find((row) => row.productId === String(equality._id)).lowStock, true);
  assert.equal(all.find((row) => row.productId === String(above._id)).lowStock, false);
  assert.deepEqual((await query('?search=wireless').expect(200)).body.inventory.map((row) => row.productId), [String(equality._id)]);
  assert.deepEqual((await query(`?search=${equality.sku}`).expect(200)).body.inventory.map((row) => row.productId), [String(equality._id)]);
  assert.deepEqual((await query('?search=Accessories').expect(200)).body.inventory.map((row) => row.productId), [String(above._id)]);
  assert.deepEqual((await query(`?categoryId=${accessories._id}`).expect(200)).body.inventory.map((row) => row.productId), [String(above._id)]);
  assert.deepEqual((await query(`?categoryId=${thresholdCategory._id}&lowStockOnly=true`).expect(200)).body.inventory.map((row) => row.productId), [String(equality._id)]);
  assert.equal((await query('?search=no-match').expect(200)).body.inventory.length, 0);
  assert.equal((await query('?search=.*').expect(200)).body.inventory.length, 0);
  assert.equal((await query('?search=wireless&lowStockOnly=false').expect(200)).body.inventory.length, 1);
  await adjust(equality._id, { changeQty: 1, reason: 'Restock' }).expect(201);
  assert.equal((await query(`?categoryId=${thresholdCategory._id}&lowStockOnly=true`).expect(200)).body.inventory.some((row) => row.productId === String(equality._id)), false);
  for (const invalid of ['?categoryId=bad', '?lowStockOnly=yes', `?unknown=1`, `?search=${'x'.repeat(101)}`]) await query(invalid).expect(400);
  await request(app).get('/api/inventory').expect(401);
  await request(app).get('/api/inventory').set('Cookie', cookies.SALES).set('X-Role', 'ADMIN').expect(200);
});
