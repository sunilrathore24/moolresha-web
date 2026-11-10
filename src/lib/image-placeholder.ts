/**
 * Pure helpers for the Image_Placeholder (Requirement 8B.9).
 */
import type { ViewBase } from './concept-views';

export const PLACEHOLDER_TEXT = 'Design coming soon';
export const DEFAULT_FRAME_RATIO = '4 / 5';

/**
 * "Design coming soon: {Concept name}" — no design exists yet for this Concept at all (not
 * just a missing photo of one view), so the message names the Concept, not the view. `view`
 * stays a parameter for call-site stability even though it no longer appears in the text.
 */
export function placeholderLabel(conceptName: string, _view: ViewBase): string {
  return `${PLACEHOLDER_TEXT}: ${conceptName}`;
}

/**
 * CSS `aspect-ratio` value for a Concept's frame: the size of the first present
 * view, or 4 / 5 when no view exists yet.
 */
export function frameAspectRatio(
  first: { width: number; height: number } | undefined,
): string {
  if (!first || !(first.width > 0) || !(first.height > 0)) return DEFAULT_FRAME_RATIO;
  return `${first.width} / ${first.height}`;
}
