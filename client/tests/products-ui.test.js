import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite, ProductCatalogue, dom, root, createRoot;
const admin = { permissions: ['products:view', 'products:create', 'products:update', 'products:deactivate'] };
const category = { _id: 'category-1', name: 'Audio' };
const product = { _id: 'product-1', sku: 'HEAD-1', name: 'Headphones', categoryId: category._id, sellingPriceMinor: 12345, minimumStock: 2, status: 'ACTIVE' };
const container = () => dom.window.document.getElementById('root');
const button = (label) => [...container().querySelectorAll('button')].find((b) => b.textContent === label);

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  ({ ProductCatalogue } = await vite.ssrLoadModule('/client/src/ProductCatalogue.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

async function mount(user, api) {
  root = createRoot(container());
  await act(async () => { root.render(React.createElement(ProductCatalogue, { user, api })); });
}
async function unmount() { await act(async () => root.unmount()); }
async function click(label) { assert.ok(button(label), `Missing button: ${label}`); await act(async () => button(label).click()); }

async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

test('create forms submit selected category and validated product values, then reload', async () => {
  let savedProduct, savedCategory, reads = 0;
  const api = {
    products: async () => { reads++; return []; }, categories: async () => [category],
    saveProduct: async (id, body) => { savedProduct = { id, body }; },
    saveCategory: async (id, body) => { savedCategory = { id, body }; },
  };
  await mount(admin, api);
  try {
    await enter(container().querySelector('[aria-label="Category form"] input'), 'New category');
    await act(async () => container().querySelector('[aria-label="Category form"]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(savedCategory, { id: null, body: { name: 'New category' } });
    const form = container().querySelector('[aria-label="Product form"]');
    const inputs = form.querySelectorAll('input');
    for (const [index, value] of ['NEW-1', 'New product', '10.09', '0'].entries()) await enter(inputs[index], value);
    await enter(form.querySelector('select'), category._id);
    await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(savedProduct, { id: null, body: { sku: 'NEW-1', name: 'New product', categoryId: category._id, sellingPriceMinor: 1009, minimumStock: 0 } });
    assert.equal(reads, 3);
    assert.equal(inputs[0].value, '');
  } finally { await unmount(); }
});

test('catalogue renders persisted values, hides restricted actions, and refreshes', async () => {
  let reads = 0;
  const api = { products: async () => { reads++; return [product]; }, categories: async () => [category] };
  await mount({ permissions: ['products:view'] }, api);
  try {
    assert.match(container().textContent, /Headphones/); assert.match(container().textContent, /123\.45/);
    assert.equal(container().querySelectorAll('form').length, 0);
    assert.equal(button('Deactivate HEAD-1'), undefined);
    await click('Refresh catalogue'); assert.equal(reads, 2);
  } finally { await unmount(); }
});

test('edit submits exact minor units and refreshes; category editing and deactivation are wired', async () => {
  let saved, renamed, deactivated = false;
  const api = {
    products: async () => [{ ...product, status: deactivated ? 'INACTIVE' : 'ACTIVE' }], categories: async () => [category],
    saveProduct: async (id, body) => { saved = { id, body }; },
    saveCategory: async (id, body) => { renamed = { id, body }; },
    deactivateProduct: async () => { deactivated = true; },
  };
  await mount(admin, api);
  try {
    await click('Edit HEAD-1');
    await act(async () => container().querySelector('[aria-label="Product form"]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(saved, { id: product._id, body: { sku: product.sku, name: product.name, categoryId: category._id, sellingPriceMinor: 12345, minimumStock: 2 } });
    assert.match(container().textContent, /Product saved/);
    await click('Edit category Audio');
    await act(async () => container().querySelector('[aria-label="Category form"]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(renamed, { id: category._id, body: { name: 'Audio' } });
    await click('Deactivate HEAD-1'); assert.equal(deactivated, true);
    assert.match(container().textContent, /INACTIVE/); assert.equal(button('Deactivate HEAD-1'), undefined);
  } finally { await unmount(); }
});

test('failed category deletion displays useful server feedback and retains catalogue data', async () => {
  const api = { products: async () => [product], categories: async () => [category], deleteCategory: async () => { throw new Error('Category is used by products and cannot be deleted.'); } };
  await mount(admin, api);
  try {
    await click('Delete category Audio');
    assert.match(container().querySelector('[role="alert"]').textContent, /used by products/);
    assert.ok(button('Delete category Audio')); assert.match(container().textContent, /Headphones/);
  } finally { await unmount(); }
});
