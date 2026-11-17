# MoolResha isolated production Worker (deployment candidate)

This is an independent Cloudflare Worker with its own D1 database and R2 bucket. It does not change the Astro storefront or reuse its database. **Not deployed, and not production validated.** Instagram publishing defaults to off.

## Provision

1. In Cloudflare create a **new** D1 database `moolresha-content-studio` and R2 bucket `moolresha-content-media`. Do not reuse the website's database.
2. Copy `wrangler.example.toml` to `wrangler.toml`, replace the D1 database ID, and configure a custom domain `studio.moolresha.com` for this Worker in Cloudflare. The example config disables workers.dev and assumes that custom domain exists.
3. Run `npm install` from this directory. Execute `npx wrangler d1 execute moolresha-content-studio --remote --file=./schema.sql`.
4. Configure four secrets with `npx wrangler secret put NAME`: `STUDIO_ADMIN_SECRET` (random high-entropy value), `STUDIO_ENCRYPTION_SECRET` (separate random 32+ character secret), `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`. Never commit values.
5. Set `STUDIO_ORIGIN` and `INSTAGRAM_REDIRECT_URI` in Wrangler to your exact HTTPS custom domain. Deploy with `npm run deploy`. Keep `ENABLE_INSTAGRAM_PUBLISH = "false"` until acceptance tests complete.
6. Open `https://studio.moolresha.com/setup`. Enter the studio admin secret and authorize your own Instagram Business account. The callback exchanges the code, encrypts the access token with AES-GCM and saves it in the isolated D1 database.
7. Check the connection using `curl -H "Authorization: Bearer $STUDIO_ADMIN_SECRET" https://studio.moolresha.com/account`. This response intentionally never exposes tokens.

## Meta setup

Use Meta for Developers > create a Business app > add **Instagram API with Instagram Login**. Configure exact redirect URL `https://studio.moolresha.com/auth/callback` and requested permissions `instagram_business_basic` and `instagram_business_content_publish`. Ensure the Instagram Business account is eligible and included in app roles/testing as required. This is **not** the Facebook Login integration. Do not mix Graph hosts or permission models. For accounts outside app roles, Meta may require advanced access and app review.

## API (bearer-protected)

- `POST /drafts`: JSON `{kind:"carousel",title:"...",caption:"...",slides:["...","...","...","...","...","..."],sources:[]}`
- `GET /drafts`, `GET /drafts/:id`, `PUT /drafts/:id`
- `POST /media`: binary image/jpeg, image/png or video/mp4 (up to 30 MB), returns a public HTTPS URL.
- `PUT /drafts/:id/manifest`: `{images:["https://studio.moolresha.com/media/...jpg",...]}` or `{videoUrl:"https://studio.moolresha.com/media/...mp4"}`
- `POST /drafts/:id/approve`: human approval required
- `POST /drafts/:id/schedule`: `{scheduledAt:"2026-11-20T02:30:00Z"}`
- `GET /drafts/:id/events`: publishing audit trail

Do not expose the admin bearer secret to public website scripts or logs. For multi-user production use, replace bearer-based admin UI with Cloudflare Access and role-based authorization.

## Scheduling

Cloudflare Cron Triggers run at 02:30, 07:30 and 13:30 UTC, corresponding to 08:00, 13:00 and 19:00 IST. The Worker publishes **only** pre-approved, pre-scheduled, media-ready drafts, and only when the explicit feature flag is enabled. Cron does **not** generate AI drafts or render videos. Publishing attempts atomically claim a draft; uncertain Meta responses must be reconciled manually to avoid duplicate posts.

## Remaining production acceptance gates

- Meta app configured, account authorized and long-lived token lifecycle tested (refresh/reconnect before expiry).
- Confirm Meta API version, endpoint compatibility and permissions against live Meta app; current adapter has no successful live integration test.
- JPEG conversion and MP4 rendering performed by a separate trusted renderer with FFmpeg, fonts and asset licensing verified.
- Media accessibility verified externally and MIME/codec requirements checked against Meta.
- Add robust upload validation (file signatures, video codecs, limits, media retention and rate limits).
- Add publishing reconciliation for processing-pending and uncertain publish outcomes; do not auto-retry ambiguous attempts.
- Add monitoring, alerting, token expiry checks, editorial fact-checking, and a production-ready authenticated review UI.
- Review security posture of /setup, bearer-based API and public media URLs before production deployment.

## Removal

Delete `tools/content-studio/`, delete the dedicated Worker and its cron triggers, and delete the **separate** Content Studio D1 database and R2 bucket. The Astro storefront remains untouched.
