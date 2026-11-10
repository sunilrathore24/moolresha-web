/**
 * Pure helpers for `MoneyBreakdown.astro` (Requirements 5.1 to 5.3).
 *
 * The Fact_Registry holds the T-shirt price breakdown as one sentence, for example
 * "... about 60% of the price went to the retailer, 12% to brand profit ...".
 * `parseShares` reads the "<n>% [of the price went] to [the] <component>" parts out of that
 * sentence, so the chart and the table show exactly the numbers the fact states and no others.
 * No Astro imports, so Vitest can load this file.
 */

export interface MoneyShare {
  /** Component name with a capital first letter, e.g. "Brand profit". */
  label: string;
  /** Share of the retail price as the fact states it, e.g. 12. */
  percent: number;
  /** Value label as it reads in the fact, e.g. "12%". */
  display: string;
}

const SHARE_PATTERN =
  /(\d+(?:\.\d+)?)%\s+(?:of the price\s+)?(?:went\s+)?to\s+(?:the\s+)?([A-Za-z][A-Za-z -]*?)(?=\s*(?:,|\.|;|$)|\s+and\s+\d)/g;

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Shares stated in a fact's text, in the order the text gives them. Empty when none match. */
export function parseShares(text: string): MoneyShare[] {
  const out: MoneyShare[] = [];
  for (const m of text.matchAll(SHARE_PATTERN)) {
    const percent = Number(m[1]);
    const label = (m[2] ?? '').trim();
    if (!Number.isFinite(percent) || label === '') continue;
    out.push({ label: capitalise(label), percent, display: `${m[1]}%` });
  }
  return out;
}

/** Bar width in CSS percent of the full track (the whole price), clamped to 0 to 100. */
export function barWidth(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/** True when the listed shares add up to less than the whole price, so the page can say so. */
export function sharesLeaveRemainder(shares: readonly MoneyShare[]): boolean {
  const total = shares.reduce((sum, s) => sum + s.percent, 0);
  return total < 100;
}
