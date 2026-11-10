/**
 * fast-check arbitrary for Concept_Image_Folder contents, used by the image
 * resolver properties (41, 42, 43). No files are touched: everything is a string.
 */
import fc from 'fast-check';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { VIEW_BASES } from '../../src/lib/concept-views';
import { IMAGE_EXTS } from '../../src/lib/concept-image-resolver';

const ROOT = '/src/assets/concepts/';

export type ExtraKind =
  | 'duplicate' // a second recognised extension for a base name that already has a file
  | 'bad-case' // upper-case extension, e.g. 01-front.PNG
  | 'bad-ext' // .jpeg, .gif, .avif
  | 'unknown-base' // side.png, 09-extra.png
  | 'nested' // a file one folder deeper
  | 'foreign-folder'; // a folder that is not a Concept_ID

export interface ConceptImagePaths {
  /** Every path under the Concept folders (the keys-only glob), in random order. */
  allPaths: string[];
  /** Recognised paths only, mapped to opaque tokens (the eager glob), in random order. */
  images: Record<string, string>;
  /** Paths the resolver must treat as recognised. */
  recognised: string[];
  /** Paths the resolver must treat as unrecognised, with why. */
  unrecognised: { path: string; kind: Exclude<ExtraKind, 'duplicate'> }[];
  /** Groups of two or more recognised paths for the same (Concept, base name). */
  duplicates: { conceptId: string; base: string; paths: string[] }[];
  /** (Concept, base name) pairs with no recognised file. */
  missing: { conceptId: string; base: string }[];
}

const ext = fc.constantFrom(...IMAGE_EXTS);

/** A random subset of the eight base names, each with one recognised extension. */
function conceptFiles(): fc.Arbitrary<{ base: string; ext: string }[]> {
  return fc
    .array(fc.tuple(fc.boolean(), ext), { minLength: VIEW_BASES.length, maxLength: VIEW_BASES.length })
    .map((flags) =>
      VIEW_BASES.flatMap((base, i) => (flags[i][0] ? [{ base: base as string, ext: flags[i][1] as string }] : [])),
    );
}

const badCasePath = (id: string, base: string, e: string) => `${ROOT}${id}/${base}.${e.toUpperCase()}`;

export function conceptImagePaths(): fc.Arbitrary<ConceptImagePaths> {
  const perConcept = fc.tuple(
    ...CONCEPT_IDS.map((id) =>
      fc.record({
        id: fc.constant<string>(id),
        files: conceptFiles(),
        // for each base name: pick an optional second extension (duplicate)
        dupExts: fc.array(fc.option(ext, { nil: undefined }), {
          minLength: VIEW_BASES.length,
          maxLength: VIEW_BASES.length,
        }),
      }),
    ),
  );

  const extras = fc.array(
    fc.record({
      kind: fc.constantFrom<Exclude<ExtraKind, 'duplicate'>>(
        'bad-case',
        'bad-ext',
        'unknown-base',
        'nested',
        'foreign-folder',
      ),
      id: fc.constantFrom<string>(...CONCEPT_IDS),
      base: fc.constantFrom<string>(...VIEW_BASES),
      ext: ext as fc.Arbitrary<string>,
      other: fc.constantFrom('jpeg', 'gif', 'avif', 'txt'),
      unknown: fc.constantFrom('side', 'front', '09-extra', '1-front', 'notes', '01-Front'),
      folder: fc.constantFrom('other-concept', 'Mens-Cotton-Shirt', 'drafts', 'mens-cotton-shirt-old'),
    }),
    { maxLength: 8 },
  );

  return fc.tuple(perConcept, extras, fc.integer()).map(([concepts, extraSpecs, seed]) => {
    const recognised: string[] = [];
    const duplicates: ConceptImagePaths['duplicates'] = [];
    const missing: ConceptImagePaths['missing'] = [];

    for (const c of concepts) {
      VIEW_BASES.forEach((base, i) => {
        const file = c.files.find((f) => f.base === base);
        if (!file) {
          missing.push({ conceptId: c.id, base });
          return;
        }
        const paths = [`${ROOT}${c.id}/${base}.${file.ext}`];
        const second = c.dupExts[i];
        if (second && second !== file.ext && i % 3 === 0) {
          paths.push(`${ROOT}${c.id}/${base}.${second}`);
        }
        recognised.push(...paths);
        if (paths.length > 1) duplicates.push({ conceptId: c.id, base, paths: [...paths] });
      });
    }

    const unrecognisedMap = new Map<string, Exclude<ExtraKind, 'duplicate'>>();
    for (const x of extraSpecs) {
      let path: string;
      switch (x.kind) {
        case 'bad-case':
          path = badCasePath(x.id, x.base, x.ext);
          break;
        case 'bad-ext':
          path = `${ROOT}${x.id}/${x.base}.${x.other}`;
          break;
        case 'unknown-base':
          path = `${ROOT}${x.id}/${x.unknown}.${x.ext}`;
          break;
        case 'nested':
          path = `${ROOT}${x.id}/raw/${x.base}.${x.ext}`;
          break;
        default:
          path = `${ROOT}${x.folder}/${x.base}.${x.ext}`;
      }
      // A generated extra can never collide with a recognised path (checked below).
      if (!recognised.includes(path)) unrecognisedMap.set(path, x.kind);
    }
    const unrecognised = [...unrecognisedMap].map(([path, kind]) => ({ path, kind }));

    const all = [...recognised, ...unrecognised.map((u) => u.path)];
    const allPaths = shuffle(all, seed);
    const images: Record<string, string> = {};
    for (const p of shuffle(recognised, seed + 1)) images[p] = `img:${p}`;

    return { allPaths, images, recognised, unrecognised, duplicates, missing };
  });
}

/** Deterministic shuffle (Fisher-Yates with a small LCG) so the arbitrary stays reproducible. */
function shuffle<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let s = (seed >>> 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
