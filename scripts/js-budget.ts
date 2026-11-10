/**
 * First-load JavaScript budget (Requirements 8A.15 and 20.2).
 *
 * Sums the gzip size of the first-party JS that `dist/index.html` loads and
 * fails (exit 1) above 40 KB. The remaining 10 KB of the 50 KB total is left
 * for the third-party Turnstile script. Per-asset sizes are printed, and the
 * Angle_Viewer chunk is called out so it can be seen to fit the budget.
 *
 * The logic is in pure, exported functions that take in-memory inputs. The
 * CLI at the bottom only runs when this file is the entry point. No network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';

/** 40 KB of gzip, counted as 40 * 1024 bytes. */
export const JS_BUDGET_BYTES = 40 * 1024;

/** Matches the Angle_Viewer chunk by file name (for example `angle-viewer-island.AbC123.js`). */
export const ANGLE_VIEWER_PATTERN = /angle-viewer/i;

export interface BudgetFile {
  /** Path relative to the dist root, with forward slashes (for example `_astro/a.js`). */
  path: string;
  content: string | Uint8Array;
}

export interface AssetSize {
  path: string;
  gzipBytes: number;
  angleViewer: boolean;
}

export interface BudgetResult {
  /** Largest first, then by path. */
  assets: AssetSize[];
  totalGzipBytes: number;
  limitBytes: number;
  /** True when the total is at or below the limit. */
  ok: boolean;
  /** The assets recognised as the Angle_Viewer chunk (empty if none is named that way). */
  angleViewer: AssetSize[];
}

export function gzipSize(content: string | Uint8Array): number {
  return gzipSync(content, { level: 9 }).length;
}

/** Computes per-asset and total gzip sizes. A path listed twice is counted once. */
export function computeJsBudget(
  files: readonly BudgetFile[],
  limitBytes: number = JS_BUDGET_BYTES,
  angleViewerPattern: RegExp = ANGLE_VIEWER_PATTERN,
): BudgetResult {
  const byPath = new Map<string, BudgetFile>();
  for (const file of files) if (!byPath.has(file.path)) byPath.set(file.path, file);

  const assets: AssetSize[] = [...byPath.values()].map((file) => ({
    path: file.path,
    gzipBytes: gzipSize(file.content),
    angleViewer: angleViewerPattern.test(posix.basename(file.path)),
  }));
  assets.sort((a, b) => b.gzipBytes - a.gzipBytes || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const totalGzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  return {
    assets,
    totalGzipBytes,
    limitBytes,
    ok: totalGzipBytes <= limitBytes,
    angleViewer: assets.filter((asset) => asset.angleViewer),
  };
}

export interface CollectedJs {
  files: BudgetFile[];
  /** First-party references that could not be read. These fail the budget check. */
  missing: string[];
  /** Third-party (absolute URL) scripts. They are not counted here. */
  external: string[];
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
// Static `import ... from "./x.js"`, `import "./x.js"` and `export ... from "./x.js"`.
// Dynamic `import("./x.js")` has a parenthesis and does not match: it is not first-load.
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g;

function toText(content: string | Uint8Array): string {
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}

function resolveRef(ref: string, fromFile: string): string {
  const clean = ref.split(/[?#]/)[0] ?? '';
  return clean.startsWith('/')
    ? posix.normalize(clean.slice(1))
    : posix.join(posix.dirname(fromFile), clean);
}

/**
 * Finds the first-party JS that a page loads: `<script src>`, inline scripts,
 * `modulepreload` and script `preload` links, plus the static imports of each
 * of those files. `readAsset` returns a file's content by dist-relative path.
 */
export function collectFirstPartyJs(
  html: string,
  readAsset: (path: string) => string | Uint8Array | undefined,
  pagePath = 'index.html',
): CollectedJs {
  const root = parse(html);
  const files: BudgetFile[] = [];
  const missing: string[] = [];
  const external: string[] = [];
  const queue: string[] = [];

  const addRef = (ref: string | undefined) => {
    if (!ref) return;
    if (EXTERNAL.test(ref)) {
      if (!external.includes(ref)) external.push(ref);
      return;
    }
    queue.push(resolveRef(ref, pagePath));
  };

  let inline = 0;
  for (const script of root.querySelectorAll('script')) {
    const type = (script.getAttribute('type') ?? '').trim().toLowerCase();
    if (!JS_TYPES.has(type)) continue;
    const src = script.getAttribute('src');
    if (src) {
      addRef(src);
    } else if (script.text.trim() !== '') {
      inline += 1;
      files.push({ path: `${pagePath}#inline-script-${inline}`, content: script.text });
    }
  }
  for (const link of root.querySelectorAll('link')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const isScriptPreload = rel.includes('preload') && link.getAttribute('as') === 'script';
    if (rel.includes('modulepreload') || isScriptPreload) addRef(link.getAttribute('href'));
  }

  const seen = new Set<string>();
  while (queue.length > 0) {
    const path = queue.shift() as string;
    if (seen.has(path)) continue;
    seen.add(path);
    const content = readAsset(path);
    if (content === undefined) {
      missing.push(path);
      continue;
    }
    files.push({ path, content });
    for (const match of toText(content).matchAll(STATIC_IMPORT)) {
      const spec = match[1] as string;
      if (EXTERNAL.test(spec)) continue;
      if (spec.startsWith('.') || spec.startsWith('/')) queue.push(resolveRef(spec, path));
    }
  }
  return { files, missing, external };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/** Builds the text report printed by the CLI. */
export function formatBudgetReport(result: BudgetResult, collected?: CollectedJs): string {
  const lines: string[] = ['First-party JS referenced by index.html (gzip):'];
  if (result.assets.length === 0) lines.push('  (none)');
  for (const asset of result.assets) {
    const tag = asset.angleViewer ? '  <- Angle_Viewer' : '';
    lines.push(`  ${kb(asset.gzipBytes).padStart(10)}  ${asset.path}${tag}`);
  }
  lines.push(`  ${kb(result.totalGzipBytes).padStart(10)}  total (limit ${kb(result.limitBytes)})`);
  if (result.angleViewer.length === 0) {
    lines.push(
      'Note: no asset is named like "angle-viewer*". If the viewer is bundled into another chunk, it is already counted in the total.',
    );
  }
  for (const url of collected?.external ?? []) lines.push(`Not counted (third-party): ${url}`);
  for (const path of collected?.missing ?? []) lines.push(`ERROR missing file referenced by index.html: ${path}`);
  if (!result.ok) {
    lines.push(
      `FAIL: first-party JS is ${kb(result.totalGzipBytes)}, ${kb(result.totalGzipBytes - result.limitBytes)} over the ${kb(result.limitBytes)} budget.`,
    );
  } else if ((collected?.missing.length ?? 0) === 0) {
    lines.push('OK: within the JS budget.');
  }
  return lines.join('\n');
}

/** Runs the check against a dist folder. Returns the exit code. */
export function main(distDir: string = resolve(process.cwd(), 'dist')): number {
  const indexPath = resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`js-budget: ${indexPath} not found. Run the Astro build first.`);
    return 1;
  }
  const readAsset = (path: string): Buffer | undefined => {
    const full = resolve(distDir, path);
    return existsSync(full) ? readFileSync(full) : undefined;
  };
  const collected = collectFirstPartyJs(readFileSync(indexPath, 'utf8'), readAsset);
  const result = computeJsBudget(collected.files);
  console.log(formatBudgetReport(result, collected));
  return result.ok && collected.missing.length === 0 ? 0 : 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const dist = process.argv[2] ? resolve(process.argv[2]) : undefined;
  process.exit(dist ? main(dist) : main());
}
