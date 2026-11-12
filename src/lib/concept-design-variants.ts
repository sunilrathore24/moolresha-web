/**
 * Design variants within one Concept (2026-11) — distinct GARMENT designs, not Palette_Colour
 * fabric colourways. Today only `womens-coord-set` has more than one: the original pintuck-top
 * design (already real photography, shot in an indigo-toned fabric) and a second, burgundy
 * embroidered-kurta design the user added photos for separately.
 *
 * The photos themselves are NOT imported here. Design 2's files live at
 * `src/assets/concepts/<id>/<design-id>/<NN-view-name>.<ext>` — the exact shape
 * `concept-image-resolver.ts`'s colour-aware resolver already expects (it treats any folder
 * name under a Concept as a colour-like key, with no cross-check against the Palette_Colour
 * enum — see that file's own comment). So `conceptColourViews['womens-coord-set']['design-2']`
 * already resolves automatically, the same way a real second colourway would, and the gallery
 * on `/designs/[conceptId]` reuses that + `ColourSwatches.astro` as-is (generalised to accept
 * plain string keys, not just Palette_Colour). Design 1 is simply the Concept's own flat,
 * non-colour-scoped views (`conceptViews`), unchanged.
 *
 * `feedbackColour` is which REAL Palette_Colour value a design submits as on the feedback
 * form's colour question (repurposed into a design question for this Concept, per explicit
 * instruction — "these two options should be there in colour selection instead of"). This is a
 * known, deliberate approximation: Design 1's indigo photos genuinely match `indigo_dusk`, but
 * Design 2 (burgundy) has no matching Palette_Colour yet, so it borrows `clay` (the warmest
 * available) rather than extending the enum (a bigger, D1-migration-touching change). The admin
 * CSV export will show "clay" for a Design 2 preference until a real "burgundy"/"maroon" value
 * is added to the Palette_Colour allow-list — flagged, not silently hidden.
 *
 * Plain TypeScript, no Astro import, so Vitest can load it directly.
 */
import type { ConceptId, PaletteColour } from '../content/config/allow-lists';

export interface DesignVariant {
  /** Matches the `conceptColourViews`/`conceptViews` key: 'design-1' is the Concept's own flat
   * views; any other id is a real subfolder resolved the same way a colour would be. */
  id: string;
  label: string;
  feedbackColour: PaletteColour;
}

export const CONCEPT_DESIGN_VARIANTS: Partial<Record<ConceptId, DesignVariant[]>> = {
  'womens-coord-set': [
    { id: 'design-1', label: 'Design 1 — Pintuck top', feedbackColour: 'indigo_dusk' },
    { id: 'design-2', label: 'Design 2 — Embroidered kurta', feedbackColour: 'clay' },
  ],
};
