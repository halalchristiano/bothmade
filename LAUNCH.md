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

## Required before the site is live

- [ ] **Deploy to Vercel.** Push this repo to GitHub, import it at
      vercel.com/new, accept the defaults (Next.js is auto-detected).
- [ ] **Set `NEXT_PUBLIC_SITE_URL`** in Vercel → Project → Settings →
      Environment Variables to the real domain (e.g. `https://bothmade.com`).
      Until this is set, canonical URLs, Open Graph tags, sitemap, robots,
      and JSON-LD all publish localhost links.
- [ ] **Set `RESEND_API_KEY`** (from resend.com → API Keys) and
      **`CONTACT_EMAIL`** in the same place. The contact form validates and
      rate-limits today but cannot deliver mail without the key.
- [ ] **Verify the sending domain in Resend** (SPF + DKIM records) so
      enquiry emails don't land in spam.
- [ ] **Test the form once on production** — submit it yourself, confirm both
      the studio notification and the acknowledgement arrive.

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
      fiction.
- [ ] **Write the About/credibility block.** The site never says who is
      behind it — names, location, background. At high-ticket budgets this
      is the biggest conversion leak. 3–4 honest sentences are enough; the
      section will be designed around whatever is supplied.
- [ ] **Add real screenshots** to case studies (`shots[].src`, files under
      `public/work/…`). Placeholder frames render until then.
- [ ] **Analytics.** Nothing is installed. Easiest: enable Vercel Analytics
      in the dashboard; privacy-friendlier: Plausible/Fathom. Needed to
      judge ad spend at all.

## Deliberately deferred engineering

- [ ] **Content-Security-Policy.** Baseline security headers are shipped
      (see `next.config.ts`), but CSP is absent on purpose — Next's inline
      runtime needs nonce plumbing, and a half-done CSP breaks pages
      silently. Treat as its own task.
- [ ] **Durable rate limiting.** The contact API's limiter is in-memory and
      resets on serverless cold starts. Fine against casual abuse; move to
      Upstash Redis if the endpoint ever gets targeted.
- [ ] **API tests.** The contact route's validation/honeypot/rate-limit
      logic is the only real logic in the repo and has no automated tests.

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
