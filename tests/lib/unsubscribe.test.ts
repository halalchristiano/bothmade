import { describe, it, expect } from 'vitest';
import { unsubscribeLinks } from '@/lib/unsubscribe';
import { encodeMimeMessage } from '@/lib/gmail-mime';
import { renderShell } from '@/lib/email';

/**
 * The cold email had no way out.
 *
 * The footer carried a physical address — half of what US law asks of a
 * commercial email — and nothing else. The only control a recipient had was
 * "Report spam", and complaint rate is the number that restricted this
 * sending account. Every one of those complaints was one the app forced.
 *
 * These cover the two halves that have to stay true together: the link a
 * person clicks, and the header a mail client reads.
 */
describe('unsubscribeLinks', () => {
  it('gives a page for people and a POST endpoint for mail clients', () => {
    const links = unsubscribeLinks('https://bothmade.studio', 'tok123');
    expect(links).toEqual({
      pageUrl: 'https://bothmade.studio/stop/tok123',
      oneClickUrl: 'https://bothmade.studio/api/public/stop/tok123',
    });
  });

  it('does not double up the slash when the site url has a trailing one', () => {
    const links = unsubscribeLinks('https://bothmade.studio/', 'tok123');
    expect(links?.pageUrl).toBe('https://bothmade.studio/stop/tok123');
    expect(links?.oneClickUrl).toBe('https://bothmade.studio/api/public/stop/tok123');
  });

  it('escapes the token rather than pasting it into a path', () => {
    const links = unsubscribeLinks('https://bothmade.studio', 'a/b?c=d');
    expect(links?.pageUrl).toBe('https://bothmade.studio/stop/a%2Fb%3Fc%3Dd');
  });

  /*
   * No link at all, rather than one that cannot work. An unsubscribe that is
   * offered and does nothing is worse than none: the recipient presses it,
   * nothing happens, and the next control they reach for is the one that
   * costs us.
   */
  it('offers nothing when there is no token to identify the lead by', () => {
    expect(unsubscribeLinks('https://bothmade.studio', null)).toBeNull();
    expect(unsubscribeLinks('https://bothmade.studio', '')).toBeNull();
    expect(unsubscribeLinks('https://bothmade.studio', '   ')).toBeNull();
  });
});

describe('List-Unsubscribe headers', () => {
  const base = {
    from: 'Kiana <kiana@bothmadestudio.com>',
    to: 'owner@example.com',
    subject: 'A quick thought about your site',
    html: '<p>Hello</p>',
  };

  it('emits the one-click pair when an unsubscribe url is given', () => {
    const raw = encodeMimeMessage({
      ...base,
      unsubscribeUrl: 'https://bothmade.studio/api/public/stop/tok123',
    });
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    expect(decoded).toContain('List-Unsubscribe: <https://bothmade.studio/api/public/stop/tok123>');
    expect(decoded).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  });

  /*
   * An invoice is not marketing. Offering to stop sending somebody the thing
   * they are paying against is nonsense, and a mail client that saw the
   * header would put an Unsubscribe control on it.
   */
  it('leaves both headers off client mail', () => {
    const raw = encodeMimeMessage(base);
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    expect(decoded).not.toContain('List-Unsubscribe');
  });

  /*
   * The URL is built from a database token, and a newline in a header value
   * does not corrupt the header — it starts a new one. Sanitised for the same
   * reason From: and To: are, wherever the value came from.
   */
  it('cannot be used to inject a header', () => {
    const raw = encodeMimeMessage({
      ...base,
      unsubscribeUrl: 'https://bothmade.studio/x\r\nBcc: everyone@example.com',
    });
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    // The injected text survives as text — flattened onto one line inside the
    // header value, which is harmless. What must not exist is a LINE that
    // starts with it, because that is what makes it a header.
    expect(decoded.split('\r\n').some((line) => line.startsWith('Bcc:'))).toBe(false);
    expect(decoded).toContain('List-Unsubscribe: <https://bothmade.studio/xBcc: everyone@example.com>');
  });
});

describe('the footer link', () => {
  it('renders a way out on outreach', () => {
    const html = renderShell({
      title: 'A quick thought',
      bodyHtml: '<p>Hello</p>',
      unsubscribeUrl: 'https://bothmade.studio/stop/tok123',
    });

    expect(html).toContain('href="https://bothmade.studio/stop/tok123"');
    expect(html).toContain('Unsubscribe');
  });

  /*
   * The visible link goes to the page, never the one-click endpoint. A GET on
   * that endpoint must not unsubscribe anybody — corporate mail security
   * follows every link in every message, and a scanner that could opt a lead
   * out would kill it silently and indistinguishably from a real request.
   */
  it('points people at the page that asks, not the endpoint that acts', () => {
    const links = unsubscribeLinks('https://bothmade.studio', 'tok123');
    const html = renderShell({
      title: 'A quick thought',
      bodyHtml: '<p>Hello</p>',
      unsubscribeUrl: links?.pageUrl,
    });

    expect(html).not.toContain('/api/public/stop/');
  });

  it('says nothing about unsubscribing on client mail', () => {
    const html = renderShell({ title: 'Your invoice', bodyHtml: '<p>Attached.</p>' });
    expect(html).not.toContain('Unsubscribe');
  });
});
