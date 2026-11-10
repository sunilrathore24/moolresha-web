/**
 * Unit tests for Content_Check price rules CC-07 and CC-08 (task 9.11).
 * Requirements 6.3, 6.7, 9.8.
 */
import { describe, expect, it } from 'vitest';
import { extractPage } from '../../src/lib/content-rules/html';
import {
  extractPriceLayersSections,
  findRupeeAmountsOutsideFact,
  RUPEE_AMOUNT,
} from '../../src/lib/content-rules/price-layers';
import { cc07, cc08 } from '../../src/lib/content-rules/price-rules';
import type { CheckContext } from '../../src/lib/content-rules/types';
import type { ConceptData } from '../../src/lib/concept-schema';
import type { PriceBand } from '../../src/lib/price-bands';

const GST = 'gst-cliff-2025';

/** A price-layers subtree with `extra` placed in the body and `gst` inside the GST fact. */
function section(opts: { extra?: string; gst?: string; other?: string } = {}): string {
  return (
    `<section data-section="price-layers">` +
    `<h2>What goes into a price</h2>` +
    `<ol><li data-layer="fabric"><strong>Fabric</strong> <span>The cloth itself.</span></li>` +
    `<li data-layer="gst"><strong>GST</strong> <span>Tax on the finished piece.</span></li></ol>` +
    `<p>Our aim, not a promise yet: a real cost breakdown for every piece, once pricing is settled.</p>` +
    (opts.extra ?? '') +
    `<p><span class="fact" data-fact-id="${GST}">${opts.gst ?? 'Garments up to ₹2,500 attract 5% GST and above ₹2,500 attract 18%.'}</span></p>` +
    (opts.other ? `<p><span class="fact" data-fact-id="other-fact">${opts.other}</span></p>` : '') +
    `</section>`
  );
}

const texts = (html: string): string[] => findRupeeAmountsOutsideFact(html, GST).map((f) => f.text);

describe('RUPEE_AMOUNT', () => {
  it.each(['₹2,500', '₹ 2500', 'Rs 999', 'Rs.1,200', 'rs. 50', 'INR 500', 'inr800'])('matches %s', (s) => {
    expect(RUPEE_AMOUNT.test(s)).toBe(true);
  });

  it.each(['18% GST', 'versions', 'cars 5', 'no amount here'])('does not match %s', (s) => {
    expect(RUPEE_AMOUNT.test(s)).toBe(false);
  });
});

describe('findRupeeAmountsOutsideFact', () => {
  it('passes a section whose only amounts are inside the GST fact', () => {
    expect(texts(section())).toEqual([]);
  });

  it('does not flag a percentage on its own', () => {
    expect(texts(section({ extra: '<p>GST is 5% or 18% depending on the price.</p>' }))).toEqual([]);
  });

  it('flags an amount in visible text and reports the matched text', () => {
    expect(texts(section({ extra: '<p>Fabric costs ₹450 per piece.</p>' }))).toEqual(['₹450']);
  });

  it('flags an amount inside a different .fact', () => {
    expect(texts(section({ other: 'Similar pieces cost about ₹1,500.' }))).toEqual(['₹1,500']);
  });

  it('flags an amount that starts inside the GST fact and ends outside it', () => {
    const html =
      `<section data-section="price-layers"><p><span class="fact" data-fact-id="${GST}">Up to ₹</span>2,500 attract 5%.</p></section>`;
    expect(texts(html)).toHaveLength(1);
  });

  it('flags an amount split by an inline element', () => {
    expect(texts(section({ extra: '<p>Cost ₹<em>1,200</em> here.</p>' }))).toEqual(['₹1,200']);
  });

  it.each([
    ['alt', '<img src="/x.png" alt="Bar showing ₹1,499 total">', '₹1,499'],
    ['title', '<p title="Costs Rs 999">text</p>', 'Rs 999'],
    ['aria-label', '<button aria-label="Pay INR 500 now">go</button>', 'INR 500'],
  ])('flags an amount in %s', (_channel, extra, expected) => {
    const found = findRupeeAmountsOutsideFact(section({ extra }), GST);
    expect(found.map((f) => f.text)).toEqual([expected]);
    expect(found[0]?.channel).toBe(_channel);
  });

  it('does not flag an attribute amount on an element inside the GST fact', () => {
    const html =
      `<section data-section="price-layers"><span class="fact" data-fact-id="${GST}">` +
      `<abbr title="Up to ₹2,500">limit</abbr></span></section>`;
    expect(texts(html)).toEqual([]);
  });

  it.each([
    ['₹2,500', '₹2,500'],
    ['₹ 2500', '₹ 2500'],
    ['Rs. 18,00,000', 'Rs. 18,00,000'],
    ['Rs.1,200', 'Rs.1,200'],
    ['INR 500', 'INR 500'],
    ['inr800', 'inr800'],
    ['₹1,499.50', '₹1,499.50'],
    ['₹2500.', '₹2500'],
  ])('reports the full amount for %s', (written, expected) => {
    expect(texts(section({ extra: `<p>Costs ${written}</p>` }))).toEqual([expected]);
  });

  it('reports every amount when there are several', () => {
    expect(texts(section({ extra: '<p>₹10 and Rs 20 and INR 30</p>' }))).toEqual(['₹10', 'Rs 20', 'INR 30']);
  });
});

describe('extractPriceLayersSections', () => {
  it('returns only the price-layers subtree of a page', () => {
    const page =
      `<!doctype html><html><body><section data-section="money"><p>₹5</p></section>${section()}</body></html>`;
    const sections = extractPriceLayersSections(page);
    expect(sections).toHaveLength(1);
    expect(findRupeeAmountsOutsideFact(sections[0] as string, GST)).toEqual([]);
  });

  it('returns nothing when the page has no such section', () => {
    expect(extractPriceLayersSections('<html><body><p>hi</p></body></html>')).toEqual([]);
  });
});

