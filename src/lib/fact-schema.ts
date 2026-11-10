/**
 * Fact_Registry schema (Requirement 3). Pure Zod, no `astro:content` import, so
 * Vitest, the Content_Check script and the Astro content collection all load the
 * same definition. `src/content.config.ts` wires `Fact` to the `facts` collection.
 */
import { z } from 'astro/zod';

export const CLAIM_LABELS = [
  'FACT',
  'INDUSTRY CLAIM',
  'BRAND CLAIM',
  'MoolResha estimate',
  'MoolResha market scan',
] as const;
export const ClaimLabel = z.enum(CLAIM_LABELS);
export type ClaimLabelText = z.infer<typeof ClaimLabel>;

/** Claim_Labels that need a Source_Link (Requirement 3.2). */
export const SOURCED_LABELS = ['FACT', 'INDUSTRY CLAIM', 'BRAND CLAIM'] as const;

export const STRENGTHS = ['STRONG', 'MODERATE', 'EMERGING', 'WEAK', 'UNVERIFIED'] as const;
export const Strength = z.enum(STRENGTHS);

export const FACT_SECTIONS = [
  'journey',
  'money',
  'price-layers',
  'concepts', // market-scan facts render inside Concept_Cards
  'why',
  'beyond-label',
  'trends',
  'privacy',
  'other',
] as const;

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Source = z.object({
  name: z.string().min(1),
  url: z.string().url().startsWith('https://'),
  date: z.string().min(4),
});

/** Method note for a `MoolResha market scan` (Requirement 3.4, 7.7). Reused by the market-scans collection. */
export const MethodNote = z.object({
  listings: z.number().int().positive(),
  from: IsoDate,
  to: IsoDate,
  channels: z
    .array(z.enum(['online marketplaces', 'brand sites', 'mall high-street']))
    .min(1),
});

const FactBase = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  text: z.string().min(1), // the sentence rendered on the page
  strength: Strength,
  lastChecked: IsoDate,
  verifyFlag: z.boolean().default(false), // the "⚠️ verify" flag
  substantiates: z.array(z.string()).default([]), // restricted words this fact substantiates (CC-03)
  mill: z.string().optional(), // for "European linen" (CC-04)
  certification: z.string().optional(),
  section: z.enum(FACT_SECTIONS),
});

export const Fact = z.discriminatedUnion('label', [
  FactBase.extend({ label: z.literal('FACT'), source: Source }),
  FactBase.extend({ label: z.literal('INDUSTRY CLAIM'), source: Source }),
  FactBase.extend({ label: z.literal('BRAND CLAIM'), source: Source }),
  FactBase.extend({
    label: z.literal('MoolResha estimate'),
    assumptions: z.array(z.string().min(1)).min(1),
  }),
  FactBase.extend({ label: z.literal('MoolResha market scan'), methodNote: MethodNote }),
]);

/** A validated Fact_Registry entry (defaults applied). */
export type FactEntry = z.output<typeof Fact>;
/** The shape written in a YAML file (defaults not yet applied). */
export type FactInput = z.input<typeof Fact>;
