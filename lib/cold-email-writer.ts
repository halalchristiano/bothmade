import Anthropic from '@anthropic-ai/sdk';
import { anthropicApiKey } from '@/lib/env';

/**
 * Both emails, written for one business, from what we actually know about it.
 *
 * A researched lead arrives carrying a cold email written by hand for that
 * one company, and those close. Every other lead in the book — the ones a
 * scrape produced, which is most of them — falls back to a generic first
 * contact that reads like a generic first contact. There is no version of
 * "personalised at scale" that a person types a thousand times, so the choice
 * has been between a thousand template blasts and fifty good emails.
 *
 * This writes both emails for a lead from its own research fields: the cold
 * email that opens the conversation and the mockup email that follows it in
 * the same voice, so the second one does not arrive as a change of register.
 *
 * ## The rule that matters more than the writing
 *
 * It may only use facts it was given. A model asked to sound personal will
 * happily produce "I noticed your site hasn't been updated since 2019" about
 * a business nobody looked at — and that email goes to a real person who
 * knows it is false, from a studio whose entire pitch is that it pays
 * attention. One invented detail costs more than a hundred generic emails.
 *
 * So the system prompt forbids invented specifics, and the output is checked
 * for the shapes that invention takes. Where the facts are thin, the email is
 * allowed to lean on what is true of the whole category — an owner who takes
 * every booking by phone loses the after-hours ones — because that is a claim
 * about the trade, not a lie about them.
 *
 * Nothing is sent from here. The drafts land on the lead, where a person
 * reads them before anything goes out.
 */

export interface LeadFactsForWriting {
  company: string;
  contactName?: string | null;
  contactRole?: string | null;
  industry?: string | null;
  city?: string | null;
  region?: string | null;
  /** Their existing site, if we hold one. */
  originalWebsite?: string | null;
  /** A written verdict on the site they have today. */
  currentSiteAssessment?: string | null;
  /** The one line from research about this business. */
  personalizedObservation?: string | null;
  /** "Point: what it costs them" lines, already parsed to text. */
  painPoints?: string[];
  /** What they need, in the same shape. */
  essentials?: string[];
  googleRating?: number | null;
  googleReviewCount?: number | null;
  employeeCount?: number | null;
  locationCount?: number | null;
  yearFounded?: number | null;
  /** What the deal is worth, in cents, for pitch-weight only — never quoted. */
  estimatedValue?: number | null;
}

export interface WrittenEmails {
  /** A full "Subject: ...\n\n<body>" draft for the cold email. */
  coldEmail: string;
  /** The same shape, for the email that carries the mockup. */
  mockupEmail: string;
  /** One sentence, for the composer field and the mockup email's fallback. */
  observation: string;
}

/** Whether the feature can run at all — used to hide the button rather than fail it. */
export function canWriteEmails(): boolean {
  return anthropicApiKey() !== null;
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    observation: {
      type: 'string' as const,
      description:
        'One sentence about THIS business that could not be said about a different one, drawn only from the facts given. No adjectives about their website being "outdated" unless the facts say so.',
    },
    coldEmail: {
      type: 'string' as const,
      description:
        'The cold email. First line exactly "Subject: <subject>", then a blank line, then the body. Greeting is "Hi [First Name]," and the sign-off is "[Sender Name]" on its own line. 150-230 words in the body.',
    },
    mockupEmail: {
      type: 'string' as const,
      description:
        'The email that goes out with the finished mockup, following on from the cold email in the same voice. Same "Subject: ..." shape, 90-150 words.',
    },
  },
  required: ['observation', 'coldEmail', 'mockupEmail'],
  additionalProperties: false,
};

