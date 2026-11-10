/**
 * Content_Check runner (task 9.1, Requirements 3.5, 3.6).
 *
 * Loads the content collections with the same Zod schemas the site uses, reads
 * the built pages in `dist`, applies every rule registered in
 * `src/lib/content-rules/index.ts`, prints `[CC-xx] <target>: <detail>` for ALL
 * violations and exits 1 if there are any.
 *
 * Local file-only script. It makes no network calls. Run after `astro build`:
 *   npx tsx scripts/content-check.ts [distDir]
 *
 * The logic is in pure, exported functions (`runRules`, `formatViolation`,
 * `exitCodeFor`). The CLI at the bottom only runs when this file is the entry point.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { Concept, type ConceptData } from '../src/lib/concept-schema';
import { Fact, type FactEntry } from '../src/lib/fact-schema';
import { MarketScan, type MarketScanData } from '../src/lib/market-scan-schema';
import { PriceLayers, Story, type PriceLayersData, type StoryData } from '../src/lib/price-layers-schema';
import { loadBrandBlocklist, loadWordRules } from '../src/lib/word-rules-schema';
import { extractPage } from '../src/lib/content-rules/html';
import { RULES } from '../src/lib/content-rules/index';
import type { CheckContext, DistFile, Rule, Violation } from '../src/lib/content-rules/types';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Extensions of dist files that CC-06 scans as text. */
const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.json', '.css', '.xml', '.txt', '.svg', '.map',
  '.webmanifest', '.yaml', '.yml', '.csv',
]);

/* ---------- pure runner ---------- */

/**
 * Applies every rule to the context and returns all violations, in rule order.
 * A rule that throws is reported as a violation (rule id `INTERNAL`) so one bug
 * cannot hide the violations of the other rules, and the build still fails.
 */
