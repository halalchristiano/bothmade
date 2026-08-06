import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Nothing leaves this application without somebody seeing it first.
 *
 * Two emails have gone out wrong that a two-second look would have caught: a
 * follow-up signed by the wrong person, and a draft still carrying "(add the
 * two or three things you discussed)". Neither was a hard bug. There was just
 * nothing between the button and the send.
 *
 * These hold the two halves of the guard that fixes it — that every send
 * route is recognised as one, and that building a preview cannot itself send
 * anything.
 */

import { SEND_ROUTES, sendRouteFor } from '@/lib/email-send-routes';
import { captureForPreview, composeOnly, composing } from '@/lib/email-preview';

describe('which requests are held back', () => {
  /**
   * The list is the guarantee. A send route missing from it goes out on one
   * click, and the way anyone finds out is a client receiving something.
   */
  it('recognises every send route in the admin', () => {
    const shouldStop = [
      '/api/admin/leads/lead_1/send-mockup',
      '/api/admin/leads/lead_1/mockups/mk_2/send',
      '/api/admin/leads/lead_1/follow-up',
      '/api/admin/leads/lead_1/activity',
      '/api/admin/leads/lead_1/proposal',
      '/api/admin/leads/lead_1/invoice',
      '/api/admin/email/send',
      '/api/admin/email/send-bulk',
      '/api/admin/email/send-cold-drafts',
      '/api/admin/broadcast',
      '/api/admin/clients/c_1/broadcast',
      '/api/admin/projects/p_1/message',
      '/api/admin/projects/p_1/status',
      '/api/admin/projects/p_1/instalments',
      '/api/admin/projects/p_1/payment-reminder',
      '/api/admin/projects/p_1/design-review',
      '/api/admin/projects/p_1/recurring',
      '/api/admin/projects/create',
      '/api/admin/recurring/o_1',
      '/api/admin/change-orders/co_1',
      '/api/admin/billing/charges',
      '/api/admin/billing/invoices/inv_1/void',
      '/api/admin/billing/invoices/inv_1/refund',
    ];

    for (const path of shouldStop) {
      expect(sendRouteFor(path, 'POST'), path).not.toBeNull();
    }
  });

  /**
   * The other half. A dialog in front of things that send nothing is a dialog
   * people learn to click through without reading, which costs more than it
   * saves.
   */
  it('lets everything that does not send an email straight through', () => {
    const shouldPass = [
      '/api/admin/leads/lead_1',
      '/api/admin/leads/lead_1/mockups',
      '/api/admin/leads/mockup-queue',
      '/api/admin/leads/lead_1/notes',
      '/api/admin/projects/p_1',
      '/api/admin/email/preview',
      '/api/auth/me',
    ];

    for (const path of shouldPass) {
      expect(sendRouteFor(path, 'POST'), path).toBeNull();
    }
  });

  it('ignores reads — a GET never sends anything', () => {
    expect(sendRouteFor('/api/admin/leads/lead_1/send-mockup', 'GET')).toBeNull();
    expect(sendRouteFor('/api/admin/leads/lead_1/send-mockup', 'DELETE')).toBeNull();
  });

  it('matches however the URL was written', () => {
    expect(sendRouteFor('https://bothmade.studio/api/admin/email/send', 'POST')).not.toBeNull();
    expect(sendRouteFor('/api/admin/email/send?draft=1', 'POST')).not.toBeNull();
    expect(sendRouteFor('/api/admin/email/send', 'post')).not.toBeNull();
  });

  /** The dialog names the action. An unlabelled "are you sure?" tells nobody anything. */
  it('says what is about to happen, in every case', () => {
    for (const spec of SEND_ROUTES) {
      expect(spec.action.length, spec.match.source).toBeGreaterThan(10);
      expect(spec.action).not.toMatch(/^(send|do)$/i);
    }
  });
});

