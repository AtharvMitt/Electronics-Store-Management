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

const databaseName = `techzone_test_products_${randomBytes(6).toString('hex')}`;
const app = createApp();
const cookies = {};
let category, admin;
const id = () => new mongoose.Types.ObjectId().toString();
const product = (overrides = {}) => ({ sku: `SKU-${randomBytes(5).toString('hex')}`, name: 'Headphones', categoryId: String(category._id), sellingPriceMinor: 12345, minimumStock: 2, ...overrides });
const call = (method, path, role = 'ADMIN') => request(app)[method](`/api${path}`).set('Cookie', cookies[role]);

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; product tests require MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    const user = await User.create({ name: role, email: `${role}@example.test`, passwordHash, role });
    if (role === 'ADMIN') admin = user;
    const response = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(200);
    cookies[role] = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  }
  category = await Category.create({ name: 'Electronics' });
});

after(async () => {
  mock.restoreAll();
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-PROD-01, TC-PROD-03, TC-PROD-04: authorized category/product create, read, edit and persistence', async () => {
  const c = (await call('post', '/categories', 'INVENTORY').send({ name: '  Audio  ' }).expect(201)).body.category;
  assert.equal(c.name, 'Audio');
  await call('patch', `/categories/${c._id}`, 'INVENTORY').send({ name: 'Sound' }).expect(200);
  const input = product({ sku: '  audio-001 ', categoryId: c._id, sellingPriceMinor: 0, minimumStock: 0 });
  const p = (await call('post', '/products', 'INVENTORY').send(input).expect(201)).body.product;
  assert.equal(p.sku, 'AUDIO-001');
  assert.equal((await Inventory.findOne({ productId: p._id })).availableQty, 0);
  assert.equal(await Inventory.countDocuments({ productId: p._id }), 1);
  await call('patch', `/products/${p._id}`, 'INVENTORY').send({ name: 'New name', categoryId: String(category._id), sellingPriceMinor: 999 }).expect(200);
  const reload = (await call('get', `/products/${p._id}`, 'SALES').expect(200)).body.product;
  assert.equal(reload.name, 'New name'); assert.equal(reload.sellingPriceMinor, 999);
  assert.equal((await Product.findById(p._id)).categoryId.toString(), String(category._id));
  assert.ok((await call('get', '/products', 'MANAGER').expect(200)).body.products.some((x) => x._id === p._id));
  assert.ok((await call('get', '/categories', 'PURCHASE').expect(200)).body.categories.some((x) => x.name === 'Sound'));
});

test('all catalogue endpoints require authentication and enforce each role permission', async () => {
  const endpoints = [
    ['get', '/products', null, ROLES], ['get', `/products/${id()}`, null, ROLES], ['get', '/categories', null, ROLES],
    ['post', '/products', {}, ['ADMIN', 'INVENTORY']], ['patch', `/products/${id()}`, {}, ['ADMIN', 'INVENTORY']],
    ['delete', `/products/${id()}`, null, ['ADMIN']], ['post', '/categories', {}, ['ADMIN', 'INVENTORY']],
    ['patch', `/categories/${id()}`, {}, ['ADMIN', 'INVENTORY']], ['delete', `/categories/${id()}`, null, ['ADMIN']],
  ];
  for (const [method, path, body, allowed] of endpoints) {
    await request(app)[method](`/api${path}`).send(body).expect(401);
    for (const role of ROLES.filter((r) => !allowed.includes(r))) {
      await call(method, path, role).set('X-Role', 'ADMIN').send(body).expect(403);
    }
  }
});

test('TC-COM-01, TC-SEC-06: required fields, types, lengths, numeric boundaries and unknown fields are rejected', async () => {
  for (const field of Object.keys(product())) {
    const input = product(); delete input[field];
    await call('post', '/products').send(input).expect(400);
  }
  for (const changes of [{ name: ' ' }, { sku: [] }, { sku: 'X'.repeat(41) }, { name: 'X'.repeat(151) }, { status: 'INACTIVE' }, { role: 'ADMIN' }, { categoryId: {} }]) {
    await call('post', '/products').send(product(changes)).expect(400);
  }
  for (const field of ['sellingPriceMinor', 'minimumStock']) {
    for (const invalid of [-1, 1.5, '10', null, true, {}, Number.MAX_SAFE_INTEGER + 1]) {
      await call('post', '/products').send(product({ [field]: invalid })).expect(400);
    }
  }
  for (const body of [{}, { name: '' }, { name: ' '.repeat(4) }, { name: 7 }, { name: 'a'.repeat(81) }, { name: 'Valid', status: 'ACTIVE' }]) {
    await call('post', '/categories').send(body).expect(400);
  }
});

