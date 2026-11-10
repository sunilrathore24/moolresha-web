#!/usr/bin/env node
/**
 * One-off, local-only helper: crops src/assets/journey/collage.png into its five tiles.
 * Not part of the build. Run with `node scripts/crop-collage.mjs`.
 *
 * Layout: a top row of two tiles and a bottom row of three, separated by thin light gutters.
 * The gutters are found by scanning for rows and columns whose mean brightness is high, then
 * every crop is trimmed a few pixels inward so no gutter (or anti-aliased gutter edge) remains.
 * After writing, each output is checked: its size, and that its outer edge rows/columns are not
 * gutter-bright.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'journey');
const SRC = join(DIR, 'collage.png');
/** Mean greyscale value (0 to 255) above which a full line counts as gutter. */
const GUTTER_MIN = 200;
/** Pixels trimmed inward from each gutter and from the outer edge. */
const INSET = 6;
const OUTER_INSET = 4;

const { data, info } = await sharp(SRC).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (x, y) => data[y * W + x];

function rowMean(y, x0 = 0, x1 = W) {
  let s = 0;
  for (let x = x0; x < x1; x++) s += px(x, y);
  return s / (x1 - x0);
}

function colMean(x, y0 = 0, y1 = H) {
  let s = 0;
  for (let y = y0; y < y1; y++) s += px(x, y);
  return s / (y1 - y0);
}

/** Groups consecutive indices into [start, end] runs (end inclusive). */
function runs(indices) {
  const out = [];
  for (const i of indices) {
    const last = out.at(-1);
    if (last && i === last[1] + 1) last[1] = i;
    else out.push([i, i]);
  }
  return out;
}

/** Bright runs over a range, ignoring the outer 2 % so a light frame is not taken as a gutter. */
function findGutters(length, mean) {
  const margin = Math.round(length * 0.02);
  const hits = [];
  for (let i = margin; i < length - margin; i++) if (mean(i) > GUTTER_MIN) hits.push(i);
  return runs(hits);
}

const hGutters = findGutters(H, (y) => rowMean(y));
if (hGutters.length !== 1) throw new Error(`Expected one horizontal gutter, found ${JSON.stringify(hGutters)}`);
const [hg] = hGutters;
// Rows the gutter covers, widened by one for the anti-aliased edge.
const topEnd = hg[0] - 1; // exclusive end of the top row
const bottomStart = hg[1] + 2;

const topGutters = findGutters(W, (x) => colMean(x, 0, topEnd));
const bottomGutters = findGutters(W, (x) => colMean(x, bottomStart, H));
if (topGutters.length !== 1) throw new Error(`Expected one gutter in the top row, found ${JSON.stringify(topGutters)}`);
if (bottomGutters.length !== 2) {
  throw new Error(`Expected two gutters in the bottom row, found ${JSON.stringify(bottomGutters)}`);
}

/** Column spans [x0, x1) of the tiles in a row, given its gutters. */
function spans(gutters) {
  const out = [];
  let start = 0;
  for (const [a, b] of gutters) {
    out.push([start, a - 1]);
    start = b + 2;
  }
  out.push([start, W]);
  return out;
}

const rowsY = { top: [0, topEnd], bottom: [bottomStart, H] };
const tiles = [
  { name: 'cotton-pile.jpg', row: 'top', span: spans(topGutters)[0] },
  { name: 'yarn-cones.jpg', row: 'top', span: spans(topGutters)[1] },
  { name: 'loom-detail.jpg', row: 'bottom', span: spans(bottomGutters)[0] },
  { name: 'fabric-roll.jpg', row: 'bottom', span: spans(bottomGutters)[1] },
  { name: 'hands-stitching.jpg', row: 'bottom', span: spans(bottomGutters)[2] },
];

function insetRange([a, b], max) {
  const lo = a === 0 ? OUTER_INSET : a + INSET;
  const hi = b === max ? max - OUTER_INSET : b - INSET;
  return [lo, hi];
}

console.log(`collage ${W}x${H}; horizontal gutter rows ${hg[0]}-${hg[1]}`);
console.log(`top gutters ${JSON.stringify(topGutters)}, bottom gutters ${JSON.stringify(bottomGutters)}`);

for (const t of tiles) {
  const [x0, x1] = insetRange(t.span, W);
  const [y0, y1] = insetRange(rowsY[t.row], H);
  const region = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  const out = join(DIR, t.name);
  await sharp(SRC).extract(region).jpeg({ quality: 88, mozjpeg: true }).toFile(out);

  // Verify: size matches, and no outer edge line of the crop is gutter-bright.
  const check = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = check.info;
  if (w !== region.width || h !== region.height) throw new Error(`${t.name}: unexpected size ${w}x${h}`);
  const d = check.data;
  const mean = (get, n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += get(i);
    return s / n;
  };
  const edges = {
    top: mean((x) => d[x], w),
    bottom: mean((x) => d[(h - 1) * w + x], w),
    left: mean((y) => d[y * w], h),
    right: mean((y) => d[y * w + w - 1], h),
  };
  const bad = Object.entries(edges).filter(([, v]) => v > GUTTER_MIN);
  if (bad.length > 0) throw new Error(`${t.name}: gutter left at ${bad.map(([k]) => k).join(', ')}`);
  const e = Object.entries(edges)
    .map(([k, v]) => `${k} ${v.toFixed(0)}`)
    .join(', ');
  console.log(`${t.name}: ${w}x${h} at (${x0}, ${y0}); edge means ${e}`);
}
