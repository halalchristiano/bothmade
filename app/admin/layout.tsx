'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/projects', label: 'Projects' },
];

function Logo() {
  return (
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
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-[#05030a] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-10">
            <Link href="/admin/dashboard" className="py-4">
              <Logo />
            </Link>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                      active
                        ? 'border-sky-400 text-white'
                        : 'border-transparent text-white/40 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
