/**
 * Pure resolver for Concept_View image files (Requirements 8B.1 to 8B.8).
 *
 * It knows nothing about Astro or Vite. The loader in `concept-images.ts`
 * passes in the eagerly imported images, the keys of a second (non-eager) glob
 * that lists every file under `src/assets/concepts/`, the Concept ids and the
 * build mode. The result has exactly eight views per Concept, in `VIEW_BASES`
 * order, with a `placeholder` wherever no recognised file exists.
 */
import type { ConceptId } from '../content/config/allow-lists';
import { VIEW_BASES, type ViewBase } from './concept-views';

export type BuildMode = 'dev' | 'public-launch';

export const IMAGE_EXTS = ['png', 'jpg', 'webp'] as const;
export type ImageExt = (typeof IMAGE_EXTS)[number];

export const CONCEPT_IMAGE_ROOT = '/src/assets/concepts/';

export type ResolvedView<T> =
  | { view: ViewBase; status: 'file'; path: string; image: T }
  | { view: ViewBase; status: 'placeholder' };

export interface ResolveResult<T> {
  /** Always all eight views per Concept, in `VIEW_BASES` order. */
  views: Record<ConceptId, ResolvedView<T>[]>;
  warnings: string[];
  errors: string[];
}

const BASE_SET: ReadonlySet<string> = new Set(VIEW_BASES);
const EXT_SET: ReadonlySet<string> = new Set(IMAGE_EXTS);

interface Recognised {
  conceptId: string;
  base: ViewBase;
  path: string;
}

/**
 * Exact, case-sensitive match of `/src/assets/concepts/<id>/<base>.<ext>`.
 * Returns undefined for anything else (wrong case, `.jpeg`, nested folders,
 * unknown base names). `<id>` is not checked here.
 */
function parseRecognisedShape(path: string): Recognised | undefined {
  if (!path.startsWith(CONCEPT_IMAGE_ROOT)) return undefined;
  const parts = path.slice(CONCEPT_IMAGE_ROOT.length).split('/');
  if (parts.length !== 2) return undefined;
  const [conceptId, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const base = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!BASE_SET.has(base) || !EXT_SET.has(ext)) return undefined;
  return { conceptId, base: base as ViewBase, path };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function resolveConceptImages<T>(
  images: Record<string, T>,
  allPaths: string[],
  conceptIds: readonly ConceptId[],
  mode: BuildMode,
): ResolveResult<T> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const conceptSet: ReadonlySet<string> = new Set(conceptIds);

  // Every distinct path we know about, in a fixed order, so input order never matters.
  const paths = [...new Set([...allPaths, ...Object.keys(images)])].sort(compareStrings);

  // Group recognised files by "<id>\u0000<base>".
  const found = new Map<string, string[]>();
  for (const path of paths) {
    const rec = parseRecognisedShape(path);
    if (!rec || !conceptSet.has(rec.conceptId)) {
      warnings.push(`unrecognised file ${path} (expected ${CONCEPT_IMAGE_ROOT}<concept-id>/<NN-view-name>.png, .jpg or .webp in lower case)`);
      continue;
    }
    const key = `${rec.conceptId}\u0000${rec.base}`;
    const list = found.get(key);
    if (list) list.push(path);
    else found.set(key, [path]);
  }

  const views = {} as Record<ConceptId, ResolvedView<T>[]>;
  for (const id of conceptIds) {
    views[id] = VIEW_BASES.map((base): ResolvedView<T> => {
      const files = found.get(`${id}\u0000${base}`) ?? [];

      if (files.length > 1) {
        errors.push(`${id}: duplicate ${base} files: ${files.join(', ')}`);
      }

      // `files` is already sorted, so the choice under a duplicate is deterministic.
      const path = files.find((p) => Object.prototype.hasOwnProperty.call(images, p));
      if (path !== undefined) {
        return { view: base, status: 'file', path, image: images[path] };
      }

      if (files.length === 0) {
        const message = `${id}: missing ${base} (.png, .jpg or .webp)`;
        (mode === 'public-launch' ? errors : warnings).push(message);
      } else {
        // Listed on disk but not imported (loader mismatch): show a placeholder and say so.
        warnings.push(`${id}: ${base} file ${files[0]} was not imported`);
      }
      return { view: base, status: 'placeholder' };
    });
  }

  warnings.sort(compareStrings);
  errors.sort(compareStrings);
  return { views, warnings, errors };
}

/* ---------- Colour-aware resolution (optional, additive) ----------
 *
 * Some Concepts (today: mens-cotton-shirt only) have real photography per
 * Palette_Colour, one level deeper than the shape above:
 * `/src/assets/concepts/<id>/<colour>/<base>.<ext>`. This is a separate,
 * additive resolver so the plain `resolveConceptImages` above — and every
 * Concept that has no colour subfolders — is untouched.
 *
 * Unlike the resolver above, a missing colour view is always a warning, never
 * a build error: colour photography is a progressive enhancement (the
 * Angle_Viewer still shows a placeholder for that view), not a required asset.
 */
