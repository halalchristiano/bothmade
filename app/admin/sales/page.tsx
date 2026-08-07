'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headset, KanbanSquare, PhoneCall, UserPlus, Users } from 'lucide-react';
import { BrandButton, Kicker, PageIn, PageTitle } from '@/components/admin/ui';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';
import { BoardView } from '@/components/admin/sales/BoardView';
import { ListView } from '@/components/admin/sales/ListView';
import { QueueView } from '@/components/admin/sales/QueueView';

/**
 * Sales. One screen.
 *
 * There used to be four: Pipeline, Who to call, Call HQ and Leads. All four
 * were reached from the sidebar, all four opened on the same set of leads,
 * and nothing told you which one to start from — so the honest outcome was
 * that none of them got opened, and the phone got picked up from memory
 * instead. Four front doors is the same as none.
 *
 * These are *lenses*, not destinations, so they live behind tabs on one page
 * with one header, one "add companies" button, and one call to action. The
 * default lens is the queue, because the queue is the only one that answers a
 * question you can act on in the next ten seconds.
 *
 * There were briefly four. A second lead table — the old dashboard
 * spreadsheet — arrived as its own tab, which was two lists of the same
 * leads sitting next to each other. Its three genuinely distinct powers
 * (saved views, CSV export, bulk snooze) moved into "All leads" and the
 * duplicate went.
 *
 * Call HQ stays a separate route on purpose. It isn't a fifth list — it's a
 * mode you enter with a phone in your hand, and it takes over the screen.
 */

type View = 'queue' | 'board' | 'list';

const VIEWS: Array<{ key: View; label: string; icon: typeof PhoneCall; blurb: string }> = [
  { key: 'queue', label: 'Who to call', icon: PhoneCall, blurb: 'Ranked by urgency. Start at the top.' },
  { key: 'board', label: 'Board', icon: KanbanSquare, blurb: 'Every deal by stage.' },
  {
    key: 'list',
    label: 'All leads',
    icon: Users,
    blurb: 'The whole book — filter it, save the view, export it.',
  },
];

function isView(value: string | null): value is View {
  return value === 'queue' || value === 'board' || value === 'list';
}

const PANEL_ID = 'sales-lens';
const tabId = (key: View) => `sales-tab-${key}`;

export default function SalesPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('queue');
  const [showAdd, setShowAdd] = useState(false);
  // Incremented after a lead is created so whichever lens is mounted reloads
  // without the shell needing to know how any of them fetch.
  const [refreshToken, setRefreshToken] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Read off window rather than useSearchParams() so the page needs no
  // Suspense boundary to prerender — same reason the sign-and-pay page does
  // it this way.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('view');
    if (isView(fromUrl)) {
      setView(fromUrl);
      return;
    }
    try {
      const remembered = localStorage.getItem('bothmade_sales_view');
      if (isView(remembered)) setView(remembered);
    } catch {
      /* private browsing — the default is fine */
    }
  }, []);

  const choose = useCallback((next: View) => {
    setView(next);
    try {
      localStorage.setItem('bothmade_sales_view', next);
    } catch {
      /* ignore */
    }
    // replaceState rather than router.replace: switching lens is not a
    // navigation anybody wants stacked in their back button, but the URL
    // still has to be shareable.
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url.toString());
  }, []);

  /*
   * Arrows move focus between the tabs; Enter or Space selects.
   *
   * Manual activation rather than automatic, because each lens fetches when
   * it mounts — arrowing across the set with automatic activation would fire
   * three requests to look at one. Home and End are part of the same pattern
   * and cost nothing to honour.
   */
  const onTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const current = tabRefs.current.findIndex((el) => el === document.activeElement);
    if (current === -1) return;

    const last = VIEWS.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
    else if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;

    e.preventDefault();
    tabRefs.current[next]?.focus();
  }, []);

  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <PageIn className="px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div className="min-w-0">
          <Kicker className="mb-2">Sales</Kicker>
          <PageTitle icon={active.icon} title="Sales" />
          <p className="text-white/40 mt-1">{active.blurb}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BrandButton
            variant="quiet"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <UserPlus size={16} />
            Add companies
          </BrandButton>
          {/* The one gradient action across every lens, and the point of the
              whole screen: stop reading, start ringing. ?start=1 skips the
              Call HQ page and opens the top of the queue, because someone
              pressing this has already decided. */}
          <BrandButton
            onClick={() => router.push('/admin/call?start=1')}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Headset size={16} />
            Start calling
          </BrandButton>
        </div>
      </div>

      {/*
        `role="tablist"` was already here, and none of what it promises was.
        Declaring the role tells a screen reader user this is a tab set — that
        arrows will move between the tabs, that one Tab press gets past them,
        and that each one owns a panel — and then none of it was true. Saying
        "tab" without the behaviour is worse than three plain buttons, because
        the three buttons at least behave the way they announce.
      */}
      <div
        role="tablist"
        aria-label="Sales views"
        onKeyDown={onTabKeyDown}
        className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1 mb-6"
      >
        {VIEWS.map((v, i) => {
          const Icon = v.icon;
          const selected = v.key === view;
          return (
            <button
              key={v.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={tabId(v.key)}
              role="tab"
              aria-selected={selected}
              aria-controls={PANEL_ID}
              /*
               * Roving: only the selected tab is in the page's tab order, so
               * one press of Tab moves from the tab set into the lens rather
               * than walking all three. That is the whole point of the role.
               */
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(v.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                selected ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/*
        One panel that swaps, rather than three that hide: each lens fetches
        on mount, and three of them running behind hidden tabs is three times
        the load for two views nobody is looking at. `aria-labelledby` follows
        the selected tab so the region is still named by the thing that opened
        it.
      */}
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(view)}
        // Focusable so the panel is reachable from the tab set even when what
        // is inside it starts with plain text — several of these lenses open
        // on a heading and a count.
        tabIndex={0}
        className="outline-none"
      >
        {view === 'queue' && <QueueView refreshToken={refreshToken} />}
        {view === 'board' && <BoardView refreshToken={refreshToken} />}
        {view === 'list' && <ListView refreshToken={refreshToken} />}
      </div>

      {showAdd && (
        <QuickAddLeadModal
          onClose={() => setShowAdd(false)}
          onCreated={(leadId) => {
            setShowAdd(false);
            if (leadId) router.push(`/admin/leads/${leadId}`);
            else setRefreshToken((n) => n + 1);
          }}
        />
      )}
    </PageIn>
  );
}
