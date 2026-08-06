// Field run 004 — the same two emails, written the way a closer writes them.
//
// The 003 voice was too essayistic: long balanced sentences, a paragraph of
// throat-clearing before the ask, and the same "structural problem underneath
// it that isn't anyone's fault" construction on every row. Reads like an
// article. Nobody replies to an article.
//
// This one is shorter and harder. Hook, the money, the fix, the offer, one
// ask, stop. Fragments where a fragment lands better than a sentence. No
// "genuinely", no "either way", no hedging on the close.

const H = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};
const pick = (arr, key) => arr[H(key) % arr.length];

// "Arnett Custom Homes's portfolio" is a stumble in the first line of a cold
// email, which is the one line that has to read clean.
const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

// The offer. Free concept, no meeting to get it, theirs to keep. Stated as a
// decision already made rather than a favour being asked.
const OFFER = [
  (c) => `So here's what I'll do. I'll build ${c} that homepage. Free. Not a slide, not a proposal — the actual page, designed for your business. Yours to keep whether you hire me or not.`,
  (c) => `Let me build it for you. A real homepage for ${c}, on me, before we ever talk money. If it's good you'll know in ten seconds. If it isn't, you've lost nothing.`,
  (c) => `Here's my offer. I'll design that page for ${c} and send it over. No charge, no meeting to get it, no invoice at the end. Keep it either way — I'd rather you saw the work than read about it.`,
  (c) => `I'd like to build it and show you. One homepage, designed for ${c}, free. Not a template with your logo on it. The real thing, and it's yours whether we work together or not.`,
];

const ASK = [
  'Want it?',
  'Want me to build it?',
  'Say yes and it\'s yours by Friday.',
  'Worth a look? One word back and I\'ll start.',
  'Should I send it over?',
];

const NOT_A_DEMO = [
  "It's a design, not a build — nothing clicks yet. Didn't want to fake a demo.",
  "Static design, so nothing on it works yet. I'd rather show you the real idea than a fake demo.",
];

