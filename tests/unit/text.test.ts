import { describe, expect, it } from 'vitest';
import { escapeHtml, normaliseText, unescapeHtml } from '../../src/lib/text';

describe('normaliseText', () => {
  it('composes to NFC', () => {
    expect(normaliseText('e\u0301')).toBe('\u00e9');
  });

  it('strips control characters', () => {
    expect(normaliseText('a\u0000b\u0007c\td\ne\u007ff\u0085g')).toBe('abcdefg');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseText('  hello world \u00a0')).toBe('hello world');
  });

  it('is idempotent', () => {
    const once = normaliseText(' e\u0000\u0301x ');
    expect(normaliseText(once)).toBe(once);
  });

  it('keeps plain markup characters unchanged (stored plainly)', () => {
    expect(normaliseText('<b>"a" & \'b\'</b>')).toBe('<b>"a" & \'b\'</b>');
  });
});

describe('escapeHtml / unescapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;',
    );
  });

  it('round-trips, including text that already looks like entities', () => {
    for (const s of ['', 'plain', '&lt;', '&amp;lt;', '&#39;', 'a & b < c > d "e" \'f\'', 'नमस्ते & <b>']) {
      expect(unescapeHtml(escapeHtml(s))).toBe(s);
    }
  });

  it('leaves no raw < > " \' or bare & in the output', () => {
    const out = escapeHtml('<&>"\'&amp;');
    expect(out).not.toMatch(/[<>"']/);
    expect(out).not.toMatch(/&(?!(amp|lt|gt|quot|#39);)/);
  });
});
