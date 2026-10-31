import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { User } from '../src/database/models.js';
import { ROLES } from '../src/database/definitions.js';
import { PERMISSIONS, can, requirePermission } from '../src/modules/auth/permissions.js';
import { requireAuth } from '../src/modules/auth/sessions.js';
import { hashPassword } from '../src/modules/shared/passwords.js';

const databaseName = `techzone_test_permissions_${randomBytes(6).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
const app = createApp();
const DENIED = { error: { message: 'You do not have permission to do this.' } };
const ALL_PERMISSIONS = [...new Set(Object.values(PERMISSIONS).flat())];
const email = (role) => `${role.toLowerCase()}@techzone.example.test`;
const cookies = {};

async function loginAs(role) {
  const response = await request(app).post('/api/auth/login').send({ email: email(role), password }).expect(200);
  return /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
}

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; permission tests must run against MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const passwordHash = await hashPassword(password);
  for (const role of ROLES) await User.create({ name: `${role} user`, email: email(role), passwordHash, role, status: 'ACTIVE' });
  for (const role of ROLES) cookies[role] = await loginAs(role);
});

after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('every defined role has an agreed permission set matching SRS §13.1', () => {
  assert.deepEqual(Object.keys(PERMISSIONS).sort(), [...ROLES].sort());
  // [permission, roles allowed] read from the SRS matrix.
  const matrix = [
    ['users:manage', ['ADMIN']],
    ['users:view', ['ADMIN', 'MANAGER']],
    ['products:create', ['ADMIN', 'INVENTORY']],
    ['products:update', ['ADMIN', 'INVENTORY']],
    ['products:deactivate', ['ADMIN']],
    ['products:view', ROLES],
    ['inventory:view', ROLES],
    ['inventory:adjust', ['ADMIN', 'INVENTORY']],
    ['suppliers:manage', ['ADMIN', 'PURCHASE']],
    ['suppliers:view', ROLES],
    ['purchases:manage', ['ADMIN', 'PURCHASE']],
    ['purchases:receive', ['ADMIN', 'PURCHASE']],
    ['purchases:view', ROLES],
    ['sales:create', ['ADMIN', 'SALES']],
    ['sales:view', ROLES],
    ['reports:inventory', ['ADMIN', 'INVENTORY', 'MANAGER']],
    ['reports:purchases', ['ADMIN', 'PURCHASE', 'MANAGER']],
    ['reports:sales', ['ADMIN', 'SALES', 'MANAGER']],
  ];
  assert.deepEqual(matrix.map(([permission]) => permission).sort(), [...ALL_PERMISSIONS].sort());
  for (const [permission, allowed] of matrix) {
    for (const role of ROLES) assert.equal(can({ role }, permission), allowed.includes(role), `${role} ${permission}`);
  }
  assert.equal(can({ role: 'UNKNOWN' }, 'products:view'), false);
  assert.equal(can(undefined, 'products:view'), false);
});

test('TC-SEC-03: the backend allows or rejects each permission per role (FR-AUTH-007, FR-AUTH-008, SEC-003)', async () => {
  // A stand-in for future feature routes, guarded exactly as they will be.
  // Paths use indexes because Express would read the ":" in a permission name as a route parameter.
  const guarded = express();
  ALL_PERMISSIONS.forEach((permission, index) => {
    guarded.post(`/api/check/${index}`, requireAuth, requirePermission(permission), (_req, res) => res.json({ permission }));
  });
  guarded.use((error, _req, res, _next) => res.status(error.status).json({ error: { message: error.message } }));
  for (const role of ROLES) {
    for (const [index, permission] of ALL_PERMISSIONS.entries()) {
      const call = request(guarded).post(`/api/check/${index}`).set('Cookie', cookies[role]);
      if (PERMISSIONS[role].includes(permission)) await call.expect(200, { permission });
      else await call.expect(403, DENIED);
    }
  }
});

test('guards reject unknown permission names when routes are defined', () => {
  assert.throws(() => requirePermission('users:delete-everything'), /Unknown permission/);
});

test('the user list is limited to roles that may view users', async () => {
  for (const role of ['ADMIN', 'MANAGER']) {
    const response = await request(app).get('/api/users').set('Cookie', cookies[role]).expect(200);
    assert.equal(response.body.users.length, ROLES.length);
    assert.ok(response.body.users.every((user) => !('passwordHash' in user)));
  }
  for (const role of ['INVENTORY', 'PURCHASE', 'SALES']) {
    await request(app).get('/api/users').set('Cookie', cookies[role]).expect(403, DENIED);
  }
  await request(app).get('/api/users').expect(401);
});

test('TC-SEC-04: client-supplied role data cannot raise permissions (SEC-004)', async () => {
  await request(app).get('/api/users?role=ADMIN').set('Cookie', cookies.SALES).set('X-Role', 'ADMIN').expect(403, DENIED);
  const me = await request(app).get('/api/auth/me').set('Cookie', cookies.SALES).expect(200);
  assert.equal(me.body.user.role, 'SALES');
  assert.deepEqual(me.body.user.permissions, PERMISSIONS.SALES);
});

test('role changes apply on the next request without logging in again', async () => {
  const sales = await User.findOne({ role: 'SALES' });
  await User.updateOne({ _id: sales._id }, { $set: { role: 'MANAGER' } });
  await request(app).get('/api/users').set('Cookie', cookies.SALES).expect(200);
  await User.updateOne({ _id: sales._id }, { $set: { role: 'SALES' } });
  await request(app).get('/api/users').set('Cookie', cookies.SALES).expect(403);
});
