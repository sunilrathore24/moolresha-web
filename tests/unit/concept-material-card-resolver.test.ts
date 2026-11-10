import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { resolveMaterialCards } from '../../src/lib/concept-image-resolver';

const ROOT = '/src/assets/concepts/';
const SHIRT = 'mens-cotton-shirt';

function run(paths: string[]) {
  const images = Object.fromEntries(paths.map((p) => [p, `img:${p}`]));
  return resolveMaterialCards(images, paths, CONCEPT_IDS);
}

describe('resolveMaterialCards', () => {
  it('returns nothing when no material-card file exists anywhere', () => {
    const r = run([]);
    expect(r.cards).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it('is dynamic: only colours with a file get a card, others are simply absent', () => {
    const r = run([`${ROOT}${SHIRT}/clay/material-card.png`]);
    expect(Object.keys(r.cards[SHIRT]!)).toEqual(['clay']);
    expect(r.cards[SHIRT]!.clay).toEqual({ path: `${ROOT}${SHIRT}/clay/material-card.png`, image: `img:${ROOT}${SHIRT}/clay/material-card.png` });
  });

  it('does not treat a view image as a material card, or vice versa', () => {
    const r = run([`${ROOT}${SHIRT}/clay/01-front.png`]);
    expect(r.cards).toEqual({});
  });

  it('reports a duplicate (two extensions for the same colour) as a warning naming both files', () => {
    const a = `${ROOT}${SHIRT}/clay/material-card.png`;
    const b = `${ROOT}${SHIRT}/clay/material-card.webp`;
    const r = run([a, b]);
    const dup = r.warnings.find((w) => w.includes('duplicate'));
    expect(dup).toBeDefined();
    expect(dup).toContain(`${SHIRT}/clay`);
    expect(dup).toContain(a);
    expect(dup).toContain(b);
  });

  it('warns about a material card under an unknown concept id, and ignores it', () => {
    const r = run([`${ROOT}not-a-concept/clay/material-card.png`]);
    expect(r.cards).toEqual({});
    expect(r.warnings.some((w) => w.includes('not-a-concept/clay/material-card.png'))).toBe(true);
  });

  it('is independent of input order', () => {
    const paths = [`${ROOT}${SHIRT}/clay/material-card.png`, `${ROOT}${SHIRT}/flax/material-card.png`];
    const a = run(paths);
    const b = run([...paths].reverse());
    expect(b).toEqual(a);
  });
});
