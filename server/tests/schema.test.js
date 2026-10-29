import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import '../src/config/env.js';
import { applySchema } from '../src/database/setup.js';
import { seedDevelopment } from '../src/database/seed.js';
import { User, Category, Product, Inventory, InventoryTransaction } from '../src/database/models.js';
import { verifyPassword } from '../src/modules/shared/passwords.js';

// Always override the URI's database with a unique name created by this process.
const databaseName = `techzone_test_schema_${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const otherPassword = randomBytes(24).toString('base64url');
let seeded = false;
const oid = () => new mongoose.Types.ObjectId();
const rawInventory = (availableQty) => ({ _id: oid(), productId: oid(), availableQty, createdAt: new Date(), updatedAt: new Date() });

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; schema tests must run against MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
});

after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('schema setup is replayable and creates the expected unique indexes', async () => {
  assert.equal((await applySchema(mongoose.connection.db)).applied, false);
  assert.equal(await mongoose.connection.db.collection('_schemaMigrations').countDocuments(), 1);
  const indexes = await Product.collection.indexes();
  assert.ok(indexes.some(({ name, unique }) => name === 'product_sku_unique' && unique));
  const inventoryIndexes = await Inventory.collection.indexes();
  assert.ok(inventoryIndexes.some(({ name, unique }) => name === 'inventory_product_unique' && unique));
});

test('seeding requires an external password and refuses production', async () => {
  await assert.rejects(seedDevelopment({ password: undefined }), /passwords must contain/);
  await assert.rejects(seedDevelopment({ password, environment: 'production' }), /disabled in production/);
  assert.equal(await User.countDocuments(), 0);
});

test('seeds cover roles, account states and stock boundaries without exposing passwords', async () => {
  await seedDevelopment({ password, environment: 'test' });
  seeded = true;
  assert.equal(await User.countDocuments(), 6);
  assert.equal(await User.countDocuments({ status: 'INACTIVE' }), 1);
  assert.equal((await User.distinct('role')).length, 5);
  const user = await User.findOne({ role: 'ADMIN' });
  assert.equal(user.passwordHash, undefined);
  const secretUser = await User.findById(user._id).select('+passwordHash');
  assert.notEqual(secretUser.passwordHash, password);
  assert.ok(await verifyPassword(password, secretUser.passwordHash));
  assert.equal(await verifyPassword(otherPassword, secretUser.passwordHash), false);
  assert.equal(secretUser.toJSON().passwordHash, undefined);
  assert.equal(await Product.countDocuments(), 5);
  const counts = await Inventory.find().lean();
  assert.ok(counts.some(({ availableQty }) => availableQty === 0));
  const products = await Product.find({ status: 'ACTIVE' }).lean();
  const quantities = new Map(counts.map(({ productId, availableQty }) => [String(productId), availableQty]));
  assert.ok(products.some((p) => quantities.get(String(p._id)) < p.minimumStock));
  assert.ok(products.some((p) => quantities.get(String(p._id)) === p.minimumStock));
  assert.ok(products.some((p) => quantities.get(String(p._id)) > p.minimumStock));
});

test('repeated seeding preserves stock, passwords and history rather than resetting development work', async () => {
  assert.ok(seeded);
  const stock = await Inventory.findOne({ availableQty: 25 });
  await Inventory.updateOne({ _id: stock._id }, { $set: { availableQty: 24 } });
  const user = await User.findOne({ role: 'ADMIN' }).select('+passwordHash');
  const eventCount = await InventoryTransaction.countDocuments();
  await seedDevelopment({ password: otherPassword, environment: 'test' });
  assert.equal(await User.countDocuments(), 6);
  assert.equal(await Product.countDocuments(), 5);
  assert.equal(await Inventory.countDocuments(), 5);
  assert.equal((await Inventory.findById(stock._id)).availableQty, 24);
  assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, user.passwordHash);
  assert.equal(await InventoryTransaction.countDocuments(), eventCount);
});

test('the documented seed command runs against the isolated database without printing credentials', () => {
  const uri = new URL(process.env.TEST_MONGODB_URI);
  uri.pathname = `/${databaseName}`;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/seed-db.js', import.meta.url))], {
    env: { ...process.env, MONGODB_URI: uri.toString(), SEED_PASSWORD: password, NODE_ENV: 'test' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Development seed complete/);
  assert.equal((result.stdout + result.stderr).includes(password), false);
});

test('database validators reject negative, fractional and unsafe stock even for direct writes', async () => {
  for (const quantity of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '5']) {
    await assert.rejects(Inventory.collection.insertOne(rawInventory(quantity)), { code: 121 });
  }
  const stock = await Inventory.findOne();
  await assert.rejects(Inventory.collection.updateOne({ _id: stock._id }, { $inc: { availableQty: -1000 } }), { code: 121 });
  assert.ok((await Inventory.findById(stock._id)).availableQty >= 0);
});

test('database indexes reject duplicate SKU and duplicate product stock rows', async () => {
  const product = await Product.findOne().lean();
  await assert.rejects(Product.collection.insertOne({ ...product, _id: oid() }), { code: 11000 });
  const stock = await Inventory.findOne().lean();
  await assert.rejects(Inventory.collection.insertOne({ ...stock, _id: oid() }), { code: 11000 });
});

test('shared models reject nonexistent references on creation and query updates', async () => {
  await assert.rejects(Product.create({ sku: 'BAD-REFERENCE', name: 'Invalid', categoryId: oid(), sellingPriceMinor: 100, minimumStock: 0 }), /Category reference does not exist/);
  await assert.rejects(Inventory.create({ productId: oid(), availableQty: 0 }), /Product reference does not exist/);
  const product = await Product.findOne();
  await assert.rejects(Product.updateOne({ _id: product._id }, { $set: { categoryId: oid() } }), /Category reference does not exist/);
  await assert.rejects(Product.insertMany([{ sku: 'BYPASS' }]), /reference validation/);
});

test('models and database reject invalid prices, thresholds and status', async () => {
  const product = await Product.findOne();
  for (const update of [{ sellingPriceMinor: -1 }, { minimumStock: 0.5 }, { status: 'UNKNOWN' }]) {
    await assert.rejects(Product.collection.updateOne({ _id: product._id }, { $set: update }), { code: 121 });
  }
});

test('history requires a valid actor/source and adjustment reason', async () => {
  const product = await Product.findOne();
  const user = await User.findOne({ role: 'ADMIN' });
  const id = oid();
  const event = { _id: id, productId: product._id, changeQty: 1, createdBy: user._id, sourceId: id, sourceType: 'ADJUSTMENT' };
  await assert.rejects(InventoryTransaction.create(event), /reason/);
  await assert.rejects(InventoryTransaction.create({ ...event, reason: 'Count correction', createdBy: oid() }), /User reference does not exist/);
  await assert.rejects(InventoryTransaction.create({ ...event, reason: 'Count correction', sourceType: 'PURCHASE', sourceId: oid() }), /Source transaction does not exist/);
  await assert.rejects(InventoryTransaction.collection.insertOne({ ...event, reason: 'Count correction', sourceId: oid(), createdAt: new Date() }), { code: 121 });
});

test('historical events are append-only and referenced records require deactivation', async () => {
  const event = await InventoryTransaction.findOne();
  await assert.rejects(InventoryTransaction.updateOne({ _id: event._id }, { $set: { changeQty: 900 } }), /append-only/);
  await assert.rejects(InventoryTransaction.deleteOne({ _id: event._id }), /append-only/);
  await assert.rejects(event.deleteOne(), /append-only/);
  event.changeQty = 900;
  await assert.rejects(event.save(), /append-only/);
  await assert.rejects(Product.deleteOne({ _id: event.productId }), /cannot be deleted/);
  await assert.rejects(User.deleteOne({ _id: event.createdBy }), /cannot be deleted/);
  const product = await Product.findById(event.productId);
  await assert.rejects(Category.deleteOne({ _id: product.categoryId }), /cannot be deleted/);
  await Product.updateOne({ _id: product._id }, { $set: { status: 'INACTIVE' } });
  assert.ok(await InventoryTransaction.findById(event._id));
});

test('the replica-set foundation rolls back related database writes on failure (NFR-009)', async () => {
  const stock = await Inventory.findOne();
  const beforeQuantity = stock.availableQty;
  await assert.rejects(mongoose.connection.transaction(async (session) => {
    await Inventory.updateOne({ _id: stock._id }, { $inc: { availableQty: 1 } }, { session });
    await Category.create([{ name: 'Rollback-only category' }], { session });
    throw new Error('Forced transaction failure');
  }), /Forced transaction failure/);
  assert.equal((await Inventory.findById(stock._id)).availableQty, beforeQuantity);
  assert.equal(await Category.countDocuments({ name: 'Rollback-only category' }), 0);
});
