// #26 complements the HTTP workflow in #21 with real-database service tests.
// Transaction failures are injected after writes, not just during preflight.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, afterEach, test, mock } from 'node:test';
import mongoose from 'mongoose';
import '../src/config/env.js';
import { applySchema } from '../src/database/setup.js';
import { User, Category, Product, Supplier, Inventory, InventoryTransaction, Purchase, PurchaseReceipt, Sale } from '../src/database/models.js';
import { hashPassword } from '../src/modules/shared/passwords.js';
import { applyStockChange } from '../src/modules/inventory/service.js';
import { recordPurchase, receivePurchase } from '../src/modules/purchases/service.js';
import { recordSale, saleInput } from '../src/modules/sales/service.js';

const databaseName = `techzone_test_consistency_${randomBytes(6).toString('hex')}`;
const actors = {};
const key = () => `consistency-${randomBytes(10).toString('hex')}`;
let category, supplier;
const collections = ['products', 'suppliers', 'inventory', 'inventoryTransactions', 'purchases', 'purchaseReceipts', 'sales'];

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; stock consistency tests require a MongoDB replica set.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const passwordHash = await hashPassword(randomBytes(24).toString('base64url'));
  for (const role of ['PURCHASE', 'SALES', 'ADMIN']) actors[role] = await User.create({ name: `Consistency ${role}`, email: `${role.toLowerCase()}@consistency.example.test`, role, passwordHash });
  category = await Category.create({ name: 'Stock consistency fixtures' });
  supplier = await Supplier.create({ name: 'Stock consistency supplier' });
});
afterEach(() => mock.restoreAll());
after(async () => {
  mock.restoreAll();
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

async function product(quantity) {
  const record = await Product.create({ sku: `CONS-${randomBytes(6).toString('hex')}`, name: 'Consistency product', categoryId: category._id, sellingPriceMinor: 1250, minimumStock: 2 });
  await Inventory.create({ productId: record._id, availableQty: quantity });
  return record;
}
async function fixtures() { return { first: await product(8), second: await product(6), untouched: await product(19) }; }
async function quantities(products, session = null) {
  const rows = await Inventory.find({ productId: { $in: products.map((item) => item._id) } }).session(session).lean();
  return products.map((item) => rows.find((row) => String(row.productId) === String(item._id))?.availableQty);
}
async function snapshot() {
  const result = {};
  for (const name of collections) result[name] = await mongoose.connection.db.collection(name).find().sort({ _id: 1 }).toArray();
  return result;
}
async function rejectedWithoutWrites(operation, expected) {
  const before = await snapshot();
  await assert.rejects(operation, expected);
  assert.deepEqual(await snapshot(), before, 'rejection must leave stock, order progress, receipts, sales, history and reference versions unchanged');
}
function orderBody(items) { return { supplierId: String(supplier._id), orderDate: '2026-11-09', items }; }
function order(items, requestId = key()) { return recordPurchase({ body: orderBody(items), createdBy: actors.PURCHASE._id, requestId }); }
function receive(purchase, items, requestId = key()) { return receivePurchase({ id: String(purchase._id), body: { items }, receivedBy: actors.PURCHASE._id, requestId }); }
// The sales module's public input contract is saleInput -> recordSale, as used
// by its controller. This keeps service tests independent of Express/Supertest.
async function sell(items, requestId = key()) { return recordSale({ items: saleInput({ items }), createdBy: actors.SALES._id, requestId }); }
const orderLine = (item, orderedQty = 4) => ({ productId: String(item._id), orderedQty, unitCostMinor: 101 });
const receivedLine = (item, quantity = 1) => ({ productId: String(item._id), quantity });

test('a multi-item purchase changes only received products and links exact source/actor history', async () => {
  const { first, second, untouched } = await fixtures();
  const purchase = await order([orderLine(first), orderLine(second)]);
  assert.deepEqual(await quantities([first, second, untouched]), [8, 6, 19], 'ordering must not increase stock');
  const result = await receive(purchase, [receivedLine(first, 2), receivedLine(second, 3)]);
  assert.deepEqual(await quantities([first, second, untouched]), [10, 9, 19]);
  const saved = await Purchase.findById(purchase._id).lean();
  assert.equal(saved.status, 'PARTIAL');
  for (const [item, amount] of [[first, 2], [second, 3]]) {
    assert.equal(saved.items.find((line) => String(line.productId) === String(item._id)).receivedQty, amount);
    const event = await InventoryTransaction.findOne({ sourceId: purchase._id, productId: item._id }).lean();
    assert.equal(event.sourceType, 'PURCHASE'); assert.equal(event.changeQty, amount);
    assert.equal(String(event.createdBy), String(actors.PURCHASE._id));
    assert.ok(result.receipt.inventoryTransactionIds.some((id) => String(id) === String(event._id)));
  }
  assert.equal(await InventoryTransaction.countDocuments({ productId: untouched._id }), 0);
});

test('a multi-item sale deducts only intended products and links history to the exact sale and actor', async () => {
  const { first, second, untouched } = await fixtures();
  const sale = await sell([receivedLine(first, 3), receivedLine(second, 2)]);
  assert.deepEqual(await quantities([first, second, untouched]), [5, 4, 19]);
  const events = await InventoryTransaction.find({ sourceId: sale._id }).lean();
  assert.equal(events.length, 2);
  for (const [item, amount] of [[first, -3], [second, -2]]) {
    const event = events.find((entry) => String(entry.productId) === String(item._id));
    assert.equal(event.sourceType, 'SALE'); assert.equal(event.changeQty, amount);
    assert.equal(String(event.createdBy), String(actors.SALES._id));
  }
  assert.equal(await InventoryTransaction.countDocuments({ productId: untouched._id }), 0);
  assert.equal(await Sale.countDocuments({ _id: sale._id }), 1);
});

test('invalid purchase, receipt, sale and stock-source quantities leave all persistent state unchanged', async () => {
  const { first } = await fixtures(), purchase = await order([orderLine(first)]);
  for (const quantity of [0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    await rejectedWithoutWrites(() => order([{ ...orderLine(first), orderedQty: quantity }]), { status: 400 });
    await rejectedWithoutWrites(() => receive(purchase, [receivedLine(first, quantity)]), { status: 400 });
    await rejectedWithoutWrites(() => sell([receivedLine(first, quantity)]), { status: 400 });
  }
  for (const [sourceType, changeQty] of [['PURCHASE', -1], ['SALE', 1], ['PURCHASE', 0], ['SALE', 0], ['SALE', -0.5]]) {
    await rejectedWithoutWrites(() => applyStockChange({ productId: first._id, sourceType, changeQty, sourceId: purchase._id, createdBy: actors.ADMIN._id }), { status: 400 });
  }
});

test('insufficient stock on a later sale line and over-receipt cannot commit any partial changes', async () => {
  const { first, second, untouched } = await fixtures(), purchase = await order([orderLine(first), orderLine(second)]);
  await rejectedWithoutWrites(() => sell([receivedLine(first, 1), receivedLine(second, 7)]), { status: 409 });
  await rejectedWithoutWrites(() => receive(purchase, [receivedLine(first, 1), receivedLine(second, 5)]), { status: 409 });
  assert.deepEqual(await quantities([first, second, untouched]), [8, 6, 19]);
});

async function secondAuditFailure(operation, { products, expected, sourceType, sourceId }) {
  const original = InventoryTransaction.create;
  let calls = 0, observed;
  const stub = mock.method(InventoryTransaction, 'create', async function (...args) {
    calls++;
    if (calls === 2) {
      const session = args[1].session;
      const id = sourceId || args[0][0].sourceId;
      observed = { inTransaction: session.inTransaction(), quantities: await quantities(products, session), events: await InventoryTransaction.countDocuments({ sourceType, sourceId: id }).session(session) };
      throw new Error(`Forced second ${sourceType} audit failure`);
    }
    return original.apply(this, args);
  });
  try { await rejectedWithoutWrites(operation); }
  finally { stub.mock.restore(); }
  assert.equal(calls, 2, 'failure must occur on the second audit write');
  assert.deepEqual(observed, { inTransaction: true, quantities: expected, events: 1 }, 'stock writes and the first audit event must really exist inside the failing transaction');
}

test('purchase rollback undoes two in-flight stock changes, order progress and the first audit event', async () => {
  const { first, second, untouched } = await fixtures(), purchase = await order([orderLine(first), orderLine(second)]);
  const items = [receivedLine(first, 2), receivedLine(second, 3)], requestId = key();
  await secondAuditFailure(() => receive(purchase, items, requestId), { products: [first, second, untouched], expected: [10, 9, 19], sourceType: 'PURCHASE', sourceId: purchase._id });
  const result = await receive(purchase, items, requestId);
  assert.deepEqual(await quantities([first, second, untouched]), [10, 9, 19]);
  assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: result.purchase._id }), 2);
});

