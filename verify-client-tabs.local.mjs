import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'billing0@client.test', password: 'devpassword', userType: 'client' }),
});
const token = (res.headers.getSetCookie?.() ?? []).join(';').match(/auth_token=([^;]+)/)?.[1];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.addCookies([{ name: 'auth_token', value: token, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const check = (l, ok, d='') => console.log(`${ok?'PASS':'FAIL'}  ${l}${d?' — '+d:''}`);

await page.goto('http://localhost:3000/client/cmsjmf2ir001ei4tozgq5u7qd', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="tablist"]', { timeout: 90000 });
await page.waitForTimeout(4000);

const tabs = page.getByRole('tab');
const info = await tabs.evaluateAll((els) => els.map((e) => ({
  name: e.getAttribute('aria-label') || e.textContent.trim(),
  selected: e.getAttribute('aria-selected'),
  tabindex: e.getAttribute('tabindex'),
})));
console.log('TABS:', JSON.stringify(info));
check('exactly one tab is marked current', info.filter(t=>t.selected==='true').length===1);
check('only the current tab is in the tab order', info.filter(t=>t.tabindex==='0').length===1);
check('a real panel exists, named by the current tab', (await page.getByRole('tabpanel').count())===1);
check('the onboarding badge is spoken, not just coloured',
  info.some(t => /still to answer/.test(t.name)), info.map(t=>t.name).join(' | '));

await tabs.first().focus();
await page.keyboard.press('ArrowRight');
const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('ArrowRight moves focus along the row', /Timeline/.test(focused||''), focused);
check('and does not switch panel by itself', (await tabs.first().getAttribute('aria-selected'))==='true');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
check('Enter opens it', (await tabs.nth(1).getAttribute('aria-selected'))==='true');
await page.screenshot({ path: '/tmp/claude-0/-home-user-bothmade/2808a96e-a57f-5bb5-9ac8-2926009bc8e0/scratchpad/shots/32-client-tabs.png', clip:{x:0,y:250,width:1280,height:420} });
await browser.close();
