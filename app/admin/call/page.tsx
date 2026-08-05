'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Headset, PhoneCall } from 'lucide-react';
import { BrandButton, Kicker, PageIn, PageTitle } from '@/components/admin/ui';
import { QueueView } from '@/components/admin/sales/QueueView';

/**
 * /admin/call — Call HQ.
 *
 * This used to be a redirect with no content of its own: it asked the
 * call-list who was top of the queue and threw you straight into that lead's
 * cockpit. That is the right thing when you have just pressed "Start
 * calling" — and the wrong thing when you clicked "Call HQ" in the sidebar,
 * because the sidebar link then never showed Call HQ at all. It showed
 * whoever happened to be first, over and over, with no way to see the room
 * you were standing in.
 *
 * So the two intents are now separate:
 *
 *  - `/admin/call` is a real page — the ranked queue, who's next, and one
 *    button to get going.
 *  - `/admin/call?start=1` keeps the old dive-straight-in behaviour for the
 *    "Start calling" buttons on the dashboard and the sales screen, which
 *    are pressed by someone who already knows what they want.
 *
 * The per-lead cockpit at `/admin/call/[leadId]` is untouched.
 */

/** Reads the flag off window rather than useSearchParams() so this page still
 *  prerenders without a Suspense boundary — same reason /admin/sales does. */
function wantsStraightIn(): boolean {
  const value = new URLSearchParams(window.location.search).get('start');
  return value === '1' || value === 'true';
}

export default function CallHqIndex() {
  const router = useRouter();
  // 'checking' lasts only as long as it takes to read the URL, so the queue
  // never flashes up underneath someone who asked to be sent straight in.
  const [mode, setMode] = useState<'checking' | 'jumping' | 'home'>('checking');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  /**
   * Find whoever is top of the queue and open their call. Shared by the
   * ?start=1 redirect and the button on the page, because "who do I ring
   * next" has exactly one answer and it lives in the call-list API.
   */
  const openTopOfQueue = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch('/api/admin/leads/call-list');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!data?.success) {
        setStartError("Couldn't load the queue — refresh to retry.");
        return;
      }
      const first = data.callable?.[0];
      if (first) {
        router.replace(`/admin/call/${first.id}`);
        return;
      }
      // Nobody to call. Don't strand them on a spinner — show the page, which
      // says so properly and offers somewhere to go next.
      setStartError(null);
      setMode('home');
    } catch {
      setStartError("Couldn't load the queue — refresh to retry.");
    } finally {
      setStarting(false);
    }
  }, [router]);

  useEffect(() => {
    if (wantsStraightIn()) {
      setMode('jumping');
      void openTopOfQueue();
    } else {
      setMode('home');
    }
  }, [openTopOfQueue]);

  if (mode !== 'home') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-8">
        {startError ? (
          <div className="text-center max-w-sm">
            <p className="text-amber-300 text-sm mb-4">{startError}</p>
            <Link href="/admin/call" className="text-sm text-sky-300 hover:underline">
              Open Call HQ →
            </Link>
          </div>
        ) : (
          <p className="text-white/40 text-sm">Finding who to call…</p>
        )}
      </div>
    );
  }

  return (
    <PageIn className="px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div className="min-w-0">
          <Kicker className="mb-2">Sales</Kicker>
          <PageTitle icon={Headset} title="Call HQ" />
          <p className="text-white/40 mt-1">
            Everyone worth ringing today, most urgent first. Open one to get the script.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BrandButton
            onClick={() => void openTopOfQueue()}
            disabled={starting}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <PhoneCall size={16} />
            {starting ? 'Finding…' : 'Start at the top'}
          </BrandButton>
        </div>
      </div>

      {startError && <p className="text-amber-300 text-sm mb-4">{startError}</p>}

      {/* The same ranked queue the sales screen shows. One list, one order,
          one set of rules — a second implementation would only ever drift. */}
      <QueueView />
    </PageIn>
  );
}
