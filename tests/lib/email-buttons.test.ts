import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A button that renders and does nothing is worse than no button.
 *
 * The send went out looking finished — branded shell, gradient CTA, the lot —
 * and the one thing the recipient was meant to click did nothing. These
 * cover the three ways that happened: a link pasted without its scheme was
 * rejected outright and the button silently vanished from the markup, a
 * label with no usable link rendered as nothing at all with the send still
 * reported as successful, and the message itself carried no way to reach the
 * link if the button failed in the client.
 */

import { describeUrlProblem, normalizeUrl } from '@/lib/html';
import { parseAttachments, previewImageUrl, renderAttachments } from '@/lib/email-attachments';

const prisma = {
  user: { findUnique: vi.fn() },
  lead: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
  leadActivity: { create: vi.fn(async () => ({})) },
};
const sendAsUser =
  vi.fn<
    (
      sender: unknown,
      email: { to: string; subject: string; html: string },
      opts?: unknown
    ) => Promise<{ ok: boolean; sentVia: string }>
  >();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/mailer', () => ({ sendAsUser }));

const { renderShell } = await import('@/lib/email');
const { sendTemplatedEmail } = await import('@/lib/send-templated-email');

beforeEach(() => {
  vi.clearAllMocks();
  sendAsUser.mockResolvedValue({ ok: true, sentVia: 'delegated' });
  prisma.user.findUnique.mockResolvedValue({
    name: 'Evan Buoncristiano',
    email: 'evan@bothmade.studio',
    gmailAddress: null,
    gmailAppPassword: null,
    googleRefreshToken: null,
    avatarUrl: null,
  });
});

describe('normalizeUrl', () => {
  it('accepts a link pasted without its scheme, rather than dropping the button', () => {
    expect(normalizeUrl('bothmade.studio/mockups')).toBe('https://bothmade.studio/mockups');
    expect(normalizeUrl('www.loom.com/share/abc')).toBe('https://www.loom.com/share/abc');
  });

  it('leaves a link that already has one alone', () => {
    expect(normalizeUrl('https://drive.google.com/file/d/abc/view?usp=sharing')).toBe(
      'https://drive.google.com/file/d/abc/view?usp=sharing'
    );
  });

  it('still refuses anything that would put script behind a button', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeUrl('vbscript:msgbox')).toBeNull();
  });

  it('does not turn prose typed into a link box into a link', () => {
    expect(normalizeUrl('ask me for the file')).toBeNull();
    expect(normalizeUrl('evan@bothmade.studio')).toBeNull();
    expect(normalizeUrl('https://')).toBeNull();
  });
});

describe('describeUrlProblem', () => {
  it('says nothing about an empty box — that is not an error yet', () => {
    expect(describeUrlProblem('')).toBeNull();
    expect(describeUrlProblem('   ')).toBeNull();
  });

  it('flags a link that only resolves on the machine that composed the email', () => {
    expect(describeUrlProblem('http://localhost:3000/client/abc')).toMatch(/only works on this computer/i);
  });

  it('passes a real link', () => {
    expect(describeUrlProblem('drive.google.com/file/d/abc/view')).toBeNull();
  });
});

