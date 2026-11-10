import { describe, expect, it } from 'vitest';
import type { ConceptData } from '../../src/lib/concept-schema';
import type { FactEntry } from '../../src/lib/fact-schema';
import { extractPage } from '../../src/lib/content-rules/html';
import type { CheckContext } from '../../src/lib/content-rules/types';
import { cc03, cc04, cc10, cc11, cc12 } from '../../src/lib/content-rules/word-content-rules';

/* ---------- Synthetic fixtures ---------- */

function fact(over: Record<string, unknown> & { id: string }): FactEntry {
  return {
    label: 'FACT',
    text: 'text',
    strength: 'STRONG',
    lastChecked: '2026-01-01',
    verifyFlag: false,
    substantiates: [],
    section: 'other',
    source: { name: 'Source', url: 'https://example.org/', date: '2026' },
    ...over,
  } as unknown as FactEntry;
}

const BANDS = [
  { kind: 'under', id: 'mcs-under-1000', upper: 1000 },
  { kind: 'range', id: 'mcs-1000-1499', lower: 1000, upper: 1499 },
  { kind: 'over', id: 'mcs-1500-plus', lower: 1500 },
];

function concept(over: Record<string, unknown> = {}): ConceptData {
  return {
    id: 'mens-cotton-shirt',
    name: "Men's 100% cotton shirt",
    priceBands: BANDS,
    fabricNotes: {
      composition: [{ fibre: 'cotton', percent: 100 }],
      weave: 'Plain weave',
      weight: '130–150 GSM',
      handFeel: 'Soft',
      softness: 'Soft after washing',
      care: 'Machine wash',
    },
    quality: [],
    ...over,
  } as unknown as ConceptData;
}

function ctxFor(
  htmls: string[],
  opts: { facts?: FactEntry[]; concepts?: ConceptData[]; restricted?: string[]; superlatives?: string[] } = {},
): CheckContext {
  return {
    facts: opts.facts ?? [],
    concepts: opts.concepts ?? [],
    wordRules: {
      restricted: opts.restricted ?? ['sustainable', 'eco', 'eco-friendly', 'green', 'planet-friendly', 'conscious'],
      superlatives: opts.superlatives ?? ['best', 'premium', 'luxury', 'amazing'],
      numericAllow: [],
      restrictedPhrases: ['made in Bangladesh'],
      healthTerms: ['skin-friendly'],
    },
    pages: htmls.map((h, i) => extractPage(i === 0 ? '/index.html' : `/p${i}.html`, h)),
    distFiles: [],
  } as unknown as CheckContext;
}

const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

/* ---------- CC-03 ---------- */

