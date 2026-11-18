# Cloudflare Content Studio deployment

This service is independent of the Astro storefront. Do not modify the existing `moolresha-web` Pages project, DNS, or `moolresha_feedback` D1.

## Verified resources (18 Nov 2026)

- Worker: `moolresha-content-studio` at `https://moolresha-content-studio.sunilrathore24.workers.dev`
- Deployed Worker version: `02d4b9fd`
- Dedicated D1 database: `moolresha_content_studio` (`bddd1a03-5acd-4439-8287-bd89cc2f9a6f`)
- D1 binding: `CONTENT_DB`; migration `migrations/0001_jobs.sql` applied
- Cron triggers (UTC): `30 2 * * *`, `30 7 * * *`, `30 13 * * *` (08:00, 13:00, 19:00 IST)
- `/health` verified with `status: ok` and `instagramPublishing: false`

## Current behavior

The deployed Worker exposes `GET /health` and inserts idempotent pending jobs into D1. It does **not** yet generate, render, host, or publish media. The cron triggers are not evidence of a complete daily publishing pipeline.

## Instagram activation

The owner explicitly approved future Instagram publishing on 18 Nov 2026. That approval does not mean the integration has passed readiness checks. Do not enable publishing flags until all of these have been verified:

1. A real, secure HTTPS OAuth callback exists and its exact URL is registered in Meta app `moolresha` (`962195580000279`).
2. A minimally scoped publishing authorization is granted by the account owner, with secrets securely stored and never committed.
3. The intended Instagram Business account is verified against the token.
4. Media are rendered and served from stable public HTTPS URLs with appropriate retention, without enabling an unapproved paid service.
5. Dry-run tests pass for both carousels and Reels; the first live post is explicitly identified and verified before enabling unattended scheduling.
6. Duplicate-post prevention, retry handling, token expiry handling, and alerting are validated.

The Meta Instagram use case has been added to the existing app, but Unified Login presented bundled ads, messaging, and comment permissions. Do not silently grant unrelated permissions merely to enable publishing.

## Deployment commands

From `tools/content-studio/cloudflare/` with authorized Cloudflare credentials:

```sh
npx wrangler d1 migrations apply moolresha_content_studio --remote
npx wrangler deploy
```

R2 is not enabled. GitHub Actions artifacts are not public Instagram media URLs. Do not enable billing or usage-based services without approval. Never commit Meta tokens, Cloudflare credentials, or other secrets.
