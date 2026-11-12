import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test, mock } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User, Category, Product, Inventory, InventoryTransaction, Supplier, Purchase, PurchaseReceipt } from '../src/database/models.js';
import { ROLES } from '../src/database/definitions.js';
import { definitions, sessionDefinitions, salesDefinitions } from '../src/database/definitions.js';
import { hashPassword } from '../src/modules/shared/passwords.js';
import { recordPurchase, receivePurchase } from '../src/modules/purchases/service.js';

const databaseName = `techzone_test_purchases_${randomBytes(6).toString('hex')}`;
const app = createApp(), cookies = {}, actors = {};
let category, sequence = 0;
const id = () => new mongoose.Types.ObjectId().toString();
const key = () => `purchase-operation-${++sequence}`;
const call = (method, path, role = 'PURCHASE') => request(app)[method](`/api${path}`).set('Cookie', cookies[role]);
const create = (body, requestId = key(), role = 'PURCHASE') => call('post', '/purchases', role).set('Idempotency-Key', requestId).send(body);
const receive = (purchaseId, items, requestId = key(), role = 'PURCHASE') => call('post', `/purchases/${purchaseId}/receipts`, role).set('Idempotency-Key', requestId).send({ items });
const stock = async (product) => (await Inventory.findOne({ productId: product._id })).availableQty;
async function fixture({ quantity = 5, status = 'ACTIVE' } = {}) {
  const product = await Product.create({ sku: `PUR-${randomBytes(5).toString('hex')}`, name: 'Purchase product', categoryId: category._id, sellingPriceMinor: 500, minimumStock: 2, status });
  await Inventory.create({ productId: product._id, availableQty: quantity });
  return product;
}
async function orderBody(product, extra = {}) {
  const supplier = await Supplier.create({ name: `Supplier ${key()}`, contactName: 'Asha', email: 'contact@example.test' });
  return { supplierId: String(supplier._id), orderDate: '2026-11-08', items: [{ productId: String(product._id), orderedQty: 5, unitCostMinor: 1299 }], ...extra };
}

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; purchase tests require a replica set.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url'), passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    actors[role] = await User.create({ name: role, email: `${role}@example.test`, passwordHash, role });
    const response = await request(app).post('/api/auth/login').send({ email: actors[role].email, password }).expect(200);
    cookies[role] = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  }
  category = await Category.create({ name: 'Purchase test products' });
});
after(async () => {
  mock.restoreAll();
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-PUR-03, TC-PUR-05, TC-PUR-06, TC-PUR-07: orders preserve exact costs and partial receipts increase only intended stock', async () => {
  const first = await fixture({ quantity: 2 }), second = await fixture({ quantity: 7 });
  const body = await orderBody(first);
  body.items.push({ productId: String(second._id), orderedQty: 3, unitCostMinor: 101 });
  const purchase = (await create(body).expect(201)).body.purchase;
  assert.match(purchase.orderNumber, /^PO-[A-F0-9]{24}$/); assert.equal(purchase.totalMinor, 6798);
  assert.ok(purchase.items.every((line) => line._id && line.receivedQty === 0));
  assert.equal(await stock(first), 2); assert.equal(await stock(second), 7);
  const partial = (await receive(purchase._id, [{ productId: String(first._id), quantity: 2 }]).expect(201)).body;
  assert.equal(partial.purchase.status, 'PARTIAL'); assert.equal(await stock(first), 4); assert.equal(await stock(second), 7);
  const event = await InventoryTransaction.findById(partial.receipt.inventoryTransactionIds[0]);
  assert.equal(event.sourceType, 'PURCHASE'); assert.equal(String(event.sourceId), purchase._id); assert.equal(event.changeQty, 2); assert.equal(String(event.createdBy), String(actors.PURCHASE._id));
  const completed = (await receive(purchase._id, [{ productId: String(first._id), quantity: 3 }, { productId: String(second._id), quantity: 3 }]).expect(201)).body;
  assert.equal(completed.purchase.status, 'RECEIVED'); assert.equal(await stock(first), 7); assert.equal(await stock(second), 10);
  const details = (await call('get', `/purchases/${purchase._id}`, 'MANAGER').expect(200)).body;
  assert.equal(details.receipts.length, 2); assert.equal(details.purchase.totalMinor, 6798);
  await receive(purchase._id, [{ productId: String(first._id), quantity: 1 }]).expect(409);
});

