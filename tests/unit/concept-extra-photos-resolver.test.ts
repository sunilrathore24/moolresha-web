import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { resolveExtraPhotos } from '../../src/lib/concept-image-resolver';

const ROOT = '/src/assets/concepts/';
const SHIRT = 'mens-cotton-shirt';

function run(paths: string[]) {
  const images = Object.fromEntries(paths.map((p) => [p, `img:${p}`]));
  return resolveExtraPhotos(images, paths, CONCEPT_IDS);
}

describe('resolveExtraPhotos', () => {
  it('returns nothing when no extra-N file exists anywhere', () => {
    const r = run([]);
    expect(r.photos).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it('is dynamic: only colours with a file get a slot, others are simply absent', () => {
    const r = run([`${ROOT}${SHIRT}/clay/extra-1.png`]);
    expect(Object.keys(r.photos[SHIRT]!)).toEqual(['clay']);
    expect(r.photos[SHIRT]!.clay).toEqual({
      'extra-1': { path: `${ROOT}${SHIRT}/clay/extra-1.png`, image: `img:${ROOT}${SHIRT}/clay/extra-1.png` },
    });
  });

  it('keeps the three slots independent, per colour', () => {
    const r = run([
      `${ROOT}${SHIRT}/clay/extra-1.png`,
      `${ROOT}${SHIRT}/clay/extra-2.png`,
      `${ROOT}${SHIRT}/flax/extra-1.png`,
    ]);
    expect(Object.keys(r.photos[SHIRT]!.clay!).sort()).toEqual(['extra-1', 'extra-2']);
    expect(Object.keys(r.photos[SHIRT]!.flax!)).toEqual(['extra-1']);
  });

  it('does not treat a view image, or a material card, as an extra photo, or vice versa', () => {
    const r = run([`${ROOT}${SHIRT}/clay/01-front.png`, `${ROOT}${SHIRT}/clay/material-card.png`]);
    expect(r.photos).toEqual({});
  });

  it('rejects a fourth slot name — only extra-1, extra-2 and extra-3 are recognised', () => {
    const r = run([`${ROOT}${SHIRT}/clay/extra-4.png`]);
    expect(r.photos).toEqual({});
    expect(r.warnings).toEqual([]); // not our shape at all, so not ours to warn about either
  });

  it('reports a duplicate (two extensions for the same colour and slot) as a warning naming both files', () => {
    const a = `${ROOT}${SHIRT}/clay/extra-1.png`;
    const b = `${ROOT}${SHIRT}/clay/extra-1.webp`;
    const r = run([a, b]);
    const dup = r.warnings.find((w) => w.includes('duplicate'));
    expect(dup).toBeDefined();
    expect(dup).toContain(`${SHIRT}/clay`);
    expect(dup).toContain(a);
    expect(dup).toContain(b);
  });

  it('warns about an extra photo under an unknown concept id, and ignores it', () => {
    const r = run([`${ROOT}not-a-concept/clay/extra-1.png`]);
    expect(r.photos).toEqual({});
    expect(r.warnings.some((w) => w.includes('not-a-concept/clay/extra-1.png'))).toBe(true);
  });

  it('is independent of input order', () => {
    const paths = [`${ROOT}${SHIRT}/clay/extra-1.png`, `${ROOT}${SHIRT}/flax/extra-2.png`];
    const a = run(paths);
    const b = run([...paths].reverse());
    expect(b).toEqual(a);
  });
});
