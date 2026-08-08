import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveCheckoutUrl, sessionStillOpen } from '@/lib/instalment-checkout';
import type Stripe from 'stripe';

/**
 * The one place that decides whether a client is handed a stored payment link
 * or a fresh one, and it had no tests.
 *
 * Its own comment states the stakes: the wrong answer is "either a dead button
 * or two live checkouts for one payment". Both have happened here. A Stripe
 * Checkout Session dies 24 hours after it is minted and the invoice promises
 * fourteen days, so the emailed button worked on the day it landed and was a
 * Stripe error page for the whole period the client was actually being asked
 * to pay in. And this rule used to be written out twice, differently, in
 * /pay/[instalmentId] and in pay-balance — two copies of "when may a stored
 * Stripe URL be handed to a client" is one too many.
 *
 * It is now one copy, which makes it worth pinning properly.
 */

const retrieve = vi.fn();
const create = vi.fn();

const stripe = {
  checkout: { sessions: { retrieve, create } },
} as unknown as Pick<Stripe, 'checkout'>;

const INSTALMENT = {
  id: 'inst_1',
  projectId: 'proj_1',
  index: 2,
  label: 'Payment 2 of 3',
  amountCents: 400000,
  paymentUrl: 'https://checkout.stripe.com/stored',
  stripeSessionId: 'cs_stored',
  invoiceNumber: 'BM-2026-0031',
};

const PROJECT = { id: 'proj_1', name: 'Northgate — Website', clientEmail: 'dana@northgate.test' };
const SITE = 'https://bothmade.studio';

beforeEach(() => {
  retrieve.mockReset();
  create.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('is the stored session still one Stripe would take money through', () => {
  it('says no without asking when there is no session id', async () => {
    expect(await sessionStillOpen(stripe, null)).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('says yes only for an open session', async () => {
    retrieve.mockResolvedValue({ status: 'open' });
    expect(await sessionStillOpen(stripe, 'cs_1')).toBe(true);
  });

  it.each(['expired', 'complete'])('says no for a %s session', async (status) => {
    // 'complete' belongs to a payment that already happened and 'expired'
    // shows the client a Stripe page explaining nothing. Sending someone back
    // to either is how a paid invoice gets paid twice or an unpaid one gets
    // abandoned.
    retrieve.mockResolvedValue({ status });
    expect(await sessionStillOpen(stripe, 'cs_1')).toBe(false);
  });

  it('says no rather than throwing when Stripe cannot be reached', async () => {
    retrieve.mockRejectedValue(new Error('network'));
    expect(await sessionStillOpen(stripe, 'cs_1')).toBe(false);
  });
});

describe('a stored link Stripe still honours', () => {
  it('is reused rather than replaced', async () => {
    // Two live sessions for one instalment is the double-collection window
    // the schedule flow exists to close, so a client who clicks twice must
    // land on one checkout.
    retrieve.mockResolvedValue({ status: 'open' });

    const result = await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE);

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/stored',
      sessionId: 'cs_stored',
      minted: false,
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('a stored link that has died', () => {
  beforeEach(() => {
    retrieve.mockResolvedValue({ status: 'expired' });
    create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/new' });
  });

  it('mints a fresh one and says that it did', async () => {
    // `minted` is what tells the caller to persist the new url and session id.
    const result = await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE);

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/new',
      sessionId: 'cs_new',
      minted: true,
    });
  });

  it('charges the instalment amount, once', async () => {
    await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE);

    const [args] = create.mock.calls[0];
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].quantity).toBe(1);
    expect(args.line_items[0].price_data.unit_amount).toBe(400000);
  });

  it('carries the metadata the webhook settles on', async () => {
    // Dropping any of this leaves a paid instalment beside an open invoice —
    // the webhook has nothing to match the payment back to.
    await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE, 'inv_99');

    const { metadata } = create.mock.calls[0][0];
    expect(metadata).toMatchObject({
      existingProjectId: 'proj_1',
      instalmentId: 'inst_1',
      invoiceId: 'inv_99',
      invoiceNumber: 'BM-2026-0031',
    });
  });

  it('omits invoiceId rather than sending an empty one when there is no invoice', async () => {
    await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE);

    expect(create.mock.calls[0][0].metadata).not.toHaveProperty('invoiceId');
  });

  it('labels the first instalment a deposit and the rest a balance', async () => {
    // The webhook branches on this, so it is not a display string.
    await liveCheckoutUrl(stripe, { ...INSTALMENT, index: 1 }, PROJECT, SITE);
    expect(create.mock.calls[0][0].metadata.paymentType).toBe('deposit');

    create.mockClear();
    await liveCheckoutUrl(stripe, { ...INSTALMENT, index: 3 }, PROJECT, SITE);
    expect(create.mock.calls[0][0].metadata.paymentType).toBe('balance');
  });

  it('sends the client back into their own dashboard either way', async () => {
    await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE);

    const args = create.mock.calls[0][0];
    expect(args.success_url).toContain(`${SITE}/client/proj_1`);
    expect(args.cancel_url).toBe(`${SITE}/client/proj_1`);
  });
});

describe('a stored url with no session id behind it', () => {
  it('is not trusted — it mints instead of handing over a link it cannot verify', async () => {
    create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/new' });

    const result = await liveCheckoutUrl(
      stripe,
      { ...INSTALMENT, stripeSessionId: null },
      PROJECT,
      SITE
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(result?.minted).toBe(true);
  });
});

describe('when Stripe refuses', () => {
  it('returns null rather than a broken button', async () => {
    // The caller has to handle this — a client who cannot pay is the failure
    // this whole module is about, so it must not be swallowed.
    retrieve.mockResolvedValue({ status: 'expired' });
    create.mockRejectedValue(new Error('rate limited'));

    expect(await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE)).toBeNull();
  });

  it('returns null when Stripe answers without a url', async () => {
    retrieve.mockResolvedValue({ status: 'expired' });
    create.mockResolvedValue({ id: 'cs_new', url: null });

    expect(await liveCheckoutUrl(stripe, INSTALMENT, PROJECT, SITE)).toBeNull();
  });
});
