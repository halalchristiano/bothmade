import { describe, expect, it } from 'vitest';
import { jsonLdScript } from '@/lib/json-ld';

/**
 * The app's CSP allows `'unsafe-inline'` for scripts, on the stated grounds
 * that there is no HTML injection sink for anything to be injected *into*.
 * The three `<script type="application/ld+json">` blocks are the only places
 * this app writes raw HTML, so they are what that sentence is about. These
 * tests are the check on it.
 */

describe('escaping the sequences that close a script tag', () => {
  it('neutralises a closing tag hidden in a string value', () => {
    // The HTML parser finds `</script` before any JSON parser runs, so this
    // is the whole attack: everything after it would be parsed as markup.
    const out = jsonLdScript({ name: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('</script');
    expect(out).not.toContain('<img');
  });

  it('escapes every angle bracket and ampersand, wherever they appear', () => {
    const out = jsonLdScript({ a: '<', b: '>', c: '&' });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
    expect(out).toContain('\\u0026');
  });

  it('escapes the two separators that are valid JSON but break JavaScript', () => {
    const out = jsonLdScript({ a: '\u2028', b: '\u2029' });
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('catches a closing tag nested deep in the structure, not just at the top', () => {
    // The real shape: TEAM.map(...) and FAQ_ITEMS.map(...) build nested arrays
    // of objects, so escaping must survive the whole tree rather than the
    // top-level keys.
    const out = jsonLdScript({
      mainEntity: { founder: [{ name: 'Ada', jobTitle: '</script>x' }] },
    });
    expect(out).not.toContain('</script');
  });

  it('escapes a closing tag appearing in a key as well as a value', () => {
    const out = jsonLdScript({ '</script>': 'safe' });
    expect(out).not.toContain('</script');
  });
});

describe('the data still arrives intact', () => {
  it('round-trips to exactly the original object', () => {
    // The escapes are \uXXXX sequences, which JSON decodes back to the same
    // characters — so Google's parser sees byte-identical data. An escape
    // that corrupted the payload would be an SEO regression, not a fix.
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Bothmade & Co <Studio>',
      founder: [{ '@type': 'Person', name: 'Ada', email: 'ada@bothmade.studio' }],
      separators: '\u2028\u2029',
    };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it('leaves ordinary content completely alone', () => {
    const data = { name: 'Bothmade', url: 'https://bothmade.studio/about' };
    expect(jsonLdScript(data)).toBe(JSON.stringify(data));
  });

  it('preserves URLs, which are the bulk of what these blocks carry', () => {
    const data = { url: 'https://bothmade.studio/start?a=1&b=2' };
    // The & is escaped on the way out but must decode back unchanged.
    expect(JSON.parse(jsonLdScript(data)).url).toBe('https://bothmade.studio/start?a=1&b=2');
  });
});
