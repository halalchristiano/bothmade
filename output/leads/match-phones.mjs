/*
 * Match harvested numbers onto leads that already exist.
 *
 * The name in a directory listing is rarely the name in the CSV — "Providence
 * Dentistry" against "Providence Dentistry Charlotte", "Schaefer Advanced
 * Dentistry" against "Schaefer Advanced Dentistry PLLC". So the compare is on
 * letters and digits only, and a containment either way counts, with a floor
 * on length so short names cannot swallow long ones.
 *
 * The city has to agree as well, and that is not belt-and-braces: "Glo
 * Medspa" in Scottsdale matched "Glo Med Spa KC" in Kansas City on the name
 * alone, which would have put an Arizona number on a Missouri business and
 * sent a rep to ring a stranger. Two businesses in different cities may share
 * a name; two in the same city rarely do.
 *
 * Output is company,email,phone — the enrichment importer fills blanks only,
 * so this can be dropped straight over the existing leads.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h,i)=>[h,r[i]])));
}

const leads = [];
for (const n of [3,4,5,6,7,8,9]) {
  const p = `/home/user/bothmade/output/leads/bothmade-leads-field-run-0${String(n).padStart(2,'0')}.csv`;
  for (const r of parseCsv(readFileSync(p, 'utf8'))) leads.push(r);
}

const harvest = readFileSync(process.argv[2], 'utf8').trim().split('\n')
  .map((l) => l.split('\t')).filter((p) => p.length === 3)
  .map(([name, city, phone]) => ({ name, city, phone, key: norm(name) }));

const out = [];
const used = new Set();
for (const lead of leads) {
  const k = norm(lead.company);
  // Longest match wins, so "Charlotte Dentistry" cannot claim a row that
  // "Charlotte Family Dentistry" matches more completely.
  const hit = harvest
    .filter(
      (h) =>
        h.key.length >= 8 &&
        norm(h.city) === norm(lead.city) &&
        (k.includes(h.key) || h.key.includes(k))
    )
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (!hit) continue;
  if (used.has(lead.company)) continue;
  used.add(lead.company);
  out.push({ company: lead.company, email: lead.email, phone: hit.phone, matched: hit.name });
}

const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g,'""')}"` : String(v ?? ''));
writeFileSync(process.argv[3],
  ['company,email,phone', ...out.map((r) => [r.company, r.email, r.phone].map(esc).join(','))].join('\n') + '\n');

console.log('harvested numbers:', harvest.length);
console.log('matched onto existing leads:', out.length);
for (const r of out) if (norm(r.company) !== norm(r.matched)) console.log('  fuzzy:', r.matched, '->', r.company);