const NICHES = {
  'Med spa': {
    subject: () => ['your 9pm bookings', 'the booking you lost last night', 'reviews vs booking button', 'she booked somewhere else'],
    hook: (c, city) => [
      `Found ${c} at 9pm on my phone, the way your next client will. The reviews sold me in about forty seconds. Then the only way to book was a phone number and a front desk that shut at five.`,
      `Looked you up the way a new client does — evening, phone, already decided she wants tox, just picking where. ${c} won on reviews. Then booking meant calling in the morning.`,
      `Your reviews do the selling. I read them on my phone at 9pm in ${city} and I was sold. Then I hit a phone number and office hours.`,
    ],
    money: () => [
      `That's the sale, right there. She books wherever the button is, and you never find out you lost her.`,
      `A booking a night walks that way. Silently. No missed call, no voicemail, nothing to review on Monday.`,
      `She doesn't call in the morning. She books the spa that let her book at 9pm.`,
    ],
    fix: () => [
      `Booking belongs on the homepage, next to the reviews, working at midnight.`,
      `Treatments priced, bookable in two taps, reviews right beside them.`,
    ],
    screen: () => [
      `Booking sits on the homepage next to your reviews. Two taps to Thursday at six. That's the part your site can't do tonight.`,
      `Treatments priced, bookable in two taps, reviews doing the closing right beside them. Memberships obvious instead of three pages deep.`,
    ],
    q: () => [
      `One question: would you let a new client book without a consult call first?`,
      `One thing I'd want your answer on: is membership what you'd push hardest here, or first-visit tox?`,
    ],
    band: ['$5,000', '$18,000', '10000'],
    obs: 'the reviews do the selling and the booking is a phone number that stops answering at five',
  },

  'Cosmetic dentistry': {
    subject: () => ['your veneer cases', 'the $15k case that didn\'t call', 'cases, price, booking', 'one case a month'],
    hook: (c, city) => [
      `Went looking for veneers in ${city} the way a patient does. Nine at night, on a phone, three years of putting it off. Found ${c}. Couldn't find a case that looked like mine, couldn't find a price, couldn't book.`,
      `Your case work is good. I had to dig for it — two menus deep, on a phone, at the exact moment somebody decides to spend fifteen thousand dollars on their teeth.`,
      `A smile-makeover patient researches for months, alone, at night, on a phone. I did that to ${c}. Got as far as a phone number and a form.`,
    ],
    money: () => [
      `That's the biggest case of the month deciding not to call you.`,
      `One case a month lost that way costs more than a website. Several times over.`,
      `They don't call in the morning. They keep scrolling and someone else does the case.`,
    ],
    fix: () => [
      `Cases first, filterable, a price range said out loud, and a booking that works at 9pm.`,
      `Before-and-afters up front, the range in plain numbers, financing mentioned before they ask.`,
    ],
    screen: () => [
      `Cases at the top, filterable by treatment. The range stated in real numbers. Booking that doesn't need your front desk awake.`,
      `A homepage built for the cosmetic patient rather than the check-up patient — cases, price, and one tap to a consult.`,
    ],
    q: () => [
      `One question: does a price range on the site bring you better calls or worse ones?`,
      `One thing I'd want your read on: veneers or implants — which pays you better?`,
    ],
    band: ['$6,000', '$22,000', '12000'],
    obs: 'the cases and the price range are the two things a $15k patient wants and the two hardest things to reach',
  },

  'Plastic surgery': {
    subject: () => ['your gallery on a phone', 'the 11pm consult request', 'results, then booking'],
    hook: (c, city) => [
      `Looked at ${c} the way a patient does. Eleven at night, on a phone, reviews already read twice. Your results are the whole sale and they were three taps deep in a viewer that fought me.`,
      `Went through your site as a woman who's been thinking about this for two years. Phone, late, decided. The gallery is what closes her and it's buried.`,
    ],
    money: () => [
      `That decision is live for about four minutes. Phone number and office hours and it's gone.`,
      `The consult request that would've come in at 11pm doesn't. By morning she's booked with whoever made it easy.`,
    ],
    fix: () => [
      `Results first, filtered by procedure, sized for a phone. Consult request on the same screen.`,
    ],
    screen: () => [
      `Results first, filterable by procedure, built for a phone because that's the device. Consult request on the same screen instead of behind a phone call.`,
    ],
    q: () => [
      `One question: would you let someone request a consult without speaking to your coordinator first?`,
    ],
    band: ['$8,000', '$28,000', '16000'],
    obs: 'the before-and-afters close the consult and on a phone they are three taps deep and unfilterable',
  },

  'Custom home building': {
    subject: () => ['your portfolio, sorted', 'the inquiry that wasted your Tuesday', 'they couldn\'t find their house', 'filtering your projects'],
    hook: (c, city) => [
      `Went through ${poss(c)} portfolio the way a couple with a lot and three million dollars does — hunting for the one house that looks like the one in their head. Couldn't sort by budget, style or scope. Just scrolled.`,
      `Your work is the sale. I looked at it the way a buyer does and there was no way to narrow it — no budget band, no style, no scope. Forty thumbnails and good luck.`,
      `Looked at ${c} as a client would in ${city}: trying to find the project that matches my lot and my number. Gave up before I found it.`,
    ],
    money: () => [
      `They don't email to ask. They go and look at the builder whose site let them filter.`,
      `That's a real project deciding you're not the one, on no evidence either way.`,
      `And the inquiries that do land ask for a name and a message, so your first call is an interview instead of a conversation.`,
    ],
    fix: () => [
      `Portfolio filterable by budget band, style and scope. Inquiry that asks about the lot, the number and the timing.`,
      `Sort the work the way buyers actually choose, and put the process where the fear is.`,
    ],
    screen: () => [
      `Portfolio filterable by budget, style and scope — so a couple with a specific project finds theirs in about nine seconds. Inquiry that arrives with the lot, the number and the timing on it.`,
      `Projects sortable the way buyers choose, and the build process laid out month by month, which is the part they're actually frightened of.`,
    ],
    q: () => [
      `One question: would you ever show budget bands publicly, or is that a fight with your sales process?`,
      `One thing I'd want your answer on: what do you wish every inquiry told you before you called them back?`,
    ],
    band: ['$12,000', '$35,000', '22000'],
    obs: 'the portfolio is the whole sale and there is no way to sort it by budget, style or scope',
  },

  'Pool building': {
    subject: () => ['your build gallery', 'what does one like mine cost', 'sorting your pools'],
    hook: (c, city) => [
      `Looked at ${c} the way a homeowner in ${city} does — trying to find a build that looks like my backyard, at roughly my number. One long scroll, no way to narrow it, no price anywhere.`,
      `Your builds look excellent. I went looking for one like mine and scrolled past sixty that weren't. Then couldn't find a starting number.`,
    ],
    money: () => [
      `So they call whoever showed them a pool like theirs, with a number attached.`,
      `That's a ninety-thousand-dollar build going to the company that answered the money question first.`,
    ],
    fix: () => [
      `Gallery filterable by size, style and budget. A starting number said out loud.`,
    ],
    screen: () => [
      `Builds filterable by size, style and budget band, with a starting range stated plainly and a timeline from signing to swimming.`,
    ],
    q: () => [
      `One question: would you publish a starting price, or does that cost you more than it wins?`,
    ],
    band: ['$5,000', '$18,000', '10000'],
    obs: 'the gallery cannot be sorted, so nobody finds a build that looks like their own yard',
  },

  'Kitchen and bath remodeling': {
    subject: () => ['your before-and-afters', 'the tire-kicker problem', 'quoting jobs that were never real'],
    hook: (c, city) => [
      `Looked at ${c} the way a homeowner with a sixty-thousand-dollar kitchen in mind does. Your finished work is good. There was no way to find a kitchen like mine, and no way to tell you what my job actually is.`,
      `Your before-and-afters sell this. They're in a small gallery you can't filter, so the woman with a galley kitchen never finds your galley kitchen.`,
    ],
    money: () => [
      `So you spend Tuesday evening quoting jobs that were never real, and the real one went to whoever answered first.`,
      `That's a $60k kitchen going to the company whose site made it feel easy.`,
    ],
    fix: () => [
      `Projects filterable by room, style and budget. A form that asks about the job, so it arrives ready to quote.`,
    ],
    screen: () => [
      `Before-and-afters filterable by room, style and budget band. The inquiry asks about the room, the scope and the timing — so it lands ready to quote instead of ready to interview.`,
    ],
    q: () => [
      `One question: what do you wish every inquiry told you before you called them back?`,
    ],
    band: ['$4,000', '$15,000', '8500'],
    obs: 'before-and-afters are what sell this and they sit in a gallery nobody can filter',
  },

  'Landscape design build': {
    subject: () => ['your gardens, sorted', 'design fee, unsaid', 'the inquiry that arrives vague'],
    hook: (c, city) => [
      `Went through ${poss(c)} work the way a homeowner commissioning a garden does. It's beautiful. It's also one long scroll — no way to narrow by style, scale or budget, and nothing about what design costs.`,
      `Your gardens are genuinely good. A design-led client chooses from images and yours can't be narrowed, so they never find the one that looks like their lot.`,
    ],
    money: () => [
      `So the client who wanted exactly what you do never works out that you do it.`,
      `And the inquiries that land are vague, so the first call is about scope instead of the garden.`,
    ],
    fix: () => [
      `Projects filterable by style, scale and budget. The design process spelled out so the brief arrives specific.`,
    ],
    screen: () => [
      `Projects filterable by style, scale and budget band, with the design process spelled out — so the brief that reaches you already knows what it's asking for.`,
    ],
    q: () => [
      `One question: would publishing a design fee range help you or cost you?`,
    ],
    band: ['$5,000', '$16,000', '9000'],
    obs: 'design-led buyers choose from images and yours cannot be narrowed by style, scale or budget',
  },
};

