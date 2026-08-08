'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { projectHasUnseenActivity, type UnseenInput } from '@/lib/portal-unseen';

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
        const unseen = (data.projects as UnseenInput[]).some((project) =>
          projectHasUnseenActivity(project)
        );
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
          {/*
            `py-1` matches the nav links beside it, which have carried it all
            along. Without it this button measured 42×20 — the one control in
            the row under the 24px WCAG 2.5.8 asks for, and the odd one out in
            its own header.

            It is also the only way a client signs out, which is what makes 20
            pixels worth caring about rather than tidying: the moment it
            matters is somebody on a shared machine or a borrowed phone
            wanting to be signed out now, and a target you have to aim at is a
            poor thing to hand them.
          */}
          <button
            onClick={handleLogout}
            className="text-sm text-white/50 hover:text-white transition-colors py-1"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
