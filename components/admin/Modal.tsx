'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * The overlay contract every dialog in the admin owes a keyboard user, in one
 * place: focus moves in on open and back to wherever it came from on close,
 * Tab cycles inside the panel instead of escaping to the page behind it,
 * Escape closes, and screen readers are told a dialog opened and what it's
 * called. Each modal previously hand-rolled its own `fixed inset-0` div and
 * got none of that.
 */

/** Elements that can hold focus — the Tab cycle is built from these, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Whether an element is actually on screen, walking up to `root` because a
 * `display: none` ancestor hides its children without changing their own
 * computed display. This matters for the responsive panes in the composers,
 * where a whole preview column is `hidden` below the md breakpoint and must
 * not swallow a Tab.
 *
 * Deliberately computed-style based rather than `offsetParent`: the panel
 * lives inside a fixed-position backdrop, where `offsetParent` is unreliable
 * across engines and absent entirely in a layout-less test environment.
 */
function isVisible(el: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node === root) break;
    node = node.parentElement;
  }
  return true;
}

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el === document.activeElement || isVisible(el, container)
  );
}

/**
 * Traps Tab within `ref`, closes on Escape, and restores focus to the
 * previously focused element on unmount. Exported separately from `Modal` for
 * the handful of overlays that can't use the standard panel chrome.
 */
export function useDialog(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  // Kept in a ref so a caller passing an inline arrow function doesn't
  // re-run the effect (and re-steal focus) on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Prefer the first real control; fall back to the panel itself so focus
    // is never left behind on the page underneath.
    const initial = focusableWithin(container)[0] ?? container;
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [ref]);
}

export function Modal({
  title,
  subtitle,
  onClose,
  /** Tailwind max-width for the panel — modals range from a confirm box to a two-pane composer. */
  size = 'max-w-lg',
  /** Extra classes on the panel, for the modals that manage their own scroll regions. */
  panelClassName = '',
  /** Set false when the panel renders its own header (a two-column composer, say). */
  showHeader = true,
  /** Clicking the backdrop closes by default; off for anything mid-edit that would lose work. */
  closeOnBackdrop = true,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  size?: string;
  panelClassName?: string;
  showHeader?: boolean;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  useDialog(panelRef, onClose);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdrop && e.target === e.currentTarget) onClose();
    },
    [closeOnBackdrop, onClose]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // With the standard header the visible <h2> names the dialog, which
        // keeps it in the page's heading outline. A panel that draws its own
        // chrome gets a plain aria-label instead — duplicating the title into
        // a hidden heading would put the same text in the outline twice.
        {...(showHeader
          ? { 'aria-labelledby': titleId, 'aria-describedby': subtitle ? subtitleId : undefined }
          : { 'aria-label': title })}
        tabIndex={-1}
        className={`w-full ${size} rounded-2xl border border-white/10 bg-[#0a0812] shadow-2xl outline-none ${panelClassName}`}
      >
        {showHeader ? (
          <>
            <div className="flex justify-between items-start gap-3 p-6 pb-4">
              <div>
                <h2 id={titleId} className="text-lg font-bold">
                  {title}
                </h2>
                {subtitle && (
                  <p id={subtitleId} className="text-xs text-white/40 mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              <ModalCloseButton onClose={onClose} />
            </div>
            <div className="px-6 pb-6">{children}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** The standard × — always labelled, since the glyph alone announces nothing. */
export function ModalCloseButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close dialog"
      className={`text-white/40 hover:text-white transition-colors shrink-0 ${className}`}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}
