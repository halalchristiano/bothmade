// Text safety for the two PDF builders (contract and invoice).
//
// Both draw with pdf-lib's StandardFonts, which are encoded as WinAnsi:
// Latin-1 plus a handful of CP1252 punctuation, and nothing else. pdf-lib
// does not skip a character it can't encode — it throws. Both builders are
// called from paths that catch and log so a PDF failure can't stand between
// a client and paying us, which means an unencodable character doesn't
// produce an error anybody sees. It produces a signature with no document
// attached to it, or an invoice that quietly never existed.
//
// Client names are the obvious way one gets in: the site accepts a name in
// any script, and a name in any script is exactly what ends up on a
// contract. A user agent header is the other — that one is whatever the
// caller decided to send.

const WINANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
// Not global: this is only ever used with .test(), and a lastIndex that
// survived between calls would make the answer depend on the last question.
const WINANSI_SUPPORTED = new RegExp(`^[\\u0020-\\u007E\\u00A0-\\u00FF${WINANSI_EXTRAS}]$`);

/**
 * Returns `text` with every character the standard fonts can't encode
 * either reduced to one they can or replaced with '?'. Accents survive
 * where WinAnsi has the composed letter; a name in a non-Latin script does
 * not, which is a worse document than the client deserves and a far better
 * one than none at all.
 */
export function winAnsi(text: string): string {
  let out = '';
  // NFC first, so "e" + combining diaeresis is treated as the single "ë"
  // WinAnsi actually has, rather than as a letter and an orphan mark.
  for (const char of text.normalize('NFC')) {
    if (WINANSI_SUPPORTED.test(char)) {
      out += char;
      continue;
    }
    // "Ǎ" has no WinAnsi codepoint of its own but "A" does, and a stripped
    // accent beats a '?'.
    const base = char.normalize('NFD').replace(/\p{M}+/gu, '');
    out += base.length === 1 && WINANSI_SUPPORTED.test(base) ? base : '?';
  }
  return out;
}
