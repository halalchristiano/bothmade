import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '@/lib/html';
import { encodeMimeMessage } from '@/lib/gmail-mime';

/**
 * Every outbound message carries a text/plain alternative. This is a
 * deliverability guard, not cosmetics: an HTML-only message is a scored spam
 * signal, and these emails were HTML-only on both the Gmail and Resend paths
 * while Gmail was filing them as phishing with authentication already clean.
 */
describe('htmlToPlainText', () => {
  it('keeps where a link goes, not just its label', () => {
    const text = htmlToPlainText('<p>Read the <a href="https://bothmade.studio/start">pricing</a>.</p>');

    expect(text).toBe('Read the pricing (https://bothmade.studio/start).');
  });

  it('leaves a mailto link as its label, since the address is already the text', () => {
    const text = htmlToPlainText('<a href="mailto:info@bothmade.studio">info@bothmade.studio</a>');

    expect(text).toBe('info@bothmade.studio');
  });

  it('drops style and script blocks rather than dumping their source', () => {
    const text = htmlToPlainText('<style>body{color:red}</style><p>Hello</p>');

    expect(text).toBe('Hello');
    expect(text).not.toContain('color');
  });

  it('turns block boundaries into line breaks instead of running words together', () => {
    const text = htmlToPlainText('<p>First</p><p>Second</p>');

    expect(text).toBe('First\nSecond');
  });

  it('decodes the entities the templates emit', () => {
    const text = htmlToPlainText('<p>Bothmade&nbsp;&mdash;&nbsp;web &amp; native</p>');

    expect(text).toBe('Bothmade — web & native');
  });

  it('collapses runs of spaces and blank lines that indented markup leaves behind', () => {
    const text = htmlToPlainText(`
      <div>
        <p>   Hi    there   </p>


        <p>Bye</p>
      </div>
    `);

    // A single blank line survives between the paragraphs — that is the
    // separation a plaintext reader wants — but the indentation, the runs of
    // spaces and the extra empty lines do not.
    expect(text).toBe('Hi there\n\nBye');
  });
});

describe('encodeMimeMessage', () => {
  const decode = (raw: string) =>
    Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

  it('sends multipart/alternative with both parts, not HTML alone', () => {
    const message = decode(
      encodeMimeMessage({
        from: 'Bothmade <info@bothmade.studio>',
        to: 'someone@example.com',
        subject: 'We received your message',
        html: '<h1>Thanks</h1><p>Hi there.</p>',
      })
    );

    expect(message).toContain('Content-Type: multipart/alternative; boundary=');
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(message).toContain('Content-Type: text/html; charset=UTF-8');
    // The plaintext alternative carries the actual words, not empty filler.
    expect(message).toContain('Thanks\nHi there.');
  });

  it('orders plaintext before HTML, since clients render the last part they understand', () => {
    const message = decode(
      encodeMimeMessage({
        from: 'Bothmade <info@bothmade.studio>',
        to: 'someone@example.com',
        subject: 'Subject',
        html: '<p>Body</p>',
      })
    );

    expect(message.indexOf('text/plain')).toBeLessThan(message.indexOf('text/html'));
  });

  it('closes the multipart with a terminating boundary', () => {
    const message = decode(
      encodeMimeMessage({
        from: 'Bothmade <info@bothmade.studio>',
        to: 'someone@example.com',
        subject: 'Subject',
        html: '<p>Body</p>',
      })
    );

    const boundary = /boundary="([^"]+)"/.exec(message)?.[1];
    expect(boundary).toBeTruthy();
    expect(message.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('still refuses a recipient that is not an address', () => {
    expect(() =>
      encodeMimeMessage({
        from: 'Bothmade <info@bothmade.studio>',
        to: 'not-an-address',
        subject: 'Subject',
        html: '<p>Body</p>',
      })
    ).toThrow(/recipient/i);
  });
});


describe('attachments ride multipart/mixed', () => {
  const decode = (raw: string) =>
    Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

  const base = {
    from: 'Bothmade <info@bothmade.studio>',
    to: 'client@example.com',
    subject: 'Your agreement',
    html: '<p>Hi</p>',
  };

  it('wraps the alternative part and carries the file base64-encoded', () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    const msg = decode(
      encodeMimeMessage({ ...base, attachments: [{ filename: 'agreement.pdf', content: pdf }] })
    );

    expect(msg).toContain('multipart/mixed');
    expect(msg).toContain('multipart/alternative');
    expect(msg).toContain('Content-Disposition: attachment; filename="agreement.pdf"');
    expect(msg).toContain(pdf.toString('base64'));
  });

  it('stays plain multipart/alternative with no attachments — the old shape, byte for byte', () => {
    const msg = decode(encodeMimeMessage(base));

    expect(msg).not.toContain('multipart/mixed');
    expect(msg).toContain('multipart/alternative');
  });

  it('a hostile filename cannot inject a header line', () => {
    const msg = decode(
      encodeMimeMessage({
        ...base,
        attachments: [
          { filename: 'evil"\r\nBcc: victim@example.com', content: Buffer.from('x') },
        ],
      })
    );

    // The text may survive inside the quoted parameter; what must never
    // happen is it landing at the start of a line, where it parses as a
    // real header. And the quote that would close the parameter is gone.
    for (const line of msg.split('\r\n')) {
      expect(line.startsWith('Bcc:')).toBe(false);
    }
    expect(msg).not.toContain('evil"');
  });

  it('folds long base64 to 76-char lines per RFC 2045', () => {
    const big = Buffer.alloc(300, 7);
    const msg = decode(
      encodeMimeMessage({ ...base, attachments: [{ filename: 'a.pdf', content: big }] })
    );
    const b64lines = msg
      .split('\r\n')
      .filter((l) => /^[A-Za-z0-9+/=]+$/.test(l) && l.length > 10);

    expect(b64lines.length).toBeGreaterThan(1);
    for (const line of b64lines) expect(line.length).toBeLessThanOrEqual(76);
  });
});
