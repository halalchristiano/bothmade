# Security notes

Running notes on this repository's security posture: what is enforced in code,
and the short list of things code cannot fix on its own.

---

## 1. This repository is public, and it has been leaking prospect data

**Status: partly fixed here. The rest is an owner decision.**

`halalchristiano/bothmade` is a **public** GitHub repository. Anyone — no
account needed — can read every file, every branch and every commit.

Until the commit that added this file, the tree included `output/leads/`:

| What | Amount |
| --- | --- |
| Tracked files | 45 |
| CSV / TSV data files | 29 |
| Rows of prospect data | ~33,000 |
| Distinct email addresses | 1,025 |

Each row carried a company, a contact role, a **direct email address**, a
**phone number** (`bothmade-phone-backfill-*.csv`), city/state/country, a
hand-written `salesNote` and `personalizedObservation`, a `leadScore`, and
`estimatedValue` / `lowestEstimate` / `highestEstimate` — our internal read on
what each prospect is worth. The `.mjs` scripts beside them document the
harvesting sources and method.

None of it was ever read by the application. `grep` across `app/`, `lib/`,
`components/` and `prisma/` returns nothing for this directory — it is purely
where the lead-gen scripts wrote their output.

### What the commit did

- `git rm -r --cached output/` — removed from tracking; the files are still on
  disk locally, so nothing local is lost.
- `/output` added to `.gitignore`, so the next export cannot re-add it.

### What it did NOT do, and cannot

**Untracking removes a file from the latest commit, not from history.** Every
commit that ever contained these CSVs still contains them, and every one is
still fetchable by anyone who clones the repository. GitHub also keeps
unreferenced objects reachable via the API for a period after a rewrite, and
forks and third-party mirrors (which is to say: scrapers) keep their own
copies indefinitely.

So the data should be treated as **already disclosed**. Three things follow,
in priority order, and all three are the owner's call:

1. **Make the repository private.** This is the single highest-value action
   and it takes about fifteen seconds: *Settings → General → Danger Zone →
   Change repository visibility → Make private*. It stops the ongoing
   exposure — of the lead data still in history, and of the entire commercial
   codebase — immediately. Everything below matters much less until this is
   done. There is no reason this repository needs to be public.

2. **Purge the blobs from history**, if the repository stays public or the
   history is otherwise shared. `git filter-repo --path output --invert-paths`
   (or BFG), then a force-push, then ask GitHub Support to garbage-collect
   the unreachable objects — without that last step the old blobs remain
   reachable by SHA. Note this rewrites every commit hash: coordinate it, do
   it when nothing else is in flight, and be aware `AGENTS.md` otherwise
   forbids force-pushing `main`. This is the one justified exception.

3. **Decide on disclosure.** These are named individuals at UK and US
   businesses whose contact details and our commercial notes about them were
   publicly readable. Under UK GDPR a personal-data breach is assessed on
   risk to the individuals; where that risk is more than unlikely it is
   reportable to the ICO within 72 hours of becoming aware. Whether this
   crosses that line is a judgement call, and it is a judgement for the
   studio's owner to make with the actual dates in hand — not one to settle
   from a commit message. The relevant facts: the repository is public, the
   data was tracked from the commits that added it until the one that
   removed it, and `git log -- output/` gives the exact window.

### Related

- Rotate anything that was ever pasted into a tracked file. `.env*` has always
  been correctly ignored, and no credentials were found in `output/`, but the
  history is worth a scan (`gitleaks detect --no-git=false`) now rather than
  after the next surprise.

---

## 2. About "hiding our subdomains from inspect element"

**This cannot be done, and it is worth being straight about why** — the effort
is better spent on the item above.

A hostname that a browser connects to is not a secret and cannot be made into
one. The browser has to resolve it to fetch anything from it, so it is visible
in the network panel no matter how the URL is stored. Obfuscating the string
in the bundle changes nothing: the request still appears.

More to the point, subdomains are enumerable **without touching our site at
all**:

- **Certificate Transparency.** Every TLS certificate is published to public,
  append-only logs — this is how the CA system is audited, and it is not
  optional. `crt.sh?q=%25.bothmade.studio` lists every subdomain we have ever
  issued a certificate for, including ones we have since taken down. Vercel
  issues a certificate per domain, so every client mockup subdomain is in
  there the moment it goes live.
- **Passive DNS** aggregators (SecurityTrails, Shodan, VirusTotal) archive
  resolutions permanently.
- **Wordlist brute-forcing** against our nameservers.

Any of these takes seconds and none of them is blocked by anything we ship.

So the defensible position is not concealment but **making the subdomains not
matter**: every one of them must stand on its own authentication. That is
already how the app is built — the perimeter in `proxy.ts` covers `/api/*`,
`/admin/*` and `/client/*` regardless of which host the request arrived on,
and share links are unguessable capability tokens rather than obscure URLs.
A subdomain someone discovers should hand them a login prompt, and that is
the whole defence.

What *was* worth fixing, and is fixed in `next.config.ts`:

- **`X-Powered-By: Next.js`** was being sent on every response, naming the
  framework for anyone deciding which exploits to try. Now off.
