import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const NAME_FN = `(el) => {
  const byId = el.getAttribute('aria-labelledby');
  if (byId) { const t = byId.split(/\\s+/).map((i)=>document.getElementById(i)?.textContent||'').join(' ').trim(); if (t) return t; }
  if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();
  const w = el.closest('label'); if (w?.textContent?.trim()) return w.textContent.trim();
  if (el.id) { const f = document.querySelector('label[for=' + JSON.stringify(el.id) + ']'); if (f?.textContent?.trim()) return f.textContent.trim(); }
  if (el.getAttribute('title')?.trim()) return el.getAttribute('title').trim();
  return '';
}`;

const PROJECT = 'cmsjmf2ir001ei4tozgq5u7qd';
const PTOKEN = '65db3a52059f42469c273f37de65ce44cfdbff0a11f84edaa6693f341ce08dcd';
const LEAD = 'cmsjmf2hk000li4to5n6f6iwg';
const LTOKEN = '2ccce61e01ca46d683870314e50c6a50de32bf4271634395a3dcc37e65c14252';

// Log in as the client so the portal is reachable.
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'billing0@client.test', password: 'devpassword', userType: 'client' }),
}).catch(() => null);
const raw = res ? (res.headers.getSetCookie?.() ?? []).join(';') : '';
const token = raw.match(/([a-z_]*token[a-z_]*)=([^;]+)/i);
console.log('client login:', res?.status, token ? `cookie ${token[1]}` : 'no cookie');

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
if (token) await ctx.addCookies([{ name: token[1], value: token[2], domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();

const ROUTES = [
  ['/', 'marketing home'],
  ['/client/login', 'client login'],
  [`/client/${PROJECT}`, 'client portal'],
  [`/status/${PROJECT}?t=${PTOKEN}`, 'shared status'],
  [`/sign/${LEAD}?t=${LTOKEN}`, 'sign & pay'],
];

for (const [route, label] of ROUTES) {
  const problems = [];
  const onErr = (m) => { if (m.type() === 'error' && !/vercel-scripts|Content Security|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0,120)}`); };
  const onRes = (r) => { if (r.status() >= 400 && r.url().includes('/api/')) problems.push(`HTTP ${r.status()} ${r.url().replace('http://localhost:3000','').slice(0,60)}`); };
  page.on('console', onErr); page.on('response', onRes);
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const unnamed = await page.evaluate(`(() => { const n = ${NAME_FN}; const o=[];
    for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea, button')) {
      if (el.offsetParent === null) continue;
      if (!n(el) && !el.textContent?.trim()) o.push(el.tagName.toLowerCase()+'['+(el.type||'')+']'+(el.placeholder?' ph="'+el.placeholder.slice(0,28)+'"':''));
    } return o; })()`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const title = await page.title();
  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  page.off('console', onErr); page.off('response', onRes);
  const notes = [];
  if (overflow > 1) notes.push(`h-overflow ${overflow}px`);
  if (unnamed.length) notes.push(`unnamed: ${[...new Set(unnamed)].slice(0,3).join(', ')}`);
  if (problems.length) notes.push(...[...new Set(problems)].slice(0,2));
  console.log(`${notes.length?'NOTE':'ok  '} ${label.padEnd(15)} h1="${(h1||'').trim().slice(0,34)}" ${notes.join(' | ')}`);
}
await browser.close();
