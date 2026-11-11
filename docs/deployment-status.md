# Deployment status — read this first in a new session

Living reference for the production deployment of **moolresha-web**. Point a new Claude
session at this file to pick up where the last one left off. Update it whenever deployment
state changes; don't let it go stale.

Last updated: **2026-11-11**. Site is **live** at https://moolresha.com and https://www.moolresha.com.

## 1. Accounts and IDs

| What | Value |
|---|---|
| Cloudflare account | Sunilrathore24@gmail.com |
| Cloudflare account ID | `e4a25dcd3db6ca9606126d3469f59d16` |
| Domain registrar | GoDaddy (nameservers now point to Cloudflare) |
| Domain | `moolresha.com` — nameservers migrated, zone **Active** |
| Cloudflare Pages project | `moolresha-web`, connected to GitHub `sunilrathore24/moolresha-web`, production branch `main`, auto-deploys on push |
| Custom domains on the Pages project | `moolresha.com` **Active**, `www.moolresha.com` **Active** (both SSL enabled) |
| GitHub repo | `sunilrathore24/moolresha-web` |
| D1 database name | `moolresha_feedback` |
| D1 database ID | `33200dce-af1a-429e-acca-2bc273d4f9c7` (also in `wrangler.toml`'s `database_id`/`preview_database_id` — same DB used for both Production and Preview, no separate preview DB) |
| D1 binding name | `DB` (read by `functions/_shared/env.ts`) |
| Turnstile widget | name `moolresha-web`, mode Managed, hostnames: `moolresha.com`, `www.moolresha.com`, `moolresha-web.pages.dev`, `localhost` |
| Turnstile site key (public, safe to see in client JS) | `0x4AAAAAAF8W3qyYtT11wcKg` — stored in `wrangler.toml` under `[vars] PUBLIC_TURNSTILE_SITE_KEY` (committed; this is the *public* key, not the secret) |
| MailerLite group ID (`ML_GROUP_ID`) | `203818667685709436` ("Early access" group, double opt-in **on**) |
| MailerLite plan | Free (0 cost, no payment method on file — the "14-day trial" banner is just an upsell nag for premium features, not a paid trial) |

**Secrets** (actual values are *not* in this doc or in git — set as Cloudflare Pages
**Secrets**, Production + Preview, via Settings → Variables and secrets):
`TURNSTILE_SECRET`, `MAILERLITE_API_KEY`, `ADMIN_BEARER_SECRET`, `IDENTITY_SALT_SEED`. All four
are already set in both environments. If you need to rotate one, the Cloudflare dashboard only
lets secrets be edited one way — delete and re-add, you can't view the old value.

## 2. Architecture (why it's set up this way)

- **Classic Cloudflare Pages**, not a plain Worker. A `wrangler.toml` with `pages_build_output_dir`
  and `[[d1_databases]]` governs the project; `functions/*.ts` are Pages Functions (auto-routed by
  path). An earlier attempt accidentally created a plain **Workers** project instead (Cloudflare's
  unified "Create" flow defaults to Workers) — that project was deleted. If "Create → Pages" ever
  disappears from the dashboard again, look for "Need to use the legacy Pages workflow?" on the
  Workers creation screen.
- Build command `npm run build`, output directory `dist`. This runs the full gate: `content-check`,
  `js-budget`, `link-check`, `launch-gate` (the last one no-ops unless `PUBLIC_LAUNCH=true`, which
  is not set anywhere yet).
- `PUBLIC_TURNSTILE_SITE_KEY` must live in `wrangler.toml`'s `[vars]`, **not** the dashboard: once a
  project has a `wrangler.toml`, the dashboard's "Variables and secrets" panel only accepts
  Secret-typed entries.
- `functions/_shared/origin.ts` (`ALLOWED_ORIGINS`) and `functions/_shared/turnstile.ts`
  (`PRODUCTION_HOSTNAMES`) both allow **both** `moolresha.com` and `www.moolresha.com` — don't
  narrow this back to just one.

## 3. Two real production bugs found and fixed this session

Both were invisible locally (the unit tests use a better-sqlite3 stand-in for D1 that doesn't
share these two specific limits) and only showed up as `503 storage_unavailable` on
`POST /api/interest` in production. If `/api/feedback` or `/api/frustration` ever show the same
symptom, check for the same two classes of bug.

1. **D1 `batch()` cross-statement visibility.** `saveInterestWithConsents` used to insert the
   interest row and look up its id in a consent-row subquery, both in one `db.batch()`. The local
   test double treats a whole batch as one JS transaction (so a later statement always sees an
   earlier one's write); real D1 does not guarantee that. Fixed: the interest upsert now runs
   alone with `RETURNING id`, and the id comes back as a plain value — no subquery. See
   `functions/_shared/db.ts`'s `saveInterestWithConsents` and `functions/api/interest.ts`'s
   `insertSizeOnly` for the pattern; reuse it for any new write that needs an id for a follow-up
   insert.
2. **D1's SQLite rejects an over-complex GLOB.** `migrations/0001_init.sql`'s phone `CHECK`
   constraint used `phone GLOB '+91[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'` — nine
   repeated `[0-9]` groups. D1 throws `LIKE or GLOB pattern too complex: SQLITE_ERROR` on that
   exact pattern at runtime. Fixed with `length()`/`substr()`/`printf()`/`CAST()` instead of GLOB
   repetition (see the migration file). **If you ever add a new GLOB-based CHECK constraint, test
   it directly against the live D1 console first** — this class of bug will not show up locally.

Both fixes are committed (`migrations/0001_init.sql`, `functions/_shared/db.ts`,
`functions/api/interest.ts`) **and** already applied directly to the live database (the `interest`
and `consents` tables were dropped and recreated with the fixed schema, since they held no real
data yet at the time).

## 4. Content-check / launch readiness

`npm run build`'s `content-check` step (rule CC-02) blocks the build if a published page cites a
fact still marked `UNVERIFIED` or `verifyFlag: true`. This session:

- Independently re-verified 14 of 20 previously-flagged facts against their live primary sources
  (not search snippets) and corrected one real error (an unsupported "50.1%" figure).
- Left **6** facts deliberately unverified, allowed through via a narrow, named exception list —
  `src/content/config/word-rules.yaml`'s `launchExceptions` (read by `cc02` in
  `src/lib/content-rules/fact-rules.ts`). These 6: `journey-field`, `journey-ginning`,
  `journey-weaving`, `journey-processing`, `why-softness-easy-care` (generic process descriptions,
  no source attached yet), and `beyond-polyester-microfibre-shedding` (kept unverified on purpose —
  a single non-replicated study). **Remove an entry from `launchExceptions` once it has a real
  source**, matching the pattern of the already-verified facts' comments.
- `docs/launch-checklist.md`'s lawyer-review and per-Concept on-model-review dates are still
  unfilled — `PUBLIC_LAUNCH=true` will fail until a human fills those in. Not required for the
  current pre-launch "share your view" state the site is actually in.

## 5. What's done vs. still open

**Done:** domain live with SSL on apex + www, D1 created/migrated/bound, Turnstile and MailerLite
both wired end-to-end and verified working with a real submission, all 4 Pages secrets set, site
deployed and serving real traffic.

**Still open:**
- **Cloudflare Web Analytics** is not enabled yet (zone is still on the onboarding screen at
  Account → Web analytics → Add site). Cookieless, no code change needed, just a dashboard toggle.
- The 6 `launchExceptions` facts above still need real sources before they can be removed from
  that list.
- `docs/launch-checklist.md` review dates (blocks `PUBLIC_LAUNCH=true` only, not the current state).
- No PR was opened; all work has gone straight to `main` by request.

## 6. Quick commands

```bash
npm run build       # the exact command Cloudflare Pages runs
npm test             # full suite — expect only the pre-existing flaky property tests
                     # (market-scan.property.test.ts, fact-rendering.property.test.ts) and a
                     # stale-dist raster check (contrast-and-assets.test.ts) to fail
```

D1 console (for direct queries/fixes against production): Cloudflare dashboard → Storage &
databases → D1 SQLite Database → `moolresha_feedback` → Console tab. `wrangler` CLI is **not**
authenticated on this machine (`wrangler login` is blocked by the permission system without
explicit user action) — use the dashboard console instead.
