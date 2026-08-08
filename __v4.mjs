import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT=process.env.SHOT_DIR, BASE='http://127.0.0.1:3111';
fs.mkdirSync(OUT,{recursive:true});
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await browser.newContext({ viewport:{width:1180,height:880}, deviceScaleFactor:1.5 });
const page = await ctx.newPage();
const errs=[]; const keep=t=>!/insights|Failed to load resource|hmr|WebSocket/.test(t);
page.on('console',m=>{if(m.type()==='error'&&keep(m.text()))errs.push(m.text().slice(0,200));});
page.on('pageerror',e=>{const s=String(e); if(keep(s))errs.push('PAGEERROR '+s.slice(0,200));});
const shot=async(n,o={})=>{await page.waitForTimeout(1000);await page.screenshot({path:`${OUT}/${n}.png`,...o});console.log('shot '+n);};

// FUNCTIONALITY: the client's page now says it is waiting on them
await page.goto(`${BASE}/status/${process.env.PROJECT_ID}?t=${process.env.TOKEN}`,{waitUntil:'networkidle'});
const band = await page.getByText('waiting for your review').count();
console.log('waiting-band present:', band);
await shot('G-status-waiting-on-you');

// log in for the admin shots
await page.goto(`${BASE}/admin/login`,{waitUntil:'networkidle'});
await page.fill('input[type="email"]','kiana@bothmade.studio');
await page.fill('input[type="password"]','screenshot-pass-1');
await page.click('button[type="submit"]');
await page.waitForURL('**/admin/dashboard',{timeout:20000}).catch(()=>{});
await page.waitForTimeout(2500);
console.log('landed:', page.url());

// UX/UI: status badge toned instead of gradient, on the project page
await page.goto(`${BASE}/admin/projects/${process.env.PROJECT_ID}`,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
await shot('H-project-status-badge');

console.log(errs.length ? 'ERRORS:\n'+[...new Set(errs)].join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