/* ---------- CC-08 ---------- */

function ctxWithPages(pages: { path: string; html: string }[]): CheckContext {
  return { pages: pages.map((p) => extractPage(p.path, p.html)) } as unknown as CheckContext;
}

describe('CC-08 price-layers-no-amounts', () => {
  const page = (inner: string) => `<!doctype html><html><body><main>${inner}</main></body></html>`;

  it('passes when the amounts are only inside the GST fact', () => {
    expect(cc08(ctxWithPages([{ path: '/index.html', html: page(section()) }]))).toEqual([]);
  });

  it('passes a page without the price-layers section', () => {
    expect(cc08(ctxWithPages([{ path: '/index.html', html: page('<p>Nothing here ₹5</p>') }]))).toEqual([]);
  });

  it('passes when there is no /index.html page', () => {
    expect(cc08(ctxWithPages([{ path: '/privacy/index.html', html: page(section({ extra: '<p>₹5</p>' })) }]))).toEqual([]);
  });

  it('ignores amounts outside the price-layers section', () => {
    const html = page(`<section data-section="money"><p>About ₹450</p></section>${section()}`);
    expect(cc08(ctxWithPages([{ path: '/index.html', html }]))).toEqual([]);
  });

  it('reports the matched text, the page and the rule id', () => {
    const v = cc08(ctxWithPages([{ path: '/index.html', html: page(section({ extra: '<p>Making is Rs. 300.</p>' })) }]));
    expect(v).toHaveLength(1);
    expect(v[0]?.rule).toBe('CC-08');
    expect(v[0]?.target).toBe('/index.html');
    expect(v[0]?.detail).toContain('Rs. 300');
  });

  it('reports an amount in alt text', () => {
    const v = cc08(
      ctxWithPages([{ path: '/index.html', html: page(section({ extra: '<img src="/a.png" alt="Costs ₹99">' })) }]),
    );
    expect(v.map((x) => x.detail).join('\n')).toContain('₹99');
  });
});

/* ---------- CC-07 ---------- */

function concept(id: string, name: string, priceBands: PriceBand[]): ConceptData {
  return { id, name, priceBands } as unknown as ConceptData;
}

const validLadder: PriceBand[] = [
  { kind: 'under', id: 'x-under-1000', upper: 1000 },
  { kind: 'range', id: 'x-1000-1499', lower: 1000, upper: 1499 },
  { kind: 'range', id: 'x-1500-1999', lower: 1500, upper: 1999 },
  { kind: 'over', id: 'x-2000-plus', lower: 2000 },
];

const ctxWithConcepts = (concepts: ConceptData[]): CheckContext => ({ concepts }) as unknown as CheckContext;

describe('CC-07 price-band-contiguity', () => {
  it('passes valid ladders', () => {
    expect(cc07(ctxWithConcepts([concept('mens-cotton-shirt', "Men's cotton shirt", validLadder)]))).toEqual([]);
  });

  it('names the Concept for a gap', () => {
    const gap: PriceBand[] = [
      { kind: 'under', id: 'x-under-1000', upper: 1000 },
      { kind: 'range', id: 'x-1200-1499', lower: 1200, upper: 1499 },
      { kind: 'over', id: 'x-1500-plus', lower: 1500 },
    ];
    const v = cc07(ctxWithConcepts([concept('mens-relaxed-pant', "Men's relaxed pant", gap)]));
    expect(v).toHaveLength(1);
    expect(v[0]?.rule).toBe('CC-07');
    expect(v[0]?.target).toBe('mens-relaxed-pant');
    expect(v[0]?.detail).toContain("Men's relaxed pant");
    expect(v[0]?.detail).toContain('gap');
  });

  it('names the Concept for an overlap', () => {
    const overlap: PriceBand[] = [
      { kind: 'under', id: 'x-under-1000', upper: 1000 },
      { kind: 'range', id: 'x-1000-1499', lower: 1000, upper: 1499 },
      { kind: 'range', id: 'x-1200-1999', lower: 1200, upper: 1999 },
      { kind: 'over', id: 'x-2000-plus', lower: 2000 },
    ];
    const v = cc07(ctxWithConcepts([concept('womens-coord-set', "Women's co-ord set", overlap)]));
    expect(v).toHaveLength(1);
    expect(v[0]?.target).toBe('womens-coord-set');
    expect(v[0]?.detail).toContain('overlap');
  });

  it('names the Concept for an unsorted ladder', () => {
    const unsorted: PriceBand[] = [
      { kind: 'under', id: 'x-under-1000', upper: 1000 },
      { kind: 'range', id: 'x-1500-1999', lower: 1500, upper: 1999 },
      { kind: 'range', id: 'x-1000-1499', lower: 1000, upper: 1499 },
      { kind: 'over', id: 'x-2000-plus', lower: 2000 },
    ];
    const v = cc07(ctxWithConcepts([concept('mens-linen-shirt', "Men's linen shirt", unsorted)]));
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.target === 'mens-linen-shirt')).toBe(true);
    expect(v.map((x) => x.detail).join('\n')).toMatch(/not_ascending|gap|overlap/);
  });

  it('reports only the broken Concept when others are valid', () => {
    const broken: PriceBand[] = validLadder.slice(0, 3); // no "over" band
    const v = cc07(
      ctxWithConcepts([
        concept('mens-cotton-shirt', "Men's cotton shirt", validLadder),
        concept('mens-cotton-linen-shirt', "Men's cotton-linen shirt", broken),
      ]),
    );
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.target === 'mens-cotton-linen-shirt')).toBe(true);
    expect(v[0]?.detail).toContain('missing_over');
  });
});
