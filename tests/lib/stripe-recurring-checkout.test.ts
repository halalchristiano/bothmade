import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a care-plan checkout actually sets up in Stripe.
 *
 * The arrangement a client agrees to is "cheaper for a year, then normal", and
 * there are two ways to build that: charge the discounted price and remember
 * to raise it in twelve months, or charge the standard price with a coupon
 * that expires. Only the second one survives everyone forgetting about it, and
 * these tests exist to keep it that way — a regression to the first is
 * invisible for a year and then discounts a client forever.
 */

const sessionsCreate = vi.fn();
const couponsCreate = vi.fn();
const subscriptionsUpdate = vi.fn();

vi.mock('stripe', () => {
  class MockStripe {
    checkout = { sessions: { create: (...args: unknown[]) => sessionsCreate(...args) } };
    coupons = { create: (...args: unknown[]) => couponsCreate(...args) };
    subscriptions = { update: (...args: unknown[]) => subscriptionsUpdate(...args) };
    webhooks = { constructEvent: vi.fn() };
    static errors = { StripeInvalidRequestError: class extends Error {} };
  }
  return { default: MockStripe };
});

const { createRecurringCheckoutSession, cancelSubscriptionAtPeriodEnd } = await import('@/lib/stripe');
const { buildSchedule, DISCOUNT_MONTHS, COVERED_MONTHS } = await import('@/lib/recurring');

/** Hosting at $200/mo, 25% off, two months already covered. */
const SCHEDULE = buildSchedule({
  addOns: ['hosting'],
  monthlyCents: 20000,
  discountType: 'percent',
  discountValue: 25,
  freeMonths: COVERED_MONTHS,
  discountMonths: DISCOUNT_MONTHS,
});

const INPUT = {
  offerId: 'offer_1',
  projectId: 'proj_1',
  clientEmail: 'frell@linpotia.com',
  productName: 'Linpotia Cafe — Managed Hosting',
  monthlyCents: SCHEDULE.monthlyCents,
  discountType: SCHEDULE.discountType,
  discountValue: SCHEDULE.discountValue,
  couponDurationMonths: SCHEDULE.couponDurationMonths,
  trialDays: 61,
};

const lastSession = () => sessionsCreate.mock.calls[0][0];
/** Genuinely the most recent call — the retry path makes two. */
const latestSession = () => sessionsCreate.mock.calls.at(-1)![0];
const lastCoupon = () => couponsCreate.mock.calls[0][0];

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: 'cs_test_1', url: 'https://stripe.test/pay' });
  couponsCreate.mockReset().mockResolvedValue({ id: 'coupon_1' });
  subscriptionsUpdate.mockReset().mockResolvedValue({ id: 'sub_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the price on the subscription', () => {
  it('is the standard rate, so the plan reverts without anyone acting', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    const price = lastSession().line_items[0].price_data;
    expect(price.unit_amount).toBe(20000);
    // The regression this exists to catch: baking the discount into the price
    // means the introductory rate never ends.
    expect(price.unit_amount).not.toBe(SCHEDULE.discountedCents);
    expect(price.recurring).toEqual({ interval: 'month' });
  });

  it('bills monthly, in subscription mode', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastSession().mode).toBe('subscription');
  });
});

describe('the discount', () => {
  it('is a repeating coupon that expires on its own', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastCoupon().duration).toBe('repeating');
    expect(lastCoupon().percent_off).toBe(25);
    expect(lastSession().discounts).toEqual([{ coupon: 'coupon_1' }]);
  });

  it('runs long enough to cover twelve billed months, free months included', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    // Stripe starts the coupon's clock with the subscription, not with the
    // first invoice. Twelve here would silently discount only ten.
    expect(lastCoupon().duration_in_months).toBe(COVERED_MONTHS + DISCOUNT_MONTHS);
  });

  it('cannot be redeemed by anyone else who reads the ID', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastCoupon().max_redemptions).toBe(1);
  });

  it('is expressed in cents with a currency when it is a fixed amount', async () => {
    await createRecurringCheckoutSession(
      { ...INPUT, discountType: 'amount', discountValue: 5000 },
      'https://x/ok',
      'https://x/back'
    );

    expect(lastCoupon().amount_off).toBe(5000);
    expect(lastCoupon().currency).toBe('usd');
    expect(lastCoupon().percent_off).toBeUndefined();
  });

  it('is skipped entirely when there is no discount to give', async () => {
    await createRecurringCheckoutSession(
      { ...INPUT, discountValue: 0 },
      'https://x/ok',
      'https://x/back'
    );

    expect(couponsCreate).not.toHaveBeenCalled();
    expect(lastSession().discounts).toBeUndefined();
  });
});

