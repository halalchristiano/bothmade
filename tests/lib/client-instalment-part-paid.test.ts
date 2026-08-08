import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * The client's payment schedule had no idea what a part payment was.
 *
 * An instalment row records what was BILLED and nothing about what arrived,
 * and it deliberately stays `due` until its invoice is settled in full —
 * half of Payment 2 of 3 is not Payment 2 of 3. Correct, and it left the
 * schedule saying this to somebody who had already transferred $6,000:
 *
 *     ② Payment 2 of 3 · $12,000
 *        Due now — by Jul 29 · invoice BM-2026-0007
 *
 * Their money is absent from the one list they read to know where they stand,
 * and the row asks for the whole amount again. Two things made that worse
 * rather than merely unhelpful. The invoice card lower down the SAME page
 * already withholds its pay link on a part-paid invoice and says what is left,
 * so the two halves of one screen disagreed. And the pay link now charges the
 * outstanding balance, so the schedule said $12,000 while the checkout behind
 * the button said $6,000.
 *
 * jsdom cannot render this page — it is a large client component behind auth,
 * fetches, and framer-motion. What is pinned here is the data contract that
 * makes the row possible, on both sides of the wire, because the failure mode
 * is silent: drop `receivedCents` from the API and the row quietly renders the
 * full amount again with nothing throwing.
 */

const read = (p: string) => readFile(p, 'utf8');

const API = 'app/api/projects/[projectId]/route.ts';
const PAGE = 'app/client/[projectId]/page.tsx';

describe('the project API', () => {
  it('sends how much has arrived against each instalment', async () => {
    const src = await read(API);
    const block = src.slice(src.indexOf('instalments: instalments.map'), src.indexOf('invoices: project.invoices.map'));

    expect(block, 'the instalment payload no longer carries receivedCents').toMatch(/receivedCents:/);
  });

  /**
   * Derived from the payment rows, not stored. A refund writes a negative row
   * into the same ledger, so summing is what makes returned money stop
   * counting as received — a stored figure would have to be maintained in two
   * places and would eventually disagree with the ledger.
   */
  it('derives it from the invoice ledger rather than a stored field', async () => {
    const src = await read(API);

    expect(src).toMatch(/receivedByInvoiceNumber/);
    expect(src).toMatch(/receivedCents\(invoice\.payments\)/);
  });

  /** "-$500 received" is not a sentence a dashboard should be able to contain. */
  it('never reports a negative amount received', async () => {
    const src = await read(API);
    const at = src.indexOf('receivedCentsForInst');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toMatch(/Math\.max\(\s*0,/);
  });

  /** On a settled row the figure equals the amount; saying so twice is noise. */
  it('reports nothing extra once the instalment is paid', async () => {
    const src = await read(API);

    expect(src).toMatch(/inst\.status === 'paid' \? 0 : receivedCentsForInst/);
  });
});

describe('the schedule row', () => {
  it('leads with what is left rather than what was billed', async () => {
    const src = await read(PAGE);

    expect(src).toMatch(/const received = Math\.min\(inst\.receivedCents \?\? 0, inst\.amountCents\)/);
    expect(src).toMatch(/const outstanding = inst\.amountCents - received/);
    // The amount on the row switches to the outstanding figure.
    expect(src).toMatch(/formatCentsExact\(partPaid \? outstanding : inst\.amountCents\)/);
  });

  /**
   * A part payment is not the same state as "due" and must not be described
   * with the same sentence — "Due now — $12,000" is the exact wording that
   * made the client's money invisible.
   */
  it('says what arrived and what is left, before it says Due now', async () => {
    const src = await read(PAGE);
    const partPaidBranch = src.indexOf(': partPaid');
    const dueBranch = src.indexOf(": inst.status === 'due'", partPaidBranch);

    expect(partPaidBranch, 'no part-paid branch on the row').toBeGreaterThan(-1);
    expect(dueBranch, 'the part-paid branch must be tested before the plain due one').toBeGreaterThan(
      partPaidBranch
    );
    expect(src).toMatch(/received, thank you/);
  });

  /** The billed figure stays findable — it is what their invoice says. */
  it('keeps the billed amount on the row, struck through', async () => {
    const src = await read(PAGE);

    expect(src).toMatch(/line-through/);
  });
});
