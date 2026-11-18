# Content automation adapters

These modules are **opt-in** and remain separate from the Astro site.

## The automated daily pipeline (free tier)

`run-scheduled-job.mjs` is what `.github/workflows/content-studio-publish.yml`
actually runs three times a day. It holds no Meta/Instagram/AI credential —
only `CONTENT_STUDIO_EXECUTOR_KEY` — and talks only to the deployed Worker:

1. `GET /jobs/pending` — claims the due job the Worker's own cron enqueued.
2. `POST /generate` — the Worker asks **Workers AI** (free, no OpenAI key) for the draft.
3. Locally, `renderCarouselImages`/`renderReel` (below) turn that draft into PNGs or an MP4 using `ffmpeg`/`ImageMagick` installed on the GitHub Actions runner — the one step a Cloudflare Worker cannot do itself.
4. `POST /media` uploads each rendered file; the Worker stores it in a private R2 bucket and serves it back at `GET /media/:key`, which is the public HTTPS URL Meta's servers fetch from.
5. `POST /publish` — the Worker decrypts the stored Meta token and calls the Graph API itself. It dry-runs unless `ENABLE_INSTAGRAM_PUBLISH` and `IG_ACTIVATION_APPROVED` are both `"true"`; this script cannot force a live post either way.

See `cloudflare/README.md` for the full deploy/verify/enable-publishing checklist.

## Modules
- `render.mjs`: SVG slide exports; `renderCarouselImages` rasterizes them to 1080×1350 PNGs for carousel posts; `renderReel` additionally concatenates them into an ~18-second MP4 with FFmpeg. Requires `ffmpeg` and `magick` on `PATH` — present on the GitHub Actions runner via `apt-get install ffmpeg imagemagick`, not present in a Cloudflare Worker.
- `quality.mjs`: basic claim and length checks, run both inside the Worker's `/generate` and again by `run-scheduled-job.mjs` before rendering. Always requires human editorial review of what actually gets posted.
- `instagram.mjs`: Meta Graph API carousel/Reel container creation, status polling and publishing. The automated pipeline above calls this from *inside the Worker* (`cloudflare/src/worker.mjs`'s `POST /publish`), not from GitHub Actions, so the token never leaves Cloudflare. Not tested against a live account yet.
- `run-scheduled-job.mjs`: the GitHub Actions entry point described above.
- `config.mjs`: 08:00 carousel, 13:00 Reel, 19:00 carousel in Asia/Kolkata — used by the Worker's `scheduled()` handler, not by this directory directly.

## Manual/local-only tools (not part of the automated pipeline, cost money or require local setup)
- `ai.mjs`: the original OpenAI-based draft generator. **Costs money per call** and is not used by `run-scheduled-job.mjs`, which uses the Worker's free Workers AI route instead. Kept only for local experimentation if you deliberately want to compare quality against a paid model.
- `cli.mjs`: a local manual CLI (`generate`/`schedule`/`render`/`publish`) for testing pieces of the pipeline by hand without touching the deployed Worker. Its `publish` command takes a raw `IG_USER_ID`/`IG_ACCESS_TOKEN` from `.env` — a different, manual credential path from the encrypted-in-D1 token the automated pipeline uses.

```sh
cd tools/content-studio
npm test
OPENAI_API_KEY=... node automation/cli.mjs generate carousel   # manual/local only, costs money
node automation/cli.mjs schedule
node automation/cli.mjs render DRAFT_ID
```

## Architecture boundary
The entire application lives under `tools/content-studio/`. No storefront routes or databases are changed. Removal is a directory deletion.
