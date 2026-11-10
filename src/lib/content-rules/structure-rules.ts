/**
 * Content_Check structure rules CC-13, CC-14, CC-15 and CC-16 (task 9.13).
 *
 *  - CC-13 coord-composition: the `womens-coord-set` Concept is 100% cotton, or
 *    cotton plus 10-20% linen, summing to 100 (`isValidCoordComposition`).
 *  - CC-14 concept-set: exactly the five Concepts; `mens-cotton-shirt` has
 *    order 1 and is the only `featured` one; the orders are 1 to 5, once each.
 *  - CC-15 section-order: on `/index.html` the `data-section` values are exactly
 *    `PAGE_SECTIONS`, in order. Reports missing, extra, duplicate and misordered
 *    sections.
 *  - CC-16 market-in-card: each Concept_Card holds exactly one collapsed
 *    `<details class="market-context">` with `data-market-for` equal to the
 *    card's Concept id, placed after `fieldset[data-price-question]`, with the
 *    summary "See what similar pieces cost"; none sits outside a card.
 *
 * MARKUP ASSUMPTION (design.md gives no exact Concept_Card markup, so tasks
 * 8.6 and 8.7 must match this):
 *   - A Concept_Card is the element with the attribute `data-concept-card`.
 *     Its Concept id is that element's `data-concept-id` attribute. (The
 *     Angle_Viewer inside also carries `data-concept-id`, so the card is found
 *     by `[data-concept-card]`, never by `[data-concept-id]` alone.)
 *   - The price question is `fieldset[data-price-question]` inside the card.
 *   - The market context is `<details class="market-context"
 *     data-market-for="<id>">` inside the card, with a `<summary>` child.
 *
 * Rules are pure: they read the `CheckContext` only.
 */
import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser';
import { CONCEPT_IDS, PAGE_SECTIONS } from '../../content/config/allow-lists';
import { isValidCoordComposition } from '../coord-composition';
import type { CheckContext, RenderedPage, Rule, Violation } from './types';

export const MARKET_SUMMARY_TEXT = 'See what similar pieces cost';
const INDEX_PATH = '/index.html';
const FEATURED_ID = 'mens-cotton-shirt';
const COORD_ID = 'womens-coord-set';

/* ---------- CC-13 ---------- */

export const cc13: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  for (const concept of ctx.concepts) {
    if (concept.id !== COORD_ID) continue;
    if (!isValidCoordComposition(concept.fabricNotes.composition)) {
      const text = concept.fabricNotes.composition.map((p) => `${p.percent}% ${p.fibre}`).join(', ');
      out.push({
        rule: 'CC-13',
        target: concept.id,
        detail: `composition (${text}) must be 100% cotton, or cotton with 10-20% linen summing to 100`,
      });
    }
  }
  return out;
};

/* ---------- CC-14 ---------- */

export const cc14: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const add = (target: string, detail: string): void => {
    out.push({ rule: 'CC-14', target, detail });
  };

  const required: readonly string[] = CONCEPT_IDS;
  const seen = new Map<string, number>();
  for (const c of ctx.concepts) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);

  for (const id of required) {
    if (!seen.has(id)) add(id, 'required Concept is missing');
  }
  for (const [id, n] of seen) {
    if (!required.includes(id)) add(id, 'Concept is not one of the five required Concepts');
    if (n > 1) add(id, `Concept appears ${n} times`);
  }
  if (ctx.concepts.length !== required.length) {
    add('concepts', `expected exactly ${required.length} Concepts, found ${ctx.concepts.length}`);
  }

  const featured = ctx.concepts.find((c) => c.id === FEATURED_ID);
  if (featured) {
    if (featured.order !== 1) add(FEATURED_ID, `must be first (order 1), found order ${featured.order}`);
    if (!featured.featured) add(FEATURED_ID, 'must be featured: true');
  }
  for (const c of ctx.concepts) {
    if (c.id !== FEATURED_ID && c.featured) add(c.id, 'only mens-cotton-shirt may be featured');
    if (c.id !== FEATURED_ID && c.order === 1) add(c.id, 'order 1 belongs to mens-cotton-shirt');
  }

  const orders = ctx.concepts.map((c) => c.order).sort((a, b) => a - b);
  if (ctx.concepts.length === required.length && orders.join() !== '1,2,3,4,5') {
    add('concepts', `orders must be 1 to 5, each once; found ${orders.join(', ')}`);
  }
  return out;
};

/* ---------- CC-15 ---------- */

function parseHtml(page: RenderedPage): HTMLElement {
  return parse(page.html.replace(/<!doctype[^>]*>/gi, ''), { blockTextElements: { script: true, style: true } });
}

