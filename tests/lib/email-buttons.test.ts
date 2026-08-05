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
