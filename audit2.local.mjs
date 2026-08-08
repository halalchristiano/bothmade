import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'kiana@bothmade.studio', password: 'devpassword' }),
});
const token = (res.headers.getSetCookie?.() ?? []).join(';').match(/auth_token=([^;]+)/)?.[1];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'auth_token', value: token, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
for (const route of ['/admin/dashboard', '/admin/billing', '/admin/settings', '/admin/team-chat']) {
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
      const labelled = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (!name && !labelled && el.offsetParent !== null)
        out.push({ tag: el.tagName.toLowerCase(), placeholder: el.getAttribute('placeholder'), type: el.getAttribute('type') });
    }
    return out;
  });
  console.log(route, JSON.stringify(rows));
}
await browser.close();