export const cc15: Rule = (ctx: CheckContext): Violation[] => {
  const page = ctx.pages.find((p) => p.path === INDEX_PATH);
  if (!page) {
    return [{ rule: 'CC-15', target: INDEX_PATH, detail: 'page not found, cannot check the section order' }];
  }

  const expected: readonly string[] = PAGE_SECTIONS;
  const actual = parseHtml(page)
    .querySelectorAll('[data-section]')
    .map((el) => el.getAttribute('data-section') ?? '');

  if (actual.join('\n') === expected.join('\n')) return [];

  const out: Violation[] = [];
  const add = (detail: string): void => {
    out.push({ rule: 'CC-15', target: INDEX_PATH, detail });
  };

  const extra = [...new Set(actual.filter((s) => !expected.includes(s)))];
  for (const s of extra) add(`extra data-section "${s}" is not in the required list`);

  const missing = expected.filter((s) => !actual.includes(s));
  for (const s of missing) add(`missing data-section "${s}"`);

  const counts = new Map<string, number>();
  for (const s of actual) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const [s, n] of counts) {
    if (n > 1 && expected.includes(s)) add(`data-section "${s}" appears ${n} times`);
  }

  // Order of the known sections, first occurrence each, against the required order.
  const firsts = [...new Set(actual.filter((s) => expected.includes(s)))];
  const wanted = expected.filter((s) => firsts.includes(s));
  if (firsts.join() !== wanted.join()) {
    add(`sections are out of order: found ${firsts.join(', ')}; required ${wanted.join(', ')}`);
  }

  if (out.length === 0) add(`data-section order is ${actual.join(', ')}; required ${expected.join(', ')}`);
  return out;
};

/* ---------- CC-16 ---------- */

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function closestCard(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) {
    if (p.nodeType === NodeType.ELEMENT_NODE && p.hasAttribute?.('data-concept-card')) return p;
  }
  return null;
}

function orderIndex(root: HTMLElement): Map<Node, number> {
  const index = new Map<Node, number>();
  let n = 0;
  const walk = (node: Node): void => {
    index.set(node, n++);
    for (const child of node.childNodes) walk(child);
  };
  walk(root);
  return index;
}

export const cc16: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];

  for (const page of ctx.pages) {
    if (!/market-context|data-concept-card/.test(page.html)) continue;
    const root = parseHtml(page);
    const order = orderIndex(root);
    const markets = root.querySelectorAll('.market-context');
    const cards = root.querySelectorAll('[data-concept-card]');

    for (const m of markets) {
      if (!closestCard(m)) {
        out.push({
          rule: 'CC-16',
          target: page.path,
          detail: `.market-context for "${m.getAttribute('data-market-for') ?? ''}" sits outside every Concept_Card`,
        });
      }
    }

    for (const card of cards) {
      const id = card.getAttribute('data-concept-id') ?? '';
      const add = (detail: string): void => {
        out.push({ rule: 'CC-16', target: id || page.path, detail: `${page.path}: ${detail}` });
      };
      if (id === '') add('Concept_Card has no data-concept-id');

      const inside = card.querySelectorAll('.market-context');
      if (inside.length !== 1) {
        add(`Concept_Card must hold exactly one .market-context, found ${inside.length}`);
      }

      const price = card.querySelector('fieldset[data-price-question]');
      if (inside.length > 0 && !price) add('Concept_Card has no fieldset[data-price-question]');

      for (const m of inside) {
        const tag = (m.rawTagName ?? '').toLowerCase();
        if (tag !== 'details') add(`.market-context must be a <details> element, found <${tag}>`);
        if (m.hasAttribute('open')) add('.market-context must be collapsed, but has the open attribute');

        const marketFor = m.getAttribute('data-market-for');
        if (marketFor !== id) {
          add(`data-market-for is "${marketFor ?? ''}", expected "${id}"`);
        }

        if (price) {
          const mi = order.get(m) ?? 0;
          const pi = order.get(price) ?? 0;
          if (mi < pi) add('.market-context comes before fieldset[data-price-question]');
        }

        const summary = m.querySelector('summary');
        if (!summary) {
          add(`.market-context has no <summary>, expected "${MARKET_SUMMARY_TEXT}"`);
        } else if (squash(summary.textContent) !== MARKET_SUMMARY_TEXT) {
          add(`summary reads "${squash(summary.textContent)}", expected "${MARKET_SUMMARY_TEXT}"`);
        }
      }
    }
  }
  return out;
};

/** All four rules, in id order. */
export const STRUCTURE_RULES: Rule[] = [cc13, cc14, cc15, cc16];