describe('the months already paid for', () => {
  it('become a trial, so nothing is charged during them', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastSession().subscription_data.trial_period_days).toBe(61);
  });

  it('are absent when nothing is prepaid, so billing starts immediately', async () => {
    await createRecurringCheckoutSession({ ...INPUT, trialDays: 0 }, 'https://x/ok', 'https://x/back');

    expect(lastSession().subscription_data.trial_period_days).toBeUndefined();
  });
});

describe('what the webhook needs to find its way back', () => {
  it('tags both the session and the subscription with the offer', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastSession().metadata.recurringOfferId).toBe('offer_1');
    // Invoice events arrive with a subscription, never with the session that
    // created it — so the tag has to be on both or every monthly invoice is
    // unattributable.
    expect(lastSession().subscription_data.metadata.recurringOfferId).toBe('offer_1');
  });
});

describe('the customer record', () => {
  it('reuses the client\'s existing one when there is one', async () => {
    await createRecurringCheckoutSession(
      { ...INPUT, stripeCustomerId: 'cus_existing' },
      'https://x/ok',
      'https://x/back'
    );

    expect(lastSession().customer).toBe('cus_existing');
    // Stripe rejects a session carrying both.
    expect(lastSession().customer_email).toBeUndefined();
  });

  it('falls back to the email when the client has never paid by card', async () => {
    await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');

    expect(lastSession().customer_email).toBe('frell@linpotia.com');
    expect(lastSession().customer).toBeUndefined();
  });
});

describe('when Stripe refuses', () => {
  it('returns no checkout rather than a half-made one', async () => {
    sessionsCreate.mockRejectedValueOnce(new Error('card_declined'));

    const result = await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');
    expect(result.ok).toBe(false);
  });

  /**
   * The whole reason this returns a reason at all. A swallowed error left the
   * page saying "try again in a moment" for failures that are permanent — a
   * key in the wrong mode fails identically every time — and put the only
   * useful sentence in a server log nobody reads.
   */
  it('carries Stripe\'s own words back for whoever is testing the link', async () => {
    const refusal = Object.assign(new Error('No such coupon: cpn_x'), {
      type: 'StripeInvalidRequestError',
    });
    sessionsCreate.mockRejectedValueOnce(refusal);

    const result = await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');
    expect(result).toEqual({ ok: false, reason: 'StripeInvalidRequestError: No such coupon: cpn_x' });
  });

  it('does not throw a second error while explaining the first', async () => {
    sessionsCreate.mockRejectedValueOnce('a string, not an Error');

    const result = await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');
    expect(result).toEqual({ ok: false, reason: 'Unknown error opening checkout.' });
  });

  it('says so when Stripe returns a session with nowhere to send anyone', async () => {
    sessionsCreate.mockResolvedValueOnce({ id: 'cs_1', url: null });

    const result = await createRecurringCheckoutSession(INPUT, 'https://x/ok', 'https://x/back');
    expect(result).toMatchObject({ ok: false });
  });
});

/**
 * A `cus_...` minted against a different Stripe account or the other mode —
 * a client onboarded on test keys keeps an id a live key has never heard of.
 * The plan is perfectly sellable; refusing it over a stale foreign key is not
 * an answer anybody wants.
 */
describe('a customer id Stripe does not recognise', () => {
  const WITH_CUSTOMER = { ...INPUT, stripeCustomerId: 'cus_stale' };

  it('retries on the email rather than losing the sale', async () => {
    sessionsCreate.mockRejectedValueOnce(
      Object.assign(new Error('No such customer: cus_stale'), { type: 'StripeInvalidRequestError' })
    );

    const result = await createRecurringCheckoutSession(WITH_CUSTOMER, 'https://x/ok', 'https://x/back');

    expect(result.ok).toBe(true);
    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    // The first attempt carried the stale id; the retry carries none.
    expect(lastSession().customer).toBe('cus_stale');
    expect(latestSession().customer).toBeUndefined();
    expect(latestSession().customer_email).toBe('frell@linpotia.com');
  });

  it('does not retry a refusal that has nothing to do with the customer', async () => {
    sessionsCreate.mockRejectedValueOnce(
      Object.assign(new Error('No such coupon: cpn_x'), { type: 'StripeInvalidRequestError' })
    );

    const result = await createRecurringCheckoutSession(WITH_CUSTOMER, 'https://x/ok', 'https://x/back');

    expect(result.ok).toBe(false);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe('stopping a plan', () => {
  it('cancels at the end of the period they already paid for', async () => {
    expect(await cancelSubscriptionAtPeriodEnd('sub_1')).toBe(true);
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
  });

  it('reports failure rather than claiming a subscription was stopped', async () => {
    subscriptionsUpdate.mockRejectedValueOnce(new Error('network'));

    expect(await cancelSubscriptionAtPeriodEnd('sub_1')).toBe(false);
  });
});
