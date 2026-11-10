/**
 * Brand rules for the Content_Check (task 9.9, Requirements 7.10, 7.11, 7.12, 7.13).
 *
 *  - CC-05 brand-blocklist: no blocklisted or market-scan evidence brand may appear in
 *    any page's visible text, alt text (including `<template>`), title, meta, `og:*`,
 *    JSON-LD or `aria-label`. Reports the page, the brand and the channel.
 *  - CC-06 evidence-not-rendered: no evidence brand or evidence URL (or its host) may
 *    appear in any `dist` text file (HTML, JS, JSON, CSS ...). Reports the file and
 *    what leaked: only the brand or the host, never the full URL.
 *
 * "MoolResha" is never flagged, even when it is in a list (Requirement 7.11).
 * Pure functions: no file access.
 */
import { findBrands, foldForBrandMatch } from '../text-match';
import type { CheckContext, Rule, Violation } from './types';

const OWN_BRAND = foldForBrandMatch('MoolResha');

/** Drops empty entries, "MoolResha" and entries that fold to the same text as an earlier one. */
function dedupeBrands(brands: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const brand of brands) {
    const folded = foldForBrandMatch(brand);
    if (folded === '' || folded === OWN_BRAND || seen.has(folded)) continue;
    seen.add(folded);
    out.push(brand);
  }
  return out;
}

/** The blocklist plus every market-scan evidence brand, without "MoolResha". */
export function effectiveBlocklist(ctx: Pick<CheckContext, 'blocklist' | 'marketScans'>): string[] {
  const evidenceBrands = ctx.marketScans.flatMap((s) => s.evidence.map((e) => e.brand));
  return dedupeBrands([...ctx.blocklist, ...evidenceBrands]);
}

/** CC-05: Brand_Blocklist entries in rendered pages. */
export const cc05: Rule = (ctx) => {
  const brands = effectiveBlocklist(ctx);
  if (brands.length === 0) return [];

  const out: Violation[] = [];
  for (const page of ctx.pages) {
    const reported = new Set<string>();
    const report = (brand: string, channel: string): void => {
      const key = `${brand}\u0000${channel}`;
      if (reported.has(key)) return;
      reported.add(key);
      out.push({
        rule: 'CC-05',
        target: page.path,
        detail: `blocklisted brand "${brand}" found in ${channel}`,
      });
    };

    for (const hit of findBrands(page.visibleText, brands)) report(hit.brand, 'visible text');
    for (const c of page.channelTexts) {
      const channel = c.inTemplate ? `${c.channel} (template)` : c.channel;
      for (const hit of findBrands(c.text, brands)) report(hit.brand, channel);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// CC-06
// ---------------------------------------------------------------------------

/** Lower case, with JSON-escaped slashes (`\/`) turned back into `/`. */
function normaliseRaw(text: string): string {
  return text.toLowerCase().replace(/\\\//g, '/');
}

function hostOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === '' ? undefined : host;
  } catch {
    return undefined;
  }
}

/** True when `needle` occurs in `hay` and is not glued to a host-name character on either side. */
function containsHost(hay: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i === 0 ? '' : hay[i - 1];
    const after = hay[i + needle.length] ?? '';
    const glued = (ch: string): boolean => /[\p{L}\p{N}_-]/u.test(ch);
    if (!glued(before) && !glued(after)) return true;
    from = i + 1;
  }
}

/** CC-06: evidence brands and URLs in any dist file. */
export const cc06: Rule = (ctx) => {
  const brands = dedupeBrands(ctx.marketScans.flatMap((s) => s.evidence.map((e) => e.brand)));
  const urls = new Map<string, string | undefined>(); // lower-case URL -> host
  for (const s of ctx.marketScans) {
    for (const e of s.evidence) urls.set(e.url.toLowerCase(), hostOf(e.url));
  }
  const hosts = [...new Set([...urls.values()].filter((h): h is string => h !== undefined))];

  const out: Violation[] = [];
  for (const file of ctx.distFiles) {
    const raw = normaliseRaw(file.text);
    const reported = new Set<string>();
    const report = (detail: string): void => {
      if (reported.has(detail)) return;
      reported.add(detail);
      out.push({ rule: 'CC-06', target: file.path, detail });
    };

    for (const hit of findBrands(file.text, brands)) report(`evidence brand "${hit.brand}" leaked`);

    for (const host of hosts) {
      if (containsHost(raw, host)) report(`evidence URL host "${host}" leaked`);
    }
    // A URL whose host cannot be parsed is matched whole.
    for (const [url, host] of urls) {
      if (host === undefined && raw.includes(url)) report('evidence URL leaked (host not parseable)');
    }
  }
  return out;
};
