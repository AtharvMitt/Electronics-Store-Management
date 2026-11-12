import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { currentUser, login, logout, inventoryApi, purchasesApi } from '../src/api.js';

afterEach(() => mock.restoreAll());

test('TC-AUTH-01, TC-AUTH-04: API client sends login JSON and accepts an empty logout response', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/logout') ? new Response(null, { status: 204 }) : Response.json({ user: { id: 'staff', role: 'PURCHASE' } });
  });
  assert.deepEqual(await login('staff@example.test', 'synthetic test input'), { id: 'staff', role: 'PURCHASE' });
  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'staff@example.test', password: 'synthetic test input' });
  assert.equal(await logout(), null);
  assert.equal(calls[1].options.method, 'POST');
});

test('TC-COM-02: API client preserves actionable errors and handles malformed error bodies', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Supplier name is required.' } }, { status: 400 }));
  await assert.rejects(purchasesApi.create({ items: [] }, 'test-key'), { message: 'Supplier name is required.', status: 400 });
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(inventoryApi.list(), { message: 'Something went wrong. Please try again.', status: 503 });
});

test('TC-SEC-01: only an unauthenticated response is treated as a signed-out session', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  assert.equal(await currentUser(), null);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 500 }));
  await assert.rejects(currentUser(), { status: 500 });
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(currentUser(), /Network unavailable/);
});

test('TC-NFR-03, TC-PUR-09: filters are escaped and receipt retries keep the supplied key', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json({ inventory: [], purchases: [] }); });
  assert.deepEqual(await inventoryApi.list({ search: 'USB & Cable', lowStockOnly: false, categoryId: '', unused: null }), []);
  assert.equal(calls[0].url, '/api/inventory?search=USB+%26+Cable');
  await purchasesApi.list({ supplierId: 'supplier-1', from: '2026-11-01', status: '' });
  assert.equal(calls[1].url, '/api/purchases?supplierId=supplier-1&from=2026-11-01');
  const body = { items: [{ productId: 'product-1', quantity: 2 }] };
  await purchasesApi.receive('order-1', body, 'stable-retry-key');
  await purchasesApi.receive('order-1', body, 'stable-retry-key');
  for (const call of calls.slice(2)) {
    assert.equal(call.url, '/api/purchases/order-1/receipts');
    assert.equal(call.options.headers['Idempotency-Key'], 'stable-retry-key');
    assert.deepEqual(JSON.parse(call.options.body), body);
  }
});
