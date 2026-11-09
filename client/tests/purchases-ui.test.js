import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';

let dom, vite, Purchases, createRoot, root;
const supplier = { _id: 's-1', name: 'Circuit Supply', status: 'ACTIVE' };
const inactive = { _id: 's-2', name: 'Inactive supplier', status: 'INACTIVE' };
const product = { _id: 'p-1', sku: 'MOUSE-1', name: 'Wireless Mouse', status: 'ACTIVE' };
const base = () => ({ _id: 'po-1', orderNumber: 'PO-1', supplierId: supplier._id, supplierSnapshot: { name: supplier.name }, orderDate: '2026-11-08T00:00:00.000Z', status: 'ORDERED', totalMinor: 2598,
  items: [{ productId: product._id, sku: product.sku, name: product.name, orderedQty: 2, receivedQty: 0, unitCostMinor: 1299, lineTotalMinor: 2598 }] });
const box = () => dom.window.document.getElementById('root');
const manager = { permissions: ['purchases:view', 'purchases:manage', 'purchases:receive'] };
const dependencies = { suppliersApi: { list: async () => [supplier, inactive] }, productsApi: { products: async () => [product] } };
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ Purchases } = await vite.ssrLoadModule('/client/src/Purchases.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
async function mount(props) { root = createRoot(box()); await act(async () => root.render(React.createElement(Purchases, { ...dependencies, ...props }))); }
async function unmount() { await act(async () => root.unmount()); }
async function enter(element, value) {
  assert.ok(element, 'Field must exist');
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function submit(form) { await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); }
async function click(label) { const button = [...box().querySelectorAll('button')].find((element) => element.textContent === label); assert.ok(button, label); await act(async () => button.click()); }
async function prepareOrder() {
  await enter(box().querySelector('[aria-label="Purchase details"] select'), supplier._id);
  const form = box().querySelector('[aria-label="Purchase item form"]');
  await enter(form.querySelector('select'), product._id); await enter(form.querySelectorAll('input')[0], '2'); await enter(form.querySelectorAll('input')[1], '12.99'); await submit(form);
}

test('active supplier selection, exact order totals and lost-response receipt retries update stock once', async () => {
  let stored, submitted, actualReceipts = 0, notifications = 0, attempts = 0;
  const keys = [];
  const api = {
    list: async () => stored ? [structuredClone(stored)] : [],
    create: async (body) => { submitted = body; stored = base(); return { purchase: structuredClone(stored) }; },
    receive: async (_id, body, key) => {
      keys.push(key); attempts++;
      if (!actualReceipts) { stored.items[0].receivedQty += body.items[0].quantity; stored.status = 'PARTIAL'; actualReceipts++; }
      if (attempts === 1) throw new Error('Response lost after receipt commit.');
      return { purchase: structuredClone(stored), receipt: { _id: 'r-1', receivedAt: new Date().toISOString(), items: body.items } };
    },
  };
  await mount({ user: manager, api, onInventoryChange: () => notifications++ });
  try {
    const options = box().querySelector('[aria-label="Purchase details"] select').textContent;
    assert.match(options, /Circuit Supply/); assert.doesNotMatch(options, /Inactive supplier/);
    await prepareOrder(); assert.match(box().textContent, /Order total: 25.98/);
    await click('Save purchase'); assert.deepEqual(submitted.items, [{ productId: 'p-1', orderedQty: 2, unitCostMinor: 1299 }]); assert.equal(submitted.supplierId, 's-1'); assert.equal(notifications, 0);
    await enter(box().querySelector('[aria-label="Receive purchase"] input'), '1'); await submit(box().querySelector('[aria-label="Receive purchase"]'));
    assert.match(box().textContent, /Retry this receipt/); assert.equal(box().querySelector('[aria-label="Receive purchase"] input').disabled, true);
    await click('Retry receipt'); assert.equal(keys[0], keys[1]); assert.equal(actualReceipts, 1); assert.equal(notifications, 1);
    assert.match(box().querySelector('[aria-label="Purchase record"]').textContent, /PARTIAL/); assert.match(box().textContent, /Receipt saved/);
  } finally { await unmount(); }
});

test('a lost creation response locks the original order and retries its original idempotency key', async () => {
  let stored, attempts = 0; const keys = [], bodies = [];
  await mount({ user: manager, api: {
    list: async () => stored ? [stored] : [],
    create: async (body, key) => { attempts++; keys.push(key); bodies.push(body); stored ||= base(); if (attempts === 1) throw new Error('Connection lost.'); return { purchase: stored }; },
  } });
  try {
    await prepareOrder(); await click('Save purchase');
    assert.equal(box().querySelector('[aria-label="Purchase details"] select').disabled, true);
    await click('Retry purchase'); assert.equal(keys[0], keys[1]); assert.deepEqual(bodies[0], bodies[1]); assert.match(box().textContent, /Purchase PO-1 saved/);
  } finally { await unmount(); }
});

test('purchase history filters, clear actions and details remain available to view-only staff', async () => {
  const calls = [], purchase = base();
  await mount({ user: { permissions: ['purchases:view'] }, api: { list: async (filters = {}) => { calls.push(filters); return [purchase]; }, get: async () => ({ purchase, receipts: [] }) } });
  try {
    assert.equal(box().querySelector('[aria-label="Purchase item form"]'), null);
    const form = box().querySelector('[aria-label="Purchase history filters"]');
    await enter(form.querySelector('select'), inactive._id); await enter(form.querySelectorAll('input')[0], '2026-11-01'); await enter(form.querySelectorAll('input')[1], '2026-11-08'); await submit(form);
    assert.deepEqual(calls.at(-1), { supplierId: 's-2', from: '2026-11-01', to: '2026-11-08', status: '' });
    await click('Clear purchase filters'); assert.deepEqual(calls.at(-1), { supplierId: '', from: '', to: '', status: '' });
    await click('View purchase PO-1'); assert.match(box().textContent, /Supplier at order: Circuit Supply/); assert.equal(box().querySelector('[aria-label="Receive purchase"]'), null);
    assert.ok(![...box().querySelectorAll('button')].some((element) => /Edit purchase|Cancel order/.test(element.textContent)));
  } finally { await unmount(); }
});

test('over-receipt is rejected locally and a saved receipt with failed refresh never suggests resubmitting', async () => {
  let saved = 0, notifications = 0; const purchase = base();
  await mount({ user: manager, api: {
    list: async () => { if (saved) throw new Error('Read failed'); return [purchase]; }, get: async () => ({ purchase, receipts: [] }),
    receive: async (_id, body) => { saved++; return { purchase: { ...purchase, status: 'PARTIAL', items: [{ ...purchase.items[0], receivedQty: 1 }] }, receipt: { _id: 'r-1', receivedAt: new Date().toISOString(), items: body.items } }; },
  }, onInventoryChange: () => notifications++ });
  try {
    await click('View purchase PO-1'); let form = box().querySelector('[aria-label="Receive purchase"]');
    await enter(form.querySelector('input'), '3'); await submit(form); assert.equal(saved, 0); assert.match(box().textContent, /within the remaining order quantities/);
    await enter(form.querySelector('input'), '1'); await submit(form); assert.equal(saved, 1); assert.equal(notifications, 1);
    assert.match(box().querySelector('[role="alert"]').textContent, /operation was saved/);
    form = box().querySelector('[aria-label="Receive purchase"]'); assert.equal(form.querySelector('input').value, '');
    await click('Refresh purchases'); assert.equal(saved, 1);
  } finally { await unmount(); }
});

test('unreceived purchase editing and cancellation preserve exact line costs', async () => {
  let purchase = base(); const updates = [];
  const api = { list: async () => [purchase], update: async (id, body) => { updates.push({ id, body }); purchase = { ...purchase, ...body, items: body.items?.map((item, index) => ({ ...purchase.items[index], ...item })) || purchase.items }; return { purchase }; } };
  await mount({ user: manager, api });
  try {
    await click('Edit purchase PO-1'); assert.match(box().textContent, /Edit purchase order/); await click('Save purchase');
    assert.deepEqual(updates[0].body.items, [{ productId: 'p-1', orderedQty: 2, unitCostMinor: 1299 }]);
    await click('Cancel order PO-1'); assert.deepEqual(updates.at(-1), { id: 'po-1', body: { status: 'CANCELLED' } }); assert.match(box().textContent, /CANCELLED/);
  } finally { await unmount(); }
});

test('supplier changes refresh selectable contacts without clearing purchase history filters', async () => {
  const calls = []; let supplierRows = [supplier];
  const props = { ...dependencies, user: manager, suppliersApi: { list: async () => supplierRows }, api: { list: async (filters = {}) => { calls.push(filters); return []; } } };
  await mount(props);
  try {
    const form = box().querySelector('[aria-label="Purchase history filters"]'); await enter(form.querySelector('select'), supplier._id); await submit(form);
    supplierRows = [supplier, { _id: 's-3', name: 'New supplier', status: 'ACTIVE' }];
    await act(async () => root.render(React.createElement(Purchases, { ...props, supplierVersion: 1 })));
    assert.match(box().querySelector('[aria-label="Purchase details"] select').textContent, /New supplier/);
    assert.equal(form.querySelector('select').value, supplier._id); assert.equal(calls.at(-1).supplierId, supplier._id);
  } finally { await unmount(); }
});
