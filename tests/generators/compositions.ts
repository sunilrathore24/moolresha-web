/**
 * fast-check generators for fibre compositions (Property 21).
 *
 * `composition()` mixes valid sets, near-misses (linen just outside 10 to 20, sums off
 * by one, other fibres) and random lists. `isCoordComposition()` restates the rule from
 * Requirement 8.5 independently of the implementation.
 */
import fc from 'fast-check';
import type { CompositionPart } from '../../src/lib/coord-composition';

const part = (fibre: string, percent: number): CompositionPart => ({ fibre, percent });

/** Requirement 8.5 as an oracle: 100% cotton, or cotton plus 10 to 20% linen, summing to 100. */
export function isCoordComposition(parts: readonly CompositionPart[]): boolean {
  const total = parts.reduce((s, p) => s + p.percent, 0);
  const onlyCottonLinen = parts.every((p) => p.fibre === 'cotton' || p.fibre === 'linen');
  const linen = parts.filter((p) => p.fibre === 'linen').reduce((s, p) => s + p.percent, 0);
  const cotton = parts.filter((p) => p.fibre === 'cotton').reduce((s, p) => s + p.percent, 0);
  if (parts.length === 0 || !onlyCottonLinen || total !== 100) return false;
  if (parts.some((p) => !(p.percent > 0))) return false;
  if (linen === 0) return cotton === 100;
  return cotton > 0 && linen >= 10 && linen <= 20;
}

const OTHER_FIBRES = ['elastane', 'silk', 'polyester', 'wool'];

export function composition(): fc.Arbitrary<CompositionPart[]> {
  const pureCotton = fc.constant([part('cotton', 100)]);
  const withLinen = fc.integer({ min: 1, max: 99 }).map((l) => [part('cotton', 100 - l), part('linen', l)]);
  const validLinen = fc.integer({ min: 10, max: 20 }).map((l) => [part('cotton', 100 - l), part('linen', l)]);
  const linenFirst = fc.integer({ min: 10, max: 20 }).map((l) => [part('linen', l), part('cotton', 100 - l)]);
  const offSum = fc
    .tuple(fc.integer({ min: 10, max: 20 }), fc.integer({ min: -30, max: 30 }))
    .map(([l, d]) => [part('cotton', Math.max(1, 100 - l + d)), part('linen', l)]);
  const otherFibre = fc
    .tuple(fc.constantFrom(...OTHER_FIBRES), fc.integer({ min: 1, max: 30 }))
    .map(([f, p]) => [part('cotton', 100 - p), part(f, p)]);
  const randomList = fc.array(
    fc.record({
      fibre: fc.constantFrom('cotton', 'linen', ...OTHER_FIBRES),
      percent: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 4 },
  );
  return fc.oneof(
    { weight: 1, arbitrary: pureCotton },
    { weight: 3, arbitrary: validLinen },
    { weight: 1, arbitrary: linenFirst },
    { weight: 3, arbitrary: withLinen },
    { weight: 2, arbitrary: offSum },
    { weight: 2, arbitrary: otherFibre },
    { weight: 2, arbitrary: randomList },
    { weight: 1, arbitrary: fc.constant([] as CompositionPart[]) },
  );
}
