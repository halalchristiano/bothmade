import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The confirmations a client gets for something they just did.
 *
 * Several routes recorded a client's action perfectly and told nobody but us:
 * the brief form wrote to the lead and sent no mail at all, onboarding had no
 * completion moment to announce, and a signed change order emailed the studio
 * while the person who signed it got nothing. Each of those is invisible from
 * the inside — the data is right, the dashboard is right, and the only symptom
 * is a client who assumes the form was broken and does it again.
 *
 * So these assert the outbound side specifically: that the client is told,
 * that the studio is told, and — for onboarding, which has no submit button
 * and therefore fires off a derived condition — that they are told exactly
 * once.
 */

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const leadActivityCreate = vi.fn();

const projectFindUnique = vi.fn();
const clientFindUnique = vi.fn();
const questionFindUnique = vi.fn();
const questionCount = vi.fn();
const responseUpsert = vi.fn();
const responseCount = vi.fn();
const projectUpdateFindFirst = vi.fn();
const projectUpdateCreate = vi.fn();

/** Stand-in for the `rate_limits` table, so the limiter takes its real path. */
const rateLimitRows = new Map<string, { count: number; windowStart: Date }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => leadFindUnique(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => leadActivityCreate(...args) },
    project: { findUnique: (...args: unknown[]) => projectFindUnique(...args) },
    client: { findUnique: (...args: unknown[]) => clientFindUnique(...args) },
    onboardingQuestion: {
      findUnique: (...args: unknown[]) => questionFindUnique(...args),
      count: (...args: unknown[]) => questionCount(...args),
    },
    onboardingResponse: {
      upsert: (...args: unknown[]) => responseUpsert(...args),
      count: (...args: unknown[]) => responseCount(...args),
    },
    projectUpdate: {
      findFirst: (...args: unknown[]) => projectUpdateFindFirst(...args),
      create: (...args: unknown[]) => projectUpdateCreate(...args),
    },
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

const sendBriefReceivedEmail = vi.fn();
const sendOnboardingCompleteEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendBriefReceivedEmail: (...args: unknown[]) => sendBriefReceivedEmail(...args),
  sendOnboardingCompleteEmail: (...args: unknown[]) => sendOnboardingCompleteEmail(...args),
}));

const notifyBriefFormCompleted = vi.fn();
const notifyAdminsOnboardingComplete = vi.fn();
vi.mock('@/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notify')>()),
  notifyBriefFormCompleted: (...args: unknown[]) => notifyBriefFormCompleted(...args),
  notifyAdminsOnboardingComplete: (...args: unknown[]) => notifyAdminsOnboardingComplete(...args),
}));

/** A logged-in client, which is what the onboarding form posts as. */
const principal = { type: 'client' as const, clientId: 'client-1' };
vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requirePrincipal: async () => ({ session: principal, response: null }),
}));

const { POST: briefPost } = await import('@/app/api/public/brief/[token]/route');
const { POST: onboardingPost } = await import('@/app/api/projects/[projectId]/onboarding/route');

function request(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof briefPost>[0];
}

