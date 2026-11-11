/**
 * Fact rules for the Content_Check (task 9.2, Requirements 3.5, 3.6, 3.7, 5.6).
 *
 *  - CC-01 fact completeness: names every registry entry that lacks a Claim_Label,
 *    a Source_Link, assumptions, a method note or a last-checked date.
 *  - CC-02 unverified facts: an entry with strength `UNVERIFIED`, a `verifyFlag`
 *    or "⚠️ verify" in its text fails when a published page references it
 *    through `data-fact-id`. Unreferenced unverified entries pass.
 *  - CC-09 free-standing numeric claims: `₹`, `%` or a year number in visible text
 *    outside every `.fact` and outside `fieldset[data-price-question]`, unless the
 *    text is listed in `word-rules.yaml#numericAllow`. Three narrow exemptions
 *    also apply: "100% <fibre>" (`isPureFibreLabel`), any text inside a
 *    `[data-composition]` element (the Fabric_Notes composition line), and a year
 *    inside a `<time datetime>` element whose `datetime` contains that year
 *    (`isDeclaredYear`).
 */
import { parse } from 'node-html-parser';
import { factEntryProblem } from '../quality-card';
import { FIBRES } from '../concept-schema';
import { extractPage, factSpanContaining, type RenderedPage } from './html';
import type { CheckContext, Rule, Violation } from './types';

/* ---------- CC-01 ---------- */

export const cc01: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  for (const fact of ctx.facts) {
    const problem = factEntryProblem(fact);
    if (problem !== null) {
      const id = String((fact as { id?: unknown }).id ?? '(unnamed entry)');
      out.push({ rule: 'CC-01', target: id, detail: `fact "${id}" is incomplete: ${problem}` });
    }
  }
  return out;
};

/* ---------- CC-02 ---------- */

function isUnverified(fact: { strength?: string; verifyFlag?: boolean; text?: string }): boolean {
  return (
    fact.strength === 'UNVERIFIED' ||
    fact.verifyFlag === true ||
    /⚠️?\s*verify/i.test(fact.text ?? '')
  );
}

export const cc02: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const exceptions = new Set(ctx.wordRules.launchExceptions);
  for (const fact of ctx.facts) {
    if (!isUnverified(fact)) continue;
    if (exceptions.has(fact.id)) continue;
    const pages = ctx.pages.filter((p) => p.factIds.includes(fact.id)).map((p) => p.path);
    if (pages.length === 0) continue;
    const why = fact.strength === 'UNVERIFIED' ? 'strength UNVERIFIED' : 'flagged "⚠️ verify"';
    out.push({
      rule: 'CC-02',
      target: fact.id,
      detail: `fact "${fact.id}" (${why}) is referenced by a published page: ${pages.join(', ')}`,
    });
  }
  return out;
};

/* ---------- CC-09 ---------- */

/**
 * One left-to-right scan so matches never overlap: a ₹ amount (or a lone ₹), a
 * number followed by % (or a lone %), or a year from 1900 to 2099.
 */
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const NUMERIC_CLAIM = new RegExp(
  [
    String.raw`₹\s*(?:${NUMBER})?`,
    String.raw`(?:${NUMBER}\s*)?%`,
    String.raw`(?<![\d.,])(?:19|20)\d{2}(?![\d]|[.,]\d)`,
  ].join('|'),
  'g',
);

/** The page with the price question removed, so its answer labels are never scanned. */
function withoutPriceQuestion(page: RenderedPage): RenderedPage {
  if (!/data-price-question/i.test(page.html)) return page;
  const root = parse(page.html.replace(/<!doctype[^>]*>/gi, ''), {
    blockTextElements: { script: true, style: true },
  });
  const fieldsets = root.querySelectorAll('fieldset[data-price-question]');
  if (fieldsets.length === 0) return page;
  for (const f of fieldsets) f.remove();
  return extractPage(page.path, root.toString());
}

const PURE_FIBRE = new RegExp(String.raw`^\s+(?:${FIBRES.join('|')})(?![\p{L}\p{N}])`, 'iu');

/**
 * "100% cotton", "100% linen": a whole-garment fibre label from the Concept schema
 * (`FIBRES`), written the way a care label writes it. It describes the product, so
 * it is not a statistic about the world. "100% of buyers", "100% off" and a bare
 * "100%" do not match. A split such as "60% cotton" is not exempt here; it is
 * exempt only inside a `[data-composition]` element (see `inCompositionSpan`).
 */
function isPureFibreLabel(text: string, match: string, end: number): boolean {
  return /^100\s*%$/.test(match.trim()) && PURE_FIBRE.test(text.slice(end));
}

/** True when the range lies wholly inside an element marked `data-composition`. */
function inCompositionSpan(page: RenderedPage, start: number, end: number): boolean {
  return page.compositionSpans.some((c) => c.start <= start && end <= c.end);
}

/**
 * A four-digit year that sits wholly inside a `<time datetime="...">` element whose
 * `datetime` value contains that same year, so the visible date and the machine
 * date agree. A year in plain copy, or in a `<time>` with another year, still fails.
 */
function isDeclaredYear(page: RenderedPage, match: string, start: number, end: number): boolean {
  if (!/^(?:19|20)\d{2}$/.test(match)) return false;
  return page.timeSpans.some((t) => t.start <= start && end <= t.end && t.datetime.includes(match));
}

function allowedRanges(text: string, allow: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const a of allow) {
    if (a === '') continue;
    for (let i = text.indexOf(a); i >= 0; i = text.indexOf(a, i + 1)) ranges.push([i, i + a.length]);
  }
  return ranges;
}

export const cc09: Rule = (ctx: CheckContext): Violation[] => {
  const out: Violation[] = [];
  const allow = ctx.wordRules.numericAllow;
  for (const original of ctx.pages) {
    const page = withoutPriceQuestion(original);
    const text = page.visibleText;
    const allowed = allowedRanges(text, allow);
    for (const m of text.matchAll(NUMERIC_CLAIM)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (m[0].trim() === '') continue;
      if (factSpanContaining(page, start, end)) continue;
      if (allowed.some(([a, b]) => a <= start && end <= b)) continue;
      if (isPureFibreLabel(text, m[0], end)) continue;
      if (inCompositionSpan(page, start, end)) continue;
      if (isDeclaredYear(page, m[0], start, end)) continue;
      out.push({
        rule: 'CC-09',
        target: original.path,
        detail: `free-standing numeric text "${m[0].trim()}" outside any fact`,
      });
    }
  }
  return out;
};
