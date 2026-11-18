# Instagram Business OAuth backend

Scope: only `tools/content-studio/`. The existing Astro storefront and feedback D1 must not be modified.

## Implemented on feature branch

- `src/worker.mjs`: `POST /auth/start`, `GET /auth/callback`, `POST /auth/complete`, and `GET /health`. All publishing routes remain unavailable. The existing three UTC cron schedules continue to enqueue pending jobs only.
- `src/instagram-auth.mjs`: token encryption using AES-256-GCM, state hashing, and Instagram account discovery using Meta Graph `/me/accounts`.
- `migrations/0002_instagram_auth.sql`: isolated D1 session and encrypted token tables.
- `automation/test/cloudflare-auth.test.mjs`: security regression tests.

**GitHub commit does not equal production deployment.** Do not start Meta OAuth before the migration, secret provisioning, deployment and tests below are completed.

## Production prerequisites

1. Confirm the Meta app `962195580000279` has the callback URL `https://moolresha-content-studio.sunilrathore24.workers.dev/auth/callback` registered in Facebook Login for Business settings (owner reported Meta validator accepted it).
2. Obtain the Meta app secret directly from the authenticated Meta dashboard. Never put it in GitHub, chat, logs or CLI history. Store it as Cloudflare Worker secret `META_APP_SECRET`.
3. Generate 32 cryptographically random bytes and base64-encode them. Store as Worker secret `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Keep a secure backup, because rotating it without re-encrypting existing tokens makes stored credentials unusable.
4. Generate a separate strong random setup key, store as Worker secret `INSTAGRAM_SETUP_KEY`. This key authenticates `POST /auth/start`. Never put it in a URL or commit it.
5. Optionally set `IG_EXPECTED_ACCOUNT_ID` to the intended Instagram Business account ID to prevent connecting the wrong Page when multiple are accessible. Without it, the flow refuses to connect if more than one eligible Page is returned.
6. From `tools/content-studio/cloudflare`, run `npx wrangler d1 migrations apply moolresha_content_studio --remote`, then `npx wrangler deploy` with authorized credentials. Preserve `CONTENT_DB` and all three cron triggers. Do not enable paid Cloudflare services.
7. Run `npm test` from `tools/content-studio/` and verify the deployed health and OAuth endpoints. Run a controlled OAuth test before treating the system as authorized.

## Authorization procedure

Call `POST https://moolresha-content-studio.sunilrathore24.workers.dev/auth/start` with header `Authorization: Bearer <INSTAGRAM_SETUP_KEY>` from an authorized terminal. The response contains a single-use Meta login URL expiring in 10 minutes. Do not publish the URL. Open it in the owner's browser and approve the intended business account. The callback removes the fragment from browser history, sends the token to same-origin `POST /auth/complete`, checks single-use state, validates token and scopes with Meta, discovers the Page and Instagram account, and stores the token encrypted in D1. No raw token is returned by the API.

Do not expose the setup key, token, or the login URL to untrusted parties. Browser DevTools and extensions with page access may still observe fragments, which is an inherent risk of Meta's documented implicit token flow. For a code-based OAuth flow, prefer it if supported by this specific Meta onboarding use case.

## Incomplete

- The implementation has **not yet been deployed or tested end to end**.
- OAuth account selection is intentionally fail-closed when multiple Pages are eligible; provide `IG_EXPECTED_ACCOUNT_ID` before retrying.
- No automatic token refresh, revocation management, job execution, public media hosting, carousel publishing, or Reel publishing is implemented in the Worker.
- Publishing remains disabled until end-to-end tests and verified intended account identity. Owner has approved activation, but no successful publication has been verified.
