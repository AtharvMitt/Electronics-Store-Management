// Issue #25: regression tests that the #7 permission matrix still holds on the
// Sprint 2 purchasing, sales and reporting endpoints.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { ROLES } from '../src/database/definitions.js';
import { Inventory, Product, Purchase, Sale, Session, Supplier } from '../src/database/models.js';
import { seedDevelopment } from '../src/database/seed.js';
import { PERMISSIONS } from '../src/modules/auth/permissions.js';

const databaseName = `techzone_test_regression_${randomBytes(6).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
const app = createApp();
const DENIED = { error: { message: 'You do not have permission to do this.' } };
const LOGIN_REQUIRED = { error: { message: 'Please log in to continue.' } };
const unusedId = () => new mongoose.Types.ObjectId().toString();
const key = () => `regression-${randomBytes(8).toString('hex')}`;
const cookies = {};

// Every purchasing, sales and reporting operation with the permission it needs.
// Write calls use empty or unknown-record bodies: a permitted role gets a validation
// or not-found error from the handler, so nothing is written during the matrix sweep.
const OPERATIONS = [
  ['GET', '/api/suppliers', 'suppliers:view'],
  ['GET', () => `/api/suppliers/${unusedId()}`, 'suppliers:view'],
  ['POST', '/api/suppliers', 'suppliers:manage'],
  ['PATCH', () => `/api/suppliers/${unusedId()}`, 'suppliers:manage'],
  ['DELETE', () => `/api/suppliers/${unusedId()}`, 'suppliers:manage'],
  ['GET', '/api/purchases', 'purchases:view'],
  ['GET', () => `/api/purchases/${unusedId()}`, 'purchases:view'],
  ['POST', '/api/purchases', 'purchases:manage'],
  ['PATCH', () => `/api/purchases/${unusedId()}`, 'purchases:manage'],
  ['POST', () => `/api/purchases/${unusedId()}/receipts`, 'purchases:receive'],
  ['GET', '/api/sales', 'sales:view'],
  ['GET', () => `/api/sales/${unusedId()}`, 'sales:view'],
  ['POST', '/api/sales', 'sales:create'],
  ['GET', '/api/reports/sales', 'reports:sales'],
  ['GET', '/api/reports/inventory', 'reports:inventory'],
  ['GET', '/api/reports/low-stock', 'reports:inventory'],
];

function call(method, path, cookie) {
  const target = typeof path === 'function' ? path() : path;
  let req = request(app)[method.toLowerCase()](target).set('Idempotency-Key', key());
  if (cookie) req = req.set('Cookie', cookie);
  return ['POST', 'PATCH'].includes(method) ? req.send({}) : req;
}

const login = async (role) => {
  const response = await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@techzone.example.test`, password }).expect(200);
  return /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
};
const stockOf = async (productId) => (await Inventory.findOne({ productId }).lean()).availableQty;
const counts = async () => ({ suppliers: await Supplier.countDocuments(), purchases: await Purchase.countDocuments(), sales: await Sale.countDocuments() });

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; regression tests must run against MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await seedDevelopment({ password, environment: 'test' });
  for (const role of ROLES) cookies[role] = await login(role);
});

after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('every role reaches exactly the purchasing, sales and reporting operations the SRS matrix allows', async () => {
  const before = await counts();
  for (const role of ROLES) {
    for (const [method, path, permission] of OPERATIONS) {
      const response = await call(method, path, cookies[role]);
      const label = `${role} ${method} ${typeof path === 'function' ? path() : path}`;
      if (PERMISSIONS[role].includes(permission)) {
        assert.ok(![401, 403].includes(response.status), `${label} should pass authorization, got ${response.status}`);
      } else {
        assert.equal(response.status, 403, `${label} should be denied`);
        assert.deepEqual(response.body, DENIED, label);
      }
    }
  }
  assert.deepEqual(await counts(), before, 'the sweep must not create records');
});

test('requests without a session are rejected on every operation', async () => {
  for (const [method, path] of OPERATIONS) {
    const response = await call(method, path);
    assert.equal(response.status, 401, `${method} ${typeof path === 'function' ? path() : path}`);
    assert.deepEqual(response.body, LOGIN_REQUIRED);
  }
});

