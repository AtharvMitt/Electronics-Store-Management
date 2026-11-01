import React, { useEffect, useState } from 'react';
import { can, catalogue } from './api.js';

const emptyProduct = { sku: '', name: '', categoryId: '', sellingPrice: '', minimumStock: '0' };
const price = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
const inputClass = 'rounded border border-forest/25 bg-white px-3 py-2';
const buttonClass = 'rounded border border-forest/25 px-3 py-2 disabled:opacity-50';

export function ProductCatalogue({ user, api = catalogue }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState(emptyProduct);
  const [productId, setProductId] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryId, setCategoryId] = useState(null);

  async function refresh() {
    const [nextProducts, nextCategories] = await Promise.all([api.products(), api.categories()]);
    setProducts(nextProducts); setCategories(nextCategories); setLoaded(true);
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.products(), api.categories()]).then(([p, c]) => {
      if (active) { setProducts(p); setCategories(c); setLoaded(true); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api]);

  async function mutate(operation, message, reset = () => {}) {
    setBusy(true); setError(''); setNotice('');
    try {
      await operation(); reset(); setNotice(message);
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function saveProduct(event) {
    event.preventDefault();
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(product.sellingPrice);
    const sellingPriceMinor = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
    const minimumStock = product.minimumStock.trim() ? Number(product.minimumStock) : NaN;
    if (!Number.isSafeInteger(sellingPriceMinor) || !Number.isSafeInteger(minimumStock) || minimumStock < 0) {
      setError('Enter a valid selling price (up to two decimal places) and whole nonnegative minimum stock.'); return;
    }
    mutate(() => api.saveProduct(productId, {
      sku: product.sku, name: product.name, categoryId: product.categoryId, sellingPriceMinor, minimumStock,
    }), 'Product saved.', () => { setProduct(emptyProduct); setProductId(null); });
  }

  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Product catalogue">
      <h2 className="text-xl font-semibold">Products and categories</h2>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="my-3">{notice}</p>}
      {!loaded && !error && <p>Loading catalogue…</p>}
      <button className={`${buttonClass} my-3`} disabled={busy} onClick={() => mutate(async () => {}, 'Catalogue refreshed.')}>Refresh catalogue</button>
      {(productId ? can(user, 'products:update') : can(user, 'products:create')) && (
        <form onSubmit={saveProduct} aria-label="Product form" className="my-6 flex flex-wrap items-end gap-3">
          <h3 className="w-full font-semibold">{productId ? 'Edit product' : 'Add product'}</h3>
          {[
            ['sku', 'SKU', { maxLength: 40 }], ['name', 'Product name', { maxLength: 150 }],
            ['sellingPrice', 'Selling price', { type: 'number', min: '0', step: '0.01' }],
            ['minimumStock', 'Minimum stock', { type: 'number', min: '0', step: '1' }],
          ].map(([field, label, attributes]) => <label key={field} className="grid gap-1 text-sm">{label}<input className={inputClass} required disabled={busy} {...attributes} value={product[field]} onChange={(e) => setProduct({ ...product, [field]: e.target.value })} /></label>)}
          <label className="grid gap-1 text-sm">Category<select className={inputClass} required disabled={busy} value={product.categoryId} onChange={(e) => setProduct({ ...product, categoryId: e.target.value })}><option value="">Choose category</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
          <button className={buttonClass} disabled={busy || !categories.length}>Save product</button>
          {productId && <button type="button" className={buttonClass} disabled={busy} onClick={() => { setProductId(null); setProduct(emptyProduct); }}>Cancel product edit</button>}
        </form>
      )}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['SKU', 'Product', 'Category', 'Selling price', 'Minimum stock', 'Status', 'Actions'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
        {products.map((p) => <tr className="border-t border-forest/10" key={p._id}>
          <td className="p-2">{p.sku}</td><td>{p.name}</td><td>{categories.find((c) => c._id === p.categoryId)?.name || 'Unknown category'}</td><td>{price(p.sellingPriceMinor)}</td><td>{p.minimumStock}</td><td>{p.status}</td>
          <td className="flex gap-2 py-2">
            {can(user, 'products:update') && <button className={buttonClass} disabled={busy} onClick={() => { setProductId(p._id); setProduct({ sku: p.sku, name: p.name, categoryId: p.categoryId, sellingPrice: price(p.sellingPriceMinor), minimumStock: String(p.minimumStock) }); }}>Edit {p.sku}</button>}
            {can(user, 'products:deactivate') && p.status === 'ACTIVE' && <button className={buttonClass} disabled={busy} onClick={() => mutate(() => api.deactivateProduct(p._id), 'Product deactivated. Stock and history retained.')}>Deactivate {p.sku}</button>}
          </td>
        </tr>)}
      </tbody></table></div>
      {loaded && !products.length && <p className="my-3">No products yet.</p>}
      <h3 className="mt-8 font-semibold">Categories</h3>
      {(categoryId ? can(user, 'products:update') : can(user, 'products:create')) && <form aria-label="Category form" className="my-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); mutate(() => api.saveCategory(categoryId, { name: categoryName }), 'Category saved.', () => { setCategoryId(null); setCategoryName(''); }); }}>
        <label className="grid gap-1 text-sm">Category name<input className={inputClass} required maxLength={80} disabled={busy} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /></label>
        <button className={buttonClass} disabled={busy}>Save category</button>
        {categoryId && <button type="button" className={buttonClass} disabled={busy} onClick={() => { setCategoryId(null); setCategoryName(''); }}>Cancel category edit</button>}
      </form>}
      <ul className="space-y-2">{categories.map((c) => <li key={c._id} className="flex flex-wrap items-center gap-3"><span>{c.name}</span>
        {can(user, 'products:update') && <button className={buttonClass} disabled={busy} onClick={() => { setCategoryId(c._id); setCategoryName(c.name); }}>Edit category {c.name}</button>}
        {can(user, 'products:deactivate') && <button className={buttonClass} disabled={busy} onClick={() => mutate(() => api.deleteCategory(c._id), 'Category deleted.')}>Delete category {c.name}</button>}
      </li>)}</ul>
      {loaded && !categories.length && <p>Add a category before creating products.</p>}
    </section>
  );
}
