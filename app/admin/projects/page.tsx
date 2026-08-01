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
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent capitalize transition-colors"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize bg-[#05030a]">
                {s === 'all' ? 'All Statuses' : s}
              </option>
            ))}
          </select>
          <Link
            href="/admin/projects/new"
            className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Project
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-white/10">
              <tr>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Project</th>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Client</th>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Status</th>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Timeline</th>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Created</th>
                <th className="px-6 py-3 text-sm font-semibold text-white/40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium">{project.name}</td>
                  <td className="px-6 py-4 text-white/50">{project.client.company}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 capitalize">
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/50">{project.timeline || '—'}</td>
                  <td className="px-6 py-4 text-white/50">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-sky-300 font-semibold hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/40">
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
