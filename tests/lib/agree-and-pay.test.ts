import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/public/leads/[leadId]/agree-and-pay` is the only route on the site
 * that creates a legal signature, and it does it for an unauthenticated
 * caller holding a link. These tests are about the evidence: that a
 * signature is only written when somebody actually consented, that what
 * gets written is the server's account of it rather than the caller's, and
 * that once written it is never rewritten.
 */

const sessionsCreate = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: (...args: unknown[]) => sessionsCreate(...args) } };
  },
}));

const put = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }));

const buildContractPdf = vi.fn();
vi.mock('@/lib/contract-pdf', () => ({
  buildContractPdf: (...args: unknown[]) => buildContractPdf(...args),
}));

vi.mock('@/lib/invoice-pdf', () => ({
  buildInvoiceForProposal: async () => new Uint8Array([1, 2, 3]),
}));

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => leadFindUnique(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
  },
}));

vi.mock('@/lib/notify', () => ({ getAdminEmails: async () => ['evan@bothmade.studio'] }));

const sendSignedContractCopyEmail = vi.fn();
const sendClientSignedContractEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  sendSignedContractCopyEmail: (...args: unknown[]) => sendSignedContractCopyEmail(...args),
  sendClientSignedContractEmail: (...args: unknown[]) => sendClientSignedContractEmail(...args),
}));

// The token and the rate limiter have their own tests; here they only need
// to get out of the way so the consent checks are what the assertions see.
vi.mock('@/lib/share-links', () => ({
  buildSignUrl: () => 'https://bothmade.test/sign/lead_1?t=tok',
  readShareToken: () => 'tok',
  shareTokenMatches: (stored: string, given: string) => stored === given,
}));
vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { publicWrite: { limit: 5, windowMs: 60_000 } },
  checkRateLimit: async () => ({ allowed: true }),
  enforceRateLimit: async () => null,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

const { POST } = await import('@/app/api/public/leads/[leadId]/agree-and-pay/route');
const { CLICKWRAP_STATEMENT } = await import('@/lib/clickwrap');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36';

const LEAD = {
  id: 'lead_1',
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  email: 'priya@northgatedental.test',
  status: 'proposal_sent',
  shareToken: 'tok',
  proposalBaseService: 'website',
  proposalClientType: 'smb',
  proposalTimeline: 'standard',
  proposalAddOns: '',
  proposalCustomItems: [],
  proposalTotalPrice: 600_000,
  proposalDepositOnly: true,
  agreementSignedAt: null,
  agreementIp: null,
  agreementHash: null,
  agreementSignerName: null,
  signedContractUrl: null,
};

/** Minimal stand-in for the NextRequest the route actually reads from. */
function request(body: unknown, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': UA, ...headers };
  return {
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
    headers: { get: (k: string) => all[k.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

const params = Promise.resolve({ leadId: 'lead_1' });

/** The `data` the route handed prisma for the signature write. */
const written = () => leadUpdate.mock.calls[0][0].data;

const SIGNED = { agreed: true, signerName: 'Priya Raman' };

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ url: 'https://stripe.test/pay' });
  put.mockReset().mockResolvedValue({ url: 'https://blob.test/contract.pdf' });
  buildContractPdf.mockReset().mockResolvedValue(new Uint8Array([4, 5, 6]));
  leadFindUnique.mockReset().mockResolvedValue({ ...LEAD });
  leadUpdate.mockReset().mockResolvedValue({ ...LEAD });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  sendSignedContractCopyEmail.mockReset().mockResolvedValue(true);
  sendClientSignedContractEmail.mockReset().mockResolvedValue(true);
});

describe('what it refuses to call a signature', () => {
  it('refuses a POST that never says the box was ticked', async () => {
    // The shape the page used to send: a valid token, an empty body, and no
    // evidence whatsoever that a human read the terms.
    const res = await POST(request(undefined), { params });

    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('refuses consent without a name, and a name without consent', async () => {
    for (const body of [{ agreed: true }, { signerName: 'Priya Raman' }, { agreed: 'yes', signerName: 'Priya Raman' }]) {
      const res = await POST(request(body), { params });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('refuses a phone number typed into the name box', async () => {
    const res = await POST(request({ agreed: true, signerName: '07700 900123' }), { params });

    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

describe('what it records when somebody does sign', () => {
  it('writes the name, the address, the browser, and the statement', async () => {
    const res = await POST(request(SIGNED), { params });
    expect(res.status).toBe(200);

    const data = written();
    expect(data.agreementSignerName).toBe('Priya Raman');
    // The first hop, not the proxy chain.
    expect(data.agreementIp).toBe('203.0.113.7');
    expect(data.agreementUserAgent).toBe(UA);
    expect(data.agreementSignedAt).toBeInstanceOf(Date);
    expect(data.agreementHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.contractStatus).toBe('signed');
  });

  it('records the statement the server serves, not one the caller supplies', async () => {
    await POST(
      request({ ...SIGNED, statement: 'I agree to pay double', agreementStatement: 'I agree to pay double' }),
      { params }
    );

    expect(written().agreementStatement).toBe(CLICKWRAP_STATEMENT);
  });

  it('normalizes the typed name rather than storing it as posted', async () => {
    await POST(request({ agreed: true, signerName: '  Priya   Raman  ' }), { params });

    expect(written().agreementSignerName).toBe('Priya Raman');
  });

  it('puts the signer and the statement on the saved PDF', async () => {
    await POST(request(SIGNED), { params });

    expect(buildContractPdf).toHaveBeenCalledTimes(1);
    expect(buildContractPdf.mock.calls[0][0].signedOnline).toMatchObject({
      ip: '203.0.113.7',
      signerName: 'Priya Raman',
      userAgent: UA,
      statement: CLICKWRAP_STATEMENT,
    });
  });

  it('sends the client their own copy, not just the team', async () => {
    await POST(request(SIGNED), { params });

    expect(sendClientSignedContractEmail).toHaveBeenCalledTimes(1);
    expect(sendClientSignedContractEmail.mock.calls[0][0]).toMatchObject({
      toEmail: 'priya@northgatedental.test',
      contactName: 'Priya Raman',
      contractUrl: 'https://blob.test/contract.pdf',
    });
  });

  it('still opens checkout when the client copy fails to send', async () => {
    // A bounced courtesy email must not stand between a client and paying.
    sendClientSignedContractEmail.mockRejectedValue(new Error('smtp down'));

    const res = await POST(request(SIGNED), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: 'https://stripe.test/pay' });
  });
});

describe('a signature already on file', () => {
  const signed = {
    ...LEAD,
    agreementSignedAt: new Date('2026-07-01T10:00:00Z'),
    agreementIp: '198.51.100.4',
    agreementSignerName: 'Priya Raman',
    signedContractUrl: 'https://blob.test/original.pdf',
  };

  beforeEach(() => leadFindUnique.mockResolvedValue(signed));

  it('lets them back in to pay without signing again', async () => {
    // The page shows a returning client a payment button and no checkbox,
    // so the request it sends carries no consent — and must not need to.
    const res = await POST(request(undefined), { params });

    expect(res.status).toBe(200);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('leaves the original evidence alone even when the second POST claims a different signer', async () => {
    await POST(request({ agreed: true, signerName: 'Someone Else' }), { params });

    expect(leadUpdate).not.toHaveBeenCalled();
    expect(buildContractPdf).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    // No second "contract signed" alert to the team, and no second copy to
    // the client implying they signed twice.
    expect(sendSignedContractCopyEmail).not.toHaveBeenCalled();
    expect(sendClientSignedContractEmail).not.toHaveBeenCalled();
  });
});

/**
 * One client, one live checkout.
 *
 * The signature has had a replay guard since it was written — a second POST
 * cannot overwrite agreementSignedAt or re-send the contract. The checkout
 * never did. Every POST minted a fresh Checkout Session, and nothing on the
 * Lead stored the previous one, so nothing could expire it: a double-tap that
 * beat the button's own disable, a retry on a flaky connection, or a second
 * tab left two payable links alive for the same deposit. The webhook keys
 * idempotency on the session id, so two sessions are two Payment rows and two
 * real charges — on the largest single amount a client ever sends us.
 *
 * The instalment flow closes this by expiring the old session before minting.
 * This one has no stored id to expire, and an idempotency key needs none.
 */
describe('two taps on Agree & Pay', () => {
  it('asks Stripe for the same session both times', async () => {
    await POST(request(SIGNED), { params });
    await POST(request(SIGNED), { params });

    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    const [, firstOpts] = sessionsCreate.mock.calls[0] as [unknown, { idempotencyKey?: string }];
    const [, secondOpts] = sessionsCreate.mock.calls[1] as [unknown, { idempotencyKey?: string }];

    expect(firstOpts?.idempotencyKey, 'no idempotency key — Stripe will mint a second live checkout')
      .toBeTruthy();
    expect(secondOpts?.idempotencyKey).toBe(firstOpts?.idempotencyKey);
  });

  /** The lead and the amount, so a re-priced proposal is not served a stale one. */
  it('keys on the lead and what is being charged', async () => {
    await POST(request(SIGNED), { params });

    const [, opts] = sessionsCreate.mock.calls[0] as [unknown, { idempotencyKey?: string }];
    expect(opts?.idempotencyKey).toMatch(/lead_1/);
    expect(opts?.idempotencyKey).toMatch(/\d{3,}/);
  });
});
