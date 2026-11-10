/**
 * Decides the `loading` attribute of a Concept_View image (Requirements 8A.14, 20.3).
 *
 * Only the front view in the stage of the first Concept card can be eager, and
 * only when that card is above the fold. Everything else is lazy.
 */
import type { ViewBase } from './concept-views';

export interface LoadingInput {
  conceptIndex: number;
  view: ViewBase;
  slot: 'stage' | 'grid';
  firstCardAboveFold: boolean;
}

export function loadingFor(o: LoadingInput): 'eager' | 'lazy' {
  return o.slot === 'stage' &&
    o.view === '01-front' &&
    o.conceptIndex === 0 &&
    o.firstCardAboveFold
    ? 'eager'
    : 'lazy';
}
