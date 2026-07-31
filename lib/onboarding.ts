import type { ProjectId } from '@/lib/pricing';

/**
 * The onboarding questionnaire.
 *
 * This is the long form a client fills in *after* they have signed up — the
 * one that replaces the four weeks of back-and-forth emails that otherwise
 * happen one question at a time.
 *
 * Every question carries a `why`. That is not decoration. A client who
 * understands why you need their registrar login answers in an hour; a client
 * staring at an unexplained credentials field goes quiet for a week and then
 * asks a friend whether this is a scam. The `why` line is the single highest
 * leverage thing in this file, so when adding a question, write the `why`
 * first — if you cannot justify a question in one honest sentence, cut it.
 *
 * Two other rules this file follows:
 *
 *   - Nothing is required unless the project genuinely cannot start without
 *     it. A wall of red asterisks makes people abandon the form and answer
 *     nothing; a short required core plus generous optional depth gets you
 *     most of the detail and all of the essentials.
 *   - Questions that only matter for some builds carry `appliesTo`, so an
 *     app client is never asked about their blog CMS.
 */

export type FieldType = 'short' | 'long' | 'url' | 'choice' | 'multi' | 'date';

export type Field = {
  id: string;
  label: string;
  /** The honest reason we're asking. Rendered under every question. */
  why: string;
  type: FieldType;
  placeholder?: string;
  /** For 'choice' and 'multi'. */
  options?: string[];
  required?: boolean;
  /** Hidden unless the build is one of these. */
  appliesTo?: ProjectId[];
};

export type Section = {
  id: string;
  title: string;
  /** Sets expectations before the questions start. */
  intro: string;
  /** Rough completion time, so nobody is ambushed. */
  minutes: number;
  fields: Field[];
};

