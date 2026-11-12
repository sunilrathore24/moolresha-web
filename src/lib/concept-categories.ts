/**
 * Display category for each concept (e.g. "Men's shirt"), shown under the product name on
 * the `/designs` index and detail pages. There is no `category` field in the Concept schema
 * yet, so this is a small presentation-only map keyed by concept id. Keep it in step with
 * CONCEPT_IDS.
 */
import type { ConceptId } from '../content/config/allow-lists';

export const CONCEPT_CATEGORIES: Record<ConceptId, string> = {
  'mens-cotton-shirt': "Men's shirt",
  'mens-cotton-linen-shirt': "Men's shirt",
  'mens-linen-shirt': "Men's shirt",
  'mens-relaxed-pant': "Men's trousers",
  'womens-coord-set': "Women's co-ord set",
};

/**
 * One short, human/marketing-style line per concept for the Design Lab grid tiles (redesign,
 * 2026-11 reference image) — e.g. "Breathable blend · Easy everyday". Deliberately generic,
 * honest adjectives, not specific numeric claims, so there's no content-check friction and
 * nothing here needs a Fact_Registry entry.
 */
export const CONCEPT_DESCRIPTORS: Record<ConceptId, string> = {
  'mens-cotton-shirt': 'Fine diamond micro-dobby · Everyday structure',
  'mens-cotton-linen-shirt': 'Breathable blend · Easy everyday',
  'mens-linen-shirt': 'Naturally airy · Timeless texture',
  'mens-relaxed-pant': 'Soft twill · Easy movement',
  'womens-coord-set': 'Light & comfortable · Versatile look',
};

/**
 * Short display name for the Design Lab grid tiles, matching the exact wording in the user's
 * reference image (2026-11) — e.g. "Pure Linen Shirt", not the full Concept schema `name`
 * ("Men's 100% linen shirt"), which stays unchanged everywhere else (page titles, breadcrumbs,
 * alt text, aria-labels) since it's the concept's real/official name, not a card label.
 */
export const CONCEPT_SHORT_NAMES: Record<ConceptId, string> = {
  'mens-cotton-shirt': 'RootWeave 01',
  'mens-cotton-linen-shirt': 'Cotton-Linen Shirt',
  'mens-linen-shirt': 'Pure Linen Shirt',
  'mens-relaxed-pant': 'Relaxed Cotton Pant',
  'womens-coord-set': 'Cotton Co-ord Set',
};

type FabricNotesLite = { composition: { fibre: string; percent: number }[]; weave: string; weight: string };

const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());

function compositionLine(fabricNotes: FabricNotesLite): string {
  return fabricNotes.composition.map((p) => `${p.percent}% ${titleCase(p.fibre)}`).join(' / ');
}

/** Title-cased weave name for display, e.g. "Fine diamond micro-dobby" -> "Fine Diamond Micro-Dobby". */
export function conceptWeaveLabel(weave: string): string {
  return titleCase(weave);
}

/**
 * One short line for a design card, e.g. "100% Cotton · Fine Diamond Micro-Dobby" or
 * "60% Cotton / 40% Linen · Plain Weave" — matches the reference image's card subtitle.
 */
export function conceptFabricLine(fabricNotes: FabricNotesLite): string {
  return `${compositionLine(fabricNotes)} · ${titleCase(fabricNotes.weave)}`;
}

/**
 * A short "<composition> · <GSM> GSM target" line for the FEATURED card's overlay (reference:
 * "100% Cotton · 115-130 GSM target"). Extracts the numeric range from `fabricNotes.weight`'s
 * full sentence when present (today, only `mens-cotton-shirt` has one); otherwise falls back to
 * a plain, honest phrase rather than fabricating a number.
 */
export function conceptSpecLine(fabricNotes: FabricNotesLite): string {
  const m = fabricNotes.weight.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*GSM/i);
  const weightPart = m ? `${m[1]}-${m[2]} GSM target` : 'Target weight to be confirmed';
  return `${compositionLine(fabricNotes)} · ${weightPart}`;
}
