import React, { useEffect, useState } from 'react';
import { can, suppliersApi } from './api.js';

const control = 'rounded border border-forest/25 bg-white px-3 py-2 disabled:opacity-50';
const empty = { name: '', contactName: '', phone: '', email: '', address: '', status: 'ACTIVE' };

export function Suppliers({ user, api = suppliersApi, onSupplierChange = () => {} }) {
  const [suppliers, setSuppliers] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.list().then((rows) => { if (active) setSuppliers(rows); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api]);

  async function load(filters = { search, status }) {
    setBusy(true); setError('');
    try { setSuppliers(await api.list(filters)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function mutate(operation, message, reset = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      if (reset) { setForm(empty); setEditing(null); }
      setNotice(message); onSupplierChange();
      try { setSuppliers(await api.list({ search, status })); }
      catch { setError('The supplier was saved, but the list could not be refreshed. Use Refresh suppliers.'); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6" aria-label="Suppliers">
    <h2 className="text-xl font-semibold">Suppliers</h2>
    <p className="mt-2 text-sm text-forest/65">Maintain supplier contacts. Deactivation preserves their purchase history.</p>
    {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="my-3">{notice}</p>}
    {can(user, 'suppliers:manage') && <form aria-label="Supplier form" className="my-6 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      if (!form.name.trim()) { setError('Supplier name is required.'); return; }
      mutate(() => api.save(editing, form), 'Supplier saved.', true);
    }}>
      <h3 className="w-full font-semibold">{editing ? 'Edit supplier' : 'Add supplier'}</h3>
      {[
        ['name', 'Supplier name', 150], ['contactName', 'Contact name', 100], ['phone', 'Phone', 30, 'tel'],
        ['email', 'Email', 254, 'email'], ['address', 'Address', 250],
      ].map(([field, label, maxLength, type = 'text']) => <label key={field} className="grid gap-1 text-sm">{label}<input className={control} type={type} maxLength={maxLength} required={field === 'name'} disabled={busy} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
      <label className="grid gap-1 text-sm">Status<select className={control} value={form.status} disabled={busy} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
      <button className={control} disabled={busy}>Save supplier</button>
      {editing && <button type="button" className={control} disabled={busy} onClick={() => { setForm(empty); setEditing(null); }}>Cancel supplier edit</button>}
    </form>}
    <form aria-label="Supplier filters" className="my-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); load(); }}>
      <label className="grid gap-1 text-sm">Search suppliers<input className={control} maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Supplier status<select className={control} value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All suppliers</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
      <button className={control} disabled={busy}>Filter suppliers</button>
      <button type="button" className={control} disabled={busy} onClick={() => { setSearch(''); setStatus('ALL'); load({}); }}>Clear supplier filters</button>
      <button type="button" className={control} disabled={busy} onClick={() => load()}>Refresh suppliers</button>
    </form>
    {!suppliers && !error && <p>Loading suppliers…</p>}
    {suppliers && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Supplier', 'Contact', 'Phone', 'Email', 'Address', 'Status', 'Actions'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {suppliers.map((supplier) => <tr className="border-t border-forest/10" key={supplier._id}>
        <td className="p-2">{supplier.name}</td><td>{supplier.contactName || '—'}</td><td>{supplier.phone || '—'}</td><td>{supplier.email || '—'}</td><td>{supplier.address || '—'}</td><td>{supplier.status}</td>
        <td>{can(user, 'suppliers:manage') && <div className="flex gap-2 py-2">
          <button className={control} disabled={busy} onClick={() => { setEditing(supplier._id); setForm(Object.fromEntries(Object.keys(empty).map((key) => [key, supplier[key] ?? empty[key]]))); }}>Edit supplier {supplier.name}</button>
          {supplier.status === 'ACTIVE' && <button className={control} disabled={busy} onClick={() => mutate(() => api.deactivate(supplier._id), 'Supplier deactivated. Purchase history retained.')}>Deactivate supplier {supplier.name}</button>}
        </div>}</td>
      </tr>)}
    </tbody></table></div>}
    {suppliers?.length === 0 && <p role="status" className="my-3">No suppliers match these filters.</p>}
  </section>;
}
