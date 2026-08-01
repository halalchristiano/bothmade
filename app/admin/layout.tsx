'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  BarChart3,
  MessagesSquare,
  KanbanSquare,
  Search,
  Bell,
  LogOut,
  Menu,
  X,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, salesVisible: true },
  { href: '/admin/pipeline', label: 'Pipeline', icon: KanbanSquare, salesVisible: true },
  { href: '/admin/leads', label: 'Leads', icon: Users, salesVisible: true },
  { href: '/admin/clients', label: 'Clients', icon: Building2, salesVisible: false },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban, salesVisible: false },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, salesVisible: true },
  { href: '/admin/team-chat', label: 'Team Chat', icon: MessagesSquare, salesVisible: true },
  { href: '/admin/settings', label: 'Settings', icon: Settings, salesVisible: true },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`font-bold tracking-tight ${compact ? 'text-lg' : 'text-xl'}`}>
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

interface SearchResult {
  type: 'lead' | 'client' | 'project' | 'note';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const TYPE_LABELS: Record<SearchResult['type'], string> = {
  lead: 'Lead',
  client: 'Client',
  project: 'Project',
  note: 'Note',
};

function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) setResults(data.results);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full min-w-[280px] max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0812] shadow-2xl z-50">
          {results.length === 0 ? (
            <p className="text-white/30 text-sm p-4">No matches.</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onMouseDown={() => {
                  router.push(r.href);
                  onNavigate?.();
                }}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{r.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-white/30">{TYPE_LABELS[r.type]}</span>
                </div>
                {r.subtitle && <p className="text-xs text-white/40 mt-0.5">{r.subtitle}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: 'info' | 'warning' | 'urgent';
}

const SEVERITY_DOT: Record<NotificationItem['severity'], string> = {
  info: 'bg-sky-400',
  warning: 'bg-amber-400',
  urgent: 'bg-red-400',
};

function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch('/api/admin/notifications')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) setItems(data.items);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors text-white/60 hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {items.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-[9px] font-bold text-black px-1">
            {items.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0812] shadow-2xl z-50"
          >
            {items.length === 0 ? (
              <p className="text-white/30 text-sm p-4">You're all caught up.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onMouseDown={() => router.push(item.href)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex gap-2.5"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[item.severity]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-white/40 mt-0.5 truncate">{item.detail}</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    if (pathname === '/admin/login') return;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.type === 'user') {
          setUserName(data.user?.name || '');
          setUserRole(data.user?.role || '');
        }
      })
      .catch(() => {});
    fetch('/api/admin/team-messages/unread-count')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setUnreadCount(data.count);
      })
      .catch(() => {});
  }, [pathname]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const initials = (userName || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const visibleNavItems = NAV_ITEMS.filter((item) => userRole !== 'sales' || item.salesVisible);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Desktop sidebar — flat, sharp, no blur/gradient chrome */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-white/10 bg-black z-40">
        <Link href="/admin/dashboard" className="flex items-center gap-2.5 px-6 h-16 shrink-0 border-b border-white/10">
          <Logo />
        </Link>

        <div className="px-4 mt-4 mb-3">
          <SearchBox />
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const isChat = item.href === '/admin/team-chat';
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 pl-3 pr-3 py-2.5 border-l-2 text-sm font-medium transition-all ${
                  active
                    ? 'border-l-sky-400 text-white bg-white/[0.04]'
                    : 'border-l-transparent text-white/45 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon size={17} strokeWidth={2} className={active ? 'text-sky-300' : ''} />
                {item.label}
                {isChat && unreadCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded bg-sky-400 text-[10px] font-bold text-black px-1.5">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-sky-400/40 text-sky-300 text-xs font-bold shrink-0">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{userName || 'Team'}</p>
              <p className="text-xs text-white/35 capitalize">{userRole}</p>
            </div>
            <NotificationBell />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-2 mt-1 rounded-md text-sm text-white/40 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-50 border-b border-white/10 bg-black">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link href="/admin/dashboard">
            <Logo compact />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-white/10"
            >
              <div className="px-4 py-4 space-y-4">
                <SearchBox onNavigate={() => setMobileOpen(false)} />
                <nav className="space-y-1">
                  {visibleNavItems.map((item) => {
                    const active = pathname.startsWith(item.href);
                    const isChat = item.href === '/admin/team-chat';
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`relative flex items-center gap-3 pl-3 pr-3 py-3 border-l-2 text-sm font-medium transition-colors ${
                          active ? 'border-l-sky-400 text-white bg-white/[0.04]' : 'border-l-transparent text-white/50 hover:bg-white/[0.03] hover:text-white'
                        }`}
                      >
                        <Icon size={17} className={active ? 'text-sky-300' : ''} />
                        {item.label}
                        {isChat && unreadCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded bg-sky-400 text-[10px] font-bold text-black px-1.5">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-400/40 text-sky-300 text-[11px] font-bold">
                      {initials}
                    </span>
                    <span className="text-sm text-white/60">{userName}</span>
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors">
                    <LogOut size={14} />
                    Logout
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="lg:pl-64 relative">{children}</main>
    </div>
  );
}
