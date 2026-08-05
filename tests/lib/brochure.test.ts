import { describe, expect, it } from 'vitest';

/**
 * A brochure is a document with prices in it that goes to a client before
 * the contract does. So the things worth testing are the ones that would
 * make it disagree with the contract: a tier that quotes a feature without
 * the foundation the checkout will silently add, a custom item whose stated
 * price isn't the sum of its parts, a folio that says "9 of 15" on a
 * sixteen-page document, and a page of jargon that stops explaining a term
 * the moment somebody adds it to a tier.
 */

import {
  brochureProse,
  buildBrochure,
  buildTiers,
  comparisonLines,
  countPages,
  customItemParts,
  customItemPrice,
  sumAddOns,
  withDependencies,
  type BrochureCustomItem,
} from '@/lib/brochure';
import { MONOGRAM } from '@/lib/brochures/monogram';
import { ADD_ONS, ADD_ON_REQUIRES, calculatePrice, formatCents, type AddOnKey } from '@/lib/pricing';

const parseMoney = (value: string) => Number(value.replace(/[^0-9.]/g, '')) * 100;

describe('withDependencies', () => {
  it('adds the foundation a feature cannot be built without', () => {
    // Bookings need somewhere to keep availability. Quoting the calendar
    // alone is quoting a price the checkout then disagrees with.
    expect(withDependencies(['booking'])).toContain('custom-backend');
    expect(withDependencies(['admin-dashboard'])).toContain('custom-backend');
    expect(withDependencies(['sla-uptime'])).toContain('hosting');
  });

  it('follows a dependency of a dependency', () => {
    // white-label -> custom-backend + user-accounts, and sso-auth -> user-accounts.
    expect(withDependencies(['white-label', 'sso-auth']).sort()).toEqual(
      ['custom-backend', 'sso-auth', 'user-accounts', 'white-label'].sort()
    );
  });

  it('counts a shared dependency once, so nothing is billed twice', () => {
    const resolved = withDependencies(['booking', 'admin-dashboard', 'custom-backend']);

    expect(resolved.filter((key) => key === 'custom-backend')).toHaveLength(1);
    expect(sumAddOns(resolved)).toBe(
      ADD_ONS.booking.price + ADD_ONS['admin-dashboard'].price + ADD_ONS['custom-backend'].price
    );
  });

  it('leaves an add-on that stands on its own alone', () => {
    expect(withDependencies(['seo'])).toEqual(['seo']);
  });
});

describe('buildTiers', () => {
  const tiers = buildTiers([
    {
      key: 'essential',
      name: 'A',
      tagline: 't',
      forWho: 'w',
      selection: { baseService: 'website', addOns: ['seo'], clientType: 'smb', timeline: 'standard' },
    },
    {
      key: 'recommended',
      name: 'B',
      tagline: 't',
      forWho: 'w',
      selection: {
        baseService: 'website',
        addOns: ['seo', 'analytics'],
        clientType: 'smb',
        timeline: 'standard',
      },
    },
    {
      key: 'complete',
      name: 'C',
      tagline: 't',
      forWho: 'w',
      selection: {
        baseService: 'website',
        addOns: ['seo', 'analytics', 'booking'],
        clientType: 'smb',
        timeline: 'standard',
      },
    },
  ]);

  it('prices from the catalogue rather than from anything written in the brochure', () => {
    expect(tiers[0].total).toBe(
      formatCents(
        calculatePrice({
          baseService: 'website',
          addOns: ['seo'],
          clientType: 'smb',
          timeline: 'standard',
        }).totalPrice
      )
    );
  });

  it('shows each tier only what it adds, and the first one everything', () => {
    expect(tiers[0].addedLines.map((line) => line.key)).toEqual(['seo']);
    expect(tiers[1].addedLines.map((line) => line.key)).toEqual(['analytics']);
    // The backend arrived with the booking calendar, so it is new here too.
    expect(tiers[2].addedLines.map((line) => line.key).sort()).toEqual(['booking', 'custom-backend']);
  });

  it('never drops a line on the way up — every tier contains the one below it', () => {
    for (let i = 1; i < tiers.length; i += 1) {
      for (const line of tiers[i - 1].lines) {
        expect(tiers[i].lines.map((l) => l.key)).toContain(line.key);
      }
    }
  });

  it('carries the catalogue wording, so the brochure and the call say the same thing', () => {
    const [seo] = tiers[0].lines;

    expect(seo.description).toBe(ADD_ONS.seo.description);
    expect(seo.benefit).toBe(ADD_ONS.seo.benefit);
  });
});

