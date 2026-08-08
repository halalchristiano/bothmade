import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'billing0@client.test', password: 'devpassword', userType: 'client' }),
});
const token = (res.headers.getSetCookie?.() ?? []).join(';').match(/auth_token=([^;]+)/)?.[1];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await ctx.addCookies([{ name: 'auth_token', value: token, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) console.log(`  HTTP ${r.status()} ${r.url().replace('http://localhost:3000','')}`); });
await page.goto('http://localhost:3000/client/cmsjmf2ir001ei4tozgq5u7qd', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
console.log('url:', page.url(), '| h1:', (await page.locator('h1').first().textContent().catch(()=>'')).trim());
const NAME_FN = `(el)=>{const b=el.getAttribute('aria-labelledby');if(b){const t=b.split(/\\s+/).map(i=>document.getElementById(i)?.textContent||'').join(' ').trim();if(t)return t;}
 if(el.getAttribute('aria-label')?.trim())return el.getAttribute('aria-label').trim();const w=el.closest('label');if(w?.textContent?.trim())return w.textContent.trim();
 if(el.id){const f=document.querySelector('label[for='+JSON.stringify(el.id)+']');if(f?.textContent?.trim())return f.textContent.trim();}
 if(el.getAttribute('title')?.trim())return el.getAttribute('title').trim();return '';}`;
const unnamed = await page.evaluate(`(()=>{const n=${NAME_FN};const o=[];
 for(const el of document.querySelectorAll('input:not([type=hidden]), select, textarea, button, a[href]')){ if(el.offsetParent===null) continue;
   if(!n(el) && !el.textContent?.trim()) o.push({tag:el.tagName.toLowerCase(),type:el.type||'',cls:String(el.className).split(' ').slice(0,2).join(' '),ph:el.placeholder||''}); }
 return o;})()`);
console.log('unnamed controls:', JSON.stringify(unnamed));
console.log('h-overflow:', await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth));
const bal = await page.locator('text=Balance Due').locator('xpath=following-sibling::span[1]').textContent().catch(()=>null);
console.log('Balance Due on screen:', bal);
console.log(bal && !bal.includes('-') ? 'PASS  never negative' : 'FAIL  still negative');
await page.locator('h2:has-text("Payments")').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/claude-0/-home-user-bothmade/2808a96e-a57f-5bb5-9ac8-2926009bc8e0/scratchpad/shots/31-client-balance.png' });
await browser.close();
