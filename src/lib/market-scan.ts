/**
 * Public projection of a market scan (Requirements 7.6, 7.7, 7.10).
 *
 * `MarketPriceContext.astro` receives only this projection, so a template cannot
 * render the private evidence trail (brands, URLs, prices, dates) by mistake.
 */
import type { MarketScanData } from './market-scan-schema';

export interface PublicMarketScan {
  conceptId: MarketScanData['conceptId'];
  rangeMin: number;
  rangeMax: number;
  label: MarketScanData['label'];
  methodNote: {
    listings: number;
    from: string;
    to: string;
    channels: string[];
  };
}

/** Returns the range, Claim_Label and method note. Never evidence, brands or URLs. */
export function toPublicMarketScan(scan: MarketScanData): PublicMarketScan {
  return {
    conceptId: scan.conceptId,
    rangeMin: scan.rangeMin,
    rangeMax: scan.rangeMax,
    label: scan.label,
    methodNote: {
      listings: scan.methodNote.listings,
      from: scan.methodNote.from,
      to: scan.methodNote.to,
      channels: [...scan.methodNote.channels],
    },
  };
}
