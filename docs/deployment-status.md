# Deployment status — read this first in a new session

Living reference for the production deployment of **moolresha-web**. Point a new Claude
session at this file to pick up where the last one left off. Update it whenever deployment
state changes; don't let it go stale.

Last updated: **2026-11-14**. Site is **live** at https://moolresha.com and https://www.moolresha.com.

## ✅ `0002_feedback_comment.sql` through `0004_feedback_email.sql` applied to production

All three run the same way (wrangler still isn't authenticated on this machine, so the Cloudflare
dashboard's D1 Console tab was used instead of `wrangler d1 migrations apply`), each verified
with "This query successfully executed" followed by `PRAGMA table_info(...)` showing the new
column(s):

- `0002_feedback_comment.sql` (2026-11-12) — adds `comment_text`, the feedback form's "Any
  other thoughts?" field.
- `0003_feedback_weave.sql` (2026-11-13) — adds `weave`, which weave (Micro-Dobby / Cotton
  Slub) a feedback submission on mens-cotton-shirt was looking at.
- `0004_feedback_email.sql` (2026-11-14) — adds `email` to both `concept_feedback` and
  `frustration`: an optional "want us to follow up about this?" email, with its own consent
  checkbox (functions/_shared/schemas.ts's `requireEmailConsent`), used for (1) admin follow-up
  (the `/admin` dashboard's new "Contacts" table, `functions/_shared/db.ts`'s
  `feedbackContactsWithEmail`/`frustrationContactsWithEmail`) and (2) cross-device
  deduplication — a second submission with the same email, for the same Concept, updates that
  existing row instead of creating a new one (`findFeedbackAnonIdByEmail`/
  `findFrustrationAnonIdByEmail`). Deliberately kept OUT of `exportFeedbackRows`/
  `exportFeedbackRowsPaged` and the public feedback CSV (Req 17.3's "no email or phone" stays
  intact for that path) — the two new `*ContactsWithEmail` functions are a separate, admin-only
  query path. Privacy notice bumped 0.2 → 0.3 (`src/content/config/privacy.yaml`) for the new
  `feedback-contact-email` disclosure.

No further action needed for any of the three. When adding a future migration, follow the same
pattern: run it against production via the dashboard console *before* the deploy that needs it,
verify with `PRAGMA table_info`, then update this section (or mark the new one done) so this file
doesn't linger as a stale alarm.

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

## 7. WhatsApp confirmation on the Interest form — code ready, waiting on Meta credentials

**What exists now:** when someone submits the **Interest form** (`InterestForm.astro` → `/api/interest`
— *not* the anonymous concept-feedback form, which deliberately has no contact fields) with an
email, MailerLite's double opt-in already sends a free confirmation email automatically. That part
needed no new code.

**New this session, not yet live:** a parallel WhatsApp confirmation, sent via Meta's free
WhatsApp Business Cloud API when a phone number is given with consent. Code is written and tested,
but **inert in production** until the Meta-side setup is done and its 3 secrets are set — until
then `sendWhatsappConfirmation` returns `not_configured` and no network call is made.

- `functions/_shared/whatsapp.ts` — the Cloud API client (`POST .../messages`, template-based),
  mirrors `mailerlite.ts`'s best-effort shape exactly: never throws, never fails the visitor's
  request, status feeds `whatsappConfirmation: 'sent' | 'delayed' | 'skipped'` in the response.
- `functions/api/interest.ts` — wired in next to the existing MailerLite call (`storeInterest`).
- `functions/_shared/env.ts` — added 3 **optional** vars: `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`. Unset = feature off.
- Consent copy updated to disclose the automatic message (previously it only said the number was
  "stored... for manual updates"): `InterestForm.astro`'s WhatsApp checkbox label,
  `src/lib/interest-notice.ts`'s processors line, and `privacy.yaml` (new "Meta (WhatsApp Business
  Platform)" processor entry, updated `contact-whatsapp` data item, updated deletion-procedure
  text). **`privacy.yaml#version` bumped `0.1` → `0.2`** (and `src/lib/notice-version.ts` to
  match) because the disclosure changed — anyone who already consented is recorded against `0.1`.
