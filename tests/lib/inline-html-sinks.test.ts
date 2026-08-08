import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The two places this app puts markup somewhere the browser will parse it,
 * swept so that the next one added inherits the decision.
 *
 * Both controls already existed and both were applied unevenly, which is the
 * characteristic way a control like this fails: the person who wrote the first
 * one understood exactly why it was needed, and the fourth call site was
 * written months later by somebody reading the third for an example.
 *
 * ## Why this matters more here than in most apps
 *
 * `next.config.ts` ships `script-src 'self' 'unsafe-inline'`, and it documents
 * why: Next streams its RSC payload through inline `<script>` tags, so a nonce
 * would make every page dynamic. The argument that makes that trade acceptable
 * is that the app has no HTML injection sink for an attacker to reach — and
 * that argument is only worth as much as the two invariants below. With
 * `'unsafe-inline'` in force, one injected `<script>` is not a defaced page,
 * it is script execution in our own origin.
 *
 * A grep over source rather than a render test, deliberately: the thing worth
 * catching is a *new* call site, and no render test covers a component that
 * does not exist yet.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/*
 * Comments are stripped before either sweep looks at a file.
 *
 * Not a nicety: the first run of this test failed on the comment that had just
 * been written above one of the fixed iframes, because explaining the hazard
 * meant writing `<iframe srcDoc>` in prose. A sweep that fires on its own
 * documentation is a sweep the next person deletes, and the note explaining
 * why a control exists is the last thing that should be unwriteable.
 *
 * A regex-based strip mishandles the pathological cases — `//` inside a string
 * literal, `/*` inside a regex literal. Neither appears in these two patterns,
 * and the failure direction is safe: a mangled file yields no match, and the
 * count assertions below fail loudly if the sweep stops seeing the call sites
 * it is supposed to be checking.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCE_DIRS = ['app', 'components', 'lib'];
const FILES = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir))).map((full) => ({
  path: full.slice(ROOT.length + 1),
  text: stripComments(readFileSync(full, 'utf8')),
}));

describe('JSON-LD is serialised through the escaping helper', () => {
  /*
   * `JSON.stringify` produces valid JSON, and valid JSON is not safe between
   * `<script>` and `</script>`: the HTML parser finds the literal `</script`
   * before any JSON parser sees a character, so a string value containing it
   * closes the tag early and the remainder is parsed as markup.
   *
   * lib/json-ld.ts escapes `<`, `>`, `&` and the two JS line terminators to
   * \uXXXX, which JSON decodes back to identical data — Google's parser sees
   * no difference. Three of the four call sites used it. The fourth was the
   * blog post page, whose input is BLOG_POSTS: the longest and most frequently
   * edited of the four, and prose rather than a handful of constants.
   */
  const sinks = FILES.filter((f) => f.text.includes('dangerouslySetInnerHTML'));

  it('finds the call sites, so a passing sweep means something', () => {
    // Guards against the sweep quietly covering nothing after a refactor.
    expect(sinks.length).toBeGreaterThanOrEqual(4);
  });

  it.each(sinks.map((f) => f.path))('%s does not stringify straight into a script tag', (path) => {
    const { text } = sinks.find((f) => f.path === path)!;

    // Only the raw-stringify shape is a finding. `jsonLdScript(...)` calls
    // JSON.stringify internally, and lib/ is where it is allowed to.
    const raw = /dangerouslySetInnerHTML\s*=\s*\{\{[^}]*JSON\.stringify/.test(text);

    expect(raw, `${path} passes JSON.stringify to dangerouslySetInnerHTML; use jsonLdScript() from lib/json-ld.ts`).toBe(false);
  });
});

describe('email previews render in a sandboxed frame', () => {
  /*
   * `<iframe srcDoc>` inherits the embedding document's origin. It is not a
   * neutral viewport: markup inside it runs as us, with our cookies reachable
   * by same-origin fetch, under a policy that permits inline script.
   *
   * What these frames are handed is transactional email HTML assembled by
   * string concatenation across several dozen templates, interpolating contact
   * names, company names, client messages and cold-email drafts — values that
   * arrive from the public enquiry form and from CSV import of harvested
   * leads. lib/html.ts escapes all of it, and that is the control that stops
   * this being live. The sandbox is what decides the blast radius of getting
   * one `esc()` wrong in one template: a preview that renders oddly, or an
   * admin session.
   *
   * SendGuard had it, with a comment explaining precisely this. The compose
   * pane and the bulk composer did not.
   */
  const frames = FILES.flatMap((f) =>
    [...f.text.matchAll(/<iframe\b[^>]*?srcDoc[^>]*?>/g)].map((m) => ({ path: f.path, tag: m[0] }))
  );

  it('finds every srcDoc iframe in the tree', () => {
    expect(frames.length).toBeGreaterThanOrEqual(3);
  });

  it.each(frames.map((f, i) => [`${f.path} #${i}`, f] as const))('%s carries sandbox', (_label, frame) => {
    expect(
      /\bsandbox\s*=/.test(frame.tag),
      `${frame.path} renders srcDoc without sandbox — srcDoc inherits this origin, so email HTML would run as us`
    ).toBe(true);
  });
});
