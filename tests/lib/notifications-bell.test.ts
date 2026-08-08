import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bell, which decides what every staff member is told, and had no tests.
 *
 * It is polled on every admin page for every session, and it is the only
 * surface in the app whose entire job is to interrupt somebody. Writing the
 * first test for it turned up what an untested interrupt-generator turns up:
 * it was announcing the app's own messages as though a colleague had typed
 * them.
 *
 * `kind: 'system'` exists to stop exactly this. A system row is the app
 * narrating — a client approved their mockup, a cold email was opened, a
 * payment landed — and it carries a `fromUserId` only because the schema
 * wants an author and a cascade anchor. postSystemMessage fills that in with
 * the related lead's owner, or with whichever staff account findFirst
 * happened to return. The chat page knows this and draws those rows centred,
 * as timeline entries rather than speech. The bell read the same column as a
 * sender, so a client approving a mockup produced:
 *
 *     🚩 Kiana needs a response
 *     🎉 Vellum Studio approved their mockup. Send the proposal.
 *
 * — naming somebody who did nothing, about words she never wrote, asking for
 * a reply nobody is waiting for. What is waiting is a proposal.
 *
 * The other thing a first test finds: lib/team-chat says the shared unread
 * predicate exists because it was "hand-copied across the list route, the
 * unread-count route, and the notifications bell". Two of those three were
 * changed over. This one kept its copy, so the badge and the list it opens
 * were counted by two separately-maintained clauses.
 */

const prisma = {
  user: {
    findUnique: vi.fn(),
    /*
     * The route also looks up the outreach mailbox, to warn when the
     * auto-follow-up cron cannot run. Resolved to a fully connected account
     * here on purpose: these tests are about what the bell says when a
     * colleague writes or a lead replies, and an unconfigured mailbox would
     * add a setup warning to every one of their expectations.
     *
     * tests/lib/outreach-health.test.ts is where that check is actually
     * tested. This just has to model the call so the route does not throw —
     * a stub missing a method the route calls fails the whole handler in its
     * catch, which is how six tests here went red at once.
     */
    findFirst: vi.fn(),
  },
  teamMessage: { findMany: vi.fn() },
  lead: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_evan', email: 'e@bothmade.studio', role: 'sales' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { GET } = await import('@/app/api/admin/notifications/route');
// Imported after the mock, not at the top: lib/team-chat pulls in
// @/lib/prisma, and a static import evaluates it before the const the mock
// factory closes over exists.
const { unreadWhere } = await import('@/lib/team-chat');

interface Item {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: string;
}

const READ_AT = new Date('2026-08-01T09:00:00.000Z');

/** A chat row as the bell selects it. */
const message = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'msg_1',
  content: 'Can you take the Havisham call at 3?',
  kind: 'chat',
  fromUser: { name: 'Kiana', email: 'kiana@bothmade.studio' },
  ...over,
});

/**
 * The bell makes two teamMessage queries — casual first, flagged second —
 * and then several lead/project queries. This answers them in order.
 */
const withMessages = (casual: unknown[], flagged: unknown[]) => {
  prisma.teamMessage.findMany
    .mockResolvedValueOnce(casual)
    .mockResolvedValueOnce(flagged);
};

const ring = async (): Promise<Item[]> => {
  const res = await GET();
  const body = (await res.json()) as { items: Item[] };
  return body.items;
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ teamChatReadAt: READ_AT });
  // Set here, not on the stub: clearAllMocks() above wipes an implementation
  // attached at declaration, which left the outreach warning firing in the two
  // tests that assert an exact item count.
  prisma.user.findFirst.mockResolvedValue({
    email: 'kiana@bothmadestudio.com',
    gmailAddress: 'kiana@bothmadestudio.com',
    gmailAppPassword: 'encrypted',
    googleRefreshToken: null,
  });
  prisma.teamMessage.findMany.mockResolvedValue([]);
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.project.findMany.mockResolvedValue([]);
});

