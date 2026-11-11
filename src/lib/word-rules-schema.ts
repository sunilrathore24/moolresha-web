/**
 * Word-rules and brand-blocklist schemas (Requirements 7.11, 7.12, 8C.11, 11A.6).
 *
 * Pure module: Zod, `yaml` and Node file reading only, no Astro imports, so
 * Vitest and the Content_Check script can call the loaders directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/** Health terms Requirement 8C.11 requires in the list. */
export const REQUIRED_HEALTH_TERMS = [
  'skin-friendly',
  'hypoallergenic',
  'anti-allergy',
  'chemical-free',
  'non-toxic',
] as const;

/** Restricted phrases Requirement 11A.6 requires in the list. */
export const REQUIRED_RESTRICTED_PHRASES = [
  'made in Bangladesh',
  'instead of Bangladesh',
  'less GST',
] as const;

const Words = z.array(z.string().trim().min(1)).min(1);

export const WordRules = z.strictObject({
  /** Greenwashing words allowed only inside a substantiating fact (CC-03). */
  restricted: Words,
  /** Tone words and phrases that fail CC-10. */
  superlatives: Words,
  /** Numeric strings CC-09 does not flag outside a `.fact`. May be empty. */
  numericAllow: z.array(z.string().trim().min(1)),
  /** Restricted_Phrase_List (CC-17). */
  restrictedPhrases: Words,
  /** Health_Term_List (CC-20). */
  healthTerms: Words,
  /**
   * Fact ids CC-02 does not flag even when unverified (a dated, named, explicit founder
   * exception for launch — see word-rules.yaml). May be empty.
   */
  launchExceptions: z.array(z.string().trim().min(1)),
});
export type WordRulesData = z.output<typeof WordRules>;

export const BrandBlocklist = z.strictObject({
  /** Generic placeholders or real names the founder adds; merged with market-scan evidence brands. */
  brands: z.array(z.string().trim().min(1)),
});
export type BrandBlocklistData = z.output<typeof BrandBlocklist>;

const CONFIG_DIR = join(process.cwd(), 'src/content/config');

export function parseWordRules(raw: unknown): WordRulesData {
  return WordRules.parse(raw);
}

export function parseBrandBlocklist(raw: unknown): BrandBlocklistData {
  return BrandBlocklist.parse(raw);
}

/** Loads and validates `src/content/config/word-rules.yaml`. */
export function loadWordRules(dir: string = CONFIG_DIR): WordRulesData {
  return parseWordRules(parse(readFileSync(join(dir, 'word-rules.yaml'), 'utf8')));
}

/** Loads and validates `src/content/config/brand-blocklist.yaml`. */
export function loadBrandBlocklist(dir: string = CONFIG_DIR): BrandBlocklistData {
  return parseBrandBlocklist(parse(readFileSync(join(dir, 'brand-blocklist.yaml'), 'utf8')));
}
