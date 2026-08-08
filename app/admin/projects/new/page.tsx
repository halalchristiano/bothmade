'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ADD_ON_REQUIRES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  dependentsOf,
  expandAddOnDependencies,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  minAllowedPrice,
  sanitizeCustomItems,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type CustomItem,
  type TimelineKey,
} from '@/lib/pricing';
import { AddOnPicker, BaseServicePicker } from '@/components/admin/AddOnPicker';

export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectForm />
    </Suspense>
  );
}

function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [baseService, setBaseService] = useState<BaseService>('website');
  const [addOns, setAddOns] = useState<AddOnKey[]>([]);
  const [clientType, setClientType] = useState<ClientType>('smb');
  const [timeline, setTimeline] = useState<TimelineKey>('standard');
  const [priceOverride, setPriceOverride] = useState('');
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [convertedFromLeadId, setConvertedFromLeadId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.type === 'user') setRole(data.user?.role || null);
      })
      .catch(() => {});
  }, []);

  // Pre-fill from a converted lead, e.g. /admin/projects/new?company=...&baseService=...
  useEffect(() => {
    const qCompany = searchParams.get('company');
    const qContactName = searchParams.get('contactName');
    const qClientEmail = searchParams.get('clientEmail');
    const qPhone = searchParams.get('phone');
    const qBaseService = searchParams.get('baseService');
    const qAddOns = searchParams.get('addOns');
    const qClientType = searchParams.get('clientType');
    const qTimeline = searchParams.get('timeline');
    const qCustomItems = searchParams.get('customItems');
    const qLeadId = searchParams.get('leadId');

    if (qCompany) setCompany(qCompany);
    if (qContactName) setContactName(qContactName);
    if (qClientEmail) setClientEmail(qClientEmail);
    if (qPhone) setPhone(qPhone);
    if (qBaseService && isBaseService(qBaseService)) setBaseService(qBaseService);
    if (qAddOns) {
      setAddOns(qAddOns.split(',').filter((a): a is AddOnKey => isAddOnKey(a)));
    }
    if (qClientType && isClientType(qClientType)) setClientType(qClientType);
    if (qTimeline && isTimelineKey(qTimeline)) setTimeline(qTimeline);
    if (qCustomItems) {
      try {
        setCustomItems(sanitizeCustomItems(JSON.parse(qCustomItems)));
      } catch {
        // malformed query param — ignore rather than block the whole form
      }
    }
    if (qLeadId) setConvertedFromLeadId(qLeadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const breakdown = useMemo(
    () => calculatePrice({ baseService, addOns, clientType, timeline }),
    [baseService, addOns, clientType, timeline]
  );
  const customTotal = customItemsTotal(customItems);
  const grandTotal = breakdown.totalPrice + customTotal;

  const toggleAddOn = (key: AddOnKey) => {
    setAddOns((prev) => {
      if (prev.includes(key)) {
        const toRemove = new Set([key, ...dependentsOf(key, prev)]);
        return prev.filter((a) => !toRemove.has(a));
      }
      return expandAddOnDependencies([...prev, key]);
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail,
          company,
          contactName,
          phone,
          baseService,
          addOns,
          clientType,
          timeline,
          customItems,
          totalPriceOverride: priceOverride ? Number(priceOverride) * 100 : undefined,
          convertedFromLeadId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        router.push(`/admin/projects/${data.project.id}`);
      } else {
        setError(data.error || 'Failed to create project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  const canSubmit = clientEmail && company && contactName && !saving;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Link href="/admin/projects" className="text-white/50 hover:text-white text-sm transition-colors">
        ← Back to Projects
      </Link>

      <h1 className="text-3xl font-semibold mt-4 mb-2">New Project</h1>
      <p className="text-white/40 mb-8 text-sm">
        Manually create a client and project — for deals closed outside Stripe (bank transfer,
        invoice, cash).
      </p>

      <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-8 space-y-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
        <div>
          <h2 className="text-lg font-semibold mb-4">Client</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Contact Name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-white/30 mt-1">
                If this email already exists, the project is added to that client.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10">
          <h2 className="text-lg font-semibold mb-4">Project</h2>
          <div className="mb-4">
            <BaseServicePicker value={baseService} onChange={setBaseService} />
          </div>

          {/* Grouped by category and honouring what the base price already
              includes — this form used to list every add-on flat and let you
              tick one a Web App already covers, quoting it twice. */}
          <div className="mb-4">
            <AddOnPicker baseService={baseService} selected={addOns} onToggle={toggleAddOn} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Client Type</label>
              <select
                value={clientType}
                onChange={(e) => setClientType(e.target.value as ClientType)}
                className={inputClass}
              >
                {(Object.entries(CLIENT_TYPES) as [ClientType, (typeof CLIENT_TYPES)[ClientType]][]).map(
                  ([key, type]) => (
                    <option key={key} value={key} className="bg-[#05030a]">
                      {type.label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Timeline</label>
              <select
                value={timeline}
                onChange={(e) => setTimeline(e.target.value as TimelineKey)}
                className={inputClass}
              >
                {(Object.entries(TIMELINES) as [TimelineKey, (typeof TIMELINES)[TimelineKey]][]).map(
                  ([key, tl]) => (
                    <option key={key} value={key} className="bg-[#05030a]">
                      {tl.label} ({tl.weeks})
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {customItems.length > 0 && (
            <div className="rounded-lg border-2 border-amber-400/40 bg-amber-400/10 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
                ⚠ Custom items carried over from the proposal — not in the standard catalogue
              </p>
              {customItems.map((item, i) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between font-medium text-white">
                    <span>{item.label}</span>
                    <span>{formatCents(item.priceCents)}</span>
                  </div>
                  {/* The scope as the contract states it — the person who
                      builds this needs it more than the person who sold it. */}
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-white/60">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-white/70">
              Override price (optional, USD) — suggested: {formatCents(grandTotal)}
            </label>
            <input
              type="number"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              placeholder={String(grandTotal / 100)}
              className={inputClass}
            />
            {role === 'sales' && (
              <p className="text-xs text-white/30 mt-1.5">
                You can discount down to {formatCents(minAllowedPrice(grandTotal))} without approval. Lower needs Kiana.
              </p>
            )}
          </div>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-white py-3 font-semibold text-ink disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saving ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
