import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/start/interest` is the site's second front door. The dial-code and
 * field-validation work that landed for the contact form only ever covered
 * the contact form — this route writes to the same Lead row, from the same
 * site, and took whatever it was handed: an address with no @, a number with
 * letters in it. What the CRM held depended on which door a lead came
 * through, and a rep found out on the call that failed.
 *
 * So these assert that the pricing calculator runs the same predicates and
 * answers in the same words, and that the rep alert makes the number
 * dialable rather than merely naming it.
 */

const leadFindFirst = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const userFindFirst = vi.fn();

/** Stand-in for the `rate_limits` table, so the limiter takes its real path. */
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

// lib/notify is left real, so the rep alert asserted below is the one the
// route actually composes — the tel: link included.
const sendEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
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
  company: 'Bothmade',
  baseService: 'website',
  addOns: [],
  clientType: 'startup',
  timeline: 'flexible',
};

/** The limiter counts per client IP and the counters persist across tests. */
let ip = 0;
function freshIp() {
  return { 'x-forwarded-for': `198.51.100.${++ip}` };
}

const EVAN = { id: 'user_evan', email: 'evan@bothmade.studio', name: 'Evan' };

/** The mail addressed to the rep, as opposed to the studio inbox copy. */
const repAlert = () =>
  sendEmail.mock.calls.map(([mail]) => mail).find((mail) => mail?.to === EVAN.email);

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('STUDIO_INBOX', '');
  vi.stubEnv('SALES_EMAIL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://bothmade.studio');
  sendEmail.mockReset().mockResolvedValue(true);
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_1' });
  leadUpdate.mockReset().mockResolvedValue({});
  activityCreate.mockReset().mockResolvedValue({});
  userFindFirst.mockReset().mockResolvedValue(EVAN);
});

describe('the pricing calculator refuses what the contact form refuses', () => {
  it('rejects an address that is not an address, in the same words', async () => {
    const res = await POST(request({ ...VALID, email: 'kiana.example.com' }, freshIp()));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Enter a valid email address, like name@company.com.'
    );
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a phone number with letters in it', async () => {
    const res = await POST(request({ ...VALID, phone: '+44 77oo 9oo123' }, freshIp()));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Enter a valid phone number for the country code selected.'
    );
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a phone number too short to dial anywhere', async () => {
    const res = await POST(request({ ...VALID, phone: '+44 123' }, freshIp()));

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rejects a name that is really a phone number in the wrong box', async () => {
    const res = await POST(request({ ...VALID, contactName: '07700 900123' }, freshIp()));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Enter your name using letters, spaces, hyphens or apostrophes.'
    );
  });

  it('still takes an enquiry with no phone at all', async () => {
    const res = await POST(request({ ...VALID }, freshIp()));

    expect(res.status).toBe(200);
    expect(leadCreate).toHaveBeenCalledOnce();
    expect(leadCreate.mock.calls[0][0].data.phone).toBeNull();
  });

  it('stores a good number in the shape the contact form stores', async () => {
    const res = await POST(request({ ...VALID, phone: '+44 7700 900123' }, freshIp()));

    expect(res.status).toBe(200);
    expect(leadCreate.mock.calls[0][0].data.phone).toBe('+44 7700 900123');
  });

  it('trims the stored fields rather than keeping the whitespace typed', async () => {
    await POST(
      request({ ...VALID, contactName: '  Kiana  ', company: '  Bothmade  ' }, freshIp())
    );

    const data = leadCreate.mock.calls[0][0].data;
    expect(data.contactName).toBe('Kiana');
    expect(data.company).toBe('Bothmade');
  });

  it('matches an existing lead on the trimmed address, not the raw one', async () => {
    leadFindFirst.mockResolvedValue({ id: 'lead_existing' });

    await POST(request({ ...VALID, email: '  kiana@example.com  ' }, freshIp()));

    expect(leadFindFirst.mock.calls[0][0].where.email).toBe('kiana@example.com');
    expect(activityCreate).toHaveBeenCalledOnce();
    expect(leadCreate).not.toHaveBeenCalled();
  });
});

describe('the rep alert', () => {
  it('makes the number dialable, keeping the grouping the visitor typed', async () => {
    await POST(request({ ...VALID, phone: '+44 7700 900123' }, freshIp()));

    const html = repAlert()?.html as string;
    expect(html).toContain('href="tel:+447700900123"');
    // The text a rep reads back down the line keeps its spaces.
    expect(html).toContain('>+44 7700 900123</a>');
  });

  it('names no number when the visitor left none', async () => {
    await POST(request({ ...VALID }, freshIp()));

    expect(repAlert()?.html as string).not.toContain('tel:');
  });

  it('still links the email whether or not a phone came with it', async () => {
    await POST(request({ ...VALID, phone: '+44 7700 900123' }, freshIp()));

    expect(repAlert()?.html as string).toContain('mailto:kiana@example.com');
  });
});
