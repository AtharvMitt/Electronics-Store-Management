import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { can, currentUser, logout } from './api.js';
import { LoginForm } from './LoginForm.jsx';
import { UserList } from './UserList.jsx';
import './styles.css';

const ROLE_LABELS = { ADMIN: 'Administrator', INVENTORY: 'Inventory staff', PURCHASE: 'Purchase staff', SALES: 'Sales staff', MANAGER: 'Store manager' };

// Each action appears only for roles with its permission (SRS §13.1).
const MODULES = [
  ['01', 'Products', 'Manage your catalogue and categories.', [['products:create', 'Add products'], ['products:update', 'Edit products'], ['products:deactivate', 'Deactivate products']]],
  ['02', 'Inventory', 'Track stock and replenishment needs.', [['inventory:adjust', 'Adjust stock'], ['reports:inventory', 'Inventory reports']]],
  ['03', 'Purchases', 'Keep suppliers and incoming goods together.', [['suppliers:manage', 'Manage suppliers'], ['purchases:manage', 'Create purchase orders'], ['purchases:receive', 'Receive goods'], ['reports:purchases', 'Purchase reports']]],
  ['04', 'Sales & reports', 'Record sales and review store activity.', [['sales:create', 'Record sales'], ['reports:sales', 'Sales reports']]],
];

function Dashboard({ user }) {
  const modules = MODULES.map(([number, title, description, actions]) => [number, title, description, actions.filter(([permission]) => can(user, permission))]);

  return (
    <main className="py-14 sm:py-20">
      <p className="text-xs font-semibold tracking-[0.2em] text-forest/65">WELCOME, {user.name.toUpperCase()}</p>
      <h1 className="my-7 text-4xl leading-[1.1] font-medium tracking-tight sm:text-6xl lg:text-7xl">A clearer view of<br />everyday operations.</h1>
      <p className="max-w-xl text-base leading-8 text-forest/65 sm:text-lg">One workspace for products, stock, purchases, and sales. Your team is preparing the first release.</p>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map(([number, title, description, actions]) => (
          <article key={number} className="rounded-xl border border-forest/15 bg-white/70 p-6">
            <span className="text-xs text-forest/55">{number}</span>
            <h2 className="mt-7 mb-3 text-xl font-semibold">{title}</h2>
            <p className="min-h-12 text-sm leading-6 text-forest/65">{description}</p>
            <ul className="mt-4 space-y-1 text-sm">
              {actions.length ? actions.map(([permission, label]) => <li key={permission}>· {label}</li>) : <li className="text-forest/55">View only</li>}
            </ul>
            <span className="mt-6 inline-block rounded bg-lime-100 px-2 py-1 text-xs text-forest/75">In development</span>
          </article>
        ))}
      </div>
      {can(user, 'users:view') && <UserList roleLabels={ROLE_LABELS} />}
    </main>
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
    <div className="min-h-screen bg-paper font-sans text-forest">
      <div className="mx-auto max-w-7xl px-6 sm:px-12">
      <header className="flex min-h-24 items-center justify-between gap-4 border-b border-forest/15">
        <a className="flex items-center gap-3 text-xl font-bold sm:text-2xl" href="/" aria-label="TechZone home"><span className="grid size-9 place-items-center rounded-lg bg-forest text-lime-200">T</span>TechZone<span className="ml-2 hidden border-l border-forest/20 pl-4 text-sm font-normal text-forest/60 sm:block">Store management</span></a>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right sm:block">{user.name}<span className="block text-xs text-forest/60">{ROLE_LABELS[user.role] ?? user.role}</span></span>
            <button type="button" onClick={signOut} className="rounded-full border border-forest/25 px-4 py-2 hover:bg-forest hover:text-white">Log out</button>
          </div>
        ) : (
          <span className="rounded-full border border-forest/20 px-3 py-2 text-[10px] whitespace-nowrap sm:text-xs">Team 9 · Development</span>
        )}
      </header>
      {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {user === undefined ? <p className="py-20 text-forest/60">Loading…</p>
        : user ? <Dashboard user={user} />
          : <LoginForm onLogin={(loggedIn) => { setError(''); setUser(loggedIn); }} />}
      <footer className="flex justify-between gap-5 border-t border-forest/15 py-6 text-xs text-forest/60">TechZone Electronics<span>Internal store workspace</span></footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
