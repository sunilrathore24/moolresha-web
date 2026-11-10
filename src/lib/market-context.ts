/**
 * Wording for `MarketPriceContext.astro` (Requirements 7.1, 7.7, 7.8).
 *
 * Pure functions over the output of `toPublicMarketScan` (src/lib/market-scan.ts).
 * No Astro imports, so Vitest can test the exact text. The component prints these
 * strings inside one `.fact` element, so Content_Check CC-09 accepts the numbers.
 */
import { formatIsoDate } from './facts';
import type { PublicMarketScan } from './market-scan';

/** The summary of the collapsed `<details>` (Requirement 7.5; Content_Check CC-16 checks it). */
export const MARKET_SUMMARY = 'See what similar pieces cost';

/** The note shown with every market range (Requirement 7.8). */
export const MARKET_VARIES_NOTE = 'Prices vary within every brand and change often.';

/** Lead-in of the range sentence (Requirement 7.1). */
export const MARKET_RANGE_LEAD = 'Similar pieces from popular brands online and in malls: about';

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "₹1,000–2,600": en-IN grouping, one rupee sign, an en dash. */
export function formatRupeeRange(min: number, max: number): string {
  return `\u20B9${rupees.format(min)}\u2013${rupees.format(max)}`;
}

/** "Similar pieces from popular brands online and in malls: about ₹1,000–2,600" */
export function marketRangeText(scan: Pick<PublicMarketScan, 'rangeMin' | 'rangeMax'>): string {
  return `${MARKET_RANGE_LEAD} ${formatRupeeRange(scan.rangeMin, scan.rangeMax)}`;
}

/** "online marketplaces, brand sites and mall high-street" */
export function joinChannels(channels: readonly string[]): string {
  if (channels.length <= 1) return channels.join('');
  return `${channels.slice(0, -1).join(', ')} and ${channels[channels.length - 1]}`;
}

/**
 * "3 listings, seen 5 Jan 2026 to 11 Jan 2026, from online marketplaces, brand sites and
 * mall high-street" (listing count, date window and channel types: Requirement 7.7).
 */
export function methodNoteText(note: PublicMarketScan['methodNote']): string {
  const noun = note.listings === 1 ? 'listing' : 'listings';
  return `${note.listings} ${noun}, seen ${formatIsoDate(note.from)} to ${formatIsoDate(note.to)}, from ${joinChannels(note.channels)}`;
}
