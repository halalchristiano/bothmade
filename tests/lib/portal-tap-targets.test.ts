import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Two controls on the client's own portal that were too small to aim at.
 *
 * Measured in a browser at 390px, on the page a client actually uses:
 *
 *   Logout            42 × 20   — beside nav links that are all 28
 *   Attach a link     88 × 18
 *
 * WCAG 2.5.8 asks for 24px, and neither is wrapped in a larger label the way
 * a checkbox usually is: they are the target. `py-1` puts them at 28 and 26,
 * which is also exactly what the nav links beside Logout have carried all
 * along — it was the one control in that row without it.
 *
 * Worth caring about rather than tidying because of when each one matters.
 * Logout is the only way a client signs out, and the moment that matters is
 * somebody on a shared machine or a borrowed phone wanting to be signed out
 * now. Attach a link is how a client hands over the brief we asked them for,
 * from a phone.
 *
 * jsdom has no layout engine, so what is held here is the rule that produced
 * the measurement.
 */

const read = (p: string) => readFile(p, 'utf8');

/**
 * The className of the element a marker sits inside, searching backwards.
 *
 * Reads `className={`…`}` as well as `className="…"`, which the first version
 * did not: the nav links build theirs from a template literal, so anchoring on
 * `className="` walked past them to an outer `flex items-center gap-6` and the
 * test asserted against the wrong element.
 */
const classBefore = (src: string, marker: string): string => {
  const at = src.indexOf(marker);
  expect(at, `could not find ${marker}`).toBeGreaterThan(-1);
  const open = src.lastIndexOf('className=', at);
  expect(open, `no className before ${marker}`).toBeGreaterThan(-1);
  // Everything from the attribute to the marker: enough to contain the static
  // classes whether or not the value is interpolated.
  return src.slice(open, at);
};

describe('the portal header', () => {
  it('pads Logout into a real target', async () => {
    const src = await read('components/portal/ClientHeader.tsx');
    const cls = classBefore(src, 'Logout\n');

    expect(cls, 'Logout has no vertical padding — it measured 20px').toMatch(/\bpy-1\b/);
  });

  /**
   * The comparison is the point: Logout was the only control in its own row
   * without the padding its neighbours had. If the nav links ever lose it,
   * this stops being a fair reference and should be revisited together.
   */
  it('keeps Logout the same height as the nav links beside it', async () => {
    const src = await read('components/portal/ClientHeader.tsx');
    const navCls = classBefore(src, '{link.label}');

    expect(navCls).toMatch(/\bpy-1\b/);
  });
});

describe('attaching a link', () => {
  it('pads the trigger a client presses on a phone', async () => {
    const src = await read('components/AttachLink.tsx');
    const cls = classBefore(src, '{full ? `${MAX_ATTACHMENTS} is the limit`');

    expect(cls, 'the attach trigger has no vertical padding — it measured 18px').toMatch(/\bpy-1\b/);
  });
});
