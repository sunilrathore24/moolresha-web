/**
 * Task 5.8 (optional): build fixture test for the Concept image loader.
 *
 * What it does
 *   - Creates a temporary Astro project with fs.mkdtemp (in the OS temp folder). The repo's real
 *     src/ and dist/ are never written to; the only repo files touched are READ: the real loader
 *     (src/lib/concept-images.ts), the real resolver, the real view list and the real allow-lists are
 *     copied into the fixture at test time, so the fixture builds the production code, not a copy that
 *     can drift.
 *   - node_modules is a symlink to the repo's node_modules (no install, no network). Astro's cache dir is
 *     moved into the temp project so nothing is written into the repo's node_modules.
 *   - Tiny PNG and WebP files are generated in-process with Sharp. Nothing is downloaded.
 *   - Runs `astro build` as a child process (`node node_modules/astro/bin/astro.mjs build`) with
 *     PUBLIC_LAUNCH unset and then "true", and asserts exit codes, messages and the built HTML.
 *   - Deletes the temp folder in afterAll.
 *
 * Scenarios (design.md, "Build fixture test for the image loader"; Requirements 8B.1 to 8B.8, 8B.9):
 *   1. one Concept missing 03-side
 *   2. 03-side.png and 03-side.webp together (duplicate)
 *   3. 01-front.PNG and notes.txt (unrecognised names)
 *   4. a complete, correctly named set
 *
 * Offline: the build reads only local files. Astro telemetry is switched off for the child process.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { VIEW_BASES } from '../../src/lib/concept-views';

const REPO = process.cwd();
const ASTRO_BIN = join(REPO, 'node_modules', 'astro', 'bin', 'astro.mjs');
const TIMEOUT = 180_000;

let root = '';
const pngByView = new Map<string, Buffer>();
let webpBuffer: Buffer;

// ---------------------------------------------------------------------------
// Fixture project
// ---------------------------------------------------------------------------

const PAGE = `---
import { Picture } from 'astro:assets';
import { conceptViews } from '../lib/concept-images';
import { CONCEPT_IDS } from '../content/config/allow-lists';
---
<html lang="en">
  <head><meta charset="utf-8" /><title>fixture</title></head>
  <body>
    {CONCEPT_IDS.map((id) => (
      <section data-concept={id}>
        {conceptViews[id].map((v) =>
          v.status === 'file' ? (
            <Picture
              src={v.image}
              alt={id + ' ' + v.view}
              formats={['avif', 'webp']}
              fallbackFormat="webp"
              widths={[16]}
              width={v.image.width}
              height={v.image.height}
              loading="lazy"
              decoding="async"
              data-view={v.view}
            />
          ) : (
            <div class="av-placeholder" role="img" data-view={v.view} aria-label={'Image coming soon: ' + id + ', ' + v.view + ' view'}>
              <span>Image coming soon</span>
            </div>
          ),
        )}
      </section>
    ))}
  </body>
</html>
`;

async function copyReal(rel: string): Promise<void> {
  const to = join(root, rel);
  await mkdir(join(to, '..'), { recursive: true });
  await copyFile(join(REPO, rel), to);
}

async function writeSkeleton(): Promise<void> {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'concept-images-fixture', private: true, type: 'module' }));
  await writeFile(
    join(root, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';\nexport default defineConfig({ cacheDir: './.astro-cache', telemetry: false });\n`,
  );
  await mkdir(join(root, 'src', 'pages'), { recursive: true });
  await writeFile(join(root, 'src', 'pages', 'index.astro'), PAGE);
  // The REAL production files, copied verbatim.
  await copyReal('src/lib/concept-images.ts');
  await copyReal('src/lib/concept-image-resolver.ts');
  await copyReal('src/lib/concept-views.ts');
  await copyReal('src/content/config/allow-lists.ts');
  // No install: reuse the repo's node_modules.
  await symlink(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
}

type FileSpec = { name: string; kind: 'png' | 'webp' | 'text' };

/** A complete, correctly named set (8 PNGs per Concept), with per-Concept tweaks. */
function completeSet(tweak: (id: string, files: FileSpec[]) => FileSpec[] = (_id, f) => f): Record<string, FileSpec[]> {
  const out: Record<string, FileSpec[]> = {};
  for (const id of CONCEPT_IDS) {
    const files = VIEW_BASES.map((v): FileSpec => ({ name: `${v}.png`, kind: 'png' }));
    out[id] = tweak(id, files);
  }
  return out;
}

