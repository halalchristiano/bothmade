import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import crypto from 'crypto';
import Stripe from 'stripe';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { buildContractSections, toContractCustomItems } from '@/lib/contract-terms';
import { buildContractPdf } from '@/lib/contract-pdf';
import { buildInvoiceForProposal } from '@/lib/invoice-pdf';
import { isFurtherAlong } from '@/lib/leads';
import { getAdminEmails } from '@/lib/notify';
import { sendClientSignedContractEmail, sendSignedContractCopyEmail } from '@/lib/email';
import { CLICKWRAP_STATEMENT, USER_AGENT_MAX, normalizeSignerName } from '@/lib/clickwrap';
import { buildSignUrl, readShareToken, shareTokenMatches } from '@/lib/share-links';
import { RATE_LIMITS, checkRateLimit, enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  formatCents,
  formatCentsExact,
  instalmentSchedule,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  sanitizeCustomItems,
  type AddOnKey,
} from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * The client's single click after reading the proposal and ticking
 * "I agree": logs the clickwrap agreement (IP, timestamp, hash of the exact
 * contract text they saw) and immediately opens a Stripe Checkout Session
 * for the same amount — one link, sign then pay, no separate steps.
 *
 * Three things guard this now, none of which it had:
 *
 *  - **A capability token.** This endpoint *creates a signature* attributed
 *    to the client. Knowing a lead's cuid — which is in every admin URL —
 *    was enough to produce one. It now requires the same secret as the link
 *    we emailed them.
 *  - **A rate limit.** It writes a row, renders a PDF, uploads a blob, and
 *    opens a Stripe session per call. Unauthenticated and unbounded, that is
 *    a bill and a mailbox full of "contract signed" alerts.
 *  - **A replay guard.** Every POST used to overwrite `agreementSignedAt`,
 *    `agreementIp`, `agreementHash`, and `signedContractUrl`. Whoever hit
 *    the link last became the signature of record, and the original
 *    evidence — the thing that makes a clickwrap enforceable — was gone.
 *    A second POST now leaves the recorded signature exactly as it was.
 *  - **The consent itself.** The tick box lived entirely in the browser: it
 *    disabled a button and was never sent. Every signature this route wrote
 *    therefore recorded a request arriving, not a client agreeing — and the
 *    difference between those two is the whole case for enforceability. A
 *    first-time POST now has to carry `agreed: true` and a typed name, and
 *    the sentence they agreed to is the server's, not the caller's.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;

    // Per source address, and per lead — one link being hammered must not
    // depend on the caller keeping the same IP.
    const message = 'Too many attempts. Please wait a moment and try again.';
    const limited = await enforceRateLimit(request, 'agree-and-pay', RATE_LIMITS.publicWrite, message);
    if (limited) return limited;

    const perLead = await checkRateLimit(`agree-and-pay:lead:${leadId}`, RATE_LIMITS.publicWrite);
    if (!perLead.allowed) return rateLimitResponse(perLead, message);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead || !shareTokenMatches(lead.shareToken, readShareToken(request))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (
      !lead.proposalBaseService ||
      !isBaseService(lead.proposalBaseService) ||
      !lead.proposalClientType ||
      !isClientType(lead.proposalClientType) ||
      !lead.proposalTimeline ||
      !isTimelineKey(lead.proposalTimeline)
    ) {
      return NextResponse.json({ error: 'No proposal has been prepared for this link yet' }, { status: 404 });
    }
    if (lead.status === 'won' || lead.status === 'lost') {
      return NextResponse.json({ error: 'This proposal is no longer active' }, { status: 410 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'This lead has no email on file — contact us directly to proceed' }, { status: 400 });
    }

    // A signature is recorded once, so consent is only demanded once. A
    // client coming back to a proposal they already signed is here to pay,
    // and the page shows them a "Continue to payment" button with no box to
    // tick — asking them to sign again would be asking for a second
    // signature to the same agreement.
    const alreadySigned = Boolean(lead.agreementSignedAt);

    // An empty or malformed body is a caller that never showed anybody the
    // terms. Treat it as no consent rather than as a server error.
    const body = await request.json().catch(() => null);
    const signerName = normalizeSignerName((body as { signerName?: unknown } | null)?.signerName);

    if (!alreadySigned) {
      if ((body as { agreed?: unknown } | null)?.agreed !== true) {
        return NextResponse.json(
          { error: 'Please tick the box to confirm you agree to the terms.' },
          { status: 400 }
        );
      }
      if (!signerName) {
        return NextResponse.json(
          { error: 'Please type your full name to sign.' },
          { status: 400 }
        );
      }
    }

    const baseService = lead.proposalBaseService;
    const clientType = lead.proposalClientType;
    const timeline = lead.proposalTimeline;
    const addOnKeys: AddOnKey[] = lead.proposalAddOns.split(',').filter((a): a is AddOnKey => isAddOnKey(a));
    const customItems = sanitizeCustomItems(lead.proposalCustomItems);
    const customTotal = customItemsTotal(customItems);

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const calculatedTotal = breakdown.totalPrice + customTotal;
    const totalPrice = lead.proposalTotalPrice && lead.proposalTotalPrice > 0 ? lead.proposalTotalPrice : calculatedTotal;
    const schedule = instalmentSchedule(totalPrice);
    const deposit = schedule[0].amountCents;
    const chargeAmount = lead.proposalDepositOnly ? deposit : totalPrice;

    const serviceLabel = BASE_SERVICES[baseService].label;
    const addOnLabels = [
      ...addOnKeys.map((k) => ADD_ONS[k].label),
      ...customItems.map((c) => `${c.label} (${formatCents(c.priceCents)})`),
    ];
    const timelineLabel = `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`;

    const sections = buildContractSections({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      serviceDescription: BASE_SERVICES[baseService].description,
      addOnLabels,
      addOnKeys,
      customItems: toContractCustomItems(customItems),
      baseServiceKey: baseService,
      clientTypeKey: clientType,
      timelineKey: timeline,
      timelineLabel,
      clientTypeLabel: CLIENT_TYPES[clientType].label,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
      totalPrice: formatCents(totalPrice),
      totalPriceCents: totalPrice,
      isConsumer: lead.isConsumer,
      effectiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    });

    // Covers the statement as well as the terms: the document is what they
    // agreed to, the statement is what agreeing meant, and a signature is
    // only as good as both being pinned.
    const contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ sections, statement: CLICKWRAP_STATEMENT }))
      .digest('hex');
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent')?.slice(0, USER_AGENT_MAX) || null;

    // A signature is recorded once. Coming back to this page after
    // abandoning checkout — or refreshing it, or being sent the link a
    // second time — must not restate when the client agreed, from where, or
    // to which version of the contract. (Changing the scope clears these
    // fields on the admin proposal route, which is the one path that
    // legitimately requires a fresh agreement.)
    if (!alreadySigned) {
      // Save a PDF copy of exactly what they agreed to — same sections that
      // were hashed above — so there's a real document backing the
      // clickwrap, not just a hash. Failure here shouldn't block the client
      // from paying.
      const signedAt = new Date();
      let signedContractUrl: string | null = null;
      try {
        const pdfBytes = await buildContractPdf({
          company: lead.company,
          contactName: lead.contactName,
          serviceLabel,
          addOnLabels,
          customItems: toContractCustomItems(customItems),
          timelineLabel,
          basePrice: formatCents(breakdown.basePrice),
          addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
          totalPrice: formatCents(totalPrice),
          depositAmount: formatCents(deposit),
          sections,
          signedOnline: {
            at: signedAt,
            ip,
            signerName: signerName || undefined,
            userAgent: userAgent || undefined,
            statement: CLICKWRAP_STATEMENT,
          },
        });
        // addRandomSuffix, because the path was otherwise derivable from a
        // lead ID plus a timestamp, and these blobs are public URLs holding
        // a client's name, scope, and price. A guessable path on a public
        // bucket is a directory listing with extra steps.
        const blob = await put(`contracts/${leadId}.pdf`, Buffer.from(pdfBytes), {
          access: 'public',
          contentType: 'application/pdf',
          addRandomSuffix: true,
        });
        signedContractUrl = blob.url;
      } catch (pdfError) {
        console.error('Failed to save signed contract copy:', pdfError);
      }

      // The invoice for the same agreed figures, stored rather than only
      // emailed. Until now it was generated on demand and sent — which meant
      // that once the email was buried, the only way back to it was to
      // reconstruct the proposal and regenerate it. Keeping a copy is what
      // turns it into a button on the lead instead of a search through a
      // mailbox. Like the contract above, a failure here must never stop
      // somebody paying us, and it gets the same random suffix: an invoice
      // on a public bucket names a client and a price.
      let invoicePdfUrl: string | null = null;
      try {
        const invoiceBytes = await buildInvoiceForProposal({
          leadId,
          company: lead.company,
          contactName: lead.contactName,
          baseService,
          addOnKeys,
          clientType,
          timeline,
          customItems,
          totalPrice,
          depositOnly: lead.proposalDepositOnly,
        });
        const blob = await put(`invoices/${leadId}.pdf`, Buffer.from(invoiceBytes), {
          access: 'public',
          contentType: 'application/pdf',
          addRandomSuffix: true,
        });
        invoicePdfUrl = blob.url;
      } catch (invoiceError) {
        console.error('Failed to save invoice copy:', invoiceError);
      }

      const wasFurtherAlong = isFurtherAlong(lead.status, 'contract_signed');
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          agreementSignedAt: signedAt,
          agreementIp: ip,
          agreementHash: contractHash,
          agreementSignerName: signerName,
          agreementUserAgent: userAgent,
          agreementStatement: CLICKWRAP_STATEMENT,
          contractStatus: 'signed',
          status: wasFurtherAlong ? 'contract_signed' : undefined,
          signedContractUrl: signedContractUrl || undefined,
          invoicePdfUrl: invoicePdfUrl || undefined,
          invoicePdfUploadedAt: invoicePdfUrl ? signedAt : undefined,
        },
      });

      await prisma.leadActivity.create({
        data: {
          leadId,
          type: 'proposal',
          content: `Contract signed online by ${signerName} (IP ${ip}) — proceeding to ${
            lead.proposalDepositOnly ? schedule[0].label : 'payment in full'
          } for ${formatCentsExact(chargeAmount)}.`,
          url: signedContractUrl || undefined,
        },
      });

      if (signedContractUrl) {
        const teamEmails = await getAdminEmails();
        await sendSignedContractCopyEmail(
          teamEmails,
          lead.company,
          signedContractUrl,
          formatCents(totalPrice),
          signerName || undefined
        ).catch((e) => console.error('Failed to email signed contract copy:', e));

        // The signer gets their own copy, at the moment of signing rather
        // than once payment clears. Someone who agrees and then abandons
        // checkout is still bound by what they agreed to, and "we have a
        // signed agreement you were never sent" is not a position to
        // negotiate from. Failure here must not block the payment either.
        await sendClientSignedContractEmail({
          toEmail: lead.email,
          contactName: signerName || lead.contactName,
          company: lead.company,
          contractUrl: signedContractUrl,
          totalPriceLabel: formatCents(totalPrice),
          signedAt,
        }).catch((e) => console.error('Failed to email the client their signed copy:', e));
      }
    } else {
      // Still worth a line on the timeline — "they came back to pay" is
      // useful to a rep — but no signature fields, no second PDF, and no
      // second "contract signed" alert to the team.
      await prisma.leadActivity
        .create({
          data: {
            leadId,
            type: 'proposal',
            content: `Returned to the signed proposal (IP ${ip}) — reopened checkout for ${
              lead.proposalDepositOnly ? schedule[0].label : 'payment in full'
            }, ${formatCentsExact(chargeAmount)}.`,
            url: lead.signedContractUrl || undefined,
          },
        })
        .catch(() => null);
    }

    const siteUrl = resolveSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${siteUrl}/checkout/success?type=welcome`,
      // Cancelling has to land back on a link that still works, so the
      // capability token rides along.
      cancel_url: buildSignUrl(leadId, lead.shareToken),
      customer_email: lead.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              // Stripe's own checkout page is the last thing the client reads
              // before their card is charged, so it names the position too —
              // "(Deposit)" told them nothing about what came next.
              name: lead.proposalDepositOnly
                ? `Bothmade ${serviceLabel} — ${lead.company} · ${schedule[0].label}`
                : `Bothmade ${serviceLabel} — ${lead.company}`,
              description: lead.proposalDepositOnly
                ? `${schedule[0].percent}% of ${formatCents(totalPrice)}, due on signing. Payments ${schedule
                    .slice(1)
                    .map((r) => r.index)
                    .join(' and ')} of ${schedule.length} are invoiced later, at design approval and launch.`
                : addOnLabels.length > 0
                ? addOnLabels.join(', ')
                : undefined,
            },
            unit_amount: chargeAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        leadId: lead.id,
        clientEmail: lead.email,
        company: lead.company,
        contactName: lead.contactName || '',
        phone: lead.phone || '',
        baseService,
        addOns: addOnKeys.join(','),
        clientType,
        timeline,
        basePrice: String(breakdown.basePrice),
        totalPrice: String(totalPrice),
        customItems: JSON.stringify(customItems),
        paymentType: lead.proposalDepositOnly ? 'deposit' : 'full',
        // The webhook's fallback when Stripe omits amount_total on a
        // schedule sale. Without it that fallback reached for the whole
        // project price and marked all three instalments paid.
        depositAmount: String(deposit),
      },
    },
      /*
       * Stripe's own guard against one client becoming two live checkouts.
       *
       * The signature has had a replay guard since it was written — a second
       * POST cannot overwrite agreementSignedAt or re-send the contract. The
       * checkout never did. Every POST minted a fresh Checkout Session, and
       * nothing on the Lead stored the previous one, so nothing could expire
       * it: a double-tap that beat the button's own disable, a retry on a
       * flaky connection, or a second tab left two payable links alive for the
       * same deposit. The webhook keys idempotency on the session id, so two
       * sessions are two Payment rows and two real charges — on the largest
       * single amount a client ever sends us.
       *
       * The instalment flow closes exactly this window by expiring the old
       * session before minting; this one has no stored id to expire, and an
       * idempotency key needs none. Stripe replays the original response for
       * an identical request for 24 hours, which is precisely how long the
       * session it returns lives.
       *
       * Keyed on the amount as well as the lead, so a genuinely re-priced
       * proposal still gets its own session rather than the stale one.
       */
      { idempotencyKey: `signandpay-${leadId}-${chargeAmount}` }
    );

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Agree-and-pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
