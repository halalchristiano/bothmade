// Field run 003 — the two emails, written per business.
//
// Every slot below has several variants and the pick is a hash of the company
// name, so two practices in the same city on the same day get different
// emails. Nothing here invents a fact: the only things interpolated are the
// company name, the city and the trade — all of which came off the harvest.

const H = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};
const pick = (arr, key) => arr[H(key) % arr.length];

// ---------------------------------------------------------------------------
// Shared moves. The offer is the point of the whole email: a free concept,
// nothing to pay, no call required, and they keep it either way.
// ---------------------------------------------------------------------------

const OFFER = [
  (c) =>
    `Here's what I'd like to do about it. I'll build ${c} a homepage concept — a real one, designed for your business, not a template with your logo dropped in — and send it over. It costs you nothing and there's no obligation attached to it. If you like it we can talk. If you don't, you keep the ideas and I go away.`,
  (c) =>
    `So rather than describe what I'd change, I'd rather just build it. I'll put together a homepage concept for ${c}, free, and send it to you. No meeting required to get it, no invoice at the end, no catch. Look at it for two minutes and tell me I'm wrong if I am.`,
  (c) =>
    `I'd like to build you one. A homepage concept for ${c}, designed properly, at my expense — not a proposal, not a deck, the actual thing. Yours to keep whether we ever work together or not. Most people who see theirs want to talk. Some don't, and that's genuinely fine.`,
  (c) =>
    `Here's my offer, and it's a simple one. Let me build ${c} a homepage concept for free. I'll design it around exactly this problem, send it over, and you decide. There's no obligation and nothing to sign to see it — I'd rather show you what we do than tell you.`,
];

const CLOSE = [
  'Want me to build you one?',
  'Want me to send one over?',
  'Should I put one together for you?',
  'Say the word and I\'ll start on it — want it?',
  'Worth two minutes of your time? Just reply yes.',
];

const HONESTY = [
  "It's a static design rather than a working build, so nothing clicks. I'd rather show you the idea honestly than fake a demo.",
  "It's a design, not a live site — nothing on it actually clicks yet. I'd rather be straight about that than fake a working demo.",
];

// ---------------------------------------------------------------------------
// The trades. Everything in here is true of the category, never a claim that
// somebody checked this particular business.
// ---------------------------------------------------------------------------

// One line per trade for the personalizedObservation column — the field the
// email composer pre-fills. Short on purpose: it has to fit in a sentence
// that starts "One thing stood out to me: ...".
const OBSERVATION = {
  'Plastic surgery': [
    'the gallery is what converts a consult and on a phone it is three taps deep and unfilterable',
    'the consult decision happens at 11pm on a phone, and booking means a phone number and office hours',
  ],
  'Med spa': [
    'everyone arriving is already sold and wants a time, and the site is built to describe treatments instead',
    'the reviews doing the selling live on Google rather than on the homepage where the decision is made',
  ],
  'Cosmetic dentistry': [
    'a $15k veneer case is decided from before-and-afters and a price range, and neither is easy to reach',
    'the cosmetic patient and the check-up patient want opposite things from one homepage',
  ],
  'Cosmetic dermatology': [
    'the cash-pay cosmetic side is buried under the medical side, and it is the side with the margin',
  ],
  'Fertility clinic': [
    'what it costs and what the success rates mean are the two hardest things on the site to find',
  ],
  'Custom home building': [
    'the portfolio is the entire product and there is no way to sort it by budget, style or scope',
    'the enquiry form asks for a name and a message, so every lead arrives unqualified',
  ],
  'Pool building': [
    'the gallery cannot be sorted by size or budget, so nobody finds a build that looks like their own yard',
  ],
  'Kitchen and bath remodeling': [
    'before-and-afters are what sell this and they are shown as a small unfilterable gallery',
  ],
  'Landscape design build': [
    'design-led buyers choose from images, and the images cannot be narrowed by style, scale or budget',
  ],
  'Personal injury law': [
    'the site is about the firm, and the visitor arrived with a situation and three questions it never answers',
    'intake is the whole business and it runs through a form that asks for a name and a message',
  ],
  'Family law': [
    'nobody wants to ring a firm to ask what it costs, so the people who most need you close the tab',
  ],
  'Wealth management': [
    'every firm in the category says the same three things, so a real prospect has no way to tell you apart',
  ],
};

