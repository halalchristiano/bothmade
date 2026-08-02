'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Search, X, type LucideIcon } from 'lucide-react';

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

/** Standard card shell — one flat surface, generous padding, quiet border. */
export function Card({
  children,
  className = '',
  glow,
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  hover?: boolean;
}) {
  const glowBorder: Record<string, string> = {
    sky: 'border-l-2 border-l-sky-400/60',
    purple: 'border-l-2 border-l-purple-400/60',
    emerald: 'border-l-2 border-l-emerald-400/60',
    amber: 'border-l-2 border-l-amber-400/60',
    red: 'border-l-2 border-l-red-400/60',
  };
  return (
    <div
      className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${glow ? glowBorder[glow] : ''} ${
        hover ? 'transition-colors duration-200 hover:border-white/15' : ''
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
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-2">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div>
          <h2 className="text-[15px] font-semibold text-white leading-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-white/40 mt-0.5">{subtitle}</p>}
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
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y divide-white/[0.06] md:divide-y-0 md:divide-x md:divide-white/[0.06]">
        {items.map((item, i) => (
          <div key={i} className="p-5">
            <div className="flex items-center gap-1.5 mb-2 text-white/45">
              <IconChip icon={item.icon} tone={item.tone} size="sm" />
              <span className="text-[13px]">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p
                className={`text-2xl font-semibold tracking-tight tabular-nums ${
                  item.accent ? TONE_TEXT[item.tone || 'sky'] : 'text-white'
                }`}
              >
                {item.value}
              </p>
              {item.trend !== undefined && (
                <span className={`text-xs font-medium ${item.trend.value >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {item.trend.value >= 0 ? '+' : ''}
                  {item.trend.value}%
                </span>
              )}
            </div>
            {item.note && <p className="text-xs text-white/30 mt-1.5">{item.note}</p>}
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
      <div className="flex items-center gap-1.5 mb-2 text-white/45">
        <IconChip icon={icon} tone={tone} size="sm" />
        <span className="text-[13px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-2xl font-semibold tracking-tight tabular-nums ${accent ? TONE_TEXT[tone] : 'text-white'}`}>
          {value}
        </p>
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend.value >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      {trend?.label && <p className="text-xs text-white/30 mt-1.5">{trend.label}</p>}
      {note && <p className="text-xs text-white/30 mt-1.5">{note}</p>}
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
    <div className="flex items-center gap-3">
      <IconChip icon={icon} tone={tone} size="lg" />
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
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
    <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-white/[0.07] bg-white/[0.02]">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab.active ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/** Fade+rise entrance wrapper for page content — subtle, not distracting. */
export function PageIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
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
      <p className="text-sm font-medium text-white truncate">{title}</p>
      {subtitle && <p className="text-xs text-white/40 truncate">{subtitle}</p>}
    </div>
  );
  const wrapperClass =
    'group flex items-center justify-between gap-3 pl-3 pr-3 py-2.5 rounded-lg border-l-2 border-transparent hover:border-l-sky-400/50 hover:bg-white/[0.03] transition-all';

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
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => {
        const isSelected = selectedIndex === i;
        const Wrapper = onBarClick ? 'button' : 'div';
        return (
          <Wrapper
            key={i}
            {...(onBarClick ? { onClick: () => onBarClick(i), type: 'button' } : {})}
            className={`flex-1 flex flex-col items-center gap-1.5 group ${onBarClick ? 'cursor-pointer' : ''}`}
          >
            <span
              className={`text-[11px] transition-colors -mb-1 font-medium ${
                isSelected ? 'text-white' : 'text-white/25 group-hover:text-white/60'
              }`}
            >
              {formatValue ? formatValue(d.value) : d.value}
            </span>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
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