test('sale rollback removes the sale and both in-flight deductions after the second audit write fails', async () => {
  const { first, second, untouched } = await fixtures(), items = [receivedLine(first, 2), receivedLine(second, 3)], requestId = key();
  await secondAuditFailure(() => sell(items, requestId), { products: [first, second, untouched], expected: [6, 3, 19], sourceType: 'SALE' });
  const sale = await sell(items, requestId);
  assert.deepEqual(await quantities([first, second, untouched]), [6, 3, 19]);
  assert.equal(await Sale.countDocuments({ requestId }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: sale._id }), 2);
});

test('a transient conflict after sale writes retries the transaction without duplicating stock or history', async () => {
  const { first, second, untouched } = await fixtures(), requestId = key();
  const items = [receivedLine(first, 2), receivedLine(second, 3)];
  const original = InventoryTransaction.create;
  let calls = 0, rolledBackEvent, observed;
  const stub = mock.method(InventoryTransaction, 'create', async function (...args) {
    calls++;
    if (calls === 2) {
      const session = args[1].session;
      observed = { inTransaction: session.inTransaction(), quantities: await quantities([first, second, untouched], session) };
      const error = new mongoose.mongo.MongoServerError({ message: 'Forced transient stock conflict', code: 112 });
      error.addErrorLabel('TransientTransactionError');
      throw error;
    }
    const result = await original.apply(this, args);
    if (calls === 1) rolledBackEvent = result[0]._id;
    return result;
  });
  let sale;
  try { sale = await sell(items, requestId); }
  finally { stub.mock.restore(); }
  assert.equal(calls, 4, 'two audit attempts fail mid-transaction, then two writes succeed on retry');
  assert.deepEqual(observed, { inTransaction: true, quantities: [6, 3, 19] });
  assert.deepEqual(await quantities([first, second, untouched]), [6, 3, 19]);
  assert.equal(await Sale.countDocuments({ requestId }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: sale._id }), 2);
  assert.equal(await InventoryTransaction.findById(rolledBackEvent), null);
});