export function runRules(ctx: CheckContext, rules: readonly Rule[]): Violation[] {
  const out: Violation[] = [];
  rules.forEach((rule, index) => {
    try {
      out.push(...rule(ctx));
    } catch (err) {
      const name = rule.name || `rule #${index + 1}`;
      out.push({
        rule: 'INTERNAL',
        target: name,
        detail: `rule threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
  return out;
}

/** `[CC-05] /index.html: brand "x" found in alt text` */
export function formatViolation(v: Violation): string {
  return `[${v.rule}] ${v.target}: ${v.detail}`;
}

/** 1 when there is at least one violation, otherwise 0. */
export function exitCodeFor(violations: readonly Violation[]): 0 | 1 {
  return violations.length > 0 ? 1 : 0;
}

/* ---------- loading ---------- */

/** Thrown when content cannot be loaded at all (for example a missing `dist`). */
export class ContentLoadError extends Error {
  constructor(public readonly violations: Violation[]) {
    super(violations.map(formatViolation).join('\n'));
    this.name = 'ContentLoadError';
  }
}

export interface LoadedContext {
  ctx: CheckContext;
  /** Collection entries that failed their schema. Reported alongside the rule violations. */
  loadViolations: Violation[];
}

function zodDetail(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

interface ParsedSchema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/** Loads one YAML file per entry. Invalid entries become violations and are left out. */
function loadCollection<T>(
  dir: string,
  schema: ParsedSchema<T>,
  ruleForInvalid: string,
  violations: Violation[],
): T[] {
  const items: T[] = [];
  for (const file of yamlFiles(dir)) {
    const target = basename(file, extname(file));
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      violations.push({ rule: ruleForInvalid, target, detail: `invalid YAML: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    const parsed = schema.safeParse(raw);
    if (parsed.success) items.push(parsed.data);
    else violations.push({ rule: ruleForInvalid, target, detail: zodDetail(parsed.error) });
  }
  return items;
}

/** Loads a collection that must hold exactly one valid file (`price-layers`, `story`). */
function loadSingle<T>(dir: string, file: string, schema: ParsedSchema<T>, label: string): T {
  const path = join(dir, file);
  const fail = (detail: string): never => {
    throw new ContentLoadError([{ rule: 'LOAD', target: label, detail }]);
  };
  if (!existsSync(path)) return fail(`${relative(ROOT, path)} not found`);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    return fail(`invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fail(zodDetail(parsed.error));
}

/** Reads every file under `distDir`; HTML files become pages, text files go to `distFiles`. */
export function loadDist(distDir: string): Pick<CheckContext, 'pages' | 'distFiles'> {
  if (!existsSync(distDir)) {
    throw new ContentLoadError([
      { rule: 'LOAD', target: distDir, detail: 'dist folder not found. Run the Astro build first.' },
    ]);
  }
  const pages: CheckContext['pages'] = [];
  const distFiles: DistFile[] = [];
  for (const full of walk(distDir)) {
    const ext = extname(full).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const path = `/${relative(distDir, full).split(sep).join('/')}`;
    const text = readFileSync(full, 'utf8');
    distFiles.push({ path, text });
    if (ext === '.html' || ext === '.htm') pages.push(extractPage(path, text));
  }
  return { pages, distFiles };
}

/**
 * Builds the `CheckContext` from `src/content/**` (under `root`) and `distDir`.
 * Entries that fail their schema do not stop the run: they come back as
 * `loadViolations` (rule `CC-01` for facts, `LOAD` for the rest).
 */
export function loadContext(root: string = ROOT, distDir: string = join(root, 'dist')): LoadedContext {
  const content = join(root, 'src', 'content');
  const configDir = join(content, 'config');
  const loadViolations: Violation[] = [];

  const facts = loadCollection<FactEntry>(join(content, 'facts'), Fact as ParsedSchema<FactEntry>, 'CC-01', loadViolations);
  const concepts = loadCollection<ConceptData>(join(content, 'concepts'), Concept as ParsedSchema<ConceptData>, 'LOAD', loadViolations);
  const marketScans = loadCollection<MarketScanData>(join(content, 'market-scans'), MarketScan as ParsedSchema<MarketScanData>, 'LOAD', loadViolations);
  const priceLayers = loadSingle<PriceLayersData>(join(content, 'price-layers'), 'price-layers.yaml', PriceLayers as ParsedSchema<PriceLayersData>, 'price-layers');
  const story = loadSingle<StoryData>(join(content, 'story'), 'story.yaml', Story as ParsedSchema<StoryData>, 'story');

  let wordRules: CheckContext['wordRules'];
  let brands: string[];
  try {
    wordRules = loadWordRules(configDir);
    brands = loadBrandBlocklist(configDir).brands;
  } catch (err) {
    throw new ContentLoadError([
      { rule: 'LOAD', target: 'src/content/config', detail: err instanceof Error ? err.message : String(err) },
    ]);
  }

  const dist = loadDist(distDir);
  return {
    ctx: { facts, concepts, priceLayers, story, marketScans, blocklist: brands, wordRules, ...dist },
    loadViolations,
  };
}

/* ---------- CLI ---------- */

export interface MainOptions {
  root?: string;
  distDir?: string;
  rules?: readonly Rule[];
  out?: (line: string) => void;
  err?: (line: string) => void;
}

/** Runs the whole check. Returns the exit code (0 clean, 1 on any violation or load failure). */
export function main(options: MainOptions = {}): number {
  const root = options.root ?? ROOT;
  const distDir = options.distDir ?? join(root, 'dist');
  const rules = options.rules ?? RULES;
  const out = options.out ?? ((line: string) => console.log(line));
  const err = options.err ?? ((line: string) => console.error(line));

  let loaded: LoadedContext;
  try {
    loaded = loadContext(root, distDir);
  } catch (e) {
    if (e instanceof ContentLoadError) {
      for (const v of e.violations) err(formatViolation(v));
      err(`content-check: FAIL, could not load content (${e.violations.length} problem(s)).`);
      return 1;
    }
    throw e;
  }

  const violations = [...loaded.loadViolations, ...runRules(loaded.ctx, rules)];
  for (const v of violations) err(formatViolation(v));
  if (violations.length > 0) {
    err(`content-check: FAIL, ${violations.length} violation(s) in ${loaded.ctx.pages.length} page(s).`);
  } else {
    out(`content-check: OK, ${rules.length} rule(s), ${loaded.ctx.pages.length} page(s), no violations.`);
  }
  return exitCodeFor(violations);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.exit(process.argv[2] ? main({ distDir: resolve(process.argv[2]) }) : main());
}