const SYSTEM = `You write cold emails for Bothmade Studio, a small web design studio. Evan sends them. They are the best-performing emails in the business and they work because they sound like one person who looked at one company, not like marketing.

## What you are writing

Two emails for one business:

1. THE COLD EMAIL. First contact. It ends by offering to build them a free homepage concept — a mockup — with no obligation and nothing to pay, and asking whether they want it.
2. THE MOCKUP EMAIL. What gets sent later, when the mockup is built and they said yes. It follows on from the first email as the same person continuing the same conversation.

## The shape that works

Cold email:
- Subject: short, lower-case-ish, specific to them, never a slogan. Six words maximum. Not a question about "growing your business".
- Open by saying what you did: you looked at their site the way one of their customers would, with a specific job in mind.
- Say one true, generous thing about the business. If the facts give you a rating, a review count, a number of years, use it. Never flatter the website itself unless you were told it is good.
- Then the problem, in plain words, and framed as structural rather than as somebody's failure: "there's a problem underneath it that isn't anyone's fault". Say what it costs them — the booking taken at 9pm that nobody answered, the customer who could not find the price.
- Then the offer: you will build them a homepage concept for their business, free, before any money is discussed, because it is the only honest way to show how you work. They keep the ideas either way. No obligation, no call required to receive it.
- End on one direct question that is easy to answer: "Want me to build you one?" or "Want me to send it over?"

Mockup email:
- Open with the thing itself: "Here it is."
- Say what is on the screen and what it does that their current site cannot.
- Be honest about what it is not — it is a design, not a working build, so nothing clicks. Say you would rather show the idea honestly than fake a demo.
- Ask one or two real questions you would actually want answered.

## Voice

- One person typing. Short sentences. Contractions.
- Confident, warm, direct. You are worth talking to and you are not begging.
- Sell hard by being specific, never by using sales language.
- Concrete nouns: the phone, the booking, the price list, the photo, the form.

## Absolutely never

- Never invent a fact about them. No "I noticed your site was last updated in 2019", no invented client names, no made-up numbers, no claims about their traffic, their rankings, their competitors or their revenue, unless those exact facts were given to you. This is the rule that outranks every other instruction here. If the facts are thin, write about what is true of their trade instead — that is honest, and it still lands.
- Never say: "I hope this email finds you well", "reaching out", "circle back", "leverage", "solutions", "in today's digital landscape", "game-changer", "elevate your brand", "we are a full-service agency", "quick question".
- Never use bullet points, headings, bold, emoji, or a P.S.
- Never promise a result you cannot prove — no "this will double your bookings", no percentages, no guarantees.
- Never mention price, packages, or anything that reads as a quote.
- Never use the words "mockup" and "free" in the subject line — it reads as spam.

## Format

- The cold email body is 150-230 words. The mockup email is 90-150 words.
- Both start with a "Subject: ..." line, then one blank line, then the body.
- The greeting is exactly "Hi [First Name]," — it is filled in at send time.
- The sign-off is exactly "[Sender Name]" on its own line at the end, with nothing after it.
- Plain text. Paragraphs separated by blank lines.`;

/**
 * What is usually true of a trade, so a thin row still produces a sharp email.
 *
 * A scrape gives you "Dental practice, Austin, 4.9, 312 reviews" and nothing
 * else. Written from that alone, an email has one move left: say something
 * vague about their online presence, which is the exact email everybody else
 * sends. But the structural problem in a category is genuinely knowable
 * without visiting the site — a cosmetic practice really does get chosen at
 * eleven at night on a phone, and a builder's portfolio really is the whole
 * product shown as thumbnails.
 *
 * These are handed over as what is true of the trade, explicitly not as
 * something anybody observed about this business. The distinction is the
 * whole point: "most practices lose the after-hours booking" is a claim about
 * dentistry, and "your booking page is broken" is a claim about them that
 * nobody checked.
 */
