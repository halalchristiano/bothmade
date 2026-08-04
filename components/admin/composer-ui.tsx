'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * The controls the email composers are built from.
 *
 * The composer had grown into one undifferentiated column of identically
 * weighted boxes — recipient, template, subject, body, button, attachments,
 * all shouting equally, with the Send button pushed below the fold. These
 * exist so the two composers share one set of surfaces and one type scale,
 * and so hierarchy comes from spacing and weight rather than from giving
 * every single field its own bordered tile.
 */

export const inputClasses =
  'w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-[13.5px] text-white ' +
  'placeholder:text-white/25 transition-[border-color,background-color,box-shadow] duration-150 ' +
  'hover:border-white/[0.16] focus:border-sky-400/50 focus:bg-white/[0.05] focus:outline-none ' +
  'focus:ring-[3px] focus:ring-sky-400/15';

/** A labelled control. The label is quiet; the value is what should read. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  warning,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Neutral guidance, under the control. */
  hint?: string;
  /** Guidance that should give someone pause — amber, not grey. */
  warning?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-1.5 text-[12.5px] text-white/45">
        {label}
        {/* Optional is the exception worth marking. Flagging the required
            ones instead put a marker beside most labels in the panel, which
            says nothing — everything looked equally urgent. */}
        {!required && <span className="text-[11px] text-white/20">Optional</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-[12px] leading-snug text-red-300">{error}</p>}
      {!error && warning && <p className="mt-1.5 text-[12px] leading-snug text-amber-200/70">{warning}</p>}
      {!error && hint && <p className="mt-1.5 text-[12px] leading-snug text-white/30">{hint}</p>}
    </div>
  );
}

/** A titled block of fields, separated by a hairline rather than a border box. */
export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-white/[0.06] px-6 py-5 first:border-t-0 ${className}`}>
      {(title || action) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          {title && <h3 className="text-[12.5px] font-semibold text-white/70">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  /** Options sharing a group render under one heading, in array order. */
  group?: string;
}

/**
 * A listbox, in place of a native `<select>`.
 *
 * The template picker is a flat list of seventeen options whose names alone
 * don't say when to reach for each one — a native select can't show the
 * description that does. This can, and it keeps the dark surface instead of
 * dropping an OS-styled white menu into the middle of the panel.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  id,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Scroll the active option into view as the arrow keys move through a list
  // that is taller than the popover.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
    }
  };

  let lastGroup: string | undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        className={`${inputClasses} flex items-center justify-between gap-3 text-left ${open ? 'border-sky-400/50 bg-white/[0.05]' : ''}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-white">{selected?.label}</span>
          {selected?.description && (
            <span className="mt-0.5 block truncate text-[12px] text-white/35">{selected.description}</span>
          )}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="absolute z-30 mt-1.5 max-h-[19rem] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#12101c]/95 p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          {options.map((option, index) => {
            const isNewGroup = option.group && option.group !== lastGroup;
            lastGroup = option.group;
            const isSelected = option.value === value;
            return (
              <li key={option.value}>
                {isNewGroup && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-white/25">
                    {option.group}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    index === activeIndex ? 'bg-white/[0.07]' : ''
                  }`}
                >
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 text-sky-300 ${isSelected ? '' : 'invisible'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] leading-snug text-white">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block text-[12px] leading-snug text-white/35">{option.description}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** iOS-style segmented control — one choice from a small, visible set. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-[11px] border border-white/[0.07] bg-white/[0.03] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-[9px] transition-all duration-150 ${
              size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]'
            } ${
              active
                ? 'bg-white/[0.11] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                : 'text-white/45 hover:text-white/75'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The initials disc in front of a recipient, as in a mail client. */
export function Avatar({ name, email }: { name?: string; email: string }) {
  const source = (name || email).trim();
  const initials =
    source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/25 to-purple-500/25 text-[11.5px] font-semibold text-white/80 ring-1 ring-inset ring-white/10"
    >
      {initials}
    </span>
  );
}

/** The one filled, do-the-thing button. Everything else is quieter than it. */
export function PrimaryButton({
  children,
  disabled,
  onClick,
  title,
  className = '',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-sky-300 to-sky-500 px-5 py-2.5 text-[13.5px] font-semibold text-[#04121c] shadow-[0_6px_18px_-6px_rgba(56,189,248,0.7)] transition-all duration-150 hover:brightness-[1.07] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border border-white/[0.09] px-4 py-2.5 text-[13.5px] font-medium text-white/70 transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.04] hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}
