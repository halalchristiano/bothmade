import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/contact` is the site's front door. These tests exist because it used
 * to be possible for a visitor to see the green "message received" confirmation
 * while the enquiry reached nobody and was written nowhere — so what's asserted
 * here is that every accepted submission leaves a durable trace, and that the
 * notification reaches all three studio addresses rather than one.
 */

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));

const leadFindFirst = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const userFindFirst = vi.fn();
/**
 * Stand-in for the `rate_limits` table the limiter counts in. Without it
 * every request here would take the limiter's database-unreachable path, so
 * the rate-limit case below would be asserting the in-memory fallback rather
 * than what actually runs in production.
 */
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

// The rep alert goes through lib/notify, which composes it and hands it to
// sendEmail — mocked here so the assertions are about who gets told what.
const sendEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const { POST } = await import('@/app/api/contact/route');

/** Minimal stand-in for the NextRequest the route actually reads from. */
function request(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

const VALID = {
  name: 'Kiana Arabpour',
  email: 'year-forum0p@icloud.com',
  company: 'Random',
  service: 'web',
  message: 'I want an app',
  website: '',
};

/**
 * The route rate-limits per client IP, and the counters persist across
 * tests, so every case gets its own address.
 */
let ip = 0;
function freshIp() {
  return { 'x-forwarded-for': `203.0.113.${++ip}` };
}

const EVAN = { id: 'user_evan', email: 'evan@bothmade.studio', name: 'Evan' };

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('STUDIO_INBOX', '');
  vi.stubEnv('SALES_EMAIL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://bothmade.studio');
  send.mockReset().mockResolvedValue({ error: null });
  sendEmail.mockReset().mockResolvedValue(true);
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_1' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_1' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  userFindFirst.mockReset().mockResolvedValue(EVAN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/contact — where the message goes', () => {
  it('notifies info@, evan@ and kiana@, not a single address', async () => {
    const res = await POST(request(VALID, freshIp()));

    expect(res.status).toBe(200);
    const notification = send.mock.calls[0][0];
    expect(notification.to).toEqual([
      'info@bothmade.studio',
      'evan@bothmade.studio',
      'kiana@bothmade.studio',
    ]);
    // Hitting reply has to reach the person who wrote in, not the studio.
    expect(notification.replyTo).toBe(VALID.email);
  });

  it('records the enquiry as a lead in the CRM', async () => {
    await POST(request(VALID, freshIp()));

    expect(leadCreate).toHaveBeenCalledOnce();
    const { data } = leadCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      company: 'Random',
      contactName: 'Kiana Arabpour',
      email: 'year-forum0p@icloud.com',
      source: 'inbound',
      status: 'new',
    });
    expect(data.notes).toContain('I want an app');
    expect(data.notes).toContain('Web');
  });

  it('falls back to the sender name when no company is given', async () => {
    // `company` is required on Lead but optional on the form.
    await POST(request({ ...VALID, company: '' }, freshIp()));

    expect(leadCreate.mock.calls[0][0].data.company).toBe('Kiana Arabpour');
  });

  it('logs a repeat sender against the existing lead instead of duplicating it', async () => {
    leadFindFirst.mockResolvedValue({ id: 'lead_existing' });

    await POST(request(VALID, freshIp()));

    expect(leadCreate).not.toHaveBeenCalled();
    expect(activityCreate).toHaveBeenCalledOnce();
    expect(activityCreate.mock.calls[0][0].data).toMatchObject({
      leadId: 'lead_existing',
      type: 'note',
    });
    // Writing in unprompted is a buying signal the sales views sort on.
    expect(leadUpdate.mock.calls[0][0].data.replyReceivedAt).toBeInstanceOf(Date);
  });

  it('honours a STUDIO_INBOX override', async () => {
    vi.stubEnv('STUDIO_INBOX', 'hello@example.com, second@example.com');

    await POST(request(VALID, freshIp()));

    expect(send.mock.calls[0][0].to).toEqual(['hello@example.com', 'second@example.com']);
  });
});

describe('POST /api/contact — optional qualifiers', () => {
  it('records budget, timeline and phone on the lead when given', async () => {
    await POST(
      request(
        { ...VALID, budget: '10k-25k', timeline: 'asap', phone: '+1 555 000 1234' },
        freshIp()
      )
    );

    const { data } = leadCreate.mock.calls[0][0];
    // The floor of the stated bracket — "at least this", never an invented figure.
    expect(data.estimatedValue).toBe(1000000);
    expect(data.phone).toBe('+1 555 000 1234');
    expect(data.notes).toContain('Budget: $10k – $25k');
    expect(data.notes).toContain('Timeline: As soon as possible');
    expect(data.notes).toContain('Phone: +1 555 000 1234');
  });

  it('treats absent qualifiers as unanswered, not as an error', async () => {
    const res = await POST(request(VALID, freshIp()));

    expect(res.status).toBe(200);
    const { data } = leadCreate.mock.calls[0][0];
    expect(data.estimatedValue).toBeNull();
    expect(data.phone).toBeNull();
    expect(data.notes).not.toContain('Budget:');
    expect(data.notes).not.toContain('Timeline:');
  });

  it('ignores qualifier values not on the whitelist', async () => {
    const res = await POST(
      request({ ...VALID, budget: '<script>', timeline: 'constructor' }, freshIp())
    );

    expect(res.status).toBe(200);
    const { data } = leadCreate.mock.calls[0][0];
    expect(data.estimatedValue).toBeNull();
    expect(data.notes).not.toContain('Budget:');
    expect(data.notes).not.toContain('<script>');
  });

  it('leaves estimatedValue unset for brackets with no honest floor', async () => {
    await POST(request({ ...VALID, budget: 'unsure' }, freshIp()));

    const { data } = leadCreate.mock.calls[0][0];
    expect(data.estimatedValue).toBeNull();
    // But the answer itself still reaches the rep.
    expect(data.notes).toContain('Budget: Not sure yet');
  });
});

describe('POST /api/contact — telling Evan', () => {
  it('emails the sales rep directly that this client reached out', async () => {
    await POST(request(VALID, freshIp()));

    expect(sendEmail).toHaveBeenCalledOnce();
    const alert = sendEmail.mock.calls[0][0];
    expect(alert.to).toBe('evan@bothmade.studio');
    expect(alert.subject).toBe('Kiana Arabpour at Random just reached out');
    expect(alert.replyTo).toBe(VALID.email);
    // The point of this mail over the group one: the lead is a click away.
    expect(alert.html).toContain('https://bothmade.studio/admin/leads/lead_1');
    expect(alert.html).toContain('I want an app');
    expect(alert.html).toContain('Evan');
  });

  it('assigns the lead to the sales rep so it enters their queue', async () => {
    // The call list and the follow-up digest both filter by assignedToId; an
    // unassigned lead is mail with nowhere to land.
    await POST(request(VALID, freshIp()));

    expect(leadCreate.mock.calls[0][0].data.assignedToId).toBe('user_evan');
  });

  it('says so when a known address writes in again', async () => {
    leadFindFirst.mockResolvedValue({ id: 'lead_existing' });

    await POST(request(VALID, freshIp()));

    const alert = sendEmail.mock.calls[0][0];
    expect(alert.html).toContain('already in the pipeline');
    expect(alert.html).toContain('https://bothmade.studio/admin/leads/lead_existing');
  });

  it('still alerts evan@ when no sales account exists, leaving the lead unassigned', async () => {
    userFindFirst.mockResolvedValue(null);

    await POST(request(VALID, freshIp()));

    expect(sendEmail.mock.calls[0][0].to).toBe('evan@bothmade.studio');
    expect(leadCreate.mock.calls[0][0].data.assignedToId).toBeNull();
  });

  it('honours a SALES_EMAIL override when no sales account exists', async () => {
    userFindFirst.mockResolvedValue(null);
    vi.stubEnv('SALES_EMAIL', 'someone-else@bothmade.studio');

    await POST(request(VALID, freshIp()));

    expect(sendEmail.mock.calls[0][0].to).toBe('someone-else@bothmade.studio');
  });

  it('escapes the visitor-supplied message rather than injecting it', async () => {
    await POST(request({ ...VALID, message: '<img src=x onerror=alert(1)>' }, freshIp()));

    const { html } = sendEmail.mock.calls[0][0];
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('does not alert when the lead could not be written, since there is nothing to link to', async () => {
    leadCreate.mockRejectedValue(new Error('connection refused'));

    await POST(request(VALID, freshIp()));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalled(); // the group notification still goes out
  });
});

describe('POST /api/contact — partial failure', () => {
  it('still succeeds when mail fails, because the lead is saved', async () => {
    send.mockResolvedValue({ error: { message: 'domain not verified' } });

    const res = await POST(request(VALID, freshIp()));

    expect(leadCreate).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('still succeeds when the mail key is missing, because the lead is saved', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const res = await POST(request(VALID, freshIp()));

    expect(leadCreate).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('still notifies the studio when the database write fails', async () => {
    leadCreate.mockRejectedValue(new Error('connection refused'));

    const res = await POST(request(VALID, freshIp()));

    expect(send).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('reports failure only when both the database and mail are gone', async () => {
    leadCreate.mockRejectedValue(new Error('connection refused'));
    send.mockResolvedValue({ error: { message: 'domain not verified' } });

    const res = await POST(request(VALID, freshIp()));

    expect(res.status).toBe(502);
  });
});

describe('POST /api/contact — rejections', () => {
  it('drops a honeypot submission without recording or sending anything', async () => {
    const res = await POST(request({ ...VALID, website: 'http://spam.example' }, freshIp()));

    expect(res.status).toBe(200); // bots get no signal that they were caught
    expect(leadCreate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before touching the database', async () => {
    const res = await POST(request({ ...VALID, email: 'not-an-address' }, freshIp()));

    expect(res.status).toBe(400);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('requires a name, an email and a message', async () => {
    for (const missing of ['name', 'email', 'message']) {
      const res = await POST(request({ ...VALID, [missing]: '  ' }, freshIp()));
      expect(res.status, missing).toBe(400);
    }
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('rate-limits a client hammering the endpoint', async () => {
    const headers = freshIp();
    for (let i = 0; i < 3; i++) {
      expect((await POST(request(VALID, headers))).status).toBe(200);
    }

    const blocked = await POST(request(VALID, headers));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('does not spend the quote form budget for the same caller', async () => {
    const headers = freshIp();
    for (let i = 0; i < 4; i++) await POST(request(VALID, headers));

    // Budgets are namespaced per endpoint, so a blocked contact form must
    // not also lock this caller out of asking for a quote.
    const { rateLimitKey } = await import('@/lib/rate-limit');
    const req = { headers: { get: (n: string) => headers[n.toLowerCase() as keyof typeof headers] ?? null } };
    expect(rateLimitKey('contact', req as never)).not.toBe(rateLimitKey('interest', req as never));
  });
});
