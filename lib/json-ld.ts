/**
 * Serialise a JSON-LD object for embedding in a `<script>` tag.
 *
 * `JSON.stringify` produces valid JSON, and valid JSON is not automatically
 * safe to drop between `<script>` and `</script>`. The HTML parser looks for
 * the literal sequence `</script` before any JavaScript or JSON parser sees a
 * single character, so a string value containing it closes the tag early —
 * and everything after it is parsed as markup:
 *
 *   JSON.stringify({ name: '</script><img src=x onerror=alert(1)>' })
 *   // → {"name":"</script><img src=x onerror=alert(1)>"}
 *
 * That is an HTML injection sink, and this app's Content-Security-Policy
 * deliberately allows `'unsafe-inline'` for scripts (see next.config.ts —
 * Next streams its RSC payload through inline tags, so a nonce would make
 * every page dynamic). The reasoning that makes that trade acceptable is
 * precisely that the app has no HTML injection sink for an attacker to reach.
 * This function is what keeps that sentence true instead of merely believed.
 *
 * Nothing reaching the three call sites is attacker-controlled today: they
 * build from module constants — `FAQ_ITEMS`, `TEAM`, `COMPANY_EMAIL`,
 * `SITE_URL`. This is not a fix for a live vulnerability. It is here because
 * those constants are *content*, `lib/team.ts` carries a `bio` field the
 * about page is explicitly waiting to have filled in, and the person who
 * eventually pastes a paragraph in there will not be thinking about the HTML
 * parser. The escape costs nothing and removes the whole question.
 *
 * The replacements are `\uXXXX` escapes, which JSON decodes back to the exact
 * same characters — so consumers (Google's parser included) see byte-identical
 * data. `<` alone would be enough to stop `</script`; `>` and `&` are included
 * because they cost nothing and cover embedding contexts other than this one.
 * U+2028 and U+2029 are valid in JSON but are line terminators in JavaScript
 * source, which breaks any tool that inlines this into a script rather than
 * parsing it as JSON — `JSON.stringify` does not escape them, so we do.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
