import type { Env } from "./env";

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** UTC calendar day, `yyyy-mm-dd`. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** dailySalt = HMAC-SHA-256(IDENTITY_SALT_SEED, yyyy-mm-dd UTC), hex. */
export async function dailySalt(seed: string, now: Date): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(utcDay(now))));
}

/**
 * Opaque client identity for rate limiting (docs/rate-limiting.md):
 * SHA-256( ip | ua | dailySalt ) as hex. ip = CF-Connecting-IP. The raw IP and user agent are
 * never stored or logged. The salt changes every UTC day, so identities cannot be linked across days.
 */
export async function clientIdentity(
  req: Request,
  env: Pick<Env, "IDENTITY_SALT_SEED">,
  now: Date,
): Promise<string> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  const ua = req.headers.get("User-Agent") ?? "";
  const salt = await dailySalt(env.IDENTITY_SALT_SEED, now);
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(`${ip}|${ua}|${salt}`)));
}