test('TC-PUR-02, TC-COM-05: supplier edits/deactivation preserve purchase snapshots and allow existing ordered goods to be received', async () => {
  const product = await fixture(), body = await orderBody(product);
  const purchase = (await create(body).expect(201)).body.purchase;
  await call('patch', `/suppliers/${body.supplierId}`).send({ name: 'Renamed business', contactName: 'Ravi' }).expect(200);
  await call('delete', `/suppliers/${body.supplierId}`).expect(200);
  const details = (await call('get', `/purchases/${purchase._id}`).expect(200)).body.purchase;
  assert.equal(details.supplierSnapshot.name, purchase.supplierSnapshot.name); assert.equal(details.supplierSnapshot.contactName, 'Asha');
  await create(body).expect(409);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }]).expect(201);
  await assert.rejects(Supplier.deleteOne({ _id: body.supplierId }), /cannot be deleted/);
  await assert.rejects(Purchase.deleteOne({ _id: purchase._id }), /cannot be deleted/);
  await assert.rejects(User.deleteOne({ _id: actors.PURCHASE._id }), /cannot be deleted/);
});

test('draft editing, ordering and cancellation do not change stock; received orders cannot be rewritten', async () => {
  const product = await fixture(), body = await orderBody(product, { status: 'DRAFT' });
  const purchase = (await create(body).expect(201)).body.purchase;
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }]).expect(409);
  const edited = (await call('patch', `/purchases/${purchase._id}`).send({ orderDate: '2026-11-09', items: [{ productId: String(product._id), orderedQty: 2, unitCostMinor: 123 }] }).expect(200)).body.purchase;
  assert.equal(edited.totalMinor, 246); assert.equal(await stock(product), 5);
  await call('patch', `/purchases/${purchase._id}`).send({ status: 'ORDERED' }).expect(200);
  await call('patch', `/purchases/${purchase._id}`).send({ status: 'DRAFT' }).expect(409);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }]).expect(201);
  await call('patch', `/purchases/${purchase._id}`).send({ status: 'CANCELLED' }).expect(409);
  await call('patch', `/purchases/${purchase._id}`).send({ items: body.items }).expect(409);
  const cancelled = (await create(body).expect(201)).body.purchase;
  await call('patch', `/purchases/${cancelled._id}`).send({ status: 'CANCELLED' }).expect(200);
  await receive(cancelled._id, [{ productId: String(product._id), quantity: 1 }]).expect(409);
  await call('patch', `/purchases/${cancelled._id}`).send({ status: 'ORDERED' }).expect(409);
  assert.equal(await stock(product), 6);
});

test('purchase and receipt routes enforce every role and unauthenticated requests on the backend', async () => {
  const product = await fixture(), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase;
  const operations = [['get', '/purchases', undefined], ['get', `/purchases/${purchase._id}`, undefined], ['post', '/purchases', body], ['patch', `/purchases/${purchase._id}`, { orderDate: body.orderDate }], ['post', `/purchases/${purchase._id}/receipts`, { items: [{ productId: String(product._id), quantity: 1 }] }]];
  for (const [method, path, input] of operations) {
    await request(app)[method](`/api${path}`).send(input).expect(401);
    for (const role of ROLES) {
      const allowed = method === 'get' || ['ADMIN', 'PURCHASE'].includes(role);
      const response = await call(method, path, role).set('Idempotency-Key', key()).send(input);
      assert.equal(response.status, allowed ? method === 'post' ? 201 : 200 : 403, `${role} ${method} ${path}: ${JSON.stringify(response.body)}`);
    }
  }
  await assert.rejects(recordPurchase({ body, requestId: key(), createdBy: actors.SALES._id }), { status: 403 });
  await assert.rejects(receivePurchase({ id: purchase._id, body: { items: [{ productId: String(product._id), quantity: 1 }] }, requestId: key(), receivedBy: actors.MANAGER._id }), { status: 403 });
});

