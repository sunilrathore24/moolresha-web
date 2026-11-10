import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  JS_BUDGET_BYTES,
  collectFirstPartyJs,
  computeJsBudget,
  formatBudgetReport,
  gzipSize,
} from '../../scripts/js-budget';

/** Deterministic, hard-to-compress text so the gzip size is close to the byte length. */
function noisy(bytes: number, seed = 1): Uint8Array {
  let x = seed;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out[i] = x >>> 24; // high bits of an LCG: near-incompressible
  }
  return out;
}

describe('computeJsBudget', () => {
  it('reports per-asset gzip sizes, a total, and passes under the limit', () => {
    const result = computeJsBudget([
      { path: '_astro/a.js', content: 'console.log(1);'.repeat(50) },
      { path: '_astro/b.js', content: 'export const b = 2;' },
    ]);
    expect(result.assets).toHaveLength(2);
    const a = result.assets.find((x) => x.path === '_astro/a.js');
    expect(a?.gzipBytes).toBe(gzipSync('console.log(1);'.repeat(50), { level: 9 }).length);
    expect(result.totalGzipBytes).toBe(result.assets.reduce((s, x) => s + x.gzipBytes, 0));
    expect(result.limitBytes).toBe(40 * 1024);
    expect(result.ok).toBe(true);
  });

  it('fails when the gzip total is above 40 KB', () => {
    const result = computeJsBudget([{ path: '_astro/big.js', content: noisy(60 * 1024) }]);
    expect(result.totalGzipBytes).toBeGreaterThan(JS_BUDGET_BYTES);
    expect(result.ok).toBe(false);
  });

  it('measures gzip size, not raw size', () => {
    const content = 'a'.repeat(200 * 1024); // 200 KB raw, tiny when compressed
    expect(gzipSize(content)).toBeLessThan(1024);
    expect(computeJsBudget([{ path: 'x.js', content }]).ok).toBe(true);
  });

  it('sums across files and fails when the sum crosses the limit', () => {
    const files = [1, 2, 3].map((seed) => ({ path: `_astro/c${seed}.js`, content: noisy(15 * 1024, seed) }));
    const each = computeJsBudget([files[0] as (typeof files)[number]]);
    expect(each.ok).toBe(true);
    expect(computeJsBudget(files).ok).toBe(false);
  });

  it('applies the limit inclusively and accepts a custom limit', () => {
    const files = [{ path: 'x.js', content: noisy(2000) }];
    const size = computeJsBudget(files).totalGzipBytes;
    expect(computeJsBudget(files, size).ok).toBe(true);
    expect(computeJsBudget(files, size - 1).ok).toBe(false);
  });

  it('flags the Angle_Viewer chunk and sorts the largest asset first', () => {
    const result = computeJsBudget([
      { path: '_astro/feedback-island.Abc123.js', content: noisy(500, 2) },
      { path: '_astro/angle-viewer-island.Xyz789.js', content: noisy(3000, 3) },
    ]);
    expect(result.assets[0]?.path).toBe('_astro/angle-viewer-island.Xyz789.js');
    expect(result.angleViewer.map((a) => a.path)).toEqual(['_astro/angle-viewer-island.Xyz789.js']);
    expect(formatBudgetReport(result)).toContain('<- Angle_Viewer');
  });

  it('counts a path listed twice once', () => {
    const file = { path: 'x.js', content: noisy(1000) };
    const once = computeJsBudget([file]);
    expect(computeJsBudget([file, file]).totalGzipBytes).toBe(once.totalGzipBytes);
  });

  it('handles no files', () => {
    const result = computeJsBudget([]);
    expect(result).toMatchObject({ totalGzipBytes: 0, ok: true, assets: [] });
    expect(formatBudgetReport(result)).toContain('(none)');
  });
});

describe('collectFirstPartyJs', () => {
  const assets: Record<string, string> = {
    '_astro/main.js': 'import"./shared.js";import{x}from"./angle-viewer-island.js";export default 1;',
    '_astro/shared.js': 'export const s=1;',
    '_astro/angle-viewer-island.js': 'export const x=2;',
    '_astro/lazy.js': 'export const lazy=3;',
    '_astro/preloaded.js': 'export const p=4;',
  };
  const read = (path: string) => assets[path];

  it('follows module scripts, static imports and modulepreload; ignores dynamic imports and non-JS scripts', () => {
    const html = `<html><head>
      <link rel="modulepreload" href="/_astro/preloaded.js">
      <link rel="stylesheet" href="/_astro/site.css">
      <script type="application/ld+json">{"a":1}</script>
    </head><body>
      <script type="module" src="/_astro/main.js"></script>
    </body></html>`;
    const collected = collectFirstPartyJs(html, (p) => (p === '_astro/main.js' ? assets[p] + ';import("./lazy.js")' : read(p)));
    expect(collected.files.map((f) => f.path).sort()).toEqual([
      '_astro/angle-viewer-island.js',
      '_astro/main.js',
      '_astro/preloaded.js',
      '_astro/shared.js',
    ]);
    expect(collected.missing).toEqual([]);
  });

  it('lists third-party scripts without counting them', () => {
    const html = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>';
    const collected = collectFirstPartyJs(html, read);
    expect(collected.files).toEqual([]);
    expect(collected.external).toEqual(['https://challenges.cloudflare.com/turnstile/v0/api.js']);
  });

  it('counts inline scripts and reports referenced files that are missing', () => {
    const html = '<script>window.a=1</script><script type="module" src="/_astro/gone.js"></script>';
    const collected = collectFirstPartyJs(html, read);
    expect(collected.files).toHaveLength(1);
    expect(collected.files[0]?.path).toContain('#inline-script-1');
    expect(collected.missing).toEqual(['_astro/gone.js']);
    expect(formatBudgetReport(computeJsBudget(collected.files), collected)).toContain('ERROR missing file');
  });

  it('resolves relative src against the page path', () => {
    const html = '<script type="module" src="_astro/shared.js?v=1"></script>';
    expect(collectFirstPartyJs(html, read).files.map((f) => f.path)).toEqual(['_astro/shared.js']);
  });
});

describe('formatBudgetReport', () => {
  it('prints sizes, the total and an OK line when within budget', () => {
    const report = formatBudgetReport(computeJsBudget([{ path: '_astro/a.js', content: 'x' }]));
    expect(report).toContain('_astro/a.js');
    expect(report).toContain('total (limit 40.00 KB)');
    expect(report).toContain('OK: within the JS budget.');
  });

  it('prints a FAIL line when over budget', () => {
    const report = formatBudgetReport(computeJsBudget([{ path: 'big.js', content: noisy(60 * 1024) }]));
    expect(report).toContain('FAIL: first-party JS is');
  });
});
