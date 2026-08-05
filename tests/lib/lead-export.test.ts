import { describe, expect, it } from 'vitest';
import { LEAD_CSV_HEADERS, csvCell, ddmmyyyy, leadCsv, leadCsvFilename } from '@/lib/lead-export';

/**
 * This file leaves the building. It gets opened in Excel, mailed to an
 * accountant, re-imported. The failures worth pinning are the ones that are
 * invisible in the app and only appear in somebody else's spreadsheet.
 */

describe('escaping a cell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Northgate Dental')).toBe('Northgate Dental');
  });

  it('quotes a comma, so every column after it does not shift', () => {
    expect(csvCell('Smith, Jones & Co')).toBe('"Smith, Jones & Co"');
  });

  it('doubles an embedded quote rather than ending the field', () => {
    expect(csvCell('The "Good" Guys')).toBe('"The ""Good"" Guys"');
  });

  it('quotes a newline typed into a notes field', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  /**
   * CSV injection. A company that has named itself "=Sum Digital" would be
   * evaluated as a formula the moment the file is opened — in a spreadsheet
   * belonging to someone who never used this app.
   */
  it('defuses a value a spreadsheet would run as a formula', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+44 7700 900000')).toBe("'+44 7700 900000");
    expect(csvCell('-lead')).toBe("'-lead");
    expect(csvCell('@handle')).toBe("'@handle");
  });

  it('still escapes a formula that also carries a comma', () => {
    expect(csvCell('=HYPERLINK("a","b")')).toBe('"\'=HYPERLINK(""a"",""b"")"');
  });
});

describe('dates', () => {
  it('writes the format the filters accept, so an export re-imports', () => {
    expect(ddmmyyyy('2026-08-05T12:00:00.000Z')).toBe('05082026');
  });

  it('leaves a missing or unparseable date empty rather than "Invalid Date"', () => {
    expect(ddmmyyyy(null)).toBe('');
    expect(ddmmyyyy('')).toBe('');
    expect(ddmmyyyy('not a date')).toBe('');
  });
});

describe('the file', () => {
  it('always writes a header row, even with no leads', () => {
    expect(leadCsv([])).toBe(LEAD_CSV_HEADERS.join(','));
  });

  it('writes one row per lead, in the header order', () => {
    const csv = leadCsv([
      {
        company: 'Northgate Dental',
        contactName: 'Priya Raman',
        email: 'priya@northgate.test',
        status: 'proposal_sent',
        estimatedValue: 1_450_000,
        assignedTo: { name: 'Evan' },
        addedAt: '2026-08-01T09:00:00.000Z',
      },
    ]);
    const [header, row] = csv.split('\n');

    expect(header.split(',')[0]).toBe('Company');
    expect(row.startsWith('Northgate Dental,Priya Raman,priya@northgate.test')).toBe(true);
    expect(row).toContain('Proposal Sent');
    expect(row).toContain('14500.00');
    expect(row).toContain('Evan');
    expect(row).toContain('01082026');
  });

  it('leaves a zero or missing amount blank rather than writing 0.00', () => {
    const row = leadCsv([{ company: 'X', estimatedValue: 0 }]).split('\n')[1];
    // Value is the sixth column.
    expect(row.split(',')[5]).toBe('');
  });

  it('survives a lead carrying almost nothing', () => {
    const csv = leadCsv([{ company: 'Just A Name' }]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv.split('\n')[1].split(',')).toHaveLength(LEAD_CSV_HEADERS.length);
  });

  it('names the file by the day it was taken', () => {
    expect(leadCsvFilename(new Date('2026-08-05T23:00:00.000Z'))).toBe('bothmade-leads-2026-08-05.csv');
  });
});
