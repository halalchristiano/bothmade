import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/checkout` is unauthenticated and public — anything the browser posts
 * lands here. These tests are about what it refuses, and about the amount it
 * hands Stripe when it does not refuse, because that amount is the charge.
 */

const createCheckoutSession = vi.fn();
vi.mock('@/lib/stripe', () => ({
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
}));

const leadFindFirst = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const userFindFirst = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findFirst: (...args: unknown[]) => leadFindFirst(...args),
      create: (...args: unknown[]) => leadCreate(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
    user: { findFirst: (...args: unknown[]) => userFindFirst(...args) },
  },
}));

const { POST } = await import('@/app/api/checkout/route');
const { calculatePrice } = await import('@/lib/pricing');

/** Minimal stand-in for the NextRequest the route actually reads from. */
function request(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const VALID = {
  baseService: 'website',
  addOns: ['seo'],
  clientType: 'smb',
  timeline: 'standard',
  clientEmail: 'frell@linpotia.com',
  company: 'Linpotia Cafe',
};

beforeEach(() => {
  createCheckoutSession.mockReset();
  createCheckoutSession.mockResolvedValue({ sessionId: 'cs_test_1', url: 'https://stripe.test/pay' });
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_checkout' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_checkout' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  userFindFirst.mockReset().mockResolvedValue({
    id: 'user_evan',
    email: 'evan@bothmade.studio',
    name: 'Evan',
  });
});

describe('POST /api/checkout — rejections', () => {
  it('requires an email and a company', async () => {
    for (const missing of ['clientEmail', 'company']) {
      const body = { ...VALID, [missing]: '' };
      const res = await POST(request(body));
      expect(res.status, missing).toBe(400);
    }
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown base service', async () => {
    const res = await POST(request({ ...VALID, baseService: 'spaceship' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid base service' });
  });

  it('rejects a prototype property posing as a base service', async () => {
    // `'constructor' in BASE_SERVICES` is true; the guard must not be.
    const res = await POST(request({ ...VALID, baseService: 'constructor' }));
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a prototype property hidden among the add-ons', async () => {
    // This is the case that would otherwise reach `ADD_ONS['toString'].price`
    // and turn the Stripe unit_amount into NaN.
    const res = await POST(request({ ...VALID, addOns: ['seo', 'toString'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid add-ons' });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown client type or timeline', async () => {
    expect((await POST(request({ ...VALID, clientType: 'mega-corp' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, timeline: 'yesterday' }))).status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects add-ons that are not an array of strings', async () => {
    expect((await POST(request({ ...VALID, addOns: 'seo' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, addOns: [1, 2] }))).status).toBe(400);
    expect((await POST(request({ ...VALID, addOns: [null] }))).status).toBe(400);
  });

  it('returns 500 rather than a broken redirect when Stripe declines to open a session', async () => {
    createCheckoutSession.mockResolvedValue(null);
    const res = await POST(request(VALID));
    expect(res.status).toBe(500);
  });

  it('does not leak an internal error to the caller', async () => {
    createCheckoutSession.mockRejectedValue(new Error('stripe key sk_live_abc is invalid'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request(VALID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 500 instead of throwing on a malformed body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST({
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/checkout — the happy path', () => {
  it('passes the validated selection straight through to Stripe', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      sessionId: 'cs_test_1',
      redirectUrl: 'https://stripe.test/pay',
    });

    const [input, successUrl, cancelUrl] = createCheckoutSession.mock.calls[0];
    expect(input).toMatchObject({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'smb',
      timeline: 'standard',
      clientEmail: 'frell@linpotia.com',
      company: 'Linpotia Cafe',
    });
    // type=welcome, because the success page is also where balance payments
    // land: without it a first-time buyer would be shown the returning-client
    // copy and never told a password was emailed to them.
    expect(successUrl).toContain('/checkout/success?type=welcome&session_id={CHECKOUT_SESSION_ID}');
    expect(cancelUrl).toContain('/start');
  });

  it('defaults add-ons to none when the field is omitted', async () => {
    const { addOns, ...withoutAddOns } = VALID;
    void addOns;
    const res = await POST(request(withoutAddOns));

    expect(res.status).toBe(200);
    expect(createCheckoutSession.mock.calls[0][0].addOns).toEqual([]);
  });

  it('hands Stripe a selection that prices to a whole number of cents', async () => {
    await POST(request({ ...VALID, clientType: 'enterprise', timeline: 'rush' }));

    const input = createCheckoutSession.mock.calls[0][0];
    const { totalPrice } = calculatePrice({
      baseService: input.baseService,
      addOns: input.addOns,
      clientType: input.clientType,
      timeline: input.timeline,
    });
    expect(Number.isInteger(totalPrice)).toBe(true);
    expect(totalPrice).toBeGreaterThan(0);
  });
});

/**
 * The gap this closes: someone who configured a project, filled in their
 * details and clicked the money button used to leave no trace whatsoever if
 * they hesitated on the Stripe page. Highest-intent visitor on the site,
 * completely invisible.
 */
describe('POST /api/checkout — capturing the attempt', () => {
  it('records the attempt as a lead before handing off to Stripe', async () => {
    await POST(request(VALID));

    expect(leadCreate).toHaveBeenCalledOnce();
    const { data } = leadCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      company: 'Linpotia Cafe',
      email: 'frell@linpotia.com',
      source: 'checkout-started',
      assignedToId: 'user_evan',
    });
    expect(data.estimatedValue).toBe(calculatePrice({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'smb',
      timeline: 'standard',
    }).totalPrice);
    expect(data.notes).toContain('Reached Stripe checkout');
  });

  it('keeps the lead at "new" so an idle click cannot book itself as revenue', async () => {
    // deposit_pending carries a 0.95 weight in the sales forecast; reaching
    // the payment page is intent, not a commitment.
    await POST(request(VALID));

    expect(leadCreate.mock.calls[0][0].data.status).toBe('new');
  });

  it('threads the lead id through Stripe so payment promotes that same row', async () => {
    await POST(request(VALID));

    expect(createCheckoutSession.mock.calls[0][0].leadId).toBe('lead_checkout');
  });

  it('logs against an existing lead rather than duplicating, and leaves its status alone', async () => {
    leadFindFirst.mockResolvedValue({ id: 'lead_known' });

    await POST(request(VALID));

    expect(leadCreate).not.toHaveBeenCalled();
    expect(activityCreate.mock.calls[0][0].data.leadId).toBe('lead_known');
    // A second attempt must never walk a won deal backwards.
    expect(leadUpdate.mock.calls[0][0].data.status).toBeUndefined();
    expect(createCheckoutSession.mock.calls[0][0].leadId).toBe('lead_known');
  });

  it('still opens checkout when the CRM write fails', async () => {
    // A database outage must not stop someone from paying us.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    leadCreate.mockRejectedValue(new Error('connection refused'));

    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalled();
    expect(createCheckoutSession.mock.calls[0][0].leadId).toBeUndefined();
  });
});

/**
 * `new Resend(undefined)` throws. Building the client at module scope would
 * therefore turn a missing RESEND_API_KEY into an import-time crash for every
 * route that transitively touches lib/email — including this one, whose real
 * job is taking money and has nothing to do with sending mail.
 */
describe('POST /api/checkout — no mail configured', () => {
  it('still opens checkout and still records the lead', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(leadCreate).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
