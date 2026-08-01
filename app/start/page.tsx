'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  ADD_ON_CATEGORIES,
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  formatCents,
  type AddOnCategory,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';

const ADD_ONS_BY_CATEGORY = Object.entries(ADD_ONS).reduce(
  (acc, [key, addOn]) => {
    (acc[addOn.category] ??= []).push(key as AddOnKey);
    return acc;
  },
  {} as Record<AddOnCategory, AddOnKey[]>
);

export default function StartPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [interestLoading, setInterestLoading] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [interestError, setInterestError] = useState('');

  const [baseService, setBaseService] = useState<BaseService>('website');
  const [addOns, setAddOns] = useState<AddOnKey[]>([]);
  const [clientType, setClientType] = useState<ClientType>('smb');
  const [timeline, setTimeline] = useState<TimelineKey>('standard');

  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');

  const breakdown = useMemo(
    () => calculatePrice({ baseService, addOns, clientType, timeline }),
    [baseService, addOns, clientType, timeline]
  );

  const toggleAddOn = (key: AddOnKey) => {
    setAddOns((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const handleCheckout = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseService,
          addOns,
          clientType,
          timeline,
          clientEmail: email,
          company,
          contactName,
          phone,
        }),
      });

      const data = await response.json();

      if (data.success) {
        window.location.href = data.redirectUrl;
      } else {
        setError(data.error || 'Error creating checkout session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterInterest = async () => {
    setInterestError('');
    setInterestLoading(true);
    try {
      const response = await fetch('/api/start/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName,
          email,
          company,
          phone,
          baseService,
          addOns,
          clientType,
          timeline,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setInterestSent(true);
      } else {
        setInterestError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setInterestError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInterestLoading(false);
    }
  };

  const canSubmit = email && company && contactName;
  const cardClass = (active: boolean) =>
    `text-left rounded-xl p-5 border transition-all ${
      active
        ? 'bg-gradient-to-r from-sky-400/20 to-purple-500/20 border-sky-400/50 shadow-lg'
        : 'bg-white/5 border-white/10 hover:border-white/25'
    }`;
  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <div className="max-w-5xl mx-auto px-6 pt-32 pb-16">
        <div className="text-center mb-14">
          <h1 className="text-5xl font-bold mb-6 tracking-tight">Build Your Project</h1>
          <p className="text-xl text-white/50">
            Configure your project and see transparent pricing update live.
          </p>
        </div>

        {/* Step 1: Base service */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">1. What are we building?</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {(Object.entries(BASE_SERVICES) as [BaseService, (typeof BASE_SERVICES)[BaseService]][]).map(
              ([key, service]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBaseService(key)}
                  className={cardClass(baseService === key)}
                >
                  <h3 className="font-semibold mb-1">{service.label}</h3>
                  <p className="text-sm mb-3 text-white/50">{service.description}</p>
                  <p className="text-sm font-medium">{formatCents(service.price)}</p>
                </button>
              )
            )}
          </div>
        </section>

        {/* Step 2: Add-ons */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-2">2. Add-ons</h2>
          <p className="text-white/40 text-sm mb-6">
            Pick as many as you need — every price shown is exactly what it adds, nothing hidden.
          </p>
          <div className="space-y-8">
            {(Object.entries(ADD_ONS_BY_CATEGORY) as [AddOnCategory, AddOnKey[]][]).map(
              ([category, keys]) => (
                <div key={category}>
                  <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/40 mb-3">
                    {ADD_ON_CATEGORIES[category].label}
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {keys.map((key) => {
                      const addOn = ADD_ONS[key];
                      return (
                        <label
                          key={key}
                          className={`${cardClass(addOns.includes(key))} flex items-start gap-3 cursor-pointer`}
                        >
                          <input
                            type="checkbox"
                            checked={addOns.includes(key)}
                            onChange={() => toggleAddOn(key)}
                            className="mt-1"
                          />
                          <div>
                            <h4 className="font-semibold mb-1">{addOn.label}</h4>
                            <p className="text-sm mb-2 text-white/50">{addOn.description}</p>
                            <p className="text-sm font-medium">+{formatCents(addOn.price)}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* Step 3: Client type */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">3. Which best describes you?</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {(Object.entries(CLIENT_TYPES) as [ClientType, (typeof CLIENT_TYPES)[ClientType]][]).map(
              ([key, type]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClientType(key)}
                  className={cardClass(clientType === key)}
                >
                  <h3 className="font-semibold mb-1">{type.label}</h3>
                  <p className="text-sm text-white/50">{type.description}</p>
                </button>
              )
            )}
          </div>
        </section>

        {/* Step 4: Timeline */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">4. Timeline</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {(Object.entries(TIMELINES) as [TimelineKey, (typeof TIMELINES)[TimelineKey]][]).map(
              ([key, tl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTimeline(key)}
                  className={cardClass(timeline === key)}
                >
                  <h3 className="font-semibold mb-1">{tl.label}</h3>
                  <p className="text-sm mb-2 text-white/50">{tl.weeks}</p>
                  <p className="text-xs text-white/40">{tl.description}</p>
                </button>
              )
            )}
          </div>
        </section>

        {/* Price breakdown */}
        <section className="mb-12 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Price Breakdown</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">{BASE_SERVICES[baseService].label}</span>
              <span>{formatCents(breakdown.basePrice)}</span>
            </div>
            {addOns.map((key) => (
              <div key={key} className="flex justify-between">
                <span className="text-white/50">{ADD_ONS[key].label}</span>
                <span>+{formatCents(ADD_ONS[key].price)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/10 pt-3">
              <span className="text-white/50">Subtotal</span>
              <span>{formatCents(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">{CLIENT_TYPES[clientType].label} adjustment</span>
              <span>×{breakdown.clientTypeMultiplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">{TIMELINES[timeline].label} timeline</span>
              <span>×{breakdown.timelineMultiplier}</span>
            </div>
          </div>
          <div className="flex justify-between items-center border-t border-white/10 mt-4 pt-4">
            <span className="text-xl font-bold">Total</span>
            <span className="text-3xl font-bold">{formatCents(breakdown.totalPrice)}</span>
          </div>
        </section>

        {/* Contact form */}
        <section id="contact-form" className="max-w-2xl mx-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Get Started</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Contact Name</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Doe"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@company.com"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Your company"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={inputClass}
              />
            </div>
          </div>

          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

          <button
            onClick={handleCheckout}
            disabled={!canSubmit || loading}
            className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-4 font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {loading ? 'Processing...' : `Proceed to Checkout — ${formatCents(breakdown.totalPrice)}`}
          </button>

          <p className="text-center text-sm text-white/40 mt-3">Secure payment powered by Stripe</p>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-white/30 uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {interestSent ? (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-300 text-sm text-center">
              Got it — we've got your selections and will be in touch shortly.
            </div>
          ) : (
            <>
              <button
                onClick={handleRegisterInterest}
                disabled={!canSubmit || interestLoading}
                className="w-full rounded-lg border border-white/20 py-3.5 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/40 hover:bg-white/5 transition-colors"
              >
                {interestLoading ? 'Sending...' : "Not ready to pay — just send us your picks"}
              </button>
              {interestError && <div className="text-red-400 text-sm mt-2 text-center">{interestError}</div>}
              <p className="text-center text-xs text-white/30 mt-3">
                No payment, no commitment — we'll follow up to talk it through.
              </p>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-white/50 text-sm">
              Already a client?{' '}
              <Link href="/client/login" className="text-sky-300 font-semibold hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </div>

      <Footer />
    </main>
  );
}
