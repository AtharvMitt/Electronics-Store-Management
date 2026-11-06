import React, { useEffect, useState } from 'react';
import { inventoryApi, catalogue } from './api.js';

const control = 'rounded border border-forest/25 bg-white px-3 py-2';

export function InventoryListing({ api = inventoryApi, categoriesApi = catalogue, refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(filters = { search, categoryId, lowStockOnly }) {
    setBusy(true); setError('');
    try { setRows(await api.list(filters)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.list(), categoriesApi.categories()]).then(([inventory, nextCategories]) => {
      if (active) { setRows(inventory); setCategories(nextCategories); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api, categoriesApi, refreshKey]);

  function clear() {
    setSearch(''); setCategoryId(''); setLowStockOnly(false);
    load({});
  }

  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Inventory listing">
      <h2 className="text-xl font-semibold">Inventory</h2>
      <p className="mt-2 text-sm text-forest/65">Search by product name, SKU, or category. Quantities are read from stored inventory.</p>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      <form className="my-4 flex flex-wrap items-end gap-3" aria-label="Inventory filters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label className="grid gap-1 text-sm">Search<input className={control} maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Category<select className={control} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} />Low stock only</label>
        <button className={control} disabled={busy}>Apply filters</button>
        <button type="button" className={control} disabled={busy} onClick={clear}>Clear filters</button>
        <button type="button" className={control} disabled={busy} onClick={() => load()}>Refresh inventory</button>
      </form>
      {!rows && !error && <p>Loading inventory…</p>}
      {rows && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['SKU', 'Product', 'Category', 'Available quantity', 'Minimum stock', 'Status'].map((name) => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>
        {rows.map((row) => <tr className="border-t border-forest/10" key={row.productId}><td className="p-2">{row.sku}</td><td>{row.name}</td><td>{row.category}</td><td>{row.availableQty}</td><td>{row.minimumStock}</td><td>{row.lowStock ? <span role="status" className="font-semibold text-red-800">Low stock</span> : 'In stock'}</td></tr>)}
      </tbody></table></div>}
      {rows?.length === 0 && <p className="my-4" role="status">{lowStockOnly ? 'No products are currently at or below their minimum stock threshold.' : 'No inventory records match these filters.'}</p>}
    </section>
  );
}
