'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/*
 * Redesigned to match the public site's voice: sharp corners, flat surfaces,
 * mono uppercase micro-labels, high-contrast type. No more glassy blur-and-
 * gradient "generic SaaS dashboard" look — same engineered, confident feel
 * as bothmade.studio itself.
 */

const TONE_TEXT: Record<string, string> = {
  sky: 'text-sky-300',
  purple: 'text-purple-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
};

const TONE_BORDER: Record<string, string> = {
  sky: 'border-sky-400/40',
  purple: 'border-purple-400/40',
  emerald: 'border-emerald-400/40',
  amber: 'border-amber-400/40',
  red: 'border-red-400/40',
};

/** Small square icon tag — replaces the soft gradient-circle chip with a sharp bordered square. */
export function IconChip({
  icon: Icon,
  tone = 'sky',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconDims = size === 'sm' ? 13 : 15;
  return (
    <span
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-md border ${TONE_BORDER[tone]} bg-white/[0.03] ${TONE_TEXT[tone]}`}
    >
      <Icon size={iconDims} strokeWidth={2} />
    </span>
  );
}

/** Standard card shell — flat surface, thin border, sharp corners. No blur, no gradient soup. */
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
    sky: 'border-l-2 border-l-sky-400/70',
    purple: 'border-l-2 border-l-purple-400/70',
    emerald: 'border-l-2 border-l-emerald-400/70',
    amber: 'border-l-2 border-l-amber-400/70',
    red: 'border-l-2 border-l-red-400/70',
  };
  return (
    <div
      className={`rounded-lg border border-white/10 bg-white/[0.025] ${glow ? glowBorder[glow] : ''} ${
        hover ? 'transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.04]' : ''
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
      <div className="flex items-center gap-2.5">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div>
          <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/85 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-white/40 mt-1">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Big metric tile — bold tabular numbers, mono uppercase label, no soft gradient text. */
export function StatCard({
  icon,
  label,
  value,
  tone = 'sky',
  trend,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  trend?: { value: number; label?: string };
  accent?: boolean;
}) {
  return (
    <Card hover className="p-5">
      <div className="flex items-center justify-between mb-4">
        <IconChip icon={icon} tone={tone} />
        {trend !== undefined && (
          <span
            className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${
              trend.value >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
            }`}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/40 mb-1.5">{label}</p>
      <p
        className={`text-[1.85rem] leading-none font-bold tracking-tight tabular-nums ${
          accent ? TONE_TEXT[tone] : 'text-white'
        }`}
      >
        {value}
      </p>
      {trend?.label && <p className="text-[11px] text-white/30 mt-2">{trend.label}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = 'sky',
}: {
  children: React.ReactNode;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red' | 'neutral';
}) {
  const toneClasses: Record<string, string> = {
    sky: 'border-sky-400/30 text-sky-300',
    purple: 'border-purple-400/30 text-purple-300',
    emerald: 'border-emerald-400/30 text-emerald-300',
    amber: 'border-amber-400/30 text-amber-300',
    red: 'border-red-400/30 text-red-300',
    neutral: 'border-white/15 text-white/50',
  };
  return (
    <span
      className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
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
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <div className="group flex items-center justify-between gap-3 pl-3 pr-3 py-2.5 rounded-md border-l-2 border-transparent hover:border-l-sky-400/60 hover:bg-white/[0.03] transition-all">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{title}</p>
        {subtitle && <p className="text-xs text-white/40 truncate">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="w-full text-left block">
      {inner}
    </button>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
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
}: {
  data: Array<{ label: string; value: number }>;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
          <span className="text-[10px] font-mono text-white/0 group-hover:text-white/50 transition-colors -mb-1">
            {formatValue ? formatValue(d.value) : d.value}
          </span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
            className="w-full rounded-t-sm bg-sky-400/40 group-hover:bg-sky-400/70 transition-colors"
          />
          <span className="text-[10px] font-mono text-white/30">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
