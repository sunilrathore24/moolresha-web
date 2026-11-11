import { describe, expect, it, vi } from "vitest";
import { ALLOWED_ORIGINS, checkOrigin } from "../../functions/_shared/origin";
import { clientIdentity, dailySalt } from "../../functions/_shared/identity";
import {
  errorResponse,
  json,
  preflightResponse,
  withCors,
  withErrorBoundary,
} from "../../functions/_shared/respond";
import { log, redact, sanitiseFields } from "../../functions/_shared/log";
import type { Env } from "../../functions/_shared/env";

const env = {
  IDENTITY_SALT_SEED: "test-seed-not-a-secret",
  PREVIEW_ORIGIN: "https://feature-x.moolresha-web.pages.dev",
} as unknown as Env & { PREVIEW_ORIGIN?: string };

const req = (headers: Record<string, string> = {}, method = "POST") =>
  new Request("https://www.moolresha.com/api/feedback", { method, headers });

describe("origin", () => {
  it("allows the apex, www and preview origins", () => {
    const set = ALLOWED_ORIGINS(env);
    expect(set.has("https://moolresha.com")).toBe(true);
    expect(set.has("https://www.moolresha.com")).toBe(true);
    expect(set.has("https://feature-x.moolresha-web.pages.dev")).toBe(true);
  });

  it("ignores an unset PREVIEW_ORIGIN, keeping just the apex and www", () => {
    const set = ALLOWED_ORIGINS({ IDENTITY_SALT_SEED: "x" } as unknown as Env);
    expect([...set]).toEqual(["https://moolresha.com", "https://www.moolresha.com"]);
  });

  it("returns null for the apex or the www origin", () => {
    expect(checkOrigin(req({ Origin: "https://moolresha.com" }), env)).toBeNull();
    expect(checkOrigin(req({ Origin: "https://www.moolresha.com" }), env)).toBeNull();
  });

  it("returns 403 origin_not_allowed for a missing, foreign or look-alike origin", async () => {
    for (const origin of [undefined, "https://evil.example", "https://www.moolresha.com.evil.example", "null"]) {
      const res = checkOrigin(req(origin ? { Origin: origin } : {}), env);
      expect(res?.status).toBe(403);
      expect(await res?.json()).toEqual({ ok: false, error: "origin_not_allowed" });
    }
  });
});