test('TC-PROD-02: normalized identifiers conflict on create/update, including inactive SKUs', async () => {
  const p = (await call('post', '/products').send(product({ sku: 'UNIQUE' })).expect(201)).body.product;
  await call('post', '/products').send(product({ sku: ' unique ' })).expect(409);
  const other = (await call('post', '/products').send(product()).expect(201)).body.product;
  await call('patch', `/products/${other._id}`).send({ sku: 'unique' }).expect(409);
  await call('delete', `/products/${p._id}`).expect(200);
  await call('post', '/products').send(product({ sku: 'unique' })).expect(409);
  await call('post', '/categories').send({ name: 'Electronics' }).expect(409);
  const c = await Category.create({ name: 'Conflicting category' });
  await call('patch', `/categories/${c._id}`).send({ name: 'Electronics' }).expect(409);
});

test('invalid/missing IDs and references return 400/404 without orphan stock', async () => {
  const count = await Product.countDocuments();
  await call('post', '/products').send(product({ categoryId: id() })).expect(404);
  assert.equal(await Product.countDocuments(), count);
  for (const path of ['/products', '/categories']) {
    await call('patch', `${path}/bad-id`).send({ name: 'Valid' }).expect(400);
    await call('patch', `${path}/${id()}`).send({ name: 'Valid' }).expect(404);
    await call('delete', `${path}/${id()}`).expect(404);
  }
  await call('get', `/products/${id()}`).expect(404);
  const p = (await call('post', '/products').send(product()).expect(201)).body.product;
  await call('patch', `/products/${p._id}`).send({ categoryId: id() }).expect(404);
  await call('patch', `/products/${p._id}`).send({ status: 'INACTIVE' }).expect(400);
  assert.equal((await Product.findById(p._id)).status, 'ACTIVE');
});

test('TC-PROD-06: deactivation retains stock/history and used categories cannot be deleted', async () => {
  const p = (await call('post', '/products').send(product()).expect(201)).body.product;
  const eventId = new mongoose.Types.ObjectId();
  await InventoryTransaction.create({ _id: eventId, sourceId: eventId, productId: p._id, changeQty: 0, sourceType: 'ADJUSTMENT', reason: 'Opening count', createdBy: admin._id });
  const result = await call('delete', `/products/${p._id}`).expect(200);
  assert.equal(result.body.product.status, 'INACTIVE');
  assert.ok(await Inventory.exists({ productId: p._id }));
  assert.ok(await InventoryTransaction.exists({ _id: eventId, productId: p._id }));
  await call('delete', `/products/${p._id}`).expect(200);
  await call('delete', `/categories/${category._id}`).expect(409);
  const unused = await Category.create({ name: 'Unused' });
  await call('delete', `/categories/${unused._id}`).expect(204);
  assert.equal(await Category.findById(unused._id), null);
});

test('product and stock creation roll back together when inventory creation fails', async () => {
  const stub = mock.method(Inventory, 'create', async () => { throw new Error('Forced inventory failure'); });
  try { await call('post', '/products').send(product({ sku: 'ROLLBACK' })).expect(500); }
  finally { stub.mock.restore(); }
  assert.equal(await Product.findOne({ sku: 'ROLLBACK' }), null);
});

test('concurrent category delete/reference creation never commits an orphan product', async () => {
  const c = await Category.create({ name: 'Concurrent category' });
  const [created, removed] = await Promise.all([
    call('post', '/products').send(product({ categoryId: String(c._id) })),
    call('delete', `/categories/${c._id}`),
  ]);
  assert.ok((created.status === 201 && removed.status === 409) || (created.status === 404 && removed.status === 204));
  if (created.status === 201) assert.ok(await Category.exists({ _id: c._id }));
});
