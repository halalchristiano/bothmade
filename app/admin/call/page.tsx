'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';

/**
 * /admin/call — the front door to Call HQ.
 *
 * No content of its own: it asks the call-list who should be called first
 * and drops the rep straight into the cockpit for that lead. The queue
 * already ranks by reason (replied > bounced > overdue > today > ...), so
 * "just start calling" is one click from anywhere.
 */
export default function CallHqIndex() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/admin/leads/call-list')
      .then((res) => {
        if (res.status === 401) {
          router.push('/admin/login');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!data?.success) {
          setState('error');
          return;
        }
        const first = data.callable?.[0];
        if (first) {
          router.replace(`/admin/call/${first.id}`);
        } else {
          setState('empty');
        }
      })
      .catch(() => setState('error'));
  }, [router]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8">
      {state === 'loading' && <p className="text-white/40 text-sm">Finding who to call…</p>}
      {state === 'empty' && (
        <div className="text-center max-w-sm">
          <PhoneCall size={28} className="mx-auto text-emerald-300 mb-4" />
          <h1 className="text-lg font-semibold mb-2">Queue&apos;s clear.</h1>
          <p className="text-sm text-white/40 mb-6">
            Nobody needs a call right now. New replies, overdue follow-ups and fresh leads will
            land here as they come in.
          </p>
          <Link href="/admin/sales?view=queue" className="text-sm text-sky-300 hover:underline">
            See the full call list →
          </Link>
        </div>
      )}
      {state === 'error' && (
        <p className="text-amber-300 text-sm">Couldn&apos;t load the queue — refresh to retry.</p>
      )}
    </div>
  );
}
