import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvWithHeaders } from '@/lib/csv';

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
