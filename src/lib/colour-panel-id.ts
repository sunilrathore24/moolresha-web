/**
 * Shared id convention between `ColourSwatches.astro` (the swatch anchors'
 * `href`) and `ConceptCard.astro` (the `[data-colour-panel]` wrappers they
 * point at). Pure, so it's one source of truth for both components.
 */
export function colourPanelId(conceptId: string, colour: string): string {
  return `colour-panel-${conceptId}-${colour}`;
}
