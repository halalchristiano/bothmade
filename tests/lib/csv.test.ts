import { describe, expect, it } from 'vitest';
import { csvCell, toCsv, parseCsv, parseCsvWithHeaders } from '@/lib/csv';

/**
 * Every lead in the CRM arrives through this parser. A column that shifts by
 * one because of a comma inside a quoted address puts a phone number in the
 * email field for a whole imported batch, and nobody notices until the calls
 * start failing.
 */

describe('parseCsv', () => {
  it('parses a plain grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps a comma inside a quoted field instead of splitting on it', () => {
    expect(parseCsv('company,address\nAcme,"1 High St, Miami"')).toEqual([
      ['company', 'address'],
      ['Acme', '1 High St, Miami'],
    ]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('company,notes\nAcme,"line one\nline two"')).toEqual([
      ['company', 'notes'],
      ['Acme', 'line one\nline two'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('name\n"He said ""hi"""')).toEqual([['name'], ['He said "hi"']]);
  });

  it('handles CRLF line endings from Excel exports', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not need a trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toHaveLength(2);
  });

  it('preserves empty cells so columns stay aligned', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('drops rows that are entirely blank', () => {
    expect(parseCsv('a,b\n\n1,2\n   ,  \n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});

describe('parseCsvWithHeaders', () => {
  it('keys each row by its lower-cased header', () => {
    expect(parseCsvWithHeaders('Company,Email\nAcme,a@acme.com')).toEqual([
      { company: 'Acme', email: 'a@acme.com' },
    ]);
  });

  it('trims header and cell whitespace', () => {
    expect(parseCsvWithHeaders('  Company  ,  Email  \n  Acme  ,  a@acme.com  ')).toEqual([
      { company: 'Acme', email: 'a@acme.com' },
    ]);
  });

  it('fills a short row with empty strings rather than undefined', () => {
    const [row] = parseCsvWithHeaders('company,email,phone\nAcme');
    expect(row).toEqual({ company: 'Acme', email: '', phone: '' });
  });

  it('returns nothing when the file has only headers', () => {
    expect(parseCsvWithHeaders('company,email')).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsvWithHeaders('')).toEqual([]);
  });

  it('keeps columns aligned when an earlier field contains a comma', () => {
    const [row] = parseCsvWithHeaders('company,address,email\nAcme,"1 High St, Miami",a@acme.com');
    // The failure this guards against is `email` coming back as " Miami".
    expect(row.email).toBe('a@acme.com');
  });
});

/**
 * The other direction, which this file only grew when the ledger needed to
 * leave the app as a file.
 *
 * Two separate problems, and only one of them is about CSV. Alignment is the
 * familiar one: a comma or a quote inside a value tears a row into pieces.
 * The other is that a spreadsheet treats a leading =, +, - or @ as a FORMULA,
 * and these values are what a client is called and what somebody typed an
 * invoice was for.
 */
describe('writing a cell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Northgate Dental')).toBe('Northgate Dental');
    expect(csvCell(120000)).toBe('120000');
  });

  it('quotes anything that would tear the row', () => {
    expect(csvCell('Round 2, final')).toBe('"Round 2, final"');
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('treats an empty value as empty rather than as the word null', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  /*
   * A description beginning "=HYPERLINK(...)" runs when the accountant opens
   * the export. The tab keeps the text readable — both Excel and Sheets strip
   * it on display — while making the first character something no parser
   * reads as a formula. Blanking it would quietly change what the invoice
   * says it was for, on the copy that goes to the accountant.
   */
  it('defuses a value that a spreadsheet would run', () => {
    for (const lead of ['=', '+', '-', '@']) {
      const written = csvCell(`${lead}HYPERLINK("http://evil.test")`);
      expect(written.startsWith(lead)).toBe(false);
      expect(written).toContain('HYPERLINK');
    }
  });

  /* A negative amount typed as text is the ordinary reason a cell starts with
     a minus, and it survives the same treatment: still readable, still not a
     formula. */
  it('keeps a leading minus readable', () => {
    expect(csvCell('-400.00')).toContain('-400.00');
  });

  it('survives the round trip through the parser above', () => {
    const rows = [
      ['Invoice', 'For', 'Amount'],
      ['BM-2026-0031', 'Round 2, "final"\nwith notes', '1200.00'],
      ['BM-2026-0032', '=SUM(A1:A9)', '900.00'],
    ];

    const back = parseCsv(toCsv(rows));

    expect(back[1][1]).toBe('Round 2, "final"\nwith notes');
    // The defusing tab is the only difference, and it is deliberate.
    expect(back[2][1]).toContain('=SUM(A1:A9)');
    expect(back.every((row) => row.length === 3)).toBe(true);
  });
});
