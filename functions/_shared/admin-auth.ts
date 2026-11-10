/**
 * Admin authentication, rate limit and shared helpers for the CSV exports
 * (Requirements 17.1, 17.2; design.md, "GET /api/admin/export/...").
 *
 * Two ways in, either one is enough:
 *   1. `Cf-Access-Jwt-Assertion`: an RS256 JWT issued by Cloudflare Access. The signature is checked
 *      against the team's JWKS (`https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`) with Web Crypto,
 *      then `exp`, `nbf`, `aud` (= ACCESS_AUD) and `iss` (= https://<ACCESS_TEAM_DOMAIN>).
 *   2. `Authorization: Bearer <ADMIN_BEARER_SECRET>`, compared in constant time.
 *
 * No credentials at all -> 401. Credentials that do not check out -> 403.
 * The JWKS is fetched only through the injected `fetchImpl`; nothing here calls the network by itself.
 * Missing `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` switches the JWT path off (fails closed).
 */
import type { D1Like } from './db';
import type { Env } from './env';
import { clientIdentity } from './identity';
import { log } from './log';
import { createD1RateLimitStore, rateLimit, type RateLimitStore } from './rate-limit';
import { errorResponse, json } from './respond';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extra, optional env fields for the Access path. They are not in env.ts. */
export interface AccessEnv {
  /** Application Audience (AUD) tag of the Cloudflare Access application. */
  ACCESS_AUD?: string;
  /** Access team domain, for example `myteam.cloudflareaccess.com`. */
  ACCESS_TEAM_DOMAIN?: string;
}

export type AdminEnv = Env & AccessEnv;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface CachedJwks {
  keys: Map<string, { n: string; e: string }>;
  fetchedAt: number;
}
export type JwksCache = Map<string, CachedJwks>;

export interface AdminAuthDeps {
  /** The only way the JWKS is fetched. Runtime passes global fetch. */
  fetchImpl?: FetchLike;
  now?: () => Date;
  /** Test hook. Defaults to a module-level cache. */
  jwksCache?: JwksCache;
}

export interface AdminGuardDeps extends AdminAuthDeps {
  db?: D1Like;
  store?: RateLimitStore;
  /** Random source for the rate-limit cleanup draw. */
  random?: () => number;
}

export interface AdminExportDeps extends AdminGuardDeps {
  /** Rows per database page. Default `EXPORT_PAGE_SIZE`. */
  pageSize?: number;
}

export interface AdminExportContext {
  request: Request;
  env: AdminEnv;
}

export type AdminAuthResult =
  | { ok: true; method: 'access' | 'bearer' }
  | { ok: false; status: 401 | 403; reason: string };

export const EXPORT_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_REFETCH_MIN_MS = 60 * 1000;
const JWKS_TIMEOUT_MS = 5000;
const MAX_JWT_LENGTH = 8192;

const defaultCache: JwksCache = new Map();

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function b64urlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJsonObject(part: string): Record<string, unknown> {
  const value: unknown = JSON.parse(decoder.decode(b64urlToBytes(part)));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
  return value as Record<string, unknown>;
}

/** Constant-time string comparison: both sides are hashed first, so length does not leak either. */
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= (x[i] as number) ^ (y[i] as number);
  return diff === 0;
}

