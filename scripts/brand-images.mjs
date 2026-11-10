#!/usr/bin/env node
/**
 * brand-images.mjs — stamp the MoolResha logo badge onto the bottom-right
 * corner of raw AI-generated images, covering the Gemini "sparkle" watermark
 * and adding brand watermarking at the same time.
 *
 * Workflow:
 *   1. Drop raw images (from Gemini / AI Studio) into  public/images/raw/
 *      using the FINAL filenames (e.g. home-hero.webp, fibre-linen.png…).
 *   2. Run:  npm run brand-images
 *   3. Branded copies are written to  public/images/  as .webp, ready to serve.
 *
 * The badge is baked into the file, so it can never drift out of place no
 * matter how the page displays the image. Badge width scales with the image;
 * it sits flush to the bottom-right where Gemini stamps its watermark.
 *
 * Options:
 *   --margin=N   px gap from the edges (default 0 — flush to the corner so the
 *                small badge fully covers the AI watermark; use a positive
 *                value only if you'd rather inset it)
 *   --scale=N    badge width as a fraction of image width (default 0.12)
 *   --quality=N  webp quality 1-100 (default 82)
 */

import { readdir, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const RAW_DIR = path.join(projectRoot, "public", "images", "raw");
const OUT_DIR = path.join(projectRoot, "public", "images");
const BADGE = path.join(__dirname, "logo-badge.svg");

// --- args ---
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const MARGIN = Number(args.margin ?? 0);
const SCALE = Number(args.scale ?? 0.12);
const QUALITY = Number(args.quality ?? 82);

const IMG_RE = /\.(png|jpe?g|webp)$/i;

async function main() {
  if (!existsSync(RAW_DIR)) {
    await mkdir(RAW_DIR, { recursive: true });
    console.log(`Created ${path.relative(projectRoot, RAW_DIR)}/`);
    console.log("Drop your raw AI images there (final filenames), then re-run.");
    return;
  }

  const files = (await readdir(RAW_DIR)).filter((f) => IMG_RE.test(f));
  if (files.length === 0) {
    console.log(
      `No images in ${path.relative(projectRoot, RAW_DIR)}/. ` +
        "Add raw images (e.g. home-hero.webp) and re-run.",
    );
    return;
  }

  const badgeSvg = await readFile(BADGE);

  for (const file of files) {
    const inPath = path.join(RAW_DIR, file);
    const outName = file.replace(IMG_RE, ".webp");
    const outPath = path.join(OUT_DIR, outName);

    const base = sharp(inPath);
    const meta = await base.metadata();
    if (!meta.width || !meta.height) {
      console.warn(`! skipped ${file} (couldn't read dimensions)`);
      continue;
    }

    // Resize badge to a fraction of the image width.
    const badgeWidth = Math.round(meta.width * SCALE);
    const badgePng = await sharp(badgeSvg)
      .resize({ width: badgeWidth })
      .png()
      .toBuffer();
    const badgeMeta = await sharp(badgePng).metadata();
    const badgeHeight = badgeMeta.height ?? Math.round(badgeWidth * 0.27);

    // Place bottom-right. With margin=0 the badge sits flush in the corner
    // (fully covering the watermark). A positive margin insets it.
    const overlay =
      MARGIN > 0
        ? {
            input: badgePng,
            top: Math.max(0, meta.height - badgeHeight - MARGIN),
            left: Math.max(0, meta.width - badgeWidth - MARGIN),
          }
        : { input: badgePng, gravity: "southeast" };

    await base
      .composite([overlay])
      .webp({ quality: QUALITY })
      .toFile(outPath);

    console.log(
      `✓ ${file} → images/${outName}  (badge ${badgeWidth}px, bottom-right)`,
    );
  }

  console.log("\nDone. Branded images are in public/images/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
