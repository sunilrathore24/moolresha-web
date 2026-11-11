import type { Env } from './env';

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 5000;

/**
 * Production hostnames. Both the apex (the actual Cloudflare Pages custom domain) and
 * `www` are listed, matching origin.ts and the Turnstile widget's configured hostnames.
 * Preview hostnames come from env.PREVIEW_ORIGIN.
 */
export const PRODUCTION_HOSTNAMES: readonly string[] = ['moolresha.com', 'www.moolresha.com'];

/**
 * The Turnstile verifier needs the secret, plus the optional preview origin
 * that origin.ts also reads. `Env` (env.ts) does not declare PREVIEW_ORIGIN yet.
 */
export type TurnstileEnv = Pick<Env, 'TURNSTILE_SECRET'> & { PREVIEW_ORIGIN?: string };

export interface TurnstileResult {
  ok: boolean;
  codes: string[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function allowedHostnames(env: Pick<TurnstileEnv, 'PREVIEW_ORIGIN'>): Set<string> {
  const hosts = new Set(PRODUCTION_HOSTNAMES.map((h) => h.toLowerCase()));
  if (env.PREVIEW_ORIGIN) {
    try {
      hosts.add(new URL(env.PREVIEW_ORIGIN).hostname.toLowerCase());
    } catch {
      // A malformed preview origin adds nothing.
    }
  }
  return hosts;
}

/** Logs only the event name and a status. Never the token, IP, or response body. */
function logUnavailable(reason: string, status?: number): void {
  const fields: Record<string, string | number> = { event: 'turnstile_unavailable', reason };
  if (status !== undefined) fields.status = status;
  console.warn(JSON.stringify(fields));
}

/**
 * Verifies a Turnstile token server-side.
 * Network failure, timeout, non-200 and hostname mismatch all count as failure.
 * Infrastructure failures are logged as `turnstile_unavailable` so they can be
 * told apart from a bot.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
  env: TurnstileEnv,
  fetchImpl: FetchLike = fetch,
): Promise<TurnstileResult> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, codes: ['missing-input-response'] };
  }

  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
  } catch {
    logUnavailable('network_error');
    return { ok: false, codes: ['turnstile_unavailable'] };
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== 200) {
    logUnavailable('non_200', response.status);
    return { ok: false, codes: ['turnstile_unavailable'] };
  }

  let data: { success?: unknown; hostname?: unknown; 'error-codes'?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    logUnavailable('bad_body', response.status);
    return { ok: false, codes: ['turnstile_unavailable'] };
  }

  const codes = Array.isArray(data['error-codes'])
    ? (data['error-codes'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  if (data.success !== true) {
    return { ok: false, codes };
  }

  const hostname = typeof data.hostname === 'string' ? data.hostname.toLowerCase() : '';
  if (!allowedHostnames(env).has(hostname)) {
    return { ok: false, codes: ['hostname_mismatch'] };
  }

  return { ok: true, codes };
}
