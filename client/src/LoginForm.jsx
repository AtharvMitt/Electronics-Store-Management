import React, { useState } from 'react';
import { login } from './api.js';

export function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      onLogin(await login(email, password));
    } catch (failure) {
      setError(failure.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-[70vh] place-items-center py-14">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-forest/15 bg-white/70 p-8" noValidate>
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="mt-2 text-sm text-forest/65">Use your TechZone staff account.</p>
        <label className="mt-8 block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-lg border border-forest/25 bg-white px-3 py-2 outline-none focus:border-forest" />
        <label className="mt-5 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-lg border border-forest/25 bg-white px-3 py-2 outline-none focus:border-forest" />
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy || !email || !password}
          className="mt-7 w-full rounded-lg bg-forest px-4 py-2.5 font-medium text-white disabled:opacity-50">
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
