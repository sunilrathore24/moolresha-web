import { describe, expect, it } from 'vitest';
import { PAGE_SECTIONS } from '../../src/content/config/allow-lists';
import { extractPage } from '../../src/lib/content-rules/html';
import { cc13, cc14, cc15, cc16 } from '../../src/lib/content-rules/structure-rules';
import type { CheckContext } from '../../src/lib/content-rules/types';

const FIVE = [
  'mens-cotton-shirt',
  'mens-cotton-linen-shirt',
  'mens-linen-shirt',
  'mens-relaxed-pant',
  'womens-coord-set',
];

type Part = { fibre: string; percent: number };
const COTTON: Part[] = [{ fibre: 'cotton', percent: 100 }];

function concept(id: string, order: number, over: Record<string, unknown> = {}) {
  return { id, order, featured: id === 'mens-cotton-shirt', fabricNotes: { composition: COTTON }, ...over };
}

function fiveConcepts() {
  return FIVE.map((id, i) => concept(id, i + 1));
}

function ctx(over: { concepts?: unknown[]; pages?: { path: string; html: string }[] } = {}): CheckContext {
  return {
    concepts: over.concepts ?? fiveConcepts(),
    pages: (over.pages ?? []).map((p) => extractPage(p.path, p.html)),
  } as unknown as CheckContext;
}

const coord = (parts: Part[]) =>
  ctx({ concepts: FIVE.map((id, i) => concept(id, i + 1, id === 'womens-coord-set' ? { fabricNotes: { composition: parts } } : {})) });

describe('CC-13 co-ord composition', () => {
  it('accepts 100% cotton', () => {
    expect(cc13(coord(COTTON))).toEqual([]);
  });

  it('accepts cotton with 10, 15 and 20% linen', () => {
    for (const linen of [10, 15, 20]) {
      expect(
        cc13(coord([{ fibre: 'cotton', percent: 100 - linen }, { fibre: 'linen', percent: linen }])),
      ).toEqual([]);
    }
  });

  it('rejects linen below 10% or above 20%', () => {
    for (const linen of [5, 9, 21, 50]) {
      const v = cc13(coord([{ fibre: 'cotton', percent: 100 - linen }, { fibre: 'linen', percent: linen }]));
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ rule: 'CC-13', target: 'womens-coord-set' });
    }
  });

  it('rejects another fibre and parts that do not sum to 100', () => {
    expect(cc13(coord([{ fibre: 'cotton', percent: 80 }, { fibre: 'polyester', percent: 20 }]))).toHaveLength(1);
    expect(cc13(coord([{ fibre: 'cotton', percent: 80 }, { fibre: 'linen', percent: 15 }]))).toHaveLength(1);
  });

  it('ignores the other Concepts', () => {
    const c = ctx({
      concepts: FIVE.map((id, i) => concept(id, i + 1, { fabricNotes: { composition: [{ fibre: 'linen', percent: 100 }] } })),
    });
    expect(cc13(c)).toHaveLength(1);
    expect(cc13(c)[0]!.target).toBe('womens-coord-set');
  });
});

