'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { PhoneField } from '@/components/PhoneField';
import {
  ADD_ON_CATEGORIES,
  ADD_ON_REQUIRES,
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  depositAmount,
  firstInstalmentPercent,
  dependentsOf,
  expandAddOnDependencies,
  formatCents,
  isIncludedInBase,
  withBaseIncludes,
  type AddOnCategory,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';
import { FAQ_ITEMS } from '@/lib/start-faq';

const ADD_ONS_BY_CATEGORY = Object.entries(ADD_ONS).reduce(
  (acc, [key, addOn]) => {
    (acc[addOn.category] ??= []).push(key as AddOnKey);
    return acc;
  },
  {} as Record<AddOnCategory, AddOnKey[]>
);


function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={i}
            className={`rounded-xl border transition-colors ${
              open ? 'border-sky-400/30 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <button
              type="button"
              id={`faq-q-${i}`}
              // Without these the button is announced as a plain button: no
              // indication it reveals anything, and no announcement when it
              // does. The rotating "+" is a visual affordance only.
              aria-expanded={open}
              aria-controls={`faq-a-${i}`}
              onClick={() => setOpenIndex(open ? null : i)}
              className="w-full text-left px-5 py-4 flex justify-between items-center gap-4"
            >
              <span className="font-medium">{item.q}</span>
              <span className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
            </button>
            {/*
              Always rendered, hidden when closed — it used to be
              `{open && <p>…}`, so a collapsed answer did not exist in the
              document at all.

              app/start/layout.tsx publishes all twelve of these as FAQPage
              structured data. `openIndex` starts at null, so the page Google
              fetches contained twelve questions, twelve answers in the JSON-LD
              — and not one answer anywhere in the page. Structured data has to
              describe content the page actually has; answers hidden behind an
              accordion are explicitly fine, answers that are absent are not.

              `hidden` rather than a CSS class: it is what conveys the state to
              assistive technology, and it pairs with aria-expanded above. No
              Tailwind class here sets `display`, so the UA rule applies
              cleanly.
            */}
            <p
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              hidden={!open}
              className="px-5 pb-4 text-sm text-white/55 leading-relaxed"
            >
              {item.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function StartPage() {
  const [interestLoading, setInterestLoading] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [interestError, setInterestError] = useState('');

  const [baseService, setBaseServiceRaw] = useState<BaseService>('website');
  const [addOns, setAddOns] = useState<AddOnKey[]>([]);

  // Switching base service may bundle in add-ons that are already part of
  // that base price (e.g. Web App already includes a backend + accounts) —
  // keep the selection in sync so nothing gets silently double-charged.
  const setBaseService = (next: BaseService) => {
    setBaseServiceRaw(next);
    setAddOns((prev) => withBaseIncludes(next, prev));
  };
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
    if (isIncludedInBase(baseService, key)) return; // bundled into the base price — not a separate toggle
    setAddOns((prev) => {
      if (prev.includes(key)) {
        // Unchecking a foundation (e.g. Custom Backend) also clears anything
        // that was silently relying on it — otherwise the selection would
        // claim to include e.g. E-commerce with no backend to run it on.
        const toRemove = new Set([key, ...dependentsOf(key, prev)]);
        return prev.filter((a) => !toRemove.has(a));
      }
      // Checking something pulls in whatever it depends on automatically.
      return expandAddOnDependencies([...prev, key]);
    });
  };

  /**
   * There is no checkout handler here any more.
   *
   * /api/checkout still exists and is still tested — the deposit is taken
   * once the scope has been talked through, not by a stranger clicking a
   * gradient button. Restoring it is a button and a fetch, and the history
   * for both is one `git log -- app/start/page.tsx` away.
   */
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
          <h2 className="text-2xl font-bold mb-3">1. What are we building?</h2>

          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-5 mb-6">
            <p className="text-sm font-semibold text-sky-300 mb-2">Website vs. Web App — what's the actual difference?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-white/60">
              <div>
                <p className="font-medium text-white/80 mb-1">Website</p>
                <p>People <em>visit</em> it. No login, no account, nothing to "use" — just read, look, and get in touch. Think: a restaurant's site, a portfolio, a landing page.</p>
              </div>
              <div>
                <p className="font-medium text-white/80 mb-1">Web App</p>
                <p>People <em>log into</em> it and use it. Their own account, their own data, real functionality — a dashboard, a booking system, a tool that does something.</p>
              </div>
            </div>
            <p className="text-xs text-white/40 mt-3">
              Simple test: will anyone need to create an account or log in? If yes, it's a Web App, not a Website — pick accordingly, since it changes what gets built underneath.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.entries(BASE_SERVICES) as [BaseService, (typeof BASE_SERVICES)[BaseService]][]).map(
              ([key, service]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBaseService(key)}
                  className={cardClass(baseService === key)}
                >
                  <h3 className="font-semibold mb-1">{service.label}</h3>
                  <p className="text-sm mb-2 text-white/50">{service.description}</p>
                  <p className="text-xs text-white/35 mb-3">{service.bestFor}</p>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {keys.map((key) => {
                      const addOn = ADD_ONS[key];
                      const isChecked = addOns.includes(key);
                      const includedInBase = isIncludedInBase(baseService, key);
                      const requires = ADD_ON_REQUIRES[key];
                      const requiredBy = isChecked
                        ? dependentsOf(key, addOns).map((k) => ADD_ONS[k].label)
                        : [];
                      return (
                        <label
                          key={key}
                          className={`${cardClass(isChecked)} flex items-start gap-3 ${includedInBase ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleAddOn(key)}
                            disabled={includedInBase}
                            className="mt-1"
                          />
                          <div>
                            <h4 className="font-semibold mb-1">{addOn.label}</h4>
                            <p className="text-sm mb-1.5 text-white/50">{addOn.description}</p>
                            {/* What it is, then what you get out of it — the
                                second is what people are actually choosing on. */}
                            <p className="text-sm mb-2 text-white/70 leading-relaxed">{addOn.benefit}</p>
                            {includedInBase ? (
                              <p className="text-sm font-medium text-emerald-300">Included in {BASE_SERVICES[baseService].label}</p>
                            ) : (
                              <p className="text-sm font-medium">+{formatCents(addOn.price)}</p>
                            )}
                            {isChecked && requires && (
                              <p className="text-xs text-sky-300 mt-2 pt-2 border-t border-white/10">
                                Needs {requires.map((r) => ADD_ONS[r].label).join(' + ')} to actually work —
                                added automatically.
                              </p>
                            )}
                            {isChecked && requiredBy.length > 0 && (
                              <p className="text-xs text-white/40 mt-2 pt-2 border-t border-white/10">
                                Included because you selected {requiredBy.join(', ')}.
                              </p>
                            )}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            {addOns.map((key) =>
              isIncludedInBase(baseService, key) ? (
                <div key={key} className="flex justify-between">
                  <span className="text-white/50">{ADD_ONS[key].label}</span>
                  <span className="text-emerald-300 text-xs">Included</span>
                </div>
              ) : (
                <div key={key} className="flex justify-between">
                  <span className="text-white/50">{ADD_ONS[key].label}</span>
                  <span>+{formatCents(ADD_ONS[key].price)}</span>
                </div>
              )
            )}
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
            <span className="text-xl font-bold">Project total</span>
            <span className="text-3xl font-bold">{formatCents(breakdown.totalPrice)}</span>
          </div>
          {/* Terms, not a bill. Nothing can be charged from this page, so
              "due today" would be describing something that cannot happen
              here — the estimate starts a conversation and the payment
              schedule is agreed in it. The split still belongs on screen:
              someone weighing a five-figure number wants to know how it is
              staged before they get on a call, not after. */}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
            <span className="text-sm text-white/50">
              To start — {firstInstalmentPercent(breakdown.totalPrice)}% of the total
            </span>
            <span className="text-lg font-semibold text-emerald-300">
              {formatCents(depositAmount(breakdown.totalPrice))}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/35">
            Nothing is charged here. Every project is billed in three parts over the same
            gates — {firstInstalmentPercent(breakdown.totalPrice) === 40 ? '40% / 30% / 30%' : '50% / 25% / 25%'}:
            one to start, one when you approve the design, one when it&apos;s ready to launch.
          </p>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-2">Frequently Asked Questions</h2>
          <p className="text-white/40 text-sm mb-6">
            The questions we get most about this form, pricing, and how the project actually runs.
          </p>
          <FaqAccordion />
        </section>

        {/* Contact form */}
        <section id="contact-form" className="max-w-2xl mx-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Get Started</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="start-contact-name" className="block text-sm font-medium mb-2 text-white/70">Contact Name</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                id="start-contact-name"
                placeholder="Jane Doe"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="start-email" className="block text-sm font-medium mb-2 text-white/70">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="start-email"
                placeholder="your@company.com"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="start-company" className="block text-sm font-medium mb-2 text-white/70">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                id="start-company"
                placeholder="Your company"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="start-phone" className="block text-sm font-medium mb-2 text-white/70">
                Phone (optional)
              </label>
              {/* The same field the contact form and the CRM use. A bare box
                  here let "07700 900123" through with no country attached,
                  which is a fine UK mobile and an undialable US one — and
                  this route writes to the same Lead column as both. */}
              <PhoneField
                id="start-phone"
                value={phone}
                onChange={setPhone}
                className={inputClass}
                placeholder="7700 900123"
              />
            </div>
          </div>

          {/* Sending the selections is the only action here.
              Taking a card before anyone has spoken to the client puts money
              on the table ahead of the conversation that decides whether the
              scope is even right — so checkout is off this page. The route
              and the pricing maths behind it are untouched, so this is a
              button to put back rather than a feature to rebuild. */}
          {interestSent ? (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-300 text-sm text-center">
              Got it — we&apos;ve got your selections and will be in touch shortly.
            </div>
          ) : (
            <>
              <button
                onClick={handleRegisterInterest}
                disabled={!canSubmit || interestLoading}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-4 font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {interestLoading ? 'Sending...' : 'Send my selections'}
              </button>
              {/* Always mounted, so assistive tech is already watching when the
                      message arrives — a live region created at the same moment as
                      its content is announced unreliably or not at all. role="alert"
                      because a refused sign-in is not an aside: without it the
                      button simply stops spinning and nothing is said. */}
              <div role="alert" aria-live="assertive" aria-atomic="true">
                {interestError && (
                  <div className="text-red-400 text-sm mt-2 text-center">{interestError}</div>
                )}
              </div>
              <p className="text-center text-sm text-white/40 mt-3">
                No payment now. We&apos;ll go through the scope with you and confirm the
                number before anything is charged.
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
