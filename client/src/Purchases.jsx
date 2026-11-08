import React, { useEffect, useState } from 'react';
import { can, catalogue, suppliersApi, purchasesApi } from './api.js';

const control = 'rounded border border-forest/25 bg-white px-3 py-2 disabled:opacity-50';
const money = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const requestKey = () => globalThis.crypto.randomUUID();
const statuses = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];
const emptyOrder = () => ({ supplierId: '', orderDate: today(), status: 'ORDERED', items: [] });
const emptyLine = { productId: '', orderedQty: '1', unitCost: '' };
const minorUnits = (text) => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  const value = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
  return Number.isSafeInteger(value) ? value : NaN;
};
const uncertain = (failure) => !failure.status || failure.status >= 500;

export function Purchases({ user, api = purchasesApi, suppliersApi: supplierApi = suppliersApi, productsApi = catalogue, supplierVersion = 0, onInventoryChange = () => {} }) {
  const [suppliers, setSuppliers] = useState([]), [products, setProducts] = useState([]), [purchases, setPurchases] = useState(null);
  const [order, setOrder] = useState(emptyOrder), [line, setLine] = useState(emptyLine), [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null), [receipts, setReceipts] = useState([]), [received, setReceived] = useState({});
  const [filters, setFilters] = useState({ supplierId: '', from: '', to: '', status: '' });
  const [pendingOrder, setPendingOrder] = useState(null), [pendingReceipt, setPendingReceipt] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const orderLocked = busy || Boolean(pendingOrder);

  useEffect(() => {
    let active = true;
    Promise.all([productsApi.products(), api.list()]).then(([nextProducts, nextPurchases]) => {
      if (active) { setProducts(nextProducts); setPurchases(nextPurchases); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api, productsApi]);
  useEffect(() => {
    let active = true;
    supplierApi.list().then((rows) => { if (active) setSuppliers(rows); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [supplierApi, supplierVersion]);

  async function load(nextFilters = filters) {
    setBusy(true); setError('');
    try {
      const [nextPurchases, nextSuppliers, nextProducts] = await Promise.all([api.list(nextFilters), supplierApi.list(), productsApi.products()]);
      setPurchases(nextPurchases); setSuppliers(nextSuppliers); setProducts(nextProducts);
    }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function savedRefresh(message) {
    setNotice(message);
    try { setPurchases(await api.list(filters)); }
    catch { setError('The purchase operation was saved, but history could not be refreshed. Use Refresh purchases.'); }
  }
  function addLine(event) {
    event.preventDefault(); setError('');
    const product = products.find((entry) => entry._id === line.productId && entry.status === 'ACTIVE');
    const orderedQty = Number(line.orderedQty), unitCostMinor = minorUnits(line.unitCost);
    if (!product || !/^[1-9]\d*$/.test(line.orderedQty) || !Number.isSafeInteger(orderedQty) || !Number.isSafeInteger(unitCostMinor)) {
      setError('Choose an active product, a positive whole quantity and a nonnegative cost with at most two decimals.'); return;
    }
    const newTotal = order.items.reduce((sum, item) => sum + item.orderedQty * item.unitCostMinor, 0) + orderedQty * unitCostMinor;
    if (!Number.isSafeInteger(newTotal)) { setError('Purchase total exceeds the supported monetary limit.'); return; }
    if (order.items.length >= 100 || order.items.some((item) => item.productId === product._id)) { setError('Use at most 100 distinct products in a purchase.'); return; }
    setOrder({ ...order, items: [...order.items, { productId: product._id, sku: product.sku, name: product.name, orderedQty, unitCostMinor }] }); setLine(emptyLine);
  }
  async function saveOrder() {
    setError(''); setNotice('');
    if (!pendingOrder && (!order.supplierId || !order.orderDate || !order.items.length)) { setError('Choose a supplier, order date and at least one item.'); return; }
    setBusy(true);
    try {
      let result;
      if (editing) result = await api.update(editing, { ...order, items: order.items.map(({ productId, orderedQty, unitCostMinor }) => ({ productId, orderedQty, unitCostMinor })) });
      else {
        const pending = pendingOrder || { key: requestKey(), body: { ...order, items: order.items.map(({ productId, orderedQty, unitCostMinor }) => ({ productId, orderedQty, unitCostMinor })) } };
        setPendingOrder(pending); result = await api.create(pending.body, pending.key);
      }
      setPendingOrder(null); setOrder(emptyOrder()); setEditing(null); setSelected(result.purchase); setReceipts([]); setReceived({});
      await savedRefresh(`Purchase ${result.purchase.orderNumber} saved. Stock changes only when goods are received.`);
    } catch (failure) {
      if (!uncertain(failure)) setPendingOrder(null);
      setError(`${failure.message}${!editing && uncertain(failure) ? ' Retry this purchase to confirm the result; its details are locked to prevent duplicates.' : ''}`);
    } finally { setBusy(false); }
  }
  async function viewPurchase(id) {
    setBusy(true); setError('');
    try { const result = await api.get(id); setSelected(result.purchase); setReceipts(result.receipts); setReceived({}); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function changeStatus(purchase, status) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.update(purchase._id, { status });
      if (selected?._id === purchase._id) setSelected(result.purchase);
      if (editing === purchase._id) { setEditing(null); setOrder(emptyOrder()); }
      await savedRefresh(`Purchase ${result.purchase.orderNumber} is ${result.purchase.status}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function receive(event) {
    event.preventDefault(); setError(''); setNotice('');
    let pending = pendingReceipt;
    if (!pending) {
      const entries = Object.entries(received).filter(([, value]) => value !== '');
      if (!entries.length || entries.some(([productId, value]) => {
        const item = selected.items.find((entry) => entry.productId === productId);
        return !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > item.orderedQty - item.receivedQty;
      })) { setError('Enter at least one positive whole received quantity within the remaining order quantities.'); return; }
      pending = { id: selected._id, key: requestKey(), body: { items: entries.map(([productId, quantity]) => ({ productId, quantity: Number(quantity) })) } };
    }
    setPendingReceipt(pending); setBusy(true);
    try {
      const result = await api.receive(pending.id, pending.body, pending.key);
      setPendingReceipt(null); setSelected(result.purchase); setReceived({});
      setReceipts((current) => [result.receipt, ...current.filter((receipt) => receipt._id !== result.receipt._id)]);
      onInventoryChange();
      await savedRefresh(`Receipt saved. Purchase is ${result.purchase.status}; stock increased by the quantities received.`);
    } catch (failure) {
      if (!uncertain(failure)) setPendingReceipt(null);
      setError(`${failure.message}${uncertain(failure) ? ' Retry this receipt to confirm the result; it will not increase stock twice.' : ''}`);
    } finally { setBusy(false); }
  }

  return <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Purchases">
    <h2 className="text-xl font-semibold">Purchases</h2>
    <p className="mt-2 text-sm text-forest/65">Create supplier orders, then record the quantities actually received.</p>
    {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="my-3">{notice}</p>}
    {can(user, 'purchases:manage') && <>
      <h3 className="mt-6 font-semibold">{editing ? 'Edit purchase order' : 'New purchase order'}</h3>
      <div className="my-4 flex flex-wrap items-end gap-3" aria-label="Purchase details">
        <label className="grid gap-1 text-sm">Supplier<select className={control} value={order.supplierId} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setOrder({ ...order, supplierId: event.target.value })}><option value="">Choose active supplier</option>{suppliers.filter((supplier) => supplier.status === 'ACTIVE' || (editing && supplier._id === order.supplierId)).map((supplier) => <option key={supplier._id} value={supplier._id} disabled={supplier.status !== 'ACTIVE'}>{supplier.name}{supplier.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Order date<input className={control} type="date" value={order.orderDate} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setOrder({ ...order, orderDate: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Order status<select className={control} value={order.status} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setOrder({ ...order, status: event.target.value })}><option value="ORDERED">Ordered</option><option value="DRAFT" disabled={Boolean(editing && purchases?.find((purchase) => purchase._id === editing)?.status === 'ORDERED')}>Draft</option></select></label>
      </div>
      {suppliers.every((supplier) => supplier.status !== 'ACTIVE') && <p className="my-3">Add an active supplier in Suppliers before creating a purchase.</p>}
      <form aria-label="Purchase item form" className="my-4 flex flex-wrap items-end gap-3" onSubmit={addLine}>
        <label className="grid gap-1 text-sm">Purchase product<select className={control} required value={line.productId} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setLine({ ...line, productId: event.target.value })}><option value="">Choose product</option>{products.filter((product) => product.status === 'ACTIVE').map((product) => <option key={product._id} value={product._id}>{product.sku} — {product.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Ordered quantity<input className={control} type="number" required min="1" step="1" value={line.orderedQty} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setLine({ ...line, orderedQty: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Unit cost<input className={control} type="number" required min="0" step="0.01" value={line.unitCost} disabled={orderLocked || Boolean(pendingReceipt)} onChange={(event) => setLine({ ...line, unitCost: event.target.value })} /></label>
        <button className={control} disabled={orderLocked || Boolean(pendingReceipt)}>Add purchase item</button>
      </form>
      {order.items.length > 0 && <div className="my-4"><ul className="space-y-2">{order.items.map((item) => <li className="flex flex-wrap items-center gap-3" key={item.productId}>{item.sku} — {item.name} × {item.orderedQty} at {money(item.unitCostMinor)} = {money(item.orderedQty * item.unitCostMinor)}<button type="button" className={control} disabled={orderLocked || Boolean(pendingReceipt)} onClick={() => setOrder({ ...order, items: order.items.filter((entry) => entry.productId !== item.productId) })}>Remove purchase item {item.sku}</button></li>)}</ul><p className="my-3 font-semibold">Order total: {money(order.items.reduce((total, item) => total + item.orderedQty * item.unitCostMinor, 0))}</p></div>}
      <button type="button" className={control} disabled={busy || Boolean(pendingReceipt)} onClick={saveOrder}>{pendingOrder ? 'Retry purchase' : 'Save purchase'}</button>
      {editing && <button type="button" className={`${control} ml-3`} disabled={busy} onClick={() => { setEditing(null); setOrder(emptyOrder()); }}>Cancel purchase edit</button>}
    </>}
    <h3 className="mt-8 font-semibold">Purchase history</h3>
    <form aria-label="Purchase history filters" className="my-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); load(); }}>
      <label className="grid gap-1 text-sm">Filter supplier<select className={control} value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}><option value="">All suppliers</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}{supplier.status === 'INACTIVE' ? ' (inactive)' : ''}</option>)}</select></label>
      {['from', 'to'].map((field) => <label key={field} className="grid gap-1 text-sm">{field === 'from' ? 'From' : 'To'}<input className={control} type="date" value={filters[field]} onChange={(event) => setFilters({ ...filters, [field]: event.target.value })} /></label>)}
      <label className="grid gap-1 text-sm">Purchase status<select className={control} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className={control} disabled={busy}>Filter purchases</button>
      <button type="button" className={control} disabled={busy} onClick={() => { const clear = { supplierId: '', from: '', to: '', status: '' }; setFilters(clear); load(clear); }}>Clear purchase filters</button>
      <button type="button" className={control} disabled={busy} onClick={() => load()}>Refresh purchases</button>
    </form>
    {!purchases && !error && <p>Loading purchases…</p>}
    {purchases && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Order', 'Supplier at order', 'Order date', 'Status', 'Total', 'Actions'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase._id} className="border-t border-forest/10">
      <td className="p-2">{purchase.orderNumber}</td><td>{purchase.supplierSnapshot.name}</td><td>{purchase.orderDate.slice(0, 10)}</td><td>{purchase.status}</td><td>{money(purchase.totalMinor)}</td>
      <td><div className="flex flex-wrap gap-2 py-2"><button className={control} disabled={busy || Boolean(pendingReceipt)} onClick={() => viewPurchase(purchase._id)}>View purchase {purchase.orderNumber}</button>
        {can(user, 'purchases:manage') && ['DRAFT', 'ORDERED'].includes(purchase.status) && <>
          <button className={control} disabled={busy || Boolean(pendingOrder) || Boolean(pendingReceipt)} onClick={() => { setEditing(purchase._id); setLine(emptyLine); setOrder({ supplierId: purchase.supplierId, orderDate: purchase.orderDate.slice(0, 10), status: purchase.status, items: purchase.items }); }}>Edit purchase {purchase.orderNumber}</button>
          {purchase.status === 'DRAFT' && <button className={control} disabled={busy || Boolean(pendingReceipt)} onClick={() => changeStatus(purchase, 'ORDERED')}>Place order {purchase.orderNumber}</button>}
          <button className={control} disabled={busy || Boolean(pendingReceipt)} onClick={() => changeStatus(purchase, 'CANCELLED')}>Cancel order {purchase.orderNumber}</button>
        </>}
      </div></td>
    </tr>)}</tbody></table></div>}
    {purchases?.length === 0 && <p role="status" className="my-3">No purchases match these filters.</p>}
    {selected && <div className="mt-8 border-t border-forest/15 pt-5" aria-label="Purchase record">
      <h3 className="font-semibold">Purchase {selected.orderNumber} — {selected.status}</h3>
      <button type="button" className={`${control} my-3`} disabled={busy || Boolean(pendingReceipt)} onClick={() => viewPurchase(selected._id)}>Refresh purchase details</button>
      <p className="my-2 text-sm">Supplier at order: {selected.supplierSnapshot.name}{selected.supplierSnapshot.contactName ? ` · ${selected.supplierSnapshot.contactName}` : ''}{selected.supplierSnapshot.email ? ` · ${selected.supplierSnapshot.email}` : ''}{selected.supplierSnapshot.phone ? ` · ${selected.supplierSnapshot.phone}` : ''}</p>
      {selected.supplierSnapshot.address && <p className="my-2 text-sm">{selected.supplierSnapshot.address}</p>}
      <div className="overflow-x-auto"><table className="my-4 w-full text-left text-sm"><thead><tr>{['Product at order', 'Ordered', 'Received', 'Remaining', 'Unit cost', 'Line total'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{selected.items.map((item) => <tr key={item.productId} className="border-t border-forest/10"><td className="p-2">{item.sku} — {item.name}</td><td>{item.orderedQty}</td><td>{item.receivedQty}</td><td>{item.orderedQty - item.receivedQty}</td><td>{money(item.unitCostMinor)}</td><td>{money(item.lineTotalMinor)}</td></tr>)}</tbody></table></div>
      {can(user, 'purchases:receive') && (pendingReceipt || ['ORDERED', 'PARTIAL'].includes(selected.status)) && <form aria-label="Receive purchase" noValidate className="my-4 flex flex-wrap items-end gap-3" onSubmit={receive}>
        <h4 className="w-full font-semibold">Record received goods</h4>
        {selected.items.filter((item) => item.receivedQty < item.orderedQty).map((item) => <label key={item.productId} className="grid gap-1 text-sm">Receive {item.sku} (remaining {item.orderedQty - item.receivedQty})<input className={control} type="number" min="1" max={item.orderedQty - item.receivedQty} step="1" value={received[item.productId] || ''} disabled={busy || Boolean(pendingReceipt)} onChange={(event) => setReceived({ ...received, [item.productId]: event.target.value })} /></label>)}
        <button className={control} disabled={busy}>{pendingReceipt ? 'Retry receipt' : 'Save receipt'}</button>
      </form>}
      <h4 className="mt-5 font-semibold">Receipt history</h4>
      {receipts.length ? <ul className="my-3 space-y-2 text-sm">{receipts.map((receipt) => <li key={receipt._id}>{new Date(receipt.receivedAt).toLocaleString()} · {receipt.items.map((item) => `${selected.items.find((line) => line.productId === item.productId)?.sku || 'Product'} × ${item.quantity}`).join(', ')}</li>)}</ul> : <p className="my-3 text-sm">No goods received yet.</p>}
    </div>}
  </section>;
}