const NICHES = {
  'Plastic surgery': {
    subject: (c, city) => [
      `the 11pm version of your site`,
      `your gallery, on a phone`,
      `${city} · one thing about your consults`,
      `where your consult requests go`,
    ],
    opener: (c, city) => [
      `I went looking for a plastic surgeon in ${city} the way a patient actually does — at eleven at night, on a phone, having already read every review twice.`,
      `I looked at ${c} the way someone books a consult does: late, on a phone, after six months of thinking about it and about ninety minutes of reading reviews.`,
      `I spent a while on your site as a patient would. Not at a desk — on a phone, at night, comparing you against two other ${city} practices with fourteen tabs open.`,
      `I looked at ${c} the way a woman who has been thinking about this for two years looks at it. Phone, evening, already knows what she wants, wants to know if you're the one to do it.`,
    ],
    praise: (c) => [
      `The results speak for themselves — that part isn't in question, and neither is the credentialing.`,
      `The surgical reputation is clearly there, and the reviews say what reviews for a good practice say.`,
      `You are obviously good at this. The work and the reputation both hold up.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. Your before-and-afters are the product — they are the single thing that converts — and on a phone they're usually three taps deep, in a viewer that fights you, with no way to filter to the one procedure she actually came for.`,
      `But there's a problem underneath it that isn't anyone's fault. Nobody chooses a surgeon from a paragraph. They choose from the gallery, and the gallery is nearly always buried behind a menu, unfilterable, and painful to swipe through on the device it's being viewed on.`,
      `But something structural is working against you, and it isn't anyone's fault. The decision gets made at night, on a phone, and the two things that make it — the results and the price bracket — are the two hardest things to reach on most practice sites.`,
    ],
    cost: () => [
      `So the request that would have come in at 11pm doesn't, and by morning she's booked a consult with whoever made it easy.`,
      `That decision is live for about four minutes. If booking means a phone number and office hours, it's gone.`,
      `The patient who was ready doesn't come back tomorrow. She books with the practice whose site answered her at midnight.`,
    ],
    screen: (c) => [
      `Results first, filterable by procedure, sized for a phone — because that's the device and that's the decision. Consult booking sits on the same screen rather than behind a phone number.`,
      `The gallery is the homepage, filtered by procedure and swipeable properly. Booking a consult takes one tap from any result rather than a phone call in office hours.`,
      `A phone-first layout: results at the top filterable by procedure, the reviews next to them where they do the most work, and a consult request that takes fifteen seconds at midnight.`,
    ],
    questions: () => [
      `Two questions I'd genuinely like your view on either way: which procedure do most of your consult requests come in for? And would you ever let someone book a consult without speaking to your coordinator first?`,
      `Two things I'd like your answer to: is it the gallery or the reviews that closes a consult for you? And does putting a price bracket on the site help you or waste your time?`,
    ],
    band: ['$8,000', '$28,000', '16000'],
  },

  'Med spa': {
    subject: (c, city) => [
      `booking you at 9pm`,
      `${city} · your regulars vs your website`,
      `the gap between your reviews and your site`,
      `one thing about your booking`,
    ],
    opener: (c, city) => [
      `I went looking for a med spa in ${city} the way a new client does — on a phone, in the evening, three tabs open, wanting to book Botox for Thursday.`,
      `I looked at ${c} as somebody who has decided they want tox and just needs to pick where. Phone, evening, ten minutes of attention, maximum.`,
      `I spent twenty minutes on your site the way a first-time client would: scrolling on a phone, comparing you against two other ${city} spas, ready to book if someone made it easy.`,
      `I looked at ${c} the way a client who follows you on Instagram does — arriving from a phone, already sold on the treatment, just needing a time.`,
    ],
    praise: (c) => [
      `The reviews are doing a lot of work for you, and the treatment menu is clearly built by people who know the category.`,
      `Your reputation locally is obvious, and that is the hardest part of this business to build.`,
      `The client loyalty in this category is everything and yours reads real.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. A website can list treatments; it can't take a booking at nine at night, and nine at night is when the decision gets made. Most spa sites hand that moment to a phone number and office hours.`,
      `But something structural is working against you here, and it isn't anyone's fault. Everyone arriving is already sold — they want a time, not a description — and most spa sites are built to describe treatments rather than to sell a slot on Thursday.`,
      `There's a problem underneath it that isn't anybody's fault. Your reviews are your best salesperson and they live on Google, not on your homepage, where the person deciding between you and the spa down the road never sees them.`,
    ],
    cost: () => [
      `That's a booking a night that goes somewhere else, and nobody ever knows it happened.`,
      `The client doesn't wait until morning to call. She books wherever the button was.`,
      `Every one of those is revenue that left without leaving a trace.`,
    ],
    screen: (c) => [
      `Booking is the homepage — pick the treatment, pick a time, done — with the reviews sitting right beside it where they close the sale.`,
      `Treatments priced and bookable in two taps, reviews on the same screen, and the memberships made obvious rather than hidden three pages in.`,
      `Everything a phone-first client needs in one screen: what it costs, what it looks like, and a slot on Thursday, without a phone call.`,
    ],
    questions: () => [
      `Two questions I'd genuinely like your answer to either way: would you let clients book without a consult call first? And is membership the thing you'd want pushed hardest here?`,
      `Two things I'd like your view on: are prices on the site a help or a headache for you? And which treatment brings you the most new clients?`,
    ],
    band: ['$5,000', '$18,000', '10000'],
  },

  'Cosmetic dentistry': {
    subject: (c, city) => [
      `your veneer cases, and your website`,
      `${city} · the 9pm booking problem`,
      `what a smile-makeover patient sees`,
      `one thing worth flagging`,
    ],
    opener: (c, city) => [
      `I went looking for a cosmetic dentist in ${city} the way a veneer patient does — evening, on a phone, wanting to see cases and find out roughly what it costs before speaking to anybody.`,
      `I looked at ${c} as somebody quietly researching a smile makeover would. On a phone, at night, not ready to ring a front desk yet.`,
      `I spent a while on your site as a patient with a $15k case in mind. They research for months and they research on a phone, at night, alone.`,
      `I looked at ${c} the way a patient who has been putting this off for three years looks at it — half-decided, on a phone, easily scared off.`,
    ],
    praise: (c) => [
      `The clinical side is clearly strong, and this is a category where patients can tell.`,
      `The case work speaks for itself, and the reviews back it up.`,
      `You are obviously good at the dentistry. That is not the problem here.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. A veneer case is a fifteen-thousand-dollar decision made from before-and-after photos and a price range — and on most practice sites the photos are buried in a subpage and the price is nowhere at all, which reads as expensive rather than as discreet.`,
      `But there's something structural working against you, and it isn't anyone's fault. Cosmetic patients and check-up patients want completely different things, and one homepage is nearly always built for the check-up patient — so the $15k case has to hunt for what it came for.`,
      `There's a problem underneath it that isn't anybody's fault. The decision happens at night on a phone, and booking usually means ringing a front desk between nine and five, so the moment somebody finally feels ready has nowhere to go.`,
    ],
    cost: () => [
      `That's the biggest case of the month deciding not to ring.`,
      `They don't call in the morning. They keep scrolling, and someone else gets the case.`,
      `One case a month lost that way is more than a website costs, several times over.`,
    ],
    screen: (c) => [
      `Cases first, filterable by treatment, with a price range stated plainly and a booking that works at 9pm.`,
      `A homepage built for the cosmetic patient: before-and-afters at the top, the range in plain numbers, and a request form that takes fifteen seconds.`,
      `Smile-makeover cases up front, the reviews next to them, financing said out loud, and booking that doesn't need your front desk to be awake.`,
    ],
    questions: () => [
      `Two questions I'd like your answer to either way: does putting a price range on the site help you or bring you the wrong calls? And is it veneers or implants that pays best for you?`,
      `Two things I'd genuinely like your view on: would you separate the cosmetic patient from the general one like this? And how many cases a month start as a form rather than a call?`,
    ],
    band: ['$6,000', '$22,000', '12000'],
  },

  'Cosmetic dermatology': {
    subject: (c, city) => [`your cosmetic side, buried`, `${city} · two patients, one site`, `where the elective work goes`],
    opener: (c, city) => [
      `I went through your site in ${city} as a cosmetic patient would — someone paying cash for injectables, not someone with a referral and a skin check.`,
      `I looked at ${c} the way a patient booking elective work does: on a phone, at night, cash in hand, comparing three practices.`,
      `I spent a while on your site as the cash-pay patient rather than the insurance one. They behave completely differently.`,
    ],
    praise: (c) => [
      `The medical credibility is obvious, and in this category that is exactly what the cosmetic patient is buying.`,
      `Board-certified dermatology carries real weight against a med spa, and your site does establish that.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. You are running two businesses — medical and elective — through one website, and the elective one is nearly always the one that gets buried, even though it is the one with the margin.`,
      `But there's something structural in the way, and it isn't anybody's fault. The cash-pay cosmetic patient and the insurance patient want opposite things, and one homepage can only ever be built for one of them.`,
    ],
    cost: () => [
      `So the patient with a credit card and no referral goes to a med spa with a better website and less training.`,
      `The elective work — the part that pays — is losing to spas that are worse at it and better at being found.`,
    ],
    screen: (c) => [
      `A cosmetic entrance that doesn't compete with the medical one: treatments, results and booking, in one screen, without hiding the dermatology credentials that beat every spa in town.`,
      `Two doors on the homepage, and behind the cosmetic one, everything a cash-pay patient needs before they'll book.`,
    ],
    questions: () => [
      `Two questions either way: is splitting cosmetic from medical the right division, or would that cost you crossover? And which treatment brings the most new cash-pay patients?`,
    ],
    band: ['$6,000', '$20,000', '11000'],
  },

  'Fertility clinic': {
    subject: (c, city) => [`the 2am research problem`, `${city} · what your patients read at night`, `success rates, plainly`],
    opener: (c, city) => [
      `I went through your site the way someone starting IVF in ${city} does — at two in the morning, on a phone, six months into researching, terrified and thorough.`,
      `I looked at ${c} as a couple deciding where to spend twenty thousand dollars and a year of their lives would. They read everything. Usually at night.`,
    ],
    praise: (c) => [
      `The clinical work in this field speaks for itself, and patients in this category are unusually good at judging it.`,
      `This is a decision people research harder than a house purchase, and your reputation is clearly holding up to it.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. The two things that decide it — what it actually costs and what your success rates really say — are the two things most clinic sites make hardest to find, which reads as evasive even when the answer is good.`,
      `But something structural is in the way, and it isn't anyone's fault. This is a twenty-thousand-dollar decision made by exhausted people at 2am, and most clinic sites are written for a referring physician rather than for them.`,
    ],
    cost: () => [
      `So they book a consult with the clinic that answered the money question without making them ask.`,
      `Nobody rings to ask what it costs. They just quietly go elsewhere.`,
    ],
    screen: (c) => [
      `Costs stated plainly, success rates explained in language a patient understands rather than a table they can't read, and a consult request that works at two in the morning.`,
      `A homepage written for the patient rather than the referrer: what it costs, what the numbers mean, what happens first, and how to start.`,
    ],
    questions: () => [
      `Two questions I'd genuinely like your view on: is publishing cost ranges something you'd do? And which of your numbers do patients misread most often?`,
    ],
    band: ['$12,000', '$35,000', '22000'],
  },

  'Custom home building': {
    subject: (c, city) => [
      `your portfolio, sorted`,
      `${city} · the $3M enquiry problem`,
      `what your enquiry form doesn't ask`,
      `one thing about your gallery`,
    ],
    opener: (c, city) => [
      `I went through your site in ${city} the way a couple with a lot to spend and a specific idea does — looking for the one project that looks like the house in their head.`,
      `I looked at ${c} as somebody about to hand a builder several million dollars would. They look at photos, they look for a long time, and they are trying to find themselves in your work.`,
      `I spent a while in your portfolio the way a homeowner does: hunting for the project that matches their lot, their budget and their taste, in that order.`,
      `I looked at ${c} the way people do at the start of this — nervous, doing homework, trying to work out who is going to be easy to work with for eighteen months.`,
    ],
    praise: (c) => [
      `The work itself is the strongest thing you have, and the photography does show it.`,
      `The homes are genuinely good and the reputation is clearly earned.`,
      `Nobody builds at this level by accident — the craft comes across.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. Your portfolio is the entire product and it's shown as a grid of thumbnails with no way to sort by budget, style or scope. The buyer with a specific project cannot find the one job that looks like theirs, and that project is the only thing that would have convinced them.`,
      `But something structural is working against you, and it isn't anybody's fault. What people are actually frightened of is the process — eighteen months, their money, decisions they've never made before — and almost no builder's site addresses that anywhere, so the fear does its work in silence.`,
      `There's a problem underneath it that isn't anyone's fault. Your enquiry form asks for a name and a message. So every lead arrives unqualified, and your first call is spent finding out whether the project was ever real instead of talking about the house.`,
    ],
    cost: () => [
      `So they leave without finding it, and go and look at the builder whose site let them filter.`,
      `That's a real project deciding, quietly, that you're not the one — on no evidence either way.`,
      `And half the calls you do take were never going to be anything.`,
    ],
    screen: (c) => [
      `The portfolio filterable by budget band, style and scope, so the couple with a specific project finds their project in about nine seconds.`,
      `Projects sortable the way people actually choose, plus the process laid out month by month, because that's the thing they're really nervous about.`,
      `A portfolio you can filter and an enquiry that asks about the lot, the budget and the timing — so your first call starts where the third one currently does.`,
    ],
    questions: () => [
      `Two questions I'd genuinely like your view on, whether or not this goes anywhere: is budget band something you'd ever show publicly? And what's the one question you wish every enquiry answered before you called them?`,
      `Two things I'd like your answer to: do people arrive with a lot already, or before? And would showing the process month by month help you or scare people?`,
    ],
    band: ['$12,000', '$35,000', '22000'],
  },

  'Pool building': {
    subject: (c, city) => [`your build photos, sorted`, `${city} · the backyard problem`, `what a pool buyer can't find`],
    opener: (c, city) => [
      `I went through your site in ${city} the way a homeowner planning a pool does — trying to find a build that looks like their backyard, at roughly their number.`,
      `I looked at ${c} as somebody about to spend eighty thousand dollars on a backyard would: photos first, price second, everything else a distant third.`,
      `I spent a while in your gallery the way a couple does after they've decided to do it and are just picking who.`,
    ],
    praise: (c) => [
      `The builds are genuinely impressive, and this is a business that lives or dies on photography.`,
      `The work looks excellent, and the reviews in this category are hard-won.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. The gallery is the product, and it's shown as one long scroll with no way to sort by size, style, budget or lot shape — so nobody finds the build that resembles their own yard.`,
      `But something structural is working against you here, and it isn't anybody's fault. Everyone arrives with the same two questions — what does something like mine cost, and how long does it take — and almost no pool site answers either, so both become a phone call, and most people don't make it.`,
    ],
    cost: () => [
      `So they keep scrolling, and eventually ring whoever showed them a pool like theirs.`,
      `That's a $90k build going to the company that answered the money question first.`,
    ],
    screen: (c) => [
      `Builds filterable by size, style and budget band, with a rough range said out loud and a proper enquiry rather than a contact box.`,
      `The gallery sorted the way buyers actually choose, plus a timeline that says what happens between signing and swimming.`,
    ],
    questions: () => [
      `Two questions either way: would you ever publish a starting price? And do people come to you with a design in mind, or a budget?`,
    ],
    band: ['$5,000', '$18,000', '10000'],
  },

  'Kitchen and bath remodeling': {
    subject: (c, city) => [`your before-and-afters`, `${city} · the unqualified enquiry problem`, `what your form doesn't ask`],
    opener: (c, city) => [
      `I went through your site in ${city} the way a homeowner planning a kitchen does — looking for a job like theirs, at a number they can live with.`,
      `I looked at ${c} as somebody about to spend sixty thousand dollars on a kitchen would. Photos, price, and whether you'll turn up when you say.`,
      `I spent a while on your site as a homeowner who has been putting this off for two years and has finally decided to do it.`,
    ],
    praise: (c) => [
      `The finished work looks genuinely good, and the reviews say the crews turn up — which in this trade is half the sale.`,
      `The craftsmanship comes across, and that is not true of most sites in this category.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. Before-and-afters are what sell this, and they're usually shown as a small unfilterable gallery — so the homeowner with a galley kitchen never finds your galley kitchen.`,
      `But something structural is working against you, and it isn't anybody's fault. Your enquiry form asks for a name and a message, so every lead arrives unqualified and your first call is an interview instead of a conversation.`,
    ],
    cost: () => [
      `So you spend your evenings quoting jobs that were never real, and the real ones went to whoever answered faster.`,
      `That's a $60k kitchen going to the company whose site made it feel easy.`,
    ],
    screen: (c) => [
      `Before-and-afters filterable by room, style and budget band, and an enquiry that asks about the room, the scope and the timing.`,
      `Projects sorted the way homeowners choose, ranges said out loud, and a form that arrives ready to quote.`,
    ],
    questions: () => [
      `Two questions I'd like your answer to either way: would you show budget bands? And what do you wish every enquiry told you before you rang them back?`,
    ],
    band: ['$4,000', '$15,000', '8500'],
  },

  'Landscape design build': {
    subject: (c, city) => [`your gardens, sorted`, `${city} · what a design client can't find`, `one thing about your portfolio`],
    opener: (c, city) => [
      `I went through your site in ${city} the way a homeowner commissioning a garden does — hunting for a project that looks like their lot and their taste.`,
      `I looked at ${c} as somebody planning a serious outdoor project would: design-led, photo-first, and quietly worried about what it will cost.`,
    ],
    praise: (c) => [
      `The work is beautiful and clearly design-led, which is rarer in this trade than it should be.`,
      `The gardens photograph well and the craft is obvious.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. Design-led buyers choose from images, and your images are shown as a scroll rather than something you can narrow by style, scale or budget.`,
      `But something structural is in the way, and it isn't anybody's fault. Nobody explains where design ends and build begins, or what either costs, so the enquiry arrives vague and the first call is spent on scope instead of the garden.`,
    ],
    cost: () => [
      `So the client who wanted exactly what you do never realises you do it.`,
      `That's a design fee lost to the studio with a better-sorted website.`,
    ],
    screen: (c) => [
      `Projects filterable by style, scale and budget band, with the design process laid out so the enquiry arrives knowing what it's asking for.`,
      `The portfolio narrowed the way designers choose, and a brief form that captures the lot, the ambition and the timing.`,
    ],
    questions: () => [
      `Two questions either way: do clients come to you for design or for build first? And would publishing a design fee range help or hurt?`,
    ],
    band: ['$5,000', '$16,000', '9000'],
  },

  'Personal injury law': {
    subject: (c, city) => [
      `the 2am version of your site`,
      `${city} · what an injured caller needs first`,
      `your intake, on a phone`,
      `one thing about your case pages`,
    ],
    opener: (c, city) => [
      `I went through your site in ${city} the way an injured person does — on a phone, in pain, two days after a crash, with an adjuster already calling them.`,
      `I looked at ${c} the way somebody who has never hired a lawyer before does. Frightened, on a phone, at 2am, not sure they even have a case.`,
      `I spent a while on your site as the person on the other end of your intake line would: rear-ended on Tuesday, off work, and being pressured to accept four thousand dollars.`,
    ],
    praise: (c) => [
      `The results speak for themselves, and the trial experience is obvious.`,
      `The record is genuinely strong, and in this category that record is the whole product.`,
      `You've clearly won the cases that matter. That is not the problem.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. The site is about the firm — the years, the awards, the team — and the visitor arrived with a situation. They want to know whether you handle this, what happens next, and whether it costs them anything to ask. Those three answers are usually the hardest things on the page to find.`,
      `But something structural is working against you, and it isn't anybody's fault. Every firm in town says the same four things on the same dark blue homepage, so a frightened person has no way to tell you apart, and defaults to whoever's billboard they remember.`,
      `There's a problem underneath it that isn't anyone's fault. Intake is the whole business, and most firms send an injured person to a contact form that asks for a name and a message — so nobody can tell a real case from a tyre-kicker until somebody has spent an hour on the phone.`,
    ],
    cost: () => [
      `So the case that was worth a quarter of a million rings the firm whose site felt like it was written for them.`,
      `That's a real case walking, on nothing but a website's tone.`,
      `And your intake team spends its day sorting cases a form could have sorted.`,
    ],
    screen: (c) => [
      `Written for the injured person rather than about the firm: what happens next, what it costs to ask, and an intake that triages the case as it's typed.`,
      `A homepage that answers the three questions every caller has in the first screen, and an intake form that arrives already sorted by case type and severity.`,
      `Case types up front in plain words, the results next to them, and an intake that works at 2am without a human on the line.`,
    ],
    questions: () => [
      `Two questions I'd genuinely like your view on either way: what's the one fact your intake team needs that a form never captures? And do most of your cases start as calls or as forms now?`,
      `Two things I'd like your answer to: which case type is worth the most to you? And would you let a form triage before a human speaks to them?`,
    ],
    band: ['$10,000', '$35,000', '20000'],
  },

  'Family law': {
    subject: (c, city) => [`what a frightened client reads first`, `${city} · your intake problem`, `one thing about your site`],
    opener: (c, city) => [
      `I went through your site in ${city} the way somebody deciding to file does — at night, quietly, probably not wanting anyone to know they're looking.`,
      `I looked at ${c} the way a person at the worst point of their year would. Frightened, private, and trying to work out what this is going to cost.`,
    ],
    praise: (c) => [
      `The experience is clear and this is a category where that genuinely matters.`,
      `The reputation is evident, and in family law that comes almost entirely from how people were treated.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. The site talks about the firm, and the visitor arrived with a situation they're ashamed of and no idea what the first step is. Retainers, timelines and what actually happens first are almost never on the page.`,
      `But something structural is in the way, and it isn't anybody's fault. Nobody wants to ring a law firm to find out what it costs, so the people who most need you quietly close the tab.`,
    ],
    cost: () => [
      `So the consultation that would have happened never gets booked.`,
      `That's a retainer lost to the firm that said the quiet part out loud.`,
    ],
    screen: (c) => [
      `Written for the person rather than the firm: what happens first, what a retainer looks like, and a confidential way to start that doesn't involve a phone call.`,
      `The first screen answers the three things they're too embarrassed to ring and ask, and the enquiry is private and specific.`,
    ],
    questions: () => [
      `Two questions either way: would you publish a retainer range? And how many of your consults start as a form rather than a call?`,
    ],
    band: ['$4,000', '$14,000', '8000'],
  },

  'Wealth management': {
    subject: (c, city) => [`your site vs your minimum`, `${city} · what a $5M prospect sees`, `one thing worth flagging`],
    opener: (c, city) => [
      `I went through your site in ${city} the way somebody with a liquidity event does — quietly, on a phone, comparing three firms, telling nobody.`,
      `I looked at ${c} the way a business owner who just sold would: checking whether you handle people like them before they'd ever make contact.`,
    ],
    praise: (c) => [
      `Fee-only and independent is a genuinely strong position, and the credentials are clear.`,
      `The fiduciary argument is a real one and you're on the right side of it.`,
    ],
    problem: (c) => [
      `But there's a structural problem underneath it that isn't anyone's fault. Everybody in this category says the same things — independent, fiduciary, personalised — on the same navy blue site, so a prospect with real money has no way to tell you from the firm across the street.`,
      `But something structural is working against you, and it isn't anybody's fault. The prospect wants to know who you actually serve and what you actually charge, and compliance nerves mean neither is usually on the page, so they self-select out.`,
    ],
    cost: () => [
      `So the eight-figure household never makes contact, and you never learn they were looking.`,
      `That's the introduction that would have paid for a decade of website, not happening.`,
    ],
    screen: (c) => [
      `Who you serve, said plainly, with the fee model stated in a way compliance can live with — and a first step that isn't "schedule a call".`,
      `A homepage that names the client you want, the problem you solve for them, and what working together actually costs.`,
    ],
    questions: () => [
      `Two questions either way: how much of your fee model would compliance let you state publicly? And what's the client profile you'd most like more of?`,
    ],
    band: ['$8,000', '$25,000', '15000'],
  },
};