- **Browser source maps** are pinned off for production builds, so the
  shipped bundle stays minified rather than reconstructing into readable
  original source with our comments in it. This is the only part of "stop
  people reading our code" that is actually actionable — and it is a speed
  bump, not a lock. Client-side code is delivered to the client; that is what
  makes it client-side code. The real protection for what is genuinely ours —
  the pricing engine, the lead scoring, the email sequences — is that it runs
  on the server and is never shipped to a browser at all. It is in this
  repository, though, which brings us back to item 1.

---

## 3. Enforced in code

Not a to-do list — a map of where the controls live, so a reviewer can find
them and a future change does not quietly undo one.

| Control | Where |
| --- | --- |
| CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| Build fails on missing `JWT_SECRET` / `SESSION_SECRET` / `STRIPE_SECRET_KEY` | `next.config.ts` |
| Authentication perimeter over `/api/*`, `/admin/*`, `/client/*` | `proxy.ts` |
| Record-level authorization, session revocation, forced password change | `lib/middleware.ts` |
| Role authority (owner-only actions, pricing floor override) | `lib/authz.ts` |
| JWT signing with pinned `HS256`, bcrypt, CSPRNG password generation | `lib/auth.ts` |
| Rate limiting — per-IP and per-account, Postgres-backed | `lib/rate-limit.ts` |
| HTML escaping for transactional email | `lib/html.ts` |
| Secrets at rest (Gmail passwords, Google refresh tokens) | `lib/crypto.ts` |
| JSON-LD escaping, so `'unsafe-inline'` stays justified | `lib/json-ld.ts` |

---

## 4. Open: four high-severity advisories, all under `next`

**Status: not fixed. Deliberately left for a deploy of its own.**

`npm audit` reports 4 high-severity advisories. Every one is transitive
through `next@16.2.12` — none is a direct dependency, and there is nothing to
fix in our own `package.json`:

| Package | Issue |
| --- | --- |
| `postcss` (via `next`) | XSS via unescaped `</style>`; arbitrary `.map` file read via attacker-controlled `sourceMappingURL` |
| `sharp` (via `next`) | inherited libvips CVEs — 2026-33327, -33328, -35590, -35591 |
| `nanoid` (via `next`) | — |

The only fix `npm` offers is `npm audit fix --force`, which installs
`next@16.3.0` — outside the pinned range.

**Why this was not done here.** A framework bump against a live site deserves
its own deploy with its own verification, not a quiet ride-along at the end of
a security pass. `npm run build` runs `prisma migrate deploy` against the
**production database**, so the build cannot be rehearsed in this environment
— the first real execution of a Next upgrade would be the one serving
customers. `AGENTS.md` also notes this Next version already differs from what
is widely documented, so the upgrade wants someone reading
`node_modules/next/dist/docs/` rather than assuming.

**Actual exposure, so this can be prioritised rather than panicked over:**

- The `postcss` issues are build-time. They need attacker-controlled CSS or a
  malicious `sourceMappingURL`, and all CSS here is ours. Effectively no
  exposure.
- `sharp` is the one worth attention: Next uses it for image optimization, so
  it processes uploaded images. Reaching it requires an authenticated
  upload — a staff or client session — so this is a
  privilege-escalation-from-inside path, not an open door.

Suggested: `npm i next@16.3.0`, run `npm run typecheck` and `npm test`, deploy
alone, and check image optimization and an upload afterwards. Re-run
`npm audit` on a schedule; nothing here does that automatically today.

---

## 5. Checked this pass, no change needed

Recorded so the next person does not spend the afternoon re-deriving it.

- **Rate-limit IP source.** `clientIp()` reads the leftmost value of
  `x-forwarded-for`, which is the classic spoofable pattern — an attacker
  rotating a fake header would get a fresh budget per request and walk
  straight through the per-IP login limit. It is **not** exploitable here:
  Vercel overwrites `x-forwarded-for` at the edge specifically to prevent
  this, and does not pass a client-supplied value through. Worth knowing that
  this safety comes from the platform, not from our code — moving off Vercel,
  or putting a proxy in front of it, makes `lib/rate-limit.ts` wrong on the
  day of the move. The per-account limiter (`loginAccount`) does not depend on
  the caller's address at all, and would still hold.
- **SQL injection.** No `$queryRawUnsafe` or `$executeRawUnsafe` anywhere.
  The four raw-SQL sites all use tagged templates, which Prisma parameterises.
- **Secret comparisons.** All three are now constant-time —
  `bootstrapTokenMatches` (signup), `lib/share-links.ts`, and
  `lib/cron-auth.ts`, which was the odd one out and is fixed.
- **Cron perimeter.** `proxy.ts` treats `/api/cron/` as public by design
  (Vercel Cron carries no session cookie), so `requireCronAuth` is the entire
  perimeter for jobs that send mail and read mailboxes. It refuses to run at
  all when `CRON_SECRET` is unset, which is the correct direction, and is now
  covered by tests.
- **CSRF.** The auth cookie is `httpOnly`, `sameSite: 'lax'`, `secure` in
  production, so it is not attached to cross-site non-GET requests;
  `form-action 'self'` blocks off-site form posts. No separate CSRF token is
  needed for this cookie configuration.