describe('custom items', () => {
  const item: BrochureCustomItem = {
    label: 'The build portal',
    what: 'w',
    why: 'y',
    builtFrom: ['user-accounts', 'admin-dashboard'],
    includedIn: 'complete',
  };

  it('prices from the parts it is actually built out of, dependencies included', () => {
    expect(parseMoney(customItemPrice(item))).toBe(
      ADD_ONS['user-accounts'].price + ADD_ONS['admin-dashboard'].price + ADD_ONS['custom-backend'].price
    );
  });

  it('can show its own arithmetic, so the figure is checkable rather than asserted', () => {
    const parts = customItemParts(item);

    expect(parts.map((part) => part.key)).toContain('custom-backend');
    expect(parts.reduce((total, part) => total + parseMoney(part.price), 0)).toBe(
      parseMoney(customItemPrice(item))
    );
  });
});

describe('the Monogram brochure', () => {
  const brochure = buildBrochure(MONOGRAM);

  it('quotes three options that get more expensive in the order they are printed', () => {
    const totals = brochure.tiers.map((tier) => tier.breakdown.totalPrice);

    expect(brochure.tiers.map((tier) => tier.key)).toEqual(['essential', 'recommended', 'complete']);
    expect(totals[0]).toBeLessThan(totals[1]);
    expect(totals[1]).toBeLessThan(totals[2]);
  });

  /**
   * The failure this guards against is subtle and expensive: a tier lists
   * "Appointments & Booking" at $1,500, the client signs, and the checkout
   * adds the $3,000 backend it needs — so the first invoice is $3,000 more
   * than the document they agreed to.
   */
  it('never quotes a feature without the foundation the checkout will add to it', () => {
    for (const tier of brochure.tiers) {
      const included = new Set(tier.lines.map((line) => line.key));
      for (const key of included) {
        for (const dependency of ADD_ON_REQUIRES[key] ?? []) {
          expect(included, `${tier.name} quotes ${key} without ${dependency}`).toContain(dependency);
        }
      }
    }
  });

  it('splits the recommended price into three payments that add back up to it', () => {
    const recommended = brochure.tiers.find((tier) => tier.key === 'recommended');
    const paid = brochure.schedule.reduce((total, row) => total + parseMoney(row.amount), 0);

    expect(brochure.schedule).toHaveLength(3);
    expect(paid).toBe(recommended?.breakdown.totalPrice);
    expect(brochure.schedule[0].trigger).toMatch(/before work begins/);
  });

  /**
   * The obvious way to build the comparison table is to take the top tier's
   * lines, and it is wrong: "Everything" swaps the Maintenance Plan for the
   * Growth Plan that supersedes it, so Maintenance appears in no column at
   * all and the recommended card claims one more item than the table shows.
   */
  it('compares on every line any option includes, not just the top one', () => {
    const rows = comparisonLines(brochure.tiers).map((line) => line.key);

    for (const tier of brochure.tiers) {
      for (const line of tier.lines) {
        expect(rows, `${line.key} is in ${tier.name} but missing from the table`).toContain(line.key);
      }
      // The card prints this count beside the table, so they have to match.
      expect(rows.filter((key) => tier.lines.some((line) => line.key === key))).toHaveLength(
        tier.lines.length
      );
    }
    expect(new Set(rows).size).toBe(rows.length);
    expect(rows).toContain('maintenance');
  });

  it('says in words why a row the top option drops is not a downgrade', () => {
    const dropped = brochure.tiers[1].lines.filter(
      (line) => !brochure.tiers[2].lines.some((kept) => kept.key === line.key)
    );

    // If an option ever stops dropping a line, the note explaining it should go.
    expect(dropped.map((line) => line.key)).toEqual(['maintenance']);
    expect(MONOGRAM.pricingNotes?.join(' ')).toMatch(/Maintenance/);
  });

  it('explains every piece of jargon it actually uses, and none it does not', () => {
    const terms = brochure.glossary.map((entry) => entry.term);

    // These are in the tier copy, so they have to be on the plain-English page.
    expect(terms).toContain('CMS');
    expect(terms).toContain('local SEO');
    expect(terms).toContain('analytics');
    // Nothing in a builder's brochure is about single sign-on.
    expect(terms).not.toContain('retargeting');
  });

  it('derives the glossary from the finished document rather than a kept list', () => {
    const prose = brochureProse(MONOGRAM);

    for (const entry of brochure.glossary) {
      const forms = [entry.term, ...(entry.aliases ?? [])];
      expect(
        forms.some((form) => prose.toLowerCase().includes(form.toLowerCase())),
        `${entry.term} is explained but never used`
      ).toBe(true);
    }
  });

  it('counts its own pages, so the folio and the total agree', () => {
    // Cover, two on the current site, eight chapters, three options, custom
    // work, side by side, plain English, what happens next.
    expect(countPages(MONOGRAM)).toBe(18);
    expect(brochure.pageCount).toBe(1 + 2 + MONOGRAM.chapters.length + MONOGRAM.tiers.length + 4);
  });

  /**
   * The comparison exists only because somebody went through the current
   * site on a phone and screenshotted it. A brochure that invents a
   * criticism of a prospect's website is one sentence away from being wrong
   * in front of the person who owns it — so the rule is that the section is
   * absent unless there are shots behind it, and this is that rule.
   */
  it('shows the current site before criticising it, or says nothing at all', () => {
    expect(MONOGRAM.comparison?.before.length).toBeGreaterThan(0);
    expect(MONOGRAM.comparison?.rows.length).toBeGreaterThan(0);
    // Two pages: the screenshots, then the table. Take the section away and
    // the document has to lose exactly those two.
    expect(countPages({ ...MONOGRAM, comparison: undefined })).toBe(countPages(MONOGRAM) - 2);
  });

  /**
   * This is the only part of the document that says anything negative, and
   * it goes to the person who paid for the thing being criticised. Opening
   * straight into the list reads as contempt for a business that has been
   * running successfully for thirty years.
   */
  it('opens the criticism by saying what is good', () => {
    expect(MONOGRAM.comparison?.preamble).toMatch(/none of this is about the business/i);
  });

  it('points at a screenshot that exists for every shot on every page', async () => {
    const { access } = await import('node:fs/promises');

    const shots = [
      ...MONOGRAM.chapters.flatMap((chapter) => chapter.shots),
      ...(MONOGRAM.comparison?.before ?? []),
    ];
    expect(shots.length).toBeGreaterThan(0);

    for (const shot of shots) {
      await expect(access(`public${shot.src}`), `missing ${shot.src}`).resolves.toBeUndefined();
    }
  });

  it('uses only add-ons the catalogue still has, so a renamed key fails here', () => {
    for (const tier of MONOGRAM.tiers) {
      for (const key of tier.selection.addOns) {
        expect(Object.hasOwn(ADD_ONS, key), `unknown add-on ${key}`).toBe(true);
      }
    }
    for (const item of MONOGRAM.customItems) {
      for (const key of item.builtFrom as AddOnKey[]) {
        expect(Object.hasOwn(ADD_ONS, key), `unknown add-on ${key}`).toBe(true);
      }
    }
  });
});

