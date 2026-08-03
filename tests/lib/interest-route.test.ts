import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/start/interest` is the site's second front door — someone who has
 * priced a whole project and asked to talk before paying.
 *
 * It writes to the same `Lead` row as the contact form, from the same site,
 * and used to take whatever it was handed: an address with no `@`, a phone
 * number with letters in it. What the CRM ended up holding therefore depended
 * on which door a lead came through, and a rep only found out on the call
 * that failed. These tests hold both doors to one standard.
 */

const sendEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const leadFindFirst = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const userFindFirst = vi.fn();
const rateLimitRows = new Map<string, { count: number; windowStart: Date }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findFirst: (...args: unknown[]) => leadFindFirst(...args),
      create: (...args: unknown[]) => leadCreate(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
    user: { findFirst: (...args: unknown[]) => userFindFirst(...args) },
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
  },
}));

const { POST } = await import('@/app/api/start/interest/route');

function request(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

const VALID = {
  contactName: 'Kiana Arabpour',
  email: 'kiana@example.com',
  company: 'Random',
  phone: '+1 (555) 000-0000',
  baseService: 'website',
  addOns: [],
  clientType: 'smb',
  timeline: 'standard',
};

/** The limiter's counters persist across tests, so every case gets its own IP. */
let ip = 0;
function freshIp() {
  return { 'x-forwarded-for': `198.51.100.${++ip}` };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://bothmade.studio');
  sendEmail.mockReset().mockResolvedValue(true);
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_1' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_1' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  userFindFirst
    .mockReset()
    .mockResolvedValue({ id: 'user_evan', email: 'evan@bothmade.studio', name: 'Evan' });
});

describe('POST /api/start/interest — what reaches the CRM', () => {
  it('records the priced enquiry with its phone number', async () => {
    const res = await POST(request(VALID, freshIp()));

    expect(res.status).toBe(200);
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({
      company: 'Random',
      contactName: 'Kiana Arabpour',
      phone: '+1 (555) 000-0000',
      source: 'inbound-pricing',
    });
  });

  it('stores null, not an empty string, when no number was given', async () => {
    // A rep scanning for "has a number" sees '' as a value; null is absence.
    await POST(request({ ...VALID, phone: '' }, freshIp()));

    expect(leadCreate.mock.calls[0][0].data.phone).toBeNull();
  });

  it('accepts a submission with no phone at all — it is optional here too', async () => {
    // Someone who has configured a whole project is not worth losing over a
    // phone number.
    const { phone: _phone, ...withoutPhone } = VALID;
    const res = await POST(request(withoutPhone, freshIp()));

    expect(res.status).toBe(200);
    expect(leadCreate).toHaveBeenCalledOnce();
  });

  it('tidies the spacing but keeps the grouping the sender typed', async () => {
    await POST(request({ ...VALID, phone: '+44  7700   900123' }, freshIp()));

    expect(leadCreate.mock.calls[0][0].data.phone).toBe('+44 7700 900123');
  });
});

describe('POST /api/start/interest — values it refuses', () => {
  it('rejects a malformed email instead of writing it to the lead', async () => {
    const res = await POST(request({ ...VALID, email: 'not-an-address' }, freshIp()));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/email/i) });
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects an address that could smuggle a second recipient', async () => {
    const res = await POST(
      request({ ...VALID, email: 'Kiana <kiana@example.com>' }, freshIp())
    );

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a phone number with letters in it rather than salvaging digits', async () => {
    const res = await POST(request({ ...VALID, phone: '555-CALL-NOW' }, freshIp()));

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a dial code no country uses', async () => {
    const res = await POST(request({ ...VALID, phone: '+999 1234567' }, freshIp()));

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a North American number that is not ten digits', async () => {
    const res = await POST(request({ ...VALID, phone: '+1 123456' }, freshIp()));

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('answers with the same wording the contact form would have', async () => {
    // One vocabulary across both doors: a visitor should not be able to tell
    // which route rejected them.
    const { FIELD_ERRORS } = await import('@/lib/validation');
    const res = await POST(request({ ...VALID, phone: '555-CALL-NOW' }, freshIp()));

    expect((await res.json()).error).toBe(FIELD_ERRORS.phone);
  });
});

describe('POST /api/start/interest — telling the rep', () => {
  it('puts the number one tap away in the alert', async () => {
    await POST(request({ ...VALID, phone: '+44 7700 900123' }, freshIp()));

    const alert = sendEmail.mock.calls.find((call) => call[0].to === 'evan@bothmade.studio');
    expect(alert?.[0].html).toContain('href="tel:+447700900123"');
    expect(alert?.[0].html).toContain('+44 7700 900123');
  });

  it('says nothing about calling when no number was left', async () => {
    await POST(request({ ...VALID, phone: '' }, freshIp()));

    const alert = sendEmail.mock.calls.find((call) => call[0].to === 'evan@bothmade.studio');
    expect(alert?.[0].html).not.toContain('tel:');
  });
});
