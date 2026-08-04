# Bothmade — launch checklist

Everything the site still needs that code cannot supply. Work top to bottom;
the site is deployable after the first section.

## Required before the site starts at all

These have no fallback. The server refuses to boot without the first two,
deliberately — the old defaults were strings published in this repo, so a
deploy that forgot one silently signed sessions with a value anyone could
read. Generate each independently with `openssl rand -base64 48`; do not
reuse one value across several.

- [ ] **`JWT_SECRET`** — signs every login session and the Gmail OAuth
      round-trip. Rotating it logs everyone out; that's the intended effect.
- [ ] **`SESSION_SECRET`** — session-layer signing, and the legacy key for
      anything encrypted before `GMAIL_ENCRYPTION_KEY` existed. Keep the
      existing value if this deployment has ever connected a mailbox (see
      below); otherwise generate a fresh one.
- [ ] **`GMAIL_ENCRYPTION_KEY`** — encrypts Gmail app passwords and Google
      refresh tokens at rest. Its own key, separate from `SESSION_SECRET`,
      so the two rotate independently. Not required to boot, but every
      Gmail-connected feature fails loudly until it's set. Mailboxes
      connected before this env var existed keep working: decryption falls
      back to the old `SESSION_SECRET`-derived key, and reconnecting a
      mailbox in Settings re-encrypts it under the new one.
- [ ] **`CRON_SECRET`** — the shared secret Vercel Cron signs its requests
      with. The `/api/cron/*` routes fail closed: with this unset they
      return 503 and no scheduled job runs. Set it in Vercel and it's sent
      automatically.

Optional, and only for a brand-new deployment with an empty `users` table:

- [ ] **`ADMIN_BOOTSTRAP_TOKEN`** — lets one first owner account be created
      via `POST /api/auth/signup` with an `x-bootstrap-token` header. The
      path closes permanently the moment any account exists. Leave it unset
      on an established deployment; after that, only an owner can add
      teammates.

- [ ] **`STRIPE_SECRET_KEY`** — not a session secret, but the build dies
      without it: five routes construct `new Stripe(...)` at module scope, so
      `next build` cannot collect page data. `next.config.ts` now fails the
      build by name; before that it surfaced as "Neither apiKey nor
      config.authenticator provided" with a stack trace into a minified
      chunk. Copy it from dashboard.stripe.com → Developers → API keys.

- [ ] **`STRIPE_WEBHOOK_SECRET`** — the one that decides whether a sale
      turns into anything. `checkout.session.completed` is what creates the
      client account, generates their password, emails it, and opens the
      project; unset, every webhook is rejected unverified, so the card is
      charged and *nothing else happens*. There is no error the customer or
      the dashboard will show you — the only trace is a rejection in the
      function logs.

      Add the endpoint at Stripe → Developers → Webhooks, pointing at
      `https://bothmade.studio/api/webhooks/stripe`, subscribed to
      `checkout.session.completed`. The signing secret it issues starts
      `whsec_`. **Test mode and live mode have separate endpoints and
      separate secrets** — a sandbox test that creates no dashboard is
      almost always the test-mode secret missing, or the endpoint only
      existing in live mode.

- [ ] **`DATABASE_URL` and `DIRECT_URL`** — two *different* strings, not the
      same one twice. `prisma migrate deploy` runs during the build and
      cannot go through a transaction pooler, which is why the schema
      declares `directUrl` separately.

      On Supabase (Connect → Connection String):
      - `DATABASE_URL` = **Transaction pooler**, port 6543, with
        `?pgbouncer=true&connection_limit=1` appended.
      - `DIRECT_URL` = **Session pooler**, port 5432.

      Use the *session* pooler rather than the "Direct connection" option:
      Supabase's direct host is IPv6-only unless you buy the IPv4 add-on, and
      Vercel's builders are IPv4, so migrations fail there with a
      network-unreachable error that names nothing useful. Both strings come
      from the same modal and differ only by port. A password containing
      `@ : / ? # & %` must be percent-encoded or the URI misparses and reads
      as a wrong password.

## Required before the site is live

- [ ] **Deploy to Vercel.** Push this repo to GitHub, import it at
      vercel.com/new, accept the defaults (Next.js is auto-detected).
- [ ] **Set `NEXT_PUBLIC_SITE_URL`** in Vercel → Project → Settings →
      Environment Variables to the real domain (`https://bothmade.studio`).
      Until this is set, canonical URLs, Open Graph tags, sitemap, robots,
      and JSON-LD all publish localhost links.
