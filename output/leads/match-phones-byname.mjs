/*
 * The phone backlog, matched by name alone.
 *
 * No city column this time: these came from searches that named the business
 * directly rather than sweeping a metro, so the name IS the identification —
 * and the leads being matched are, by definition, the ones with no phone, so
 * a wrong match cannot overwrite a good number. The length floor stops a
 * short name swallowing a long one, and the longest match wins.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function parseCsv(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
 else if(c==='"')q=true;else if(c===','){r.push(f);f=''}
 else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c!=='\r')f+=c}
 if(f||r.length){r.push(f);R.push(r)}const h=R.shift();
 return R.filter(x=>x.length===h.length).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]])));}

const dir='/home/user/bothmade/output/leads/';
const runs=[2,3,4,5,6,7,8,9,10,11].map(n=>`bothmade-leads-field-run-0${String(n).padStart(2,'0')}.csv`);
const done=new Set();
for(const f of ['bothmade-phone-backfill-001.csv','bothmade-phone-backfill-002.csv','bothmade-phone-backfill-003.csv'])
  for(const r of parseCsv(readFileSync(dir+f,'utf8'))) done.add(norm(r.company));

const leads=[];
for(const f of runs) for(const r of parseCsv(readFileSync(dir+f,'utf8')))
  if(!(r.phone||'').trim() && !done.has(norm(r.company))) leads.push(r);

const harvest=readFileSync('p4.tsv','utf8').trim().split('\n').map(l=>l.split('\t'))
  .filter(p=>p.length===2).map(([name,phone])=>({name,phone,key:norm(name)}));

const out=[],used=new Set();
for(const lead of leads){
  const k=norm(lead.company);
  // An exact match is safe at any length — the floor exists to stop a short
  // name being CONTAINED in an unrelated longer one, which is a different
  // failure. Without this, "Renov8" (six characters) could never match its
  // own lead.
  const hit=harvest.filter(h=>h.key===k || (h.key.length>=8 && (k.includes(h.key)||h.key.includes(k))))
    .sort((a,b)=>(a.key===k?1e9:b.key.length)-(b.key===k?1e9:a.key.length))[0];
  if(!hit||used.has(k)) continue;
  used.add(k);
  out.push({company:lead.company,email:lead.email,phone:hit.phone,matched:hit.name});
}
const esc=v=>/[",\n]/.test(String(v??''))?`"${String(v).replace(/"/g,'""')}"`:String(v??'');
writeFileSync(process.argv[2],['company,email,phone',...out.map(r=>[r.company,r.email,r.phone].map(esc).join(','))].join('\n')+'\n');
console.log('harvested:',harvest.length,'| matched:',out.length,'| leads still without a phone:',leads.length-out.length);
for(const r of out) if(norm(r.company)!==norm(r.matched)) console.log('  fuzzy:',r.matched,'->',r.company);
