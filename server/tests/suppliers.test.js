import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User, Supplier } from '../src/database/models.js';
import { ROLES } from '../src/database/definitions.js';
import { hashPassword } from '../src/modules/shared/passwords.js';

const databaseName = `techzone_test_suppliers_${randomBytes(6).toString('hex')}`;
const app = createApp(), cookies = {};
const call = (method, path, role = 'PURCHASE') => request(app)[method](`/api/suppliers${path}`).set('Cookie', cookies[role]);

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Supplier tests require TEST_MONGODB_URI.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await applySchema(mongoose.connection.db);
  const password = randomBytes(18).toString('base64url'), passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    const user = await User.create({ name: role, email: `${role}@example.test`, passwordHash, role });
    const response = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(200);
    cookies[role] = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  }
});
after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-PUR-01, TC-PUR-02: required supplier fields, persisted contacts, updates and deactivation', async () => {
  const supplier = (await call('post', '').send({ name: '  Circuit Supply  ', contactName: 'Asha', phone: '+91 98765 43210', email: ' SALES@EXAMPLE.TEST ', address: 'Bengaluru' }).expect(201)).body.supplier;
  assert.equal(supplier.name, 'Circuit Supply'); assert.equal(supplier.email, 'sales@example.test');
  assert.equal((await call('get', `/${supplier._id}`, 'SALES').expect(200)).body.supplier.contactName, 'Asha');
  await call('patch', `/${supplier._id}`).send({ contactName: 'Ravi', email: '', address: 'New address' }).expect(200);
  assert.equal((await Supplier.findById(supplier._id)).contactName, 'Ravi');
  assert.equal((await Supplier.findById(supplier._id)).email, '');
  await call('delete', `/${supplier._id}`).expect(200);
  assert.equal((await Supplier.findById(supplier._id)).status, 'INACTIVE');
  await call('patch', `/${supplier._id}`, 'ADMIN').send({ status: 'ACTIVE' }).expect(200);
  assert.equal((await Supplier.findById(supplier._id)).status, 'ACTIVE');
  await call('post', '', 'ADMIN').send({ name: 'Name-only supplier' }).expect(201);
});

test('all supplier routes enforce authentication and the existing five-role matrix', async () => {
  const supplier = await Supplier.create({ name: 'Permissions supplier' });
  for (const [method, path, body] of [['get', '', undefined], ['get', `/${supplier._id}`, undefined], ['post', '', { name: 'Forbidden' }], ['patch', `/${supplier._id}`, { name: 'Forbidden' }], ['delete', `/${supplier._id}`, undefined]]) {
    await request(app)[method](`/api/suppliers${path}`).send(body).expect(401);
    for (const role of ROLES) {
      const permitted = method === 'get' || ['ADMIN', 'PURCHASE'].includes(role);
      const response = await call(method, path, role).send(body);
      assert.equal(response.status, permitted ? method === 'post' ? 201 : 200 : 403, `${role} ${method} ${path}`);
    }
  }
});

test('supplier validation rejects malformed fields, contacts, statuses and IDs without writes', async () => {
  const beforeCount = await Supplier.countDocuments();
  for (const body of [{}, { phone: '1234567' }, { name: ' ' }, { name: 12 }, { name: 'n'.repeat(151) }, { name: 'Bad', email: 'not-an-email' }, { name: 'Bad', phone: '123' }, { name: 'Bad', phone: '1234567ext' }, { name: 'Bad', status: 'DELETED' }, { name: 'Bad', role: 'ADMIN' }, { name: 'Bad', address: null }]) {
    await call('post', '').send(body).expect(400);
  }
  assert.equal(await Supplier.countDocuments(), beforeCount);
  await call('get', '/invalid').expect(400);
  await call('patch', `/${new mongoose.Types.ObjectId()}`).send({ name: 'Missing' }).expect(404);
  await call('get', `/${new mongoose.Types.ObjectId()}`).expect(404);
  await call('delete', `/${new mongoose.Types.ObjectId()}`).expect(404);
  await assert.rejects(Supplier.collection.insertOne({ _id: new mongoose.Types.ObjectId(), name: ' ', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() }), { code: 121 });
});

test('supplier search is literal, status filters clear, and invalid/empty results are handled', async () => {
  await Supplier.create({ name: 'Chip [A]', status: 'ACTIVE' });
  await Supplier.create({ name: 'Chip B', status: 'INACTIVE' });
  assert.equal((await call('get', '?search=%5BA%5D&status=ACTIVE').expect(200)).body.suppliers.length, 1);
  assert.equal((await call('get', '?search=Chip&status=INACTIVE').expect(200)).body.suppliers.length, 1);
  assert.equal((await call('get', '?search=does-not-exist').expect(200)).body.suppliers.length, 0);
  for (const query of ['?status=invalid', '?search[x]=a', '?status=ACTIVE&status=INACTIVE', '?extra=true', `?search=${'x'.repeat(101)}`]) await call('get', query).expect(400);
});
