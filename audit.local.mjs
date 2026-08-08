import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'kiana@bothmade.studio', password: 'devpassword' }),
});
const token = (res.headers.getSetCookie?.() ?? []).join(';').match(/auth_token=([^;]+)/)?.[1];
if (!token) throw new Error('login failed — rate limited?');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'auth_token', value: token, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();

const problems = [];
page.on('console', (m) => { if (m.type() === 'error' && !/vercel-scripts|Content Security/.test(m.text())) problems.push(`console: ${m.text().slice(0,140)}`); });
page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0,110)}`));
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) problems.push(`HTTP ${r.status()} ${r.url().replace('http://localhost:3000','')}`); });

const ROUTES = ['/admin/dashboard','/admin/sales','/admin/call','/admin/mockup-queue','/admin/priorities','/admin/clients','/admin/projects','/admin/analytics','/admin/billing','/admin/team','/admin/settings','/admin/design','/admin/deployment','/admin/team-chat'];

for (const route of ROUTES) {
  problems.length = 0;
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // Interactive elements with no accessible name at all.
  const unnamed = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')) {
      const name = (el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title') || '').trim();
      const labelled = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (!name && !labelled && el.offsetParent !== null) out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
    }
    return out;
  });
  const notes = [];
  if (overflow > 1) notes.push(`h-overflow ${overflow}px`);
  if (unnamed.length) notes.push(`unnamed controls: ${[...new Set(unnamed)].slice(0,4).join(', ')}`);
  if (problems.length) notes.push(...[...new Set(problems)].slice(0, 3));
  console.log(`${notes.length ? 'NOTE ' : 'ok   '} ${route.padEnd(24)} ${notes.join(' | ')}`);
}
await browser.close();
