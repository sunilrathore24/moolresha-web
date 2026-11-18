# MoolResha Content Studio (isolated MVP)

An independent, removable local content-production application. No changes to the Astro storefront, its dependencies, Cloudflare configuration, or production database.

## Run

```sh
cd tools/content-studio
npm run dev
# open http://127.0.0.1:4179
npm test
```

Node.js 22+ only. No additional dependencies. Drafts are stored in `data/drafts.json` (ignored by git); do not expose this server to the internet. All endpoints bind to loopback. Content is never published automatically.

## Features
- Three starter content briefs aligned with MoolResha's niche
- Draft creation, edit, approval, and rejection workflow
- Six branded 1080x1350 SVG carousel slides per draft, downloadable individually
- Source URLs, editorial checks, and copy-editable captions
- Approved colour palette and font stack matching `src/styles/tokens.css` (Newsreader / Inter)
- Basic automated tests

## Security and editorial guardrails
The app is intentionally local-only and has **no Instagram credentials, OAuth, background scheduler, AI API calls, or publishing permissions**. Approval is not a claim of factual verification. Review cited sources manually before approving. Avoid unsupported sustainability claims.

## Removal
Delete `tools/content-studio/`. The existing website and database remain unchanged.

## Next integration
Introduce an authenticated Cloudflare Pages Functions adapter and separate D1/R2 resources after the local workflow is accepted. Build a video renderer as a separately deployable worker, then add Instagram OAuth and publishing with explicit enablement. Do not reuse the public storefront's D1 database for this module.

## Automated daily pipeline

The local dashboard above (`server.mjs`/`index.html`) is manual-only and has
no scheduler or credentials. Separately, `cloudflare/` + `automation/` +
`.github/workflows/content-studio-publish.yml` implement the actual
unattended pipeline: a Cloudflare Worker cron enqueues a job, Workers AI
generates the draft, a GitHub Actions runner renders it with FFmpeg/
ImageMagick, and the Worker uploads the media to a private R2 bucket and
calls the Meta Graph API with the encrypted-in-D1 token — all on free tiers,
no OpenAI key required. It dry-runs (no real Instagram post) until the owner
explicitly enables both Worker publishing flags after a verified dry run.
See [cloudflare/README.md](cloudflare/README.md) for the deploy and go-live
checklist, and [automation/README.md](automation/README.md) for what each
module does.
