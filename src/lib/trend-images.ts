/**
 * Image registry for the Trends section. Each photo illustrates its own Trend_Card's
 * Fact, not a reused journey/process photo (the earlier placeholders — yarn cones for
 * "Order size and spend", raw cotton for "Hybrid work and dress codes" — didn't match
 * what the card actually says). All files live in src/assets/trends/ and are rendered
 * through Astro `<Picture>`, never from /public.
 *
 * Astro-only module (it imports image files). Pure data modules must not import it, so
 * Vitest can load them without the Astro image pipeline.
 */
import type { ImageMetadata } from 'astro';
import orderSizeSpend from '../assets/trends/order-size-spend.jpg';
import relaxedMenswear from '../assets/trends/relaxed-menswear.jpg';
import trustedRecommendations from '../assets/trends/trusted-recommendations.jpg';
import hybridWork from '../assets/trends/hybrid-work.jpg';

export const TREND_IMAGES = {
  'order-size-spend': orderSizeSpend,
  'relaxed-menswear': relaxedMenswear,
  'trusted-recommendations': trustedRecommendations,
  'hybrid-work': hybridWork,
} as const satisfies Record<string, ImageMetadata>;

export type TrendImageName = keyof typeof TREND_IMAGES;

export function trendImage(name: TrendImageName): ImageMetadata {
  return TREND_IMAGES[name];
}
