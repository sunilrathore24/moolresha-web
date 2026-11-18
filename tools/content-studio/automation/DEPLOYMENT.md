# Content Studio deployment

The automated daily pipeline is the Cloudflare Worker (`cloudflare/`) plus the
GitHub Actions workflow `.github/workflows/content-studio-publish.yml`
calling `automation/run-scheduled-job.mjs` on a cron matching the Worker's own
08:00/13:00/19:00 IST job slots. Full deploy and go-live checklist:
**`cloudflare/README.md`** — read that first. Short version:

1. `npx wrangler d1 migrations apply moolresha_content_studio --remote`
2. `npx wrangler r2 bucket create moolresha-content-media`
3. `npx wrangler secret put EXECUTOR_KEY` (and the same value as the GitHub Actions secret `CONTENT_STUDIO_EXECUTOR_KEY`)
4. `npx wrangler deploy`
5. Merge the workflow file to `main` (GitHub only runs `schedule:` triggers from the default branch), or test first with its `workflow_dispatch` button.

Everything above is free tier: Cloudflare Workers/D1/R2/Workers AI free
allocations, plus GitHub Actions free minutes. No OpenAI key or other paid API
is required for the automated path.

Publishing itself stays a no-op dry run (`status: "dry-run"` in the Worker's
response and job record) until the owner sets both `ENABLE_INSTAGRAM_PUBLISH`
and `IG_ACTIVATION_APPROVED` to `"true"` and redeploys — see the "Before
enabling live Instagram publishing" checklist in `cloudflare/README.md`.
That is a deliberate, separate step, never a side effect of a code deploy.

## Manual/local-only (not the automated path, not required)
- `node automation/cli.mjs generate carousel` — uses `ai.mjs`'s OpenAI path. Requires `OPENAI_API_KEY` and **costs money per call**; the automated pipeline uses the Worker's free Workers AI route instead.
- `node automation/cli.mjs render <draft-id>` — exports SVGs/MP4 locally for manual inspection (ffmpeg and ImageMagick required).
- `node automation/cli.mjs publish <draft-id>` — a separate manual path using a raw `IG_USER_ID`/`IG_ACCESS_TOKEN` from `.env`, distinct from the encrypted-in-D1 token the automated pipeline uses. Requires an approved draft and a hand-written media manifest.

Remove `tools/content-studio/` to uninstall; nothing outside this directory is touched.
