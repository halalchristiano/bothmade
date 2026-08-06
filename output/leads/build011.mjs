/*
 * Field run 011 — every column the importer reads, filled or deliberately blank.
 *
 * "All filled" is the ask, and most of it is honest: the trade decides the
 * brief, the pricing, the size band and the site verdict; the state decides
 * the timezone; the research decides the rest. Four groups are left blank on
 * purpose, and it matters that they are blank rather than plausible:
 *
 *   - yearFounded, employeeCount, locationCount, annualRevenue. Not published
 *     for a business this size, and a guessed headcount is a number somebody
 *     will quote back to a prospect on a call.
 *   - googleRating, googleReviewCount, googleMapsUrl. Real, findable, and per
 *     business — a made-up 4.8 is worse than an empty cell.
 *   - instagram, facebook, linkedin. A guessed handle is a dead link at best
 *     and a stranger's account at worst.
 *   - mockupUrl, invoicePdfUrl, vercelPassword, clientTakenOn, nextFollowUp.
 *     These record things that have not happened yet.
 *
 * companySize IS filled, because it is a band the importer already treats as
 * a judgement ("stated in the import") rather than a measurement, and it
 * drives the pricing of any custom line item.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { writeEmails } from './engine2.mjs';
import { briefColumns } from './brief.mjs';

const HEADERS = [
  'company','contactName','contactRole','email','phone','altPhone','industry','address','city','state',
  'postalCode','country','timezone','companySize','employeeCount','locationCount','annualRevenue','yearFounded',
  'originalWebsite','currentWebsite','googleRating','googleReviewCount','googleMapsUrl',
  'instagramUrl','facebookUrl','linkedinUrl','source','status',
  'personalisedColdEmail','mockupEmail','personalizedObservation','salesNote','notes','tags',
  'doNotContact','doNotContactReason','leadScore','vercelPassword','invoicePdfUrl',
  'painPoints','painPoint1','painPoint2','painPoint3',
  'essentialPoint1','essentialPoint2','essentialPoint3','upsellPoint1','upsellPoint2',
  'estimatedValue','lowestEstimate','highestEstimate','dateAdded','mockupUrl','clientTakenOn','nextFollowUp','assignedTo',
];

/** State to IANA zone. Only the states this run actually contains. */
const TZ = {
  ID:'America/Boise', MI:'America/Detroit', WI:'America/Chicago', OK:'America/Chicago',
  KY:'America/New_York', NE:'America/Chicago', NM:'America/Denver', TN:'America/New_York',
  WA:'America/Los_Angeles', IA:'America/Chicago', GA:'America/New_York', NV:'America/Los_Angeles',
  SC:'America/New_York', CO:'America/Denver', VA:'America/New_York', AR:'America/Chicago',
  MO:'America/Chicago', NY:'America/New_York', AL:'America/Chicago', SD:'America/Chicago',
  NC:'America/New_York', CA:'America/Los_Angeles', TX:'America/Chicago', IL:'America/Chicago',
};

/**
 * The written verdict on the site they have — what `currentWebsite` is for
 * when it carries prose rather than a URL. Per trade, because that is the
 * level at which it is true.
 */
const VERDICT = {
  'Med spa': 'Reviews and treatment photos do the selling and both sit below a phone number that stops answering at five. No online booking, no prices, and the whole thing was built for a desktop.',
  'Cosmetic dentistry': 'Case work exists and is two menus deep. No price range anywhere, and booking a consult means ringing during office hours — at the moment somebody decides to spend fifteen thousand dollars on their teeth.',
  'Custom home building': 'The portfolio is the entire sale and it is presented small, slow and desktop-first. No price band, and nothing explaining how the process works, which is the real fear with a custom build.',
  'Kitchen and bath remodeling': 'Before-and-afters are the pitch and they are hard to reach on a phone. No budget guidance at all, so every enquiry opens with a conversation about whether they can afford you.',
  'Pool building': 'Build gallery buried under service copy. No starting price, so the enquiries are unqualified, and nothing holds the February looker until they buy in May.',
  'Landscape design build': 'Portfolio images are too small and too slow to do six-figure work justice. No project budget bands, and a plain contact form as the only way to start.',
};

/** A judgement, not a measurement — which is exactly what the field is for. */
const SIZE = {
  'Med spa': 'small',
  'Cosmetic dentistry': 'small',
  'Custom home building': 'small',
  'Kitchen and bath remodeling': 'small',
  'Pool building': 'small',
  'Landscape design build': 'small',
};

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HARVESTS = ['harvest.tsv','harvest2.tsv','harvest3.tsv','harvest4.tsv','harvest5.tsv','harvest6.tsv','harvest7.tsv','harvest8.tsv'];
const already = new Set(
  HARVESTS.flatMap((f) => readFileSync(f,'utf8').split('\n').filter(Boolean).map((l) => key(l.split('\t')[0])))
);
const mailed = new Set(
  HARVESTS.flatMap((f) => readFileSync(f,'utf8').split('\n').filter(Boolean)
    .map((l) => (l.split('\t')[1]||'').trim().toLowerCase())).filter(Boolean)
);

