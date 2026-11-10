/**
 * Image registry for the launch page sections that show craft photos (journey, money,
 * price layers, why it matters, trends). All files live in src/assets/journey/ and are
 * rendered through Astro `<Picture>`, never from /public.
 *
 * The five collage tiles (cotton-pile ... hands-stitching) are cut from collage.png by
 * scripts/crop-collage.mjs (run once, by hand; not part of the build).
 *
 * Astro-only module (it imports image files). Pure data modules such as journey-stops.ts
 * must not import it, so Vitest can load them without the Astro image pipeline.
 */
import type { ImageMetadata } from 'astro';
import field from '../assets/journey/field.jpg';
import ginning from '../assets/journey/ginning.png';
import spinning from '../assets/journey/spinning.png';
import weaving from '../assets/journey/weaving.png';
import processing from '../assets/journey/processing.png';
import stitching from '../assets/journey/stitching.png';
import cottonPile from '../assets/journey/cotton-pile.jpg';
import yarnCones from '../assets/journey/yarn-cones.jpg';
import loomDetail from '../assets/journey/loom-detail.jpg';
import fabricRoll from '../assets/journey/fabric-roll.jpg';
import handsStitching from '../assets/journey/hands-stitching.jpg';
import warehousing from '../assets/journey/warehousing.jpg';
import retail from '../assets/journey/retail.jpg';

export const JOURNEY_IMAGES = {
  field,
  ginning,
  spinning,
  weaving,
  processing,
  stitching,
  warehousing,
  retail,
  'cotton-pile': cottonPile,
  'yarn-cones': yarnCones,
  'loom-detail': loomDetail,
  'fabric-roll': fabricRoll,
  'hands-stitching': handsStitching,
} as const satisfies Record<string, ImageMetadata>;

export type JourneyImageName = keyof typeof JOURNEY_IMAGES;

/**
 * CSS `object-position` per image where centre cropping would cut something that matters.
 * stitching: the worker's face sits left of centre and high in the frame; the owner wants
 * faces kept, so tall crops anchor there instead of the centre.
 */
const FOCUS: Partial<Record<JourneyImageName, string>> = {
  stitching: '30% 30%',
};

export function imageFocus(name: JourneyImageName): string {
  return FOCUS[name] ?? 'center';
}

export function journeyImage(name: JourneyImageName): ImageMetadata {
  return JOURNEY_IMAGES[name];
}

/**
 * Responsive widths for `<Picture widths>`: the candidates that are smaller than the source,
 * plus the source width itself, so no size is upscaled.
 */
export function pictureWidths(image: ImageMetadata, candidates: readonly number[]): number[] {
  const below = candidates.filter((w) => w < image.width);
  return [...below, image.width];
}
