import { readFileSync, writeFileSync } from 'node:fs';
import { writeEmails } from './engine.mjs';

const HEADERS = ['company','email','industry','city','state','country','originalWebsite','source','status',
  'personalisedColdEmail','mockupEmail','personalizedObservation','salesNote','tags','leadScore',
  'estimatedValue','lowestEstimate','highestEstimate','dateAdded'];

const rows = readFileSync('harvest.tsv','utf8').split('\n').filter(Boolean).map((l) => {
  const [company, domain, niche, city, state] = l.split('\t');
  return { company: company.trim(), domain: (domain||'').trim(), niche: niche.trim(), city: city.trim(), state: state.trim() };
});

const cell = (v='') => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
const seen = new Set();
const out = [];

for (const r of rows) {
  const key = r.company.toLowerCase().replace(/[^a-z0-9]/g,'');
  if (seen.has(key)) continue;
  seen.add(key);
  const e = writeEmails(r);
  out.push({
    company: r.company,
    // Convention only — the standard public inbox where a domain is known,
    // blank where it is not. Never invented.
    email: r.domain ? `info@${r.domain}` : '',
    industry: r.niche,
    city: r.city,
    state: r.state,
    country: 'USA',
    originalWebsite: r.domain ? `https://${r.domain}` : '',
    source: 'cold-outreach',
    status: 'researched',
    personalisedColdEmail: e.cold,
    mockupEmail: e.mockup,
    personalizedObservation: e.observation,
    salesNote: r.domain
      ? 'Confirm the inbox before sending — info@ is the convention, not a verified address.'
      : 'No website found in research. Look up the site and address, or call.',
    tags: `field-run-003;${r.niche.toLowerCase().replace(/\s+/g,'-')};${r.state}`,
    leadScore: '75',
    estimatedValue: e.value,
    lowestEstimate: e.low,
    highestEstimate: e.high,
    dateAdded: '06082026',
  });
}

writeFileSync(process.argv[2], [HEADERS.join(','), ...out.map((o)=>HEADERS.map((h)=>cell(o[h])).join(','))].join('\n')+'\n');

const withEmail = out.filter((o)=>o.email).length;
console.log('rows:', out.length, '| with email+site:', withEmail, '| name only:', out.length-withEmail);
const uniqCold = new Set(out.map((o)=>o.personalisedColdEmail)).size;
console.log('distinct cold emails:', uniqCold, '| distinct mockup emails:', new Set(out.map((o)=>o.mockupEmail)).size);
console.log('\n--- SAMPLE ---\n' + out[0].personalisedColdEmail + '\n\n' + out[0].mockupEmail);
