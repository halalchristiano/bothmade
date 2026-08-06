import { readFileSync, writeFileSync } from 'node:fs';
import { writeEmails } from './engine2.mjs';

const HEADERS = ['company','email','phone','industry','city','state','country','originalWebsite','source','status',
  'personalisedColdEmail','mockupEmail','personalizedObservation','salesNote','tags','leadScore',
  'estimatedValue','lowestEstimate','highestEstimate','dateAdded'];

// Already sent in field run 003 — never mail a business twice off two files.
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g,'');
const already = new Set(
  ['harvest.tsv','harvest2.tsv','harvest3.tsv','harvest4.tsv','harvest5.tsv','harvest6.tsv','harvest7.tsv'].flatMap((f) =>
    readFileSync(f,'utf8').split('\n').filter(Boolean).map((l) => key(l.split('\t')[0]))
  )
);
// Addresses too — two businesses can share an inbox, and a second email to the
// same mailbox in a week is how a domain gets marked as spam.
const mailed = new Set(
  ['harvest2.tsv','harvest3.tsv','harvest4.tsv','harvest5.tsv','harvest6.tsv','harvest7.tsv'].flatMap((f) =>
    readFileSync(f,'utf8').split('\n').filter(Boolean)
      .map((l) => (l.split('\t')[1]||'').trim().toLowerCase())
  ).filter(Boolean)
);

const rows = readFileSync('harvest8.tsv','utf8').split('\n').filter(Boolean).map((l) => {
  // An eighth column, when the harvest captured one. Every search that finds
  // an address prints a phone number beside it and the first eight runs threw
  // it away — which is how a lead the pixel flagged as reading your email
  // ended up in "no phone number on file".
  const [company, email, domain, niche, city, state, source, phone] = l.split('\t');
  return { company: company.trim(), email: email.trim(), domain: domain.trim(), niche: niche.trim(),
           city: city.trim(), state: state.trim(), verified: source.trim(), phone: (phone||'').trim() };
});

const cell = (v='') => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
const seen = new Set();
const out = [];

// Confirmed addresses first, so if the file is trimmed to 100 the verified
// ones are the ones that survive.
rows.sort((a, b) => (a.verified === 'confirmed' ? 0 : 1) - (b.verified === 'confirmed' ? 0 : 1));

for (const r of rows) {
  if (out.length >= 100) break;
  const k = key(r.company);
  if (seen.has(k) || already.has(k)) continue;
  if (!r.email || !r.email.includes('@')) continue;   // email is the whole point of this batch
  if (mailed.has(r.email.toLowerCase())) continue;
  if (!r.phone) continue;   // this batch is email AND phone or it does not ship
  const key_ = k;
  seen.add(key_);
  const e = writeEmails(r);
  out.push({
    company: r.company,
    email: r.email,
    phone: r.phone,
    industry: r.niche,
    city: r.city,
    state: r.state,
    country: 'USA',
    originalWebsite: `https://${r.domain}`,
    source: 'cold-outreach',
    status: 'researched',
    personalisedColdEmail: e.cold,
    mockupEmail: e.mockup,
    personalizedObservation: e.observation,
    salesNote: r.verified === 'confirmed'
      ? 'Address published by the business itself — verified in research.'
      : 'info@ on their own domain — the convention. Worth a quick check before a big send.',
    tags: `field-run-010;${r.niche.toLowerCase().replace(/\s+/g,'-')};${r.state};${r.verified}-email`,
    leadScore: r.verified === 'confirmed' ? '85' : '75',
    estimatedValue: e.value,
    lowestEstimate: e.low,
    highestEstimate: e.high,
    dateAdded: '06082026',
  });
}

writeFileSync(process.argv[2], [HEADERS.join(','), ...out.map((o)=>HEADERS.map((h)=>cell(o[h])).join(','))].join('\n')+'\n');
console.log('rows:', out.length, '| all have email:', out.every((o)=>o.email.includes('@')),
  '| all have phone:', out.every((o)=>/\d{3}/.test(o.phone||'')));
console.log('confirmed addresses:', out.filter((o)=>o.tags.includes('confirmed-email')).length);
console.log('states:', [...new Set(out.map((o)=>o.state))].join(' '));
console.log('distinct cold:', new Set(out.map((o)=>o.personalisedColdEmail)).size);
console.log('avg words:', Math.round(out.reduce((n,o)=>n+o.personalisedColdEmail.split(/\s+/).length,0)/out.length));
console.log('\n--- SAMPLE ---\n' + out[0].personalisedColdEmail + '\n\n~~~\n' + out[0].mockupEmail);
