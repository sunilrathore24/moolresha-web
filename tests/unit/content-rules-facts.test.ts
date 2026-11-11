import { describe, expect, it } from 'vitest';
import { cc01, cc02, cc09 } from '../../src/lib/content-rules/fact-rules';
import { extractPage } from '../../src/lib/content-rules/html';
import type { CheckContext } from '../../src/lib/content-rules/types';
import type { FactEntry } from '../../src/lib/fact-schema';

function fact(over: Record<string, unknown> = {}): FactEntry {
  return {
    id: 'f-one',
    label: 'FACT',
    text: 'A sourced sentence.',
    strength: 'STRONG',
    lastChecked: '2026-01-01',
    verifyFlag: false,
    substantiates: [],
    section: 'journey',
    source: { name: 'Source', url: 'https://example.org/x', date: '2025-09' },
    ...over,
  } as FactEntry;
}

function ctx(
  over: Partial<CheckContext> = {},
  numericAllow: string[] = [],
  launchExceptions: string[] = [],
): CheckContext {
  return {
    facts: [],
    pages: [],
    wordRules: {
      restricted: ['x'],
      superlatives: ['x'],
      numericAllow,
      restrictedPhrases: ['x'],
      healthTerms: ['x'],
      launchExceptions,
    },
    ...over,
  } as unknown as CheckContext;
}

const page = (body: string, path = '/index.html') =>
  extractPage(path, `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`);