export function writeEmails(lead) {
  const n = NICHES[lead.niche];
  if (!n) throw new Error(`No copy for niche: ${lead.niche}`);
  const c = lead.company;
  const k = c + lead.city;

  const cold = [
    `Subject: ${pick(n.subject(), k + 's')}`,
    '',
    'Hi [First Name],',
    '',
    pick(n.hook(c, lead.city), k + 'h'),
    '',
    pick(n.money(), k + 'm'),
    '',
    pick(n.fix(), k + 'f'),
    '',
    pick(OFFER, k + 'o')(c),
    '',
    pick(ASK, k + 'a'),
    '',
    '[Sender Name]',
    'Bothmade',
  ].join('\n');

  const mockup = [
    `Subject: ${pick(['built it', 'here it is', `${c} — built it`], k + 'ms')}`,
    '',
    pick(['Here it is.', 'Built it. Here.', `Here it is — ${c}, as promised.`], k + 'mo'),
    '',
    pick(n.screen(), k + 'sc'),
    '',
    pick(NOT_A_DEMO, k + 'd'),
    '',
    pick(n.q(), k + 'q'),
    '',
    '[Sender Name]',
  ].join('\n');

  const [low, high, value] = n.band;
  return { cold, mockup, low, high, value, observation: n.obs };
}