- [ ] **Set `RESEND_API_KEY`** (from resend.com → API Keys) and
      **`CONTACT_EMAIL`** in the same place. `CONTACT_EMAIL` is the address
      mail is sent *from* and defaults to `info@bothmade.studio`. Without the
      key an enquiry is still recorded as a lead — nobody is just notified
      about it. See `.env.example` for every variable the app reads.
- [ ] **Verify the sending domain in Resend** (SPF + DKIM records) so
      enquiry emails don't land in spam. Note this has to be
      **bothmade.studio** — mail sent from an unverified domain is rejected
      outright, not merely spam-filed.

- [ ] **Turn on DKIM for Google Workspace.** Verifying in Resend covers mail
      Resend sends. It does *not* cover mail this app sends **as a real user**
      — the contact-form acknowledgement goes out through domain-wide
      delegation as info@, i.e. through Google, not Resend. With no Workspace
      DKIM key, Google signs that mail with a generic Google key, so the
      signature does not align with the From: domain. Gmail then shows the
      red "similar messages have been used to steal people's personal
      information" banner and files it as spam, which is exactly what
      happened on the first live sends.

      admin.google.com → Apps → Google Workspace → Gmail → **Authenticate
      email** → select the domain → Generate new record (2048-bit) → add the
      `google._domainkey` TXT record it gives you → click **Start
      authentication**.

      Verify with `dig TXT google._domainkey.bothmade.studio` — NXDOMAIN
      means it is not set up yet.

- [ ] **Publish a DMARC record.** `_dmarc` TXT →
      `v=DMARC1; p=none; rua=mailto:info@bothmade.studio`. `p=none` is
      monitor-only and cannot cause rejections, and Gmail's bulk-sender rules
      effectively require the record to exist at all. Tighten to
      `p=quarantine` once the `rua` reports come back clean.

      Deliverability is not only records: a domain days old has no sending
      reputation, and the first sends from one get filtered regardless of how
      correct the DNS is. That part only improves with real traffic over
      weeks. Nothing in this repo can shortcut it.
- [ ] **Give Evan's account the `sales` role.** Inbound leads are assigned to
      whoever holds it, and the "this client reached out" alert is sent to
      them. Without it the alert falls back to `evan@bothmade.studio` and the
      lead stays unassigned — which keeps it out of the call list and the
      follow-up digest, both of which filter per rep. Set it on `/admin/team`,
      which also warns on the dashboard while nobody holds the role.
- [ ] **Test the form once on production** — submit it yourself, then confirm
      all four: the notification arrives at info@, evan@ and kiana@; Evan gets
      the separate "just reached out" alert whose button opens the lead; the
      acknowledgement arrives at the address you submitted; and the enquiry is
      showing in `/admin/leads` with source `inbound`, assigned to Evan. The
      last one is the real check — the lead row is the record, the emails are
      a notification about it. Include the optional budget/timeline/phone
      fields in the test submission and confirm they show in the lead's notes
      and (budget) as the estimated value.

## Required before "Sign in with Google" works (admin → Who to call)

Reps see "Google sign-in is not configured yet (GOOGLE_OAUTH_CLIENT_ID/SECRET
missing)" until this is done once. It has to happen in Google Cloud Console
and Vercel — no amount of code changes fixes it.

- [ ] **Create (or reuse) a Google Cloud project** at
      console.cloud.google.com.
- [ ] **Enable the Gmail API** for that project (APIs & Services → Library →
      Gmail API → Enable).
- [ ] **Configure the OAuth consent screen.** Since every account that will
      connect is `@bothmade.studio` (Google Workspace), set the user type to
      **Internal** — this skips Google's app-verification review entirely,
      which otherwise takes days to weeks for sensitive scopes like
      `gmail.readonly`. Internal is only offered if you're signed in as a
      Workspace admin/user for that domain.
- [ ] **Create an OAuth 2.0 Client ID** (APIs & Services → Credentials →
      Create Credentials → OAuth client ID → Application type: **Web
      application**). Add this Authorized redirect URI, matching whatever
      `NEXT_PUBLIC_SITE_URL` is set to in Vercel:
      `https://bothmade.studio/api/admin/settings/gmail-oauth/callback`
- [ ] **Copy the Client ID and Client Secret** into Vercel → Project →
      Settings → Environment Variables as `GOOGLE_OAUTH_CLIENT_ID` and
      `GOOGLE_OAUTH_CLIENT_SECRET`, then redeploy (env var changes don't
      apply to already-running deployments).
