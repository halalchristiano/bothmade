'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A small "i" icon that shows plain-English detail on hover (desktop) or tap
 * (touch/keyboard) without submitting whatever form it's dropped into.
 */
export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClickAway);
    return () => document.removeEventListener('click', onClickAway);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
        aria-label="More info"
        aria-expanded={open}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/30 text-[10px] leading-none text-white/50 hover:border-white/60 hover:text-white/80 transition-colors cursor-pointer"
      >
        i
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 p-3 text-xs leading-relaxed text-white/80 shadow-xl backdrop-blur-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