async function installImages(set: Record<string, FileSpec[]>): Promise<void> {
  const base = join(root, 'src', 'assets', 'concepts');
  await rm(base, { recursive: true, force: true });
  await rm(join(root, 'dist'), { recursive: true, force: true });
  for (const [id, files] of Object.entries(set)) {
    const dir = join(base, id);
    await mkdir(dir, { recursive: true });
    for (const f of files) {
      const view = f.name.replace(/\.[^.]+$/, '');
      const data =
        f.kind === 'text' ? Buffer.from('notes\n') : f.kind === 'webp' ? webpBuffer : (pngByView.get(view) ?? pngByView.get('01-front')!);
      await writeFile(join(dir, f.name), data);
    }
  }
}

interface BuildResult {
  code: number | null;
  output: string;
}

/** Runs `astro build` in the fixture. PUBLIC_LAUNCH is unset, or "true". Output is stdout + stderr. */
function build(launch: boolean): Promise<BuildResult> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    // Do not leak the test runner's mode into the child build.
    if (k === 'NODE_ENV' || k === 'VITEST' || k.startsWith('VITEST_') || k === 'PUBLIC_LAUNCH') delete env[k];
  }
  env.ASTRO_TELEMETRY_DISABLED = '1';
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  env.CI = 'true';
  if (launch) env.PUBLIC_LAUNCH = 'true';

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ASTRO_BIN, 'build'], { cwd: root, env });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function builtHtml(): Promise<ReturnType<typeof parse>> {
  return parse(await readFile(join(root, 'dist', 'index.html'), 'utf8'));
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mr-concept-images-'));
  await writeSkeleton();
  // One small PNG per view, in a different colour each, made in-process.
  for (const [i, view] of VIEW_BASES.entries()) {
    pngByView.set(
      view,
      await sharp({ create: { width: 16, height: 20, channels: 3, background: { r: 40 + i * 25, g: 90, b: 160 - i * 10 } } })
        .png()
        .toBuffer(),
    );
  }
  webpBuffer = await sharp({ create: { width: 16, height: 20, channels: 3, background: { r: 10, g: 200, b: 10 } } })
    .webp()
    .toBuffer();
}, 60_000);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Concept image loader: astro build fixture', () => {
  it('the fixture is a temp folder outside the repo and does not use the repo src/ or dist/', () => {
    expect(root.startsWith(tmpdir())).toBe(true);
    expect(root.startsWith(REPO)).toBe(false);
  });

  it(
    '1. a Concept missing 03-side: dev warns and exits 0 with a placeholder; public-launch exits 1 naming it',
    async () => {
      await installImages(completeSet((id, f) => (id === 'mens-cotton-shirt' ? f.filter((x) => x.name !== '03-side.png') : f)));

      const dev = await build(false);
      expect(dev.code, dev.output).toBe(0);
      expect(dev.output).toContain('[concept-images] mens-cotton-shirt: missing 03-side');
      const html = await builtHtml();
      const placeholders = html.querySelectorAll('.av-placeholder');
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]!.getAttribute('data-view')).toBe('03-side');
      expect(placeholders[0]!.closest('section')!.getAttribute('data-concept')).toBe('mens-cotton-shirt');
      expect(placeholders[0]!.getAttribute('aria-label')).toBe('Image coming soon: mens-cotton-shirt, 03-side view');
      expect(placeholders[0]!.text).toContain('Image coming soon');
      expect(html.querySelectorAll('img')).toHaveLength(CONCEPT_IDS.length * VIEW_BASES.length - 1);

      const launch = await build(true);
      expect(launch.code, launch.output).toBe(1);
      expect(launch.output).toContain('[concept-images] mens-cotton-shirt: missing 03-side');
      expect(launch.output).toMatch(/mens-cotton-shirt/);
    },
    TIMEOUT,
  );

  it(
    '2. 03-side.png and 03-side.webp together: both modes exit 1 and name both files',
    async () => {
      await installImages(
        completeSet((id, f) => (id === 'mens-linen-shirt' ? [...f, { name: '03-side.webp', kind: 'webp' as const }] : f)),
      );
      for (const launch of [false, true]) {
        const r = await build(launch);
        const label = launch ? 'public-launch' : 'dev';
        expect(r.code, `${label}: ${r.output}`).toBe(1);
        expect(r.output, label).toContain('mens-linen-shirt: duplicate 03-side files');
        expect(r.output, label).toContain('mens-linen-shirt/03-side.png');
        expect(r.output, label).toContain('mens-linen-shirt/03-side.webp');
      }
    },
    TIMEOUT,
  );

  it(
    '3. 01-front.PNG and notes.txt: both modes warn naming each file; dev exits 0; public-launch exits 1 because 01-front is then missing',
    async () => {
      await installImages(
        completeSet((id, f) =>
          id === 'mens-relaxed-pant'
            ? [
                ...f.filter((x) => x.name !== '01-front.png'), // never both: macOS file systems ignore case
                { name: '01-front.PNG', kind: 'png' as const },
                { name: 'notes.txt', kind: 'text' as const },
              ]
            : f,
        ),
      );

      const dev = await build(false);
      expect(dev.code, dev.output).toBe(0);
      expect(dev.output).toContain('unrecognised file /src/assets/concepts/mens-relaxed-pant/01-front.PNG');
      expect(dev.output).toContain('unrecognised file /src/assets/concepts/mens-relaxed-pant/notes.txt');
      expect(dev.output).toContain('mens-relaxed-pant: missing 01-front');
      const html = await builtHtml();
      const placeholders = html.querySelectorAll('.av-placeholder');
      expect(placeholders.map((p) => p.getAttribute('data-view'))).toEqual(['01-front']);

      const launch = await build(true);
      expect(launch.code, launch.output).toBe(1);
      expect(launch.output).toContain('unrecognised file /src/assets/concepts/mens-relaxed-pant/01-front.PNG');
      expect(launch.output).toContain('unrecognised file /src/assets/concepts/mens-relaxed-pant/notes.txt');
      expect(launch.output).toContain('mens-relaxed-pant: missing 01-front');
    },
    TIMEOUT,
  );

  it(
    '4. a complete, correctly named set: both modes exit 0 with no loader messages, and every served image is AVIF or WebP with width and height',
    async () => {
      await installImages(completeSet());

      for (const launch of [false, true]) {
        const label = launch ? 'public-launch' : 'dev';
        const r = await build(launch);
        expect(r.code, `${label}: ${r.output}`).toBe(0);
        expect(r.output, label).not.toContain('[concept-images]');

        const html = await builtHtml();
        expect(html.querySelectorAll('.av-placeholder'), label).toHaveLength(0);
        const imgs = html.querySelectorAll('img');
        expect(imgs, label).toHaveLength(CONCEPT_IDS.length * VIEW_BASES.length);
        for (const img of imgs) {
          const src = img.getAttribute('src') ?? '';
          expect(src, `${label}: ${src}`).toMatch(/\.(webp|avif)(\?|$)/);
          expect(img.getAttribute('width'), `${label}: width of ${src}`).toMatch(/^\d+$/);
          expect(img.getAttribute('height'), `${label}: height of ${src}`).toMatch(/^\d+$/);
          expect(img.getAttribute('src')).not.toMatch(/\.(png|jpe?g)$/i);
        }
        // Each <picture> offers AVIF and WebP sources.
        const pictures = html.querySelectorAll('picture');
        expect(pictures, label).toHaveLength(CONCEPT_IDS.length * VIEW_BASES.length);
        for (const p of pictures) {
          const types = p.querySelectorAll('source').map((s) => s.getAttribute('type'));
          expect(types, label).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));
        }
        // Nothing the page references (src or any srcset candidate) is a PNG, JPEG or GIF.
        // Astro may still leave the original files in dist/_astro, unreferenced; "served" means referenced.
        const referenced: string[] = [];
        for (const el of html.querySelectorAll('img, source')) {
          const src = el.getAttribute('src');
          if (src) referenced.push(src);
          for (const cand of (el.getAttribute('srcset') ?? '').split(',')) {
            const url = cand.trim().split(/\s+/)[0];
            if (url) referenced.push(url);
          }
        }
        expect(referenced.length, label).toBeGreaterThan(0);
        expect(referenced.filter((u) => /\.(png|jpe?g|gif)(\?|$)/i.test(u)), label).toEqual([]);
      }
    },
    TIMEOUT,
  );
});
