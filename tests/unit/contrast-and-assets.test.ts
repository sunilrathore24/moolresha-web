/**
 * Task 18.4 (optional), unit part: WCAG contrast of the design-token pairs, and font and image
 * checks on the built site.
 *
 * Contrast: colours are read from src/styles/tokens.css (the real file, `var()` references resolved),
 * and the WCAG 2.x relative-luminance ratio is computed here. Text pairs need >= 4.5:1, UI component
 * boundaries and focus indicators need >= 3:1 (Requirement 21.7).
 *
 * Assets: only when dist/ exists (run `npm run build:local` first). Checks that
 *   - no CSS or HTML points at an external font host,
 *   - every @font-face is self-hosted (relative or root-relative src) and has font-display: swap,
 *   - every <img> has width and height, and no <img> src is a remote URL.
 * Note: the current build has NO @font-face rule and NO <img> tag (fonts are system fallbacks and the
 * Concept views are placeholders), so those two checks pass because there is nothing to check. The
 * test reports how many it examined so that is visible, and it starts checking as soon as fonts or
 * images are added.
 *
 * Requirements 20.3, 20.5, 21.7.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

const TOKENS = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');

/** The first `:root { ... }` block, comments removed. */
function rootBlock(css: string): string {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /:root\s*\{([\s\S]*?)\n\}/.exec(noComments);
  if (!m) throw new Error('tokens.css has no :root block');
  return m[1]!;
}

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const DECLS = declarations(rootBlock(TOKENS));

/** Follows `var(--x)` chains to a colour literal. */
function resolve(name: string, seen = new Set<string>()): string {
  const value = DECLS.get(name);
  if (value === undefined) throw new Error(`token ${name} is not defined in tokens.css`);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  if (!ref) return value;
  if (seen.has(name)) throw new Error(`token cycle at ${name}`);
  seen.add(name);
  return resolve(ref[1]!, seen);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const c = (token: string): string => resolve(token);

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

describe('contrast helpers', () => {
  it('computes the known extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
    // WCAG's own example: #767676 on white is just over 4.5:1.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('resolves var() chains to the literal colour', () => {
    expect(c('--color-bg').toLowerCase()).toBe('#faf6ef');
    expect(c('--color-accent-text').toLowerCase()).toBe('#8f5233');
    expect(c('--color-focus').toLowerCase()).toBe(c('--c-terracotta').toLowerCase());
  });
});

/** [foreground token, background token, minimum ratio, why] */
const TEXT_PAIRS: Array<[string, string, number, string]> = [
  ['--color-text', '--color-bg', 4.5, 'body text on page background'],
  ['--color-text', '--color-surface', 4.5, 'body text on cards and panels'],
  ['--color-text', '--c-warm-oat', 4.5, 'body text on hovered / selected chips'],
  ['--color-text', '--c-flax-beige', 4.5, 'body text on the darkest neutral'],
  ['--color-text-muted', '--color-bg', 4.5, 'secondary text on page background'],
  ['--color-text-muted', '--color-surface', 4.5, 'secondary text on panels'],
  ['--color-text-muted', '--c-warm-oat', 4.5, 'secondary text on oat (placeholder frames)'],
  ['--color-accent-text', '--color-bg', 4.5, 'accent text (wordmark, links) on page background'],
  ['--color-accent-text', '--color-surface', 4.5, 'accent text on panels'],
  ['--color-accent-text', '--c-warm-oat', 4.5, 'accent text on oat'],
  ['--c-off-white', '--color-accent-text', 4.5, 'button label (off-white) on accent-text fill'],
  ['--c-off-white', '--c-raw-umber', 4.5, 'button label on its hover fill (raw umber)'],
  ['--color-bg', '--color-text', 4.5, 'inverted pressed state: page colour on ink'],
  ['--c-raw-umber', '--color-bg', 4.5, 'notice links (raw umber) on page background'],
  ['--c-raw-umber', '--color-surface', 4.5, 'notice links on panels'],
];