describe('what a colleague said', () => {
  it('names them, and links to the chat', async () => {
    withMessages([message()], []);

    const [item] = await ring();

    expect(item.label).toBe('Kiana messaged you');
    expect(item.detail).toContain('Havisham call');
    expect(item.href).toBe('/admin/team-chat');
    expect(item.severity).toBe('info');
  });

  it('falls back to an email address when a teammate has no name yet', async () => {
    withMessages([message({ fromUser: { name: null, email: 'sam@bothmade.studio' } })], []);

    const [item] = await ring();

    expect(item.label).toBe('sam@bothmade.studio messaged you');
  });

  it('says a flagged message needs a response', async () => {
    withMessages([], [message({ id: 'msg_2', content: 'Client is asking about the deposit — can you call?' })]);

    const [item] = await ring();

    expect(item.label).toBe('🚩 Kiana needs a response');
    expect(item.severity).toBe('urgent');
  });
});

describe('what the app said about itself', () => {
  /*
   * The bug, stated as the sentence it produced. A client approving their
   * mockup posts a system row, attributed to the lead's owner because the
   * column cannot be null — and the bell turned that into a colleague
   * flagging a colleague.
   */
  it('does not put the words in a teammate’s mouth', async () => {
    withMessages(
      [],
      [
        message({
          id: 'msg_sys',
          kind: 'system',
          content: '🎉 Vellum Studio approved their mockup. Send the proposal.',
          fromUser: { name: 'Kiana', email: 'kiana@bothmade.studio' },
        }),
      ]
    );

    const [item] = await ring();

    expect(item.label).not.toContain('Kiana');
    // And not "needs a response" either: nobody is waiting on a reply. What
    // is waiting is a proposal, which is what the line underneath says.
    expect(item.label).not.toMatch(/needs a response/);
    expect(item.label).toBe('🚩 Flagged in team chat');
    expect(item.detail).toContain('approved their mockup');
  });

  it('still rings — the announcement is the point, the byline was not', async () => {
    withMessages([message({ id: 'msg_sys2', kind: 'system', content: '💰 Payment received from Havisham Joinery.' })], []);

    const items = await ring();

    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('New in team chat');
    expect(items[0].detail).toContain('Payment received');
    expect(items[0].severity).toBe('info');
  });

  it('keeps a real teammate’s name on a real message in the same batch', async () => {
    withMessages(
      [
        message({ id: 'a', kind: 'system', content: '🔗 Bell Joinery tried an expired mockup link.' }),
        message({ id: 'b', content: 'Ringing them now.' }),
      ],
      []
    );

    const labels = (await ring()).map((i) => i.label);

    expect(labels).toEqual(['New in team chat', 'Kiana messaged you']);
  });
});

describe('which messages it looks at', () => {
  it('uses the shared unread predicate rather than its own copy', async () => {
    withMessages([], []);

    await ring();

    const casual = prisma.teamMessage.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    // The badge on this bell is counted by unread-count with exactly this
    // clause. Two hand-maintained copies is how a badge ends up right about
    // a number nobody can find.
    expect(casual.where).toEqual({ ...unreadWhere('user_evan', READ_AT), urgent: false });
  });

  it('shows everything when the chat has never been opened', async () => {
    prisma.user.findUnique.mockResolvedValue({ teamChatReadAt: null });
    withMessages([], []);

    await ring();

    const casual = prisma.teamMessage.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(casual.where).not.toHaveProperty('createdAt');
  });

  /*
   * Flagged rows are deliberately NOT filtered by teamChatReadAt: a flag
   * stays up until somebody resolves it, whether or not the chat has been
   * opened since. That is the difference between the two lists, and it is
   * worth pinning down so a later tidy-up does not "share" it away.
   */
  it('keeps a flag up after the chat has been read', async () => {
    withMessages([], []);

    await ring();

    const flagged = prisma.teamMessage.findMany.mock.calls[1][0] as { where: Record<string, unknown> };
    expect(flagged.where).toMatchObject({ urgent: true, resolved: false });
    expect(flagged.where).not.toHaveProperty('createdAt');
  });

  it('never announces my own messages back to me', async () => {
    withMessages([], []);

    await ring();

    for (const call of prisma.teamMessage.findMany.mock.calls) {
      const where = (call[0] as { where: { fromUserId?: unknown } }).where;
      expect(where.fromUserId).toEqual({ not: 'user_evan' });
    }
  });
});
