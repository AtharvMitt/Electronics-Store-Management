// Uses the installed Chrome/Chromium and ChromeDriver; no npm browser packages.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createServer } from 'vite';
import '../server/src/config/env.js';
import { createApp } from '../server/src/app.js';
import { seedDevelopment } from '../server/src/database/seed.js';
import { Product, Inventory, Purchase, Sale, InventoryTransaction } from '../server/src/database/models.js';

const databaseName = `techzone_test_browser_${randomBytes(6).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
const evidence = new URL('../docs/testing/evidence/', import.meta.url);
const base = 'http://127.0.0.1:9516';
const results = { executedAt: new Date().toISOString(), checks: [] };
let api, vite, driver, sessionId;
async function webdriver(method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok || payload.value?.error) throw new Error(`WebDriver ${path}: ${JSON.stringify(payload.value)}`);
  return payload.value;
}
const execute = (script, args = []) => webdriver('POST', `/session/${sessionId}/execute/sync`, { script, args });
async function until(script, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await execute(`return Boolean(${script});`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${message}`);
}
async function set(selector, value) {
  await execute(`const el = document.querySelector(arguments[0]); if (!el) throw new Error(arguments[0]);
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arguments[1]);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));`, [selector, value]);
}
async function click(text) {
  await execute(`const el = [...document.querySelectorAll('button, nav a')].find(e => (e.textContent.trim() === arguments[0] || (e.tagName === 'A' && e.querySelector('span')?.textContent === arguments[0])) && e.getClientRects().length); if (!el) throw new Error(arguments[0]); el.click();`, [text]);
}
async function check(name, run) {
  await run(); results.checks.push({ name, result: 'PASS' }); console.log(`PASS ${name}`);
}
try {
  assert.ok(process.env.TEST_MONGODB_URI, 'TEST_MONGODB_URI is required.');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await seedDevelopment({ password, environment: 'test' });
  api = createApp().listen(5001, '127.0.0.1');
  await new Promise((resolve, reject) => { api.once('listening', resolve); api.once('error', reject); });
  vite = await createServer({ root: fileURLToPath(new URL('../client/', import.meta.url)), configFile: fileURLToPath(new URL('../client/vite.config.js', import.meta.url)), server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5001' } } });
  await vite.listen();
  driver = spawn('chromedriver', ['--port=9516', '--allowed-ips=127.0.0.1'], { stdio: 'ignore' });
  driver.on('error', (error) => { console.error(error.message); });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await webdriver('GET', '/status'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  const session = await webdriver('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'chrome', 'goog:chromeOptions': { binary: process.env.QA_BROWSER_BINARY || '/usr/bin/chromium', args: ['--headless=new', '--disable-dev-shm-usage', '--window-size=1440,1000'] } } } });
  sessionId = session.sessionId;
  results.browser = session.capabilities.browserVersion;
  results.browserBinary = process.env.QA_BROWSER_BINARY || '/usr/bin/chromium';
  await webdriver('POST', `/session/${sessionId}/url`, { url: 'http://127.0.0.1:5174' });
  await check('TC-AUTH-01: browser login and role navigation', async () => {
    await until(`document.querySelector('#email')`, 'login form');
    await set('#email', 'admin@techzone.example.test'); await set('#password', password); await click('Log in');
    await until(`document.querySelector('nav[aria-label="Store sections"]')`, 'workspace');
    assert.equal(await execute(`return document.querySelector('h1').textContent;`), 'Inventory');
  });
  await check('TC-PUR-01, TC-COM-03: supplier form saves and refreshes purchase selection', async () => {
    await click('Suppliers');
    await set('[aria-label="Supplier form"] input', 'QA Browser Supplier'); await click('Save supplier');
    await until(`document.querySelector('#screen-suppliers [role="status"]')?.textContent.includes('Supplier saved')`, 'supplier confirmation');
    await click('Purchases');
    await until(`[...document.querySelector('[aria-label="Purchase details"] select').options].some(o => o.text === 'QA Browser Supplier')`, 'supplier selection');
  });
  const product = await Product.findOne({ sku: 'TZ-MOUSE-001' });
  await check('TC-PUR-03, TC-PUR-05, TC-PUR-06, TC-PUR-07: order and receipt update visible stock', async () => {
    const supplierId = await execute(`return [...document.querySelector('[aria-label="Purchase details"] select').options].find(o => o.text === 'QA Browser Supplier').value;`);
    await set('[aria-label="Purchase details"] select', supplierId);
    await set('[aria-label="Purchase item form"] select', String(product._id));
    await set('[aria-label="Purchase item form"] input[type="number"]', '2');
    await set('[aria-label="Purchase item form"] input[step="0.01"]', '10.00');
    await click('Add purchase item'); await click('Save purchase');
    await until(`document.querySelector('[aria-label="Receive purchase"]')`, 'receipt form');
    assert.equal((await Inventory.findOne({ productId: product._id })).availableQty, 25);
    assert.equal((await Purchase.findOne()).totalMinor, 2000);
    await set('[aria-label="Receive purchase"] input', '2'); await click('Save receipt');
    await until(`document.querySelector('[aria-label="Purchase record"] h3')?.textContent.includes('RECEIVED')`, 'received order');
    assert.equal((await Inventory.findOne({ productId: product._id })).availableQty, 27);
    await click('Inventory');
    await until(`[...document.querySelectorAll('[aria-label="Inventory listing"] tbody tr')].some(r => r.cells[0].textContent === 'TZ-MOUSE-001' && r.cells[3].textContent === '27')`, 'inventory stock 27');
  });
  await check('TC-SALE-01, TC-SALE-04, TC-SALE-05: browser sale updates inventory and reports', async () => {
    await click('Sales');
    await until(`document.querySelector('[aria-label="Record sale item"] select')?.textContent.includes('27 available')`, 'sale stock refresh');
    await set('[aria-label="Record sale item"] select', String(product._id));
    await set('[aria-label="Record sale item"] input', '2'); await click('Add item'); await click('Record sale');
    await until(`document.querySelector('#screen-sales [role="status"]')?.textContent.includes('recorded. Total: 2598.00')`, 'sale confirmation');
    assert.equal((await Sale.findOne()).totalMinor, 259800);
    assert.equal((await Inventory.findOne({ productId: product._id })).availableQty, 25);
    await click('Inventory');
    await until(`[...document.querySelectorAll('[aria-label="Inventory listing"] tbody tr')].some(r => r.cells[0].textContent === 'TZ-MOUSE-001' && r.cells[3].textContent === '25')`, 'stock 25');
    await click('Reports');
    await until(`document.querySelector('#screen-reports')?.textContent.includes('2598.00')`, 'sales report total');
    const events = await InventoryTransaction.find({ productId: product._id }).lean();
    assert.equal(events.reduce((sum, row) => sum + row.changeQty, 0), 25);
  });
  await check('TC-COM-04: browser search empty state and clear', async () => {
    await click('Inventory'); await set('[aria-label="Inventory filters"] input', 'DOES-NOT-EXIST'); await click('Apply filters');
    await until(`document.querySelector('[aria-label="Inventory listing"]')?.textContent.includes('No inventory records match')`, 'empty state');
    await click('Clear filters');
    await until(`document.querySelectorAll('[aria-label="Inventory listing"] tbody tr').length === 4`, 'clear filters');
  });
  await check('TC-NFR-06: Chromium mobile-width navigation smoke (partial browser matrix)', async () => {
    await webdriver('POST', `/session/${sessionId}/window/rect`, { width: 390, height: 844 });
    await click('Purchases');
    assert.equal(await execute(`return document.querySelector('h1').textContent;`), 'Purchases');
    await click('Inventory');
    assert.equal(await execute(`return document.querySelector('h1').textContent;`), 'Inventory');
  });
  await check('TC-AUTH-04: browser logout removes workspace', async () => {
    await click('Log out'); await until(`document.querySelector('#email')`, 'logout');
    assert.equal(await execute(`return document.querySelector('nav[aria-label="Store sections"]');`), null);
  });
} catch (error) {
  results.checks.push({ name: 'Browser execution', result: 'FAIL', error: error.message });
  console.error(error); process.exitCode = 1;
} finally {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(new URL('browser-results.json', evidence), JSON.stringify(results, null, 2) + '\n');
  if (sessionId) await webdriver('DELETE', `/session/${sessionId}`).catch(() => {});
  driver?.kill();
  await vite?.close();
  if (api) await new Promise((resolve) => api.close(resolve));
  if (mongoose.connection.db?.databaseName === databaseName) await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}
