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
- [ ] **Test the form once on production** — submit it yourself, then confirm
      all three: the notification arrives at info@, evan@ and kiana@; the
      acknowledgement arrives at the address you submitted; and the enquiry is
      showing in `/admin/leads` with source `inbound`. The last one is the
      real check — the lead row is the record, the emails are a notification
      about it.

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
- [ ] **Honeypot false positives.** `/api/contact` discards a submission whose
      hidden `website` field is filled, and returns 200 so bots learn nothing —
      which means a false positive looks exactly like success to a real
      visitor. It logs a warning now (grep Vercel logs for "honeypot tripped"),
      but if iOS autofill ever starts populating that field the fix is a
      server-side signal that isn't a hidden input.

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
