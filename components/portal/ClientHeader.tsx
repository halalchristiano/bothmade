'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { label: 'Projects', href: '/client/projects' },
  { label: 'Settings', href: '/client/settings' },
];

export function ClientHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasUnseenActivity, setHasUnseenActivity] = useState(false);

  useEffect(() => {
    if (pathname === '/client/settings') return;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.type === 'client' && data.client?.mustChangePassword) {
          router.push('/client/settings?force=1');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Aggregate "anything new across any project?" indicator on the Projects
  // nav link, so clients know to check in even from a page that isn't it.
  useEffect(() => {
    fetch('/api/client/projects')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.success) return;
        const unseen = (data.projects as Array<{
          id: string;
          updates: Array<{ createdAt: string }>;
          _count: { messages: number };
        }>).some((project) => {
          const lastVisit = Number(localStorage.getItem(`bothmade_last_visit_${project.id}`) || 0);
          const latestUpdateAt = project.updates[0]
            ? new Date(project.updates[0].createdAt).getTime()
            : 0;
          const hasNewUpdate = lastVisit > 0 && latestUpdateAt > lastVisit;

          const seenMessages = Number(
            localStorage.getItem(`bothmade_seen_messages_${project.id}`) || 0
          );
          const hasNewMessage = project._count.messages > seenMessages;

          return hasNewUpdate || hasNewMessage;
        });
        setHasUnseenActivity(unseen);
      })
      .catch(() => {});
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/client/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/client/projects" aria-label="Bothmade client portal">
          <span className="text-xl font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="text-transparent"
              style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
            >
              both
            </span>
            <span aria-hidden="true">made</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {LINKS.map((link) => {
            const current = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={`text-sm transition relative group py-1 ${
                  current ? 'text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {link.label}
                {link.href === '/client/projects' && hasUnseenActivity && (
                  <span
                    className="absolute -top-0.5 -right-2.5 h-1.5 w-1.5 rounded-full bg-emerald-400"
                    title="New activity"
                    aria-label="New activity"
                  />
                )}
                <span
                  className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-sky-400 to-purple-500 transition-all duration-300 ${
                    current ? 'w-full' : 'w-0 group-hover:w-full'
                  }`}
                />
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
