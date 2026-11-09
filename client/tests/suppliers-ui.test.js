import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';

let dom, vite, Suppliers, createRoot, root;
const box = () => dom.window.document.getElementById('root');
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  ({ Suppliers } = await vite.ssrLoadModule('/client/src/Suppliers.jsx'));
});
after(async () => { await vite?.close(); dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function click(label) { const button = [...box().querySelectorAll('button')].find((element) => element.textContent === label); assert.ok(button, label); await act(async () => button.click()); }
async function submit(form) { await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); }
async function mount(props) { root = createRoot(box()); await act(async () => root.render(React.createElement(Suppliers, props))); }

test('supplier creation/edit/deactivation use stored contacts and notify the purchase selector', async () => {
  let rows = [], changes = 0;
  const api = {
    list: async () => rows,
    save: async (id, body) => { rows = [{ ...body, _id: id || 'supplier-1' }]; },
    deactivate: async () => { rows = rows.map((row) => ({ ...row, status: 'INACTIVE' })); },
  };
  await mount({ user: { permissions: ['suppliers:view', 'suppliers:manage'] }, api, onSupplierChange: () => changes++ });
  try {
    const form = box().querySelector('[aria-label="Supplier form"]');
    await enter(form.querySelectorAll('input')[0], 'Circuit Supply'); await enter(form.querySelectorAll('input')[1], 'Asha');
    await submit(form); assert.match(box().textContent, /Supplier saved/); assert.match(box().textContent, /Asha/);
    await click('Edit supplier Circuit Supply'); await enter(form.querySelectorAll('input')[1], 'Ravi'); await submit(form);
    assert.equal(rows[0].contactName, 'Ravi');
    await click('Deactivate supplier Circuit Supply'); assert.match(box().textContent, /INACTIVE/); assert.equal(changes, 3);
  } finally { await act(async () => root.unmount()); }
});

test('supplier filters and empty states work for view-only users without management controls', async () => {
  const calls = [];
  await mount({ user: { permissions: ['suppliers:view'] }, api: { list: async (filters = {}) => { calls.push(filters); return []; } } });
  try {
    assert.equal(box().querySelector('[aria-label="Supplier form"]'), null);
    const filters = box().querySelector('[aria-label="Supplier filters"]');
    await enter(filters.querySelector('input'), 'Circuit'); await enter(filters.querySelector('select'), 'ACTIVE'); await submit(filters);
    assert.deepEqual(calls.at(-1), { search: 'Circuit', status: 'ACTIVE' }); assert.match(box().textContent, /No suppliers match/);
    await click('Clear supplier filters'); assert.deepEqual(calls.at(-1), {});
  } finally { await act(async () => root.unmount()); }
});

test('a committed supplier write with failed refresh is reported as saved without resubmission', async () => {
  let saved = 0;
  await mount({ user: { permissions: ['suppliers:manage'] }, api: {
    list: async () => { if (saved) throw new Error('Refresh failed'); return []; }, save: async () => { saved++; },
  } });
  try {
    const form = box().querySelector('[aria-label="Supplier form"]'); await enter(form.querySelector('input'), 'Supplier'); await submit(form);
    assert.match(box().querySelector('[role="alert"]').textContent, /supplier was saved/); assert.equal(form.querySelector('input').value, '');
    await click('Refresh suppliers'); assert.equal(saved, 1);
  } finally { await act(async () => root.unmount()); }
});
