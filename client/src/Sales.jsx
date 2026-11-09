import React, { useEffect, useState } from 'react';
import { can, inventoryApi, salesApi } from './api.js';

const control = 'rounded border border-forest/25 bg-white px-3 py-2';
const money = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
const newRequestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function Sales({ user, api = salesApi, inventory = inventoryApi, onInventoryChange = () => {}, refreshKey = 0 }) {
  const [stock, setStock] = useState([]);
  const [sales, setSales] = useState(null);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [items, setItems] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const [nextStock, nextSales] = await Promise.all([inventory.list(), api.list({ transactionNumber, from, to })]);
    setStock(nextStock); setSales(nextSales);
  }
  useEffect(() => {
    let active = true;
    Promise.all([inventory.list(), api.list()]).then(([nextStock, nextSales]) => { if (active) { setStock(nextStock); setSales(nextSales); } }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api, inventory, refreshKey]);
  function addItem(event) {
    event.preventDefault(); setError('');
    const product = stock.find((row) => row.productId === productId);
    const amount = Number(quantity);
    if (!product || !/^[1-9]\d*$/.test(quantity) || !Number.isSafeInteger(amount) || amount > product.availableQty) {
      setError('Choose a product and enter a positive whole quantity within available stock.'); return;
    }
    if (items.some((item) => item.productId === productId)) { setError('A product may appear only once in a sale.'); return; }
    setItems([...items, { productId, quantity: amount, name: product.name, sku: product.sku }]);
    setRequestId('');
    setProductId(''); setQuantity('1');
  }
  async function submit() {
    setError(''); setNotice('');
    if (!items.length) { setError('Add at least one product before recording the sale.'); return; }
    setBusy(true);
    try {
      const key = requestId || newRequestId();
      if (!requestId) setRequestId(key);
      const result = await api.create({ items: items.map(({ productId: id, quantity: amount }) => ({ productId: id, quantity: amount })) }, key);
      setNotice(`Sale ${result.sale.transactionNumber} recorded. Total: ${money(result.sale.totalMinor)}.`);
      setItems([]); setRequestId(''); onInventoryChange();
      try { await refresh(); } catch { setError('The sale was saved, but the lists could not be refreshed. Use Refresh sales.'); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Sales">
      <h2 className="text-xl font-semibold">Sales</h2>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="my-3">{notice}</p>}
      {can(user, 'sales:create') && <>
        <form className="my-4 flex flex-wrap items-end gap-3" aria-label="Record sale item" onSubmit={addItem}>
          <label className="grid gap-1 text-sm">Product<select className={control} required value={productId} disabled={busy} onChange={(event) => setProductId(event.target.value)}><option value="">Choose product</option>{stock.map((row) => <option key={row.productId} value={row.productId}>{row.sku} — {row.name} ({row.availableQty} available)</option>)}</select></label>
          <label className="grid gap-1 text-sm">Quantity<input className={control} type="number" min="1" step="1" required value={quantity} disabled={busy} onChange={(event) => setQuantity(event.target.value)} /></label>
          <button className={control} disabled={busy}>Add item</button>
        </form>
        {items.length > 0 && <div className="my-4"><ul className="space-y-2">{items.map((item) => <li key={item.productId} className="flex items-center gap-3">{item.sku} — {item.name} × {item.quantity}<button type="button" className={control} disabled={busy} onClick={() => { setItems(items.filter((line) => line.productId !== item.productId)); setRequestId(''); }}>Remove {item.sku}</button></li>)}</ul><button type="button" className={`${control} mt-3`} disabled={busy} onClick={submit}>Record sale</button></div>}
      </>}
      <h3 className="mt-7 font-semibold">Transaction history</h3>
      <button type="button" className={`${control} my-3`} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>Refresh sales</button>
      {!sales && !error && <p>Loading sales…</p>}
      {can(user, 'sales:view') && <form className="my-3 flex flex-wrap items-end gap-3" aria-label="Sales history filters" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>
        <label className="grid gap-1 text-sm">Transaction number<input className={control} maxLength={40} value={transactionNumber} onChange={(event) => setTransactionNumber(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">From<input className={control} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">To<input className={control} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className={control} disabled={busy}>Filter sales history</button>
        <button type="button" className={control} disabled={busy} onClick={() => { setTransactionNumber(''); setFrom(''); setTo(''); setBusy(true); setError(''); Promise.all([inventory.list(), api.list({})]).then(([nextStock, nextSales]) => { setStock(nextStock); setSales(nextSales); }).catch((failure) => setError(failure.message)).finally(() => setBusy(false)); }}>Clear history filters</button>
      </form>}
      {sales && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Transaction', 'Date', 'Items', 'Total'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
        {sales.map((sale) => <tr key={sale._id} className="border-t border-forest/10"><td className="p-2">{sale.transactionNumber}</td><td>{new Date(sale.saleDate).toLocaleString()}</td><td>{sale.items.map((item) => `${item.sku} × ${item.quantity}`).join(', ')}</td><td>{money(sale.totalMinor)}</td></tr>)}
      </tbody></table></div>}
      {sales?.length === 0 && <p role="status" className="my-3">{transactionNumber || from || to ? 'No sales match these history filters.' : 'No sales recorded yet.'}</p>}
    </section>
  );
}
