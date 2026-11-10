// Unit tests for CC-17 to CC-20 (task 9.15).
// Requirements 8C.6, 8C.7, 8C.8, 8C.9, 8C.12, 11A.7, 11A.8.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { Concept, QUALITY_ROWS, QUALITY_ROW_NAMES, type ConceptData } from '../../src/lib/concept-schema';
import { extractPage } from '../../src/lib/content-rules/html';
import {
  TARGET_NOTE,
  cc17,
  cc18,
  cc19,
  cc20,
} from '../../src/lib/content-rules/story-quality-rules';
import type { CheckContext } from '../../src/lib/content-rules/types';
import { Fact, type FactEntry } from '../../src/lib/fact-schema';
import { loadWordRules } from '../../src/lib/word-rules-schema';
import { HYPHEN_KINDS, ZERO_WIDTH_CHARS, DEFAULT_HEALTH_TERMS } from '../generators/health-term';

const ROOT = process.cwd();
const loadDir = <T>(dir: string, parseOne: (raw: unknown) => T): T[] =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => parseOne(parse(readFileSync(join(ROOT, dir, f), 'utf8'))));

const realFacts: FactEntry[] = loadDir('src/content/facts', (r) => Fact.parse(r));
const realConcepts: ConceptData[] = loadDir('src/content/concepts', (r) => Concept.parse(r));
const wordRules = loadWordRules();

const sourcedFact = (id: string): FactEntry =>
  Fact.parse({
    id,
    label: 'FACT',
    text: 'A sourced sentence.',
    strength: 'STRONG',
    lastChecked: '2026-01-01',
    section: 'journey',
    source: { name: 'Source', url: 'https://example.org/x', date: '2025' },
  });
const unsourcedFact = (id: string): FactEntry =>
  Fact.parse({
    id,
    label: 'MoolResha estimate',
    text: 'An estimate.',
    strength: 'MODERATE',
    lastChecked: '2026-01-01',
    section: 'journey',
    assumptions: ['one assumption'],
  });

const page = (body: string, path = '/index.html', head = ''): ReturnType<typeof extractPage> =>
  extractPage(path, `<!doctype html><html><head><title>T</title>${head}</head><body><main>${body}</main></body></html>`);

function ctx(over: Partial<CheckContext> = {}): CheckContext {
  return {
    facts: [sourcedFact('f-sourced'), unsourcedFact('f-unsourced')],
    concepts: [],
    priceLayers: {} as CheckContext['priceLayers'],
    story: {} as CheckContext['story'],
    marketScans: [],
    blocklist: [],
    wordRules,
    pages: [],
    distFiles: [],
    ...over,
  };
}

/* ---------- CC-17 ---------- */