test('representative permitted transactions succeed and change stock as expected', async () => {
  const product = await Product.findOne({ sku: 'TZ-MOUSE-001' }).lean();
  const start = await stockOf(product._id);

  const { body: { supplier } } = await request(app).post('/api/suppliers').set('Cookie', cookies.PURCHASE)
    .send({ name: 'Regression Supplier', phone: '+91 98765 43210' }).expect(201);
  const { body: { purchase } } = await request(app).post('/api/purchases').set('Cookie', cookies.PURCHASE).set('Idempotency-Key', key())
    .send({ supplierId: supplier._id, orderDate: '2026-11-09', items: [{ productId: String(product._id), orderedQty: 4, unitCostMinor: 90000 }] }).expect(201);
  await request(app).post(`/api/purchases/${purchase._id}/receipts`).set('Cookie', cookies.ADMIN).set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 4 }] }).expect(201);
  assert.equal(await stockOf(product._id), start + 4);

  await request(app).post('/api/sales').set('Cookie', cookies.SALES).set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 3 }] }).expect(201);
  assert.equal(await stockOf(product._id), start + 1);

  for (const path of ['/api/reports/sales', '/api/reports/inventory', '/api/reports/low-stock']) {
    await request(app).get(path).set('Cookie', cookies.MANAGER).expect(200);
  }
  const report = await request(app).get('/api/reports/sales').set('Cookie', cookies.SALES).expect(200);
  assert.equal(report.body.transactionCount, 1);
  assert.equal(report.body.unitsSold, 3);
});

test('denied transactions with valid bodies change nothing (backend, not just hidden UI)', async () => {
  const product = await Product.findOne({ sku: 'TZ-AUDIO-001' }).lean();
  const supplier = await Supplier.findOne().lean();
  const stock = await stockOf(product._id);
  const before = await counts();
  // Fully valid requests from roles whose UI would hide these controls.
  await request(app).post('/api/sales').set('Cookie', cookies.INVENTORY).set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 1 }] }).expect(403, DENIED);
  await request(app).post('/api/purchases').set('Cookie', cookies.SALES).set('Idempotency-Key', key())
    .send({ supplierId: String(supplier._id), orderDate: '2026-11-09', items: [{ productId: String(product._id), orderedQty: 1, unitCostMinor: 100 }] }).expect(403, DENIED);
  await request(app).post('/api/suppliers').set('Cookie', cookies.MANAGER).send({ name: 'Should not exist' }).expect(403, DENIED);
  const purchase = await Purchase.findOne().lean();
  await request(app).post(`/api/purchases/${purchase._id}/receipts`).set('Cookie', cookies.SALES).set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 1 }] }).expect(403, DENIED);
  // Forged role data in the request does not help.
  await request(app).post('/api/sales').set('Cookie', cookies.PURCHASE).set('X-Role', 'SALES').set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 1 }], role: 'SALES' }).expect(403, DENIED);
  assert.deepEqual(await counts(), before);
  assert.equal(await stockOf(product._id), stock);
});

test('expired, forged and logged-out sessions cannot perform protected transactions', async () => {
  const product = await Product.findOne({ sku: 'TZ-AUDIO-001' }).lean();
  const stock = await stockOf(product._id);
  const sale = (cookie) => request(app).post('/api/sales').set('Cookie', cookie).set('Idempotency-Key', key())
    .send({ items: [{ productId: String(product._id), quantity: 1 }] });

  const expired = await login('SALES');
  const user = await request(app).get('/api/auth/me').set('Cookie', expired).expect(200);
  await Session.updateMany({ userId: user.body.user.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await sale(expired).expect(401, LOGIN_REQUIRED);

  await sale('tz_session=forged-session-token').expect(401, LOGIN_REQUIRED);

  const loggedOut = await login('SALES');
  await request(app).post('/api/auth/logout').set('Cookie', loggedOut).expect(204);
  await sale(loggedOut).expect(401, LOGIN_REQUIRED);

  assert.equal(await stockOf(product._id), stock);
});
