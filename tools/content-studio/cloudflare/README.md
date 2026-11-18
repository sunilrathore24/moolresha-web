# Cloudflare Content Studio deployment

This service is independent of the Astro storefront. Do not modify the existing `moolresha-web` Pages project, DNS, or `moolresha_feedback` D1.

## Verified resources (18 Nov 2026)

- Worker: `moolresha-content-studio` at `https://moolresha-content-studio.sunilrathore24.workers.dev`
- Deployed Worker version: `02d4b9fd` — **predates the executor routes below; redeploy before relying on them.**
- Dedicated D1 database: `moolresha_content_studio` (`bddd1a03-5acd-4439-8287-bd89cc2f9a6f`)
- D1 binding: `CONTENT_DB`; migration `migrations/0001_jobs.sql` applied
- Cron triggers (UTC): `30 2 * * *`, `30 7 * * *`, `30 13 * * *` (08:00, 13:00, 19:00 IST)
- `/health` verified with `status: ok` and `instagramPublishing: false`
- Whether the OAuth callback actually completed and left a row in `instagram_connections` is **still unverified** — check with a read-only D1 query before relying on it (see "Verify the OAuth connection" below).

## Architecture: who does what, and why it's all free tier

The Worker alone cannot run the daily pipeline: it has no filesystem and cannot
shell out to `ffmpeg`/`ImageMagick`, so generation, rendering and publishing
cannot all happen inside it. The pipeline is split instead:

| Step | Runs where | Free-tier mechanism |
|---|---|---|
| Cron fires, enqueues a pending job | Cloudflare Worker (`scheduled()`) | Workers free plan cron triggers |
| Claim job, generate the draft (title/slides/caption) | Worker, via `POST /generate` | **Workers AI** — 10,000 neurons/day free, no OpenAI key needed |
| Render SVG → PNG (carousel) / → MP4 (Reel) | **GitHub Actions** runner, via `automation/run-scheduled-job.mjs` | GitHub Actions free minutes; `ffmpeg`/`ImageMagick` installed on the runner — this is the one thing a Worker cannot do |
| Store rendered media, serve it over public HTTPS for Meta to fetch | Worker, via `POST /media` + `GET /media/:key` | **Workers KV** free tier (100k reads/day, 1k writes/day, 1GB storage, items auto-expire after 30 days) — chosen over R2 specifically because R2 requires a payment method on file even at $0 usage; KV needs none. Private namespace, every read goes through this Worker |
| Call the Meta Graph API | Worker, via `POST /publish` | Meta's API itself is free; the Worker decrypts the stored token and calls it server-side so the token and the publish decision never leave Cloudflare |

GitHub Actions never holds a Meta or Instagram credential — only
`CONTENT_STUDIO_EXECUTOR_KEY`, a bearer secret the Worker checks on
`/jobs/pending`, `/generate`, `/media` and `/publish`. The Worker — not the
executor — is the only place that reads `ENABLE_INSTAGRAM_PUBLISH` /
`IG_ACTIVATION_APPROVED`, so GitHub Actions cannot force a live post even if
it tried.

## Production prerequisites (do these before relying on the automated pipeline)

1. `npx wrangler d1 migrations apply moolresha_content_studio --remote` to pick up `migrations/0003_executor.sql` (adds `claimed`/`generated`/`dry-run`/`published` job statuses and draft/media/publish columns).
2. ~~Create an R2 bucket~~ — not used. The KV namespace `moolresha-content-media` (id `a4eae5103ad84ef6a9bce871481d43fc`) was created via the dashboard on 18 Nov 2026 and is already in `wrangler.toml`'s `[[kv_namespaces]]` block. R2 was deliberately avoided: it requires a payment method on file even for $0 free-tier usage, which this project doesn't want. (If you ever need to recreate it: `npx wrangler kv namespace create CONTENT_MEDIA`.)
3. Generate a random executor secret and store it twice: `npx wrangler secret put EXECUTOR_KEY` (Worker) and as the GitHub Actions secret `CONTENT_STUDIO_EXECUTOR_KEY` (Settings → Secrets and variables → Actions, scoped to this repo). Never put it in a commit, PR, or chat.
4. `npx wrangler deploy` to ship `worker.mjs`'s new routes, the `[ai]` binding and the `[[kv_namespaces]]` binding in `wrangler.toml`.
5. Merge `.github/workflows/content-studio-publish.yml` to `main` — **GitHub only evaluates `schedule:` triggers on the default branch**, so the cron silently does nothing until then. Use `workflow_dispatch` (the "Run workflow" button) to test it on a branch first.

## Verify the OAuth connection

Read-only, does not touch or print the token:

```sh
npx wrangler d1 execute moolresha_content_studio --remote --command \
  "SELECT instagram_account_id, facebook_page_name, status, connected_at, updated_at FROM instagram_connections;"
```

If this returns no rows, the callback never completed — the owner needs to redo the `POST /auth/start` → browser authorization flow (see `README-auth.md`); the OAuth session expires after 10 minutes.

## Before enabling live Instagram publishing

The owner explicitly approved future Instagram publishing on 18 Nov 2026, conditioned on this checklist — approval in principle is not the same as these being done. Both `ENABLE_INSTAGRAM_PUBLISH` and `IG_ACTIVATION_APPROVED` stay `"false"` in `wrangler.toml` until every item below is true, and flipping them is a separate, explicit, confirmed step — not something to do as part of a code deploy:

1. `instagram_connections` has a `status='connected'` row for the intended account (checked above), not a stale or wrong one.
2. The intended Instagram Business account was verified against the token (the OAuth flow already does this via `IG_EXPECTED_ACCOUNT_ID`; confirm it was set before the connection was made).
3. At least one full dry run has succeeded for **both** a carousel and a Reel: trigger `content-studio-publish.yml` manually (`workflow_dispatch`), confirm the Worker logs show `status: "dry-run"` with a real `mediaCount`, and the rendered media is inspected for quality/brand compliance by opening the `GET /media/:key` URL it produced — this pipeline has never been run end to end, so the first few runs should be watched, not trusted blind.
4. Rate limits, retry/error behavior, and what happens on a stuck `claimed` job (use `POST /jobs/:key/fail` to unstick one manually) are understood.
5. Meta app permissions (`instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`) are approved for the intended account — Unified Login has previously presented bundled ads/messaging/comment permissions; do not grant those just to get publishing working.

Only after all of that, set both vars to `"true"` in `wrangler.toml` and redeploy — this doubles as the audit trail of when and that live publishing was turned on.

Everything above stays within Cloudflare's free tier (Workers, D1, Workers KV, Workers AI) plus GitHub Actions free minutes, and none of it required adding a payment method to the account. Never commit Meta tokens, Cloudflare credentials, or other secrets.
