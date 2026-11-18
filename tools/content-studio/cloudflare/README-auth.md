# Instagram authorization backend, staged implementation

This module is isolated to `tools/content-studio/cloudflare/` and does not touch the Astro storefront.

## Implemented in source

- `migrations/0002_instagram_auth.sql`: dedicated OAuth session and encrypted-token storage tables.
- `src/instagram-auth.mjs`: SHA-256 state hashing, AES-256-GCM encryption/decryption with a 32-byte random secret, and Meta `/me/accounts` Instagram Business account discovery without putting the token in the URL.

## Not yet implemented or deployed

The helper is **not wired into the Worker routes**. The deployed `/auth/callback` still fails closed. Do not initiate Meta OAuth yet. The migration has not been applied remotely. No access token has been obtained or stored. No Instagram publishing is active.

Before production: wire `/auth/start` and `/auth/callback` to single-use state verification and short-lived cookie; implement fragment capture with immediate history cleanup and same-origin secure POST; validate the Meta token and verify intended Page/Instagram account; store only encrypted token; add expiry/revocation handling and authenticated admin controls. Provision `INSTAGRAM_TOKEN_ENCRYPTION_KEY` using `wrangler secret put` only, with 32 random bytes base64-encoded, never in source. Apply migration and deploy, then test end to end. Implement and validate media rendering/hosting before publishing.

Do not silently enable paid Cloudflare services, modify storefront resources, or turn on publishing flags before successful testing.
