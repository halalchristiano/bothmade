/**
 * The questions answered on /start.
 *
 * Extracted from the page because two environments need it: the page renders
 * it in the browser, and app/start/layout.tsx — a server component — turns it
 * into FAQPage structured data. A server component importing a value from a
 * `'use client'` module gets a client-reference stub, not the array, so this
 * has to live in a module neutral to both. It also means the markup can never
 * drift from the copy on screen.
 */
export const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "What's the actual difference between a Website and a Web App?",
    a: 'A Website is something people visit — no login, no account, just pages to read and a way to contact you (portfolios, restaurants, landing pages, marketing sites). A Web App is something people log into and use — their own account, their own data, real functionality like a dashboard or booking system. The simple test: if anyone ever needs to create an account or log in, you need a Web App, not a Website. Picking the wrong one usually means re-scoping later, so when in doubt, tell us what the end user actually does with it and we\'ll confirm the right fit before you pay anything.',
  },
  {
    q: 'Okay but what\'s the difference between a Website with a backend vs. a Web App? Both have a backend...',
    a: 'Fair question — the test isn\'t "does it have a backend," since both can. It\'s "does anyone log in and get their own stuff." A Website + Custom Backend add-on is a site everyone sees the same version of, but with server-side logic running behind the scenes for stateless things — nobody has an account, the backend just processes requests. Example: a restaurant\'s reservation form that checks real-time table availability against a database and emails a confirmation — real backend work, but no visitor ever "logs in." A Web App is when people log in and see their own dashboard, their own data, that persists between visits — the backend is managing accounts, sessions, and per-user records, not just one-off requests. Shorthand: backend without accounts = Website + Custom Backend. Backend with accounts = Web App. The moment "log in" enters the picture, it\'s a Web App by definition, which is exactly why User Accounts & Auth is bundled into the Web App price instead of sold separately.',
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