describe('renderShell CTA', () => {
  const shell = (ctaUrl?: string, ctaLabel = 'View Mockups') =>
    renderShell({ title: 'Your concepts', bodyHtml: '<p>Hi.</p>', ctaLabel, ctaUrl });

  it('links the button to the normalized URL, so a missing scheme still works', () => {
    expect(shell('bothmade.studio/brandon-roofing')).toContain('href="https://bothmade.studio/brandon-roofing"');
  });

  it('prints the link under the button, so a client that eats the button still leaves a way through', () => {
    const html = shell('https://bothmade.studio/brandon-roofing');

    expect(html).toContain('Button not working?');
    // Twice: once in the button, once in the fallback line.
    expect(html.match(/https:\/\/bothmade\.studio\/brandon-roofing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('carries a solid background behind the gradient, for clients that ignore gradients', () => {
    expect(shell('https://bothmade.studio')).toContain('bgcolor="#6f7ef0"');
  });

  /**
   * A mail app renders the body in a webview with nowhere to put a second
   * window, so a `_blank` navigation can be swallowed outright — a button
   * that looks perfect and does nothing when tapped. Webmail adds its own
   * target when it rewrites the link, so there is nothing to gain here.
   */
  it('asks for no new window, on the button or the attachment cards', () => {
    const html = renderShell({
      title: 'T',
      bodyHtml: '<p>Hi.</p>',
      attachmentsHtml: renderAttachments(
        parseAttachments([{ kind: 'pdf', label: 'Proposal', url: 'https://example.com/a.pdf' }])
      ),
      ctaLabel: 'View Mockups',
      ctaUrl: 'https://bothmade.studio',
    });

    expect(html).not.toContain('target=');
  });

  it('renders no button at all when there is no link to point it at', () => {
    const html = shell(undefined);

    expect(html).not.toContain('View Mockups');
    expect(html).not.toContain('Button not working?');
  });
});

describe('attachments', () => {
  it('keeps a PDF, a picture and a link, and drops a row with no usable link', () => {
    const parsed = parseAttachments([
      { kind: 'pdf', label: 'Proposal', url: 'drive.google.com/file/d/abc123defg/view' },
      { kind: 'image', label: 'Concept A', url: 'https://cdn.example.com/a.png' },
      { kind: 'link', label: 'Live concept', url: 'https://bothmade.studio/brandon-roofing' },
      { kind: 'pdf', label: 'Nothing behind this', url: 'not a link' },
    ]);

    expect(parsed.map((a) => a.label)).toEqual(['Proposal', 'Concept A', 'Live concept']);
    expect(parsed[0].url).toBe('https://drive.google.com/file/d/abc123defg/view');
  });

  it('falls back to a sensible button label rather than an empty button', () => {
    const [attachment] = parseAttachments([{ kind: 'pdf', url: 'https://example.com/a.pdf' }]);

    expect(attachment.label).toBe('View the PDF');
  });

  it('refuses a kind it does not know instead of trusting it into the markup', () => {
    const [attachment] = parseAttachments([
      { kind: '"><script>', label: 'X', url: 'https://example.com' },
    ]);

    expect(attachment.kind).toBe('link');
  });

  it('shows a Drive picture inline by way of the thumbnail endpoint', () => {
    expect(previewImageUrl('https://drive.google.com/file/d/1A2b3C4d5E6f/view?usp=sharing')).toBe(
      'https://drive.google.com/thumbnail?id=1A2b3C4d5E6f&sz=w1000'
    );
    expect(previewImageUrl('https://cdn.example.com/shot.jpg')).toBe('https://cdn.example.com/shot.jpg');
    // A page, not pixels — link to it, don't try to render it.
    expect(previewImageUrl('https://bothmade.studio/brandon-roofing')).toBeNull();
  });

  it('renders each attachment as its own tappable button, label and pill alike', () => {
    const html = renderAttachments(
      parseAttachments([{ kind: 'pdf', label: 'Proposal', url: 'https://example.com/a.pdf' }])
    );

    expect(html).toContain('Attached');
    expect(html).toContain('>Proposal</a>');
    expect(html.match(/href="https:\/\/example\.com\/a\.pdf"/g)).toHaveLength(2);
  });

  it('escapes a label rather than letting it close the markup around it', () => {
    const html = renderAttachments(
      parseAttachments([{ kind: 'link', label: '</a><script>x</script>', url: 'https://example.com' }])
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('leaves nothing behind when there is nothing attached', () => {
    expect(renderAttachments([])).toBe('');
    expect(renderAttachments(parseAttachments(undefined))).toBe('');
  });
});

describe('sendTemplatedEmail', () => {
  const base = {
    senderId: 'u1',
    templateId: 'custom',
    to: 'client@example.com',
    toName: 'Brandon',
    company: 'Brandon Roofing',
  };

  it('refuses to send a button that has a label and no link it can use', async () => {
    const result = await sendTemplatedEmail({
      ...base,
      fields: { headline: 'A note from Bothmade', subject: 'Your concepts', body: 'Have a look.', ctaLabel: 'View Mockups', ctaUrl: '' },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no link/i);
    expect(sendAsUser).not.toHaveBeenCalled();
  });

  it('names the button when the link is there but unusable', async () => {
    const result = await sendTemplatedEmail({
      ...base,
      fields: { headline: 'A note from Bothmade', subject: 'S', body: 'B', ctaLabel: 'View Mockups', ctaUrl: 'ask me for it' },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('View Mockups');
    expect(sendAsUser).not.toHaveBeenCalled();
  });

  it('sends a button whose link was pasted without its scheme', async () => {
    const result = await sendTemplatedEmail({
      ...base,
      fields: { headline: 'A note from Bothmade', subject: 'S', body: 'B', ctaLabel: 'View Mockups', ctaUrl: 'bothmade.studio/brandon-roofing' },
    });

    expect(result.ok).toBe(true);
    expect(sendAsUser.mock.calls[0][1].html).toContain('href="https://bothmade.studio/brandon-roofing"');
  });

  it('carries attachments into the email as buttons, on a template that has no fields of its own', async () => {
    const result = await sendTemplatedEmail({
      ...base,
      templateId: 'followup_1',
      attachments: [{ kind: 'pdf', label: 'Both concepts', url: 'https://drive.google.com/file/d/abc123defg/view' }],
    });

    expect(result.ok).toBe(true);
    const html = sendAsUser.mock.calls[0][1].html;
    expect(html).toContain('Both concepts');
    // Routed through our own domain rather than straight at Drive — see
    // tests/lib/email-drive-links.test.ts for why a Drive link cannot be
    // tapped on a phone.
    expect(html).toContain('/l/drive/file/abc123defg');
  });
});

/**
 * The concept is built and not published. The email that carries it must not
 * point anywhere — what the client gets is a video and two PDFs, and the
 * failure mode is a rep who remembers the first attachment and forgets the
 * second.
 */
describe('the concept delivery template', () => {
  it('lays the attachment rows out before anybody has to remember them', async () => {
    const { EMAIL_TEMPLATES } = await import('@/lib/email-templates');
    const template = EMAIL_TEMPLATES.find((t) => t.id === 'concept_delivery');

    expect(template).toBeDefined();
    // More than one PDF: the brochure and the full-size screens are separate
    // files, and dropping one of them is the easiest mistake in this send.
    expect(template?.starterAttachments?.filter((a) => a.kind === 'pdf')).toHaveLength(2);
    expect(template?.starterAttachments?.some((a) => a.kind === 'link')).toBe(true);
    // Labelled, so a row left blank is obviously a row left blank.
    for (const starter of template?.starterAttachments ?? []) {
      expect(starter.label.length).toBeGreaterThan(0);
    }
  });

  it('sends nobody to a concept that is not published', async () => {
    const { EMAIL_TEMPLATES } = await import('@/lib/email-templates');
    const template = EMAIL_TEMPLATES.find((t) => t.id === 'concept_delivery');
    const built = template?.build({
      recipientName: 'Tony',
      company: 'Monogram Custom Builders',
      senderName: 'Evan Buoncristiano',
      fields: { observation: 'Two divisions, one doorway.', senderTitle: 'Director of Sales' },
    });

    expect(built?.bodyHtml).toContain('attached');
    expect(built?.bodyHtml).toMatch(/not published/);
    expect(built?.bodyHtml).not.toMatch(/bothmade\.studio\/|https?:\/\//);
    // The client owns the direction, and the email has to say so.
    expect(built?.bodyHtml).toMatch(/yours to change/);
  });
});

/**
 * The mockup email used to be the same email for everybody: "we've built
 * something for you, have a click around." The single most persuasive
 * sentence we hold about a prospect — the researched line saying why anyone
 * built them anything — sat unused on the lead record while the send went out
 * generic.
 */
describe('the mockup email', () => {
  /**
   * The body is built here rather than tested through a send, because the
   * send fans out across delegated Gmail, per-user OAuth, an app password
   * and Resend — four transports, none of which this is about.
   */
  const bodyOf = async (observation: string | null) => {
    const { mockupEmailBody } = await import('@/lib/email');
    return mockupEmailBody({ company: 'Monogram Custom Builders', contactName: 'Tony', observation });
  };

  it('opens with what was noticed about this business', async () => {
    const html = await bodyOf('A doorway that asks people to choose Homes or Pools before it says who you are.');

    expect(html).toContain('What prompted it');
    expect(html).toContain('choose Homes or Pools');
  });

  /**
   * A heading with nothing under it is worse than no heading — which is
   * exactly what the composer preview showed the first time the concept
   * template went out with the observation box left empty.
   */
  it('prints no heading at all when nothing was noticed', async () => {
    for (const observation of [null, '', '   ']) {
      expect(await bodyOf(observation)).not.toContain('What prompted it');
    }
  });

  it('escapes an observation rather than letting it close the markup', async () => {
    expect(await bodyOf('</p><script>x</script>')).not.toContain('<script>');
  });

  it('does the same in the concept template, rather than a dangling heading', async () => {
    const { EMAIL_TEMPLATES } = await import('@/lib/email-templates');
    const template = EMAIL_TEMPLATES.find((t) => t.id === 'concept_delivery');
    const ctx = {
      recipientName: 'Tony',
      company: 'Monogram Custom Builders',
      senderName: 'Evan Buoncristiano',
    };

    expect(template?.build({ ...ctx, fields: { observation: '  ' } }).bodyHtml).not.toContain(
      'What prompted it'
    );
    expect(
      template?.build({ ...ctx, fields: { observation: 'Two divisions, one doorway.' } }).bodyHtml
    ).toContain('What prompted it');
  });
});
