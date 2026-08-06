/**
 * Plain-English definitions for the industry words that turn up in a lead's
 * sales brief.
 *
 * The briefs are written by whoever researched the business, in the language
 * the industry actually uses — "CRM routing", "conversion funnel", "local
 * SEO". That's correct for accuracy and wrong for a rep who has never worked
 * in software. Rather than dumbing the briefs down (and losing precision),
 * the lead page shows definitions for exactly the terms that appear in that
 * lead's brief.
 *
 * `plain` answers "what is this?". `sayIt` is how to explain it to the
 * customer if they ask on the call — deliberately different wording, because
 * what helps the rep understand isn't always what's persuasive to a client.
 */
export interface GlossaryEntry {
  term: string;
  plain: string;
  sayIt?: string;
  /**
   * Other ways the same idea gets written down.
   *
   * A brief that says "CMS" and a brochure that says "Content Management
   * System" are describing one thing, and both readers need the same
   * definition. Without these the spelled-out form silently gets no
   * explanation at all — which is the exact reader this page exists for.
   */
  aliases?: string[];
}

// Longest phrases first so "local SEO" wins over the bare "SEO" inside it.
export const SALES_GLOSSARY: GlossaryEntry[] = [
  {
    term: 'local SEO',
    plain:
      "Getting a business to show up when someone nearby searches for what they do — the map results and 'near me' searches, rather than the whole internet.",
    sayIt: "Making sure you're the one who comes up when someone in your area searches for this.",
    aliases: ['local search'],
  },
  {
    term: 'SEO',
    plain:
      "Search engine optimisation — the work that makes Google show a business higher up when people search. Nothing to do with paid ads; this is the free results underneath them.",
    sayIt: 'Getting you found on Google without paying for ads.',
    aliases: ['search engine optimisation', 'search engine optimization'],
  },
  {
    term: 'CRM',
    plain:
      "Customer relationship management — one system holding every customer and enquiry, so nothing gets lost in someone's inbox or on a sticky note.",
    sayIt: "One place where every enquiry lands, so none of them slip through.",
    aliases: ['customer relationship management'],
  },
  {
    term: 'analytics',
    plain:
      "Tracking that shows how many people visit, where they came from, and what they did. Without it a business is guessing about which marketing works.",
    sayIt: "So you can actually see which of your marketing is bringing people in.",
    aliases: ['event tracking'],
  },
  {
    term: 'conversion',
    plain:
      "When a visitor does the thing you wanted — rings up, books, buys, fills in the form. 'Improving conversion' means more of the same visitors take action.",
    sayIt: 'Turning more of the people already visiting you into actual enquiries.',
  },
  {
    term: 'funnel',
    plain:
      "The path from 'never heard of you' to 'paying customer'. It narrows at each step — lots look, fewer enquire, fewer still buy.",
    sayIt: "The journey from someone finding you to actually booking.",
  },
  {
    term: 'lead capture',
    plain:
      "How you collect an interested person's details — the contact form, the quote request, the callback box. No capture, no follow-up.",
    sayIt: "Making sure you get their details while they're interested.",
    aliases: ['contact form', 'enquiry form'],
  },
  {
    term: 'routing',
    plain:
      "Automatically sending each enquiry to the right person or place, instead of everything landing in one inbox that nobody checks.",
    sayIt: 'Each enquiry goes straight to whoever should handle it.',
  },
  {
    term: 'portal',
    plain:
      "A private logged-in area for customers to see their own information — their booking, their job, their invoices — without ringing to ask.",
    sayIt: 'A login where your customers can check their own job without calling you.',
  },
  {
    term: 'CMS',
    plain:
      "Content management system — the bit that lets the client edit their own text and photos without needing us every time.",
    sayIt: 'You can update your own content whenever you like.',
    aliases: ['content management system'],
  },
  {
    term: 'integration',
    plain:
      "Making two separate systems talk to each other automatically, so information doesn't have to be typed into both.",
    sayIt: "Your systems talk to each other instead of you copying between them.",
    aliases: ['integrations'],
  },
  {
    term: 'automation',
    plain:
      'Work that happens by itself on a trigger — a confirmation text after a booking, a review request after a job.',
    sayIt: 'It happens automatically, nobody has to remember to do it.',
  },
  {
    term: 'nurture',
    plain:
      "Staying in touch with people who didn't buy yet, so you're the one they remember when they're ready.",
    sayIt: "Keeping in touch with the ones who aren't ready yet.",
  },
  {
    term: 'pipeline',
    plain:
      "All the deals in progress and what stage each is at — a to-do list for sales, so nothing stalls unnoticed.",
    sayIt: 'You can see every job in progress and what stage it\'s at.',
  },
  {
    term: 'mobile-first',
    plain:
      'Designed for a phone screen before a computer screen, because most visitors are on a phone.',
    sayIt: 'Built for how your customers actually browse — on their phone.',
  },
  {
    term: 'responsive',
    plain: 'A site that reshapes itself to fit whatever screen it opens on — phone, tablet or desktop.',
    sayIt: 'It looks right on any device.',
  },
  {
    term: 'landing page',
    plain:
      'A single focused page built for one purpose — usually where an ad or campaign sends people, with one clear action.',
    sayIt: 'A dedicated page for that one service or campaign.',
  },
  {
    term: 'backend',
    plain:
      "The part behind the scenes that stores data and does the actual work. Customers never see it; nothing works without it.",
    sayIt: 'The engine behind the site that makes it all work.',
  },
  {
    term: 'tracking',
    plain: 'Recording what visitors do so results can be measured instead of guessed at.',
    sayIt: 'So we can prove what\'s working.',
  },
  {
    term: 'attribution',
    plain: "Working out which marketing actually produced a sale, when someone saw several things first.",
    sayIt: 'Knowing which of your marketing earned the sale.',
  },
  {
    term: 'retargeting',
    plain: "Showing ads to people who already visited the site but left without doing anything.",
    sayIt: 'Reminding people who looked but didn\'t get in touch.',
  },
  {
    term: 'metadata',
    plain: "The short title and description Google shows for a page in search results.",
    sayIt: 'How your listing reads on Google.',
  },
  {
    term: 'structured data',
    plain:
      "Hidden labelling that tells Google what a page is about, so it can show extras like star ratings or opening hours.",
    sayIt: 'It helps Google show your reviews and hours right in the results.',
  },
  {
    term: 'Core Web Vitals',
    plain: "Google's speed and stability scores for a page. Poor scores can push a site down the rankings.",
    sayIt: "Google's own speed score for your site.",
  },
  {
    term: 'UX',
    plain: "User experience — how easy something is to actually use. Good UX is invisible; bad UX makes people leave.",
    sayIt: 'How easy it is for your customers to get what they came for.',
    aliases: ['user experience'],
  },
  {
    term: 'API',
    plain: "The connector one piece of software uses to talk to another. What integrations are built on.",
    sayIt: 'The connection between your systems.',
    aliases: ['application programming interface'],
  },
  {
    term: 'A/B test',
    plain: 'Showing two versions to different visitors to find out which one performs better.',
    sayIt: 'We test two versions and keep the winner.',
    aliases: ['A/B testing', 'split test'],
  },
  {
    term: 'bounce rate',
    plain: 'The share of visitors who arrive and leave without doing anything at all.',
    sayIt: 'How many people land on your site and immediately leave.',
  },
  {
    term: 'WCAG',
    plain:
      "The international rulebook for making a website usable by people with a disability — readable by a screen reader, operable without a mouse, legible without perfect eyesight.",
    sayIt: 'Making sure your site works for people who cannot use a mouse or need bigger text.',
    aliases: ['accessibility audit', 'accessibility'],
  },
  {
    term: 'uptime SLA',
    plain:
      "A written promise about how much of the time the site will be up, with money back if it is not. Without one, 'we aim for reliable' is all you have.",
    sayIt: "If it goes down more than we promised, you get money back — it's in writing.",
    aliases: ['service level agreement', 'uptime guarantee'],
  },
  {
    term: 'SSO',
    plain:
      "Single sign-on — staff log in once with the account they already have (Google, Microsoft) instead of yet another password to forget.",
    sayIt: 'Your team signs in with their work account, no new password to remember.',
    aliases: ['single sign-on'],
  },
  {
    term: 'white-label',
    plain:
      "One system quietly serving several brands, each looking like its own product with its own logo and its own separate data.",
    sayIt: 'The same system, sold under different brand names, kept completely apart.',
    aliases: ['multi-tenant'],
  },
  {
    term: 'WebGL',
    plain:
      "The technology that lets a browser draw proper 3D — something a customer can spin, resize and look inside, without downloading anything.",
    sayIt: 'Customers can turn it around and look at it properly, right there in the browser.',
    aliases: ['3D'],
  },
  {
    term: 'push notification',
    plain:
      "A message that arrives on a phone's lock screen from your app, without email or a text message in between.",
    sayIt: 'You reach them on their phone directly, without paying a platform for it.',
    aliases: ['push notifications'],
  },
  {
    term: 'managed hosting',
    plain:
      "Somewhere for the site to live, looked after by us — the servers, the updates, the certificates. When it breaks it is our phone that rings.",
    sayIt: 'We keep it online and fix it when it breaks, so you never have to.',
    aliases: ['hosting'],
  },
  {
    term: 'data migration',
    plain:
      "Moving what you already have — pages, products, customers — onto the new system, so launch day does not start from an empty shelf.",
    sayIt: 'Everything you have now comes with you instead of being retyped.',
    aliases: ['content migration'],
  },
  {
    term: 'App Store Optimization',
    plain:
      "The listing work that decides whether anyone finds your app once it is published — the name, the description, the screenshots people judge it on.",
    sayIt: 'Making sure people actually find your app once it is in the store.',
    aliases: ['ASO', 'app store submission'],
  },
  {
    term: 'authentication',
    plain:
      "Proving somebody is who they say they are before letting them in — the sign-up, the login, the password reset.",
    sayIt: 'Everyone gets their own login and only sees their own information.',
    aliases: ['user accounts', 'auth'],
  },
  {
    term: 'admin dashboard',
    plain:
      "A private screen where your team changes the things that need changing, without ringing a developer or touching the database.",
    sayIt: 'A back office where your team runs the day-to-day themselves.',
    aliases: ['admin panel'],
  },
  {
    term: 'e-commerce',
    plain: 'Selling online — a product list, a basket, and a way to take the money.',
    sayIt: 'Customers can buy from you at two in the morning without you being awake.',
    aliases: ['ecommerce'],
  },
  {
    term: 'subscription',
    plain:
      "Charging the same customer every month automatically, instead of chasing a new sale each time.",
    sayIt: 'The same customer pays every month without anyone having to ask.',
    aliases: ['recurring billing', 'memberships'],
  },
  {
    term: 'organic',
    plain: "Traffic that arrives through unpaid search results, as opposed to from ads.",
    sayIt: 'People finding you on Google without you paying per click.',
  },
];

