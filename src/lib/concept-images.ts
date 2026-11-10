/**
 * Astro-side loader for Concept_View images (Requirements 8B.1, 8B.3, 8B.6, 8B.7).
 *
 * Thin on purpose: `import.meta.glob` only works under Vite, so all logic lives
 * in the pure resolver (`concept-image-resolver.ts`).
 */
import type { ImageMetadata } from 'astro';
import { CONCEPT_IDS } from '../content/config/allow-lists';
import {
  resolveConceptColourImages,
  resolveConceptImages,
  resolveExtraPhotos,
  resolveMaterialCards,
  type BuildMode,
} from './concept-image-resolver';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/concepts/*/*.{png,jpg,webp}',
  { eager: true },
);
// Keys only: lists every file in the folders without importing any of them.
const allPaths = Object.keys(import.meta.glob('/src/assets/concepts/*/*'));

const images: Record<string, ImageMetadata> = {};
for (const [path, mod] of Object.entries(modules)) images[path] = mod.default;

// Public_Launch_Build only when PUBLIC_LAUNCH is exactly "true".
const mode: BuildMode = import.meta.env.PUBLIC_LAUNCH === 'true' ? 'public-launch' : 'dev';

const result = resolveConceptImages(images, allPaths, CONCEPT_IDS, mode);

for (const w of result.warnings) console.warn(`[concept-images] ${w}`);
if (result.errors.length > 0) {
  throw new Error(result.errors.map((e) => `[concept-images] ${e}`).join('\n'));
}

export const conceptViews = result.views;

/* ---------- Colour-aware photography (optional, additive — see concept-image-resolver.ts) ---------- */

const colourModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/concepts/*/*/*.{png,jpg,webp}',
  { eager: true },
);
const colourAllPaths = Object.keys(import.meta.glob('/src/assets/concepts/*/*/*'));

const colourImages: Record<string, ImageMetadata> = {};
for (const [path, mod] of Object.entries(colourModules)) colourImages[path] = mod.default;

const colourResult = resolveConceptColourImages(colourImages, colourAllPaths, CONCEPT_IDS);

for (const w of colourResult.warnings) console.warn(`[concept-images] ${w}`);

/** Only concept ids that have at least one recognised colour photo. */
export const conceptColourViews = colourResult.views;

/* ---------- Material_Card (optional, dynamic — see concept-image-resolver.ts) ---------- */

const materialCardResult = resolveMaterialCards(colourImages, colourAllPaths, CONCEPT_IDS);

for (const w of materialCardResult.warnings) console.warn(`[concept-images] ${w}`);

/** conceptId -> colour -> the material card, only for colours that have one. Entirely dynamic:
 * whatever `src/assets/concepts/<id>/<colour>/material-card.<ext>` files exist show up here;
 * a colour with none is just absent, so `AngleViewer.astro` renders no extra thumbnail for it. */
export const conceptMaterialCards = materialCardResult.cards;

/* ---------- Extra_Photos (optional, dynamic — see concept-image-resolver.ts) ---------- */

const extraPhotosResult = resolveExtraPhotos(colourImages, colourAllPaths, CONCEPT_IDS);

for (const w of extraPhotosResult.warnings) console.warn(`[concept-images] ${w}`);

/** conceptId -> colour -> slot -> the photo, only for the slots that exist. Entirely dynamic:
 * whatever `src/assets/concepts/<id>/<colour>/extra-{1,2,3}.<ext>` files exist show up here. */
export const conceptExtraPhotos = extraPhotosResult.photos;
