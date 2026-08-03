# Bothmade — launch checklist

Everything the site still needs that code cannot supply. Work top to bottom;
the site is deployable after the first section.

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

## Required for the dashboard numbers to be right

- [ ] **Set `BUSINESS_TIMEZONE`** in Vercel to an IANA zone name
      (`Europe/London`, `America/New_York`, …). Vercel runs in UTC, so
      without this every day/week/month boundary is the server's, not
      yours. At UTC-5 that means "today" starts at 7pm the previous
      evening: calls logged after 7pm count toward tomorrow, and month-end
      revenue lands in the wrong month for five hours a day. Defaults to
      UTC, which is at least explicit.
- [ ] **Set `RESEND_WEBHOOK_SECRET`** and add the webhook at resend.com →
      Webhooks pointing at `/api/webhooks/resend`. Bounces and spam
      complaints do nothing until this exists. Verification **fails closed**
      without the secret — the endpoint turns unauthenticated input into
      "stop emailing this person", so an open one would let anyone suppress
      your entire client list.

Optional, with sensible defaults: `DAILY_SEND_CAP` (120), `SEND_DELAY_MS`
(2500), `SEND_JITTER_MS` (3500).

## Required before sending another cold email

- [ ] **Set `BOTHMADE_POSTAL_ADDRESS`** in Vercel to a real physical mailing
      address (a street address, a registered PO box, or a commercial
      mail-receiving agency). CAN-SPAM requires one in every commercial
      email, and penalties are assessed **per message** — at a few hundred
      cold emails a week that is not a theoretical exposure. Until it's set,
      `lib/compliance.ts` prints "POSTAL ADDRESS NOT CONFIGURED" in the
      footer, deliberately loudly, rather than shipping a plausible fake.
- [ ] **Verify one-click unsubscribe end to end.** Send yourself a cold
      email from the admin composer, confirm Gmail shows its own
      "Unsubscribe" control next to the sender (that's the RFC 8058
      `List-Unsubscribe-Post` header), click it, then confirm the address
      appears in the `email_suppressions` table and a second send to it is
      blocked.

## Required before running ads

- [ ] **Set `NEXT_PUBLIC_BOOKING_URL`** in Vercel to the real Cal.com or
      Calendly link. Until it's set, `lib/booking.ts` falls back to
      `https://cal.com/bothmade/15min`, and every "book a call" button —
      contact-form success state, acknowledgement email, checkout-success
      page, pricing-recap email — points at a page that may not exist. This
      is the single highest-intent click on the site; do not run traffic
      without it.
- [ ] **Add the first real testimonial** to `lib/testimonials.ts`. The file
      is empty on purpose and `<SocialProof />` renders nothing while it is,
      so the homepage currently ships with zero social proof. One real quote
      from one real client, with permission, changes that — the section is
      already built and needs no design work.
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
