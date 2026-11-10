/**
 * Rupee-amount finder behind Content_Check rule CC-08 (task 9.11, Requirements 6.3, 6.7).
 *
 * The Price_Layers section may hold a rupee amount only inside the `.fact`
 * element whose `data-fact-id` is the GST fact. `findRupeeAmountsOutsideFact`
 * returns every other amount, with its matched text, over:
 *
 *  - the visible text of the subtree (inline splits such as `₹<em>2,500</em>`
 *    read as one amount; `<template>` and `<noscript>` content counts), and
 *  - the `alt`, `title` and `aria-label` attributes of the subtree.
 *
 * An amount counts as inside the fact only when it lies wholly within the
 * element: an amount that starts in the fact and ends outside it is reported.
 * An attribute counts as inside when its element is, or sits within, that fact.
 *
 * Pure: it works on an HTML string for the `[data-section=price-layers]`
 * subtree (see `extractPriceLayersSections`) and reads no files.
 */
import { HTMLElement, parse } from 'node-html-parser';
import { extractPage } from './html';

/**
 * Detects a rupee amount: the `₹` sign, "Rs", "Rs." or "INR" (any case),
 * then an optional space, then a digit. Spaced and glued forms both match.
 */
export const RUPEE_AMOUNT = /(?:₹|\bRs\.?|\bINR)\s?\d/iu;

/**
 * The whole amount, for reporting: the marker, the optional space, digits with
 * any grouping commas (Indian `18,00,000` or western `1,800,000`) and optional decimals.
 */
const RUPEE_AMOUNT_FULL_SOURCE = String.raw`(?:₹|\bRs\.?|\bINR)\s?\d(?:[\d,]*\d)?(?:\.\d+)?`;

/** Where a flagged amount was found. */
export type RupeeChannel = 'text' | 'alt' | 'title' | 'aria-label';

export interface RupeeFinding {
  /** The matched amount as written, for example `Rs. 18,00,000`. */
  text: string;
  channel: RupeeChannel;
}

const ATTRIBUTE_CHANNELS = ['alt', 'title', 'aria-label'] as const;

function isFactFor(el: HTMLElement, factId: string): boolean {
  return (
    /(?:^|\s)fact(?:\s|$)/.test(el.getAttribute('class') ?? '') && el.getAttribute('data-fact-id') === factId
  );
}

function insideFact(el: HTMLElement, factId: string): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentNode as HTMLElement | null) {
    if (typeof n.getAttribute === 'function' && isFactFor(n, factId)) return true;
  }
  return false;
}

function allMatches(text: string): { text: string; start: number; end: number }[] {
  const re = new RegExp(RUPEE_AMOUNT_FULL_SOURCE, 'giu');
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/**
 * Every rupee amount in the subtree that is not wholly inside the
 * `<span class="fact" data-fact-id="{allowedFactId}">` element, in document
 * order for text, then attributes. An empty list means the subtree is clean.
 */
export function findRupeeAmountsOutsideFact(
  section: string | HTMLElement,
  allowedFactId: string,
): RupeeFinding[] {
  const html = typeof section === 'string' ? section : section.outerHTML;
  const findings: RupeeFinding[] = [];

  // Visible text, with the `.fact` spans mapped onto it.
  const page = extractPage('/price-layers-section', html);
  const allowedSpans = page.factSpans.filter((s) => s.factId === allowedFactId);
  for (const m of allMatches(page.visibleText)) {
    const inside = allowedSpans.some((s) => s.start <= m.start && m.end <= s.end);
    if (!inside) findings.push({ text: m.text, channel: 'text' });
  }

  // alt, title and aria-label attributes.
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ''), { blockTextElements: { script: true, style: true } });
  for (const channel of ATTRIBUTE_CHANNELS) {
    for (const el of root.querySelectorAll(`[${channel}]`)) {
      if (insideFact(el, allowedFactId)) continue;
      for (const m of allMatches(el.getAttribute(channel) ?? '')) {
        findings.push({ text: m.text, channel });
      }
    }
  }
  return findings;
}

/** The outer HTML of every `[data-section=price-layers]` element in a built page. */
export function extractPriceLayersSections(pageHtml: string): string[] {
  const root = parse(pageHtml.replace(/<!doctype[^>]*>/gi, ''), {
    blockTextElements: { script: true, style: true },
  });
  return root.querySelectorAll('[data-section="price-layers"]').map((el) => el.outerHTML);
}