- [ ] **Verify**: open `/admin/settings`, the amber "isn't set up yet"
      notice should be gone and "Sign in with Google" should be clickable.

## Required before running ads

- [ ] **Replace the sample case studies.** Everything in
      `lib/case-studies.ts` under the `SAMPLE CONTENT` banner is invented
      demo copy (Ridgeline / Cadence / Massing). Each is `status:
      'in-progress'`, which keeps it `noindex` — flip to `'live'` only when
      the entry describes something real. Never point paid traffic at
      fiction. In the meantime every entry is flagged `selfInitiated: true`,
      which renders an explicit "our own product — not client work" label
      and notice on both `/work` and the detail pages, so a human visitor
      can't mistake them for client engagements.
- [ ] **Finish the About/credibility block.** `components/About.tsx` ships
      on the homepage with names, roles, direct emails, real photos
      (`public/team/`), and location (London, from `COMPANY_LOCATION` in
      `lib/company.ts`; the Welling mailing address is in the footer and
      JSON-LD). One thing still needs
      a human: 1–2 `bio` sentences per person — see the banner at the top of
      `lib/team.ts`, which is where both that page and the homepage section
      now read their copy from.
- [ ] **Add real screenshots** to case studies (`shots[].src`, files under
      `public/work/…`). Nothing renders until then — a shot with no `src` is
      filtered out and the whole "Screens" section is hidden when none are
      left, so an unfinished study is simply shorter rather than showing a
      placeholder. `public/work/` does not exist yet; the `alt` and `caption`
      text is already written in `lib/case-studies.ts`, so dropping a file in
      and setting `src` brings the section back with no other edit.
- [x] **Analytics.** Vercel Analytics is installed (`@vercel/analytics`,
      mounted in `app/layout.tsx`). It records nothing until the project's
      Analytics tab is enabled once in the Vercel dashboard — do that at
      deploy time. Swap for Plausible/Fathom later if privacy posture
      changes.

## Deliberately deferred engineering

- [ ] **Honeypot false positives.** `/api/contact` discards a submission whose
      hidden `website` field is filled, and returns 200 so bots learn nothing —
      which means a false positive looks exactly like success to a real
      visitor. It logs a warning now (grep Vercel logs for "honeypot tripped"),
      but if iOS autofill ever starts populating that field the fix is a
      server-side signal that isn't a hidden input.

### Done

- [x] **Content-Security-Policy.** Shipped — see the comment at the top of
      `next.config.ts` for the one real decision in it: `script-src` allows
      `'unsafe-inline'` rather than using a nonce, because a nonce forces
      every page to render dynamically and this app has no HTML-injection
      sink for an inline script to arrive through. Every other directive is
      locked down. `CSP_REPORT_ONLY=1` ships it as Report-Only.
- [x] **Durable rate limiting.** `lib/rate-limit.ts` keeps its counters in
      Postgres — the database the app is already connected to on these
      routes — so limits are shared across every serverless instance and
      survive cold starts. No extra service, no extra configuration. Applied
      to the auth routes, which previously had no limit at all, and to the
      public share-link routes; falls back to a per-instance window if the
      database is unreachable, so an outage degrades the limit rather than
      locking everyone out.
- [x] **Tests.** `npm test` runs the suite (Vitest); `.github/workflows/ci.yml`
      runs it plus a typecheck on every pull request. Coverage is aimed at
      the money path — pricing, `/api/checkout`, the Stripe webhook, CSV
      import, the lead pipeline, cold-email rendering, rate limiting.
      Not yet covered: the capability-token share links, the agree-and-pay
      replay guard, and the CSP. Those were verified against a real Postgres
      and a real Chromium during the security work, but by hand rather than
      by anything that reruns.

## Design decisions (resolved 2026-07-27)

- [x] **Custom cursor** — decision: keep. (Recommendation to remove was
      declined; the cursor stays as designed.)
- [x] **Marquee** — decision: removed entirely. The homepage opens
      hero → sheet worlds with no strip between them.

## Reference

- Local dev: `npm run dev` (port 3000). Production check: `npm run build`.
- JS payload measured at ~842 kB uncompressed / roughly ~280 kB over the
  wire with compression — acceptable for this animation weight because all
  pages are static-prerendered (content paints before hydration), but check
  Lighthouse on the production URL after deploy, on a real phone.
- Runtime performance verified at a locked 60fps (median frame 16.7 ms,
  zero long tasks) with all scroll systems active.
