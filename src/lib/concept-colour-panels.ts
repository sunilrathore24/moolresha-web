/**
 * Shared helper for the `/designs` pages: builds the per-colour photo panels for a concept
 * from the resolved image maps in `concept-images.ts`, in the concept's declared colour
 * order, keeping only colours that actually have colour-scoped photography. Same shape
 * ConceptCard.astro assembles inline — factored out so the index and detail pages agree.
 */
import type { ImageMetadata } from 'astro';
import type { ExtraPhotoSlot, ResolvedView } from './concept-image-resolver';
import type { PaletteColour } from '../content/config/allow-lists';

export interface ColourPanel {
  colour: PaletteColour;
  views: ResolvedView<ImageMetadata>[];
  materialCard?: { path: string; image: ImageMetadata };
  extraPhotos?: Partial<Record<ExtraPhotoSlot, { path: string; image: ImageMetadata }>>;
}

interface ImageMaps {
  conceptColourViews: Record<string, Record<string, ResolvedView<ImageMetadata>[]>>;
  conceptMaterialCards: Record<string, Record<string, { path: string; image: ImageMetadata }>>;
  conceptExtraPhotos: Record<
    string,
    Record<string, Partial<Record<ExtraPhotoSlot, { path: string; image: ImageMetadata }>>>
  >;
}

export function buildColourPanels(
  conceptId: string,
  colours: readonly PaletteColour[],
  maps: ImageMaps,
): ColourPanel[] {
  const colourViews = maps.conceptColourViews[conceptId] ?? {};
  const materialCards = maps.conceptMaterialCards[conceptId] ?? {};
  const extraPhotosByColour = maps.conceptExtraPhotos[conceptId] ?? {};
  return colours
    .filter((c) => c in colourViews)
    .map((colour) => ({
      colour,
      views: colourViews[colour],
      materialCard: materialCards[colour],
      extraPhotos: extraPhotosByColour[colour],
    }));
}
