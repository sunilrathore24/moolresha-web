/**
 * Weave variants within one Concept (2026-11) — different FABRIC WEAVES of the same garment
 * (today, only `mens-cotton-shirt`: the original Fine Diamond Micro-Dobby, "RootWeave 01", and
 * a second weave the user added photos for separately, Cotton Slub, "RootWeave 02"). This is
 * deliberately separate from `concept-design-variants.ts`'s DESIGN variants (womens-coord-set's
 * two garment designs) — different problem, different shape: a design variant replaces the
 * feedback form's colour question with a design question (one photo set per design); a weave
 * variant sits ABOVE the colour question, unchanged — mens-cotton-shirt already has a full,
 * working 6-colour Palette_Colour gallery for Micro-Dobby, and this must keep working exactly
 * as before. Mixing the two models into one would have broken that.
 *
 * View-only: picking a weave only changes which photos the gallery on `/designs/[conceptId]`
 * shows. The feedback form's colour question (ConceptFeedbackForm.astro) is untouched — it
 * still asks about the Concept's real Palette_Colour set (Micro-Dobby's six), regardless of
 * which weave tab is open above it. The fabric-notes/spec-grid/tabs content further down the
 * page also stays as-is (Micro-Dobby's own facts) — there is no new Fact data (GSM, composition)
 * for Cotton Slub yet, so this does not invent any; `/designs/[conceptId].astro` shows a plain
 * note next to the weave tabs saying so, rather than silently implying the specs apply to both.
 *
 * The photos themselves are NOT imported here. Each weave's files live at
 * `src/assets/concepts/<id>/<colour-key>/<NN-view-name>.<ext>` — the exact shape
 * `concept-image-resolver.ts`'s colour-aware resolver already expects (one subfolder level
 * under the Concept, any name, no cross-check against the Palette_Colour enum). Cotton Slub's
 * two colourways (`desert_clay`, `natural_flax`) are plain sibling folders of Micro-Dobby's six
 * real colours (`meadow`, `flax`, `clay`, ...) — distinct strings, so there is no key collision,
 * and no change to the image resolver or its glob depth was needed.
 *
 * Plain TypeScript, no Astro import, so Vitest can load it directly.
 */
import type { ConceptId } from '../content/config/allow-lists';

export interface WeaveColour {
  /** The `conceptColourViews`/`buildColourPanels` key — a real subfolder name, resolved the
   * same way a Palette_Colour subfolder is, with no enum cross-check. */
  key: string;
  label: string;
}

export interface WeaveVariant {
  id: string;
  label: string;
  /** Shown as a small caption on the tab, matching the existing `productCode` eyebrow
   * ("RootWeave 01") already shown in the page header for the Concept's main weave. */
  productCode?: string;
  /** Omit to mean "this weave is the Concept's own default Palette_Colour photography,
   * unchanged" (Micro-Dobby's existing six real colours). Provide an explicit list for a
   * weave that has its own, separate colour-like photo folders (Cotton Slub's two). */
  colours?: WeaveColour[];
}

export const CONCEPT_WEAVE_VARIANTS: Partial<Record<ConceptId, WeaveVariant[]>> = {
  'mens-cotton-shirt': [
    { id: 'micro-dobby', label: 'Micro-Dobby', productCode: 'RootWeave 01' },
    {
      id: 'cotton-slub',
      label: 'Cotton Slub',
      productCode: 'RootWeave 02',
      colours: [
        { key: 'desert_clay', label: 'Desert Clay' },
        { key: 'natural_flax', label: 'Natural Flax' },
      ],
    },
  ],
};
