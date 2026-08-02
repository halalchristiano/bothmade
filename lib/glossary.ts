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
}

// Longest phrases first so "local SEO" wins over the bare "SEO" inside it.
export const SALES_GLOSSARY: GlossaryEntry[] = [
  {
    term: 'local SEO',
    plain:
      "Getting a business to show up when someone nearby searches for what they do — the map results and 'near me' searches, rather than the whole internet.",
    sayIt: "Making sure you're the one who comes up when someone in your area searches for this.",
  },
  {
    term: 'SEO',
    plain:
      "Search engine optimisation — the work that makes Google show a business higher up when people search. Nothing to do with paid ads; this is the free results underneath them.",
    sayIt: 'Getting you found on Google without paying for ads.',
  },
  {
    term: 'CRM',
    plain:
      "Customer relationship management — one system holding every customer and enquiry, so nothing gets lost in someone's inbox or on a sticky note.",
    sayIt: "One place where every enquiry lands, so none of them slip through.",
  },
  {
    term: 'analytics',
    plain:
      "Tracking that shows how many people visit, where they came from, and what they did. Without it a business is guessing about which marketing works.",
    sayIt: "So you can actually see which of your marketing is bringing people in.",
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
  },
  {
    term: 'integration',
    plain:
      "Making two separate systems talk to each other automatically, so information doesn't have to be typed into both.",
    sayIt: "Your systems talk to each other instead of you copying between them.",
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
  },
  {
    term: 'API',
    plain: "The connector one piece of software uses to talk to another. What integrations are built on.",
    sayIt: 'The connection between your systems.',
  },
  {
    term: 'A/B test',
    plain: 'Showing two versions to different visitors to find out which one performs better.',
    sayIt: 'We test two versions and keep the winner.',
  },
  {
    term: 'bounce rate',
    plain: 'The share of visitors who arrive and leave without doing anything at all.',
    sayIt: 'How many people land on your site and immediately leave.',
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
    const pattern = new RegExp(`\\b${entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!pattern.test(remaining)) continue;
    found.push(entry);
    // Blank out every occurrence so a shorter term contained inside this one
    // ("SEO" within "local SEO") doesn't also fire on the same words.
    remaining = remaining.replace(new RegExp(pattern.source, 'gi'), ' ');
  }
  return found;
}
