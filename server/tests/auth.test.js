import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import '../src/config/env.js';
import { createApp } from '../src/app.js';
import { applySchema } from '../src/database/setup.js';
import { Session, User } from '../src/database/models.js';
import { hashPassword } from '../src/modules/shared/passwords.js';

const databaseName = `techzone_test_auth_${randomBytes(6).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
const app = createApp();
const LOGIN_FAILED = { error: { message: 'Invalid email or password.' } };
const login = (agent, email, secret = password) => agent.post('/api/auth/login').send({ email, password: secret });

before(async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Configure TEST_MONGODB_URI; auth tests must run against MongoDB.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  await applySchema(mongoose.connection.db);
  const passwordHash = await hashPassword(password);
  for (const [login, role, status] of [['sales', 'SALES', 'ACTIVE'], ['admin', 'ADMIN', 'ACTIVE'], ['inactive', 'SALES', 'INACTIVE']]) {
    await User.create({ name: `${login} user`, email: `${login}@techzone.example.test`, passwordHash, role, status });
  }
});

after(async () => {
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('TC-AUTH-01: valid credentials start a session and return the user without secrets (FR-AUTH-001)', async () => {
  const agent = request.agent(app);
  const response = await login(agent, '  Sales@TechZone.example.test ').expect(200);
  assert.deepEqual(Object.keys(response.body.user).sort(), ['email', 'id', 'name', 'permissions', 'role']);
  assert.equal(response.body.user.role, 'SALES');
  const cookie = response.headers['set-cookie'].join(';');
  assert.match(cookie, /tz_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.email, 'sales@techzone.example.test');
});

test('sessions store only a hash of the token (SEC-002)', async () => {
  const response = await login(request(app), 'admin@techzone.example.test').expect(200);
  const token = /tz_session=([^;]+)/.exec(response.headers['set-cookie'].join(';'))[1];
  const sessions = await Session.find({ userId: response.body.user.id }).lean();
  assert.ok(sessions.length >= 1);
  assert.ok(sessions.every(({ tokenHash }) => tokenHash !== token && /^[a-f0-9]{64}$/.test(tokenHash)));
});

test('TC-AUTH-02: wrong passwords and unknown emails get the same rejection (FR-AUTH-002, SEC-008)', async () => {
  const wrong = await login(request(app), 'sales@techzone.example.test', 'not-the-password').expect(401, LOGIN_FAILED);
  const unknown = await login(request(app), 'nobody@techzone.example.test').expect(401, LOGIN_FAILED);
  assert.equal(wrong.headers['set-cookie'], undefined);
  assert.equal(unknown.headers['set-cookie'], undefined);
});

test('TC-AUTH-03: inactive accounts cannot log in (FR-AUTH-003, SEC-009)', async () => {
  const response = await login(request(app), 'inactive@techzone.example.test').expect(401, LOGIN_FAILED);
  assert.equal(response.headers['set-cookie'], undefined);
});

test('missing or malformed credentials are rejected before any lookup', async () => {
  for (const body of [{}, { email: 'sales@techzone.example.test' }, { email: ['x'], password }, { email: 'a@b.c', password: 'x'.repeat(129) }]) {
    await request(app).post('/api/auth/login').send(body).expect(400, { error: { message: 'Email and password are required.' } });
  }
});

test('protected endpoints require a valid session (SEC-001)', async () => {
  const unauthorized = { error: { message: 'Please log in to continue.' } };
  await request(app).get('/api/auth/me').expect(401, unauthorized);
  await request(app).get('/api/auth/me').set('Cookie', 'tz_session=forged-token').expect(401, unauthorized);
});

test('TC-AUTH-04: logout ends the session so the old token stops working (FR-AUTH-004)', async () => {
  const agent = request.agent(app);
  const response = await login(agent, 'sales@techzone.example.test').expect(200);
  const cookie = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  const before = await Session.countDocuments({ userId: response.body.user.id });
  const logout = await agent.post('/api/auth/logout').expect(204);
  assert.match(logout.headers['set-cookie'].join(';'), /tz_session=;/);
  assert.equal(await Session.countDocuments({ userId: response.body.user.id }), before - 1);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  await agent.post('/api/auth/logout').expect(204);
});

test('expired sessions are rejected even before MongoDB removes them', async () => {
  const response = await login(request(app), 'admin@techzone.example.test').expect(200);
  const cookie = /tz_session=[^;]+/.exec(response.headers['set-cookie'].join(';'))[0];
  await Session.updateMany({ userId: response.body.user.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});

test('deactivating a logged-in user ends their access (FR-AUTH-003)', async () => {
  const agent = request.agent(app);
  const response = await login(agent, 'sales@techzone.example.test').expect(200);
  await User.updateOne({ _id: response.body.user.id }, { $set: { status: 'INACTIVE' } });
  await agent.get('/api/auth/me').expect(401);
  assert.equal(await Session.countDocuments({ userId: response.body.user.id }), 0);
  await User.updateOne({ _id: response.body.user.id }, { $set: { status: 'ACTIVE' } });
});
