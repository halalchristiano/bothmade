'use client';

import { useEffect, useState } from 'react';
import { Tags, RotateCcw } from 'lucide-react';
import { Card, CardHeader } from '@/components/admin/ui';

interface PriceRow {
  key: string;
  label: string;
  description?: string;
  category?: string;
  value: number;
  defaultValue: number;
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface PricingData {
  multiplierScale: number;
  baseServices: PriceRow[];
  addOns: PriceRow[];
  clientTypes: PriceRow[];
  timelines: PriceRow[];
}

/**
 * Prices, editable without a deploy.
 *
 * lib/pricing.ts still owns what each item *is* — its label, its copy, what
 * it depends on — because that is product wording that belongs in review.
 * Only cost is editable here, and every row shows the shipped price beside
 * the current one, so it is always obvious what has been changed and what
 * reverting would restore.
 */
export function PricingSettings() {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);

  const load = async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/pricing');
      if (res.status === 401) return;
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Couldn't load pricing.");
        return;
      }
      setData(body);
      setDrafts({});
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isMultiplier = (key: string) =>
    key.startsWith('clientType:') || key.startsWith('timeline:');

  /** Cents → whole currency units; multiplier ints → a ×N.NN reading. */
  const toDisplay = (key: string, value: number, scale: number) =>
    isMultiplier(key) ? (value / scale).toFixed(2) : String(Math.round(value / 100));

  const fromDisplay = (key: string, text: string, scale: number) =>
    isMultiplier(key) ? Math.round(Number(text) * scale) : Math.round(Number(text) * 100);

  const save = async (row: PriceRow, raw: string | null) => {
    if (!data) return;
    setBusyKey(row.key);
    setRowError(null);
    try {
      const value = raw === null ? null : fromDisplay(row.key, raw, data.multiplierScale);
      if (value !== null && !Number.isFinite(value)) {
        setRowError({ key: row.key, message: 'That needs to be a number.' });
        return;
      }
      const res = await fetch('/api/admin/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.key, value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setRowError({ key: row.key, message: body?.error ?? "That didn't save." });
        return;
      }
      await load();
    } catch {
      setRowError({ key: row.key, message: 'Could not reach the server.' });
    } finally {
      setBusyKey(null);
    }
  };

  const renderGroup = (heading: string, rows: PriceRow[], prefix: string) => {
    if (!data || rows.length === 0) return null;
    return (
      <div key={heading} className="mb-6 last:mb-0">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
          {heading}
        </h3>
        <div className="space-y-1">
          {rows.map((row) => {
            const current = toDisplay(row.key, row.value, data.multiplierScale);
            const shipped = toDisplay(row.key, row.defaultValue, data.multiplierScale);
            const draft = drafts[row.key] ?? current;
            const dirty = draft !== current;

            return (
              <div key={row.key} className="rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`price-${row.key}`} className="text-sm text-white/85">
                      {row.label}
                    </label>
                    {row.overridden && (
                      <span className="ml-2 text-[11px] text-amber-300">
                        changed from {prefix}
                        {shipped}
                        {row.updatedBy ? ` by ${row.updatedBy}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-white/35 text-sm">{prefix}</span>
                    <input
                      id={`price-${row.key}`}
                      type="number"
                      inputMode="decimal"
                      step={isMultiplier(row.key) ? '0.05' : '50'}
                      value={draft}
                      disabled={busyKey === row.key}
                      onChange={(e) => setDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && dirty && save(row, draft)}
                      className="w-28 px-2 py-1.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                    />
                    {dirty && (
                      <button
                        onClick={() => save(row, draft)}
                        disabled={busyKey === row.key}
                        className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-2.5 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                      >
                        {busyKey === row.key ? 'Saving…' : 'Save'}
                      </button>
                    )}
                    {row.overridden && !dirty && (
                      <button
                        onClick={() => save(row, null)}
                        disabled={busyKey === row.key}
                        aria-label={`Revert ${row.label} to the shipped price`}
                        title="Revert to shipped price"
                        className="p-1.5 rounded-lg text-white/30 hover:text-white transition-colors"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div role="alert" aria-live="polite">
                  {rowError?.key === row.key && (
                    <p className="mt-1 text-xs text-red-400">{rowError.message}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6">
      <CardHeader
        icon={Tags}
        tone="emerald"
        title="Pricing"
        subtitle="What everything costs, without a deploy"
      />

      <p className="mb-5 text-xs text-white/40 leading-relaxed">
        These are the prices the calculator, proposals, contracts and invoices all quote from.
        Changing one affects every new quote from now on — it does not touch a proposal already
        sent, or a contract already signed.
      </p>

      <div role="alert" aria-live="polite">
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-white/30">Loading…</p>
      ) : !data ? null : (
        <>
          {renderGroup('Base services', data.baseServices, '$')}
          {renderGroup('Add-ons', data.addOns, '$')}
          {renderGroup('Organisation adjustment', data.clientTypes, '×')}
          {renderGroup('Timeline adjustment', data.timelines, '×')}
        </>
      )}
    </Card>
  );
}
