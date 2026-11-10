/**
 * The Content_Check rule list. `scripts/content-check.ts` runs every rule in `RULES`.
 *
 * To add a rule: create `src/lib/content-rules/<name>.ts` that exports a `Rule`
 * (or several), import it below and add it to `RULES`. One import and one array
 * entry per rule keeps edits small. The runner itself never changes.
 */
import { cc05, cc06 } from './brand-rules';
import { cc01, cc02, cc09 } from './fact-rules';
import { cc07, cc08 } from './price-rules';
import { cc17, cc18, cc19, cc20 } from './story-quality-rules';
import { cc13, cc14, cc15, cc16 } from './structure-rules';
import type { Rule } from './types';
import { cc03, cc04, cc10, cc11, cc12 } from './word-content-rules';

export type { CheckContext, DistFile, RenderedPage, Rule, Violation } from './types';

export const RULES: Rule[] = [
  cc01,
  cc02,
  cc03,
  cc04,
  cc05,
  cc06,
  cc07,
  cc08,
  cc09,
  cc10,
  cc11,
  cc12,
  cc13,
  cc14,
  cc15,
  cc16,
  cc17,
  cc18,
  cc19,
  cc20,
];
