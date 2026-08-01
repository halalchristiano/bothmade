'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ClientRow {
  id: string;
  email: string;
  company: string;
  phone: string | null;
  createdAt: string;
  projects: Array<{ id: string }>;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/clients');
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setClients(data.clients);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)
    );
  }, [clients, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Clients</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or company..."
          className="w-80 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Company</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Email</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Projects</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Joined</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id} className="border-b border-gray-100 last:border-0">
                <td className="px-6 py-4 font-medium">{client.company}</td>
                <td className="px-6 py-4 text-gray-600">{client.email}</td>
                <td className="px-6 py-4 text-gray-600">{client.projects.length}</td>
                <td className="px-6 py-4 text-gray-600">
                  {new Date(client.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="text-black font-semibold hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-600">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