export interface ResolveColourResult<T> {
  /** Only concept ids that have at least one recognised colour-scoped file. */
  views: Record<string, Record<string, ResolvedView<T>[]>>;
  warnings: string[];
}

interface RecognisedColour {
  conceptId: string;
  colour: string;
  base: ViewBase;
  path: string;
}

function parseColourShape(path: string): RecognisedColour | undefined {
  if (!path.startsWith(CONCEPT_IMAGE_ROOT)) return undefined;
  const parts = path.slice(CONCEPT_IMAGE_ROOT.length).split('/');
  if (parts.length !== 3) return undefined;
  const [conceptId, colour, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const base = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!BASE_SET.has(base) || !EXT_SET.has(ext)) return undefined;
  return { conceptId, colour, base: base as ViewBase, path };
}

/**
 * Purely file-system driven: trusts any `<colour>` segment under a known
 * concept id (no cross-check against a Concept's declared `colours` — that
 * list lives in the content collection, which this loader does not depend
 * on, by design: see `concept-images.ts`'s build-fixture test, which copies
 * only this file, `concept-views.ts` and `allow-lists.ts`). A colour folder
 * for the wrong Palette_Colour is harmless: the caller only ever renders
 * swatches for the colours a Concept actually declares, so an unused entry
 * here is simply never shown.
 */
export function resolveConceptColourImages<T>(
  images: Record<string, T>,
  allPaths: string[],
  conceptIds: readonly ConceptId[],
): ResolveColourResult<T> {
  const warnings: string[] = [];
  const conceptSet: ReadonlySet<string> = new Set(conceptIds);
  const paths = [...new Set([...allPaths, ...Object.keys(images)])].sort(compareStrings);

  // Group recognised files by "<id>\u0000<colour>\u0000<base>".
  const found = new Map<string, string[]>();
  const coloursByConcept = new Map<string, Set<string>>();
  for (const path of paths) {
    const rec = parseColourShape(path);
    if (!rec) continue; // not a 3-segment path at all: not ours to report (the plain resolver already covers 2-segment paths; anything else is unrelated)
    if (!conceptSet.has(rec.conceptId)) {
      warnings.push(`unrecognised colour file ${path} (unknown concept id)`);
      continue;
    }
    const key = `${rec.conceptId}\u0000${rec.colour}\u0000${rec.base}`;
    const list = found.get(key);
    if (list) list.push(path);
    else found.set(key, [path]);
    const set = coloursByConcept.get(rec.conceptId) ?? new Set<string>();
    set.add(rec.colour);
    coloursByConcept.set(rec.conceptId, set);
  }

  const views: Record<string, Record<string, ResolvedView<T>[]>> = {};
  for (const [conceptId, colours] of coloursByConcept) {
    for (const colour of [...colours].sort(compareStrings)) {
      const rows = VIEW_BASES.map((base): ResolvedView<T> => {
        const key = `${conceptId}\u0000${colour}\u0000${base}`;
        const files = found.get(key) ?? [];
        if (files.length > 1) {
          warnings.push(`${conceptId}/${colour}: duplicate ${base} files: ${files.join(', ')}`);
        }
        const path = files.find((p) => Object.prototype.hasOwnProperty.call(images, p));
        if (path !== undefined) return { view: base, status: 'file', path, image: images[path] };
        return { view: base, status: 'placeholder' };
      });
      if (rows.some((r) => r.status === 'file')) {
        views[conceptId] ??= {};
        views[conceptId][colour] = rows;
      }
    }
  }

  warnings.sort(compareStrings);
  return { views, warnings };
}

/* ---------- Material_Card (optional, additive, dynamic) ----------
 *
 * One extra, non-VIEW_BASES image per colour, at `<id>/<colour>/material-card.<ext>`.
 * Entirely dynamic: a colour with no file here simply gets no extra thumbnail (see
 * `AngleViewer.astro`) — nothing to configure, nothing required.
 */
export interface ResolveMaterialCardResult<T> {
  /** conceptId -> colour -> the material card, only where one exists. */
  cards: Record<string, Record<string, { path: string; image: T }>>;
  warnings: string[];
}

const MATERIAL_CARD_BASE = 'material-card';

