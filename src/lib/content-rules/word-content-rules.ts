/**
 * Word rules for the Content_Check (task 9.6).
 *
 *  - CC-03 greenwashing words only inside a `.fact` whose fact lists the word in `substantiates`.
 *  - CC-04 "European linen" only inside a `.fact` whose fact has `mill` or `certification`.
 *  - CC-10 `!` and superlatives fail, except inside an element marked `data-quote`.
 *  - CC-11 commerce words inside Concept_Cards and Price_Layers, and Price_Band labels
 *    outside the price radio group.
 *  - CC-12 yarn terms only with a fact (Fabric_Notes) or in a `FACT` Quality_Row.
 *
 * Requirements: 1.6, 6.5, 8.4, 8.7, 9.11, 11.4, 11.5
 *
 * DOM assumptions (the page components must match):
 *  - A Concept_Card is an element with `data-concept-card` or the class `concept-card`;
 *    it should also carry `data-concept-id` (used only to name the Concept in messages).
 *  - The price question is `fieldset[data-price-question]`.
 *  - The Price_Layers section is `[data-section="price-layers"]`.
 *  - A Quality_Row is `[data-quality-row][data-quality-label="FACT" | "Target" | "WeWillTest"]`.
 *  - Journal quotes carry `data-quote` on the quoting element (or an ancestor).
 *
 * Pure: no file access.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import type { FactEntry } from '../fact-schema';
import { bandLabel } from '../price-bands';
import { findPhrase, normaliseForMatch } from '../text-match';
import { extractPage, factSpanContaining } from './html';
import type { CheckContext, RenderedPage, Rule, Violation } from './types';

/* ---------- Word lists that are not in word-rules.yaml ---------- */

/** CC-11: wording that makes a Concept_Card or a Price_Layers layer read as a shop (Requirements 8.7, 9.11). */
export const COMMERCE_TERMS: readonly string[] = [
  'buy',
  'buy now',
  'add to cart',
  'add to bag',
  'add to basket',
  'pre-order',
  'preorder',
  'pre order',
  'order now',
  'shop now',
  'launch price',
];

/** CC-11, Price_Layers only: wording that presents a layer as an offer (Requirement 6.5). "% off" is matched separately. */
export const PRICE_LAYER_TERMS: readonly string[] = ['offer', 'offers', 'discount', 'discounts'];

/** CC-12: yarn-quality terms that need a Fact_Registry entry (Requirement 8.4). */
export const YARN_TERMS: readonly string[] = [
  'combed',
  'long-staple',
  'long staple',
  'extra-long staple',
  'ring-spun',
  'ring spun',
  'compact-spun',
  'compact spun',
];

/** `% off` cannot go through `phrasePattern`: the word boundary before `%` fails after a digit. */
const PERCENT_OFF = /%\s*off(?![\p{L}\p{N}_])/giu;

const CARD_SELECTOR = '[data-concept-card], .concept-card';
const PRICE_LAYERS_SELECTOR = '[data-section="price-layers"]';
const PRICE_QUESTION_SELECTOR = 'fieldset[data-price-question]';
const FACT_ROW_SELECTOR = '[data-quality-row][data-quality-label="FACT"]';

/* ---------- Helpers ---------- */

interface Hit {
  term: string;
  start: number;
  end: number;
}

function parseHtml(html: string): HTMLElement {
  // Same options as extractPage; node-html-parser reads `<!doctype html>` as text, so drop it.
  return parse(html.replace(/<!doctype[^>]*>/gi, ''), { blockTextElements: { script: true, style: true } });
}

/** The page HTML with every element matching `selector` removed. */
function stripElements(html: string, selector: string): string {
  const root = parseHtml(html);
  for (const el of root.querySelectorAll(selector)) el.remove();
  return root.toString();
}

/**
 * Every occurrence of every term. A hit lying inside a longer hit is dropped, so
 * "eco-friendly" is reported once and not again as "eco".
 */
function findTerms(text: string, terms: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const term of terms) {
    for (const m of findPhrase(text, term)) hits.push({ term, start: m.start, end: m.end });
  }
  return hits.filter(
    (h, i) =>
      !hits.some((o, j) => {
        if (j === i || o.start > h.start || h.end > o.end) return false;
        const longer = o.end - o.start > h.end - h.start;
        const same = o.end - o.start === h.end - h.start;
        return longer || (same && j < i);
      }),
  );
}

