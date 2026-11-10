import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { resolveConceptColourImages } from '../../src/lib/concept-image-resolver';

const ROOT = '/src/assets/concepts/';
const SHIRT = 'mens-cotton-shirt';

function run(paths: string[]) {
  const images = Object.fromEntries(paths.map((p) => [p, `img:${p}`]));
  return resolveConceptColourImages(images, paths, CONCEPT_IDS);
}

describe('resolveConceptColourImages', () => {
  it('returns no entries at all when no colour-scoped files exist', () => {
    const r = run([]);
    expect(r.views).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it('ignores plain (non-colour) two-segment paths: they are the other resolver\'s job', () => {
    const r = run([`${ROOT}${SHIRT}/01-front.png`]);
    expect(r.views).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it('resolves a recognised colour file and leaves the other seven views as placeholders', () => {
    const p = `${ROOT}${SHIRT}/clay/01-front.png`;
    const r = run([p]);
    const rows = r.views[SHIRT]!.clay!;
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ view: '01-front', status: 'file', path: p, image: `img:${p}` });
    expect(rows.filter((v) => v.status === 'placeholder')).toHaveLength(7);
  });

  it('keeps colours of different concepts, and different colours of the same concept, independent', () => {
    const a = `${ROOT}${SHIRT}/clay/01-front.png`;
    const b = `${ROOT}${SHIRT}/flax/01-front.png`;
    const c = `${ROOT}mens-linen-shirt/flax/01-front.png`;
    const r = run([a, b, c]);
    expect(Object.keys(r.views[SHIRT]!).sort()).toEqual(['clay', 'flax']);
    expect(r.views['mens-linen-shirt']!.flax![0]!.status).toBe('file');
  });

  it('reports a duplicate colour file as a warning naming both files', () => {
    const a = `${ROOT}${SHIRT}/clay/01-front.png`;
    const b = `${ROOT}${SHIRT}/clay/01-front.webp`;
    const r = run([a, b]);
    const dup = r.warnings.find((w) => w.includes('duplicate'));
    expect(dup).toBeDefined();
    expect(dup).toContain(`${SHIRT}/clay`);
    expect(dup).toContain(a);
    expect(dup).toContain(b);
  });

  it('warns about files under an unknown concept id, and still ignores them', () => {
    const r = run([`${ROOT}not-a-concept/clay/01-front.png`]);
    expect(r.views).toEqual({});
    expect(r.warnings.some((w) => w.includes('not-a-concept/clay/01-front.png'))).toBe(true);
  });

  it('is independent of input order', () => {
    const paths = ['01-front', '02-front-three-quarter', '03-side'].map(
      (b) => `${ROOT}${SHIRT}/clay/${b}.png`,
    );
    const a = run(paths);
    const b = run([...paths].reverse());
    expect(b).toEqual(a);
  });
});