describe('CC-14 concept set', () => {
  it('accepts the five Concepts with the shirt first and featured', () => {
    expect(cc14(ctx())).toEqual([]);
  });

  it('flags a missing Concept', () => {
    const v = cc14(ctx({ concepts: fiveConcepts().slice(0, 4) }));
    expect(v.some((x) => x.target === 'womens-coord-set' && /missing/.test(x.detail))).toBe(true);
  });

  it('flags an unknown and a sixth Concept', () => {
    const v = cc14(ctx({ concepts: [...fiveConcepts(), concept('mens-silk-shirt', 6)] }));
    expect(v.some((x) => x.target === 'mens-silk-shirt')).toBe(true);
    expect(v.some((x) => x.target === 'concepts' && /exactly 5/.test(x.detail))).toBe(true);
  });

  it('flags a duplicate Concept', () => {
    const v = cc14(ctx({ concepts: [...fiveConcepts().slice(0, 4), concept('mens-relaxed-pant', 5)] }));
    expect(v.some((x) => x.target === 'mens-relaxed-pant' && /2 times/.test(x.detail))).toBe(true);
  });

  it('flags the shirt when it is not first', () => {
    const concepts = fiveConcepts().map((c, i) => ({ ...c, order: i === 0 ? 2 : i === 1 ? 1 : c.order }));
    const v = cc14(ctx({ concepts }));
    expect(v.some((x) => x.target === 'mens-cotton-shirt' && /first/.test(x.detail))).toBe(true);
    expect(v.some((x) => x.target === 'mens-cotton-linen-shirt' && /order 1/.test(x.detail))).toBe(true);
  });

  it('flags the shirt when it is not featured', () => {
    const concepts = fiveConcepts().map((c) => (c.id === 'mens-cotton-shirt' ? { ...c, featured: false } : c));
    expect(cc14(ctx({ concepts })).some((x) => x.target === 'mens-cotton-shirt' && /featured/.test(x.detail))).toBe(true);
  });

  it('flags a second featured Concept', () => {
    const concepts = fiveConcepts().map((c) => (c.id === 'mens-relaxed-pant' ? { ...c, featured: true } : c));
    expect(cc14(ctx({ concepts })).some((x) => x.target === 'mens-relaxed-pant' && /featured/.test(x.detail))).toBe(true);
  });

  it('flags repeated order numbers', () => {
    const concepts = fiveConcepts().map((c) => (c.id === 'womens-coord-set' ? { ...c, order: 4 } : c));
    expect(cc14(ctx({ concepts })).some((x) => x.target === 'concepts' && /1 to 5/.test(x.detail))).toBe(true);
  });
});

describe('CC-15 section order', () => {
  const page = (sections: readonly string[]) => ({
    path: '/index.html',
    html: `<html><body>${sections.map((s) => `<section data-section="${s}"></section>`).join('')}</body></html>`,
  });
  const run = (sections: readonly string[]) => cc15(ctx({ pages: [page(sections)] }));

  it('accepts the four sections in order', () => {
    expect(PAGE_SECTIONS).toHaveLength(4);
    expect(run(PAGE_SECTIONS)).toEqual([]);
  });

  it('reports a missing section', () => {
    const v = run(PAGE_SECTIONS.filter((s) => s !== 'nav-cards'));
    expect(v.map((x) => x.detail)).toContain('missing data-section "nav-cards"');
    expect(v.every((x) => x.rule === 'CC-15' && x.target === '/index.html')).toBe(true);
  });

  it('reports an extra section such as a standalone market context', () => {
    const list = [...PAGE_SECTIONS];
    list.splice(5, 0, 'market-context' as never);
    expect(run(list).map((x) => x.detail)).toContain('extra data-section "market-context" is not in the required list');
  });

  it('reports a duplicate section', () => {
    const v = run([...PAGE_SECTIONS.slice(0, 3), 'nav-cards', ...PAGE_SECTIONS.slice(3)]);
    expect(v.some((x) => /"nav-cards" appears 2 times/.test(x.detail))).toBe(true);
  });

  it('reports swapped sections', () => {
    const list = [...PAGE_SECTIONS];
    [list[1], list[2]] = [list[2]!, list[1]!];
    const v = run(list);
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/out of order/);
  });

  it('reports a missing /index.html', () => {
    const v = cc15(ctx({ pages: [{ path: '/privacy/index.html', html: '<p>x</p>' }] }));
    expect(v).toHaveLength(1);
    expect(v[0]!.target).toBe('/index.html');
  });
});