- `tests/unit/whatsapp.test.ts` (new) and `tests/unit/api-interest.test.ts` (extended) cover it.
  `npm test` and `npm run build` both pass clean (only the 3 pre-existing flaky/stale failures
  noted in §6 remain).
- There is deliberately **no `wa_sync` D1 column / retry path yet** (unlike MailerLite's
  `ml_sync`) — a failed send is only logged, not retried. Add one later (mirroring
  `saveInterestWithConsents` + `setInterestMlSync`) if delivery reliability becomes a concern.

**Progress as of this push:**
1. ✅ Meta app created, WhatsApp product added, free **test phone number** obtained
   (`+1 555-173-6513`, Phone Number ID `1425348240664160` — committed to `wrangler.toml`'s
   `[vars]` as `WHATSAPP_PHONE_NUMBER_ID`, since it's an identifier, not a secret).
2. ✅ Payment method added to the Meta account (required by Meta for any business-initiated
   message, regardless of whether you stay under the free monthly allowance — **the confirmation
   message itself is a business-initiated "utility" send, which Meta's own account screen states
   is NOT covered by the 1,000-free-messages allowance; that allowance only covers replies sent
   after a user messages first**. So each confirmation send likely costs a small real amount —
   the user chose to accept that rather than add the extra complexity of a "user messages us
   first" redesign. If this ever needs revisiting, see this session's chat log for the "tap a
   WhatsApp link to open a free reply window" alternative that was scoped but not built.)
3. ✅ Permanent access token generated and set as the Cloudflare secret `WHATSAPP_ACCESS_TOKEN`
   (Production + Preview) — never committed to the repo.
4. ⬜ **Template still pending** — a Utility-category template was being created in WhatsApp
   Manager (body text drafted in this session's chat log, includes a `https://moolresha.com` link
   and a "Visit Moolresha" website button) but its exact **name** was never given back, and
   `WHATSAPP_TEMPLATE_NAME` is not yet set anywhere. **Until that's set, `sendWhatsappConfirmation`
   stays `not_configured` (silent no-op) even though the other two values are now live.** Get the
   approved template's exact name from the user, add it to `wrangler.toml`'s `[vars]` next to
   `WHATSAPP_PHONE_NUMBER_ID`, then a real send can be tested.
5. ⬜ For real (non-test) traffic later: a dedicated phone number not currently active on
   WhatsApp/WhatsApp Business consumer apps, plus full Meta Business verification — then swap
   `WHATSAPP_PHONE_NUMBER_ID`, no code change.

**Separately, email sender branding (not part of the WhatsApp work, but done the same session):**
- MailerLite sending-domain authentication for `moolresha.com` was in progress (DKIM/SPF/verification
  records being added in Cloudflare DNS) — check it completed.
- Cloudflare Email Routing was set up: `support@moolresha.com` → forwards to the user's personal inbox.
- **Still open, deliberately deferred:** replying *as* `support@moolresha.com` from the personal
  inbox doesn't work via Email Routing alone (it only forwards inbound mail, there's no outbound
  SMTP relay behind it) — Gmail's "Send mail as" needs either real SMTP credentials from an actual
  mailbox (e.g. Zoho Mail's free tier) or accepting a "via gmail.com" tag from using Gmail's own
  servers unauthenticated for that domain. User chose to park this for later; for now, replies to
  `support@` go out from the personal address as-is, which still works, just isn't branded.
- **Still open:** the "congratulations, you're subscribed" welcome email (the email equivalent of
  the WhatsApp confirmation) is not configured yet — needs a MailerLite **Automation**
  (trigger: subscriber joins/confirms the group → action: send the welcome email). Only the
  double-opt-in *confirmation request* email exists today (unchanged, already live from before
  this session).

This push **does** go live on `main` (auto-deploys) at the user's explicit request. The WhatsApp
send itself remains inert (`not_configured`) until the template name above is filled in.

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