const TRADE_NOTES: Array<{ match: RegExp; note: string }> = [
  {
    match:
      /plastic surgery|cosmetic|med ?spa|medspa|aesthetic|dermatolog|dental|dentist|orthodont|fertility|ivf|hair (?:restoration|transplant)|wellness clinic|vein|weight loss/i,
    note: `High-ticket elective care. What is usually true of this trade: the decision gets made late at night on a phone, by someone who has already read the reviews and now wants to see results and a price bracket before they will speak to anyone. The before-and-after gallery is the product and it is usually three clicks deep, unfilterable by procedure, and unusable on a phone. Booking a consultation usually means a phone number and office hours, so the decision made at eleven at night has nowhere to go and is gone by morning. Price is usually absent entirely, which reads as expensive rather than as discreet.`,
  },
  {
    match:
      /home ?build|custom home|remodel|renovat|kitchen|bath|pool|landscap|hardscape|roof|window|door|deck|patio|outdoor living|construction|contractor|design ?build/i,
    note: `High-ticket home work. What is usually true of this trade: the portfolio is the entire product and it is usually shown as a grid of thumbnails with no way to sort by budget, style or scope — so a homeowner with a specific project cannot find the one job that looks like theirs, which is the only thing that would convince them. Process and timeline are usually missing, which is what people are actually frightened of. The enquiry form usually asks for a name and a message and nothing about the project, so every lead arrives unqualified and the first call is spent finding out whether it was ever real.`,
  },
  {
    match:
      /law|legal|attorney|solicitor|accounting|accountant|cpa|tax|wealth|financial (?:advis|planning)|insurance|consult|agency|clinic|medical (?:practice|group)|veterinar/i,
    note: `Professional services. What is usually true of this trade: the website talks about the firm — years in practice, the team, the values — when the visitor arrived with a situation and wants to know whether this firm handles it and what happens next. Case types and outcomes are usually buried in a menu. There is usually no way to say what your situation is before speaking to somebody, so the intake call does triage that a form could have done, and the enquiries that arrive are a mix nobody has sorted.`,
  },
  {
    match:
      /manufactur|industrial|fabricat|supply|distribut|wholesale|equipment|machin|steel|metal|plastics|packaging|components/i,
    note: `A manufacturer or distributor. What is usually true of this trade: the catalogue is bigger than a website can show as a list of pages. Products multiply across sizes, materials, finishes and grades into hundreds of valid combinations, and a specifier is not reading — they are narrowing, on a number they already hold. Spec data usually lives in PDFs that cannot be searched or filtered, and availability, which is the entire reason to call a distributor, usually appears nowhere at all.`,
  },
  {
    match: /hvac|plumb|electric|pest|clean|restoration|garage|fenc|solar|septic|paving|tree|moving/i,
    note: `Home services. What is usually true of this trade: the job is urgent when it is bought, so whoever answers first wins — and the site usually offers a phone number and a contact form that goes to an inbox. Service area is usually a paragraph rather than something checkable, so half the enquiries are outside it. Financing and pricing bands are usually absent, which is what stops a big job being approved on the spot.`,
  },
  {
    match: /restaurant|cafe|bar|hotel|resort|event|cater|salon|barber|spa|gym|fitness|studio|yoga/i,
    note: `Hospitality and appointment-led business. What is usually true of this trade: the menu, the price list or the schedule is the page everybody wants and it is usually a PDF, an image, or on somebody else's platform. Booking usually leaves the site. The photography is usually the strongest asset on hand and the smallest thing on the page.`,
  },
];

function tradeNote(lead: LeadFactsForWriting): string | null {
  const haystack = [lead.industry, lead.company].filter(Boolean).join(' ');
  return TRADE_NOTES.find((t) => t.match.test(haystack))?.note ?? null;
}

/** What the model is allowed to see, as prose it can actually use. */
function factSheet(lead: LeadFactsForWriting): string {
  const lines: string[] = [`Business: ${lead.company}`];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`${label}: ${value}`);
  };

  push('Industry', lead.industry);
  push('Where', [lead.city, lead.region].filter(Boolean).join(', ') || null);
  push('Their website', lead.originalWebsite);
  push('Contact', [lead.contactName, lead.contactRole].filter(Boolean).join(', ') || null);
  push('What we think of the site they have', lead.currentSiteAssessment);
  push('The one observation from research', lead.personalizedObservation);
  push('Google rating', lead.googleRating);
  push('Number of Google reviews', lead.googleReviewCount);
  push('Employees', lead.employeeCount);
  push('Locations', lead.locationCount);
  push('Founded', lead.yearFounded);

  if (lead.painPoints?.length) {
    lines.push(`What is wrong today:\n${lead.painPoints.map((p) => `- ${p}`).join('\n')}`);
  }
  if (lead.essentials?.length) {
    lines.push(`What they need:\n${lead.essentials.map((p) => `- ${p}`).join('\n')}`);
  }

  return lines.join('\n');
}