function excerpt(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 24);
  const to = Math.min(text.length, end + 24);
  const around = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${around}${to < text.length ? '…' : ''}`;
}

function factFor(ctx: CheckContext, id: string | null | undefined): FactEntry | undefined {
  return id ? ctx.facts.find((f) => f.id === id) : undefined;
}

function conceptIdOf(el: HTMLElement): string {
  return el.getAttribute('data-concept-id') ?? 'unknown Concept';
}

/** Visible text of an element, plus its alt, aria-label and title attributes. */
function regionTexts(path: string, el: HTMLElement): string[] {
  const sub = extractPage(path, el.outerHTML);
  const attrs = sub.channelTexts
    .filter((c) => c.channel === 'alt' || c.channel === 'aria-label' || c.channel === 'title-attr')
    .map((c) => c.text);
  return [sub.visibleText, ...attrs];
}

/* ---------- CC-03 greenwashing words ---------- */

export const cc03: Rule = (ctx) => {
  const out: Violation[] = [];
  for (const page of ctx.pages) {
    const text = page.visibleText;
    for (const hit of findTerms(text, ctx.wordRules.restricted)) {
      const span = factSpanContaining(page, hit.start, hit.end);
      const fact = factFor(ctx, span?.factId);
      const wanted = normaliseForMatch(hit.term);
      if (fact && fact.substantiates.some((w) => normaliseForMatch(w) === wanted)) continue;

      const where = !span
        ? 'outside a .fact'
        : fact
          ? `inside fact "${fact.id}", which does not list it in substantiates`
          : 'inside a .fact with no known fact id';
      out.push({
        rule: 'CC-03',
        target: page.path,
        detail: `Restricted word "${hit.term}" ${where}: "${excerpt(text, hit.start, hit.end)}"`,
      });
    }
  }
  return out;
};

/* ---------- CC-04 "European linen" ---------- */

export const cc04: Rule = (ctx) => {
  const out: Violation[] = [];
  for (const page of ctx.pages) {
    const text = page.visibleText;
    for (const hit of findPhrase(text, 'European linen')) {
      const span = factSpanContaining(page, hit.start, hit.end);
      const fact = factFor(ctx, span?.factId);
      if (fact && (fact.mill?.trim() || fact.certification?.trim())) continue;

      const where = !span
        ? 'outside a .fact'
        : fact
          ? `inside fact "${fact.id}", which has no mill or certification`
          : 'inside a .fact with no known fact id';
      out.push({
        rule: 'CC-04',
        target: page.path,
        detail: `"European linen" ${where}: "${excerpt(text, hit.start, hit.end)}"`,
      });
    }
  }
  return out;
};

/* ---------- CC-10 tone ---------- */

const EXCLAMATION = /[!\uFF01\u203C\u2757\u2755]/gu;

/** Visible text with every `data-quote` element (and what it contains) left out. */
function visibleTextWithoutQuotes(page: RenderedPage): string {
  if (!/data-quote/i.test(page.html)) return page.visibleText;
  return extractPage(page.path, stripElements(page.html, '[data-quote]')).visibleText;
}

export const cc10: Rule = (ctx) => {
  const out: Violation[] = [];
  for (const page of ctx.pages) {
    const text = visibleTextWithoutQuotes(page);
    for (const m of text.matchAll(EXCLAMATION)) {
      const start = m.index ?? 0;
      out.push({
        rule: 'CC-10',
        target: page.path,
        detail: `Exclamation mark in copy: "${excerpt(text, start, start + 1)}"`,
      });
    }
    for (const hit of findTerms(text, ctx.wordRules.superlatives)) {
      out.push({
        rule: 'CC-10',
        target: page.path,
        detail: `Promotional word "${hit.term}": "${excerpt(text, hit.start, hit.end)}"`,
      });
    }
  }
  return out;
};

/* ---------- CC-11 commerce words ---------- */

export const cc11: Rule = (ctx) => {
  const out: Violation[] = [];
  const labels = [...new Set(ctx.concepts.flatMap((c) => c.priceBands.map((b) => bandLabel(b))))];

  for (const page of ctx.pages) {
    const root = parseHtml(page.html);

    for (const card of root.querySelectorAll(CARD_SELECTOR)) {
      const id = conceptIdOf(card);
      for (const text of regionTexts(page.path, card)) {
        for (const hit of findTerms(text, COMMERCE_TERMS)) {
          out.push({
            rule: 'CC-11',
            target: page.path,
            detail: `Commerce word "${hit.term}" in Concept_Card ${id}: "${excerpt(text, hit.start, hit.end)}"`,
          });
        }
      }
    }

    for (const section of root.querySelectorAll(PRICE_LAYERS_SELECTOR)) {
      for (const text of regionTexts(page.path, section)) {
        for (const hit of findTerms(text, [...COMMERCE_TERMS, ...PRICE_LAYER_TERMS])) {
          out.push({
            rule: 'CC-11',
            target: page.path,
            detail: `Commerce word "${hit.term}" in Price_Layers: "${excerpt(text, hit.start, hit.end)}"`,
          });
        }
        for (const m of text.matchAll(PERCENT_OFF)) {
          const start = m.index ?? 0;
          out.push({
            rule: 'CC-11',
            target: page.path,
            detail: `Commerce word "% off" in Price_Layers: "${excerpt(text, start, start + m[0].length)}"`,
          });
        }
      }
    }

    // Price_Band labels belong to the price radio group only. A label inside a .fact is
    // a Fact_Registry range that happens to equal a band, not a band shown as an offer.
    if (labels.length > 0) {
      const sub = /data-price-question/i.test(page.html)
        ? extractPage(page.path, stripElements(page.html, PRICE_QUESTION_SELECTOR))
        : page;
      for (const hit of findTerms(sub.visibleText, labels)) {
        if (factSpanContaining(sub, hit.start, hit.end)) continue;
        out.push({
          rule: 'CC-11',
          target: page.path,
          detail: `Price_Band label "${hit.term}" outside the price radio group: "${excerpt(sub.visibleText, hit.start, hit.end)}"`,
        });
      }
    }
  }
  return out;
};

/* ---------- CC-12 yarn terms ---------- */

export const cc12: Rule = (ctx) => {
  const out: Violation[] = [];

  // Data: the schema keeps yarn terms in `fabricNotes.yarnQuality` (with a factId) and in FACT rows.
  for (const concept of ctx.concepts) {
    const yarn = concept.fabricNotes.yarnQuality;
    if (yarn && !factFor(ctx, yarn.factId)) {
      out.push({
        rule: 'CC-12',
        target: concept.id,
        detail: `Fabric_Notes yarn quality "${yarn.term}" references unknown fact "${yarn.factId}"`,
      });
    }

    const notes = concept.fabricNotes;
    const fields = { weave: notes.weave, weight: notes.weight, handFeel: notes.handFeel, softness: notes.softness, care: notes.care };
    for (const [field, text] of Object.entries(fields)) {
      for (const hit of findTerms(text, YARN_TERMS)) {
        out.push({
          rule: 'CC-12',
          target: concept.id,
          detail: `Yarn term "${hit.term}" in Fabric_Notes ${field}; state it only through yarnQuality with a fact id`,
        });
      }
    }

    for (const row of concept.quality) {
      if (row.label === 'FACT') continue;
      const texts = [row.text, row.test?.what ?? '', row.test?.publish ?? ''];
      for (const text of texts) {
        for (const hit of findTerms(text, YARN_TERMS)) {
          out.push({
            rule: 'CC-12',
            target: concept.id,
            detail: `Yarn term "${hit.term}" in Quality_Row "${row.row}" labelled ${row.label}; only a FACT row may use it`,
          });
        }
      }
    }
  }

  // Pages: inside a Concept_Card, a yarn term needs a known fact. FACT Quality_Rows are exempt.
  for (const page of ctx.pages) {
    const root = parseHtml(page.html);
    for (const card of root.querySelectorAll(CARD_SELECTOR)) {
      const id = conceptIdOf(card);
      const copy = parseHtml(card.outerHTML);
      for (const row of copy.querySelectorAll(FACT_ROW_SELECTOR)) row.remove();
      const sub = extractPage(page.path, copy.toString());

      for (const hit of findTerms(sub.visibleText, YARN_TERMS)) {
        const span = factSpanContaining(sub, hit.start, hit.end);
        if (factFor(ctx, span?.factId)) continue;
        const where = span ? 'inside a .fact with no known fact id' : 'outside a fact';
        out.push({
          rule: 'CC-12',
          target: page.path,
          detail: `Yarn term "${hit.term}" in Concept_Card ${id} ${where}: "${excerpt(sub.visibleText, hit.start, hit.end)}"`,
        });
      }
    }
  }
  return out;
};
