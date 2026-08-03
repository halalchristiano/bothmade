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
