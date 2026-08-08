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

## 4. Dependency advisories: clear

**Status: fixed.** `npm audit` reports 0 vulnerabilities.

This section previously logged four high-severity advisories — `postcss`
(XSS via unescaped `</style>`, arbitrary `.map` file read via
attacker-controlled `sourceMappingURL`), `sharp` (libvips CVE-2026-33327,
-33328, -35590, -35591) and `nanoid` — every one of them transitive through
`next@16.2.12`, with nothing to fix in our own direct dependencies.

Resolved by `next@16.2.12 -> 16.3.0` plus a non-breaking `npm audit fix` for
`nanoid`. Next is pinned exactly, matching how `react` and `react-dom` are
pinned here: a framework is not something to let a caret move underneath a
production deploy.

The earlier note said this deserved a deploy of its own because
`npm run build` runs `prisma migrate deploy` against the production database
and so could not be rehearsed. That turned out to be avoidable — running
`next build` directly, with `prisma generate` but *without* the migrate step,
exercises the whole compile and prerender path against dummy environment
values and needs no database. It completed clean: all 120 marketing pages
prerendered, SSG routes generated, proxy compiled. Worth remembering as the
way to verify a framework bump here.

Verified: `npm audit` clean, `tsc --noEmit` clean, 2,463 tests passing, and a
full production build. There is no version-16 upgrade guide in
`node_modules/next/dist/docs/`, which is consistent with 16.2 -> 16.3
carrying no documented breaking changes.

Nothing re-runs `npm audit` on a schedule. Worth adding.

---

## 5. Inline-HTML sinks: two controls that existed but were applied unevenly

**Status: fixed, and now swept by a test.**

The CSP ships `script-src 'self' 'unsafe-inline'`, deliberately — Next streams
its RSC payload through inline `<script>` tags, so a nonce would make every
page dynamic. The argument that makes that trade acceptable is that the app has
**no HTML injection sink**. That argument is worth exactly as much as the two
controls below, and both were three-quarters applied.

- **JSON-LD.** Three of four `dangerouslySetInnerHTML` sites went through
  `jsonLdScript()`; `app/blog/[slug]/page.tsx` still used raw `JSON.stringify`.
  It was the one whose input is longest and most often edited — `BLOG_POSTS` is
  prose, not a handful of constants like the other three. The HTML parser finds
  `</script` before any JSON parser sees a character, so a post body containing
  it closes the tag early and the rest is parsed as markup. Demonstrated:
  raw `JSON.stringify` put an `<img>` element into the DOM; `jsonLdScript` put
  in zero, and the escaped JSON still decodes byte-identically for crawlers.

- **Email-preview iframes.** One of three carried `sandbox=""`. `SendGuard` had
  it with a comment explaining why; `EmailComposer` and `BulkEmailComposer` did
  not. `<iframe srcDoc>` **inherits the embedding origin** — it is not a neutral
  viewport. What these frames render is transactional email HTML assembled by
  string concatenation across several dozen templates, interpolating contact
  names, company names, client messages and cold-email drafts: values that
  arrive from the public enquiry form and from CSV import of harvested leads.
  Demonstrated in Chromium: a script in an unsandboxed `srcDoc` executed and
  reached across into the parent document; under `sandbox=""` it did neither.

`lib/html.ts` escapes every one of those interpolations, and *that* is the
control that stops this being a live vulnerability — this was defence in depth,
not a bug being exploited. The sandbox decides what one missed `esc()` in one
of several dozen templates costs: a preview that renders oddly, or an admin
session. With `'unsafe-inline'` in force there is no middle option.

Both are now swept by `tests/lib/inline-html-sinks.test.ts`, which fails on the
next call site that forgets — which is how both of these came to exist in the
first place. `scripts/screenshots/inline-html-sinks.mjs` runs the payloads
through a real browser rather than asserting the attributes are present.

One note for whoever writes the next sweep of this kind: strip comments before
matching. Both the test and the evidence script were caught by their own
subject matter — the test fired on the comment written above an iframe it was
checking, and the CSP panel printed a bare `script-src` because `next.config.ts`
explains the policy in prose above the policy, and the prose quotes it.

---

## 6. Checked this pass, no change needed

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

Swept again on the pass that produced section 5, all clear:

- **Capability tokens on the public routes.** `/api/public/leads/[leadId]/…`
  and `/api/public/projects/[projectId]/status` both require the row's
  `shareToken`, compare it in constant time, and return the *same* 404 for
  "no such record" and "wrong token" — so neither can be used to confirm which
  IDs exist. The cuid in the URL grants nothing on its own.
- **Open redirect.** `safeReturnTo()` refuses anything that is not a path
  inside `/client/`, including `//host`, backslash variants and the login page
  itself. `/l/drive/[kind]/[id]` validates the Drive ID against a pattern and
  can only ever emit a `drive.google.com` URL.
- **Password reset.** Only a SHA-256 of the token is stored, single-use with
  the burn done as a conditional update so two racing requests cannot both
  win, expiry enforced, and the reset stamps `sessionsValidFrom` so an
  already-issued token cannot resurrect a session.
- **Stripe webhook.** Signature-verified via `constructEvent`, and an unset
  `STRIPE_WEBHOOK_SECRET` is rejected rather than treated as "skip the check".
  It is the one unauthenticated route with no rate limit, correctly — dropping
  legitimate Stripe retries would be worse than the load.
- **Secrets at rest.** AES-256-GCM, random 12-byte IV per encryption, auth tag
  verified on decrypt, key in its own env var with a legacy-key fallback for
  rotation.
- **Field selection.** The routes that read `user` rows use explicit `select`;
  no handler returns a password hash, an encrypted app password or a refresh
  token to a caller.
- **Client portal.** Both `/api/client/*` handlers scope their queries to the
  session's own `clientId`.
- **`/api/version`.** Commit SHA, branch and commit message are staff-only;
  unauthenticated callers get the environment name and nothing else.

One thing looked at and left alone deliberately: `/pay/[instalmentId]` and
`/e/[instalmentId]` are addressed by cuid with no capability token, unlike the
routes above. The route documents the reasoning — it grants only a redirect to
a Stripe page the client was emailed anyway, and every authorisation that
matters is on Stripe's side. Worth re-reading if that page ever starts showing
more than it does now.