describe('CC-17 restricted phrases', () => {
  const run = (body: string, head = '', facts?: FactEntry[]) =>
    cc17(ctx({ pages: [page(body, '/index.html', head)], ...(facts ? { facts } : {}) }));

  it('passes a phrase wholly inside a sourced fact', () => {
    expect(run('<p><span class="fact" data-fact-id="f-sourced">Some say made in Bangladesh here.</span></p>')).toEqual([]);
  });

  it('passes a phrase split by an inline element inside a sourced fact', () => {
    expect(run('<p><span class="fact" data-fact-id="f-sourced">made <em>in</em> Bangladesh</span></p>')).toEqual([]);
  });

  it('fails a phrase outside any fact and names the page and phrase', () => {
    const v = run('<p>Clothes made in Bangladesh.</p>');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-17', target: '/index.html' });
    expect(v[0]!.detail).toContain('made in Bangladesh');
  });

  it('fails a phrase inside a fact whose entry has no source', () => {
    const v = run('<p><span class="fact" data-fact-id="f-unsourced">less GST</span></p>');
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('f-unsourced');
  });

  it('fails a phrase inside a fact that is not in the registry', () => {
    expect(run('<p><span class="fact" data-fact-id="nope">less GST</span></p>')).toHaveLength(1);
  });

  it('fails a phrase split across inline elements outside a fact', () => {
    expect(run('<p>made <em>in</em> <strong>Bangladesh</strong></p>')).toHaveLength(1);
  });

  it('fails a phrase split by a line break or NBSP, in any case', () => {
    expect(run('<p>Instead\nof\u00A0BANGLADESH</p>')).toHaveLength(1);
  });

  it('fails a phrase that starts inside a sourced fact and ends outside it', () => {
    expect(run('<p><span class="fact" data-fact-id="f-sourced">made in</span> Bangladesh</p>')).toHaveLength(1);
  });

  it('fails a phrase in alt, meta, og, aria-label and JSON-LD, even next to a sourced fact', () => {
    const body =
      '<img src="/x.png" alt="Shirts made in Bangladesh">' +
      '<button aria-label="less GST">go</button>' +
      '<span class="fact" data-fact-id="f-sourced">plain</span>';
    const head =
      '<meta name="description" content="instead of Bangladesh">' +
      '<meta property="og:title" content="Less  GST">' +
      '<script type="application/ld+json">{"name":"made in Bangladesh"}</script>';
    const v = run(body, head);
    expect(v).toHaveLength(5);
    const details = v.map((x) => x.detail).join('\n');
    for (const ch of ['alt text', 'aria-label', 'meta', 'og', 'json-ld']) expect(details).toContain(ch);
  });

  it('does not flag a longer word that contains the phrase', () => {
    expect(run('<p>this is a less GSTX remark</p>')).toEqual([]);
  });
});

/* ---------- CC-18 and CC-19 on the seeded Concepts ---------- */

