import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

const app = createApp();
after(disconnectDatabase);

test('liveness works without a database, while readiness reports unavailable', async () => {
  await request(app).get('/api/health').expect(200, { status: 'ok' });
  await request(app).get('/api/ready').expect(503, { status: 'unavailable' });
});

test('configuration rejects missing database configuration and invalid ports', () => {
  assert.throws(() => readConfig({}), /MONGODB_URI/);
  assert.throws(() => readConfig({ MONGODB_URI: 'mongodb://localhost/test', PORT: 'abc' }), /PORT/);
});

test('readiness checks an actual MongoDB connection', async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Set TEST_MONGODB_URI in .env (see .env.example).');
  await connectDatabase(process.env.TEST_MONGODB_URI);
  await request(app).get('/api/ready').expect(200, { status: 'ready' });
  await disconnectDatabase();
  await request(app).get('/api/ready').expect(503);
});

test('unknown routes and invalid JSON have consistent errors', async () => {
  await request(app).get('/api/missing').expect(404, { error: { message: 'Route not found.' } });
  const response = await request(app).post('/api/missing').set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(response.body.error.message, 'Invalid request.');
});
