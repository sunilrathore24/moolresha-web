import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { VIEW_BASES } from '../../src/lib/concept-views';
import { resolveConceptImages } from '../../src/lib/concept-image-resolver';
import { conceptImagePaths } from '../generators/concept-image-paths';

const ROOT = '/src/assets/concepts/';
const SHIRT = 'mens-cotton-shirt';

function run(paths: string[], mode: 'dev' | 'public-launch' = 'dev') {
  const images = Object.fromEntries(paths.map((p) => [p, `img:${p}`]));
  return resolveConceptImages(images, paths, CONCEPT_IDS, mode);
}

describe('resolveConceptImages', () => {
  it('yields eight placeholders per Concept when no files exist (dev: warnings only)', () => {
    const r = run([]);
    for (const id of CONCEPT_IDS) {
      expect(r.views[id].map((v) => v.view)).toEqual([...VIEW_BASES]);
      expect(r.views[id].every((v) => v.status === 'placeholder')).toBe(true);
    }
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(CONCEPT_IDS.length * VIEW_BASES.length);
    expect(r.warnings).toContain(`${SHIRT}: missing 01-front (.png, .jpg or .webp)`);
  });

  it('turns missing views into errors in public-launch mode', () => {
    const r = run([], 'public-launch');
    expect(r.warnings).toEqual([]);
    expect(r.errors).toHaveLength(CONCEPT_IDS.length * VIEW_BASES.length);
    expect(r.errors).toContain(`${SHIRT}: missing 08-on-model (.png, .jpg or .webp)`);
  });

  it('resolves a recognised file and leaves the other views as placeholders', () => {
    const p = `${ROOT}${SHIRT}/03-side.webp`;
    const r = run([p]);
    const side = r.views[SHIRT][2];
    expect(side).toEqual({ view: '03-side', status: 'file', path: p, image: `img:${p}` });
    expect(r.views[SHIRT].filter((v) => v.status === 'placeholder')).toHaveLength(7);
  });

  it('accepts .png, .jpg and .webp', () => {
    const paths = ['01-front.png', '02-front-three-quarter.jpg', '03-side.webp'].map((f) => `${ROOT}${SHIRT}/${f}`);
    const r = run(paths);
    expect(r.views[SHIRT].slice(0, 3).every((v) => v.status === 'file')).toBe(true);
  });

  it('reports duplicates as errors naming both files, in every mode', () => {
    const a = `${ROOT}${SHIRT}/03-side.png`;
    const b = `${ROOT}${SHIRT}/03-side.webp`;
    for (const mode of ['dev', 'public-launch'] as const) {
      const r = run([a, b], mode);
      const dup = r.errors.find((e) => e.includes('duplicate'));
      expect(dup).toBeDefined();
      expect(dup).toContain(SHIRT);
      expect(dup).toContain(a);
      expect(dup).toContain(b);
    }
  });

  it('warns about unrecognised names and non-Concept folders without failing', () => {
    const bad = [
      `${ROOT}${SHIRT}/01-front.PNG`,
      `${ROOT}${SHIRT}/01-front.jpeg`,
      `${ROOT}${SHIRT}/side.png`,
      `${ROOT}not-a-concept/01-front.png`,
      `${ROOT}${SHIRT}/raw/01-front.png`,
    ];
    const r = run(bad);
    expect(r.errors).toEqual([]);
    for (const p of bad) expect(r.warnings.some((w) => w.includes(p))).toBe(true);
    // a misnamed file still counts as missing
    expect(r.views[SHIRT][0].status).toBe('placeholder');
    expect(r.warnings).toContain(`${SHIRT}: missing 01-front (.png, .jpg or .webp)`);
  });

  it('a misnamed file makes a public-launch build fail', () => {
    const r = run([`${ROOT}${SHIRT}/01-front.PNG`], 'public-launch');
    expect(r.errors).toContain(`${SHIRT}: missing 01-front (.png, .jpg or .webp)`);
  });

  it('is independent of input order and sorted', () => {
    const paths = VIEW_BASES.slice(0, 5).map((b) => `${ROOT}${SHIRT}/${b}.png`);
    const a = run(paths);
    const b = run([...paths].reverse());
    expect(b).toEqual(a);
    expect(a.warnings).toEqual([...a.warnings].sort());
  });

  it('works with the conceptImagePaths generator (smoke)', () => {
    fc.assert(
      fc.property(conceptImagePaths(), (g) => {
        const r = resolveConceptImages(g.images, g.allPaths, CONCEPT_IDS, 'dev');
        for (const id of CONCEPT_IDS) expect(r.views[id]).toHaveLength(8);
        expect(r.errors.length).toBe(g.duplicates.length);
        for (const u of g.unrecognised) expect(r.warnings.some((w) => w.includes(u.path))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