describe('CC-18 and CC-19 with the seeded Concepts', () => {
  it('has five seeded Concepts', () => {
    expect(realConcepts).toHaveLength(5);
  });

  it('pass with the real Fact_Registry', () => {
    const c = ctx({ facts: realFacts, concepts: realConcepts });
    expect(cc18(c)).toEqual([]);
    expect(cc19(c)).toEqual([]);
  });

  /** A card for one Concept, as task 8.5 must render it. */
  function cardHtml(c: ConceptData, opts: { dropTargetNote?: string; dropLink?: boolean; twoLabels?: string } = {}): string {
    const rows = c.quality
      .map((r) => {
        const visible = r.label === 'WeWillTest' ? "We'll test" : r.label;
        const label =
          r.label === 'FACT'
            ? `<span class="fact" data-fact-id="${r.factId}">${r.text} <span class="claim-label" data-claim-label="FACT">FACT</span></span>`
            : `${r.text} <span class="q-label">${visible}</span>`;
        const extra = r.label === 'Target' && opts.dropTargetNote !== r.row ? ` <span class="q-note">${TARGET_NOTE}</span>` : '';
        const second = opts.twoLabels === r.row ? ' <span class="q-label">Target</span>' : '';
        return `<div data-quality-row="${r.row}" data-quality-label="${r.label}"><dt>${QUALITY_ROW_NAMES[r.row]}</dt><dd>${label}${extra}${second}</dd></div>`;
      })
      .join('');
    return (
      `<article data-concept-id="${c.id}"><section data-quality-card aria-labelledby="qc-${c.id}"><h3 id="qc-${c.id}">Quality</h3><dl>${rows}</dl>` +
      (opts.dropLink ? '' : '<p><a href="#how-we-check">How we check this</a></p>') +
      '</section></article>'
    );
  }
  const indexWith = (cards: string, withAnchor = true): ReturnType<typeof extractPage> =>
    page(cards + (withAnchor ? '<section id="how-we-check"><h2>How we check</h2></section>' : ''));

  it('pass on a correctly rendered /index.html', () => {
    const pages = [indexWith(realConcepts.map((c) => cardHtml(c)).join(''))];
    expect(cc18(ctx({ facts: realFacts, concepts: realConcepts, pages }))).toEqual([]);
  });

  it('CC-18 fails and names the row when the card data is mutated', () => {
    const [first, ...rest] = realConcepts;
    const bad = structuredClone(first!);
    const fibre = bad.quality.find((r) => r.row === 'fibre')!;
    (fibre as { label: string }).label = 'FACT'; // a FACT row with no factId
    const v = cc18(ctx({ facts: realFacts, concepts: [bad, ...rest] }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-18', target: first!.id });
    expect(v[0]!.detail).toContain('"fibre"');
  });

  it('CC-18 names the row for a We\'ll test row with no test', () => {
    const [first] = realConcepts;
    const bad = structuredClone(first!);
    delete (bad.quality.find((r) => r.row === 'shrinkage') as { test?: unknown }).test;
    const v = cc18(ctx({ facts: realFacts, concepts: [bad] }));
    expect(v.map((x) => x.detail).join('\n')).toContain('"shrinkage"');
  });

  it('CC-18 fails when a rendered Target row lacks the note', () => {
    const pages = [indexWith(realConcepts.map((c, i) => cardHtml(c, i === 0 ? { dropTargetNote: 'fabric' } : {})).join(''))];
    const v = cc18(ctx({ facts: realFacts, concepts: realConcepts, pages }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ target: realConcepts[0]!.id });
    expect(v[0]!.detail).toContain('"fabric"');
    expect(v[0]!.detail).toContain(TARGET_NOTE);
  });

  it('CC-18 fails when a rendered row shows two labels', () => {
    const pages = [indexWith(realConcepts.map((c, i) => cardHtml(c, i === 1 ? { twoLabels: 'care' } : {})).join(''))];
    const v = cc18(ctx({ facts: realFacts, concepts: realConcepts, pages }));
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('"care"');
  });

  it('CC-18 fails when #how-we-check does not resolve or the link is missing', () => {
    const cards = realConcepts.map((c) => cardHtml(c)).join('');
    const noAnchor = cc18(ctx({ facts: realFacts, concepts: realConcepts, pages: [indexWith(cards, false)] }));
    expect(noAnchor).toHaveLength(realConcepts.length);
    expect(noAnchor[0]!.detail).toContain('does not resolve');
    const noLink = cc18(
      ctx({
        facts: realFacts,
        concepts: realConcepts,
        pages: [indexWith(realConcepts.map((c) => cardHtml(c, { dropLink: true })).join(''))],
      }),
    );
    expect(noLink).toHaveLength(realConcepts.length);
    expect(noLink[0]!.detail).toContain('no link to #how-we-check');
  });

  it('CC-18 fails for a Concept with no rendered card', () => {
    const pages = [indexWith(realConcepts.slice(1).map((c) => cardHtml(c)).join(''))];
    const v = cc18(ctx({ facts: realFacts, concepts: realConcepts, pages }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ target: realConcepts[0]!.id });
  });

  it('CC-19 fails an exact GSM in a Target row, naming the Concept and row', () => {
    const [first] = realConcepts;
    const bad = structuredClone(first!);
    bad.quality.find((r) => r.row === 'fabric')!.text = 'Poplin at 120 GSM';
    const v = cc19(ctx({ facts: realFacts, concepts: [bad] }));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-19', target: first!.id });
    expect(v[0]!.detail).toContain('"fabric"');
    expect(v[0]!.detail).toContain('120 GSM');
    // CC-18 does not repeat it.
    expect(cc18(ctx({ facts: realFacts, concepts: [bad] }))).toEqual([]);
  });

  it('CC-19 fails an exact yarn count and a range in a We\'ll test row', () => {
    const bad = structuredClone(realConcepts[0]!);
    bad.quality.find((r) => r.row === 'yarn')!.text = 'Combed 40s yarn';
    bad.quality.find((r) => r.row === 'shrinkage')!.text = 'Pre-washed, 130-150 GSM';
    const v = cc19(ctx({ facts: realFacts, concepts: [bad] }));
    const text = v.map((x) => x.detail).join('\n');
    expect(v).toHaveLength(2);
    expect(text).toContain('"yarn"');
    expect(text).toContain('"shrinkage"');
  });

  it('CC-19 checks the Fabric_Notes weight', () => {
    const bad = structuredClone(realConcepts[0]!);
    bad.fabricNotes.weight = 'About 140 GSM';
    const v = cc19(ctx({ facts: realFacts, concepts: [bad] }));
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('Fabric_Notes weight');
  });
});

/* ---------- CC-20 ---------- */

describe('CC-20 health terms', () => {
  const run = (body: string, head = '') => cc20(ctx({ pages: [page(body, '/index.html', head)] }));

  it('passes a clean page', () => {
    expect(run('<p>Soft cotton with an easy hand feel.</p>')).toEqual([]);
  });

  it('names the page, the term and the channel', () => {
    const v = run('<p>A skin-friendly shirt.</p>');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'CC-20', target: '/index.html' });
    expect(v[0]!.detail).toContain('"skin-friendly"');
    expect(v[0]!.detail).toContain('visible text');
  });

  it('finds every hyphen kind between the parts', () => {
    for (const h of HYPHEN_KINDS) {
      expect(run(`<p>skin${h}friendly</p>`), `hyphen U+${h.codePointAt(0)!.toString(16)}`).toHaveLength(1);
    }
  });

  it('finds a space, NBSP, line break or nothing between the parts', () => {
    for (const sep of [' ', '\u00A0', '\n', '', '  ']) {
      expect(run(`<p>skin${sep}friendly</p>`), JSON.stringify(sep)).toHaveLength(1);
    }
  });

  it('finds zero-width characters and any case', () => {
    for (const z of ZERO_WIDTH_CHARS) {
      expect(run(`<p>Skin${z}-Friendly and hypo${z}allergenic</p>`)).toHaveLength(2);
    }
    expect(run('<p>SKIN-FRIENDLY</p>')).toHaveLength(1);
  });

  it('finds a term split by inline elements', () => {
    expect(run('<p>skin-<em>friendly</em></p>')).toHaveLength(1);
  });

  it('finds every listed term', () => {
    const body = DEFAULT_HEALTH_TERMS.map((t) => `<p>${t}</p>`).join('');
    const v = run(body);
    for (const t of DEFAULT_HEALTH_TERMS) expect(v.some((x) => x.detail.includes(`"${t}"`))).toBe(true);
  });

  it('finds a term in a template alt', () => {
    const v = run('<template><img src="/x.png" alt="A hypoallergenic cotton shirt"></template>');
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('alt text (inside <template>)');
    expect(v[0]!.detail).toContain('"hypoallergenic"');
  });

  it('finds a term inside template text', () => {
    expect(run('<template><p>non-toxic dye</p></template>')).toHaveLength(1);
  });

  it('finds a term inside a .fact, with no exemption', () => {
    const v = run('<p><span class="fact" data-fact-id="f-sourced">Chemical\u2011free finishing</span></p>');
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('"chemical-free"');
  });

  it('finds a term in title, meta, og, JSON-LD, aria-label and title attribute', () => {
    const body = '<button aria-label="Anti\u2013Allergy" title="non toxic">go</button>';
    const head =
      '<meta name="description" content="skin friendly">' +
      '<meta property="og:title" content="hypo\u200Ballergenic">' +
      '<script type="application/ld+json">{"name":"chemical-free"}</script>';
    const v = cc20(
      ctx({
        pages: [
          extractPage(
            '/p/index.html',
            `<!doctype html><html><head><title>Anti-allergy</title>${head}</head><body>${body}</body></html>`,
          ),
        ],
      }),
    );
    const text = v.map((x) => x.detail).join('\n');
    for (const ch of ['title', 'meta', 'og', 'json-ld', 'aria-label', 'title attribute']) expect(text).toContain(ch);
    expect(v.every((x) => x.target === '/p/index.html')).toBe(true);
  });

  it('finds the extra listed spelling "hypo-allergenic" once', () => {
    const v = run('<p>hypo-allergenic</p>');
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('"hypo-allergenic"');
  });

  it('does not flag unrelated words', () => {
    expect(run('<p>skin feel, friendly staff, toxicology</p>')).toEqual([]);
  });
});
