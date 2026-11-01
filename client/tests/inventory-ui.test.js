import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';

let dom, vite, StockAdjustments, createRoot, root;
const staff = { permissions: ['inventory:view', 'inventory:adjust'] };
const initial = [
  { productId: 'first', sku: 'FIRST', name: 'First product', availableQty: 3 },
  { productId: 'second', sku: 'SECOND', name: 'Second product', availableQty: 7 },
];
const container = () => dom.window.document.getElementById('root');
const button = (label) => [...container().querySelectorAll('button')].find((element) => element.textContent === label);
const quantity = (index) => container().querySelectorAll('tbody tr')[index].lastChild.textContent;

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  ({ StockAdjustments } = await vite.ssrLoadModule('/client/src/StockAdjustments.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
async function mount(user, api) {
  root = createRoot(container());
  await act(async () => root.render(React.createElement(StockAdjustments, { user, api })));
}
async function unmount() { await act(async () => root.unmount()); }
async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function fill(changeQty = '-2') {
  const form = container().querySelector('form');
  await enter(form.querySelector('select'), 'second');
  await enter(form.querySelectorAll('input')[0], changeQty);
  await enter(form.querySelectorAll('input')[1], ' Count correction ');
}
async function submit() {
  await act(async () => container().querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
}

test('authorized signed adjustment targets the selected product and survives component reload', async () => {
  let rows = initial.map((r) => ({ ...r })), saved;
  const api = {
    list: async () => rows,
    adjust: async (productId, body) => {
      saved = { productId, body };
      rows = rows.map((row) => row.productId === productId ? { ...row, availableQty: row.availableQty + body.changeQty } : row);
      return { inventory: rows.find((row) => row.productId === productId) };
    },
  };
  await mount(staff, api);
  try {
    await fill(); await submit();
    assert.deepEqual(saved, { productId: 'second', body: { changeQty: -2, reason: 'Count correction' } });
    assert.equal(quantity(0), '3'); assert.equal(quantity(1), '5');
    assert.match(container().querySelector('[role="status"]').textContent, /Adjustment saved/);
    assert.equal(container().querySelectorAll('form input')[0].value, '');
  } finally { await unmount(); }
  await mount(staff, api);
  try { assert.equal(quantity(1), '5'); }
  finally { await unmount(); }
});

test('view-only roles see inventory without an adjustment form', async () => {
  await mount({ permissions: ['inventory:view'] }, { list: async () => initial });
  try {
    assert.equal(container().querySelector('form'), null); assert.equal(quantity(1), '7');
    assert.ok(button('Refresh inventory'));
  } finally { await unmount(); }
});

test('invalid quantity is rejected locally and insufficient stock error retains entered data', async () => {
  let requests = 0;
  const api = { list: async () => initial, adjust: async () => { requests++; throw new Error('Insufficient stock for this change.'); } };
  await mount(staff, api);
  try {
    await fill('1.5'); await submit(); assert.equal(requests, 0);
    assert.match(container().querySelector('[role="alert"]').textContent, /signed whole quantity/);
    await fill('-8'); await submit(); assert.equal(requests, 1);
    assert.match(container().querySelector('[role="alert"]').textContent, /Insufficient stock/);
    assert.equal(container().querySelectorAll('form input')[0].value, '-8'); assert.equal(quantity(1), '7');
  } finally { await unmount(); }
});

test('successful write with failed refresh says saved and supports read retry without duplicate adjustment', async () => {
  let reads = 0, writes = 0;
  const api = {
    list: async () => { reads++; if (reads === 2) throw new Error('Network error'); return initial.map((row) => row.productId === 'second' && writes ? { ...row, availableQty: 8 } : row); },
    adjust: async () => { writes++; return { inventory: { availableQty: 8 } }; },
  };
  await mount(staff, api);
  try {
    await fill('1'); await submit();
    assert.equal(writes, 1); assert.equal(quantity(1), '8');
    assert.match(container().querySelector('[role="alert"]').textContent, /was saved/);
    await act(async () => button('Refresh inventory').click());
    assert.equal(writes, 1); assert.equal(container().querySelector('[role="alert"]'), null);
    assert.equal(quantity(1), '8');
  } finally { await unmount(); }
});
