import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The page a client actually watches.
 *
 * It needs no password, it is the link that got emailed, and it is where
 * somebody has been checking progress for six weeks. Two things about it are
 * worth holding onto.
 *
 * THE GAP. It carried a client from Discovery all the way to Complete and
 * then, at the moment the work was finished, said "Complete" and pointed at
 * nothing. `liveUrl` is described in the schema as what powers the "your
 * project is live" delivery moment — and it did, on the logged-in dashboard,
 * which is not the page they were looking at. The public endpoint never sent
 * it.
 *
 * THE RULE THAT CANNOT BREAK. The project id alone proves nothing. A wrong or
 * missing token must 404 exactly like an unknown project, or the id becomes
 * the credential and every client's status is one guess apart.
 */

const projectFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: { project: { findUnique: (...a: unknown[]) => projectFindUnique(...a) } } }));
vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { publicRead: { max: 60, windowMs: 600000 } },
  enforceRateLimit: async () => null,
}));

const { GET } = await import('@/app/api/public/projects/[projectId]/status/route');

const TOKEN = 'a'.repeat(64);
const PROJECT = {
  id: 'proj_1',
  name: 'Linpotia Dental — Site & Booking',
  shareToken: TOKEN,
  statusStage: 4,
  estimatedCompletionDate: new Date('2026-08-28T00:00:00.000Z'),
  liveUrl: 'https://linpotia.example',
  designPresentedAt: null,
  designApprovedAt: null,
  designReviewEndsAt: null,
  client: { company: 'Linpotia Dental' },
  updates: [],
};

const request = (token: string | null) =>
  ({
    nextUrl: new URL(`http://t/api/public/projects/proj_1/status${token === null ? '' : `?t=${token}`}`),
    headers: new Headers(),
    url: `http://t/api/public/projects/proj_1/status${token === null ? '' : `?t=${token}`}`,
  }) as Parameters<typeof GET>[0];

const params = Promise.resolve({ projectId: 'proj_1' });

beforeEach(() => {
  projectFindUnique.mockReset().mockResolvedValue(PROJECT);
});

describe('the finished site', () => {
  it('reaches the client once there is one', async () => {
    const body = await (await GET(request(TOKEN), { params })).json();

    expect(body.success).toBe(true);
    expect(body.project.liveUrl).toBe('https://linpotia.example');
  });

  it('is null while there is nothing to point at, rather than absent', async () => {
    // Null rather than undefined so the page can tell "not finished" from
    // "the field was never sent" — the state it was stuck in before.
    projectFindUnique.mockResolvedValue({ ...PROJECT, liveUrl: null, statusStage: 2 });

    const body = await (await GET(request(TOKEN), { params })).json();

    expect(body.project.liveUrl).toBeNull();
  });
});

describe('what the token protects', () => {
  it('404s a wrong token exactly like an unknown project', async () => {
    const res = await GET(request('b'.repeat(64)), { params });

    expect(res.status).toBe(404);
  });

  it('404s when no token is given at all', async () => {
    const res = await GET(request(null), { params });

    expect(res.status).toBe(404);
  });

  it('says nothing about the project in a refusal', async () => {
    const res = await GET(request('b'.repeat(64)), { params });
    const body = JSON.stringify(await res.json());

    // Not the name, not the company, and above all not the real token.
    expect(body).not.toContain('Linpotia');
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain('linpotia.example');
  });

  it('never returns the share token to anybody, even on success', async () => {
    const body = JSON.stringify(await (await GET(request(TOKEN), { params })).json());

    expect(body).not.toContain(TOKEN);
  });
});

/**
 * Whether the project is waiting on them.
 *
 * A presented, unapproved design is the one state where nothing moves until
 * the client acts — and this page, the page they actually check, said nothing
 * about it. The date matters as much as the fact: silence becomes approval
 * after the window in Section 7, and a term they agreed to should not be met
 * for the first time on an invoice.
 */
describe('waiting on the client', () => {
  const presented = {
    ...PROJECT,
    statusStage: 1,
    designPresentedAt: new Date('2026-08-01T00:00:00.000Z'),
    designReviewEndsAt: new Date('2026-08-08T00:00:00.000Z'),
    designApprovedAt: null,
  };

  it('says so while a design is presented and unapproved', async () => {
    projectFindUnique.mockResolvedValue(presented);

    const body = await (await GET(request(TOKEN), { params })).json();

    expect(body.project.awaitingYourReview).not.toBeNull();
    expect(body.project.awaitingYourReview.reviewEndsAt).toBeTruthy();
  });

  it('stops the moment they approve, so the page cannot nag about a decision already made', async () => {
    projectFindUnique.mockResolvedValue({
      ...presented,
      designApprovedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    const body = await (await GET(request(TOKEN), { params })).json();

    expect(body.project.awaitingYourReview).toBeNull();
  });

  it('says nothing before a design has been sent', async () => {
    projectFindUnique.mockResolvedValue({ ...presented, designPresentedAt: null });

    const body = await (await GET(request(TOKEN), { params })).json();

    expect(body.project.awaitingYourReview).toBeNull();
  });
});
