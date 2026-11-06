import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';

let dom, vite, InventoryListing, Sales, Reports, createRoot, root;
const category = { _id: 'cat-1', name: 'Audio' };
const baseStock = [
  { productId: 'p-1', sku: 'HEAD-1', name: 'Headphones', category: 'Audio', categoryId: 'cat-1', availableQty: 2, minimumStock: 2, lowStock: true },
  { productId: 'p-2', sku: 'CABLE-1', name: 'USB Cable', category: 'Accessories', categoryId: 'cat-2', availableQty: 8, minimumStock: 3, lowStock: false },
];
const box = () => dom.window.document.getElementById('root');
const button = (label) => [...box().querySelectorAll('button')].find((element) => element.textContent === label);

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  ({ InventoryListing } = await vite.ssrLoadModule('/client/src/InventoryListing.jsx'));
  ({ Sales } = await vite.ssrLoadModule('/client/src/Sales.jsx'));
  ({ Reports } = await vite.ssrLoadModule('/client/src/Reports.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
async function mount(Component, props) { root = createRoot(box()); await act(async () => root.render(React.createElement(Component, props))); }
async function unmount() { await act(async () => root.unmount()); }
async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function click(label) { assert.ok(button(label), `Missing button: ${label}`); await act(async () => button(label).click()); }

test('inventory search, category/low-stock filters, warnings and clear control use stored rows', async () => {
  const calls = [];
  const api = { list: async (filters = {}) => { calls.push(filters); return baseStock.filter((row) => (!filters.search || `${row.name} ${row.sku} ${row.category}`.toLowerCase().includes(filters.search.toLowerCase())) && (!filters.categoryId || row.categoryId === filters.categoryId) && (!filters.lowStockOnly || row.lowStock)); } };
  const categoriesApi = { categories: async () => [category] };
  await mount(InventoryListing, { api, categoriesApi });
  try {
    assert.match(box().textContent, /2.*Low stock/s); assert.match(box().textContent, /8.*In stock/s);
    await enter(box().querySelector('[aria-label="Inventory filters"] input:not([type])'), 'Cable');
    await enter(box().querySelector('select'), 'cat-1');
    await act(async () => box().querySelector('[aria-label="Inventory filters"]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(calls.at(-1), { search: 'Cable', categoryId: 'cat-1', lowStockOnly: false });
    assert.match(box().textContent, /No inventory records match/);
    await click('Clear filters');
    assert.deepEqual(calls.at(-1), {});
    assert.match(box().textContent, /Headphones/);
  } finally { await unmount(); }
});

test('sale form retries a committed request with the same idempotency key', async () => {
  let quantity = 3, created, submitted, changed = 0, attempts = 0;
  const keys = [];
  const inventory = { list: async () => [{ ...baseStock[0], availableQty: quantity, lowStock: quantity <= 2 }] };
  const api = {
    list: async () => created ? [created] : [],
    create: async (body, key) => {
      submitted = body; keys.push(key); attempts++;
      if (!created) { created = { _id: 'sale-1', transactionNumber: 'SALE-1', saleDate: new Date().toISOString(), totalMinor: 2500, items: [{ sku: 'HEAD-1', quantity: 1 }] }; quantity--; }
      if (attempts === 1) throw new Error('Network response lost after commit.');
      return { sale: created };
    },
  };
  await mount(Sales, { user: { permissions: ['sales:view', 'sales:create'] }, api, inventory, onInventoryChange: () => changed++ });
  try {
    const form = box().querySelector('[aria-label="Record sale item"]');
    await enter(form.querySelector('select'), 'p-1'); await enter(form.querySelector('input'), '1');
    await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await click('Record sale');
    assert.match(box().querySelector('[role="alert"]').textContent, /Network response lost/);
    await click('Record sale');
    assert.deepEqual(submitted, { items: [{ productId: 'p-1', quantity: 1 }] });
    assert.equal(keys[0], keys[1]);
    assert.equal(changed, 1); assert.match(box().textContent, /SALE-1/); assert.match(box().textContent, /Transaction history/);
  } finally { await unmount(); }
});

test('sales and inventory report filters, clearing, low-stock report and empty states are interactive', async () => {
  const calls = [], inventoryCalls = [], lowStockCalls = [];
  const api = {
    sales: async (filters = {}) => { calls.push(filters); return { sales: [], transactionCount: 0, totalMinor: 0, unitsSold: 0 }; },
    inventory: async (filters = {}) => { inventoryCalls.push(filters); return { inventory: [], productCount: 0, totalUnits: 0 }; },
    lowStock: async (filters = {}) => { lowStockCalls.push(filters); return { inventory: [], productCount: 0, totalUnits: 0 }; },
  };
  const categoriesApi = { categories: async () => [category] };
  const user = { permissions: ['reports:sales', 'reports:inventory'] };
  await mount(Reports, { user, api, categoriesApi });
  try {
    const form = box().querySelector('[aria-label="Sales report date filters"]');
    await enter(form.querySelector('input'), '2026-11-01'); await enter(form.querySelectorAll('input')[1], '2026-11-05');
    await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(calls.at(-1), { from: '2026-11-01', to: '2026-11-05' });
    assert.match(box().textContent, /No sales found for this date range/);
    await click('Clear dates'); assert.deepEqual(calls.at(-1), {});
    assert.match(box().textContent, /No inventory records match these filters/);
    const inventoryForm = box().querySelector('[aria-label="Inventory report filters"]');
    await enter(inventoryForm.querySelector('select'), category._id);
    await enter(inventoryForm.querySelectorAll('select')[1], 'INACTIVE');
    await enter(inventoryForm.querySelectorAll('select')[2], 'LOW_STOCK');
    await act(async () => inventoryForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(inventoryCalls.at(-1), { categoryId: category._id, status: 'INACTIVE', stockStatus: 'LOW_STOCK' });
    assert.deepEqual(lowStockCalls.at(-1), { categoryId: category._id });
    await click('Clear inventory filters');
    assert.deepEqual(inventoryCalls.at(-1), { status: 'ACTIVE', stockStatus: 'ALL' });
    assert.deepEqual(lowStockCalls.at(-1), {});
    assert.match(box().textContent, /No products are currently at or below minimum stock/);
  } finally { await unmount(); }
});
