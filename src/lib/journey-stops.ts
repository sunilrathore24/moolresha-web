/**
 * Cotton journey stops (Requirement 4.1). Pure data, no Astro imports.
 * Order is fixed. Each stop lists the Fact_Registry ids shown for it (Requirement 4.2);
 * the ids are the file names in src/content/facts/.
 */
export const JOURNEY_STOP_IDS = [
  'field',
  'ginning',
  'spinning',
  'weaving',
  'processing',
  'stitching',
  'warehousing-distribution',
  'retail',
] as const;

export type JourneyStopId = (typeof JOURNEY_STOP_IDS)[number];

/** Photo keys for the stops that have a photo in src/assets/journey/. */
export const JOURNEY_IMAGE_KEYS = [
  'field',
  'ginning',
  'spinning',
  'weaving',
  'processing',
  'stitching',
  'warehousing',
  'retail',
] as const;

export type JourneyImageKey = (typeof JOURNEY_IMAGE_KEYS)[number];

export interface JourneyStopImage {
  key: JourneyImageKey;
  /** Describes the photo. No brand names, no health words. */
  alt: string;
}

export interface JourneyStopData {
  id: JourneyStopId;
  label: string;
  factIds: readonly string[];
  /** Absent when the stop has no photo yet; the card then shows an "Image coming soon" woven placeholder. */
  image?: JourneyStopImage;
}

export const JOURNEY_STOPS: readonly JourneyStopData[] = [
  {
    id: 'field',
    label: 'Cotton field',
    factIds: ['journey-field'],
    image: { key: 'field', alt: 'Cotton plants with open white bolls in a field' },
  },
  {
    id: 'ginning',
    label: 'Ginning',
    factIds: ['journey-ginning'],
    image: { key: 'ginning', alt: 'Heaps of raw cotton with dry husks inside a ginning hall' },
  },
  {
    id: 'spinning',
    label: 'Spinning',
    factIds: ['journey-spinning'],
    image: { key: 'spinning', alt: 'Rows of cream cotton yarn cones on a spinning frame' },
  },
  {
    id: 'weaving',
    label: 'Weaving',
    factIds: ['journey-weaving'],
    image: { key: 'weaving', alt: 'A loom weaving plain beige cotton cloth' },
  },
  {
    id: 'processing',
    label: 'Processing (dyeing and finishing)',
    factIds: ['journey-processing'],
    image: { key: 'processing', alt: 'Cotton fabric running over rollers in a finishing mill' },
  },
  {
    id: 'stitching',
    label: 'Stitching',
    factIds: ['journey-stitching'],
    image: { key: 'stitching', alt: 'A tailor sewing a cream cotton shirt at a machine in a workshop' },
  },
  {
    id: 'warehousing-distribution',
    label: 'Warehousing and distribution',
    factIds: ['journey-warehousing-distribution'],
    image: { key: 'warehousing', alt: 'Folded fabric rolls and plain cartons stacked on pallets in a warehouse' },
  },
  {
    id: 'retail',
    label: 'Retail',
    factIds: ['journey-retail'],
    image: { key: 'retail', alt: 'Folded cream and beige shirts stacked on a wooden retail shelf' },
  },
];

/** Every fact id used by the journey section, for `LastUpdated`. */
export function journeyFactIds(stops: readonly JourneyStopData[] = JOURNEY_STOPS): string[] {
  return stops.flatMap((s) => [...s.factIds]);
}

/**
 * The Aim_Statement is stored as "Our aim: <sentence>" and rendered as a bold
 * "Our aim" label followed by the sentence, so the label is not shown twice.
 */
export function aimBody(label: string, statement: string): string {
  const prefix = `${label}:`;
  return statement.startsWith(prefix) ? statement.slice(prefix.length).trim() : statement.trim();
}
