'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  timeline: string | null;
  createdAt: string;
  client: { company: string; email: string };
}

const STATUSES = ['all', 'discovery', 'design', 'build', 'launch', 'complete'];

export default function AdminProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
        const response = await fetch(`/api/admin/projects${query}`);
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setProjects(data.projects);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black capitalize"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s === 'all' ? 'All Statuses' : s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Project</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Client</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Timeline</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Created</th>
                <th className="px-6 py-3 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 font-medium">{project.name}</td>
                  <td className="px-6 py-4 text-gray-600">{project.client.company}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-1 bg-gray-100 rounded-full capitalize">
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{project.timeline || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-black font-semibold hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-600">
                    No projects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