export const SECTIONS: Section[] = [
  /* ---------------------------------------------------------------- */
  {
    id: 'business',
    title: 'Your business',
    intro:
      'We build better when we understand the business, not just the brief. Four questions, and there are no wrong answers — plain language beats polished.',
    minutes: 4,
    fields: [
      {
        id: 'what-you-do',
        label: 'What does your business actually do?',
        why: 'Explain it the way you would to a stranger at a bar, not the way it appears in your investor deck. The plain version is almost always the version that should be on the homepage.',
        type: 'long',
        placeholder: 'We sell refurbished commercial espresso machines to independent cafés, and we service them.',
        required: true,
      },
      {
        id: 'customer',
        label: 'Who buys from you, specifically?',
        why: 'Not a demographic — a person. "Café owners aged 30–50" tells us nothing. "The person who opened their second location and is panicking about consistency" tells us the entire tone of the site.',
        type: 'long',
        placeholder: 'Independent café owners, usually opening their second or third site.',
        required: true,
      },
      {
        id: 'money',
        label: 'How do you make money, and what is a customer worth?',
        why: 'This decides how hard we push on conversion. A £40 order and a £40,000 contract need completely different pages, and the difference is not cosmetic.',
        type: 'long',
        placeholder: 'One-off machine sales, £3–8k, plus a service contract at £120/month.',
      },
      {
        id: 'stage',
        label: 'Where are you right now?',
        why: 'A pre-launch idea and a business with existing customers need opposite things. One needs to prove it works, the other needs to not break what already does.',
        type: 'choice',
        options: [
          'Pre-launch — nothing exists yet',
          'Launched, first customers',
          'Established and growing',
          'Established, rebuilding something that exists',
        ],
        required: true,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'project',
    title: 'This project',
    intro:
      'What success looks like, in your words. This is the section we reread before every design decision, so it is worth ten unhurried minutes.',
    minutes: 6,
    fields: [
      {
        id: 'problem',
        label: 'What problem are we solving?',
        why: 'Everything downstream is judged against this. If we ever have to choose between two approaches, the one that solves this wins — so be specific about the pain, not the feature you imagine fixing it.',
        type: 'long',
        placeholder: 'People call to ask questions our site should answer, and we lose the ones who do not bother calling.',
        required: true,
      },
      {
        id: 'success',
        label: 'Six months after launch, what has to be true for this to have been worth it?',
        why: 'This is the real brief. Give us a number if you have one — "30 enquiries a month instead of 8" is something we can design toward. "Looks more professional" is something we can only guess at.',
        type: 'long',
        placeholder: '30 qualified enquiries a month, and I stop answering the same five questions on the phone.',
        required: true,
      },
      {
        id: 'nothing',
        label: 'What happens if you do nothing?',
        why: 'It tells us how urgent this genuinely is, and it occasionally reveals that a smaller project would do. We would rather find that out now and build you the smaller thing.',
        type: 'long',
        placeholder: 'We keep losing enquiries to the competitor with the better site.',
      },
      {
        id: 'one-thing',
        label: 'If a visitor does only ONE thing, what is it?',
        why: 'Every page gets built around a single action. Naming it now prevents the most common failure we see — a site that offers six equally weighted things and gets none of them done.',
        type: 'short',
        placeholder: 'Book a call. / Buy a machine. / Download the price list.',
        required: true,
      },
      {
        id: 'must-have',
        label: 'What must absolutely be in version one?',
        why: 'We will protect this list. Anything not on it becomes a candidate for cutting if the schedule gets tight — which is how a project ships on time instead of shipping everything, late.',
        type: 'long',
        placeholder: 'Product pages with live stock, the enquiry form, and the service booking calendar.',
        required: true,
      },
      {
        id: 'later',
        label: "What can wait until later?",
        why: 'Just as important as the list above. Knowing what is phase two lets us build the foundations to accept it without paying to build it now.',
        type: 'long',
        placeholder: 'Customer accounts, the trade-in calculator, the blog.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'audience',
    title: 'Who uses it',
    intro: 'Three questions that quietly decide half the technical choices.',
    minutes: 3,
    fields: [
      {
        id: 'devices',
        label: 'What are they using?',
        why: 'It sets what we optimise and test hardest. A trade audience on old Android phones in bad signal is a genuinely different build from a design audience on new Macs.',
        type: 'multi',
        options: [
          'Mostly phones',
          'Mostly desktop',
          'Even split',
          'Tablets matter',
          'Older devices / poor connections are common',
          'Honestly no idea',
        ],
        required: true,
      },
      {
        id: 'knowledge',
        label: 'How much do they already know when they arrive?',
        why: 'It decides how much explaining the first screen has to do. Selling to people who already know they need you is a completely different page from convincing people who have never heard of the category.',
        type: 'choice',
        options: [
          'They know exactly what they want',
          'They know the problem, not the solution',
          'They are just browsing / comparing',
          'A mix of all three',
        ],
        required: true,
      },
      {
        id: 'accessibility',
        label: 'Any accessibility requirements you know of?',
        why: 'Cheap to build in from day one, expensive to retrofit. Public sector and enterprise contracts often mandate it, and it is worth saying now if you might bid for one.',
        type: 'long',
        placeholder: 'Some of our customers are older; a public sector tender in the spring will need WCAG AA.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'taste',
    title: 'Taste',
    intro:
      'The fastest way to get design right first time. Links beat adjectives — "clean and modern" means something different to every person who has ever said it.',
    minutes: 5,
    fields: [
      {
        id: 'love',
        label: 'Three sites or apps you love — and one sentence on why for each',
        why: 'The "why" is the part that matters. Two people can send the same link because one loves the typography and the other loves the checkout, and we would build very different things.',
        type: 'long',
        placeholder:
          'stripe.com — everything is explained without feeling dumbed down.\nlinear.app — fast, and the motion feels expensive.\nmonzo.com — friendly without being childish.',
        required: true,
      },
      {
        id: 'hate',
        label: 'One you cannot stand',
        why: 'Ruling things out is faster than ruling them in, and it is the question that most often saves a whole design round.',
        type: 'long',
        placeholder: 'Most of our competitors — stock photos of people shaking hands, walls of grey text.',
      },
      {
        id: 'competitors',
        label: 'Your three closest competitors',
        why: 'We look at all of them before drawing anything, partly to learn the category conventions worth keeping and mostly to make sure you do not end up looking like them.',
        type: 'long',
        placeholder: 'One per line, with a link if you have it.',
        required: true,
      },
      {
        id: 'feeling',
        label: 'How should it feel?',
        why: 'Pick a few. Contradictory answers are fine and often useful — "premium but approachable" is a real brief and we know what to do with it.',
        type: 'multi',
        options: [
          'Premium / expensive',
          'Warm and human',
          'Fast and utilitarian',
          'Playful',
          'Serious and institutional',
          'Bold and loud',
          'Quiet and restrained',
          'Technical / engineered',
        ],
        required: true,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'brand',
    title: 'Brand & assets',
    intro:
      'What exists already. If the answer is "nothing", say so plainly — that is a normal answer and we will tell you what it costs to fix.',
    minutes: 4,
    fields: [
      {
        id: 'has-brand',
        label: 'What do you already have?',
        why: 'Determines whether we are applying a brand or inventing one. Working from a real logo file is hours; recreating one from a screenshot is days, and it never comes out quite right.',
        type: 'multi',
        options: [
          'Logo in a vector file (SVG / AI / EPS)',
          'Logo, but only as a PNG or JPG',
          'Brand guidelines document',
          'Set fonts we must use',
          'Set colours we must use',
          'Professional photography',
          'Nothing — we need this made',
        ],
        required: true,
      },
      {
        id: 'assets-link',
        label: 'Where are those files?',
        why: 'One link to a Drive or Dropbox folder saves a fortnight of "could you also send…". Put everything in it, including the messy originals — we would rather have too much.',
        type: 'url',
        placeholder: 'https://drive.google.com/…',
      },
      {
        id: 'brand-rules',
        label: 'Anything we must not change?',
        why: 'Some things are load-bearing — a logo a franchisor mandates, a colour that is in your signage. Tell us now and we design around them instead of proposing something you have to reject.',
        type: 'long',
        placeholder: 'The logo and the green are fixed. Everything else is up for grabs.',
      },
      {
        id: 'photography',
        label: 'Who is providing photography?',
        why: 'The most common cause of a beautiful design that looks mediocre in real life. Honest stock is better than bad originals, and we can advise once we know which we are working with.',
        type: 'choice',
        options: [
          'We have professional photos ready',
          'We will shoot new photos',
          'We need you to source stock',
          'We need a shoot arranged',
          'Not sure yet',
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'content',
    title: 'Words & content',
    intro:
      'Read this section twice. Content is the single most common reason projects run late — not design, not code. It is almost always the words.',
    minutes: 4,
    fields: [
      {
        id: 'who-writes',
        label: 'Who is writing the copy?',
        why: 'If it is you, we need to agree deadlines now, because design cannot finish around text that does not exist yet. If it is us, it is on the estimate and we start interviewing you early.',
        type: 'choice',
        options: [
          'We are writing it',
          'You are writing it (copywriting is in our scope)',
          'Mix — we draft, you polish',
          'We do not know yet',
        ],
        required: true,
      },
      {
        id: 'content-when',
        label: 'Realistically, when will your content be ready?',
        why: 'Please give the pessimistic date rather than the hopeful one. We plan the schedule around it, and a date that slips quietly costs more than a later date given honestly today.',
        type: 'date',
      },
      {
        id: 'existing-content',
        label: 'What content already exists that we should reuse?',
        why: 'Saves you money. Existing copy, product data, case studies, or a spreadsheet of stock can often be migrated instead of rewritten.',
        type: 'long',
        placeholder: 'About 40 product descriptions in a spreadsheet, and eight case studies on the old site.',
      },
      {
        id: 'tone',
        label: 'How do you want to sound?',
        why: 'Give us a sentence in your own voice if you can. Copy that sounds like the founder outperforms copy that sounds like a brand, almost every time.',
        type: 'long',
        placeholder: 'Straight-talking, a bit dry. We are not excited about espresso machines, we are just very good at them.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'access',
    title: 'Accounts & access',
    intro:
      'The unglamorous part. You do not need to hand anything over today — just tell us what exists and who controls it, so nothing surfaces as a surprise in launch week.',
    minutes: 5,
    fields: [
      {
        id: 'domain',
        label: 'What is the domain, and who controls it?',
        why: 'Launch day stops dead without DNS access. The answer is very often "an agency we stopped working with in 2019", and finding that out now instead of the morning of launch is worth a great deal.',
        type: 'short',
        placeholder: 'example.com — registered with GoDaddy, I have the login',
        required: true,
      },
      {
        id: 'hosting',
        label: 'Where is the current site hosted, if there is one?',
        why: 'Tells us what we are migrating from and what might break. Also whether email is tied to the same place, which is the classic way a site move accidentally takes the email down.',
        type: 'short',
        placeholder: 'WordPress on Bluehost. Email is Google Workspace, separate.',
      },
      {
        id: 'apple-account',
        label: 'Do you have an Apple Developer account?',
        why: 'Apple takes up to a few days to approve a new organisation account, and needs a D-U-N-S number, which takes longer. Starting this in week one instead of launch week has saved projects weeks.',
        type: 'choice',
        options: [
          'Yes, organisation account, active',
          'Yes, but a personal account',
          'No — we need to set one up',
          'Not sure',
        ],
        appliesTo: ['ios', 'mac', 'vision', 'both'],
        required: true,
      },
      {
        id: 'existing-systems',
        label: 'What other systems does this need to touch?',
        why: 'Integrations are where estimates go wrong. A CRM with a documented API is an afternoon; a twenty-year-old system with a CSV export is a fortnight, and we would both rather know which it is now.',
        type: 'long',
        placeholder: 'Xero for invoicing, Mailchimp, and a stock system called Unleashed.',
      },
      {
        id: 'analytics',
        label: 'Any existing analytics or ad accounts?',
        why: 'So we preserve your historical data instead of resetting it to zero, and so tracking still works the day after launch rather than a fortnight later.',
        type: 'long',
        placeholder: 'GA4, and a Meta pixel that our old agency set up.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'technical',
    title: 'Technical & legal',
    intro: 'Skip anything that does not apply. Nobody expects you to know all of this.',
    minutes: 3,
    fields: [
      {
        id: 'migration',
        label: 'Is there data to bring across?',
        why: 'Users, orders, posts, or products. Migrations are usually straightforward and occasionally the hardest part of the whole project — the only way to know is to look early.',
        type: 'long',
        placeholder: '~2,000 customer records and 5 years of orders.',
      },
      {
        id: 'compliance',
        label: 'Any regulations you have to satisfy?',
        why: 'Handling health data, children\'s data, or payments changes the architecture rather than adding a checkbox to it. Retrofitting compliance is the most expensive kind of rework there is.',
        type: 'multi',
        options: [
          'None that we know of',
          'GDPR / UK GDPR',
          'HIPAA or health data',
          'Financial regulation',
          'Accessibility mandated (public sector / enterprise)',
          'Age restrictions',
          'Not sure — please advise',
        ],
      },
      {
        id: 'volume',
        label: 'How many people will use this?',
        why: 'A rough number is fine. It changes the infrastructure, and honest small numbers save you money — we will not build for a million users you do not have.',
        type: 'short',
        placeholder: 'A few hundred a month now, hoping for a few thousand.',
      },
      {
        id: 'internal-team',
        label: 'Do you have technical people in-house?',
        why: 'Decides how we hand over, how much we document, and whether your team will be maintaining this after us — which changes how we write it.',
        type: 'choice',
        options: [
          'No one technical',
          'Someone semi-technical',
          'We have developers',
          'We have a full engineering team',
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'process',
    title: 'Decisions & timing',
    intro:
      'The section that most affects whether this lands on schedule. Please be candid rather than optimistic — an honest slow answer costs nothing, an optimistic one costs a fortnight.',
    minutes: 4,
    fields: [
      {
        id: 'decision-maker',
        label: 'Who has final say?',
        why: 'One name. Projects lose weeks when feedback arrives from four people who disagree with each other and nobody is empowered to settle it.',
        type: 'short',
        placeholder: 'Me. / Our MD, Priya — I will collect feedback and pass it on.',
        required: true,
      },
      {
        id: 'other-approvers',
        label: 'Who else can say no?',
        why: 'The genuinely important one. A co-founder, a board, a franchisor, or a spouse with strong opinions — we would much rather design for them from week one than discover them in week six.',
        type: 'long',
        placeholder: 'My business partner sees everything before it goes live. Legal has to sign off the terms.',
        required: true,
      },
      {
        id: 'turnaround',
        label: 'How quickly can you turn feedback around?',
        why: 'We schedule around your real pace, not an ideal one. Slow is completely fine when we know about it — silence when we have planned for two days is what breaks a timeline.',
        type: 'choice',
        options: [
          'Same day',
          'Within 2 days',
          'Within a week',
          'Longer — we are stretched',
        ],
        required: true,
      },
      {
        id: 'hard-deadline',
        label: 'Is there a real deadline, and what is behind it?',
        why: 'The reason matters more than the date. A trade show, a funding round, or a contract ending are all things we can plan backwards from — and if the date is genuinely immovable we will say so now rather than in week eight.',
        type: 'long',
        placeholder: 'Trade show on 14 March. We need something to point at by then, even if not everything.',
      },
      {
        id: 'unavailable',
        label: 'Any holidays or blackout periods coming up?',
        why: 'A two-week holiday in the middle of the review phase is fine if we know. If we do not, it looks like the project stalled and we lose the slot we were holding for you.',
        type: 'long',
        placeholder: 'Away 12–26 August.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'risk',
    title: 'The honest bit',
    intro:
      'Nobody ever regrets answering these. Two questions, and they routinely change how we run the whole project.',
    minutes: 3,
    fields: [
      {
        id: 'worry',
        label: 'What are you worried about?',
        why: 'Money, timing, being ignored, not understanding what we are doing, having been burned before — whatever it is, we would rather design the process around it than accidentally confirm your fear in week three.',
        type: 'long',
        placeholder: 'Last agency went quiet for a month and then showed me something I hated.',
      },
      {
        id: 'past-failure',
        label: 'Has a project like this gone wrong for you before?',
        why: 'If something similar failed, the failure is usually informative and often not your fault. Knowing what happened tells us which part of this to over-communicate.',
        type: 'long',
        placeholder: 'We paid for a rebuild in 2023 that never launched.',
      },
      {
        id: 'anything-else',
        label: 'Anything else we should know?',
        why: 'The catch-all. Odd constraints, office politics, a thing you have not mentioned because it felt irrelevant — it is usually the useful one.',
        type: 'long',
      },
    ],
  },
];

/** The sections that apply to a given build. */
export function sectionsFor(project: ProjectId | null): Section[] {
  return SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter(
      (f) => !f.appliesTo || (project !== null && f.appliesTo.includes(project))
    ),
  })).filter((s) => s.fields.length > 0);
}

/** Total questions and rough minutes, so the form can promise honestly. */
export function formStats(project: ProjectId | null) {
  const sections = sectionsFor(project);
  return {
    sections: sections.length,
    questions: sections.reduce((n, s) => n + s.fields.length, 0),
    required: sections.reduce((n, s) => n + s.fields.filter((f) => f.required).length, 0),
    minutes: sections.reduce((n, s) => n + s.minutes, 0),
  };
}

/** Every field id that belongs to this project — the server's allowlist. */
export function allowedFieldIds(project: ProjectId | null): Set<string> {
  return new Set(sectionsFor(project).flatMap((s) => s.fields.map((f) => f.id)));
}
