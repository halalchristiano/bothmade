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
    expect(successUrl).toContain('/checkout/success?session_id={CHECKOUT_SESSION_ID}');
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
