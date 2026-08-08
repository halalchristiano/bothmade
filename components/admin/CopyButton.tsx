'use client';

import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/lib/copy-to-clipboard';

/**
 * A copy button that says what happened.
 *
 * Three states rather than one: idle, "Copied", and — the one that did not
 * exist before — "Couldn't copy". The clipboard can genuinely refuse (no
 * secure context, permission denied), and a button that looks identical
 * whether it worked or not teaches people to paste somewhere and check every
 * single time.
 *
 * The label goes back to itself after a couple of seconds so the row does not
 * end up permanently green, and the timer is cleared on unmount — the invoice
 * ledger reloads after every action, so these unmount constantly and a
 * setState on a dead component is a warning nobody can act on.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = 'Copied',
  className = 'text-white/50 hover:text-white transition-colors',
  title,
}: {
  value: string;
  label: string;
  copiedLabel?: string;
  className?: string;
  title?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const ok = await copyToClipboard(value);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      // The failure needs to be readable, not just different: somebody who
      // cannot copy has to select the link by hand instead, and needs to know
      // that before they paste an empty clipboard into an email.
      title={state === 'failed' ? 'Your browser blocked the clipboard — select the link and copy it by hand.' : title}
      className={
        state === 'copied'
          ? 'text-emerald-300 transition-colors'
          : state === 'failed'
            ? 'text-amber-300 transition-colors'
            : className
      }
    >
      {state === 'copied' ? copiedLabel : state === 'failed' ? "Couldn't copy" : label}
    </button>
  );
}