describe('building a preview', () => {
  it('collects the message instead of sending it', async () => {
    const captured = await composeOnly(async () => {
      captureForPreview({ to: ['sam@example.com'], subject: 'Hello', html: '<p>Hi</p>' });
    });

    expect(captured).toEqual([{ to: ['sam@example.com'], subject: 'Hello', html: '<p>Hi</p>' }]);
  });

  /**
   * The senders check this before they touch Gmail, Resend or the database.
   * Outside a preview it must be false, or every real send in the
   * application quietly stops happening.
   */
  it('is off unless something is actually previewing', () => {
    expect(composing()).toBe(false);
    expect(captureForPreview({ to: ['a@b.com'], subject: 'x', html: 'y' })).toBe(false);
  });

  it('does not leak into anything running after it', async () => {
    await composeOnly(async () => {
      expect(composing()).toBe(true);
    });

    expect(composing()).toBe(false);
  });

  it('keeps every message when one action sends several', async () => {
    const captured = await composeOnly(async () => {
      captureForPreview({ to: ['one@example.com'], subject: 'A', html: '<p>a</p>' });
      captureForPreview({ to: ['two@example.com'], subject: 'B', html: '<p>b</p>' });
    });

    expect(captured.map((m) => m.subject)).toEqual(['A', 'B']);
  });
});

describe('the senders, while a preview is running', () => {
  /**
   * The point of intercepting at the transport rather than in each route:
   * whatever a send function does to compose a message, the bytes handed over
   * are the bytes that would have been transmitted. There is no second
   * template that can drift out of step with the real one.
   */
  it('hands over exactly what would have gone out, and transmits nothing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { sendMockupEmail } = await import('@/lib/email');

    const captured = await composeOnly(() =>
      sendMockupEmail({
        toEmail: 'lauren@roofingltd.example',
        contactName: 'Lauren Hayes',
        company: 'Roofing LTD',
        viewUrl: 'https://bothmade.studio/m/tok',
        observation: 'Two divisions, one doorway.',
      })
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].to).toEqual(['lauren@roofingltd.example']);
    expect(captured[0].subject).toContain('Roofing LTD');
    expect(captured[0].html).toContain('Lauren');
    expect(captured[0].html).toContain('Two divisions, one doorway.');
    vi.unstubAllEnvs();
  });

  /**
   * A preview reports success so that callers which branch on the result
   * behave as they would on a real send — otherwise the operator is shown the
   * failure copy for an email nobody has sent yet.
   */
  it('reports success, so a caller behaves as it would on a real send', async () => {
    const { sendMockupEmail } = await import('@/lib/email');
    let result: unknown;

    await composeOnly(async () => {
      result = await sendMockupEmail({
        toEmail: 'lauren@roofingltd.example',
        contactName: null,
        company: 'Roofing LTD',
        viewUrl: 'https://bothmade.studio/m/tok',
      });
    });

    expect(result).toEqual({ sent: true });
  });
});

describe('the endpoints that only sometimes send', () => {
  /**
   * Logging a phone call and emailing a lead are one endpoint. A dialog in
   * front of logging a call is a dialog somebody meets twenty times a day for
   * no reason — and one they will stop reading, including on the send that
   * mattered.
   */
  it('does not stop somebody logging a call', () => {
    const path = '/api/admin/leads/lead_1/activity';

    expect(sendRouteFor(path, 'POST', { type: 'call', content: 'Rang, no answer' })).toBeNull();
    expect(sendRouteFor(path, 'POST', { type: 'email', sendEmailNow: false })).toBeNull();
    expect(sendRouteFor(path, 'POST', { type: 'email', sendEmailNow: true })).not.toBeNull();
  });

  it('does not stop a proposal being built without being emailed', () => {
    const path = '/api/admin/leads/lead_1/proposal';

    expect(sendRouteFor(path, 'POST', { sendEmail: false })).toBeNull();
    expect(sendRouteFor(path, 'POST', { sendEmail: true })).not.toBeNull();
  });

  it('does not stop a change order being withdrawn', () => {
    const path = '/api/admin/change-orders/co_1';

    expect(sendRouteFor(path, 'POST', { action: 'withdraw' })).toBeNull();
    expect(sendRouteFor(path, 'POST', { action: 'send' })).not.toBeNull();
  });

  /**
   * The guard asks twice: once on the path alone, to decide whether a body is
   * even worth parsing, and again once it has one. If the first question
   * already applied the body condition it would answer "not a send" for every
   * conditional route — there is no body yet to judge — and the guard would
   * wave through the one email that endpoint does send. So a path-only ask
   * has to say yes, and only the second ask decides.
   */
  it('still recognises a conditional route before the body has been read', () => {
    expect(sendRouteFor('/api/admin/leads/lead_1/activity', 'POST')).not.toBeNull();
    expect(sendRouteFor('/api/admin/leads/lead_1/proposal', 'POST')).not.toBeNull();
    expect(sendRouteFor('/api/admin/change-orders/co_1', 'POST')).not.toBeNull();
  });

  /** With a body but nothing in it that says "send", it is not a send. */
  it('lets an empty body through on a route that only sometimes sends', () => {
    expect(sendRouteFor('/api/admin/leads/lead_1/activity', 'POST', {})).toBeNull();
  });
});

