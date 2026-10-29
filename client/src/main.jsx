import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const modules = [
    ['01', 'Products', 'Manage your catalogue and categories.'],
    ['02', 'Inventory', 'Track stock and replenishment needs.'],
    ['03', 'Purchases', 'Keep suppliers and incoming goods together.'],
    ['04', 'Sales & reports', 'Record sales and review store activity.'],
  ];

  return (
    <div className="min-h-screen bg-paper font-sans text-forest">
      <div className="mx-auto max-w-7xl px-6 sm:px-12">
      <header className="flex min-h-24 items-center justify-between gap-4 border-b border-forest/15">
        <a className="flex items-center gap-3 text-xl font-bold sm:text-2xl" href="/" aria-label="TechZone home"><span className="grid size-9 place-items-center rounded-lg bg-forest text-lime-200">T</span>TechZone<span className="ml-2 hidden border-l border-forest/20 pl-4 text-sm font-normal text-forest/60 sm:block">Store management</span></a>
        <span className="rounded-full border border-forest/20 px-3 py-2 text-[10px] whitespace-nowrap sm:text-xs">Team 9 · Development</span>
      </header>
      <main className="py-14 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.2em] text-forest/65">YOUR STORE, CONNECTED</p>
        <h1 className="my-7 text-4xl leading-[1.1] font-medium tracking-tight sm:text-6xl lg:text-7xl">A clearer view of<br />everyday operations.</h1>
        <p className="max-w-xl text-base leading-8 text-forest/65 sm:text-lg">One workspace for products, stock, purchases, and sales. Your team is preparing the first release.</p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(([number, title, description]) => (
            <article key={number} className="rounded-xl border border-forest/15 bg-white/70 p-6">
              <span className="text-xs text-forest/55">{number}</span>
              <h2 className="mt-7 mb-3 text-xl font-semibold">{title}</h2>
              <p className="min-h-12 text-sm leading-6 text-forest/65">{description}</p>
              <span className="mt-6 inline-block rounded bg-lime-100 px-2 py-1 text-xs text-forest/75">In development</span>
            </article>
          ))}
        </div>
      </main>
      <footer className="flex justify-between gap-5 border-t border-forest/15 py-6 text-xs text-forest/60">TechZone Electronics<span>Internal store workspace</span></footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
