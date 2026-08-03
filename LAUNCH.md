# Bothmade — launch checklist

Everything the site still needs that code cannot supply. Work top to bottom;
the site is deployable after the first section.

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
- [ ] **Give Evan's account the `sales` role.** Inbound leads are assigned to
      whoever holds it, and the "this client reached out" alert is sent to
      them. Without it the alert falls back to `evan@bothmade.studio` and the
      lead stays unassigned — which keeps it out of the call list and the
      follow-up digest, both of which filter per rep. Check `/admin/users`.
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
- [ ] **Finish the About/credibility block.** `components/About.tsx` now
      ships on the homepage with the two of you by name, role, and direct
      email — everything the repo could establish honestly. Still needed
      from a human (see the EDIT ME banner in that file): real photos
      (`public/team/…` + `photo` paths — honest monograms render until
      then), 1–2 bio sentences each, and `LOCATION` if you want it shown.
- [ ] **Add real screenshots** to case studies (`shots[].src`, files under
      `public/work/…`). Placeholder frames render until then.
- [x] **Analytics.** Vercel Analytics is installed (`@vercel/analytics`,
      mounted in `app/layout.tsx`). It records nothing until the project's
      Analytics tab is enabled once in the Vercel dashboard — do that at
      deploy time. Swap for Plausible/Fathom later if privacy posture
      changes.

## Deliberately deferred engineering

- [ ] **Content-Security-Policy.** Baseline security headers are shipped
      (see `next.config.ts`), but CSP is absent on purpose — Next's inline
      runtime needs nonce plumbing, and a half-done CSP breaks pages
      silently. Treat as its own task.
- [ ] **Honeypot false positives.** `/api/contact` discards a submission whose
      hidden `website` field is filled, and returns 200 so bots learn nothing —
      which means a false positive looks exactly like success to a real
      visitor. It logs a warning now (grep Vercel logs for "honeypot tripped"),
      but if iOS autofill ever starts populating that field the fix is a
      server-side signal that isn't a hidden input.

### Done

- [x] **Durable rate limiting.** `lib/rate-limit.ts` keeps its counters in
      Postgres — the database the app is already connected to on these
      routes — so limits are shared across every serverless instance and
      survive cold starts. No extra service, no extra configuration. Applied
      to the auth routes, which previously had no limit at all; falls back to
      a per-instance window if the database is unreachable, so an outage
      degrades the limit rather than locking everyone out.
- [x] **Tests.** `npm test` runs the suite (Vitest); `.github/workflows/ci.yml`
      runs it plus a typecheck on every pull request. Coverage is aimed at
      the money path — pricing, `/api/checkout`, the Stripe webhook, CSV
      import, the lead pipeline, cold-email rendering, rate limiting.

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
