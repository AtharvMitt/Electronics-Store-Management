import React, { useEffect, useState } from 'react';
import { can, catalogue, reportsApi } from './api.js';

const control = 'rounded border border-forest/25 bg-white px-3 py-2';
const money = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

export function Reports({ user, api = reportsApi, categoriesApi = catalogue, refreshKey = 0 }) {
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [productStatus, setProductStatus] = useState('ACTIVE');
  const [stockStatus, setStockStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refreshSales(filters = { from, to }) {
    const result = await api.sales(filters); setSales(result);
  }
  async function refreshInventory(filters = { categoryId, status: productStatus, stockStatus }) {
    const [result, alerts] = await Promise.all([api.inventory(filters), api.lowStock({ categoryId })]);
    setInventory(result); setLowStock(alerts);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      can(user, 'reports:sales') ? api.sales() : Promise.resolve(null),
      can(user, 'reports:inventory') ? Promise.all([api.inventory(), api.lowStock(), categoriesApi.categories()]) : Promise.resolve([null, null, []]),
    ]).then(([saleReport, [inventoryReport, lowStockReport, nextCategories]]) => {
      if (active) { setSales(saleReport); setInventory(inventoryReport); setLowStock(lowStockReport); setCategories(nextCategories); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api, categoriesApi, user, refreshKey]);
  async function runSales(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await refreshSales(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Reports">
      <h2 className="text-xl font-semibold">Reports</h2>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      {can(user, 'reports:sales') && <div className="mt-5">
        <h3 className="font-semibold">Sales report</h3>
        <form className="my-3 flex flex-wrap items-end gap-3" aria-label="Sales report date filters" onSubmit={runSales}>
          <label className="grid gap-1 text-sm">From<input className={control} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="grid gap-1 text-sm">To<input className={control} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button className={control} disabled={busy}>Apply dates</button>
          <button type="button" className={control} disabled={busy} onClick={() => { setFrom(''); setTo(''); setBusy(true); setError(''); refreshSales({}).catch((failure) => setError(failure.message)).finally(() => setBusy(false)); }}>Clear dates</button>
        </form>
        {sales && <>
          <p className="my-3 text-sm">{sales.transactionCount} transactions · {sales.unitsSold} units sold · Total {money(sales.totalMinor)}</p>
          {sales.sales.length === 0 ? <p role="status">No sales found for this date range.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Transaction', 'Date', 'Items', 'Total'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{sales.sales.map((sale) => <tr key={sale._id} className="border-t border-forest/10"><td className="p-2">{sale.transactionNumber}</td><td>{new Date(sale.saleDate).toLocaleString()}</td><td>{sale.items.map((item) => `${item.sku} × ${item.quantity}`).join(', ')}</td><td>{money(sale.totalMinor)}</td></tr>)}</tbody></table></div>}
        </>}
      </div>}
      {can(user, 'reports:inventory') && <div className="mt-8">
        <h3 className="font-semibold">Current inventory report</h3>
        <form className="my-3 flex flex-wrap items-end gap-3" aria-label="Inventory report filters" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await refreshInventory(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>
          <label className="grid gap-1 text-sm">Category<select className={control} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Product status<select className={control} value={productStatus} onChange={(event) => setProductStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All statuses</option></select></label>
          <label className="grid gap-1 text-sm">Stock status<select className={control} value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="ALL">All stock statuses</option><option value="LOW_STOCK">Low stock</option><option value="IN_STOCK">In stock</option></select></label>
          <button className={control} disabled={busy}>Apply inventory filters</button>
          <button type="button" className={control} disabled={busy} onClick={() => { setCategoryId(''); setProductStatus('ACTIVE'); setStockStatus('ALL'); setBusy(true); setError(''); Promise.all([api.inventory({ status: 'ACTIVE', stockStatus: 'ALL' }), api.lowStock({})]).then(([result, alerts]) => { setInventory(result); setLowStock(alerts); }).catch((failure) => setError(failure.message)).finally(() => setBusy(false)); }}>Clear inventory filters</button>
          <button type="button" className={control} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refreshInventory(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>Refresh inventory report</button>
        </form>
        {inventory && <>
          <p className="my-3 text-sm">{inventory.productCount} products · {inventory.totalUnits} units available</p>
          {inventory.inventory.length === 0 ? <p role="status">No inventory records match these filters.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['SKU', 'Product', 'Category', 'Available', 'Minimum', 'Product status', 'Stock status'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{inventory.inventory.map((row) => <tr className="border-t border-forest/10" key={row.productId}><td className="p-2">{row.sku}</td><td>{row.name}</td><td>{row.category}</td><td>{row.availableQty}</td><td>{row.minimumStock}</td><td>{row.productStatus}</td><td>{row.stockStatus}</td></tr>)}</tbody></table></div>}
        </>}
        <h3 className="mt-7 font-semibold">Low-stock report</h3>
        {lowStock && (lowStock.inventory.length === 0 ? <p role="status" className="my-3">No products are currently at or below minimum stock.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['SKU', 'Product', 'Category', 'Available', 'Minimum', 'Stock status'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{lowStock.inventory.map((row) => <tr className="border-t border-forest/10" key={row.productId}><td className="p-2">{row.sku}</td><td>{row.name}</td><td>{row.category}</td><td>{row.availableQty}</td><td>{row.minimumStock}</td><td>{row.stockStatus}</td></tr>)}</tbody></table></div>)}
      </div>}
    </section>
  );
}
