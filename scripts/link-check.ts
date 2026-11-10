/**
 * Internal link check (Requirement 2.6).
 *
 * Every internal `href` in `dist/**\/*.html` must resolve to a file in `dist`
 * and, when it has a fragment, to an `id` or `<a name>` on the target page.
 * Broken links are listed with the page they appear on, and the CLI exits 1 if
 * there are any. External links (any other origin, `mailto:`, `tel:` and so on)
 * are ignored. Nothing is fetched.
 *
 * URL model: the site uses `trailingSlash: 'never'`, so `about/index.html` is
 * served at `/about` and relative links on it resolve against `/about`.
 *
 * The logic is in pure, exported functions that take in-memory inputs. The CLI
 * at the bottom only runs when this file is the entry point.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'node-html-parser';

export interface Page {
  /** Path relative to the dist root, with forward slashes (for example `about/index.html`). */
  path: string;
  html: string;
}

export type BrokenReason = 'missing-file' | 'missing-anchor' | 'invalid-url';

export interface BrokenLink {
  /** The page that contains the link. */
  source: string;
  href: string;
  reason: BrokenReason;
  /** The dist file the link resolved to, when the file exists (missing-anchor) or the path tried. */
  target: string;
}

const LOCAL_ORIGIN = 'http://dist.invalid';

/** The URL path a page is served at, for example `about/index.html` -> `/about`. */
export function pageUrlPath(pagePath: string): string {
  const normal = posix.normalize(pagePath.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (normal === 'index.html') return '/';
  if (normal.endsWith('/index.html')) return `/${normal.slice(0, -'/index.html'.length)}`;
  return `/${normal}`;
}

/** Ids and `<a name>` values on a page. */
export function collectAnchors(html: string): Set<string> {
  const anchors = new Set<string>();
  const root = parse(html);
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    if (id) anchors.add(id);
  }
  for (const el of root.querySelectorAll('a[name]')) {
    const name = el.getAttribute('name');
    if (name) anchors.add(name);
  }
  return anchors;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Maps a URL path to the dist file that serves it, or undefined. */
function resolveFile(urlPath: string, files: ReadonlySet<string>): string | undefined {
  const decoded = safeDecode(urlPath);
  const rel = posix.normalize(decoded).replace(/^\/+/, '');
  const base = rel === '' || rel === '.' ? '' : rel.replace(/\/+$/, '');
  const candidates = decoded.endsWith('/') || base === ''
    ? [posix.join(base, 'index.html')]
    : [base, `${base}.html`, posix.join(base, 'index.html')];
  return candidates.find((candidate) => files.has(candidate));
}

function hrefsOf(html: string): string[] {
  const root = parse(html);
  const hrefs: string[] = [];
  for (const el of root.querySelectorAll('a[href], area[href], link[href]')) {
    const href = el.getAttribute('href');
    if (href !== undefined) hrefs.push(href.trim());
  }
  return hrefs;
}

/**
 * Finds internal links that do not resolve.
 *
 * @param pages  Every HTML page in `dist`.
 * @param assetPaths  Paths (relative to dist) of the other files in `dist`, such as CSS, images and the favicon.
 */
export function findBrokenLinks(pages: readonly Page[], assetPaths: Iterable<string> = []): BrokenLink[] {
  const pageByPath = new Map<string, Page>();
  const files = new Set<string>();
  for (const page of pages) {
    const path = posix.normalize(page.path.replace(/\\/g, '/')).replace(/^\/+/, '');
    pageByPath.set(path, page);
    files.add(path);
  }
  for (const asset of assetPaths) files.add(posix.normalize(asset.replace(/\\/g, '/')).replace(/^\/+/, ''));

  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (path: string): Set<string> => {
    let anchors = anchorCache.get(path);
    if (!anchors) {
      anchors = collectAnchors((pageByPath.get(path) as Page).html);
      anchorCache.set(path, anchors);
    }
    return anchors;
  };

  const broken: BrokenLink[] = [];
  for (const [sourcePath, page] of pageByPath) {
    const base = `${LOCAL_ORIGIN}${pageUrlPath(sourcePath)}`;
    for (const href of hrefsOf(page.html)) {
      if (href === '') continue;
      let url: URL;
      try {
        url = new URL(href, base);
      } catch {
        broken.push({ source: sourcePath, href, reason: 'invalid-url', target: '' });
        continue;
      }
      if (url.origin !== LOCAL_ORIGIN) continue; // external, mailto:, tel:, javascript: ...

      const targetPath = resolveFile(url.pathname, files);
      if (!targetPath) {
        broken.push({ source: sourcePath, href, reason: 'missing-file', target: safeDecode(url.pathname) });
        continue;
      }

      const fragment = safeDecode(url.hash.slice(1)).split(':~:')[0] ?? '';
      if (fragment === '' || fragment.toLowerCase() === 'top') continue;
      if (!pageByPath.has(targetPath)) continue; // fragments on non-HTML files are not checked
      if (!anchorsOf(targetPath).has(fragment)) {
        broken.push({ source: sourcePath, href, reason: 'missing-anchor', target: targetPath });
      }
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return broken.sort((a, b) => cmp(a.source, b.source) || cmp(a.href, b.href));
}

/** Builds the text report printed by the CLI. */
export function formatBrokenLinks(broken: readonly BrokenLink[], pageCount: number): string {
  if (broken.length === 0) return `OK: no broken internal links in ${pageCount} page(s).`;
  const lines = [`FAIL: ${broken.length} broken internal link(s):`];
  for (const link of broken) {
    const why =
      link.reason === 'missing-file'
        ? `no file for ${link.target}`
        : link.reason === 'missing-anchor'
          ? `no id or name matching the fragment on ${link.target}`
          : 'not a valid URL';
    lines.push(`  ${link.source}: href="${link.href}" (${why})`);
  }
  return lines.join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Runs the check against a dist folder. Returns the exit code. */
export function main(distDir: string = resolve(process.cwd(), 'dist')): number {
  if (!existsSync(distDir)) {
    console.error(`link-check: ${distDir} not found. Run the Astro build first.`);
    return 1;
  }
  const pages: Page[] = [];
  const assets: string[] = [];
  for (const full of walk(distDir)) {
    const rel = relative(distDir, full).split(sep).join('/');
    if (rel.endsWith('.html')) pages.push({ path: rel, html: readFileSync(full, 'utf8') });
    else assets.push(rel);
  }
  const broken = findBrokenLinks(pages, assets);
  const report = formatBrokenLinks(broken, pages.length);
  if (broken.length > 0) console.error(report);
  else console.log(report);
  return broken.length === 0 ? 0 : 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.exit(process.argv[2] ? main(resolve(process.argv[2])) : main());
}