export function writeEmails(lead) {
  const n = NICHES[lead.niche];
  if (!n) throw new Error(`No copy for niche: ${lead.niche}`);
  const c = lead.company;
  const key = c + lead.city;

  const subject = pick(n.subject(c, lead.city), key + 's');
  const cold = [
    `Subject: ${subject}`,
    '',
    'Hi [First Name],',
    '',
    pick(n.opener(c, lead.city), key + 'o'),
    '',
    pick(n.praise(c), key + 'p'),
    '',
    `${pick(n.problem(c), key + 'x')} ${pick(n.cost(), key + 'c')}`,
    '',
    pick(OFFER, key + 'f')(c),
    '',
    pick(CLOSE, key + 'z'),
    '',
    '[Sender Name]',
    'Bothmade',
  ].join('\n');

  const mockup = [
    `Subject: ${pick(['here it is', `${c} — here it is`, 'the concept, as promised'], key + 'ms')}`,
    '',
    pick(['Here it is.', `Here it is — ${c}, as promised.`, 'Here it is. Two minutes and you have seen it.'], key + 'mo'),
    '',
    pick(n.screen(c), key + 'm'),
    '',
    pick(HONESTY, key + 'h'),
    '',
    pick(n.questions(), key + 'q'),
    '',
    '[Sender Name]',
  ].join('\n');

  const [low, high, value] = n.band;
  return { cold, mockup, low, high, value, observation: pick(OBSERVATION[lead.niche], key + 'ob') };
}

export { NICHES };
