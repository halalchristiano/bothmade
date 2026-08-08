'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Search, X, type LucideIcon } from 'lucide-react';

/*
 * Design language, take two. The mono-uppercase-label-on-every-box style
 * read as busy and technical rather than premium — every stat got its own
 * bordered tile, every heading shouted in tracked-out caps. This version
 * trusts hierarchy instead of chrome: fewer boxes, calmer sentence-case
 * type, and accent color reserved for things that actually need attention.
 */

const TONE_TEXT: Record<string, string> = {
  sky: 'text-sky-300',
  purple: 'text-purple-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
};

/** Small icon glyph — no box, just a tinted icon. Quiet by default. */
export function IconChip({
  icon: Icon,
  tone = 'sky',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  size?: 'sm' | 'md' | 'lg';
}) {
  const iconDims = size === 'sm' ? 14 : size === 'lg' ? 22 : 16;
  return <Icon size={iconDims} strokeWidth={2} className={TONE_TEXT[tone]} />;
}

/**
 * Standard card shell.
 *
 * Was a 1px hairline on flat ground, which is what made the app read as a
 * wireframe of itself: everything sat on exactly the same plane, so nothing
 * looked like an object you could pick up. This is a real surface — lifted a
 * step off the ground, an ambient shadow underneath, and a single pixel of
 * light caught along the top edge where a surface tilted into overhead light
 * would catch it. That top highlight is doing most of the work; it is the
 * difference between a rectangle and a thing.
 */
export function Card({
  children,
  className = '',
  glow,
  hover = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  hover?: boolean;
  /** An anchor, for anything on the page that needs to scroll back to it. */
  id?: string;
}) {
  const glowBorder: Record<string, string> = {
    sky: 'border-l-2 border-l-sky-400/50',
    purple: 'border-l-2 border-l-purple-400/50',
    emerald: 'border-l-2 border-l-emerald-400/50',
    amber: 'border-l-2 border-l-amber-400/50',
    red: 'border-l-2 border-l-red-400/50',
  };
  return (
    <div
      id={id}
      className={`relative rounded-xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent ${
        glow ? glowBorder[glow] : ''
      } ${
        hover
          ? 'transition-[border-color,box-shadow,transform] duration-200 ease-ui hover:-translate-y-px hover:border-white/12 hover:shadow-e3'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  tone = 'sky',
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  action?: React.ReactNode;
}) {
  return (
    // Hardcoded pixel sizes replaced by the scale, which now resolves to the
    // same 15/13 — the point is that they move together from here on, rather
    // than being two numbers somebody typed once and nobody can safely change.
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-white/40">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * A row of stats sharing ONE card, separated by dividers instead of each
 * getting its own bordered tile — this is the direct fix for "too many
 * small boxes." Use this instead of a grid of StatCard for anything that's
 * conceptually one summary (e.g. the four top-line dashboard numbers).
 */
export function StatRow({
  items,
}: {
  items: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
    accent?: boolean;
    trend?: { value: number };
    note?: string;
  }>;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-2 divide-y divide-white/[0.05] md:grid-cols-4 md:divide-x md:divide-y-0 md:divide-white/[0.05]">
        {items.map((item, i) => (
          <div key={i} className="p-5">
            {/*
              Label above, number below, and the number is the loud one. It
              used to be two lines of nearly the same weight sharing the tile;
              dropping the label to a quiet tracked-out line and letting the
              figure take the space is what makes a number read as a headline
              rather than as a form field's value.
            */}
            <div className="mb-2.5 flex items-center gap-1.5 text-white/40">
              <IconChip icon={item.icon} tone={item.tone} size="sm" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p
                data-numeric
                className={`text-2xl font-semibold ${
                  item.accent ? TONE_TEXT[item.tone || 'sky'] : 'text-white'
                }`}
              >
                {item.value}
              </p>
              {item.trend !== undefined && (
                <span
                  data-numeric
                  className={`text-xs font-medium ${
                    item.trend.value >= 0 ? 'text-emerald-300/90' : 'text-red-300/90'
                  }`}
                >
                  {item.trend.value >= 0 ? '+' : ''}
                  {item.trend.value}%
                </span>
              )}
            </div>
            {item.note && <p className="mt-2 text-xs text-white/30">{item.note}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Single metric tile — for the rare case a stat truly stands alone. */
export function StatCard({
  icon,
  label,
  value,
  tone = 'sky',
  trend,
  accent = false,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  trend?: { value: number; label?: string };
  accent?: boolean;
  note?: string;
}) {
  return (
    <Card hover className="p-5">
      <div className="mb-2.5 flex items-center gap-1.5 text-white/40">
        <IconChip icon={icon} tone={tone} size="sm" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p data-numeric className={`text-2xl font-semibold ${accent ? TONE_TEXT[tone] : 'text-white'}`}>
          {value}
        </p>
        {trend !== undefined && (
          <span
            data-numeric
            className={`text-xs font-medium ${trend.value >= 0 ? 'text-emerald-300/90' : 'text-red-300/90'}`}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      {trend?.label && <p className="mt-2 text-xs text-white/30">{trend.label}</p>}
      {note && <p className="mt-2 text-xs text-white/30">{note}</p>}
    </Card>
  );
}

/** Status word — plain colored text by default, no border box. Pass `solid` for the rare case a filled pill is actually clearer (e.g. a count). */
export function Badge({
  children,
  tone = 'sky',
  solid = false,
}: {
  children: React.ReactNode;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red' | 'neutral';
  solid?: boolean;
}) {
  const textClasses: Record<string, string> = {
    sky: 'text-sky-300',
    purple: 'text-purple-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
    neutral: 'text-white/50',
  };
  if (!solid) {
    return <span className={`text-[13px] font-medium whitespace-nowrap ${textClasses[tone]}`}>{children}</span>;
  }
  const solidClasses: Record<string, string> = {
    sky: 'bg-sky-400/15 text-sky-300',
    purple: 'bg-purple-400/15 text-purple-300',
    emerald: 'bg-emerald-400/15 text-emerald-300',
    amber: 'bg-amber-400/15 text-amber-300',
    red: 'bg-red-400/15 text-red-300',
    neutral: 'bg-white/10 text-white/60',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${solidClasses[tone]}`}>
      {children}
    </span>
  );
}

