'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BrandButton } from '@/components/admin/ui';

/**
 * British leads in an American book, and the way out of them.
 *
 * They arrive from scrapes that wandered and directories with mixed
 * listings, and every one is a lead nobody will ever ring — taking up room in
 * counts, in the call sheet's ordering, and in a daily send budget that
 * exists because the account was once restricted for sending too much. There
 * is no country filter anywhere in the admin, so until now they could not
 * even be found.
 *
 * Renders NOTHING when there are none, which is the ordinary state. A
 * permanent panel offering to delete leads is a panel somebody eventually
 * presses by accident, and one that usually says "0 found" is one people stop
 * reading — which is the same failure as a badge that never clears.
 *
 * The list is shown before anything goes, and the count somebody read is sent
 * back with the delete. Deleting a lead takes its whole history with it and
 * there is no undo, so the price of getting it wrong is not a refresh.
 */
interface UkLead {
  id: string;
  company: string;
  phone: string | null;
  country: string | null;
  reason: 'country' | 'phone' | null;
}

export function UkSweep({ onDeleted }: { onDeleted: () => void }) {
  const [count, setCount] = useState(0);
  const [byCountry, setByCountry] = useState(0);
  const [byPhone, setByPhone] = useState(0);
  const [leads, setLeads] = useState<UkLead[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [showList, setShowList] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/leads/uk-sweep');
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.count ?? 0);
      setByCountry(data.byCountry ?? 0);
      setByPhone(data.byPhone ?? 0);
      setLeads(data.leads ?? []);
      setTruncated(Boolean(data.truncated));
    } catch {
      /* a cleanup panel that cannot load is a panel that stays hidden */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/leads/uk-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The number that was on screen, not the number that matches now.
        body: JSON.stringify({ expectedCount: count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't remove them.");
        // A 409 means the book moved underneath the preview, so the only
        // useful next thing is the new list.
        if (res.status === 409) await load();
        setConfirming(false);
        return;
      }
      setDone(`${data.deleted} UK ${data.deleted === 1 ? 'lead' : 'leads'} removed.`);
      setCount(0);
      setLeads([]);
      setConfirming(false);
      onDeleted();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setWorking(false);
    }
  };

  if (done) {
    return <p className="mt-3 text-xs text-emerald-300">{done}</p>;
  }
  if (count === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100">
        <AlertTriangle size={14} />
        {count} UK {count === 1 ? 'business' : 'businesses'} in the book
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
        {byPhone > 0 && `${byPhone} by phone number`}
        {byPhone > 0 && byCountry > 0 && ', '}
        {byCountry > 0 && `${byCountry} by country`}. These are counted in your totals and take up
        room on the call sheet.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowList((v) => !v)}
          className="text-xs font-semibold text-amber-200 underline underline-offset-2 hover:text-white"
        >
          {showList ? 'Hide the list' : 'Show me which ones'}
        </button>
        {confirming ? (
          <>
            <BrandButton onClick={remove} disabled={working} className="text-xs">
              {working ? 'Removing…' : `Yes — delete all ${count}`}
            </BrandButton>
            <BrandButton variant="quiet" onClick={() => setConfirming(false)} className="text-xs">
              Cancel
            </BrandButton>
          </>
        ) : (
          <BrandButton variant="quiet" onClick={() => setConfirming(true)} className="text-xs">
            Delete them
          </BrandButton>
        )}
      </div>

      {confirming && (
        <p className="mt-2 text-xs text-amber-100">
          This removes the businesses and everything logged against them. There is no undo.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {showList && (
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
          {leads.map((l) => (
            <p key={l.id} className="text-xs text-white/55">
              <span className="text-white/80">{l.company}</span>
              {l.phone ? ` · ${l.phone}` : ''}
              {l.country ? ` · ${l.country}` : ''}
              <span className="text-white/30"> — matched on {l.reason}</span>
            </p>
          ))}
          {truncated && (
            <p className="text-xs text-amber-200/70">
              Showing the first {leads.length}. Deleting removes all {count}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
