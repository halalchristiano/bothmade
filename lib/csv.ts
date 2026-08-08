// Minimal RFC-4180-ish CSV parser — handles quoted fields (so commas and
// newlines inside a quoted value don't break column alignment), which a
// naive line.split(',') can't. No external dependency needed for this.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\r') {
      // ignore, \n handles the row break
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }

  // Final field/row if the text didn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseCsvWithHeaders(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] || '').trim();
    });
    return obj;
  });
}

/**
 * One CSV cell, quoted when it has to be and defused when it might not be a
 * cell at all.
 *
 * Two separate problems.
 *
 * The first is alignment: a comma, a quote or a newline inside a value tears
 * a row into pieces. RFC-4180 says wrap it in quotes and double any quote
 * inside, which is what parseCsv above already reads.
 *
 * The second is that a spreadsheet treats a leading =, +, - or @ as a
 * FORMULA, and this file's values come from what a client is called and what
 * somebody typed an invoice was for. A description beginning "=HYPERLINK(...)"
 * runs when the accountant opens the export. Prefixing a tab keeps the text
 * readable in the cell — Excel and Sheets both strip it on display — while
 * making the first character something no parser reads as a formula. Blanking
 * or stripping would quietly change what the invoice says it was for, on the
 * copy that goes to the accountant.
 */
export function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const defused = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;
  return /[",\n\r\t]/.test(defused) ? `"${defused.replace(/"/g, '""')}"` : defused;
}

/** A whole file: header row first, CRLF between rows as the spec asks. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