describe('CC-01 fact completeness', () => {
  it('passes complete entries', () => {
    const est = fact({ id: 'e', label: 'MoolResha estimate', source: undefined, assumptions: ['a'] });
    const scan = fact({ id: 's', label: 'MoolResha market scan', source: undefined, methodNote: { listings: 3 } });
    expect(cc01(ctx({ facts: [fact(), est, scan] }))).toEqual([]);
  });

  it('names an entry with no source', () => {
    const v = cc01(ctx({ facts: [fact({ id: 'no-src', source: undefined })] }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-01', target: 'no-src' });
    expect(v[0].detail).toContain('Source_Link');
  });

  it('names an estimate with no assumptions and an entry with no date', () => {
    const v = cc01(
      ctx({
        facts: [
          fact({ id: 'est', label: 'MoolResha estimate', source: undefined, assumptions: [] }),
          fact({ id: 'nodate', lastChecked: '' }),
        ],
      }),
    );
    expect(v.map((x) => x.target)).toEqual(['est', 'nodate']);
  });
});

describe('CC-02 unverified facts', () => {
  const unverified = fact({ id: 'shaky', verifyFlag: true });

  it('passes an unverified fact that no page references', () => {
    const pages = [page('<p>plain</p>')];
    expect(cc02(ctx({ facts: [unverified], pages }))).toEqual([]);
  });

  it('fails an unverified fact a page references, naming the entry and page', () => {
    const pages = [page('<span class="fact" data-fact-id="shaky">x</span>', '/a/index.html')];
    const v = cc02(ctx({ facts: [unverified], pages }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-02', target: 'shaky' });
    expect(v[0].detail).toContain('/a/index.html');
  });

  it('passes a referenced unverified fact whose id is in wordRules.launchExceptions', () => {
    const pages = [page('<span class="fact" data-fact-id="shaky">x</span>', '/a/index.html')];
    expect(cc02(ctx({ facts: [unverified], pages }, [], ['shaky']))).toEqual([]);
  });

  it('does not let one launchExceptions id exempt a different unverified fact', () => {
    const pages = [page('<span class="fact" data-fact-id="shaky">x</span>', '/a/index.html')];
    const v = cc02(ctx({ facts: [unverified], pages }, [], ['some-other-id']));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-02', target: 'shaky' });
  });

  it('fails strength UNVERIFIED too, and ignores verified facts', () => {
    const pages = [page('<span class="fact" data-fact-id="u">x</span><span class="fact" data-fact-id="f-one">y</span>')];
    const v = cc02(ctx({ facts: [fact({ id: 'u', strength: 'UNVERIFIED' }), fact()], pages }));
    expect(v.map((x) => x.target)).toEqual(['u']);
  });
});

describe('CC-09 free-standing numeric claims', () => {
  const run = (body: string, numericAllow: string[] = []) =>
    cc09(ctx({ pages: [page(body)] }, numericAllow));

  it('passes numbers inside a .fact', () => {
    expect(run('<p><span class="fact" data-fact-id="a">GST is 5% on ₹2,500 in 2025</span></p>')).toEqual([]);
  });

  it('passes plain text with no ₹, % or year', () => {
    expect(run('<p>Eight stops, 40 views and 3 colours</p>')).toEqual([]);
  });

  it('flags ₹1,200, 40% and 2025 once each, with the page', () => {
    const v = run('<p>Costs ₹1,200 here, 40% there, since 2025.</p>');
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.rule === 'CC-09' && x.target === '/index.html')).toBe(true);
    expect(v.map((x) => x.detail).join('|')).toContain('₹1,200');
    expect(v.map((x) => x.detail).join('|')).toContain('40%');
    expect(v.map((x) => x.detail).join('|')).toContain('2025');
  });

  it('allows numbers inside the price fieldset', () => {
    const body =
      '<fieldset data-price-question><label><input type="radio"> Under ₹1,000</label>' +
      '<label><input type="radio"> ₹1,500–1,999</label></fieldset><p>Free 20%</p>';
    const v = run(body);
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain('20%');
  });

  it('still treats a fact after the price fieldset as a fact', () => {
    const body =
      '<fieldset data-price-question><label>₹500</label></fieldset>' +
      '<p><span class="fact" data-fact-id="a">about ₹900</span></p>';
    expect(run(body)).toEqual([]);
  });

  it('honours numericAllow', () => {
    expect(run('<p>Open 24% of the time</p>', ['24%'])).toEqual([]);
    expect(run('<p>Open 25% of the time</p>', ['24%'])).toHaveLength(1);
  });

  it('finds numbers split across inline elements', () => {
    const v = run('<p>about <em>40</em>%</p>');
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain('40%');
  });

  it('flags a number that straddles the edge of a fact', () => {
    const v = run('<p><span class="fact" data-fact-id="a">price ₹1</span>,200</p>');
    expect(v.length).toBeGreaterThan(0);
  });

  it('reports each page separately', () => {
    const v = cc09(ctx({ pages: [page('<p>10%</p>', '/a.html'), page('<p>ok</p>', '/b.html'), page('<p>11%</p>', '/c.html')] }));
    expect(v.map((x) => x.target)).toEqual(['/a.html', '/c.html']);
  });

  describe('structural exemptions', () => {
    it('allows "100% <fibre>" as a whole-garment fibre label, in any case', () => {
      expect(run('<p>The tag says 100% Linen. A 100% cotton shirt.</p>')).toEqual([]);
    });

    it('still flags 100% when no fibre follows, or another word does', () => {
      const bare = run('<p>100% of buyers agreed</p>');
      expect(bare).toHaveLength(1);
      expect(bare[0].detail).toContain('100%');
      expect(run('<p>Rated 100% polyester</p>')).toHaveLength(1);
      expect(run('<p>100% cottonwood</p>')).toHaveLength(1);
    });

    it('does not exempt a partial percentage outside [data-composition], even next to a fibre', () => {
      const v = run('<p>40% cotton buyers</p>');
      expect(v).toHaveLength(1);
      expect(v[0].detail).toContain('40%');
    });

    it('allows a composition split inside [data-composition]', () => {
      expect(run('<dl><dd data-composition>60% cotton, 40% linen</dd></dl>')).toEqual([]);
    });

    it('flags other claims next to a [data-composition] element', () => {
      const v = run('<dd data-composition>60% cotton, 40% linen</dd><p>40% off today</p>');
      expect(v).toHaveLength(1);
      expect(v[0].detail).toContain('40%');
    });

    it('does not let [data-composition] cover a ₹ amount outside it', () => {
      const v = run('<dd data-composition>60% cotton</dd><p>₹1,200</p>');
      expect(v).toHaveLength(1);
      expect(v[0].detail).toContain('₹1,200');
    });

    it('allows a year inside <time> whose datetime holds that year', () => {
      expect(run('<p>Last updated: <time datetime="2026-11-07">7 Nov 2026</time></p>')).toEqual([]);
      expect(run('<small>© <time datetime="2026">2026</time> MoolResha</small>')).toEqual([]);
    });

    it('flags a year in <time> whose datetime holds another year, and a year outside <time>', () => {
      expect(run('<time datetime="2025-01-01">1 Jan 2026</time>')).toHaveLength(1);
      expect(run('<p>Since 2026 <time datetime="2026-01-01">1 Jan</time></p>')).toHaveLength(1);
      expect(run('<time>2026</time>')).toHaveLength(1);
    });

    it('does not let <time> cover a % or ₹ claim', () => {
      const v = run('<time datetime="2026-11-07">7 Nov 2026, up 40%</time>');
      expect(v).toHaveLength(1);
      expect(v[0].detail).toContain('40%');
    });
  });
});
