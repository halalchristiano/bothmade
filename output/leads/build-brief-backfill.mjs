/*
 * The brief backfill.
 *
 * One row per lead already imported from runs 003-010, carrying only the
 * columns Call HQ builds a script out of. The importer matches on email (or
 * company name where there is none), fills blanks only, and never touches a
 * field somebody has typed into — so this can be imported over the existing
 * leads without losing a word of what anybody wrote on a call.
 *
 * Run 002 is deliberately left out: those fifty were researched by hand and
 * carry a real per-business observation, which the brief now falls back to.
 * A generic trade brief would be a downgrade on those rows.
 *
 *   node build-brief-backfill.mjs <out.csv>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { briefColumns, BRIEFS } from './brief.mjs';

const RUNS = [3, 4, 5, 6, 7, 8, 9, 10].map(
  (n) => `/home/user/bothmade/output/leads/bothmade-leads-field-run-0${String(n).padStart(2, '0')}.csv`
);

/** Minimal RFC4180 reader — the drafts in these files are multi-line and quoted. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADERS = [
  'company',
  'email',
  'painPoints',
  'painPoint1',
  'painPoint2',
  'painPoint3',
  'essentialPoint1',
  'essentialPoint2',
  'essentialPoint3',
  'upsellPoint1',
  'upsellPoint2',
];

const out = [];
const missing = new Set();
const seen = new Set();

for (const path of RUNS) {
  for (const lead of parseCsv(readFileSync(path, 'utf8'))) {
    const cols = briefColumns(lead.industry);
    if (!Object.keys(cols).length) { missing.add(lead.industry); continue; }
    const key = (lead.email || lead.company).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ company: lead.company, email: lead.email, ...cols });
  }
}

writeFileSync(
  process.argv[2],
  [HEADERS.join(','), ...out.map((r) => HEADERS.map((h) => esc(r[h])).join(','))].join('\n') + '\n'
);

console.log('rows:', out.length);
console.log('trades covered:', Object.keys(BRIEFS).length);
if (missing.size) console.log('NO BRIEF for:', [...missing].join(', '));
console.log('every row has 3 pains:', out.every((r) => r.painPoint1 && r.painPoint2 && r.painPoint3));
console.log('every row has an email:', out.every((r) => r.email));
