# MoolResha — Rate Limiting & Abuse Protection for Open APIs

The site is static-first. The dynamic part is a handful of unauthenticated Cloudflare Pages Functions under `/api/`. Anyone on the internet can call them, so every one is rate limited, origin checked and validated before it stores anything.

This document describes what is implemented in `functions/_shared/rate-limit.ts`, `functions/_shared/identity.ts`, `functions/_shared/pipeline.ts` and `migrations/0001_init.sql`. The numbers marked `⚠️ confirm` are the design's proposals and still need an owner's sign-off. Change them only in `RATE_LIMITS` in `rate-limit.ts`; nothing else hard-codes them.

## 1. Scope and storage

| Route | Method | Rate limited | Notes |
|---|---|---|---|
| `/api/feedback` | POST | yes | Turnstile checked after the limit |
| `/api/frustration` | POST | yes | Turnstile checked after the limit |
| `/api/interest` | POST | yes | Turnstile checked after the limit. Also caps MailerLite calls |
| `/api/events` | POST | yes | No Turnstile (counts carry no personal data) |
| `/api/results` | GET | yes, on cache miss only | A cache hit never touches D1 |
| `/api/admin/export/*` | GET | yes, after authentication | Cloudflare Access JWT or bearer secret first |

Counters live in the D1 table `rate_limits`. KV is not used. A fixed-window counter writes once per request, and the Workers Free plan allows about 1,000 KV writes a day, which would cap the whole site. D1 Free allows about 100,000 rows written per day (`⚠️ confirm`: figure from design.md, re-verify on Cloudflare's pricing page at build time).

There is no like, subscribe or comment endpoint in the current build. The earlier design for those endpoints (KV counters, `POST /api/like`) is not implemented and has been removed from this document.

## 2. Layers, cheapest first

1. **Cloudflare edge.** Built-in DDoS protection, plus Bot Fight Mode and WAF rules configured in the dashboard. No code. `⚠️ confirm` which rules are switched on; the repo does not record this.
2. **Method, Origin, Content-Type and body-size checks** (`pipeline.ts`). Wrong method gives `405`, a missing or disallowed Origin gives `403 origin_not_allowed`, a non-JSON body gives `415`, an oversized body gives `413`. Allowed origins are `https://www.moolresha.com` and, when set, `PREVIEW_ORIGIN`.
3. **Rate limit** (this document). Runs before validation and Turnstile, so a flood costs one D1 write and no Turnstile `siteverify` call.
4. **Validation, then Turnstile, then the endpoint's own write.** Zod allow-list validation (`400`), Turnstile (`403 bot_check_failed`), then the D1 write.

Pipeline order for write endpoints: method, Origin, Content-Type, body size, **rate limit**, validation, Turnstile, store.

## 3. Identity

The limiter has no login to key on, so identity is an opaque hash (`identity.ts`):

```
dailySalt = HMAC-SHA-256( IDENTITY_SALT_SEED, "yyyy-mm-dd" in UTC )      (hex)
identity  = SHA-256( CF-Connecting-IP | User-Agent | dailySalt )        (hex)
key       = route + ":" + identity
```

- `CF-Connecting-IP` is set by Cloudflare. If a header is missing it is treated as an empty string.
- `IDENTITY_SALT_SEED` is a Cloudflare secret (see `.dev.vars.example` for local use). The salt changes at 00:00 UTC, so an identity cannot be linked from one day to the next.
- The raw IP and user agent are never stored or logged. Only the hash reaches the table.
- `IDENTITY_SALT_SEED` must be set. `⚠️ confirm` what the Workers runtime does with an empty HMAC key; the code does not guard against it. Any error here is caught by the pipeline and fails closed (section 6).

## 4. Algorithm: fixed window in D1

Each route has a limit (requests) and a window (seconds). Windows are aligned to the Unix epoch:

```
windowStart = now - (now mod windowSec)
```

For every request, one statement increments the counter and returns the new count (atomic per row):

```sql
INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?1, ?2, 1, ?3)
ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
RETURNING count;
```

`?3` is `windowStart + windowSec`. The k-th request in a window is allowed if and only if `k <= limit`. A denied request still increments the counter, so every request costs exactly one D1 write.

### Table (`migrations/0001_init.sql`)

```sql
CREATE TABLE rate_limits (
  key           TEXT NOT NULL,      -- route:identity-hash
  window_start  INTEGER NOT NULL,   -- unix seconds
  count         INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
CREATE INDEX idx_rate_limits_expiry ON rate_limits (expires_at);
```

### Cleanup

Pages has no cron, so expired rows are removed opportunistically. On about 1 request in 50 (`CLEANUP_ONE_IN = 50`), the limiter deletes up to 100 rows (`CLEANUP_BATCH = 100`) whose `expires_at` is before now. The batch is chosen through a sub-select on the primary key, served by `idx_rate_limits_expiry`. A failing cleanup is ignored and never fails the request. Expired rows are harmless; they only take space.

## 5. Limits

Per hashed identity, per route. All numbers are proposals (`⚠️ confirm`).

| Route | Limit | Window |
|---|---|---|
| `feedback` | 20 ⚠️ confirm | 10 min ⚠️ confirm |
| `frustration` | 5 ⚠️ confirm | 10 min ⚠️ confirm |
| `interest` | 3 ⚠️ confirm | 60 min ⚠️ confirm |
| `events` | 60 ⚠️ confirm | 10 min ⚠️ confirm |
| `results` | 30 ⚠️ confirm | 60 s ⚠️ confirm |
| `admin` | 30 ⚠️ confirm | 60 min ⚠️ confirm |

Reasoning for the starting values: `feedback` covers five Concepts plus a few edits each. `interest` is low because it also triggers a MailerLite call. `results` applies only on a cache miss, because the response is cached for five minutes. `admin` is checked only after authentication succeeds.

## 6. What happens on exceed or failure

| Situation | Response |
|---|---|
| Limit exceeded | `429`, body `{ "ok": false, "error": "rate_limited", "retryAfter": <seconds> }`, header `Retry-After: <seconds>` |
| Counter write or identity hashing fails (for example a D1 error) on a write endpoint or `events` | `503 storage_unavailable` (fails closed; nothing is stored) |
| Counter write or identity hashing fails on `/api/results` | `503 results_unavailable` |

`retryAfter` is `windowStart + windowSec - now`, rounded up and never below 1. No `X-RateLimit-*` headers are sent. The CORS and `Vary: Origin` headers are added to the 429 as to any other response. For admin exports, the 429 comes from `requireAdmin`; `⚠️ confirm` how an error from the admin counter write is surfaced, because that path was not checked.

## 7. Configuration

| Name | Kind | Used for |
|---|---|---|
| `DB` | D1 binding | `rate_limits` and all other tables |
| `IDENTITY_SALT_SEED` | secret | Daily identity salt |
| `PREVIEW_ORIGIN` | optional variable | Extra allowed Origin |

The full list of environment values is in `functions/_shared/env.ts` and `.dev.vars.example`. Secrets are Cloudflare secrets, never in Git (`.dev.vars` is gitignored).

## 8. Monitoring

- Structured logs (`functions/_shared/log.ts`) drop keys such as `email`, `phone`, `ip`, `ua`, `anonId`, `token` and `text`. Rate-limit failures are logged as `rate_limit_unavailable` with the route name only.
- Watch the Cloudflare dashboard for 429 and 503 spikes, and the D1 rows-written count against the free-tier cap. The launch checklist includes a free-tier re-check.

## 9. Tests

The limiter has an in-memory store (`createMemoryRateLimitStore`) with the same decisions as the D1 store, and `RateLimitOptions` lets tests inject limits and the cleanup random source. Run `npm test`.
