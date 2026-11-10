import { describe, expect, it } from 'vitest';
import { denormalise, encodeCsv, encodeField, neutraliseFormula, parseCsv } from '../../src/lib/csv';

describe('neutraliseFormula', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('prefixes %j', (v) => {
    expect(neutraliseFormula(v)).toBe(`'${v}`);
  });

  it('adds an extra quote to values that already start with one', () => {
    expect(neutraliseFormula("'abc")).toBe("''abc");
  });

  it('leaves ordinary values alone', () => {
    expect(neutraliseFormula('hello')).toBe('hello');
    expect(neutraliseFormula('')).toBe('');
    expect(neutraliseFormula('a=b')).toBe('a=b');
  });
});

describe('denormalise', () => {
  it('reverses neutraliseFormula for trigger and quote values', () => {
    for (const v of ['=1+1', '+1', '-1', '@x', '\tx', '\rx', "'abc", "''x", "'", '', 'plain']) {
      expect(denormalise(neutraliseFormula(v))).toBe(v);
    }
  });

  it('does not strip a quote that is not followed by a trigger or quote', () => {
    expect(denormalise("'abc")).toBe("'abc");
  });
});

describe('encodeField', () => {
  it('leaves simple values unquoted', () => {
    expect(encodeField('abc')).toBe('abc');
  });

  it('quotes commas, quotes, line breaks and edge spaces, doubling quotes', () => {
    expect(encodeField('a,b')).toBe('"a,b"');
    expect(encodeField('say "hi"')).toBe('"say ""hi"""');
    expect(encodeField('a\nb')).toBe('"a\nb"');
    expect(encodeField('a\rb')).toBe('"a\rb"');
    expect(encodeField(' a')).toBe('" a"');
    expect(encodeField('a ')).toBe('"a "');
  });
});

describe('encodeCsv', () => {
  it('uses CRLF and ends every record with one', () => {
    expect(encodeCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('neutralises formulas in cells', () => {
    expect(encodeCsv(['t'], [['=HYPERLINK("x")']])).toBe('t\r\n"\'=HYPERLINK(""x"")"\r\n');
  });
});

describe('parseCsv', () => {
  it('parses CRLF, LF and CR line breaks', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\r1')).toEqual([['a'], ['1']]);
  });

  it('parses quoted fields with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('"a,b","c""d","e\r\nf"\r\n')).toEqual([['a,b', 'c"d', 'e\r\nf']]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\r\n,\r\n')).toEqual([['a', '', 'c'], ['', '']]);
  });

  it('returns no records for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('CSV round trip', () => {
  const header = ['concept_id', 'other_text', 'price_band_id', 'price_skipped'];
  const rows = [
    ['mens-cotton-shirt', '=cmd|calc', 'b1', ''],
    ['mens-cotton-shirt', '+91 98765, "quoted"', '', '1'],
    ['mens-linen-shirt', '-1', '', ''],
    ['mens-relaxed-pant', '@home', 'b2', ''],
    ['womens-coord-set', '\ttab', '', ''],
    ['womens-coord-set', '\rcr', '', ''],
    ['womens-coord-set', "'already quoted", '', ''],
    ['womens-coord-set', "'=both", '', ''],
    ['womens-coord-set', 'line\nbreak and  ', '', ''],
    ['womens-coord-set', ' ', '', ''],
    ['womens-coord-set', 'नमस्ते', '', ''],
  ];

  it('returns the original records after encode, parse and denormalise', () => {
    const parsed = parseCsv(encodeCsv(header, rows));
    expect(parsed[0]).toEqual(header);
    expect(parsed.slice(1).map((r) => r.map(denormalise))).toEqual(rows);
  });

  it('keeps a single empty column record', () => {
    const parsed = parseCsv(encodeCsv(['x'], [[''], ['a']]));
    expect(parsed).toEqual([['x'], [''], ['a']]);
  });
});
