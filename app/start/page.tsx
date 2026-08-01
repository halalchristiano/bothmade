'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  formatCents,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';

export default function StartPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const canCheckout = email && company && contactName && !loading;

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            Bothmade
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-5xl font-bold mb-6">Build Your Project</h1>
          <p className="text-xl text-gray-600">
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
                  className={`text-left rounded-xl p-5 border transition-all ${
                    baseService === key
                      ? 'bg-black text-white border-black shadow-lg'
                      : 'bg-white text-black border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <h3 className="font-semibold mb-1">{service.label}</h3>
                  <p className={`text-sm mb-3 ${baseService === key ? 'opacity-80' : 'text-gray-600'}`}>
                    {service.description}
                  </p>
                  <p className="text-sm font-medium">{formatCents(service.price)}</p>
                </button>
              )
            )}
          </div>
        </section>

        {/* Step 2: Add-ons */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">2. Add-ons</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {(Object.entries(ADD_ONS) as [AddOnKey, (typeof ADD_ONS)[AddOnKey]][]).map(
              ([key, addOn]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 rounded-xl p-5 border cursor-pointer transition-all ${
                    addOns.includes(key)
                      ? 'bg-black text-white border-black shadow-lg'
                      : 'bg-white text-black border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={addOns.includes(key)}
                    onChange={() => toggleAddOn(key)}
                    className="mt-1"
                  />
                  <div>
                    <h3 className="font-semibold mb-1">{addOn.label}</h3>
                    <p className={`text-sm mb-2 ${addOns.includes(key) ? 'opacity-80' : 'text-gray-600'}`}>
                      {addOn.description}
                    </p>
                    <p className="text-sm font-medium">+{formatCents(addOn.price)}</p>
                  </div>
                </label>
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
                  className={`text-left rounded-xl p-5 border transition-all ${
                    clientType === key
                      ? 'bg-black text-white border-black shadow-lg'
                      : 'bg-white text-black border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <h3 className="font-semibold mb-1">{type.label}</h3>
                  <p className={`text-sm ${clientType === key ? 'opacity-80' : 'text-gray-600'}`}>
                    {type.description}
                  </p>
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
                  className={`text-left rounded-xl p-5 border transition-all ${
                    timeline === key
                      ? 'bg-black text-white border-black shadow-lg'
                      : 'bg-white text-black border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <h3 className="font-semibold mb-1">{tl.label}</h3>
                  <p className={`text-sm mb-2 ${timeline === key ? 'opacity-80' : 'text-gray-600'}`}>
                    {tl.weeks}
                  </p>
                  <p className={`text-xs ${timeline === key ? 'opacity-70' : 'text-gray-500'}`}>
                    {tl.description}
                  </p>
                </button>
              )
            )}
          </div>
        </section>

        {/* Price breakdown */}
        <section className="mb-12 bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Price Breakdown</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{BASE_SERVICES[baseService].label}</span>
              <span>{formatCents(breakdown.basePrice)}</span>
            </div>
            {addOns.map((key) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600">{ADD_ONS[key].label}</span>
                <span>+{formatCents(ADD_ONS[key].price)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-200 pt-3">
              <span className="text-gray-600">Subtotal</span>
              <span>{formatCents(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                {CLIENT_TYPES[clientType].label} adjustment
              </span>
              <span>×{breakdown.clientTypeMultiplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{TIMELINES[timeline].label} timeline</span>
              <span>×{breakdown.timelineMultiplier}</span>
            </div>
          </div>
          <div className="flex justify-between items-center border-t border-gray-200 mt-4 pt-4">
            <span className="text-xl font-bold">Total</span>
            <span className="text-3xl font-bold">{formatCents(breakdown.totalPrice)}</span>
          </div>
        </section>

        {/* Contact form */}
        <section className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Get Started</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Contact Name</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@company.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Your company"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

          <button
            onClick={handleCheckout}
            disabled={!canCheckout}
            className="w-full bg-black text-white py-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-colors"
          >
            {loading ? 'Processing...' : `Proceed to Checkout — ${formatCents(breakdown.totalPrice)}`}
          </button>

          <p className="text-center text-sm text-gray-600 mt-4">
            Secure payment powered by Stripe
          </p>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-gray-600 text-sm">
              Already a client?{' '}
              <Link href="/client/login" className="text-black font-semibold hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
