'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Send, X } from 'lucide-react';
import { sendRouteFor } from '@/lib/email-send-routes';

/**
 * Nothing leaves this application on one click.
 *
 * Every request that can put a message in somebody's inbox is held here
 * first, rendered as the client will actually see it, and sent only when
 * somebody says so.
 *
 * ## Why it wraps fetch rather than living in the buttons
 *
 * There are more than twenty send buttons across the admin, on screens
 * nobody edits together, and the next one will be written by whoever needs
 * it. A confirmation each button opts into is a confirmation that is missing
 * from the button somebody adds next month — and the only way to find out is
 * for a client to receive something.
 *
 * So the check sits at the one place every one of them goes through. A send
 * route is caught because of what it is, not because its button remembered.
 * Adding a screen adds nothing; the guard is already in front of it.
 *
 * Everything else passes through untouched: same promise, same response,
 * same errors. A request that is not on the list never even looks at this.
 */

interface Pending {
  action: string;
  emails: Array<{ to: string[]; subject: string; html: string; attachments?: string[] }>;
  /** Set when the preview itself failed, as opposed to there being none. */
  error?: string;
  resolve: (go: boolean) => void;
}

export function SendGuard() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [shown, setShown] = useState(0);
  // Read inside the patched fetch, which is installed once and would
  // otherwise close over the first render's setter forever.
  const open = useRef<((p: Omit<Pending, 'resolve'>) => Promise<boolean>) | null>(null);

  open.current = (p) =>
    new Promise<boolean>((resolve) => {
      setShown(0);
      setPending({ ...p, resolve });
    });

  useEffect(() => {
    const original = window.fetch;

    window.fetch = async function guarded(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      // Cheap check first: most requests in the admin are not sends, and
      // parsing a body for every one of them would be work for nothing.
      if (!sendRouteFor(url, method)) return original(input, init);

      /*
       * The body is read twice — once to preview, once to send — so it has
       * to be something that can be read twice. A string can; a stream
       * cannot, and re-sending a consumed one would send an empty request.
       * Anything else goes through unguarded rather than being corrupted,
       * which is the safer of two bad options.
       */
      const raw = init?.body;
      if (raw !== undefined && typeof raw !== 'string') return original(input, init);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = {};
      }

      // Again, now that the body is known: the endpoints that both log a
      // call and send an email only count as a send on one of those.
      const spec = sendRouteFor(url, method, parsed);
      if (!spec) return original(input, init);

      let preview: Omit<Pending, 'resolve'> = { action: spec.action, emails: [] };
      try {
        const res = await original('/api/admin/email/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previewOf: url, method, body: parsed }),
        });
        const data = await res.json();
        if (res.ok) preview = { action: data.action ?? spec.action, emails: data.emails ?? [] };
        else preview = { ...preview, error: data.error ?? 'The preview could not be built.' };
      } catch {
        preview = { ...preview, error: 'The preview could not be reached.' };
      }

      const go = await open.current?.(preview);
      if (!go) {
        // Shaped like a refusal from the server, so callers that read
        // `error` off a failed response say something sensible rather than
        // throwing on a shape they have never seen.
        return new Response(JSON.stringify({ error: 'Not sent — you cancelled it.', cancelled: true }), {
          status: 499,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return original(input, init);
    } as typeof window.fetch;

    return () => {
      window.fetch = original;
    };
  }, []);

  if (!pending) return null;

  const email = pending.emails[shown];
  const answer = (go: boolean) => {
    pending.resolve(go);
    setPending(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm before sending"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b0a12] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-semibold">{pending.action}?</p>
            <p className="mt-0.5 text-xs text-white/45">
              {email
                ? 'This is the email, exactly as it will arrive. Read it before you send it.'
                : 'Nothing here could be rendered in advance — read the warning below.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => answer(false)}
            aria-label="Cancel"
            className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {email ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-1 border-b border-white/8 px-5 py-3 text-xs">
              <p>
                <span className="text-white/35">To </span>
                <span className="font-medium text-white/85">
                  {email.to.filter(Boolean).join(', ') || (
                    <span className="text-amber-300">nobody — there is no address on file</span>
                  )}
                </span>
              </p>
              <p>
                <span className="text-white/35">Subject </span>
                <span className="font-medium text-white/85">{email.subject}</span>
              </p>
              {email.attachments && email.attachments.length > 0 && (
                <p>
                  <span className="text-white/35">Attached </span>
                  <span className="text-white/70">{email.attachments.join(', ')}</span>
                </p>
              )}
              {pending.emails.length > 1 && (
                <p className="pt-1 text-white/35">
                  Message {shown + 1} of {pending.emails.length}.{' '}
                  <button
                    type="button"
                    onClick={() => setShown((n) => (n + 1) % pending.emails.length)}
                    className="text-sky-300 hover:underline"
                  >
                    See the next one
                  </button>
                </p>
              )}
            </div>
            {/* Sandboxed: this is email HTML, and it renders here exactly as
                it will in the client's inbox — which means it must not be
                able to run anything or reach out of the frame. */}
            <iframe
              title="The email as it will arrive"
              sandbox=""
              srcDoc={email.html}
              className="h-[52vh] w-full bg-white"
            />
          </div>
        ) : (
          <div className="flex-1 px-5 py-6">
            <div className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="text-sm leading-relaxed text-white/70">
                <p className="font-semibold text-white/90">
                  {pending.error ?? 'This one cannot be shown in advance.'}
                </p>
                <p className="mt-1">
                  {pending.error
                    ? 'It will still send if you go ahead — the preview failing does not mean the send will.'
                    : 'The message is put together part-way through the send itself, so there is nothing to render yet. Go ahead only if you meant to.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
          <button
            type="button"
            onClick={() => answer(false)}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/75 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => answer(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            <Send size={14} />
            Send it
          </button>
        </div>
      </div>
    </div>
  );
}