describe('CC-03 greenwashing words', () => {
  const substantiating = fact({ id: 'cert-1', substantiates: ['sustainable'] });

  it('passes when no restricted word appears', () => {
    expect(cc03(ctxFor([page('<p>Plain cotton shirt.</p>')]))).toEqual([]);
  });

  it('fails outside a .fact and names the rule, page and word', () => {
    const v = cc03(ctxFor([page('<p>A sustainable shirt.</p>')]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-03', target: '/index.html' });
    expect(v[0]?.detail).toContain('sustainable');
  });

  it('is case-insensitive', () => {
    expect(cc03(ctxFor([page('<p>SUSTAINABLE and Sustainable</p>')]))).toHaveLength(2);
  });

  it('matches words split by inline elements', () => {
    expect(cc03(ctxFor([page('<p>sus<em>tainable</em> cotton</p>')]))).toHaveLength(1);
  });

  it('matches across line breaks and NBSP inside a hyphenless phrase list entry', () => {
    const v = cc03(ctxFor([page('<p>made\n\u00a0 green\u00a0ish</p>')], { restricted: ['green'] }));
    expect(v).toHaveLength(1);
  });

  it('does not match inside longer words', () => {
    expect(cc03(ctxFor([page('<p>Greenhouse and ecosystem</p>')]))).toEqual([]);
  });

  it('reports "eco-friendly" once, not again as "eco"', () => {
    const v = cc03(ctxFor([page('<p>An eco-friendly shirt.</p>')]));
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain('eco-friendly');
  });

  it('passes inside a .fact whose fact substantiates the word', () => {
    const html = page('<p><span class="fact" data-fact-id="cert-1">A sustainable mill.</span></p>');
    expect(cc03(ctxFor([html], { facts: [substantiating] }))).toEqual([]);
  });

  it('fails inside a .fact that does not substantiate the word', () => {
    const html = page('<p><span class="fact" data-fact-id="other">A sustainable mill.</span></p>');
    const v = cc03(ctxFor([html], { facts: [fact({ id: 'other', substantiates: ['eco'] })] }));
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain('other');
  });

  it('fails when only part of the match lies in the fact', () => {
    const html = page('<p>A sus<span class="fact" data-fact-id="cert-1">tainable</span> mill.</p>');
    expect(cc03(ctxFor([html], { facts: [substantiating] }))).toHaveLength(1);
  });
});

/* ---------- CC-04 ---------- */

describe('CC-04 European linen', () => {
  it('passes when the phrase is absent', () => {
    expect(cc04(ctxFor([page('<p>Linen shirt.</p>')]))).toEqual([]);
  });

  it('fails outside a .fact', () => {
    const v = cc04(ctxFor([page('<p>Made from European linen.</p>')]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-04', target: '/index.html' });
    expect(v[0]?.detail).toContain('European linen');
  });

  it('is case-insensitive and tolerant of line breaks and NBSP', () => {
    expect(cc04(ctxFor([page('<p>EUROPEAN\n linen and european\u00a0LINEN</p>')]))).toHaveLength(2);
  });

  it('matches a phrase split across inline elements', () => {
    expect(cc04(ctxFor([page('<p>European <em>lin</em>en</p>')]))).toHaveLength(1);
  });

  it('passes inside a .fact whose entry has a mill', () => {
    const html = page('<p><span class="fact" data-fact-id="l1">European linen from a named mill.</span></p>');
    expect(cc04(ctxFor([html], { facts: [fact({ id: 'l1', mill: 'Mill A' })] }))).toEqual([]);
  });

  it('passes inside a .fact whose entry has a certification', () => {
    const html = page('<p><span class="fact" data-fact-id="l1">European linen, certified.</span></p>');
    expect(cc04(ctxFor([html], { facts: [fact({ id: 'l1', certification: 'Masters of Linen' })] }))).toEqual([]);
  });

  it('fails inside a .fact with neither mill nor certification', () => {
    const html = page('<p><span class="fact" data-fact-id="l1">European linen.</span></p>');
    expect(cc04(ctxFor([html], { facts: [fact({ id: 'l1' })] }))).toHaveLength(1);
  });

  it('fails inside a .fact whose id is not in the registry', () => {
    const html = page('<p><span class="fact" data-fact-id="missing">European linen.</span></p>');
    expect(cc04(ctxFor([html]))).toHaveLength(1);
  });
});

/* ---------- CC-10 ---------- */

describe('CC-10 tone', () => {
  it('passes plain copy', () => {
    expect(cc10(ctxFor([page('<p>A calm, plain shirt.</p>')]))).toEqual([]);
  });

  it('fails on an exclamation mark', () => {
    const v = cc10(ctxFor([page('<p>Hello there!</p>')]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-10', target: '/index.html' });
    expect(v[0]?.detail).toContain('!');
  });

  it('fails on each superlative, case-insensitively', () => {
    const v = cc10(ctxFor([page('<p>The BEST, Premium, luxury and amazing shirt.</p>')]));
    expect(v.map((x) => x.detail.match(/"(best|premium|luxury|amazing)"/i)?.[1]?.toLowerCase())).toEqual([
      'best',
      'premium',
      'luxury',
      'amazing',
    ]);
  });

  it('matches whole words only', () => {
    expect(cc10(ctxFor([page('<p>Bestow a bestseller</p>')]))).toEqual([]);
  });

  it('matches a superlative split by an inline element', () => {
    expect(cc10(ctxFor([page('<p>pre<em>mium</em> cotton</p>')]))).toHaveLength(1);
  });

  it('exempts a data-quote element', () => {
    const html = page('<blockquote data-quote>"The best linen!" says a label.</blockquote>');
    expect(cc10(ctxFor([html]))).toEqual([]);
  });

  it('exempts text nested inside a data-quote ancestor', () => {
    const html = page('<div data-quote><p>Amazing <em>value</em>!</p></div>');
    expect(cc10(ctxFor([html]))).toEqual([]);
  });

  it('exempts a quoted label inside a sentence, but not the words around it', () => {
    const quoted = page('<li>Composition isn\'t quality. <span data-quote>"100% cotton" and "premium"</span> are starting points.</li>');
    expect(cc10(ctxFor([quoted]))).toEqual([]);
    const bare = page('<li>Composition isn\'t quality. "100%" and "premium" are starting points.</li>');
    expect(cc10(ctxFor([bare]))).toHaveLength(1);
  });

  it('still fails on text outside the data-quote element', () => {
    const html = page('<blockquote data-quote>Best!</blockquote><p>Premium!</p>');
    const v = cc10(ctxFor([html]));
    expect(v).toHaveLength(2); // "!" and "Premium" from the second paragraph only
    expect(v.every((x) => !x.detail.includes('Best'))).toBe(true);
  });

  it('does not read script content', () => {
    expect(cc10(ctxFor([page('<script>var a = !b;</script><p>Fine.</p>')]))).toEqual([]);
  });
});

/* ---------- CC-11 ---------- */

describe('CC-11 commerce words', () => {
  const card = (inner: string) =>
    `<article class="concept-card" data-concept-id="mens-cotton-shirt">${inner}</article>`;
  const withConcepts = { concepts: [concept()] };

  it('passes clean cards and sections', () => {
    const html = page(
      `${card('<h3>Concept, not for sale</h3>')}<section data-section="price-layers"><ol><li>Fabric pays for cloth.</li></ol></section>`,
    );
    expect(cc11(ctxFor([html], withConcepts))).toEqual([]);
  });

  it.each(['Buy', 'Add to cart', 'Pre-order', 'Order now', 'Launch price'])(
    'fails on "%s" inside a Concept_Card',
    (word) => {
      const v = cc11(ctxFor([page(card(`<button>${word}</button>`))], withConcepts));
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ rule: 'CC-11', target: '/index.html' });
      expect(v[0]?.detail).toContain('mens-cotton-shirt');
    },
  );

  it('also finds cards marked with data-concept-card', () => {
    const html = page('<div data-concept-card data-concept-id="x"><p>BUY it</p></div>');
    expect(cc11(ctxFor([html], withConcepts))).toHaveLength(1);
  });

  it('handles line breaks, NBSP and inline splits', () => {
    const html = page(card('<p>add\n\u00a0to <em>ca</em>rt</p>'));
    expect(cc11(ctxFor([html], withConcepts))).toHaveLength(1);
  });

  it('does not flag commerce words outside cards and Price_Layers', () => {
    expect(cc11(ctxFor([page('<p>Where to buy a linen shirt.</p>')], withConcepts))).toEqual([]);
  });

  it('does not flag "buy" as part of another word', () => {
    expect(cc11(ctxFor([page(card('<p>Buyer guide</p>'))], withConcepts))).toEqual([]);
  });

  it('finds commerce words in alt and aria-label inside a card', () => {
    const html = page(card('<img src="a.png" alt="Buy now"><button aria-label="Add to cart">+</button>'));
    expect(cc11(ctxFor([html], withConcepts))).toHaveLength(2);
  });

  it('fails on offer, discount and "% off" inside Price_Layers', () => {
    const html = page(
      '<section data-section="price-layers"><ol><li>Special offer</li><li>A discount</li><li>20% off</li></ol></section>',
    );
    const v = cc11(ctxFor([html], withConcepts));
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.detail.includes('Price_Layers'))).toBe(true);
  });

  it('allows "offer" inside a Concept_Card (only Price_Layers bans it)', () => {
    expect(cc11(ctxFor([page(card('<p>We offer notes on fabric.</p>'))], withConcepts))).toEqual([]);
  });

  it('allows Price_Band labels inside the price radio group', () => {
    const html = page(
      card('<fieldset data-price-question><label><input type="radio"> Under ₹1,000</label><label><input type="radio"> ₹1,000–1,499</label></fieldset>'),
    );
    expect(cc11(ctxFor([html], withConcepts))).toEqual([]);
  });

  it('fails on a Price_Band label outside the price radio group', () => {
    const html = page(`${card('<fieldset data-price-question><label>Under ₹1,000</label></fieldset>')}<p>Our price: ₹1,000–1,499</p>`);
    const v = cc11(ctxFor([html], withConcepts));
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain('₹1,000–1,499');
  });

  it('allows a band-like range inside a .fact (market context)', () => {
    const html = page('<p><span class="fact" data-fact-id="m1">Similar pieces: about ₹1,000–1,499</span></p>');
    expect(cc11(ctxFor([html], withConcepts))).toEqual([]);
  });
});

/* ---------- CC-12 ---------- */

describe('CC-12 yarn terms', () => {
  const card = (inner: string) =>
    `<article class="concept-card" data-concept-id="mens-cotton-shirt">${inner}</article>`;
  const row = (label: string, inner: string) =>
    `<div data-quality-row="yarn" data-quality-label="${label}"><dt>Yarn</dt><dd>${inner}</dd></div>`;
  const yarnFact = fact({ id: 'yarn-1' });

  it('passes a card with no yarn term', () => {
    expect(cc12(ctxFor([page(card('<p>Plain weave.</p>'))], { concepts: [concept()] }))).toEqual([]);
  });

  it.each(['combed', 'Long-Staple', 'ring-spun'])('fails on "%s" in a card outside a fact', (term) => {
    const v = cc12(ctxFor([page(card(`<p>${term} cotton</p>`))]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-12', target: '/index.html' });
  });

  it('matches a yarn term split by an inline element and with a line break', () => {
    const v = cc12(ctxFor([page(card('<p>com<em>bed</em> and long\n staple</p>'))]));
    expect(v).toHaveLength(2);
  });

  it('passes inside a .fact with a known fact id', () => {
    const html = page(card('<p><span class="fact" data-fact-id="yarn-1">Combed cotton yarn.</span></p>'));
    expect(cc12(ctxFor([html], { facts: [yarnFact] }))).toEqual([]);
  });

  it('fails inside a .fact with an unknown fact id', () => {
    const html = page(card('<p><span class="fact" data-fact-id="nope">Combed cotton yarn.</span></p>'));
    expect(cc12(ctxFor([html], { facts: [yarnFact] }))).toHaveLength(1);
  });

  it('allows a yarn term in a FACT Quality_Row', () => {
    const html = page(card(`<dl>${row('FACT', 'Combed yarn.')}</dl>`));
    expect(cc12(ctxFor([html]))).toEqual([]);
  });

  it('fails a yarn term in a Target Quality_Row', () => {
    const html = page(card(`<dl>${row('Target', 'Combed yarn.')}</dl>`));
    expect(cc12(ctxFor([html]))).toHaveLength(1);
  });

  it('ignores yarn terms outside Concept_Cards on pages', () => {
    expect(cc12(ctxFor([page('<p>A guide to combed cotton.</p>')]))).toEqual([]);
  });

  it('data: fails when yarnQuality references an unknown fact', () => {
    const c = concept({
      fabricNotes: { ...concept().fabricNotes, yarnQuality: { term: 'combed', factId: 'nope' } },
    });
    const v = cc12(ctxFor([], { concepts: [c], facts: [yarnFact] }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-12', target: 'mens-cotton-shirt' });
  });

  it('data: passes when yarnQuality references a known fact', () => {
    const c = concept({
      fabricNotes: { ...concept().fabricNotes, yarnQuality: { term: 'combed', factId: 'yarn-1' } },
    });
    expect(cc12(ctxFor([], { concepts: [c], facts: [yarnFact] }))).toEqual([]);
  });

  it('data: fails a yarn term in a non-FACT Quality_Row, passes it in a FACT row', () => {
    const rows = [
      { row: 'yarn', label: 'Target', text: 'Combed yarn, 30s–40s' },
      { row: 'fibre', label: 'FACT', text: '', factId: 'yarn-1' },
      { row: 'care', label: 'WeWillTest', text: 'Wash test', test: { what: 'Long-staple check', publish: 'photos' } },
    ];
    const v = cc12(ctxFor([], { concepts: [concept({ quality: rows })], facts: [yarnFact] }));
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.detail).join('|')).toContain('"yarn"');
    expect(v.map((x) => x.detail).join('|')).toContain('"care"');
  });

  it('data: fails a yarn term written in Fabric_Notes free text', () => {
    const c = concept({ fabricNotes: { ...concept().fabricNotes, handFeel: 'Combed and soft' } });
    expect(cc12(ctxFor([], { concepts: [c] }))).toHaveLength(1);
  });
});