test('a receipt persistence failure after all stock/history writes rolls the whole operation back', async () => {
  const { first, second, untouched } = await fixtures(), purchase = await order([orderLine(first), orderLine(second)]);
  const items = [receivedLine(first, 2), receivedLine(second, 3)], requestId = key();
  let observed;
  const stub = mock.method(PurchaseReceipt, 'create', async function (_documents, { session }) {
    observed = { quantities: await quantities([first, second, untouched], session), events: await InventoryTransaction.countDocuments({ sourceId: purchase._id }).session(session) };
    throw new Error('Forced receipt persistence failure');
  });
  try { await rejectedWithoutWrites(() => receive(purchase, items, requestId)); }
  finally { stub.mock.restore(); }
  assert.deepEqual(observed, { quantities: [10, 9, 19], events: 2 });
  await receive(purchase, items, requestId);
  assert.deepEqual(await quantities([first, second, untouched]), [10, 9, 19]);
  assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 1);
});

test('concurrent and later repeated order, receipt and sale submissions change stock only once', async () => {
  const { first, second, untouched } = await fixtures(), orderItems = [orderLine(first), orderLine(second)], orderKey = key();
  const orders = await Promise.all([order(orderItems, orderKey), order(orderItems, orderKey)]);
  assert.equal(String(orders[0]._id), String(orders[1]._id));
  assert.deepEqual(await quantities([first, second, untouched]), [8, 6, 19]);
  const purchase = orders[0], items = [receivedLine(first, 2), receivedLine(second, 3)], receiptKey = key();
  const receipts = await Promise.all([receive(purchase, items, receiptKey), receive(purchase, items, receiptKey)]);
  assert.equal(String(receipts[0].receipt._id), String(receipts[1].receipt._id));
  assert.deepEqual(await quantities([first, second, untouched]), [10, 9, 19]);
  const saleKey = key(), sales = await Promise.all([sell(items, saleKey), sell(items, saleKey)]);
  assert.equal(String(sales[0]._id), String(sales[1]._id));
  assert.deepEqual(await quantities([first, second, untouched]), [8, 6, 19]);
  const beforeReplays = await snapshot();
  await order(orderItems, orderKey); await receive(purchase, items, receiptKey); await sell(items, saleKey);
  assert.deepEqual(await snapshot(), beforeReplays, 'later retries must also preserve the complete persisted state');
  assert.equal(await Purchase.countDocuments({ requestId: orderKey }), 1); assert.equal(await PurchaseReceipt.countDocuments({ requestId: receiptKey }), 1); assert.equal(await Sale.countDocuments({ requestId: saleKey }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: purchase._id }), 2);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: sales[0]._id }), 2);
});

