/**
 * Regenerates every favicon/icon raster file in `public/` from the one source of truth,
 * `public/favicon.svg`. Re-run this whenever that SVG changes — don't hand-edit the PNGs or
 * the .ico; they're all derived, deterministic output.
 *
 * Why this exists: Google Search's favicon crawler only supports ICO, PNG, APNG, GIF or WebP
 * (https://developers.google.com/search/docs/appearance/favicon-in-search) — it does NOT read
 * an SVG-only favicon. This site only shipped `favicon.svg` for a while, which is why Search
 * was showing a generic icon instead of the real one even though the SVG displayed fine in a
 * browser tab. This script produces the missing raster set; `BaseLayout.astro`'s `<head>`
 * wires all of it up (SVG first for modern browser tabs, then .ico/PNGs/manifest for everyone
 * else, including Search).
 *
 * Local file-only script, no network calls. Run with:
 *   node scripts/generate-favicons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const SVG_PATH = join(PUBLIC_DIR, 'favicon.svg');

/** `density` is a supersampling factor for `sharp`'s SVG rasteriser — the output is still
 * resized to the exact target size below, this just keeps edges clean at small sizes. */
const DENSITY = 384;

const PNG_TARGETS = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];

/** The sizes bundled into favicon.ico itself (a separate, smaller set from PNG_TARGETS —
 * .ico is a legacy fallback, it doesn't need the large app-icon sizes). */
const ICO_SIZES = [16, 32, 48];

async function renderPng(svg, size) {
  return sharp(svg, { density: DENSITY }).resize(size, size).png().toBuffer();
}

/** Builds a valid multi-resolution .ico by embedding PNG payloads directly (the "PNG-in-ICO"
 * format every browser built since Vista/IE9 supports) — no external ICO library needed. */
function buildIco(pngsBySize, sizes) {
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * sizes.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = dirSize;
  const entries = [];
  const pngs = [];
  for (const size of sizes) {
    const png = pngsBySize.get(size);
    const entry = Buffer.alloc(entrySize);
    const dim = size >= 256 ? 0 : size; // 0 means 256 in the ICO format
    entry.writeUInt8(dim, 0); // width
    entry.writeUInt8(dim, 1); // height
    entry.writeUInt8(0, 2); // color palette (none; it's a PNG payload)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image data size
    entry.writeUInt32LE(offset, 12); // image data offset
    entries.push(entry);
    pngs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

async function main() {
  const svg = readFileSync(SVG_PATH);
  const pngsBySize = new Map();

  for (const { size, name } of PNG_TARGETS) {
    const buf = await renderPng(svg, size);
    pngsBySize.set(size, buf);
    writeFileSync(join(PUBLIC_DIR, name), buf);
    console.log(`wrote public/${name} (${buf.length} bytes)`);
  }

  // ICO_SIZES is a subset of PNG_TARGETS' sizes (16/32/48 all already rendered above) —
  // reuse those buffers rather than rendering again.
  const ico = buildIco(pngsBySize, ICO_SIZES);
  writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico);
  console.log(`wrote public/favicon.ico (${ico.length} bytes)`);
}

main();