/** A distinct token per test, so the per-key rate limiter never bleeds across. */
let tokenSeq = 0;
function freshToken(): string {
  tokenSeq += 1;
  return `token-${tokenSeq}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitRows.clear();

  leadUpdate.mockResolvedValue({});
  leadActivityCreate.mockResolvedValue({});
  sendBriefReceivedEmail.mockResolvedValue({ sent: true });
  notifyBriefFormCompleted.mockResolvedValue(undefined);

  responseUpsert.mockResolvedValue({ id: 'response-1' });
  projectUpdateCreate.mockResolvedValue({});
  sendOnboardingCompleteEmail.mockResolvedValue({ sent: true });
  notifyAdminsOnboardingComplete.mockResolvedValue(undefined);
});

describe('the brief form', () => {
  const LEAD = {
    id: 'lead-1',
    painPoints: '',
    email: 'owner@example.com',
    contactName: 'Dana Okafor',
    company: 'Okafor Plumbing',
    assignedTo: { email: 'evan@bothmade.studio' },
  };

  const SUBMISSION = { problems: ['slow-site', 'not-mobile-friendly'], extra: 'We lose calls.' };

  it('sends the person who filled it in a receipt', async () => {
    leadFindUnique.mockResolvedValue(LEAD);

    const response = await briefPost(request(SUBMISSION), {
      params: Promise.resolve({ token: freshToken() }),
    });

    expect(response.status).toBe(200);
    expect(sendBriefReceivedEmail).toHaveBeenCalledTimes(1);
    expect(sendBriefReceivedEmail.mock.calls[0][0]).toMatchObject({
      toEmail: 'owner@example.com',
      contactName: 'Dana Okafor',
      company: 'Okafor Plumbing',
      answeredCount: 2,
    });
  });

  it('puts the receipt on the lead timeline, so a rep can see it was sent', async () => {
    leadFindUnique.mockResolvedValue(LEAD);

    await briefPost(request(SUBMISSION), { params: Promise.resolve({ token: freshToken() }) });

    const contents = leadActivityCreate.mock.calls.map((call) => call[0].data.content as string);
    expect(contents.some((line) => line.includes('sent the receipt for their brief'))).toBe(true);
  });

  it('cues the assigned rep rather than leaving the brief to be noticed', async () => {
    leadFindUnique.mockResolvedValue(LEAD);

    await briefPost(request(SUBMISSION), { params: Promise.resolve({ token: freshToken() }) });

    expect(notifyBriefFormCompleted).toHaveBeenCalledTimes(1);
    expect(notifyBriefFormCompleted.mock.calls[0][0]).toMatchObject({
      toEmail: 'evan@bothmade.studio',
      leadId: 'lead-1',
      company: 'Okafor Plumbing',
      problemCount: 2,
    });
  });

  it('falls back to the admins when nobody owns the lead', async () => {
    leadFindUnique.mockResolvedValue({ ...LEAD, assignedTo: null });

    await briefPost(request(SUBMISSION), { params: Promise.resolve({ token: freshToken() }) });

    expect(notifyBriefFormCompleted.mock.calls[0][0]).toMatchObject({ toEmail: null });
  });

  it('still records the brief when the lead has no address to reply to', async () => {
    leadFindUnique.mockResolvedValue({ ...LEAD, email: null });

    const response = await briefPost(request(SUBMISSION), {
      params: Promise.resolve({ token: freshToken() }),
    });

    expect(response.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalled();
    expect(sendBriefReceivedEmail).not.toHaveBeenCalled();
    // The rep is still told: a brief with no address is exactly the one
    // somebody needs to chase by phone.
    expect(notifyBriefFormCompleted).toHaveBeenCalledTimes(1);
  });

  it('does not fail the submission when the receipt bounces', async () => {
    leadFindUnique.mockResolvedValue(LEAD);
    sendBriefReceivedEmail.mockRejectedValue(new Error('Resend is down'));

    const response = await briefPost(request(SUBMISSION), {
      params: Promise.resolve({ token: freshToken() }),
    });

    // Their answers are saved. Showing an error here is how a form gets
    // filled in twice.
    expect(response.status).toBe(200);
    const contents = leadActivityCreate.mock.calls.map((call) => call[0].data.content as string);
    expect(contents.some((line) => line.includes('did not send'))).toBe(true);
  });
});

describe('finishing onboarding', () => {
  const PROJECT = { id: 'project-1', clientId: 'client-1', name: 'Okafor Plumbing Site', status: 1 };
  const CLIENT = {
    email: 'owner@example.com',
    contactName: 'Dana Okafor',
    company: 'Okafor Plumbing',
  };

  function answer() {
    return onboardingPost(request({ questionId: 'q-3', answer: 'Weekdays, 9 to 5.' }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    }) as unknown as Promise<Response>;
  }

  beforeEach(() => {
    projectFindUnique.mockResolvedValue(PROJECT);
    clientFindUnique.mockResolvedValue(CLIENT);
    questionFindUnique.mockResolvedValue({ id: 'q-3', projectId: 'project-1' });
  });

  it('says nothing while questions are still outstanding', async () => {
    questionCount.mockResolvedValue(5);
    responseCount.mockResolvedValue(3);

    const response = await answer();

    expect(response.status).toBe(200);
    expect(sendOnboardingCompleteEmail).not.toHaveBeenCalled();
    expect(notifyAdminsOnboardingComplete).not.toHaveBeenCalled();
  });

  it('tells both sides when the last answer lands', async () => {
    questionCount.mockResolvedValue(5);
    responseCount.mockResolvedValue(5);
    projectUpdateFindFirst.mockResolvedValue(null);

    await answer();

    expect(sendOnboardingCompleteEmail).toHaveBeenCalledTimes(1);
    expect(sendOnboardingCompleteEmail.mock.calls[0][0]).toMatchObject({
      toEmail: 'owner@example.com',
      projectName: 'Okafor Plumbing Site',
      questionCount: 5,
    });
    expect(notifyAdminsOnboardingComplete).toHaveBeenCalledTimes(1);
  });

  it('marks the timeline before mailing, so the marker is what stops a repeat', async () => {
    questionCount.mockResolvedValue(2);
    responseCount.mockResolvedValue(2);
    projectUpdateFindFirst.mockResolvedValue(null);

    await answer();

    expect(projectUpdateCreate).toHaveBeenCalledTimes(1);
    expect(projectUpdateCreate.mock.calls[0][0].data).toMatchObject({
      projectId: 'project-1',
      title: 'Onboarding complete',
    });
  });

  it('stays quiet when an answer is edited after the set was already complete', async () => {
    questionCount.mockResolvedValue(2);
    responseCount.mockResolvedValue(2);
    // The marker from the first completion is already on the timeline.
    projectUpdateFindFirst.mockResolvedValue({ id: 'update-1' });

    const response = await answer();

    expect(response.status).toBe(200);
    expect(projectUpdateCreate).not.toHaveBeenCalled();
    expect(sendOnboardingCompleteEmail).not.toHaveBeenCalled();
    expect(notifyAdminsOnboardingComplete).not.toHaveBeenCalled();
  });

  it('saves the answer even if the completion check falls over', async () => {
    questionCount.mockRejectedValue(new Error('database hiccup'));

    const response = await answer();

    // The answer is the thing this route owes the client; the announcement
    // is a bonus that must not take it down.
    expect(response.status).toBe(200);
    expect(responseUpsert).toHaveBeenCalledTimes(1);
  });

  it('does not announce a project that has no questions yet', async () => {
    questionCount.mockResolvedValue(0);
    responseCount.mockResolvedValue(0);

    await answer();

    expect(sendOnboardingCompleteEmail).not.toHaveBeenCalled();
  });
});
