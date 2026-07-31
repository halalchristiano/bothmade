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

## Required before onboarding a client through the portal

- [ ] **Set `PORTAL_SECRET`** (32+ random characters) and **`ADMIN_SECRET`**
      (24+). Generate both with `openssl rand -base64 48`. Without
      `PORTAL_SECRET` every client link refuses to open; without
      `ADMIN_SECRET` the invite endpoint returns 404 to everyone, including
      you. Never reuse or publish either — `PORTAL_SECRET` is what stops
      someone editing their own price, and rotating it invalidates every
      live client link at once.
- [ ] **Set `STRIPE_SECRET_KEY`** (and `STRIPE_CURRENCY`, default `usd`) to
      take deposits by card. Optional: without it the portal tells the client
      an invoice is coming instead of showing a broken button, so the page is
      safe to hand out before Stripe is live.
- [ ] **Invite a client.** One command, and the only manual step in the
      whole flow — a link is minted when a human decides someone is a
      client, not when a form is submitted:

      curl -X POST https://bothmade.studio/api/portal/invite \
        -H "x-admin-secret: $ADMIN_SECRET" \
        -H "Content-Type: application/json" \
        -d '{"name":"Ada","email":"ada@example.com","company":"Ridgeline",
             "project":"both","client":"funded","addOns":{"cms":1,"pages":4},
             "timeline":"standard","care":"growth","send":true}'

      It returns the link, the total, and the deposit. `"send":true` emails
      it to the client; omit it to check the link yourself first. Deposit
      defaults to 50% under $15k and 40% above — override with
      `"depositPercent": 30`. Advance the build with `"phase"` (one of
      onboarding, deposit, discovery, design, build, review, launch, live),
      which mints a fresh link — send it, or the client keeps seeing the old
      phase.
- [ ] **Send yourself an invite first** and walk the whole thing: open the
      link, read the scope, pay the deposit with a Stripe test card, submit
      the onboarding form. You want to have been your own first client before
      a real one arrives.

## Required before running ads

- [ ] **Sign off the published prices.** `/start` quotes real numbers from
      `lib/pricing.ts` — bases from $4,500 (website) to $15,500 (the
      flagship), add-ons from $350, and two stated multipliers (client type,
      timeline). They were set for a studio with excellent work and no public
      track record yet: high enough to signal quality, low enough that a
      founder who has never heard of you will still finish the form. They are
      a starting position, not a verdict — price a couple of real enquiries by
      hand first, see where you would have quoted differently, then edit the
      numbers in that one file. Everything on the page and in the emails
      follows from it.

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
