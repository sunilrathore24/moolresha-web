# MoolResha — Rate Limiting & Abuse Protection for Open APIs

_The MoolResha site is static-first. Only three interactions are dynamic: **like**, **subscribe (newsletter)**, and **comment**. Each is an unauthenticated, network-exposed endpoint — so each MUST be rate-limited, bot-protected, and input-validated before it ships._

> **Security reality (stated plainly):** these endpoints have **no login**. Anyone on the internet can call them. Without the controls below they become spam, cost-abuse, and data-poisoning vectors. This doc is the required design for all of them.

---

## 0. Authentication policy — no login, tiered by action (DECIDED)

**Decision:** MoolResha does **not** require account login for like, subscribe, or comment. Auth is applied per action, matched to that action's value and abuse risk — because login is the single heaviest friction on the funnel, and the funnel's whole job in the discovery phase is to convert cold, anonymous visitors arriving from Instagram/Reels.

| Action | Auth requirement | Rationale |
|---|---|---|
| **Like** | **Anonymous.** No login, no Turnstile. | Must feel instant. Its purpose is a frictionless topic-preference signal; gating it behind login would kill ~all of the volume and destroy the signal. Abuse value is near-zero (cosmetic count), and idempotency + rate limits (§3.1) are enough. |
| **Subscribe** | **Email + double opt-in — this IS the identity step.** No separate login. | Newsletter signup via MailerLite's double opt-in already verifies an identity (the confirmed email). It's the owned-audience mechanic. Adding a login on top is redundant friction on the single most valuable conversion. |
| **Comment** | **Guest (name + comment) + Turnstile + honeypot + moderation queue now.** Optional social login later. | Comments are the real abuse surface (spam/XSS/harassment) but the lowest-volume action, so friction hurts engagement least here. Full account creation is overkill at launch; a moderation queue handles low early volume. |
| **Share** | **Not a server action.** | Sharing happens on the social platform / native share sheet — client-side only, nothing to authenticate or rate-limit. |

**Why not "login for everything":**
- It contradicts the funnel: the goal is an **owned email list**, not a pile of website accounts to store, secure, and run password resets for.
- Auth is the biggest security liability we could take on (password storage, breach risk, data-protection obligations, reset flows) — spent to protect the *lowest-value* action (likes).
- It delays the v1 launch bar (5–10 articles + working interactions) by a multi-week auth detour.

**The real tradeoff (honest):** anonymous = more volume, noisier signal, more spam exposure; login = less volume, cleaner signal, near-zero spam. For a trust-and-reach brand in the discovery phase, **volume + a clean opt-in email list wins** — quality is captured where it matters (the verified email), without taxing reach.