describe('token pairs: text contrast >= 4.5:1 (Requirement 21.7)', () => {
  it.each(TEXT_PAIRS)('%s on %s is at least %s:1 (%s)', (fg, bg, min) => {
    const ratio = contrast(c(fg), c(bg));
    expect(ratio, `${fg} ${c(fg)} on ${bg} ${c(bg)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });

  it('the spec-named pairs are in the table: accent-text on bg and surface, off-white on accent-text', () => {
    const has = (a: string, b: string) => TEXT_PAIRS.some(([x, y]) => x === a && y === b);
    expect(has('--color-accent-text', '--color-bg')).toBe(true);
    expect(has('--color-accent-text', '--color-surface')).toBe(true);
    expect(has('--c-off-white', '--color-accent-text')).toBe(true);
  });
});

/** UI component boundaries and the focus ring need 3:1 against what they sit on. */
const UI_PAIRS: Array<[string, string, string]> = [
  ['--c-raw-umber', '--color-bg', 'control border on page background'],
  ['--c-raw-umber', '--color-surface', 'control border on panels'],
  ['--color-focus', '--color-bg', 'focus ring on page background'],
  ['--color-focus', '--color-surface', 'focus ring on panels'],
];

describe('token pairs: UI boundaries and focus >= 3:1 (Requirement 21.7)', () => {
  it.each(UI_PAIRS)('%s on %s is at least 3:1 (%s)', (fg, bg) => {
    const ratio = contrast(c(fg), c(bg));
    expect(ratio, `${fg} ${c(fg)} on ${bg} ${c(bg)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});

describe('decoration-only tokens are not used as text pairs', () => {
  it('--color-accent (decoration) is not required to pass 4.5:1, and --color-accent-text exists for text', () => {
    expect(DECLS.has('--color-accent-text')).toBe(true);
    // The comment in tokens.css says --color-accent is for decoration and borders only. Record the
    // fact: it does not meet text contrast on the page background, which is why text must not use it.
    expect(contrast(c('--color-accent'), c('--color-bg'))).toBeLessThan(4.5);
  });
});

// ---------------------------------------------------------------------------
// Built-site checks (dist/)
// ---------------------------------------------------------------------------

const DIST = join(process.cwd(), 'dist');
const hasDist = existsSync(DIST) && existsSync(join(DIST, 'index.html'));

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, ext));
    else if (ext.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

describe.skipIf(!hasDist)('built site (dist/): fonts and images', () => {
  const htmlFiles = hasDist ? walk(DIST, ['.html']) : [];
  const cssFiles = hasDist ? walk(DIST, ['.css']) : [];
  const rel = (p: string) => p.slice(DIST.length + 1);

  it('finds the built pages and stylesheets', () => {
    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it('references no external font host from any HTML or CSS file', () => {
    const hosts = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.adobe\.com|cdn\.fontawesome|kit\.fontawesome|use\.fontawesome/i;
    for (const f of [...htmlFiles, ...cssFiles]) {
      expect(hosts.test(readFileSync(f, 'utf8')), `${rel(f)} references an external font host`).toBe(false);
    }
  });

  it('has no @import of a remote stylesheet and no remote <link rel="stylesheet">', () => {
    for (const f of cssFiles) {
      expect(/@import\s+(url\()?["']?https?:/i.test(readFileSync(f, 'utf8')), `${rel(f)} imports remote CSS`).toBe(false);
    }
    for (const f of htmlFiles) {
      const root = parse(readFileSync(f, 'utf8'));
      for (const l of root.querySelectorAll('link[rel="stylesheet"]')) {
        expect(l.getAttribute('href') ?? '', `${rel(f)} links remote CSS`).not.toMatch(/^(https?:)?\/\//i);
      }
    }
  });

  it('every @font-face is self-hosted and has font-display: swap', () => {
    const faces: Array<{ file: string; body: string }> = [];
    for (const f of cssFiles) {
      const css = readFileSync(f, 'utf8');
      for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) faces.push({ file: rel(f), body: m[1]! });
    }
    // Inline <style> blocks too.
    for (const f of htmlFiles) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/@font-face\s*\{([^}]*)\}/gi)) faces.push({ file: rel(f), body: m[1]! });
    }
    for (const face of faces) {
      expect(/font-display\s*:\s*swap/i.test(face.body), `${face.file}: @font-face without font-display: swap`).toBe(true);
      const src = /src\s*:([^;]+)/i.exec(face.body)?.[1] ?? '';
      expect(/https?:\/\//i.test(src), `${face.file}: @font-face src is remote`).toBe(false);
    }
    // Make the "nothing to check" case visible rather than silent.
    console.info(`[contrast-and-assets] @font-face rules examined: ${faces.length}`);
  });

  it('every <img> has width and height and a local source', () => {
    let images = 0;
    for (const f of htmlFiles) {
      const root = parse(readFileSync(f, 'utf8'));
      // <template> content is parsed as text by node-html-parser; look inside it too.
      const roots = [root, ...root.querySelectorAll('template').map((t) => parse(t.innerHTML))];
      for (const r of roots) {
        for (const img of r.querySelectorAll('img')) {
          images += 1;
          const w = img.getAttribute('width');
          const h = img.getAttribute('height');
          const label = `${rel(f)}: <img src="${img.getAttribute('src') ?? ''}">`;
          expect(w && /^\d+$/.test(w) && Number(w) > 0, `${label} lacks a numeric width`).toBeTruthy();
          expect(h && /^\d+$/.test(h) && Number(h) > 0, `${label} lacks a numeric height`).toBeTruthy();
          expect(img.getAttribute('src') ?? '', `${label} has a remote source`).not.toMatch(/^(https?:)?\/\//i);
          expect(img.getAttribute('alt'), `${label} has no alt attribute`).not.toBeNull();
        }
      }
    }
    console.info(`[contrast-and-assets] <img> elements examined: ${images}`);
  });

  it('every <img> with a loading attribute uses a valid value, and below-the-fold images are lazy', () => {
    for (const f of htmlFiles) {
      const root = parse(readFileSync(f, 'utf8'));
      for (const img of root.querySelectorAll('img')) {
        const loading = img.getAttribute('loading');
        if (loading !== null) expect(['lazy', 'eager']).toContain(loading);
        // Anything inside the Concepts section is below the fold on mobile and must be lazy.
        if (img.closest('[data-section="concepts"]')) expect(loading, `${rel(f)}: Concept image not lazy`).toBe('lazy');
      }
    }
  });

  it('served raster images in dist/_astro are AVIF or WebP (no PNG or JPEG besides the favicon/public files)', () => {
    const raster = walk(join(DIST, '_astro'), ['.png', '.jpg', '.jpeg', '.gif']);
    expect(raster.map(rel)).toEqual([]);
  });
});
