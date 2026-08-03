'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * The one dialog primitive.
 *
 * Every modal in the admin app was a positioned div: no role, no
 * aria-modal, no focus management. For a keyboard or screen-reader user
 * that means the dialog is announced as nothing, Tab walks straight out of
 * it into the page behind, and Escape does nothing — you can open a
 * destructive confirmation and be unable to find or leave it.
 *
 * This implements the four things a dialog owes its user:
 *   1. It is announced as a dialog, labelled by its own heading.
 *   2. Focus moves into it on open and returns to the trigger on close.
 *   3. Tab and Shift+Tab cycle within it.
 *   4. Escape and a backdrop click close it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  labelledById = 'modal-title',
  width = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  labelledById?: string;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const focusables = useCallback((): HTMLElement[] => {
    const root = panelRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }, []);

  // Remember who opened us, move focus in, and give it back on the way out.
  // Without the hand-back, closing a dialog drops focus onto <body> and a
  // keyboard user restarts from the top of the page every time.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const id = requestAnimationFrame(() => {
      const [first] = focusables();
      (first ?? panelRef.current)?.focus();
    });

    return () => {
      cancelAnimationFrame(id);
      previouslyFocused.current?.focus?.();
    };
  }, [open, focusables]);

  // Escape closes; Tab cycles. Capture phase so a child input can't swallow
  // Escape before the dialog sees it.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusables]);

  // The page behind a modal must not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledById}
            aria-describedby={description ? `${labelledById}-desc` : undefined}
            tabIndex={-1}
            className={`relative w-full ${width} rounded-2xl border border-white/10 bg-[#0b0810] p-6 shadow-2xl focus:outline-none`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <h2 id={labelledById} className="text-lg font-bold text-white mb-1">
              {title}
            </h2>
            {description && (
              <p id={`${labelledById}-desc`} className="text-sm text-white/55 leading-relaxed mb-5">
                {description}
              </p>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * "Are you sure?" for actions that destroy something.
 *
 * Deleting a deliverable, an onboarding question, or a task all fired
 * immediately on click with no undo and no confirmation — a mis-click on a
 * dense list permanently removed a file the client had been sent.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  error,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'normal';
  busy?: boolean;
  error?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      description={description}
      labelledById="confirm-title"
    >
      <div role="alert" aria-live="polite">
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            tone === 'danger'
              ? 'bg-red-500/20 text-red-200 ring-1 ring-red-400/40 hover:bg-red-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