test('idempotency keys reused with different quantities reject without additional records or stock changes', async () => {
  const { first, second } = await fixtures(), orderKey = key(), receiptKey = key(), saleKey = key();
  const purchase = await order([orderLine(first), orderLine(second)], orderKey);
  await receive(purchase, [receivedLine(first, 1)], receiptKey);
  await sell([receivedLine(first, 1)], saleKey);
  await rejectedWithoutWrites(() => order([orderLine(first, 3), orderLine(second)], orderKey), { status: 409 });
  await rejectedWithoutWrites(() => receive(purchase, [receivedLine(first, 2)], receiptKey), { status: 409 });
  await rejectedWithoutWrites(() => sell([receivedLine(first, 2)], saleKey), { status: 409 });
});

test('competing multi-item receipts cannot over-receive or leave one line partially committed', async () => {
  const { first, second, untouched } = await fixtures(), purchase = await order([orderLine(first, 3), orderLine(second, 3)]);
  const items = [receivedLine(first, 2), receivedLine(second, 2)];
  const results = await Promise.allSettled([receive(purchase, items), receive(purchase, items)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.deepEqual(await quantities([first, second, untouched]), [10, 8, 19]);
  assert.equal(await PurchaseReceipt.countDocuments({ purchaseId: purchase._id }), 1);
  assert.ok((await Purchase.findById(purchase._id)).items.every((line) => line.receivedQty === 2));
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: purchase._id }), 2);
});

test('competing multi-item sales cannot oversell or leave an unrelated product changed', async () => {
  const { first, second, untouched } = await fixtures(), items = [receivedLine(first, 5), receivedLine(second, 1)];
  const results = await Promise.allSettled([sell(items), sell(items)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failure = results.find((result) => result.status === 'rejected').reason;
  assert.equal(failure.status, 409, failure.stack);
  assert.deepEqual(await quantities([first, second, untouched]), [3, 5, 19]);
  const sale = results.find((result) => result.status === 'fulfilled').value;
  assert.equal(await Sale.countDocuments({ 'items.productId': first._id }), 1);
  assert.equal(await InventoryTransaction.countDocuments({ sourceId: sale._id }), 2);
});