function parseMaterialCardShape(path: string): { conceptId: string; colour: string } | undefined {
  if (!path.startsWith(CONCEPT_IMAGE_ROOT)) return undefined;
  const parts = path.slice(CONCEPT_IMAGE_ROOT.length).split('/');
  if (parts.length !== 3) return undefined;
  const [conceptId, colour, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const base = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (base !== MATERIAL_CARD_BASE || !EXT_SET.has(ext)) return undefined;
  return { conceptId, colour };
}

export function resolveMaterialCards<T>(
  images: Record<string, T>,
  allPaths: string[],
  conceptIds: readonly ConceptId[],
): ResolveMaterialCardResult<T> {
  const warnings: string[] = [];
  const conceptSet: ReadonlySet<string> = new Set(conceptIds);
  const paths = [...new Set([...allPaths, ...Object.keys(images)])].sort(compareStrings);

  const found = new Map<string, string[]>();
  for (const path of paths) {
    const rec = parseMaterialCardShape(path);
    if (!rec) continue; // not this shape at all: not ours to report
    if (!conceptSet.has(rec.conceptId)) {
      warnings.push(`unrecognised material card ${path} (unknown concept id)`);
      continue;
    }
    const key = `${rec.conceptId}\u0000${rec.colour}`;
    const list = found.get(key);
    if (list) list.push(path);
    else found.set(key, [path]);
  }

  const cards: Record<string, Record<string, { path: string; image: T }>> = {};
  for (const [key, files] of found) {
    const [conceptId, colour] = key.split('\u0000');
    if (files.length > 1) {
      warnings.push(`${conceptId}/${colour}: duplicate material-card files: ${files.join(', ')}`);
    }
    const path = files.find((p) => Object.prototype.hasOwnProperty.call(images, p));
    if (path !== undefined) {
      cards[conceptId] ??= {};
      cards[conceptId][colour] = { path, image: images[path] };
    }
  }

  warnings.sort(compareStrings);
  return { cards, warnings };
}

/* ---------- Extra_Photos (optional, additive, dynamic) ----------
 *
 * Up to three more non-VIEW_BASES images per colour, at `<id>/<colour>/extra-1.<ext>`,
 * `extra-2.<ext>`, `extra-3.<ext>` — for real photography that does not fit one of the eight
 * named Concept_Views (an embroidery macro, a front-and-back composite, a detail collage...).
 * Entirely dynamic and independent per slot: a colour can have any subset of the three, or
 * none at all, and the mechanism never requires a specific number of files.
 */
export const EXTRA_PHOTO_SLOTS = ['extra-1', 'extra-2', 'extra-3'] as const;
export type ExtraPhotoSlot = (typeof EXTRA_PHOTO_SLOTS)[number];
const EXTRA_PHOTO_SLOT_SET: ReadonlySet<string> = new Set(EXTRA_PHOTO_SLOTS);

export interface ResolveExtraPhotosResult<T> {
  /** conceptId -> colour -> slot -> the photo, only where one exists. */
  photos: Record<string, Record<string, Partial<Record<ExtraPhotoSlot, { path: string; image: T }>>>>;
  warnings: string[];
}

function parseExtraPhotoShape(
  path: string,
): { conceptId: string; colour: string; slot: ExtraPhotoSlot } | undefined {
  if (!path.startsWith(CONCEPT_IMAGE_ROOT)) return undefined;
  const parts = path.slice(CONCEPT_IMAGE_ROOT.length).split('/');
  if (parts.length !== 3) return undefined;
  const [conceptId, colour, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const base = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!EXTRA_PHOTO_SLOT_SET.has(base) || !EXT_SET.has(ext)) return undefined;
  return { conceptId, colour, slot: base as ExtraPhotoSlot };
}

export function resolveExtraPhotos<T>(
  images: Record<string, T>,
  allPaths: string[],
  conceptIds: readonly ConceptId[],
): ResolveExtraPhotosResult<T> {
  const warnings: string[] = [];
  const conceptSet: ReadonlySet<string> = new Set(conceptIds);
  const paths = [...new Set([...allPaths, ...Object.keys(images)])].sort(compareStrings);

  const found = new Map<string, string[]>();
  for (const path of paths) {
    const rec = parseExtraPhotoShape(path);
    if (!rec) continue; // not this shape at all: not ours to report
    if (!conceptSet.has(rec.conceptId)) {
      warnings.push(`unrecognised extra photo ${path} (unknown concept id)`);
      continue;
    }
    const key = `${rec.conceptId}\u0000${rec.colour}\u0000${rec.slot}`;
    const list = found.get(key);
    if (list) list.push(path);
    else found.set(key, [path]);
  }

  const photos: Record<string, Record<string, Partial<Record<ExtraPhotoSlot, { path: string; image: T }>>>> = {};
  for (const [key, files] of found) {
    const [conceptId, colour, slot] = key.split('\u0000') as [string, string, ExtraPhotoSlot];
    if (files.length > 1) {
      warnings.push(`${conceptId}/${colour}: duplicate ${slot} files: ${files.join(', ')}`);
    }
    const path = files.find((p) => Object.prototype.hasOwnProperty.call(images, p));
    if (path !== undefined) {
      photos[conceptId] ??= {};
      photos[conceptId][colour] ??= {};
      photos[conceptId][colour][slot] = { path, image: images[path] };
    }
  }

  warnings.sort(compareStrings);
  return { photos, warnings };
}
