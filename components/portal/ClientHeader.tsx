'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { label: 'Projects', href: '/client/projects' },
  { label: 'Settings', href: '/client/settings' },
];

export function ClientHeader() {
  const pathname = usePathname();
  const router = useRouter();

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
