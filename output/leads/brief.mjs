/*
 * The call brief, per trade.
 *
 * Ten runs of leads shipped with a cold email and no brief, because no CSV
 * ever carried the columns Call HQ builds a script out of — painPointN,
 * essentialPointN, upsellPointN and the checklist tags. A rep opening a lead
 * got an opening line, a price, and nothing to say in between.
 *
 * WHAT THIS IS AND IS NOT. These are the failure modes of a trade, not an
 * audit of a specific website. Every med spa with a phone number where a
 * booking button should be fails the same way, and that is what the rep opens
 * with — the same basis as the cold email already shipped in these files. The
 * per-business line stays `personalizedObservation`, which was written off
 * the actual site. Nothing here claims to have looked at anybody's gallery.
 *
 * The `point:` half must stay short and free of colons — the importer splits
 * on the first one, so a sentence with a colon in it loses its front half.
 */

/** Checklist tags. Only keys lib/leads.ts actually knows; anything else is dropped silently. */
const TAGS = {
  booking: 'no-booking',
  mobile: 'not-mobile-friendly',
  dated: 'outdated-design',
  seo: 'poor-seo',
  slow: 'slow-site',
  brand: 'weak-branding',
  manual: 'manual-processes',
  blind: 'no-analytics',
};

export const BRIEFS = {
  'Med spa': {
    tags: [TAGS.booking, TAGS.mobile, TAGS.dated],
    pains: [
      'No booking after hours: the decision to book happens at nine at night on a phone, and the only way in is a front desk that shut at five.',
      'Treatments with no prices: she has to ring and ask what tox costs, which is the one call a first-timer will not make.',
      'Reviews doing the selling on the wrong page: the thing that closes her is two clicks from where she lands.',
    ],
    essentials: [
      'Booking on the homepage: live at midnight, two taps, no phone call.',
      'Treatment menu with prices: stated plainly so nobody has to ring to find out.',
      'Reviews beside the booking button: the proof and the action on one screen.',
    ],
    upsells: [
      'Membership signup online: recurring revenue that does not need the front desk.',
      'Automated reminders and rebooking: fewer no-shows without anybody chasing.',
    ],
  },

  'Cosmetic dentistry': {
    tags: [TAGS.booking, TAGS.mobile, TAGS.dated],
    pains: [
      'Case work buried: a smile-makeover patient researches for months alone at night, and the before-and-afters are two menus deep.',
      'No price range anywhere: the biggest case of the month wants a number before they will pick up the phone.',
      'Booking that needs the front desk awake: the consult request that would have come in at nine at night never comes in at all.',
    ],
    essentials: [
      'Case gallery up front: filterable by treatment, sized for a phone.',
      'A price range said out loud: in real numbers, with financing mentioned before they ask.',
      'Consult booking on the same screen: not behind a form that goes to an inbox.',
    ],
    upsells: [
      'Financing pre-qualification: the objection handled before the call.',
      'Automated recall and reactivation: the patients you already have, coming back.',
    ],
  },

  'Plastic surgery': {
    tags: [TAGS.booking, TAGS.mobile, TAGS.dated],
    pains: [
      'The gallery is the whole sale and it is buried: results sit three taps deep in a viewer that fights a phone.',
      'Consult requests only in office hours: the decision is live for about four minutes, at eleven at night.',
      'Nothing filterable by procedure: she wants her procedure, on her body type, and gets a slideshow.',
    ],
    essentials: [
      'Results first: filterable by procedure, built for a phone because that is the device.',
      'Consult request on every screen: no phone call, no waiting for Monday.',
      'Procedure pages that answer the real questions: recovery, cost, who is a candidate.',
    ],
    upsells: [
      'Virtual consult booking: a paid consult taken online, before they cool off.',
      'Financing pre-qualification: the objection handled before the call.',
    ],
  },

  'Cosmetic dermatology': {
    tags: [TAGS.booking, TAGS.mobile, TAGS.dated],
    pains: [
      'Cosmetic work hidden behind the medical practice: the patient paying cash cannot tell you do what she wants.',
      'No booking after hours: she decides at night and books wherever the button is.',
      'No prices on anything: the first question every cosmetic patient has, unanswered.',
    ],
    essentials: [
      'A cosmetic side to the site: separate from medical dermatology, with its own booking.',
      'Treatments priced and bookable: two taps, working at midnight.',
      'Before-and-afters by concern: not by treatment name nobody searches for.',
    ],
    upsells: [
      'Membership or package signup online: recurring revenue without the front desk.',
      'Automated reminders and rebooking: fewer gaps in the diary.',
    ],
  },

  'Fertility clinic': {
    tags: [TAGS.booking, TAGS.mobile, TAGS.dated],
    pains: [
      'Success rates hard to find: it is the only number a patient is actually comparing you on.',
      'Costs not stated: the single biggest source of anxiety, left to a phone call they are afraid to make.',
      'Consult booking behind a form: read on Monday, by which point they have booked elsewhere.',
    ],
    essentials: [
      'Success rates stated plainly: by age band, where a patient can find them.',
      'Costs and financing up front: what a cycle runs to, said out loud.',
      'Consult booking online: at the hour people actually research this.',
    ],
    upsells: [
      'Patient portal: paperwork and results without the phone tag.',
      'Automated nurture for enquiries: the months between first look and first cycle.',
    ],
  },

  'Personal injury law': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.seo],
    pains: [
      'Case results not up front: the only thing that separates you from the firm advertising on the same billboard.',
      'No way to make contact at the hour it happens: an accident is not a nine-to-five event.',
      'The site fights a phone: which is the only device somebody in a hospital bed has.',
    ],
    essentials: [
      'Case results and settlements front and centre: real numbers, real cases.',
      'Contact that works at any hour: click to call, text, and a form that gets answered.',
      'Built for a phone first: because that is where every one of these enquiries starts.',
    ],
    upsells: [
      'Intake automation: qualifying the enquiry before it reaches a paralegal.',
      'Local landing pages by practice area: the searches you are currently invisible for.',
    ],
  },

  'Family law': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.seo],
    pains: [
      'No sense of the person behind the firm: family law is chosen on trust and the site is a list of services.',
      'Consultations only by phone: at the exact moment somebody does not want to say it out loud.',
      'Fees never mentioned: the question every single enquiry has and nobody will ask first.',
    ],
    essentials: [
      'The people, properly: who you are, in a way that earns a hard phone call.',
      'Consultation booking online: discreet, at the hour people research this.',
      'Fee structure explained: not a number necessarily, but how it works.',
    ],
    upsells: [
      'Secure client portal: documents without email attachments.',
      'Automated intake and screening: fewer consultations that were never going to convert.',
    ],
  },

  'Wealth management': {
    tags: [TAGS.dated, TAGS.brand, TAGS.mobile],
    pains: [
      'The site looks smaller than the practice: somebody handing over eight figures is reading it for reassurance and not finding any.',
      'No clear sense of who you are for: a prospect cannot tell in ten seconds whether they are your client.',
      'No way to start a conversation: an introduction meeting is the only product and it is behind a phone number.',
    ],
    essentials: [
      'A site that matches the size of the money: credibility is the entire job here.',
      'Who you serve, stated plainly: the client you want, described so they recognise themselves.',
      'Introduction meetings bookable online: the first step, made easy.',
    ],
    upsells: [
      'Client portal and reporting: what the big firms have and you are compared against.',
      'Insight publishing that gets read: the reason a prospect comes back before they call.',
    ],
  },

  'Custom home building': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.brand],
    pains: [
      'The portfolio is the entire sale and it is presented badly: a phone-sized gallery of finished homes is what wins a build.',
      'No price band anywhere: a client with a budget cannot tell whether you are their builder or twice their budget.',
      'Nothing about how the process works: the fear with a custom build is the unknown, not the price.',
    ],
    essentials: [
      'Portfolio built for a phone: full-bleed, fast, filterable by style and size.',
      'A price band stated out loud: per square foot or per project, so the wrong enquiries stop.',
      'The process explained: what happens between the first meeting and the keys.',
    ],
    upsells: [
      'Client build portal: selections and progress without the weekly phone call.',
      'Land and lot listings: the enquiry that starts before there is a plan.',
    ],
  },

  'Kitchen and bath remodeling': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.booking],
    pains: [
      'Before-and-afters are the whole pitch and they are hard to reach: a remodel is bought with the eyes.',
      'No budget guidance at all: every enquiry starts with a conversation about whether they can afford you.',
      'No way to book a consultation: the form goes to an inbox and the momentum dies over the weekend.',
    ],
    essentials: [
      'Before-and-after galleries by room: sized for a phone, quick to scroll.',
      'Budget ranges stated: typical spend for a kitchen and for a bath, plainly.',
      'Consultation booking online: while they are still looking at the photos.',
    ],
    upsells: [
      'Design questionnaire before the visit: a shorter, better first meeting.',
      'Financing pre-qualification: the objection handled before you drive out there.',
    ],
  },

  'Pool building': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.brand],
    pains: [
      'The build gallery is what sells and it is buried: nobody buys a pool from a spec list.',
      'No price band anywhere: a homeowner has no idea whether you build forty-thousand pools or hundred-and-forty.',
      'A season-long sales cycle with nothing to hold the enquiry: they look in February and buy in May, from whoever stayed in front of them.',
    ],
    essentials: [
      'Build gallery front and centre: full-bleed, phone-first, filterable by style.',
      'A starting price said out loud: so the enquiries you get are ones you want.',
      'Consultation booking online: at the hour people daydream about this.',
    ],
    upsells: [
      'Design visualiser or 3D walkthrough: the thing that closes the February looker.',
      'Service and maintenance signup: revenue after the build is paid for.',
    ],
  },

  'Landscape design build': {
    tags: [TAGS.mobile, TAGS.dated, TAGS.brand],
    pains: [
      'The portfolio does not look like the work: high-end landscape is bought on images and the images are small and slow.',
      'No project budget guidance: the difference between a planting plan and a full build is fifty thousand dollars and the site says neither.',
      'No way to start a conversation properly: a contact form for a six-figure project.',
    ],
    essentials: [
      'Portfolio that does the work justice: large, fast, phone-first, by project type.',
      'Project budget bands stated: so the enquiries match the work you want.',
      'Consultation booking with the right questions asked up front.',
    ],
    upsells: [
      'Design package sold online: a paid first step that qualifies hard.',
      'Maintenance contracts online: recurring revenue off the builds you already did.',
    ],
  },
};

/** The columns the importer reads, for one lead. Empty object for a trade we have no brief for. */
export function briefColumns(industry) {
  const b = BRIEFS[industry];
  if (!b) return {};
  const out = { painPoints: b.tags.join(',') };
  b.pains.forEach((p, i) => (out[`painPoint${i + 1}`] = p));
  b.essentials.forEach((p, i) => (out[`essentialPoint${i + 1}`] = p));
  b.upsells.forEach((p, i) => (out[`upsellPoint${i + 1}`] = p));
  return out;
}