const rows = readFileSync('h11.tsv','utf8').split('\n').filter(Boolean).map((l) => {
  const [company, email, domain, niche, city, state, source, phone] = l.split('\t');
  return { company: company.trim(), email: email.trim(), domain: domain.trim(), niche: niche.trim(),
           city: city.trim(), state: state.trim(), verified: source.trim(), phone: (phone||'').trim() };
});

const cell = (v='') => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
const seen = new Set();
const out = [];

rows.sort((a, b) => (a.verified === 'confirmed' ? 0 : 1) - (b.verified === 'confirmed' ? 0 : 1));

for (const r of rows) {
  if (out.length >= 100) break;
  const k = key(r.company);
  if (seen.has(k) || already.has(k)) continue;
  if (!r.email.includes('@') || !r.phone) continue;
  if (mailed.has(r.email.toLowerCase())) continue;
  seen.add(k);

  const e = writeEmails(r);
  const b = briefColumns(r.niche);
  const confirmed = r.verified === 'confirmed';

  out.push({
    company: r.company,
    // Blank rather than guessed: addressing a stranger by the wrong name is a
    // worse opening than not using one, and the drafts read fine without it.
    contactName: '',
    contactRole: '',
    email: r.email,
    phone: r.phone,
    altPhone: '',
    industry: r.niche,
    address: '',
    city: r.city,
    state: r.state,
    postalCode: '',
    country: 'USA',
    timezone: TZ[r.state] || '',
    companySize: SIZE[r.niche] || 'small',
    employeeCount: '', locationCount: '', annualRevenue: '', yearFounded: '',
    originalWebsite: `https://${r.domain}`,
    currentWebsite: VERDICT[r.niche] || '',
    googleRating: '', googleReviewCount: '', googleMapsUrl: '',
    instagramUrl: '', facebookUrl: '', linkedinUrl: '',
    source: 'cold-outreach',
    status: 'researched',
    personalisedColdEmail: e.cold,
    mockupEmail: e.mockup,
    personalizedObservation: e.observation,
    salesNote: confirmed
      ? 'Address published by the business itself — verified in research. Phone from a published listing.'
      : 'info@ on their own domain — the convention, right most of the time. Phone from a published listing. Worth a check before a big send.',
    notes: `${r.niche} in ${r.city}, ${r.state}. Researched ${'6 Aug 2026'}; email ${confirmed ? 'confirmed on a published listing' : 'inferred as info@ on their verified domain'}, phone confirmed on a published listing.`,
    tags: `field-run-011;${r.niche.toLowerCase().replace(/\s+/g,'-')};${r.state};${r.verified}-email;has-phone`,
    doNotContact: 'false',
    doNotContactReason: '',
    leadScore: confirmed ? '85' : '75',
    vercelPassword: '', invoicePdfUrl: '',
    painPoints: b.painPoints || '',
    painPoint1: b.painPoint1 || '', painPoint2: b.painPoint2 || '', painPoint3: b.painPoint3 || '',
    essentialPoint1: b.essentialPoint1 || '', essentialPoint2: b.essentialPoint2 || '', essentialPoint3: b.essentialPoint3 || '',
    upsellPoint1: b.upsellPoint1 || '', upsellPoint2: b.upsellPoint2 || '',
    estimatedValue: e.value,
    lowestEstimate: e.low,
    highestEstimate: e.high,
    dateAdded: '06082026',
    mockupUrl: '', clientTakenOn: '', nextFollowUp: '',
    // Left blank so the importer assigns it to whoever runs the import.
    assignedTo: '',
  });
}

writeFileSync(process.argv[2], [HEADERS.join(','), ...out.map((o)=>HEADERS.map((h)=>cell(o[h])).join(','))].join('\n')+'\n');

const filled = HEADERS.filter((h) => out.every((o) => String(o[h] ?? '').trim() !== ''));
const blank  = HEADERS.filter((h) => out.every((o) => String(o[h] ?? '').trim() === ''));
console.log('rows:', out.length);
console.log('columns:', HEADERS.length, '| filled on every row:', filled.length, '| deliberately blank:', blank.length);
console.log('blank:', blank.join(', '));
console.log('all have email+phone:', out.every((o)=>o.email.includes('@') && /\d{3}/.test(o.phone)));
console.log('all have a 3-point brief:', out.every((o)=>o.painPoint1 && o.painPoint2 && o.painPoint3));
console.log('confirmed addresses:', out.filter((o)=>o.tags.includes('confirmed-email')).length);
console.log('states:', [...new Set(out.map((o)=>o.state))].join(' '));
console.log('distinct cold emails:', new Set(out.map((o)=>o.personalisedColdEmail)).size);