/**
 * Shapes an invented fact takes.
 *
 * Not a content filter — it is a check that the one rule which cannot be
 * left to a prompt was actually followed. A draft that trips this is returned
 * to the caller as a failure rather than quietly saved, because the failure
 * mode it guards against (a confident false claim about a business, sent from
 * a studio selling attention to detail) is worse than having no draft.
 */
const INVENTION_PATTERNS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\b(?:19|20)\d{2}\b/, what: 'a year nobody gave it' },
  { pattern: /\b\d{1,3}\s?%/, what: 'a percentage' },
  { pattern: /\b(?:double|triple|increase|boost|grow)\s+your\b/i, what: 'a promised result' },
  { pattern: /\bI (?:called|rang|phoned|spoke to|visited|stopped by)\b/i, what: 'a contact that never happened' },
  { pattern: /\byour (?:traffic|rankings?|conversion rate|bounce rate|revenue)\b/i, what: 'a metric we do not hold' },
];

/**
 * Facts that make a number in the text legitimate. A rating of 4.8 or a
 * founding year we were told about is not an invention, so the check has to
 * know what it was given.
 */
function allowedNumbers(lead: LeadFactsForWriting): string[] {
  return [
    lead.googleRating,
    lead.googleReviewCount,
    lead.employeeCount,
    lead.locationCount,
    lead.yearFounded,
  ]
    .filter((n): n is number => typeof n === 'number')
    .map(String);
}

export function findInventedFacts(text: string, lead: LeadFactsForWriting): string[] {
  const given = [
    lead.currentSiteAssessment,
    lead.personalizedObservation,
    ...(lead.painPoints ?? []),
    ...(lead.essentials ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const numbers = allowedNumbers(lead);

  const found: string[] = [];
  for (const { pattern, what } of INVENTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const hit = match[0];
    // A number that appears in the facts, or in the research prose, is theirs.
    if (numbers.some((n) => hit.includes(n)) || given.includes(hit.toLowerCase())) continue;
    found.push(`${what} ("${hit.trim()}")`);
  }
  return found;
}

/** The draft is only useful if it can actually be sent in one click. */
function looksSendable(draft: string): boolean {
  return /^Subject:\s*\S.*\r?\n\r?\n[\s\S]{80,}$/.test(draft.trim());
}

/**
 * Writes both emails for one lead.
 *
 * Throws when the key is missing, the call fails, or the draft comes back
 * unsendable or carrying an invented fact. Callers report the failure rather
 * than saving anything — a lead with no draft falls back to the generic
 * template, which is a worse email and an honest one.
 */
export async function writeLeadEmails(lead: LeadFactsForWriting): Promise<WrittenEmails> {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });
  const trade = tradeNote(lead);

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8192,
    // Worth thinking about. This is the email that decides whether a business
    // ever replies, it is written once and sent once, and nobody is sitting
    // watching it happen — the opposite trade to tidying a call note.
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          'Write both emails for this business. Use only these facts.',
          '',
          factSheet(lead),
          trade
            ? [
                '',
                'BACKGROUND ON THE TRADE — read this, do not quote it.',
                'This is what is usually true of businesses like this one. Nobody has checked whether it is true of THIS one, so you may write about the problem as something that happens in their trade, and you may not state it as something you saw on their website.',
                '',
                trade,
              ].join('\n')
            : '',
        ]
          .join('\n')
          .trim(),
      },
    ],
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('No answer came back');

  const parsed = JSON.parse(block.text) as WrittenEmails;
  const coldEmail = String(parsed.coldEmail ?? '').trim();
  const mockupEmail = String(parsed.mockupEmail ?? '').trim();
  const observation = String(parsed.observation ?? '').trim();

  if (!looksSendable(coldEmail)) {
    throw new Error('The cold email came back without a usable subject line');
  }
  if (!looksSendable(mockupEmail)) {
    throw new Error('The mockup email came back without a usable subject line');
  }

  const invented = [
    ...findInventedFacts(coldEmail, lead),
    ...findInventedFacts(mockupEmail, lead),
  ];
  if (invented.length > 0) {
    throw new Error(`The draft claimed something nobody told it: ${invented.join(', ')}`);
  }

  return { coldEmail, mockupEmail, observation };
}
