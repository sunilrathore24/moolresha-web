/**
 * Concept schema (Requirements 8, 8A.13, 8C, 9.7): views and alt text,
 * Fabric_Notes, Quality_Card and Price_Bands.
 *
 * Pure Zod, no Astro imports, so Vitest and the Content_Check script reuse it.
 * `src/content.config.ts` wires `Concept` to the `concepts` collection.
 */
import { z } from 'zod';
import { CONCEPT_IDS, PALETTE } from '../content/config/allow-lists';
import { VIEW_BASES, type ViewBase } from './concept-views';
import { isValidCoordComposition } from './coord-composition';
import { PriceBandsSchema } from './price-bands';

/* ---------- Views (alt text and image kind) ---------- */

const ViewAlt = z.string().min(20).max(200);

const altShape = Object.fromEntries(VIEW_BASES.map((v) => [v, ViewAlt])) as Record<
  ViewBase,
  typeof ViewAlt
>;

export const ConceptViews = z
  .object({
    /** 'render' shows the Render_Label on every view (Requirement 8A.12). */
    kind: z.enum(['render', 'photo']).default('render'),
    alt: z.object(altShape).strict(),
  })
  .strict();
export type ConceptViewsData = z.output<typeof ConceptViews>;

/* ---------- Quality_Card ---------- */

export const QUALITY_ROWS = [
  'fibre',
  'yarn',
  'fabric',
  'on_your_skin',
  'shrinkage',
  'after_a_year',
  'care',
] as const;
export type QualityRowId = (typeof QUALITY_ROWS)[number];

/** Row names in the exact order and wording of Requirement 8C.1. */
export const QUALITY_ROW_NAMES: Record<QualityRowId, string> = {
  fibre: 'Fibre',
  yarn: 'Yarn',
  fabric: 'Fabric',
  on_your_skin: 'On your skin',
  shrinkage: 'Shrinkage',
  after_a_year: 'After a year of washing',
  care: 'Care',
};

/** Stored values. `WeWillTest` is shown as "We'll test" (see QUALITY_LABEL_TEXT). */
export const QUALITY_LABELS = ['FACT', 'Target', 'WeWillTest'] as const;
export type QualityLabel = (typeof QUALITY_LABELS)[number];

/** The visible tag for each Quality_Label. */
export const QUALITY_LABEL_TEXT: Record<QualityLabel, string> = {
  FACT: 'FACT',
  Target: 'Target',
  WeWillTest: "We'll test",
};

/** A range, never one value (Requirement 8C.6). */
export const SpecRange = z
  .strictObject({
    kind: z.enum(['gsm', 'count']),
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .refine((r) => r.min < r.max, 'a range needs min < max');

export const QualityRow = z
  .strictObject({
    row: z.enum(QUALITY_ROWS),
    label: z.enum(QUALITY_LABELS),
    text: z
      .string()
      .max(160)
      .refine((s) => !/[\r\n]/.test(s), 'one line only'),
    factId: z.string().optional(),
    test: z.strictObject({ what: z.string().min(1), publish: z.string().min(1) }).optional(),
    range: SpecRange.optional(),
  })
  .superRefine((r, ctx) => {
    if (r.label === 'FACT' && !r.factId) {
      ctx.addIssue({ code: 'custom', path: ['factId'], message: 'FACT needs a factId' });
    }
    if (r.label !== 'FACT' && r.factId) {
      ctx.addIssue({ code: 'custom', path: ['factId'], message: 'only FACT rows reference a fact' });
    }
    if (r.label === 'WeWillTest' && !r.test) {
      ctx.addIssue({ code: 'custom', path: ['test'], message: "We'll test needs what and publish" });
    }
    if (r.label !== 'WeWillTest' && r.test) {
      ctx.addIssue({ code: 'custom', path: ['test'], message: "test is only for We'll test rows" });
    }
    if (r.range && r.label !== 'Target') {
      ctx.addIssue({ code: 'custom', path: ['range'], message: 'ranges are Target values' });
    }
    if (r.label !== 'FACT' && r.text.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['text'], message: "Target and We'll test rows need text" });
    }
  });
export type QualityRowData = z.output<typeof QualityRow>;

export const QualityCard = z
  .array(QualityRow)
  .length(7)
  .refine(
    (rows) => rows.map((r) => r.row).join() === QUALITY_ROWS.join(),
    'rows must be the seven rows, in order',
  );
export type QualityCardData = z.output<typeof QualityCard>;

/* ---------- Fabric_Notes ---------- */

export const FIBRES = ['cotton', 'linen', 'elastane'] as const;
export const Fibre = z.enum(FIBRES);
export type FibreName = z.infer<typeof Fibre>;

export const CompositionPartSchema = z.strictObject({
  fibre: Fibre,
  percent: z.number().int().min(1).max(100),
});

export const FabricNotes = z.strictObject({
  composition: z
    .array(CompositionPartSchema)
    .min(1)
    .refine((parts) => parts.reduce((sum, p) => sum + p.percent, 0) === 100, 'composition must sum to 100'),
  /** Omitted unless a Fact_Registry entry backs the term (Requirement 8.4). */
  yarnQuality: z.strictObject({ term: z.string().min(1), factId: z.string().min(1) }).optional(),
  weave: z.string().min(1),
  weight: z.string().min(1),
  handFeel: z.string().min(1),
  softness: z.string().min(1),
  care: z.string().min(1),
});
export type FabricNotesData = z.output<typeof FabricNotes>;

/* ---------- Concept ---------- */

export const PaletteColourSchema = z.enum(PALETTE);

/** Comfort & construction notes (optional: only concepts with real copy render this fold). */
export const ConstructionNotes = z.strictObject({
  fit: z.string().min(1),
  details: z.array(z.string().min(1)).min(1),
});
export type ConstructionNotesData = z.output<typeof ConstructionNotes>;

export const Concept = z
  .object({
    id: z.enum(CONCEPT_IDS),
    order: z.number().int().min(1).max(5),
    /** True only for mens-cotton-shirt (Requirement 8.1). */
    featured: z.boolean(),
    name: z.string().min(1),
    /** Small badge next to the Concept number, e.g. "RootWeave 01". Optional: most Concepts have none. */
    productCode: z.string().min(1).optional(),
    /** mens-linen-shirt is marked as a later product (Requirement 8.1). */
    laterProduct: z.boolean().default(false),
    views: ConceptViews,
    quality: QualityCard,
    fabricNotes: FabricNotes,
    construction: ConstructionNotes.optional(),
    priceBands: PriceBandsSchema,
    marketScanId: z.string().min(1),
    colours: z.array(PaletteColourSchema).min(1).max(PALETTE.length).default([...PALETTE]),
  })
  .superRefine((c, ctx) => {
    // Requirement 8.5: the co-ord set is 100% cotton, or cotton plus 10-20% linen.
    if (c.id === 'womens-coord-set' && !isValidCoordComposition(c.fabricNotes.composition)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fabricNotes', 'composition'],
        message: 'co-ord set must be 100% cotton, or cotton with 10-20% linen',
      });
    }
  });
export type ConceptData = z.output<typeof Concept>;
export type ConceptInput = z.input<typeof Concept>;
