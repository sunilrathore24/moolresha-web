// CSV encoder and RFC 4180 parser for the Admin_Export (Requirements 17.4, 17.5).

/** First characters that make a spreadsheet treat a cell as a formula (OWASP CSV injection). */
const TRIGGER = /^[=+\-@\t\r]/;

/**
 * Prefix a single quote when the value starts with `=`, `+`, `-`, `@`, TAB or CR.
 * Values that already start with `'` also get one more `'`, so `denormalise` is exact.
 */
export function neutraliseFormula(v: string): string {
  return TRIGGER.test(v) || v.startsWith("'") ? `'${v}` : v;
}

/** Reverse `neutraliseFormula`: strip exactly one leading `'` when the rest starts with a trigger character or `'`. */
export function denormalise(v: string): string {
  if (v.startsWith("'")) {
    const rest = v.slice(1);
    if (TRIGGER.test(rest) || rest.startsWith("'")) return rest;
  }
  return v;
}

/** Quote a field if it contains a comma, quote, CR, LF, or has leading/trailing space. Doubles inner quotes. */
export function encodeField(v: string): string {
  const needsQuotes = /[",\r\n]/.test(v) || v.startsWith(' ') || v.endsWith(' ');
  return needsQuotes ? `"${v.replace(/"/g, '""')}"` : v;
}

function encodeRow(cells: string[]): string {
  // A one-column row with an empty value would be a blank line, which parsers drop. Quote it.
  if (cells.length === 1 && cells[0] === '') return '""';
  return cells.map((c) => encodeField(neutraliseFormula(c))).join(',');
}

/** Header row plus data rows, every cell neutralised then quoted, each line ending in CRLF. */
export function encodeCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => encodeRow(r) + '\r\n').join('');
}

/**
 * RFC 4180 parser. Accepts CRLF, LF or CR line breaks, quoted fields with doubled quotes
 * and line breaks inside quotes. A final line break does not create an extra record.
 * Does not apply `denormalise`.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let rowStarted = false; // true once the current record has any content or delimiter

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rowStarted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      rowStarted = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (rowStarted || field !== '') {
        row.push(field);
        records.push(row);
      }
      row = [];
      field = '';
      rowStarted = false;
    } else {
      field += ch;
      rowStarted = true;
    }
  }
  if (rowStarted || field !== '') {
    row.push(field);
    records.push(row);
  }
  return records;
}