describe('CC-16 market context in the Concept_Card', () => {
  const SUMMARY = 'See what similar pieces cost';
  const price = '<fieldset data-price-question><legend>Price</legend></fieldset>';
  const market = (id: string, over: { tag?: string; open?: boolean; summary?: string | null } = {}) => {
    const tag = over.tag ?? 'details';
    const summary = over.summary === null ? '' : `<summary>${over.summary ?? SUMMARY}</summary>`;
    return `<${tag} class="market-context" data-market-for="${id}"${over.open ? ' open' : ''}>${summary}<p>Range</p></${tag}>`;
  };
  const card = (id: string, inner: string) =>
    `<article data-concept-card data-concept-id="${id}"><div data-angle-viewer data-concept-id="${id}"></div>${inner}</article>`;
  const run = (body: string) =>
    cc16(ctx({ pages: [{ path: '/index.html', html: `<html><body><section data-section="concepts">${body}</section></body></html>` }] }));

  it('accepts a correctly built card', () => {
    expect(run(card('mens-cotton-shirt', price + market('mens-cotton-shirt')))).toEqual([]);
  });

  it('accepts several correct cards', () => {
    const body = FIVE.map((id) => card(id, price + market(id))).join('');
    expect(run(body)).toEqual([]);
  });

  it('flags a context placed before the price question', () => {
    const v = run(card('mens-cotton-shirt', market('mens-cotton-shirt') + price));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-16', target: 'mens-cotton-shirt' });
    expect(v[0]!.detail).toMatch(/before fieldset/);
  });

  it('flags an open context', () => {
    const v = run(card('mens-linen-shirt', price + market('mens-linen-shirt', { open: true })));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ target: 'mens-linen-shirt' });
    expect(v[0]!.detail).toMatch(/open/);
  });

  it('flags a wrong summary and a missing summary', () => {
    const wrong = run(card('mens-relaxed-pant', price + market('mens-relaxed-pant', { summary: 'Show prices' })));
    expect(wrong).toHaveLength(1);
    expect(wrong[0]!.detail).toMatch(/summary reads "Show prices"/);
    const none = run(card('mens-relaxed-pant', price + market('mens-relaxed-pant', { summary: null })));
    expect(none).toHaveLength(1);
    expect(none[0]!.detail).toMatch(/no <summary>/);
  });

  it('accepts summary text with extra whitespace', () => {
    expect(run(card('mens-cotton-shirt', price + market('mens-cotton-shirt', { summary: '  See what\n similar pieces   cost ' })))).toEqual([]);
  });

  it('flags a wrong data-market-for', () => {
    const v = run(card('mens-cotton-shirt', price + market('mens-linen-shirt')));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ target: 'mens-cotton-shirt' });
    expect(v[0]!.detail).toMatch(/data-market-for is "mens-linen-shirt", expected "mens-cotton-shirt"/);
  });

  it('flags a context that is not a <details>', () => {
    const v = run(card('mens-cotton-shirt', price + market('mens-cotton-shirt', { tag: 'div' })));
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/must be a <details>/);
  });

  it('flags two contexts in one card', () => {
    const v = run(card('mens-cotton-shirt', price + market('mens-cotton-shirt') + market('mens-cotton-shirt')));
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/exactly one .*found 2/);
  });

  it('flags a card with no context', () => {
    const v = run(card('mens-cotton-shirt', price));
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/found 0/);
  });

  it('flags a context outside every card', () => {
    const body = card('mens-cotton-shirt', price + market('mens-cotton-shirt')) + market('mens-relaxed-pant');
    const v = run(body);
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/outside every Concept_Card/);
  });

  it('flags a standalone market-context section', () => {
    const html = `<html><body><section data-section="market">${market('mens-cotton-shirt')}</section></body></html>`;
    expect(cc16(ctx({ pages: [{ path: '/index.html', html }] }))).toHaveLength(1);
  });

  it('ignores pages without cards or contexts', () => {
    expect(cc16(ctx({ pages: [{ path: '/privacy/index.html', html: '<p>hello</p>' }] }))).toEqual([]);
  });
});
