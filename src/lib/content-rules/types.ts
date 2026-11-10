/**
 * Shared types for the Content_Check rules (task 9.1).
 *
 * Every rule is a pure function from a `CheckContext` to a list of violations.
 * Rules are registered in `src/lib/content-rules/index.ts`; the runner in
 * `scripts/content-check.ts` applies them all and prints every violation.
 */
import type { ConceptData } from '../concept-schema';
import type { FactEntry } from '../fact-schema';
import type { MarketScanData } from '../market-scan-schema';
import type { PriceLayersData, StoryData } from '../price-layers-schema';
import type { WordRulesData } from '../word-rules-schema';
import type { RenderedPage } from './html';

export type { ChannelText, FactSpan, RenderedPage, TextChannel } from './html';

/** One broken rule. Printed as `[<rule>] <target>: <detail>`. */
export interface Violation {
  /** Rule id, for example `CC-05`. */
  rule: string;
  /** What failed: a fact id, a Concept id or a page path such as `/index.html`. */
  target: string;
  /** What is wrong, in plain words. Names the matched text or row where there is one. */
  detail: string;
}

/** A text file from `dist` (HTML, JS, JSON, CSS, XML, ...). Used by CC-06. */
export interface DistFile {
  /** Dist-relative path with a leading slash, for example `/_astro/app.js`. */
  path: string;
  text: string;
}

export interface CheckContext {
  /** Valid Fact_Registry entries (an invalid file is reported by the runner as a CC-01 violation). */
  facts: FactEntry[];
  concepts: ConceptData[];
  priceLayers: PriceLayersData;
  story: StoryData;
  marketScans: MarketScanData[];
  /**
   * The brands from `brand-blocklist.yaml` only. CC-05 and CC-06 add every
   * `marketScans[].evidence[].brand` and remove "MoolResha" themselves.
   */
  blocklist: string[];
  wordRules: WordRulesData;
  /** Every `dist/**\/*.html` page, sorted by path. */
  pages: RenderedPage[];
  /** Every text file in `dist` (HTML included), sorted by path. */
  distFiles: DistFile[];
}

export type Rule = (ctx: CheckContext) => Violation[];
