'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Search, Bell, LogOut, Menu, X, Command } from 'lucide-react';
import { ADMIN_NAV_ITEMS, groupSections, type NavItem } from '@/lib/admin-nav';
import { Wordmark } from '@/components/Wordmark';
import { useAdminPoll } from '@/lib/use-admin-poll';
import { SendGuard } from '@/components/admin/SendGuard';
import { useBodyScrollLock } from '@/components/admin/Modal';

/*
 * The shell, take three.
 *
 * Take two stripped the brand out of the dashboard on purpose — and
 * overshot: the ground drifted to a neutral black the marketing site never
 * uses, the wordmark lost its wireframe stroke, and nothing gradient
 * remained except a notification badge. This take re-grounds the whole
 * admin on the brand ink (bg-ink), renders the one true Wordmark, gives the
 * nav section headers the marketing site's mono-kicker voice at low volume,
 * and reserves the sky-to-purple gradient for exactly one element per
 * screen: the active nav item. Restraint is the brand; absence wasn't.
 */

/**
 * Who is signed in, fetched once by the layout and shared — pages used to
 * each refetch /api/auth/me with their own fallback. Both people see the
 * same admin now (the owner's call), so the role only labels the account;
 * it no longer gates navigation.
 */
export const AdminSessionContext = createContext<{
  userName: string;
  userRole: string;
  /**
   * Who is signed in, by id.
   *
   * Team chat needs this to know which bubbles are yours, and it was fetching
   * /api/auth/me a second time to find out — so for the first moment after a
   * load, and forever if that one request failed, your own messages rendered
   * on the wrong side of the thread under someone else's name. The layout has
   * already asked; there is no reason to ask twice.
   */
  userId: string;
}>({
  userName: '',
  userRole: '',
  userId: '',
});

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