/** Page-level title with icon — the one consistent header treatment every list page should use. */
export function PageTitle({
  icon,
  title,
  tone = 'sky',
}: {
  icon: LucideIcon;
  title: string;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
}) {
  return (
    // font-bold and tracking-tight both dropped: 700 is a shout at this size,
    // and the scale now carries the tracking, so stacking a utility on top was
    // two people setting the same property from different places.
    <div className="flex items-center gap-3">
      <IconChip icon={icon} tone={tone} size="lg" />
      <h1 className="text-2xl font-semibold text-white md:text-3xl">{title}</h1>
    </div>
  );
}

/** Segmented view switcher — for pages that are really one section shown two
 * ways (e.g. Leads table vs. Pipeline board), so it reads as one place with
 * a toggle instead of two unrelated destinations in the nav. */
export function ViewTabs({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    // The selected tab is a raised chip inside a sunken track, rather than
    // just a lighter rectangle — the shape says "this one is in front" before
    // the colour has to.
    <div className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-[background-color,color] duration-150 ease-ui ${
            tab.active
              ? 'bg-white/[0.09] text-white shadow-e1'
              : 'text-white/45 hover:bg-white/[0.04] hover:text-white/80'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Fade+rise entrance wrapper for page content — subtle, not distracting.
 *
 * Nothing moves for anyone who's asked their OS not to animate things: for
 * a vestibular disorder, "subtle" is not the relevant axis, and every admin
 * page navigation runs this. The content still arrives, just without the
 * travel — so the guard costs nothing to the people who don't need it.
 */
export function PageIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A row list item — flat, with a left accent bar on hover instead of a full background fill. */
export function ListRow({
  href,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  href?: string;
  title: string;
  subtitle?: string;
  /** Rendered outside the row's own link/button — safe to put interactive
   * elements here (a popover trigger, etc.) without nesting them inside an
   * anchor, which is invalid HTML and can trigger unwanted navigation. */
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  const text = (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-white">{title}</p>
      {subtitle && <p className="mt-0.5 truncate text-xs text-white/40">{subtitle}</p>}
    </div>
  );
  /*
   * The most repeated element in the app, so its manners set the tone for
   * everything.
   *
   * It used to grow a coloured bar on the left on hover — a 2px accent slab
   * appearing and disappearing under the pointer, on every row, all day. That
   * is a lot of colour spent on telling somebody where their own cursor is.
   * A quiet lift of the background says the same thing without turning the
   * page into a light show, and it leaves the accent free to mean something
   * when it does appear.
   */
  const wrapperClass =
    'group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 ease-ui hover:bg-white/[0.04]';

  const clickable = href ? (
    <Link href={href} className="block min-w-0 flex-1">
      {text}
    </Link>
  ) : (
    <button onClick={onClick} className="text-left block min-w-0 flex-1">
      {text}
    </button>
  );

  return (
    <div className={wrapperClass}>
      {clickable}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * `tone="clear"` is for the genuinely good case — a list that's empty
 * because nothing's wrong (inbox zero, no overdue anything) — vs. the
 * default neutral tone for a list that just has no data yet. Visually
 * distinct so scanning the dashboard, an all-clear widget doesn't read
 * the same as a not-yet-populated one.
 */
export function EmptyState({
  icon: Icon,
  text,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  text: string;
  tone?: 'neutral' | 'clear';
}) {
  if (tone === 'clear') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 text-emerald-300/60">
        <Icon size={20} strokeWidth={1.5} className="mb-2 opacity-70" />
        <p className="text-sm font-medium">{text}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 text-white/30">
      <Icon size={20} strokeWidth={1.5} className="mb-2 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

/**
 * "This did not load", which is a different sentence from "there is nothing".
 *
 * Every queue on the Delivery pages fetched once, kept its rows in a `[]` that
 * a failed request never replaced, and rendered the empty state — so an API
 * that was down said "Nothing in design right now" and "Projects appear here
 * once they reach Build. Nothing has yet." Confident, specific, and wrong.
 *
 * These are work queues. Empty is not a neutral display state on them, it is
 * an instruction: it means today's design round is nobody's problem and no
 * launch is waiting. A page that can say that because a fetch failed is worse
 * than a page that shows a spinner forever, because the spinner at least
 * makes somebody reload.
 *
 * Retry rather than a bare apology: a queue nobody can reload is a page you
 * leave, and the thing that failed is usually one dropped request.
 */
export function LoadError({
  what,
  onRetry,
}: {
  /** Names the thing that failed, e.g. "the design queue". */
  what: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/[0.06] py-8 text-center"
    >
      <AlertTriangle size={20} strokeWidth={1.5} className="mb-2 text-amber-300/80" />
      <p className="text-sm font-medium text-amber-100/90">Could not load {what}.</p>
      <p className="mt-1 max-w-sm px-6 text-xs text-white/45">
        This is a loading problem, not an empty list — there may well be work here. Nothing has been
        lost.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5"
      >
        Try again
      </button>
    </div>
  );
}

/** Minimal SVG bar chart — no dependency, just enough for trend widgets. */
export function MiniBarChart({
  data,
  formatValue,
  onBarClick,
  selectedIndex,
}: {
  data: Array<{ label: string; value: number }>;
  formatValue?: (v: number) => string;
  onBarClick?: (index: number) => void;
  selectedIndex?: number | null;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => {
        const isSelected = selectedIndex === i;
        const Wrapper = onBarClick ? 'button' : 'div';
        const height = `${Math.max((d.value / max) * 100, 3)}%`;
        return (
          <Wrapper
            key={i}
            {...(onBarClick
              ? {
                  onClick: () => onBarClick(i),
                  type: 'button' as const,
                  'aria-pressed': isSelected,
                  'aria-label': `${d.label}: ${formatValue ? formatValue(d.value) : d.value}`,
                }
              : {})}
            className={`flex-1 flex flex-col items-center gap-1.5 group ${onBarClick ? 'cursor-pointer' : ''}`}
          >
            <span
              className={`text-[11px] transition-colors -mb-1 font-medium ${
                isSelected ? 'text-white' : 'text-white/25 group-hover:text-white/60'
              }`}
            >
              {formatValue ? formatValue(d.value) : d.value}
            </span>
            {/* Bars grow into place, unless motion is turned down — a row of
                staggered rising bars is exactly the sort of thing the
                preference exists to stop. Reduced motion draws them full
                height immediately; the chart is identical once settled. */}
            <motion.div
              initial={reduceMotion ? false : { height: 0 }}
              animate={{ height }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
              className={`w-full rounded-t-sm transition-colors ${
                isSelected
                  ? 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.6)] ring-1 ring-sky-200/60'
                  : 'bg-sky-400/40 group-hover:bg-sky-400/70'
              }`}
            />
            <span className={`text-[11px] transition-colors ${isSelected ? 'text-white font-semibold' : 'text-white/30'}`}>{d.label}</span>
          </Wrapper>
        );
      })}
    </div>
  );
}

/**
 * On-page search for a list that's already loaded.
 *
 * Distinct from the global search in the sidebar, which navigates you away
 * to one record. This narrows the list you're looking at and keeps you on
 * the page — the thing you want when you're working a list and someone asks
 * about one business, or when you know the name and don't want to scroll.
 * Every list long enough to scroll needs one.
 */
export function SearchFilter({
  value,
  onChange,
  placeholder = 'Search by business, contact, email or phone...',
  count,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  count?: number;
  total?: number;
}) {
  return (
    <div className="mb-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full min-w-0 pl-9 pr-9 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>
      {value && typeof count === 'number' && (
        <p className="text-xs text-white/40 mt-1.5">
          {count === 0
            ? `Nothing matches "${value}".`
            : `${count}${typeof total === 'number' ? ` of ${total}` : ''} match${count === 1 ? 'es' : ''}.`}
        </p>
      )}
    </div>
  );
}

/** Anything inside a row that has its own click behaviour and must keep it. */
const INTERACTIVE_CHILD = 'a, button, input, select, textarea, label, [role="button"], [role="menuitem"]';

/**
 * Makes a whole row or card openable from the keyboard, the way it already
 * is with a mouse. Table rows and lead cards across the admin carried a bare
 * `onClick` that navigated — invisible to anyone who can't point at it, and
 * unreachable by Tab.
 *
 * Enter and Space both activate, matching what a link and a button do
 * respectively. Events that came from a control inside the row are left
 * alone: a row's status dropdown or select-checkbox has to work without
 * also navigating away from the list. That covers the keyboard path too,
 * where ticking a checkbox with Space dispatches a *click* that bubbles —
 * the reason call sites were sprinkled with one-off `stopPropagation`
 * handlers, inconsistently, and missed a few.
 */
export function clickableRowProps(onActivate: () => void, label: string) {
  const fromInnerControl = (e: React.SyntheticEvent) => {
    const target = e.target as HTMLElement | null;
    return !!target && target !== e.currentTarget && !!target.closest(INTERACTIVE_CHILD);
  };

  return {
    tabIndex: 0,
    'aria-label': label,
    onClick: (e: React.MouseEvent) => {
      if (fromInnerControl(e)) return;
      onActivate();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/**
 * Case-insensitive match across whichever fields are worth searching on a
 * record. Multi-word queries must match every word, though not in order or
 * in the same field — so "van cleaning" finds "Van's Cleaning Services" and
 * "miami roofing" finds a roofer whose city is only in the notes.
 */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}


/*
 * Take three additions: the brand voice, at dashboard volume.
 *
 * Take two was right that mono-caps on every box is noise; it was wrong to
 * delete the voice entirely. These two primitives are the whole
 * reintroduction: one kicker per page, one gradient button per screen.
 */

/** The marketing site's mono-caps kicker, for exactly one line per page. */
export function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  // Was mono, 10px, letterspaced to 0.4em — the exact tracked-out caps
  // treatment the rest of this file was written to get away from, left behind
  // because it sits above headings rather than inside cards. 0.4em is not a
  // label, it is a texture; at that spacing the word stops being read and
  // starts being looked at.
  return (
    <p className={`text-2xs font-medium uppercase tracking-[0.16em] text-white/35 ${className}`}>
      {children}
    </p>
  );
}

/**
 * The button set every admin page was hand-rolling.
 *
 * `primary` used to be the sky-to-purple gradient, which made the single
 * loudest object on any screen the OK button of a dialog. A gradient is a
 * thing you look at; a primary button is a thing you press, and the two want
 * opposite amounts of attention. Solid white against a near-black ground is
 * the highest contrast available and needs no colour at all to be obviously
 * the action — it reads as expensive precisely because it is not trying to.
 *
 * The gradient is not gone, it moved to `accent`, for the two or three
 * moments a screen genuinely wants to be looked at rather than used. Spending
 * it on every Save was what made it worth nothing.
 *
 * All variants take the native button props, so call sites port by swapping
 * the element.
 */
export function BrandButton({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'quiet' | 'danger';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-white text-ink shadow-e2 hover:bg-white/90 active:translate-y-px'
      : variant === 'accent'
      ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black shadow-e2 hover:opacity-90 active:translate-y-px'
      : variant === 'danger'
      ? 'border border-red-400/35 text-red-300 hover:border-red-400/60 hover:bg-red-400/10 active:translate-y-px'
      : 'border border-white/12 bg-white/[0.03] text-white hover:border-white/20 hover:bg-white/[0.06] active:translate-y-px';
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,border-color,opacity,transform] duration-150 ease-ui disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * The input class every page re-declared locally. One string, one place.
 *
 * Sunk into the surface rather than floating on it — a field is a hole you
 * put something into, and drawing it as another raised panel is why forms
 * built out of cards read as busy. The border brightens on focus instead of
 * vanishing behind a ring, so the field keeps its shape while it is active.
 */
export const inputClass =
  'w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-[border-color,background-color] duration-150 ease-ui placeholder:text-white/25 hover:border-white/[0.14] focus:border-sky-400/60 focus:bg-black/35 focus:outline-none';


/**
 * A named, collapsible section of a long page.
 *
 * THE PROBLEM. The lead page put everything about a business on one scroll —
 * the brief, the mockups, the files, the qualification, the timeline, the
 * team chat — as a stack of identical bordered cards. Any single card is
 * fine; twelve of them is a page where finding the mockup means scrolling
 * past four things you are not doing, every time, and where the useful
 * information is invisible until you have travelled to it.
 *
 * Collapsing alone does not fix that. A shut box labelled "Mockups" is a
 * question you still have to open the box to answer, so people leave
 * everything open and nothing is gained.
 *
 * So `summary` is the point of this component, not the chevron. A closed
 * section must say the thing you would have opened it to find out — "3
 * versions · sent 2 days ago, opened twice" — and then opening it is a
 * decision rather than a search. Sections with nothing worth saying should
 * say that too, quietly, so an empty one can be recognised without a click.
 *
 * The open/shut choice is remembered per section, because somebody who works
 * mockups all day and never touches qualification should get their page back
 * the way they left it.
 */
export function Section({
  id,
  title,
  hint,
  summary,
  defaultOpen = false,
  attention = false,
  children,
  className = '',
}: {
  /** Stable key for remembering the open/shut choice. Never reuse one. */
  id: string;
  title: string;
  /** One line under the title, always visible. What this section is for. */
  hint?: string;
  /**
   * What a reader would have opened it to find out. Shown when shut, and it
   * is the whole reason this is worth collapsing — a closed box that answers
   * nothing just costs a click.
   */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Something in here needs doing. Survives being collapsed. */
  attention?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Read after mount rather than in the initial state, so the server and the
  // first client render agree — a section that starts open on the server and
  // shut on the client is a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bothmade_section_${id}`);
      if (saved === 'open') setOpen(true);
      else if (saved === 'shut') setOpen(false);
    } catch {
      /* private browsing — the default is fine */
    }
  }, [id]);

  const toggle = () => {
    setOpen((prev) => {
      try {
        localStorage.setItem(`bothmade_section_${id}`, prev ? 'shut' : 'open');
      } catch {
        /* ignore */
      }
      return !prev;
    });
  };

  return (
    // A real surface, matching Card. The top-to-bottom white wash plus a blur
    // was the old glass idiom, and a page of twelve of these stacked reads as
    // twelve sheets of frosted plastic — the gradient fights the one on the
    // section above it, and blur costs a compositing layer per section for an
    // effect nothing is behind.
    <section
      className={`relative rounded-2xl border bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent ${
        attention ? 'border-amber-400/30' : 'border-white/[0.06]'
      } ${className}`}
    >
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-5 py-4 text-left sm:px-6"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-bold text-white">
            {title}
            {attention && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                needs you
              </span>
            )}
          </p>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-white/40">{hint}</p>}
          {/* The answer, while it is shut. Hidden when open because the
              section itself is then saying it in full, and repeating it above
              the detail is the sort of duplication that makes a page feel
              longer than it is. */}
          {!open && summary && (
            <div className="mt-1.5 text-xs leading-relaxed text-white/55">{summary}</div>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`mt-1 shrink-0 text-white/30 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Not rendered rather than hidden: several of these mount forms, fetch
          data or draw tables, and building all of them to then display:none
          most is the cost this exists to avoid. */}
      {open && <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>}
    </section>
  );
}
