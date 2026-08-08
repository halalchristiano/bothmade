import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unsubscribing has to be something a person did.
 *
 * It used to happen while rendering the page the email links to, so anything
 * that FETCHED the URL performed it. Corporate mail security — Proofpoint,
 * Mimecast, Barracuda — follows every link in every message to see where it
 * goes, and the daily enquiry nudge puts this link in front of inbound leads,
 * who are the warmest contacts in the system. A scanner opening one marked
 * the lead do-not-contact, the sequence stopped, and it looked exactly like
 * somebody asking to be left alone. Nobody would have found out.
 *
 * It is the same automated fetch that inflates the open pixel, and the answer
 * is the one a GET always owed: change nothing.
 */

/**
 * Stand-in for the `rate_limits` table, so the limiter takes its real path.
 *
 * Without `$queryRaw` the DB counter throws and `enforceRateLimit` falls back
 * to its in-memory window — logging "[rate-limit] database counter failed" on
 * every test here and passing anyway. This route budgets token guesses, which
 * is the whole reason a stranger cannot unsubscribe a lead by trying tokens;
 * testing it against the fallback tested the wrong counter.
 */
const rateLimitRows = new Map<string, { count: number; windowStart: Date }>();

const prisma = {
  lead: { findUnique: vi.fn(), update: vi.fn(async (_a: unknown) => ({})) },
  leadActivity: { create: vi.fn(async (_a: unknown) => ({})) },
  rateLimit: { deleteMany: async () => ({ count: 0 }) },
  $queryRaw: (_sql: TemplateStringsArray, ...params: unknown[]) => {
    const key = params[0] as string;
    const windowMs = params[1] as number;
    const now = Date.now();
    const existing = rateLimitRows.get(key);
    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      const row = { count: 1, windowStart: new Date(now) };
      rateLimitRows.set(key, row);
      return Promise.resolve([{ ...row }]);
    }
    existing.count += 1;
    return Promise.resolve([{ ...existing }]);
  },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const { POST } = await import('@/app/api/public/stop/route');

let unsubscriber = 0;

const post = (token: string | null) => {
  const form = new FormData();
  if (token !== null) form.set('token', token);
  // A fresh address per call: the route budgets token guesses now, and the
  // limiter's store outlives a single test.
  unsubscriber += 1;
  return POST({
    formData: async () => form,
    headers: new Headers({ 'x-forwarded-for': `198.51.100.${unsubscriber}` }),
  } as unknown as Parameters<typeof POST>[0]);
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', doNotContact: false });
});

describe('the unsubscribe route', () => {
  it('marks the lead do-not-contact and says why', async () => {
    await post('tok_1');

    const { data } = prisma.lead.update.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(data.doNotContact).toBe(true);
    expect(data.doNotContactReason).toMatch(/unsubscribed/i);
  });

  /** So a rep wondering why a lead went quiet finds the answer where they look. */
  it('writes it to the lead timeline', async () => {
    await post('tok_1');

    const { data } = prisma.leadActivity.create.mock.calls[0][0] as unknown as {
      data: { leadId: string; content: string; automated: boolean };
    };
    expect(data.leadId).toBe('lead_1');
    expect(data.content).toMatch(/do not contact/i);

    /*
     * And flagged as the app's own row. The sales board orders each column by
     * when a lead was last worked, off this same timeline — so an unflagged
     * unsubscribe puts the one business nobody is allowed to email again at
     * the top of somebody's column, captioned as though a rep had just
     * spoken to them.
     */
    expect(data.automated, 'the recipient did this, not a rep').toBe(true);
  });

  it('redirects back with a 303, so a refresh cannot re-post it', async () => {
    const res = await post('tok_1');

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/stop/tok_1');
  });

  /** Twice is not an error, and this is the worst moment to tell somebody it is. */
  it('is quietly idempotent', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', doNotContact: true });

    const res = await post('tok_1');

    expect(res.status).toBe(303);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('says nothing about whether an unknown token exists', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    const res = await post('nope');

    expect(res.status).toBe(303);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('refuses a request with no token', async () => {
    const res = await post(null);

    expect(res.status).toBe(400);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('what a GET may do', () => {
  /**
   * The guarantee, stated as plainly as it can be: there is no GET handler on
   * this route at all, so nothing that merely follows the link can act.
   */
  it('has no GET handler to follow', async () => {
    const mod = (await import('@/app/api/public/stop/route')) as Record<string, unknown>;

    expect(mod.GET).toBeUndefined();
    expect(typeof mod.POST).toBe('function');
  });
});