function NavLinks({
  items,
  pathname,
  unreadCount,
  compact = false,
}: {
  items: NavItem[];
  pathname: string;
  unreadCount: number;
  /** The sidebar's tighter rows; the mobile sheet wants a bigger tap target. */
  compact?: boolean;
}) {
  return (
    <>
      {groupSections(items).map((group) => (
        <div key={group.section || 'top'} className={group.section ? 'pt-5' : ''}>
          {group.section && (
            // Matched to Kicker. 0.4em mono caps is a texture rather than a
            // label — at that spacing the word stops being read and starts
            // being looked at, which is a strange thing to ask of a signpost.
            <p className="px-3 pb-2 text-2xs font-medium uppercase tracking-[0.16em] text-white/25">
              {group.section}
            </p>
          )}
          <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href);
              const isChat = item.href === '/admin/team-chat';
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-3 rounded-lg pl-3 pr-3 text-sm transition-[background-color,color] duration-150 ease-ui ${
                    compact ? 'py-2.5' : 'py-3'
                  } ${
                    active
                      ? 'bg-white/[0.06] font-medium text-white shadow-e1'
                      : 'font-normal text-white/45 hover:bg-white/[0.03] hover:text-white/85'
                  }`}
                >
                  {/* The one gradient element per screen. */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-sky-400 to-purple-500"
                    />
                  )}
                  {/* Lighter stroke on the resting rows: a column of sixteen
                      icons at full weight is a wall of pictograms competing
                      with the labels beside them. The current one thickens,
                      which is another way of saying which one you are on. */}
                  <Icon
                    size={17}
                    strokeWidth={active ? 2 : 1.75}
                    className={active ? 'text-sky-300' : 'text-white/40'}
                  />
                  {item.label}
                  {isChat && unreadCount > 0 && (
                    // A count is information, not decoration. The gradient
                    // belongs to the active-item bar; a second one three rows
                    // down makes neither of them mean anything.
                    <span
                      data-numeric
                      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-400/20 px-1.5 text-2xs font-semibold text-sky-200"
                    >
                      {unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

interface SearchResult {
  type: 'lead' | 'client' | 'project' | 'note' | 'invoice';
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
  invoice: 'Invoice',
};

// Exported for its own tests: the debounce-and-abort sequence is the kind of
// thing that regresses back to a plain fetch without anything looking wrong.
export function SearchBox({ onNavigate, autoFocus }: { onNavigate?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  /** A request is out for what is currently typed — not the same as no results. */
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  /** Which result the arrow keys have landed on; -1 means "still in the field". */
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    /*
     * Aborted on the way out, not just de-timed.
     *
     * `clearTimeout` alone only cancels a request that has not started. Once
     * one is in flight nothing stopped it, so typing "linp" while the answer
     * for "lin" was still coming back let the older, slower response land
     * last and overwrite the newer one — the list showing matches for a
     * query the box no longer contained. Aborting the superseded request
     * makes the newest keystroke the one that wins, every time.
     */
    setSearching(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) setResults(data.results);
          setSearching(false);
        })
        .catch((err) => {
          // An abort means a newer query is already running and has its own
          // `searching` flag up — clearing it here would flash "No matches."
          // between keystrokes.
          if ((err as { name?: string })?.name !== 'AbortError') setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  // A fresh query invalidates whatever was highlighted.
  useEffect(() => setActiveIndex(-1), [results]);

  const go = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
    onNavigate?.();
  };

  const showList = open && query.trim().length >= 2;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showList || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <div
      className="relative w-full"
      // The results used to close on the input's own blur, which meant Tab
      // into a result closed the menu before the result could be reached.
      // Closing only when focus leaves the whole widget fixes that.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search..."
          aria-label="Search leads, clients and projects"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all"
        />
      </div>
      {showList && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute top-full mt-2 w-full min-w-[280px] max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-raised shadow-2xl z-50"
        >
          {/*
            "No matches." was shown the instant a second character was typed,
            while the request for it was still going out — so every search
            said there was nothing before it said what there was. An empty
            answer and an unanswered question look identical on screen unless
            you draw them differently.
          */}
          {searching && results.length === 0 ? (
            <p className="text-white/30 text-sm p-4">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-white/30 text-sm p-4">No matches.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={activeIndex === i}
                type="button"
                onClick={() => go(r)}
                className={`w-full text-left px-4 py-3 transition-colors border-b border-white/5 last:border-0 ${
                  activeIndex === i ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
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

/**
 * Cmd+K everywhere. The sidebar search worked but lived in one place; the
 * palette is the same SearchBox summoned from any screen, which is the
 * difference between "there is a search page" and "search is always under
 * your hands." Esc or a click outside dismisses.
 */
// Exported for its own tests: focus behaviour is invisible until somebody
// tries to use the thing without a mouse.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  /** Whatever had focus when the palette was summoned, to hand it back to. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    /*
     * Focus, kept where it belongs while this is up and given back when it
     * closes.
     *
     * The dialog declared aria-modal but behaved like nothing of the sort:
     * Tab walked straight out of it into the page underneath, which a screen
     * reader has been told is inert — so the reading order and what is
     * actually reachable disagreed. And nothing remembered where focus came
     * from, so Esc dropped it on the body and the next Tab restarted from the
     * top of the document. Summoning search from the keyboard and being
     * unable to get back to what you were doing is a strange way to lose your
     * place. The notification menu below already returns focus on close; this
     * is the same courtesy.
     */
    // Captured before anything in the panel takes focus, then the field is
    // focused deliberately. Leaving that to the input's own `autoFocus` meant
    // the browser had already moved focus by the time this ran, so what got
    // remembered was the search field itself — and handing focus back to a
    // node that is being unmounted is the same as handing it back to nothing.
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('input')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap at both ends rather than letting focus escape the dialog.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Only if it is still on the page — navigating away from a result
      // replaces it, and focusing a detached node silently does nothing.
      const target = returnFocusTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[18vh] px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <motion.div
            ref={panel}
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-xl rounded-2xl border border-white/10 bg-raised shadow-2xl p-3"
          >
            {/* Focused by CommandPalette itself, after it has noted where
                focus came from — see the effect above. */}
            <SearchBox onNavigate={onClose} />
            <p className="px-1 pt-2 text-[10px] text-white/25">
              Type to search leads, clients and projects · Esc to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const reduceMotion = useReducedMotion();

  useAdminPoll('/api/admin/notifications', 30000, (data) => {
    const payload = data as { success?: boolean; items?: NotificationItem[] };
    if (payload?.success && payload.items) setItems(payload.items);
  }, { onUnauthorized: () => router.push('/admin/login') });

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  return (
    <div
      className="relative"
      // Closing on the trigger's own blur made every item in the menu
      // unreachable by Tab — the menu vanished on the way in.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors text-white/60 hover:text-white"
        aria-label={items.length > 0 ? `Notifications (${items.length})` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <Bell size={17} aria-hidden="true" />
        {items.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-[9px] font-bold text-black px-1"
          >
            {items.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Notifications"
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-raised shadow-2xl z-50"
          >
            {items.length === 0 ? (
              <p className="text-white/30 text-sm p-4">You're all caught up.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[item.severity]}`}
                  />
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
  const reduceMotion = useReducedMotion();
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Session: once per signed-in period, not per navigation. Keyed on the
  // login boundary — with [] deps a user landing on /admin/login first (i.e.
  // every fresh login) never got a session fetch at all, so the nav stayed
  // in its narrow salesless state until a hard refresh.
  useEffect(() => {
    if (pathname === '/admin/login') {
      setUserName('');
      setUserRole('');
      setUserId('');
      return;
    }
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.type === 'user') {
          setUserName(data.user?.name || '');
          setUserRole(data.user?.role || '');
          setUserId(data.user?.id || '');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname === '/admin/login']);

  // Unread chat: live on an interval, not only when the route changes — a
  // user sitting on one page all morning still sees the badge move.
  useAdminPoll(
    '/api/admin/team-messages/unread-count',
    20000,
    (data) => {
      const payload = data as { success?: boolean; count?: number };
      if (payload?.success && typeof payload.count === 'number') setUnreadCount(payload.count);
    },
    {
      enabled: pathname !== '/admin/login',
      // Sent to the login page rather than left on a screen where every
      // button will fail. This is also what stops the loop: an expired tab
      // used to sit here answering 401 six times a minute, all night.
      onUnauthorized: () => router.push('/admin/login'),
    }
  );

  // Close the mobile sheets on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  // Cmd+K / Ctrl+K from anywhere in the admin — except the login page,
  // where hijacking the browser's own shortcut helps nobody.
  useEffect(() => {
    if (pathname === '/admin/login') {
      setPaletteOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname === '/admin/login']);

  /*
   * Above the early return, and it has to stay there.
   *
   * This sat below it, which meant the login route ran one fewer hook than
   * every other admin route. Hook order is per component instance, not per
   * route — so the instant login redirected to the dashboard, the same
   * AdminLayout re-rendered with one more hook than its previous render and
   * React threw #310 ("rendered more hooks than during the previous render").
   * On every login, which is the way almost everybody enters this app.
   *
   * Only production throws; dev recovers quietly, which is why it survived.
   * Locking on the login route costs nothing — `mobileOpen` is false there
   * and there is no sheet to hold still.
   */
  useBodyScrollLock(mobileOpen);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  // Equal admin for both people — the owner's call; the role only labels
  // the account now, so everyone sees the full nav.
  const navItems = ADMIN_NAV_ITEMS;

  const initials = (userName || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();


  return (
    <AdminSessionContext.Provider value={{ userName, userRole, userId }}>
      <div className="min-h-screen bg-ink text-white">
        {/*
          The first thing in the tab order, and invisible until it is focused.

          The sidebar comes before the content in the DOM, so reaching the page
          meant tabbing past the search button and every nav item — sixteen or
          so stops — and then doing it again on the next page, and the next.
          The marketing site has had one of these since launch; the tool people
          use all day did not.

          `#admin-main` rather than a heading: admin pages own their own H1s
          and several have more than one region above the fold, so the reliable
          target is the landmark itself.
        */}
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-full focus:bg-white focus:px-6 focus:py-3 focus:text-sm focus:font-medium focus:text-black"
        >
          Skip to content
        </a>

        {/* Desktop sidebar — the brand's ground, the brand's mark. */}
        <aside
          // Named, because a screen reader listing this page's regions
          // otherwise announced "navigation" twice — this one and the mobile
          // sheet — with nothing to tell them apart.
          aria-label="Main"
          // Sunk half a step below the content rather than sharing its plane.
          // A sidebar is the frame, not another panel on the wall; when both
          // are the same colour the eye has to use the 1px rule to work out
          // where the page starts, which is a job a surface should do for it.
          className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] bg-[#070510] lg:flex"
        >
          <Link
            href="/admin/dashboard"
            className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-6"
          >
            <Wordmark className="text-xl" />
          </Link>

          <div className="mt-4 mb-3 px-4">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 py-2 pl-3 pr-2 text-sm text-white/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-[border-color,color] duration-150 ease-ui hover:border-white/[0.16] hover:text-white/60"
              aria-label="Search (Cmd+K)"
            >
              <Search size={15} />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-2xs text-white/30">
                <Command size={9} />K
              </kbd>
            </button>
          </div>

          <nav className="flex-1 px-3 pb-4 overflow-y-auto">
            <NavLinks items={navItems} pathname={pathname} unreadCount={unreadCount} compact />
          </nav>

          <div className="p-3 border-t border-white/[0.08]">
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
        <header className="lg:hidden sticky top-0 z-50 border-b border-white/[0.08] bg-ink">
          <div className="px-4 h-14 flex items-center justify-between">
            <Link href="/admin/dashboard">
              <Wordmark className="text-lg" />
            </Link>
            <div className="flex items-center gap-1">
              {/* Search lived only inside the collapsed menu, which put it two
                  taps behind a hidden panel on the device it's used on most. */}
              <button
                onClick={() => {
                  setMobileSearchOpen((v) => !v);
                  setMobileOpen(false);
                }}
                className={`flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors ${
                  mobileSearchOpen ? 'text-sky-300 bg-white/[0.06]' : ''
                }`}
                aria-label="Search"
                aria-expanded={mobileSearchOpen}
              >
                <Search size={18} />
              </button>
              <NotificationBell />
              <button
                onClick={() => {
                  setMobileOpen((v) => !v);
                  setMobileSearchOpen(false);
                }}
                className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {mobileSearchOpen && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
                className="overflow-hidden border-t border-white/[0.08]"
              >
                <div className="px-4 py-3">
                  <SearchBox onNavigate={() => setMobileSearchOpen(false)} autoFocus />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="overflow-hidden border-t border-white/[0.08]"
              >
                {/*
                  Capped, and scrolls inside itself.

                  Fifteen nav items, a search box and a user row come to about
                  two phone screens, and the sheet expands inline — so opening
                  the menu pushed the page down and left you scrolling through
                  nav into page content, with no edge to either. The body is
                  held still while it is open (the same counted lock the
                  dialogs use, so the two cannot fight over the value), and the
                  sheet takes the scrolling instead.

                  `100dvh` rather than `100vh`: on mobile Safari the static
                  viewport unit does not account for the address bar, which is
                  precisely the strip the last nav item would hide under.
                  `4rem` is the header this sits beneath.
                */}
                <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
                  <SearchBox onNavigate={() => setMobileOpen(false)} />
                  {/* No onNavigate here: the effect keyed on `pathname` already
                      closes this sheet on every route change. */}
                  <nav aria-label="Main, mobile">
                    <NavLinks items={navItems} pathname={pathname} unreadCount={unreadCount} />
                  </nav>
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
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

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        {/* overflow-x-hidden: without it a single too-wide child (a long company
            name, an unbroken URL) makes the document wider than the viewport,
            and iOS Safari responds by zooming the whole page out — which reads
            as "everything is squashed into the left with dead space beside it". */}
        <main
          id="admin-main"
          // Focusable only as a skip-link target: without it the browser moves
          // the scroll position but leaves focus on the link, so the next Tab
          // goes back into the sidebar the skip was for getting out of.
          tabIndex={-1}
          className="lg:pl-64 relative w-full min-w-0 overflow-x-hidden outline-none"
        >
          {children}
        </main>

        {/* In front of every send in the admin, on every screen, whether or
            not the button that made the request knows it is here. */}
        <SendGuard />
      </div>
    </AdminSessionContext.Provider>
  );
}
