'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  ADD_ON_CATEGORIES,
  ADD_ON_REQUIRES,
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
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

const ADD_ONS_BY_CATEGORY = Object.entries(ADD_ONS).reduce(
  (acc, [key, addOn]) => {
    (acc[addOn.category] ??= []).push(key as AddOnKey);
    return acc;
  },
  {} as Record<AddOnCategory, AddOnKey[]>
);

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "What's the actual difference between a Website and a Web App?",
    a: 'A Website is something people visit — no login, no account, just pages to read and a way to contact you (portfolios, restaurants, landing pages, marketing sites). A Web App is something people log into and use — their own account, their own data, real functionality like a dashboard or booking system. The simple test: if anyone ever needs to create an account or log in, you need a Web App, not a Website. Picking the wrong one usually means re-scoping later, so when in doubt, tell us what the end user actually does with it and we\'ll confirm the right fit before you pay anything.',
  },
  {
    q: "I'm not sure which add-ons I actually need — what happens if I guess wrong?",
    a: "Nothing locks in until Discovery. Add-ons on this form set your initial price so there are no surprises, but once we kick off we'll walk through your actual requirements in detail, and anything you add or remove becomes a Change Order — scoped and quoted separately, never silently absorbed or silently charged. If you're unsure, it's completely fine to under-select here and adjust after our first call.",
  },
  {
    q: 'Why did checking one add-on automatically check another one?',
    a: 'Some features literally can\'t function without another one underneath them — e-commerce needs somewhere to store orders, for example, so it requires a Custom Backend. When that happens we auto-select the dependency and label it "added automatically" so you\'re never quoted for something that wouldn\'t actually work as built.',
  },
  {
    q: 'Do I have to pay the full amount upfront?',
    a: "No. Standard terms are a 50% deposit to begin Discovery, with the remaining balance due once Build is complete and before Launch. For larger engagements we can also split the balance into milestone payments — ask during Discovery if you'd prefer that structure.",
  },
  {
    q: 'What if I just want to talk it through before paying anything?',
    a: 'Use the "Not ready to pay — just send us your picks" option below the checkout button. It sends your exact configuration to our team with zero payment and zero commitment, and we\'ll follow up to talk through scope, answer questions, or adjust the plan before anything is charged.',
  },
  {
    q: 'What happens right after I pay the deposit?',
    a: "You'll get a login to your own client dashboard within one business day, along with a welcome email. From there we kick off Discovery — a short requirements process to confirm exactly what's being built — before moving into Design, then Build, then Launch. You can message us and track progress the whole way through your dashboard.",
  },
  {
    q: 'Is this a one-time price, or a subscription?',
    a: 'The base service and add-ons above are a one-time project fee. The exception is anything under "Ongoing Care" (Maintenance Plan, Growth Plan, Managed Hosting, Onboarding & Support Retainer) — those are month-to-month, billed after the first month (which is included in your total), and cancellable any time with 30 days notice.',
  },
  {
    q: 'What if my timeline runs long, or I want a refund?',
    a: "Every project includes a written agreement covering exactly this — what counts as a delay, what doesn't, and when a refund actually applies (for example, if we go quiet on your project for an extended period without explanation). A missed estimate alone isn't grounds for a refund, since most schedule shifts come from feedback cycles, not idle time on our end — but you're never left holding the bag if we drop the ball. You'll get the full agreement to review before paying anything beyond the deposit.",
  },
  {
    q: 'Do I own the final code and designs?',
    a: "Yes — full ownership transfers to you once the project is paid in full. Before final payment, the work stays the Agency's property (standard practice), but you can review everything via staging links throughout the build. The only exception is our own general-purpose tools/frameworks used to build it (not specific to your project), which we retain rights to but license to you as part of the delivered product.",
  },
  {
    q: 'Why do enterprise/larger organizations cost more for the same service?',
    a: "The Client Type adjustment isn't about the feature list changing — it reflects the real coordination overhead larger organizations typically need: more stakeholder review cycles, more formal sign-off chains, more documentation of decisions. If that overhead doesn't apply to you, pick the tier that actually matches how your organization operates.",
  },
];

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
              onClick={() => setOpenIndex(open ? null : i)}
              className="w-full text-left px-5 py-4 flex justify-between items-center gap-4"
            >
              <span className="font-medium">{item.q}</span>
              <span className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
            </button>
            {open && <p className="px-5 pb-4 text-sm text-white/55 leading-relaxed">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function StartPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          <h2 className="text-2xl font-bold mb-3">1. What are we building?</h2>

          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-5 mb-6">
            <p className="text-sm font-semibold text-sky-300 mb-2">Website vs. Web App — what's the actual difference?</p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/60">
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
                  <div className="grid md:grid-cols-2 gap-4">
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
                            <p className="text-sm mb-2 text-white/50">{addOn.description}</p>
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
            <span className="text-xl font-bold">Total</span>
            <span className="text-3xl font-bold">{formatCents(breakdown.totalPrice)}</span>
          </div>
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
