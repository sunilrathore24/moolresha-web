/**
 * Market_Price_Context schema (Requirements 7.1, 7.6, 7.7, 7.9, 7.10).
 *
 * Pure Zod, no Astro runtime imports. `src/content.config.ts` wires `MarketScan`
 * to the `market-scans` collection.
 *
 * The `evidence` array is private: brand, URL, price and date seen for every
 * listing counted. It never reaches a rendered page (see `toPublicMarketScan`
 * in `src/lib/market-scan.ts`).
 */
import { z } from 'zod';
import { CONCEPT_IDS } from '../content/config/allow-lists';
import { IsoDate, MethodNote } from './fact-schema';

export const MarketEvidence = z.strictObject({
  brand: z.string().min(1),
  url: z.string().url(),
  price: z.number().int().positive(),
  seen: IsoDate,
});
export type MarketEvidenceRow = z.output<typeof MarketEvidence>;

export const MarketScan = z
  .strictObject({
    id: z.string().min(1),
    conceptId: z.enum(CONCEPT_IDS),
    label: z.literal('MoolResha market scan'),
    rangeMin: z.number().int().positive(),
    rangeMax: z.number().int().positive(),
    methodNote: MethodNote,
    evidence: z.array(MarketEvidence).min(1),
  })
  .refine((s) => s.rangeMin <= s.rangeMax, {
    message: 'rangeMin must not exceed rangeMax',
    path: ['rangeMin'],
  })
  .refine((s) => s.evidence.length === s.methodNote.listings, {
    message: 'listings count must equal evidence rows',
    path: ['methodNote', 'listings'],
  })
  .refine((s) => s.evidence.every((e) => e.price >= s.rangeMin && e.price <= s.rangeMax), {
    message: 'range must cover evidence',
    path: ['evidence'],
  })
  .refine((s) => s.evidence.every((e) => e.seen >= s.methodNote.from && e.seen <= s.methodNote.to), {
    message: 'dates within scan window',
    path: ['evidence'],
  });

export type MarketScanData = z.output<typeof MarketScan>;
export type MarketScanInput = z.input<typeof MarketScan>;