**Future option (documented, not built):** if comment spam outgrows the moderation queue, add **optional social login** (Google/GitHub via a managed provider such as Cloudflare Access, Auth.js, or Clerk's free tier) as a *convenience* — "comment as guest, or sign in to skip the name field" — never as a hard requirement. Re-evaluate only when spam volume justifies it. Likes and subscribe stay anonymous regardless.

---

## 0.1 Cost goal: stay on free tiers

Everything here is designed to run at **$0/month** at MoolResha's early scale:

| Service | Free tier (as of build; re-verify) | What we use it for |
|---|---|---|
| Cloudflare Pages | Unlimited static requests, 500 builds/mo | Hosting the static site |
| Cloudflare Pages Functions / Workers | ~100,000 requests/day | The 3 API endpoints |
| Cloudflare KV | ~100,000 reads/day, 1,000 writes/day, 1 GB | Like counts + rate-limit counters |
| Cloudflare D1 (SQLite) | 5 GB storage, 5M rows read/day | Comments (when built) |
| Cloudflare Turnstile | Unlimited, free | Bot/CAPTCHA check on subscribe + comment |
| MailerLite | 1,000 subscribers / 12,000 emails per mo | Newsletter double opt-in + sending |

> ⚠️ Free-tier limits change. Re-verify each provider's current limits at build time. The **KV 1,000 writes/day** limit is the tightest constraint — the like design below is built around it.

---

## 1. Defence in depth (four layers, cheapest first)

Requests pass through layers in order; each one is cheaper than the one after it, so we reject junk as early as possible.

```
1. Cloudflare edge (WAF + built-in DDoS)   ← free, blocks floods before our code runs
2. Turnstile token check                    ← free, blocks bots on write actions
3. Per-identity rate limit (KV counter)     ← our sliding/fixed window per IP+action
4. Application validation + idempotency      ← input schema, size caps, dedupe
```

### Layer 1 — Cloudflare edge (automatic, free)
- Cloudflare's network absorbs volumetric DDoS and offers WAF rules on the free plan.
- Turn on: **Bot Fight Mode** (free) and a couple of custom WAF rules (e.g. block obviously bad user-agents, block requests missing an `Origin`/`Referer` from our domain on POST).
- No code needed; configured in the Cloudflare dashboard.

### Layer 2 — Turnstile (free, on write actions only)
- **Subscribe** and **comment** forms embed a Cloudflare Turnstile widget (privacy-friendly, invisible/managed mode).
- The endpoint verifies the token server-side (`siteverify`) before doing anything.
- **Likes deliberately skip Turnstile** — a like must feel instant/frictionless; it relies on layers 1, 3, 4 instead.

### Layer 3 — Per-identity rate limiting (our code, KV-backed)
The core of this doc. See §2 for the algorithm and §3 for per-endpoint limits.

### Layer 4 — Application validation + idempotency
- Strict input schema (types, max lengths) — reject anything off-shape with `400`.
- Body size cap (e.g. reject `Content-Length` over a few KB for comments).
- Idempotency where it matters (a like is one-per-identity-per-article, not a counter you can spam — see §3.1).

---

## 2. The rate-limit algorithm (fixed-window counter in KV)

We use a **fixed-window counter** — the simplest algorithm that fits KV's model and free-tier write budget. (A sliding-window log is more precise but costs more writes; not worth it at our scale.)

### Identity key
We have no login, so "identity" = a best-effort composite, hashed (never store raw IP):

```
identity = SHA-256( clientIP + ":" + userAgent + ":" + dailySalt )
key      = "rl:" + action + ":" + identity + ":" + windowStart
```

- `clientIP` = `request.headers.get('CF-Connecting-IP')` (set by Cloudflare, hard to spoof at the edge).
- Hashing means we store **no PII** — just an opaque bucket id.
- `windowStart` = the current window bucket (e.g. `Math.floor(now / windowSeconds)`).

### Pseudocode (Cloudflare Pages Function / Worker)

```ts
// limitConfig: { limit: number, windowSeconds: number }
async function checkRateLimit(env, action, identity, cfg) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / cfg.windowSeconds);
  const key = `rl:${action}:${identity}:${windowStart}`;

  const current = parseInt((await env.RL.get(key)) ?? '0', 10);

  if (current >= cfg.limit) {
    const resetIn = (windowStart + 1) * cfg.windowSeconds - now;
    return { allowed: false, resetIn };            // caller returns HTTP 429
  }

  // increment; set TTL so the key auto-expires at window end (keeps KV clean)
  await env.RL.put(key, String(current + 1), { expirationTtl: cfg.windowSeconds });
  return { allowed: true, remaining: cfg.limit - current - 1 };
}
```

### The 429 response (be a good API citizen)
```
HTTP/1.1 429 Too Many Requests
Retry-After: <resetIn seconds>
Content-Type: application/json

{ "error": "rate_limited", "retryAfterSeconds": <resetIn> }
```
Also send informational headers on success:
```
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: <remaining>
```

### KV write-budget note (important)
KV free tier ≈ **1,000 writes/day**. Every rate-limit check that increments is a write, and every like is a write. Mitigations:
- **Count writes per action.** At early traffic this is fine; monitor it.
- If writes become the bottleneck, move counters to **Durable Objects** (still cheap) or **D1** (5M row reads/day, higher write ceiling), or batch/aggregate likes.
- Prefer **reject-early** (layers 1–2) so bot floods never reach the KV increment.

---

## 3. Per-endpoint limits

Tuned so a real human never hits them, but abuse is capped. All limits are per hashed identity unless noted.

### 3.1 `POST /api/like`  (like / unlike an article)
- **Turnstile:** no (must feel instant).
- **Rate limit:** `30 requests / 60 s` per identity (generous — covers rapid browsing), plus a **global per-article** guard of e.g. `600 writes / 60 s` to blunt a targeted inflation attack.
- **Idempotency (the real protection):** a like is **one-per-identity-per-article**, not a free counter. Store membership, not just a number:
  - Key `like:<slug>:<identity>` → `1` (with long TTL). If it exists, a second POST is a no-op (toggle off) — you cannot inflate the count by replaying.
  - The displayed count is a separate aggregate updated only on a real state change.
- **Validation:** `slug` must match a known published article (allowlist from the build), else `400`.
- **Abuse ceiling:** even if someone scripts thousands of identities, Turnstile-free means layer 1 (Bot Fight Mode) + the global per-article guard are the backstop; likes are low-value to attackers.

### 3.2 `POST /api/subscribe`  (newsletter signup)
- **Turnstile:** **yes, required** — verify token server-side first.
- **Rate limit:** `5 requests / 60 s` and `20 / day` per identity. Signing up more than a handful of times is never legitimate.
- **Validation:** RFC-ish email check + max length; reject disposable-domain patterns optionally.
- **Double opt-in:** hand the email to **MailerLite**, which sends the confirmation email. We **never** store the email ourselves — this offloads compliance, unsubscribe, and deliverability, and means a leak of our system exposes no subscriber list.
- **Idempotency:** MailerLite dedupes an already-subscribed address; we treat "already subscribed" as success (no enumeration signal).

### 3.3 `POST /api/comment`  (submit a comment)  — highest risk, ships last
- **Turnstile:** **yes, required.**
- **Rate limit:** `3 requests / 60 s`, `10 / hour`, `30 / day` per identity.
- **Validation:** max length (e.g. 1,500 chars), strip/escape HTML (store as plain text, render escaped — no stored XSS), require a known `slug`, optional name ≤ 60 chars.
- **Moderation queue (mandatory before launch):** comments land in a **pending** state in D1 and are **not shown publicly** until approved. No open, auto-published comments — ever.
- **Spam heuristics:** honeypot hidden field (bots fill it → silently drop), link-count cap, simple keyword/blocklist, and Turnstile score.

---

## 4. CORS & method hygiene (all endpoints)

- Accept **`POST` only** for write actions (`GET` for reading like counts). Reject other methods with `405`.
- **CORS:** allow only `https://www.moolresha.com` (and the Cloudflare preview domain during dev) as `Access-Control-Allow-Origin`. No `*` on write endpoints.
- Require the request `Origin` to match our domain on POST; reject cross-origin POSTs (blocks trivial CSRF/abuse from other sites).
- Never reflect user input in error messages. Generic errors only.

---

## 5. Secrets & config
- Turnstile secret, MailerLite API key → **Cloudflare secrets / environment variables** only. Never in Git (`.env` is gitignored; `.env.example` documents the names).
- KV namespace + D1 binding names live in `wrangler`/Pages config, not in code literals where avoidable.

---

## 6. Monitoring (so we notice abuse)
- Log (via GA4 custom events + Cloudflare analytics) the counts of `429`s, Turnstile failures, and comment-moderation rejects.
- A sudden spike in 429s or Turnstile failures = someone's probing; Cloudflare dashboard + WAF rules are the response surface.

---

## 7. Build order (matches SKILL.md §4 interaction phase)
1. **Likes** first — simplest, no Turnstile, exercises the KV rate-limit util (§2).
2. **Newsletter** — adds Turnstile + MailerLite; highest funnel value.
3. **Comments** — last; needs the moderation queue + full spam stack before it can go live.

Each reuses the same `checkRateLimit` util and the same CORS/validation helpers — write them once (`functions/_shared/`), share across all three.

---

## 8. Free-tier summary (the answer to "will everything be free?")

**Yes, at MoolResha's early scale — with one caveat.** Hosting, the API layer, bot protection, and analytics all sit comfortably in free tiers. The one number to watch is **Cloudflare KV's ~1,000 writes/day**: every like and every rate-limit increment is a write. If the site grows past that, the fix is cheap (Durable Objects / D1, or aggregate likes) — not a jump to a paid plan you'd feel. Newsletter stays free until **1,000 subscribers**, at which point you'll happily pay because the list is working.
