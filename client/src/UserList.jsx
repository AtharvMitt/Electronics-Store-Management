import React, { useEffect, useState } from 'react';
import { listUsers } from './api.js';

export function UserList({ roleLabels }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listUsers().then(setUsers).catch((failure) => setError(failure.message));
  }, []);

  return (
    <section className="mt-14 rounded-xl border border-forest/15 bg-white/70 p-6">
      <h2 className="text-xl font-semibold">Users</h2>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {!users && !error && <p className="mt-4 text-sm text-forest/60">Loading…</p>}
      {users && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-forest/60">
              <tr><th className="py-2 pr-4 font-medium">Name</th><th className="py-2 pr-4 font-medium">Email</th><th className="py-2 pr-4 font-medium">Role</th><th className="py-2 font-medium">Status</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-forest/10">
                  <td className="py-2 pr-4">{user.name}</td>
                  <td className="py-2 pr-4 text-forest/70">{user.email}</td>
                  <td className="py-2 pr-4">{roleLabels[user.role] ?? user.role}</td>
                  <td className="py-2">{user.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
