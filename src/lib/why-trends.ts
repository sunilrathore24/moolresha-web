/**
 * Cards for the "why it matters" and "trends" sections (Requirements 11.1, 11.2).
 * Pure data, no Astro imports. Every Fact is rendered from the Fact_Registry through
 * `FactText`, so the card text here is only a heading.
 */
export interface FactCardData {
  heading: string;
  /** File name (without .yaml) in src/content/facts/. */
  factId: string;
}

/** Softness, easy care and how long clothes last (Requirement 11.1). */
export const WHY_ITEMS: readonly FactCardData[] = [
  { heading: 'Softness and easy care', factId: 'why-softness-easy-care' },
  { heading: 'How long clothes last', factId: 'why-durability' },
  { heading: 'What shoppers say they prefer', factId: 'why-natural-fibre-preference' },
];

/** Between three and five cards (Requirement 11.2). */
export const TREND_CARDS: readonly FactCardData[] = [
  { heading: 'Order size and spend', factId: 'trend-split-market' },
  { heading: 'Relaxed menswear', factId: 'trend-relaxed-menswear' },
  { heading: 'Trusted recommendations', factId: 'trend-intentional-buying' },
  { heading: 'Hybrid work and dress codes', factId: 'trend-hybrid-work-dress-codes' },
];

export const TREND_CARD_MIN = 3;
export const TREND_CARD_MAX = 5;

export function factIdsOf(cards: readonly FactCardData[]): string[] {
  return cards.map((c) => c.factId);
}
