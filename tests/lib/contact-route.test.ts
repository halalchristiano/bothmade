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
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findFirst: (...args: unknown[]) => leadFindFirst(...args),
      create: (...args: unknown[]) => leadCreate(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
  },
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
 * The route rate-limits per client IP in a module-level map that persists
 * across tests, so every case gets its own address.
 */
let ip = 0;
function freshIp() {
  return { 'x-forwarded-for': `203.0.113.${++ip}` };
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('STUDIO_INBOX', '');
  send.mockReset().mockResolvedValue({ error: null });
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_1' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_1' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
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
    expect((await POST(request(VALID, headers))).status).toBe(429);
  });
});
