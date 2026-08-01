'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/** Circular icon chip used in card headers and nav — consistent accent treatment everywhere. */
export function IconChip({
  icon: Icon,
  tone = 'sky',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'sky' | 'purple' | 'emerald' | 'amber' | 'red';
  size?: 'sm' | 'md';
}) {
  const toneClasses: Record<string, string> = {
    sky: 'from-sky-400/25 to-sky-500/10 text-sky-300 ring-sky-400/20',
    purple: 'from-purple-400/25 to-purple-500/10 text-purple-300 ring-purple-400/20',
    emerald: 'from-emerald-400/25 to-emerald-500/10 text-emerald-300 ring-emerald-400/20',
    amber: 'from-amber-400/25 to-amber-500/10 text-amber-300 ring-amber-400/20',
    red: 'from-red-400/25 to-red-500/10 text-red-300 ring-red-400/20',
  };
  const dims = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const iconDims = size === 'sm' ? 14 : 17;
  return (
    <span
      className={`inline-flex ${dims} items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${toneClasses[tone]}`}
    >
      <Icon size={iconDims} strokeWidth={2.25} />
    </span>
  );
}

/** Standard elevated card shell — replaces the ad-hoc `rounded-2xl border border-white/10 bg-white/5` scattered everywhere. */
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
  const glowShadow: Record<string, string> = {
    sky: 'shadow-[0_0_50px_-20px_rgba(56,189,248,0.35)]',
    purple: 'shadow-[0_0_50px_-20px_rgba(168,85,247,0.35)]',
    emerald: 'shadow-[0_0_50px_-20px_rgba(52,211,153,0.35)]',
    amber: 'shadow-[0_0_50px_-20px_rgba(251,191,36,0.35)]',
    red: 'shadow-[0_0_50px_-20px_rgba(248,113,113,0.35)]',
  };
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl ${
        glow ? glowShadow[glow] : ''
      } ${hover ? 'transition-all duration-300 hover:border-white/[0.16] hover:-translate-y-0.5' : ''} ${className}`}
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
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div>
          <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Big metric tile with icon, optional trend delta and accent gradient value. */
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
      <div className="flex items-center justify-between mb-3">
        <IconChip icon={icon} tone={tone} />
        {trend !== undefined && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.value >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'
            }`}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p
        className={`text-[1.75rem] leading-none font-bold tracking-tight ${
          accent ? 'bg-gradient-to-r from-sky-300 via-sky-200 to-purple-300 bg-clip-text text-transparent' : 'text-white'
        }`}
      >
        {value}
      </p>
      {trend?.label && <p className="text-[11px] text-white/30 mt-1.5">{trend.label}</p>}
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
    sky: 'bg-sky-400/15 text-sky-300',
    purple: 'bg-purple-400/15 text-purple-300',
    emerald: 'bg-emerald-400/15 text-emerald-300',
    amber: 'bg-amber-400/15 text-amber-300',
    red: 'bg-red-400/15 text-red-300',
    neutral: 'bg-white/10 text-white/50',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${toneClasses[tone]}`}>
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

/** A row list item with icon, title/subtitle, and trailing content — for the many "list of X" widgets. */
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
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors">
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
      <Icon size={22} strokeWidth={1.5} className="mb-2 opacity-50" />
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
          <span className="text-[10px] text-white/0 group-hover:text-white/50 transition-colors -mb-1">
            {formatValue ? formatValue(d.value) : d.value}
          </span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
            className="w-full rounded-t-md bg-gradient-to-t from-sky-400/40 to-purple-400/60 group-hover:from-sky-400/60 group-hover:to-purple-400/90 transition-colors"
          />
          <span className="text-[10px] text-white/30">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