/**
 * Returns definitions for the glossary terms that actually appear in the
 * given text, in glossary order (longest phrases first, so a match on
 * "local SEO" doesn't also produce a redundant "SEO" entry).
 *
 * Matching is word-boundary and case-insensitive. Terms already matched as
 * part of a longer phrase are suppressed, so the rep sees one definition per
 * idea rather than a wall of overlapping ones.
 */
export function findGlossaryTerms(...texts: Array<string | null | undefined>): GlossaryEntry[] {
  const haystack = texts.filter(Boolean).join('\n');
  if (!haystack.trim()) return [];

  const found: GlossaryEntry[] = [];
  let remaining = haystack;
  for (const entry of SALES_GLOSSARY) {
    // The abbreviation and every way it gets spelled out, as one pattern, so
    // "CMS" and "content management system" produce a single definition
    // rather than one each or — worse — none for the spelled-out form.
    const pattern = new RegExp(
      [entry.term, ...(entry.aliases ?? [])]
        .map((form) => `\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
        .join('|'),
      'i'
    );
    if (!pattern.test(remaining)) continue;
    found.push(entry);
    // Blank out every occurrence so a shorter term contained inside this one
    // ("SEO" within "local SEO") doesn't also fire on the same words.
    remaining = remaining.replace(new RegExp(pattern.source, 'gi'), ' ');
  }
  return found;
}
