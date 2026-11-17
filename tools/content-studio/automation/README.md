# Content automation adapters

These modules are **opt-in** and remain separate from the Astro site.

## What works
- `ai.mjs`: AI-written six-slide editorial drafts with JSON validation. Requires `OPENAI_API_KEY`. Source URLs are restricted to the curated input brief. This is **not** independent fact verification.
- `quality.mjs`: basic claim and length checks. Always requires human editorial review.
- `config.mjs`: 08:00 carousel, 13:00 Reel, 19:00 carousel in Asia/Kolkata.
- `cli.mjs schedule`: idempotently records due slots in local JSON. It does not run itself or publish.
- `render.mjs`: SVG slide exports; experimental 18-second text-based Reel render using installed ImageMagick and FFmpeg.
- `instagram.mjs`: Meta Graph API carousel/Reel container creation, status polling and publishing. Requires a supported professional Instagram account and permissions. Not tested against a live account.

## Commands
```sh
cd tools/content-studio
npm test
OPENAI_API_KEY=... node automation/cli.mjs generate carousel
node automation/cli.mjs generate reel
node automation/cli.mjs schedule
node automation/cli.mjs render DRAFT_ID
```

Rendering Reels requires `ffmpeg` and `magick` on PATH. The current renderer creates motionless 3-second cards and is an **experimental placeholder**, not a cinematic AI video system. The SVG files are not directly valid Instagram carousel media: convert to JPEG and host over public HTTPS.

## Publishing safety
Publishing is disabled unless `ENABLE_INSTAGRAM_PUBLISH=true`. In addition, a draft must be approved and a media manifest must exist at `data/manifests/<draft-id>.json`. Example:
```json
{"images":["https://cdn.example.com/1.jpg","https://cdn.example.com/2.jpg"]}
```
or for Reels:
```json
{"videoUrl":"https://cdn.example.com/reel.mp4"}
```
Never commit API keys, access tokens or media manifests containing private URLs. For production, add OAuth, token rotation, job locking, retries, idempotent publish receipts, R2 hosting, observability and secure admin authentication before unattended use.

## Architecture boundary
The entire application lives under `tools/content-studio/`. No storefront routes or databases are changed. Removal is a directory deletion. No GitHub Actions workflow is installed or enabled.
