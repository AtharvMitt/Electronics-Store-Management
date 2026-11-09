import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { can, currentUser, logout } from './api.js';
import { StockAdjustments } from './StockAdjustments.jsx';
import { LoginForm } from './LoginForm.jsx';
import { UserList } from './UserList.jsx';
import { ProductCatalogue } from './ProductCatalogue.jsx';
import { InventoryListing } from './InventoryListing.jsx';
import { Sales } from './Sales.jsx';
import { Reports } from './Reports.jsx';
import { Suppliers } from './Suppliers.jsx';
import { Purchases } from './Purchases.jsx';
import './styles.css';

const ROLE_LABELS = { ADMIN: 'Administrator', INVENTORY: 'Inventory staff', PURCHASE: 'Purchase staff', SALES: 'Sales staff', MANAGER: 'Store manager' };

// Navigation follows the same permissions as the existing screens (SRS §13.1).
const MODULES = [
  { id: 'inventory', title: 'Inventory', description: 'Keep track of stock levels and record quantity adjustments.', permissions: ['inventory:view'], icon: 'M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4' },
  { id: 'products', title: 'Products', description: 'Maintain your product catalogue, pricing and categories.', permissions: ['products:view'], icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { id: 'suppliers', title: 'Suppliers', description: 'Manage the contacts behind your incoming stock.', permissions: ['suppliers:view'], icon: 'M3 21V7l9-4v18M12 9h9v12M7 8v1m0 3v1m0 3v1m9-4h1m-1 4h1M2 21h20' },
  { id: 'purchases', title: 'Purchases', description: 'Manage supplier orders and receive goods into inventory.', permissions: ['purchases:view'], icon: 'M9 4H5v17h14V4h-4M9 3h6v4H9zM8 12h8M8 16h5' },
  { id: 'sales', title: 'Sales', description: 'Record sales and find previous transactions in one place.', permissions: ['sales:view', 'sales:create'], icon: 'M3 3h2l3 12h11l3-8H6M9 20h.01M18 20h.01' },
  { id: 'reports', title: 'Reports', description: 'Review sales activity, inventory and replenishment needs.', permissions: ['reports:sales', 'reports:inventory'], icon: 'M4 3v18h17M8 16v-4M13 16V8M18 16V5' },
  { id: 'team', title: 'Team', description: 'View staff accounts and their assigned store roles.', permissions: ['users:view'], icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
];

function ModuleIcon({ path }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function Dashboard({ user }) {
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [supplierVersion, setSupplierVersion] = useState(0);
  const stockChanged = () => setInventoryVersion((version) => version + 1);
  const modules = MODULES.filter(({ permissions }) => permissions.some((permission) => can(user, permission)));
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const heading = useRef(null);
  const pageId = pathname.replace(/^\/|\/$/g, '');
  const active = pageId ? modules.find(({ id }) => id === pageId) : modules[0];

  useEffect(() => {
    const onHistoryChange = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onHistoryChange);
    return () => window.removeEventListener('popstate', onHistoryChange);
  }, []);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [pathname]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${active?.title ?? 'Page unavailable'} · TechZone`;
    return () => { document.title = previousTitle; };
  }, [active?.title]);

  function navigate(event, id) {
    // Preserve normal link behavior for new tabs and modified clicks.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const nextPath = `/${id}`;
    if (window.location.pathname !== nextPath) window.history.pushState(null, '', nextPath);
    setPathname(nextPath);
    window.scrollTo(0, 0);
  }

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <p className="sidebar-label">Workspace</p>
        <nav aria-label="Store sections" className="workspace-nav">
          {modules.map(({ id, title, icon }) => <a key={id} href={`/${id}`} aria-current={active?.id === id ? 'page' : undefined} aria-controls={`screen-${id}`} onClick={(event) => navigate(event, id)}>
            <ModuleIcon path={icon} /><span>{title}</span><span className="nav-arrow" aria-hidden="true">›</span>
          </a>)}
        </nav>
        <div className="sidebar-note"><span className="sidebar-label">Signed in as</span><p>{ROLE_LABELS[user.role] ?? user.role}</p><span>Your sections follow your assigned permissions.</span></div>
      </aside>
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <div className="workspace-heading">
          <p className="eyebrow">Store operations <span aria-hidden="true">/</span> {active?.title ?? 'Workspace'}</p>
          <h1 ref={heading} tabIndex={-1}>{active?.title ?? 'Page unavailable'}</h1>
          <p>{active?.description ?? 'Choose an available page from the navigation to continue.'}</p>
        </div>
        {/* Keep screens mounted: navigation must preserve drafts and pending retry keys. */}
        {modules.map(({ id, title }) => <div key={id} id={`screen-${id}`} hidden={active?.id !== id} className="workspace-screen" role="region" aria-label={`${title} workspace`}>
          {id === 'inventory' && <><InventoryListing refreshKey={inventoryVersion} /><StockAdjustments user={user} onInventoryChange={stockChanged} refreshKey={inventoryVersion} /></>}
          {id === 'products' && <ProductCatalogue user={user} />}
          {id === 'suppliers' && <Suppliers user={user} onSupplierChange={() => setSupplierVersion((version) => version + 1)} />}
          {id === 'purchases' && <Purchases user={user} supplierVersion={supplierVersion} onInventoryChange={stockChanged} />}
          {id === 'sales' && <Sales user={user} onInventoryChange={stockChanged} refreshKey={inventoryVersion} />}
          {id === 'reports' && <Reports user={user} refreshKey={inventoryVersion} />}
          {id === 'team' && <UserList roleLabels={ROLE_LABELS} />}
        </div>)}
      </main>
    </div>
  );
}

function App() {
  // undefined while checking the session, null when logged out.
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    currentUser().then(setUser).catch(() => { setUser(null); setError('The server is unavailable. Please try again shortly.'); });
  }, []);

  async function signOut() {
    try {
      await logout();
      setUser(null);
    } catch {
      setError('Logout failed. Please try again.');
    }
  }

  return (
    <div className="app-shell min-h-screen bg-paper font-sans text-forest">
      <a href={user ? '#workspace-content' : '#email'} className="skip-link">Skip to content</a>
      <header className="app-header">
        <a className="brand" href="/" aria-label="TechZone home"><span className="brand-mark">T<span aria-hidden="true">.</span></span><span>TechZone<span className="brand-caption">Electronics · Store management</span></span></a>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right sm:block">{user.name}<span className="block text-xs text-forest/60">{ROLE_LABELS[user.role] ?? user.role}</span></span>
            <button type="button" onClick={signOut} className="logout-button">Log out</button>
          </div>
        ) : (
          <span className="staff-label">Staff access</span>
        )}
      </header>
      {error && <p role="alert" className="app-error">{error}</p>}
      {user === undefined ? <p className="p-10 text-forest/60">Loading…</p>
        : user ? <Dashboard user={user} />
          : <LoginForm onLogin={(loggedIn) => { setError(''); setUser(loggedIn); }} />}
      <footer className="app-footer">TechZone Electronics<span>Internal store workspace</span></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
