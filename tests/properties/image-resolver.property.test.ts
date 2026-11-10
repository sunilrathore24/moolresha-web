// Properties 41, 42 and 43: the pure Concept image resolver (tasks 5.2, 5.3, 5.4).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { VIEW_BASES } from '../../src/lib/concept-views';
import {
  IMAGE_EXTS,
  resolveConceptImages,
  type BuildMode,
} from '../../src/lib/concept-image-resolver';
import { conceptImagePaths, type ConceptImagePaths } from '../generators/concept-image-paths';

const ROOT = '/src/assets/concepts/';
const modes = fc.constantFrom<BuildMode>('dev', 'public-launch');
const runs = { numRuns: 100 };

const resolve = (g: Pick<ConceptImagePaths, 'images' | 'allPaths'>, mode: BuildMode) =>
  resolveConceptImages(g.images, g.allPaths, CONCEPT_IDS, mode);

/** Messages about one missing (Concept, base name) pair: "<id>: missing <base> ...". */
const missingMessages = (messages: string[], id: string, base: string) =>
  messages.filter((m) => m.startsWith(`${id}: `) && m.includes(base) && !m.includes('duplicate'));

describe('Property 41: eight views per Concept, placeholders exactly where files are missing', () => {
  // Feature: launch-feedback-website, Property 41: The image resolver always yields eight views, with placeholders exactly where files are missing
  test.prop([conceptImagePaths(), modes], runs)(
    'always eight views in VIEW_BASES order; placeholder iff no recognised file',
    (g, mode) => {
      const r = resolve(g, mode);
      const missing = new Set(g.missing.map((m) => `${m.conceptId}|${m.base}`));
      expect(Object.keys(r.views)).toEqual([...CONCEPT_IDS]);
      for (const id of CONCEPT_IDS) {
        expect(r.views[id]).toHaveLength(8);
        expect(r.views[id].map((v) => v.view)).toEqual([...VIEW_BASES]);
        for (const entry of r.views[id]) {
          const isMissing = missing.has(`${id}|${entry.view}`);
          expect(entry.status).toBe(isMissing ? 'placeholder' : 'file');
          if (entry.status === 'file') {
            expect(g.recognised).toContain(entry.path);
            expect(entry.path.startsWith(`${ROOT}${id}/${entry.view}.`)).toBe(true);
            expect(entry.image).toBe(g.images[entry.path]);
          }
        }
      }
    },
  );

  // Feature: launch-feedback-website, Property 41: The image resolver always yields eight views, with placeholders exactly where files are missing
  test.prop([conceptImagePaths(), modes, fc.nat(), fc.constantFrom(...IMAGE_EXTS)], runs)(
    'a single recognised file turns a single placeholder into a file entry',
    (g, mode, pick, ext) => {
      fc.pre(g.missing.length > 0);
      const target = g.missing[pick % g.missing.length];
      const path = `${ROOT}${target.conceptId}/${target.base}.${ext}`;
      const before = resolve(g, mode);
      const after = resolve(
        { images: { ...g.images, [path]: `img:${path}` }, allPaths: [...g.allPaths, path] },
        mode,
      );
      for (const id of CONCEPT_IDS) {
        after.views[id].forEach((entry, i) => {
          if (id === target.conceptId && entry.view === target.base) {
            expect(before.views[id][i].status).toBe('placeholder');
            expect(entry).toEqual({ view: entry.view, status: 'file', path, image: `img:${path}` });
          } else {
            expect(entry).toEqual(before.views[id][i]);
          }
        });
      }
    },
  );
});

describe('Property 42: messages depend on the mode', () => {
  // Feature: launch-feedback-website, Property 42: Resolver messages depend on the mode as specified
  test.prop([conceptImagePaths(), modes], runs)(
    'missing views: exactly one message, a warning in dev and an error in public-launch',
    (g, mode) => {
      const r = resolve(g, mode);
      for (const { conceptId, base } of g.missing) {
        const w = missingMessages(r.warnings, conceptId, base);
        const e = missingMessages(r.errors, conceptId, base);
        if (mode === 'dev') {
          expect([w.length, e.length]).toEqual([1, 0]);
        } else {
          expect([w.length, e.length]).toEqual([0, 1]);
        }
      }
    },
  );

  // Feature: launch-feedback-website, Property 42: Resolver messages depend on the mode as specified
  test.prop([conceptImagePaths(), modes], runs)(
    'duplicates are errors naming every file in both modes; unrecognised paths are warnings only',
    (g, mode) => {
      const r = resolve(g, mode);
      for (const d of g.duplicates) {
        expect(
          r.errors.some((m) => m.includes(d.conceptId) && d.paths.every((p) => m.includes(p))),
        ).toBe(true);
      }
      for (const u of g.unrecognised) {
        expect(r.warnings.some((m) => m.includes(u.path))).toBe(true);
        expect(r.errors.some((m) => m.includes(u.path))).toBe(false);
      }
    },
  );

  // Feature: launch-feedback-website, Property 42: Resolver messages depend on the mode as specified
  test.prop([conceptImagePaths(), modes], runs)(
    'errors are empty exactly when the mode allows it',
    (g, mode) => {
      const r = resolve(g, mode);
      const noDuplicates = g.duplicates.length === 0;
      const noMissing = g.missing.length === 0;
      expect(r.errors.length === 0).toBe(mode === 'dev' ? noDuplicates : noDuplicates && noMissing);
    },
  );
});

describe('Property 43: resolver output is deterministic', () => {
  const reorder = conceptImagePaths().chain((g) =>
    fc.tuple(
      fc.constant(g),
      fc.shuffledSubarray(g.allPaths, { minLength: g.allPaths.length, maxLength: g.allPaths.length }),
      fc.shuffledSubarray(Object.keys(g.images), {
        minLength: Object.keys(g.images).length,
        maxLength: Object.keys(g.images).length,
      }),
    ),
  );

  // Feature: launch-feedback-website, Property 43: Resolver output is deterministic
  test.prop([reorder, modes], runs)(
    'input order does not change the result; warnings and errors are sorted',
    ([g, shuffledPaths, shuffledImageKeys], mode) => {
      const reorderedImages: Record<string, string> = {};
      for (const k of shuffledImageKeys) reorderedImages[k] = g.images[k];

      const a = resolve(g, mode);
      const b = resolve({ images: reorderedImages, allPaths: shuffledPaths }, mode);

      expect(b).toEqual(a);
      expect(Object.keys(b.views)).toEqual([...CONCEPT_IDS]);
      for (const id of CONCEPT_IDS) expect(b.views[id].map((v) => v.view)).toEqual([...VIEW_BASES]);
      expect(b.warnings).toEqual([...b.warnings].sort());
      expect(b.errors).toEqual([...b.errors].sort());
    },
  );

  // Feature: launch-feedback-website, Property 43: Resolver output is deterministic
  test.prop([conceptImagePaths(), modes], runs)('calling twice on the same input gives equal results', (g, mode) => {
    expect(resolve(g, mode)).toEqual(resolve(g, mode));
  });
});
