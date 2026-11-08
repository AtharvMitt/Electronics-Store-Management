import React, { useEffect, useState } from 'react';
import { can, inventoryApi } from './api.js';

const inputClass = 'rounded border border-forest/25 bg-white px-3 py-2';
const buttonClass = 'rounded border border-forest/25 px-3 py-2 disabled:opacity-50';

export function StockAdjustments({ user, api = inventoryApi, onInventoryChange = () => {}, refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [productId, setProductId] = useState('');
  const [changeQty, setChangeQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api.list().then((next) => { if (active) setRows(next); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api, refreshKey]);

  async function reload() {
    setBusy(true); setError('');
    try { setRows(await api.list()); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!productId || !/^[+-]?\d+$/.test(changeQty) || !Number.isSafeInteger(Number(changeQty)) || !reason.trim()) {
      setError('Choose a product, enter a signed whole quantity change and give a reason.'); return;
    }
    setBusy(true);
    try {
      const result = await api.adjust(productId, { changeQty: Number(changeQty), reason: reason.trim() });
      onInventoryChange();
      setRows((current) => current?.map((row) => row.productId === productId ? { ...row, availableQty: result.inventory.availableQty } : row));
      setNotice(`Adjustment saved. Available quantity: ${result.inventory.availableQty}.`);
      setChangeQty(''); setReason('');
      // The write has committed. A failed refresh must not suggest resubmitting it.
      try { setRows(await api.list()); }
      catch { setError('The adjustment was saved, but inventory could not be refreshed. Use Refresh inventory.'); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Stock adjustments">
      <h2 className="text-xl font-semibold">Stock quantities</h2>
      <p className="mt-2 text-sm text-forest/65">Current quantities for active products. Record corrections with a reason.</p>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="my-3">{notice}</p>}
      <button className={`${buttonClass} my-3`} disabled={busy} onClick={reload}>Refresh inventory</button>
      {!rows && !error && <p>Loading inventory…</p>}
      {can(user, 'inventory:adjust') && <form className="my-6 flex flex-wrap items-end gap-3" aria-label="Stock adjustment form" onSubmit={submit}>
        <label className="grid gap-1 text-sm">Product<select className={inputClass} required disabled={busy} value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Choose product</option>{rows?.map((row) => <option key={row.productId} value={row.productId}>{row.sku} — {row.name} ({row.availableQty} available)</option>)}</select></label>
        <label className="grid gap-1 text-sm">Quantity change<input className={inputClass} required type="number" step="1" disabled={busy} value={changeQty} onChange={(e) => setChangeQty(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Reason<input className={inputClass} required maxLength={250} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className={buttonClass} disabled={busy || !rows?.length}>Save adjustment</button>
        <p className="w-full text-sm text-forest/65">Use a positive change to add stock or a negative change to remove stock. Zero records a count confirmation.</p>
      </form>}
      {rows && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">SKU</th><th>Product</th><th>Available quantity</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t border-forest/10" key={row.productId}><td className="py-2">{row.sku}</td><td>{row.name}</td><td>{row.availableQty}</td></tr>)}</tbody></table></div>}
      {rows?.length === 0 && <p>No active inventory records. Create products through the catalogue or use the documented development seed.</p>}
    </section>
  );
}
