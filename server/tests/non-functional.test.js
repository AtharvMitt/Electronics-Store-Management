import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User, Category, Product, Inventory, InventoryTransaction } from '../src/database/models.js';
import { hashPassword } from '../src/modules/shared/passwords.js';

const databaseName = `techzone_test_nfr_${randomBytes(6).toString('hex')}`;
const app = createApp();
let cookie, actor, category;
before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI for NFR checks.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url');
  actor = await User.create({ name: 'NFR administrator', email: 'nfr@example.test', role: 'ADMIN', passwordHash: await hashPassword(password) });
  category = await Category.create({ name: 'Volume fixture' });
  const response = await request(app).post('/api/auth/login').send({ email: actor.email, password }).expect(200);
  cookie = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
});
after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-NFR-01: at least 95% of 100 sequential authenticated reads finish within two seconds locally', async (t) => {
  const paths = ['/products', '/inventory', '/suppliers', '/purchases', '/reports/inventory'];
  const durations = [];
  // Warm up each route; login/hash cost and fixture creation are outside this read-only workload.
  for (const path of paths) await request(app).get(`/api${path}`).set('Cookie', cookie).expect(200);
  for (let index = 0; index < 100; index++) {
    const start = performance.now();
    await request(app).get(`/api${paths[index % paths.length]}`).set('Cookie', cookie).expect(200);
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const withinTarget = durations.filter((ms) => ms <= 2000).length;
  t.diagnostic(JSON.stringify({ workload: 'small-data local reads, concurrency 1', samples: 100, withinTarget, p95Ms: durations[94], maxMs: durations.at(-1) }));
  assert.ok(withinTarget >= 95, `${withinTarget}/100 completed within 2000ms`);
});

test('TC-NFR-07: 10000 products and 100000 audit records retain usable inventory reads and writes', async (t) => {
  const now = new Date(), products = [], inventory = [], history = [];
  // Bulk fixture insertion still runs MongoDB validators/indexes. Each adjustment
  // refers to itself and a real actor/product; ten +1 events reconcile to stock 10.
  for (let index = 0; index < 10000; index++) {
    const productId = new mongoose.Types.ObjectId();
    products.push({ _id: productId, sku: `VOLUME-${String(index).padStart(5, '0')}`, name: `Volume product ${index}`, categoryId: category._id, sellingPriceMinor: 100, minimumStock: 2, status: 'ACTIVE', createdAt: now, updatedAt: now });
    inventory.push({ _id: new mongoose.Types.ObjectId(), productId, availableQty: 10, createdAt: now, updatedAt: now });
    for (let event = 0; event < 10; event++) {
      const eventId = new mongoose.Types.ObjectId();
      history.push({ _id: eventId, productId, changeQty: 1, sourceType: 'ADJUSTMENT', sourceId: eventId, createdBy: actor._id, reason: 'Synthetic volume fixture', createdAt: now });
    }
  }
  await Product.collection.insertMany(products);
  await Inventory.collection.insertMany(inventory);
  for (let offset = 0; offset < history.length; offset += 5000) await InventoryTransaction.collection.insertMany(history.slice(offset, offset + 5000));
  assert.equal(await Product.countDocuments(), 10000);
  assert.equal(await InventoryTransaction.countDocuments(), 100000);
  const measurements = [];
  // Coverage instrumentation slows every call, so a coverage run gets extra headroom.
  // Normal `npm test` and CI runs still enforce the 5000ms usability budget.
  const budgetMs = process.env.NODE_V8_COVERAGE ? 15000 : 5000;
  async function measure(operation, run) {
    const start = performance.now();
    await run();
    const durationMs = performance.now() - start;
    measurements.push({ operation, durationMs });
    assert.ok(durationMs < budgetMs, `${operation} took ${durationMs}ms; local usability budget is ${budgetMs}ms`);
  }
  await measure('SKU search', async () => {
    const response = await request(app).get('/api/inventory?search=VOLUME-09999').set('Cookie', cookie).expect(200);
    assert.equal(response.body.inventory.length, 1);
  });
  await measure('inventory report, 10000 rows', async () => {
    const response = await request(app).get('/api/reports/inventory').set('Cookie', cookie).expect(200);
    assert.equal(response.body.productCount, 10000); assert.equal(response.body.totalUnits, 100000);
  });
  await measure('stock adjustment', async () => {
    await request(app).post(`/api/inventory/${products[0]._id}/adjustments`).set('Cookie', cookie).send({ changeQty: -1, reason: 'Volume write check' }).expect(201);
    assert.equal((await Inventory.findOne({ productId: products[0]._id })).availableQty, 9);
  });
  t.diagnostic(JSON.stringify({ products: 10000, initialAuditRecords: 100000, measurements }));
});
