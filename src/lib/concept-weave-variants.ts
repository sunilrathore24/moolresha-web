/**
 * Weave variants within one Concept (2026-11) — different FABRIC WEAVES of the same garment
 * (today, only `mens-cotton-shirt`: the original Fine Diamond Micro-Dobby, "RootWeave 01", and
 * a second weave the user added photos and copy for separately, Cotton Slub, "RootWeave 02").
 * This is deliberately separate from `concept-design-variants.ts`'s DESIGN variants
 * (womens-coord-set's two garment designs) — different problem, different shape: a design
 * variant replaces the feedback form's colour question with a design question (one photo set
 * per design); a weave variant sits ABOVE the colour question, unchanged — mens-cotton-shirt
 * already has a full, working six-colour Palette_Colour gallery for Micro-Dobby, and this must
 * keep working exactly as before. Mixing the two models into one would have broken that.
 *
 * Picking a weave changes everything `/designs/[conceptId].astro` renders for it: the gallery,
 * the fabric-spec grid, and the Fabric/Why-This-Fabric tab content — each weave gets its own
 * full copy of all three, nested inside its own Tabs panel (see that page for the structure).
 * The feedback form stays a SINGLE shared instance below all of it; a hidden `weave` field,
 * kept in sync with whichever tab is open, tags the submission (functions/_shared/schemas.ts,
 * a real `weave` column — migrations/0003_feedback_weave.sql). The form's own colour question
 * is untouched either way: it still asks about the Concept's real Palette_Colour set.
 *
 * The photos themselves are NOT imported here. Each weave's files live at
 * `src/assets/concepts/<id>/<colour-key>/<NN-view-name>.<ext>` — the exact shape
 * `concept-image-resolver.ts`'s colour-aware resolver already expects (one subfolder level
 * under the Concept, any name, no cross-check against the Palette_Colour enum). Cotton Slub's
 * six colourways are plain sibling folders of Micro-Dobby's six real colours (`meadow`, `flax`,
 * `clay`, ...) — distinct strings (`desert_clay`, `natural_flax`, `blue`, `green`, `ivory`,
 * `charcoal`), so there is no key collision, and no change to the image resolver or its glob
 * depth was needed. `natural_flax`'s source folder had one extra photo that was the wrong
 * colour entirely (a rust/terracotta back view sitting in the flax folder, apparently misplaced)
 * — left out rather than used; flagged in case a real flax-coloured version of it exists.
 * `charcoal` has only one photo today (no hanger shot was supplied), so it is `01-front` only —
 * AngleViewer just shows the one image with no thumbnail strip, same as any other Concept
 * mid-way through getting its full photo set.
 *
 * `fabricNotes`/`whyThisFabric` mirror mens-cotton-shirt.yaml's own `FabricNotesData`/
 * `WhyThisFabricData` shapes exactly (concept-schema.ts) so `ProductSpecificationGrid.astro` /
 * `FabricNotes.astro` / `WhyThisFabric.astro` render them with zero changes to those
 * components — but because this lives in a plain `.ts` config, not the YAML content
 * collection, it is NOT scanned by Content_Check (CC-01/02/09/13/17-20 etc. only ever load
 * `src/content/concepts/*.yaml`). The copy below keeps the same hedging the YAML's own
 * Micro-Dobby copy uses ("design intent, not a tested result") precisely so it stays honest on
 * its own, not because a rule would otherwise catch it.
 *
 * Plain TypeScript, no Astro import, so Vitest can load it directly.
 */
import type { ConceptId, WeaveId } from '../content/config/allow-lists';
import type { FabricNotesData, WhyThisFabricData } from './concept-schema';

export interface WeaveColour {
  /** The `conceptColourViews`/`buildColourPanels` key — a real subfolder name, resolved the
   * same way a Palette_Colour subfolder is, with no enum cross-check. */
  key: string;
  label: string;
}

export interface WeaveVariant {
  id: WeaveId;
  label: string;
  /** Shown as a small caption on the tab, matching the existing `productCode` eyebrow
   * ("RootWeave 01") already shown in the page header for the Concept's main weave. */
  productCode?: string;
  /** Omit to mean "this weave is the Concept's own default Palette_Colour photography,
   * unchanged" (Micro-Dobby's existing six real colours). Provide an explicit list for a
   * weave that has its own, separate colour-like photo folders (Cotton Slub's six). */
  colours?: WeaveColour[];
  /** Omit to mean "use the Concept's own `fabricNotes`" (Micro-Dobby). */
  fabricNotes?: FabricNotesData;
  /** Omit to mean "use the Concept's own `whyThisFabric`" (Micro-Dobby). */
  whyThisFabric?: WhyThisFabricData;
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
        { key: 'blue', label: 'Coastal Blue' },
        { key: 'green', label: 'Sage Green' },
        { key: 'ivory', label: 'Ivory' },
        { key: 'charcoal', label: 'Charcoal' },
      ],
      fabricNotes: {
        composition: [{ fibre: 'cotton', percent: 100 }],
        weave: 'Fine cotton slub',
        weight: 'Lightweight, for everyday comfort (exact GSM target to be confirmed with our mill)',
        handFeel: 'Soft, with a visible thick-and-thin slub texture and a relaxed, natural drape',
        softness: 'Aimed at a soft, gentle hand feel from fine combed cotton yarn; we will check it after repeated washes',
        care: 'Machine wash cold, dry in shade, warm iron on the reverse side',
      },
      whyThisFabric: {
        lead: 'Some fabrics make an impression through colour. Others through patterns. Cotton Slub finds its character in the yarn itself — subtle thick-and-thin variations that give a solid colour its own quiet depth.',
        onSkin:
          'This is a research-stage concept, so here is our design intent rather than a tested result: we expect the fine combed cotton and lightweight weave to feel soft and breathable against skin, with a relaxed, natural drape. We have not run wear trials to confirm this yet.',
        premiumDifference:
          "What we think sets this apart is the yarn, not a print: the thick-and-thin slub variation is woven in, so the texture stays quiet and natural rather than announcing itself. The fabric itself stays simple — 100% cotton, no polyester or synthetic blends.",
      },
    },
  ],
};