/**
 * The client cannot visit the concept. It is built and not published, and
 * what they get is a video. A brochure that says "open it on your phone
 * right now" hands them a link that does not work and a first impression
 * that we did not check our own document — which is exactly what shipped
 * before somebody read page two properly.
 */
describe('nothing is live for them', () => {
  const brochure = buildBrochure(MONOGRAM);

  it('never tells the client to go and look at the concept', () => {
    const prose = brochureProse(MONOGRAM).toLowerCase();

    expect(prose).not.toContain(MONOGRAM.conceptUrl.replace(/^https?:\/\//, ''));
    expect(prose).not.toMatch(/open it on your phone|visit the concept|live at/);
  });

  it('says instead what arrived in the email, and one of them is the video', () => {
    expect(brochure.enclosures.length).toBeGreaterThan(1);
    expect(brochure.enclosures.some((e) => e.kind === 'video')).toBe(true);
    expect(brochureProse(MONOGRAM).toLowerCase()).toContain('video');
  });

  it('says out loud that the concept is one idea and theirs to change', () => {
    expect(`${MONOGRAM.cover.standfirst} ${MONOGRAM.nextSteps.join(' ')}`.toLowerCase()).toMatch(
      /yours to change|not a verdict|one idea/
    );
  });

  it('carries a line that could not have been written about anyone else', () => {
    expect(MONOGRAM.observation).toBeTruthy();
    expect(brochureProse(MONOGRAM)).toContain(MONOGRAM.observation);
  });
});