test('TC-PUR-04, TC-PUR-08: invalid dates, quantities, prices and references reject without partial records', async () => {
  const product = await fixture(), body = await orderBody(product), count = await Purchase.countDocuments();
  for (const bad of [{ ...body, items: [] }, { ...body, supplierId: 'bad' }, { ...body, supplierId: id() }, { ...body, orderDate: '2026-02-30' }, { ...body, status: 'RECEIVED' }, { ...body, totalMinor: 1 }, { ...body, createdBy: actors.ADMIN._id }]) {
    await create(bad).expect(bad.supplierId?.length === 24 && bad.supplierId !== body.supplierId ? 404 : 400);
  }
  for (const orderedQty of [0, -1, 0.5, '2', Number.MAX_SAFE_INTEGER + 1]) await create({ ...body, items: [{ ...body.items[0], orderedQty }] }).expect(400);
  for (const unitCostMinor of [-1, 0.5, '100', Number.MAX_SAFE_INTEGER]) await create({ ...body, items: [{ ...body.items[0], unitCostMinor }] }).expect(400);
  await create({ ...body, items: [...body.items, ...body.items] }).expect(400);
  await create({ ...body, items: [{ ...body.items[0], productId: id() }] }).expect(404);
  assert.equal(await Purchase.countDocuments(), count);
  const purchase = (await create(body).expect(201)).body.purchase;
  for (const quantity of [0, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) await receive(purchase._id, [{ productId: String(product._id), quantity }]).expect(400);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 6 }]).expect(409);
  await receive(purchase._id, [{ productId: id(), quantity: 1 }]).expect(400);
  await receive(purchase._id, []).expect(400);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }, { productId: String(product._id), quantity: 1 }]).expect(400);
  await call('post', `/purchases/${purchase._id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ productId: String(product._id), quantity: 1 }], receivedBy: actors.ADMIN._id }).expect(400);
  await call('post', '/purchases').send(body).expect(400);
  await call('post', `/purchases/${purchase._id}/receipts`).send({ items: [{ productId: String(product._id), quantity: 1 }] }).expect(400);
  assert.equal(await stock(product), 5); assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 0);
});

test('TC-NFR-03: concurrent creation and receipt retries persist one order/receipt and one stock change', async () => {
  const product = await fixture(), body = await orderBody(product), orderKey = key();
  const orders = await Promise.all([create(body, orderKey), create(body, orderKey)]);
  assert.deepEqual(orders.map((response) => response.status), [201, 201]); assert.equal(orders[0].body.purchase._id, orders[1].body.purchase._id);
  const purchase = orders[0].body.purchase, items = [{ productId: String(product._id), quantity: 2 }], receiptKey = key();
  const receipts = await Promise.all([receive(purchase._id, items, receiptKey), receive(purchase._id, items, receiptKey)]);
  assert.deepEqual(receipts.map((response) => response.status), [201, 201]); assert.equal(receipts[0].body.receipt._id, receipts[1].body.receipt._id);
  assert.equal(await stock(product), 7); assert.equal(await Purchase.countDocuments({ requestId: orderKey }), 1);
  assert.equal(await PurchaseReceipt.countDocuments({ requestId: receiptKey }), 1); assert.equal(await InventoryTransaction.countDocuments({ sourceId: purchase._id }), 1);
  await create({ ...body, orderDate: '2026-11-09' }, orderKey).expect(409);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }], receiptKey).expect(409);
  await receive(purchase._id, items, receiptKey, 'ADMIN').expect(409);
  await call('patch', `/purchases/${purchase._id}`).send({ status: 'CANCELLED' }).expect(409);
});

test('competing receipts cannot exceed the ordered quantity', async () => {
  const product = await fixture(), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase;
  const responses = await Promise.all([receive(purchase._id, [{ productId: String(product._id), quantity: 3 }]), receive(purchase._id, [{ productId: String(product._id), quantity: 3 }])]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await stock(product), 8); assert.equal((await Purchase.findById(purchase._id)).items[0].receivedQty, 3);
});

test('a receipt key used concurrently on different orders cannot commit two stock changes', async () => {
  const product = await fixture(), other = await fixture(), body = await orderBody(product), otherBody = await orderBody(other);
  const first = (await create(body).expect(201)).body.purchase, second = (await create(otherBody).expect(201)).body.purchase;
  const receiptKey = key();
  // Different products avoid relying on a shared stock-row write conflict: the
  // durable receipt-key index itself must prevent the second receipt committing.
  const responses = await Promise.all([receive(first._id, [{ productId: String(product._id), quantity: 1 }], receiptKey), receive(second._id, [{ productId: String(other._id), quantity: 1 }], receiptKey)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await stock(product) + await stock(other), 11); assert.equal(await PurchaseReceipt.countDocuments({ requestId: receiptKey }), 1);
  const orders = await Purchase.find({ _id: { $in: [first._id, second._id] } }).lean();
  assert.equal(orders.reduce((sum, order) => sum + order.items[0].receivedQty, 0), 1);
});

test('a later audit failure rolls back earlier line stock, received quantities and all history; retry succeeds', async () => {
  const first = await fixture(), second = await fixture(), body = await orderBody(first);
  body.items.push({ productId: String(second._id), orderedQty: 3, unitCostMinor: 100 });
  const purchase = (await create(body).expect(201)).body.purchase, items = body.items.map((line) => ({ productId: line.productId, quantity: 2 })), receiptKey = key();
  const original = InventoryTransaction.create; let writes = 0;
  const stub = mock.method(InventoryTransaction, 'create', async function (...args) { if (++writes === 2) throw new Error('Forced second audit failure'); return original.apply(this, args); });
  try { await receive(purchase._id, items, receiptKey).expect(500); } finally { stub.mock.restore(); }
  assert.equal(await stock(first), 5); assert.equal(await stock(second), 5); assert.equal(await InventoryTransaction.countDocuments({ sourceId: purchase._id }), 0);
  assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 0);
  assert.ok((await Purchase.findById(purchase._id)).items.every((line) => line.receivedQty === 0));
  await receive(purchase._id, items, receiptKey).expect(201); assert.equal(await stock(first), 7); assert.equal(await stock(second), 7);
});

test('receipt persistence failure also rolls back stock/history and purchase progress', async () => {
  const product = await fixture(), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase, receiptKey = key();
  const stub = mock.method(PurchaseReceipt, 'create', async () => { throw new Error('Forced receipt failure'); });
  try { await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }], receiptKey).expect(500); } finally { stub.mock.restore(); }
  assert.equal(await stock(product), 5); assert.equal((await Purchase.findById(purchase._id)).status, 'ORDERED');
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: purchase._id }), 0);
  await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }], receiptKey).expect(201);
});

test('inactive products, missing inventory and stock overflow reject receipts without changing order state', async () => {
  for (const condition of ['inactive', 'missing', 'overflow']) {
    const product = await fixture({ quantity: condition === 'overflow' ? Number.MAX_SAFE_INTEGER : 5 }), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase;
    if (condition === 'inactive') await Product.updateOne({ _id: product._id }, { $set: { status: 'INACTIVE' } });
    if (condition === 'missing') await Inventory.deleteOne({ productId: product._id });
    await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }]).expect(409);
    assert.equal((await Purchase.findById(purchase._id)).status, 'ORDERED'); assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 0);
  }
});

test('TC-PUR-09: supplier/date/status history filters include boundaries and reject malformed filters', async () => {
  const product = await fixture(), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase;
  const results = (await call('get', `/purchases?supplierId=${body.supplierId}&from=2026-11-08&to=2026-11-08&status=ORDERED`, 'SALES').expect(200)).body.purchases;
  assert.equal(results.length, 1); assert.equal(results[0]._id, purchase._id);
  assert.equal((await call('get', `/purchases?supplierId=${body.supplierId}&from=2026-11-09`).expect(200)).body.purchases.length, 0);
  for (const query of ['supplierId=bad', 'status=INVALID', 'from=2026-02-30', 'from=2026-11-09&to=2026-11-08', 'extra=true', 'from=x', 'status=ORDERED&status=DRAFT']) await call('get', `/purchases?${query}`).expect(400);
  await call('get', '/purchases/not-an-id').expect(400); await call('get', `/purchases/${id()}`).expect(404);
});

test('database validators protect quantities/totals/status and receipt history is append-only', async () => {
  const product = await fixture(), body = await orderBody(product), purchase = (await create(body).expect(201)).body.purchase;
  for (const update of [{ 'items.0.receivedQty': 6 }, { totalMinor: 1 }, { 'items.0.unitCostMinor': -1 }, { status: 'RECEIVED' }]) {
    await assert.rejects(Purchase.collection.updateOne({ _id: new mongoose.Types.ObjectId(purchase._id) }, { $set: update }), { code: 121 });
  }
  const result = (await receive(purchase._id, [{ productId: String(product._id), quantity: 1 }]).expect(201)).body;
  const receipt = await PurchaseReceipt.findById(result.receipt._id);
  await assert.rejects(PurchaseReceipt.updateOne({ _id: receipt._id }, { $set: { receivedBy: actors.ADMIN._id } }), /append-only/);
  await assert.rejects(receipt.deleteOne(), /append-only/);
  await assert.rejects(PurchaseReceipt.deleteMany({ purchaseId: purchase._id }), /append-only/);
  receipt.items[0].quantity = 2; await assert.rejects(receipt.save(), /match their purchase inventory events|append-only/);
});

test('migration upgrades existing 001–003 collections without replacing application records', async () => {
  const upgradeName = `techzone_test_purchase_upgrade_${randomBytes(6).toString('hex')}`;
  const db = mongoose.connection.getClient().db(upgradeName);
  try {
    for (const [name, { validator, indexes }] of Object.entries({ ...definitions, ...sessionDefinitions, ...salesDefinitions })) {
      await db.createCollection(name, { validator });
      if (indexes.length) await db.collection(name).createIndexes(indexes);
    }
    await db.collection('_schemaMigrations').insertMany(['001-initial-inventory-foundation', '002-authentication-sessions', '003-sales-records'].map((_id) => ({ _id, appliedAt: new Date() })));
    const existing = { _id: new mongoose.Types.ObjectId(), name: 'Existing category', createdAt: new Date(), updatedAt: new Date() };
    await db.collection('categories').insertOne(existing);
    const result = await applySchema(db);
    assert.deepEqual(result.appliedIds, ['004-suppliers', '005-purchase-orders-receipts']);
    assert.equal((await db.collection('categories').findOne({ _id: existing._id })).name, existing.name);
    assert.equal((await applySchema(db)).applied, false);
    const indexes = await db.collection('purchaseReceipts').indexes();
    assert.ok(indexes.some((index) => index.name === 'receipt_request_unique' && index.unique));
    assert.ok(indexes.some((index) => index.name === 'receipt_history_unique' && index.unique));
  } finally { await db.dropDatabase(); }
});
