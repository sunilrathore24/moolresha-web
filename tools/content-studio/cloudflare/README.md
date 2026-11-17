# Cloudflare Free deployment

This directory is independent of the Astro storefront. Never modify the existing `moolresha-web` Pages project, its DNS, or `moolresha_feedback` D1.

## Provisioning

1. Create a new D1 database named `moolresha_content_studio` on the Free plan.
2. Replace `REPLACE_WITH_CONTENT_STUDIO_D1_ID` in `wrangler.toml` with its actual database ID.
3. Run `npx wrangler d1 migrations apply moolresha_content_studio --remote` from this directory after authentication.
4. Run `npx wrangler deploy` from this directory.

The Worker exposes only `GET /health` and creates idempotent pending jobs at 08:00, 13:00, and 19:00 IST. It **does not generate, render, host or publish media**. Publishing is disabled by both configuration flags and absence of publishing routes.

## Storage decision

R2 is intentionally not used. GitHub Actions artifacts cannot directly serve as public media URLs for Meta. An external public media delivery mechanism and retention/cleanup validation are required before enabling Instagram publishing. GitHub Actions has free-tier limits and may incur costs depending on repository visibility, account and usage. No paid plan is authorized.

## Security

Never commit Meta tokens, GitHub tokens, Wrangler API credentials or media containing private data. Restrict future admin APIs with authentication. Publishing activation requires a separate explicit owner approval.