describe("identity", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const headers = { "CF-Connecting-IP": "203.0.113.7", "User-Agent": "UA/1.0" };

  it("returns a 64-char hex SHA-256 that does not contain the raw IP or UA", async () => {
    const id = await clientIdentity(req(headers), env, now);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain("203");
  });

  it("is stable within a UTC day and changes the next day", async () => {
    const a = await clientIdentity(req(headers), env, now);
    const b = await clientIdentity(req(headers), env, new Date("2026-11-02T23:59:59Z"));
    const c = await clientIdentity(req(headers), env, new Date("2026-11-03T00:00:00Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("differs by IP, user agent and seed", async () => {
    const base = await clientIdentity(req(headers), env, now);
    expect(await clientIdentity(req({ ...headers, "CF-Connecting-IP": "203.0.113.8" }), env, now)).not.toBe(base);
    expect(await clientIdentity(req({ ...headers, "User-Agent": "UA/2.0" }), env, now)).not.toBe(base);
    expect(await clientIdentity(req(headers), { IDENTITY_SALT_SEED: "other" }, now)).not.toBe(base);
  });

  it("derives the daily salt from the seed with HMAC-SHA-256", async () => {
    const salt = await dailySalt("seed", now);
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
    expect(salt).not.toBe(await dailySalt("seed2", now));
  });

  it("does not throw when headers are missing", async () => {
    expect(await clientIdentity(req(), env, now)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("respond", () => {
  it("json sets status, no-store, Vary: Origin and a JSON body", async () => {
    const res = json(200, { ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("json lets callers override Cache-Control and keeps Vary: Origin", () => {
    const res = json(200, {}, { "Cache-Control": "public, max-age=300", Vary: "Accept-Encoding" });
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });

  it("errorResponse builds the documented error body", async () => {
    const res = errorResponse(400, "invalid_request", { fields: { verdict: "required" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_request", fields: { verdict: "required" } });
  });

  it("errorResponse sets Retry-After (at least 1 s) on 429 and Allow on 405", async () => {
    const limited = errorResponse(429, "rate_limited", { retryAfter: 0 });
    expect(limited.headers.get("Retry-After")).toBe("1");
    expect(errorResponse(429, "rate_limited", { retryAfter: 42 }).headers.get("Retry-After")).toBe("42");
    expect(errorResponse(405, "method_not_allowed").headers.get("Allow")).toBe("POST");
  });

  it("withCors reflects only an allowed origin, never *, and keeps Vary: Origin", () => {
    const allowed = ALLOWED_ORIGINS(env);
    const ok = withCors(json(200, {}), req({ Origin: "https://www.moolresha.com" }), allowed);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://www.moolresha.com");
    expect(ok.headers.get("Vary")).toBe("Origin");
    const bad = withCors(json(200, {}), req({ Origin: "https://evil.example" }), allowed);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(bad.headers.get("Vary")).toBe("Origin");
  });

  it("answers preflight only for allowed origins", () => {
    const allowed = ALLOWED_ORIGINS(env);
    const ok = preflightResponse(req({ Origin: "https://www.moolresha.com" }, "OPTIONS"), allowed);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(ok.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(ok.headers.get("Vary")).toBe("Origin");
    expect(preflightResponse(req({ Origin: "https://evil.example" }, "OPTIONS"), allowed).status).toBe(403);
  });
});

describe("log", () => {
  it("redacts email, Indian mobile and IP-like values", () => {
    expect(redact("mail a.b+c@example.co.in now")).toBe("mail [redacted] now");
    expect(redact("call +91 98765 43210")).toBe("call [redacted]");
    expect(redact("call 9876543210 or 09876543210")).toBe("call [redacted] or [redacted]");
    expect(redact("from 203.0.113.7 ok")).toBe("from [redacted] ok");
    expect(redact("from 2001:db8::1 ok")).toBe("from [redacted] ok");
    expect(redact("2001:0db8:0000:0000:0000:ff00:0042:8329")).toBe("[redacted]");
  });

  it("leaves harmless values alone", () => {
    expect(redact("route=/api/feedback status=200 id=3f2b8c1e")).toBe("route=/api/feedback status=200 id=3f2b8c1e");
    expect(redact("12:30:45")).toBe("12:30:45");
    expect(redact("1700000000000")).toBe("1700000000000");
  });

  it("drops the forbidden keys in any casing or style", () => {
    const out = sanitiseFields({
      email: "a@b.co",
      phone: "9876543210",
      ip: "1.2.3.4",
      ua: "x",
      anonId: "id",
      anon_id: "id",
      Token: "t",
      text: "free text",
      route: "/api/feedback",
      status: 200,
      ok: true,
    });
    expect(out).toEqual({ route: "/api/feedback", status: 200, ok: true });
  });

  it("redacts personal-looking values under allowed keys", () => {
    const out = sanitiseFields({ note: "user a@b.co from 1.2.3.4", code: 9876543210 });
    expect(out).toEqual({ note: "user [redacted] from [redacted]", code: "[redacted]" });
  });

  it("log writes one JSON line without personal data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("test_event", { email: "a@b.co", detail: "ip 203.0.113.7", n: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(JSON.parse(line)).toEqual({ event: "test_event", detail: "ip [redacted]", n: 1 });
    expect(line).not.toContain("a@b.co");
    expect(line).not.toContain("203.0.113.7");
  });
});

describe("withErrorBoundary", () => {
  it("passes a normal response through", async () => {
    const handler = withErrorBoundary("feedback", async () => json(200, { ok: true }));
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
  });

  it("turns an exception into 500 internal_error and logs only route, class and request id", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = withErrorBoundary("feedback", async () => {
      throw new TypeError("secret detail a@b.co 203.0.113.7");
    });
    const res = await handler({ request: req() });
    const logged = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "internal_error" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const entry = JSON.parse(logged);
    expect(entry).toMatchObject({ event: "unhandled_error", route: "feedback", errorClass: "TypeError" });
    expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("X-Request-Id")).toBe(entry.requestId);
    expect(logged).not.toContain("secret detail");
    expect(logged).not.toContain("a@b.co");
  });
});
