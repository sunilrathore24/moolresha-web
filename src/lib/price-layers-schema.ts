/**
 * Price_Layers and Story schemas (Requirements 4.7, 5.5, 6.1-6.4, 11A.1).
 *
 * Pure Zod, no Astro imports. The schemas hold no amount fields: layers are
 * strict objects, so `min`, `max`, `amount` or `percent` keys are rejected.
 */
import { z } from 'zod';

export const PRICE_LAYER_IDS = [
  'fabric',
  'making',
  'finishing',
  'packaging',
  'shipping',
  'rto_returns',
  'platform_payment_fees',
  'gst',
  'margin',
] as const;
export type PriceLayerId = (typeof PRICE_LAYER_IDS)[number];
const PriceLayerIdSchema = z.enum(PRICE_LAYER_IDS);

// Was "When we launch, we'll publish the real cost breakdown of every piece." — a firm
// commitment the founder isn't ready to make yet. Reworded 2026-11-09 to read as an aim,
// not a promise, so the page doesn't commit to something that might not hold.
export const LAUNCH_PROMISE = 'Our aim, not a promise yet: a real cost breakdown for every piece, once pricing is settled.';

export const PriceLayers = z
  .strictObject({
    id: z.literal('price-layers'),
    layers: z
      .array(
        z.strictObject({
          id: PriceLayerIdSchema,
          name: z.string().min(1),
          explanation: z
            .string()
            .min(1)
            .max(160)
            .refine((s) => !/[\r\n]/.test(s), 'one line only'),
        }),
      )
      .refine(
        (ls) => ls.map((l) => l.id).join() === PRICE_LAYER_IDS.join(),
        'layers must be exactly the nine layers, in order',
      ),
    launchPromise: z.literal(LAUNCH_PROMISE),
    gstFactId: z.literal('gst-cliff-2025'),
  });
export type PriceLayersData = z.output<typeof PriceLayers>;

export const Story = z.strictObject({
  leadMessage: z.literal('Most of what you pay for a shirt goes to the layers between the field and you.'),
  aimLabel: z.literal('Our aim'),
  aimStatement: z.literal('Our aim: grown, spun, woven and stitched in India, with every step shown.'),
});
export type StoryData = z.output<typeof Story>;