/** `myteam.cloudflareaccess.com` from a bare host or a URL. Null when it is not a plain host name. */
export function normaliseTeamDomain(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const host = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

// ---------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------

async function fetchJwks(domain: string, fetchImpl: FetchLike): Promise<Map<string, { n: string; e: string }>> {
  const init: RequestInit = { headers: { Accept: 'application/json' } };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(JWKS_TIMEOUT_MS);
  }
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`, init);
  if (!res.ok) throw new Error(`jwks status ${res.status}`);
  const body: unknown = await res.json();
  const list = (body as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(list)) throw new Error('jwks has no keys');
  const keys = new Map<string, { n: string; e: string }>();
  for (const k of list as Record<string, unknown>[]) {
    if (k && k.kty === 'RSA' && typeof k.kid === 'string' && typeof k.n === 'string' && typeof k.e === 'string') {
      keys.set(k.kid, { n: k.n, e: k.e });
    }
  }
  return keys;
}

async function findKey(
  domain: string,
  kid: string,
  fetchImpl: FetchLike,
  nowMs: number,
  cache: JwksCache,
): Promise<{ n: string; e: string } | null> {
  const cached = cache.get(domain);
  if (cached !== undefined) {
    const age = nowMs - cached.fetchedAt;
    const hit = cached.keys.get(kid);
    if (hit !== undefined && age < JWKS_TTL_MS) return hit;
    // Unknown kid: refetch (key rotation), but not more often than once a minute.
    if (hit === undefined && age >= 0 && age < JWKS_REFETCH_MIN_MS) return null;
  }
  const keys = await fetchJwks(domain, fetchImpl);
  cache.set(domain, { keys, fetchedAt: nowMs });
  return keys.get(kid) ?? null;
}

// ---------------------------------------------------------------------------
// Access JWT
// ---------------------------------------------------------------------------

export type JwtResult = { ok: true } | { ok: false; reason: string };

export async function verifyAccessJwt(
  token: string,
  env: AccessEnv,
  deps: AdminAuthDeps = {},
): Promise<JwtResult> {
  const aud = env.ACCESS_AUD?.trim();
  const domain = normaliseTeamDomain(env.ACCESS_TEAM_DOMAIN);
  if (!aud || domain === null) return { ok: false, reason: 'access_not_configured' };
  if (token.length > MAX_JWT_LENGTH) return { ok: false, reason: 'jwt_too_long' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'jwt_malformed' };
  const [h, p, s] = parts as [string, string, string];

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    header = parseJsonObject(h);
    payload = parseJsonObject(p);
    signature = b64urlToBytes(s);
  } catch {
    return { ok: false, reason: 'jwt_malformed' };
  }
  if (header.alg !== 'RS256') return { ok: false, reason: 'jwt_alg' };
  if (typeof header.kid !== 'string' || header.kid === '') return { ok: false, reason: 'jwt_kid' };

  const now = (deps.now ?? (() => new Date()))();
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const cache = deps.jwksCache ?? defaultCache;

  let jwk: { n: string; e: string } | null;
  try {
    jwk = await findKey(domain, header.kid, fetchImpl, now.getTime(), cache);
  } catch {
    return { ok: false, reason: 'jwks_unavailable' };
  }
  if (jwk === null) return { ok: false, reason: 'jwt_unknown_kid' };

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, encoder.encode(`${h}.${p}`));
  } catch {
    return { ok: false, reason: 'jwt_signature' };
  }
  if (!valid) return { ok: false, reason: 'jwt_signature' };

  const nowSec = Math.floor(now.getTime() / 1000);
  const { exp, nbf, iss } = payload;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return { ok: false, reason: 'jwt_no_exp' };
  if (nowSec >= exp) return { ok: false, reason: 'jwt_expired' };
  if (nbf !== undefined && (typeof nbf !== 'number' || !Number.isFinite(nbf) || nowSec < nbf)) {
    return { ok: false, reason: 'jwt_not_yet_valid' };
  }
  if (iss !== `https://${domain}`) return { ok: false, reason: 'jwt_issuer' };
  const tokenAud = payload.aud;
  const audOk = typeof tokenAud === 'string' ? tokenAud === aud : Array.isArray(tokenAud) && tokenAud.includes(aud);
  if (!audOk) return { ok: false, reason: 'jwt_audience' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function authenticateAdmin(
  request: Request,
  env: AdminEnv,
  deps: AdminAuthDeps = {},
): Promise<AdminAuthResult> {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion')?.trim() || null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization')?.trim() ?? '');
  const bearer = bearerMatch ? (bearerMatch[1] as string).trim() : null;

  if (jwt === null && bearer === null) return { ok: false, status: 401, reason: 'missing_credentials' };

  let reason = 'invalid_credentials';
  if (jwt !== null) {
    const r = await verifyAccessJwt(jwt, env, deps);
    if (r.ok) return { ok: true, method: 'access' };
    reason = r.reason;
  }
  if (bearer !== null) {
    const secret = env.ADMIN_BEARER_SECRET;
    // An unset secret never matches, even an empty bearer.
    const same = await timingSafeEqualStrings(bearer, secret ? secret : '\u0000unset');
    if (secret && same) return { ok: true, method: 'bearer' };
    if (jwt === null) reason = 'bad_bearer';
  }
  return { ok: false, status: 403, reason };
}

/**
 * Method check, authentication, then the `admin` rate limit (after auth, per rate-limit.ts).
 * Returns a Response to send back, or null when the request may proceed.
 */
export async function requireAdmin(
  request: Request,
  env: AdminEnv,
  deps: AdminGuardDeps = {},
): Promise<Response | null> {
  if (request.method !== 'GET') {
    return json(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET' });
  }
  const auth = await authenticateAdmin(request, env, deps);
  if (!auth.ok) {
    log('admin_auth_failed', { status: auth.status, reason: auth.reason });
    return json(
      auth.status,
      { ok: false, error: auth.status === 401 ? 'unauthorized' : 'forbidden' },
      auth.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined,
    );
  }

  const now = (deps.now ?? (() => new Date()))();
  const store = deps.store ?? createD1RateLimitStore(deps.db ?? (env.DB as unknown as D1Like));
  const identity = await clientIdentity(request, env, now);
  const decision = await rateLimit(store, 'admin', identity, Math.floor(now.getTime() / 1000), {
    random: deps.random,
  });
  if (!decision.allowed) return errorResponse(429, 'rate_limited', { retryAfter: decision.retryAfterSec });
  return null;
}

// ---------------------------------------------------------------------------
// CSV response
// ---------------------------------------------------------------------------

/** `YYYYMMDD` in UTC, for download file names. */
export function dateStamp(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