describe('asking for a mockup', () => {
  const path = '/api/admin/leads/lead_1';

  /**
   * A mockup request now emails whoever builds them. It shares an endpoint
   * with every other edit to a lead, so only the request itself stops.
   */
  it('stops on the request, and on nothing else that endpoint does', () => {
    expect(sendRouteFor(path, 'PATCH', { mockupRequested: true })).not.toBeNull();

    expect(sendRouteFor(path, 'PATCH', { mockupFolderUrl: 'https://drive…' })).toBeNull();
    expect(sendRouteFor(path, 'PATCH', { status: 'qualified' })).toBeNull();
    expect(sendRouteFor(path, 'PATCH', { mockupRequested: false })).toBeNull();
  });

  it('is a PATCH — the POST on that path is something else entirely', () => {
    expect(sendRouteFor(path, 'PATCH')).not.toBeNull();
    expect(sendRouteFor(path, 'POST')).toBeNull();
  });
});

describe('the rest of the chain', () => {
  /**
   * Two steps in the engagement sent the client nothing at all, and both were
   * found by walking the chain rather than by anybody complaining.
   *
   * The launch — the one unambiguously good email in the whole engagement —
   * lit up a delivery moment on the dashboard and told nobody. And the design
   * brief, which is a Client Dependency under Section 6, was offered on their
   * dashboard and never asked for, so a project could sit waiting on a form
   * the client did not know existed.
   */
  it('stops on the launch announcement, and on nothing else that endpoint saves', () => {
    const path = '/api/projects/proj_1';

    expect(sendRouteFor(path, 'PATCH', { liveUrl: 'https://northgatedental.com' })).not.toBeNull();
    expect(sendRouteFor(path, 'PATCH', { name: 'Renamed' })).toBeNull();
    expect(sendRouteFor(path, 'PATCH', { liveUrl: '' })).toBeNull();
    expect(sendRouteFor(path, 'PATCH', { timeline: '8 weeks' })).toBeNull();
  });

  it('stops on asking a client for their design brief', () => {
    expect(sendRouteFor('/api/admin/projects/proj_1/design-brief-request', 'POST')).not.toBeNull();
  });

  /** Every named preview kind has to be one the endpoint can actually build. */
  it('names only previews the endpoint knows how to build', async () => {
    const source = await readFile('app/api/admin/email/preview/route.ts', 'utf8');

    for (const spec of SEND_ROUTES) {
      if (!spec.preview) continue;
      expect(source, `no preview builder for "${spec.preview}"`).toContain(`case '${spec.preview}'`);
    }
  });
});

/**
 * The server's email stack must not follow a type into the browser.
 *
 * lib/email.ts pulls in Resend, the Gmail transports and node:async_hooks. A
 * client component that imports so much as a type name from it drags all of
 * that into the browser bundle, and Turbopack fails the build with two dozen
 * errors from inside google-auth-library — none of which name the import that
 * caused them. That happened, and the fix was a dependency-free module both
 * sides can share.
 */
describe('what the browser is allowed to import', () => {
  it('keeps lib/email out of every client component', async () => {
    const { execSync } = await import('node:child_process');
    const files = execSync(
      "grep -rl \"^'use client'\" app components --include=*.tsx --include=*.ts || true",
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);

    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (/from ['"]@\/lib\/email['"]/.test(source)) offenders.push(file);
    }

    expect(offenders, 'these would drag Resend and node:async_hooks into the browser').toEqual([]);
  });
});
