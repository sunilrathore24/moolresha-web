import type { Env } from "./env";
import { errorResponse } from "./respond";

/** `PREVIEW_ORIGIN` is an optional, non-secret var (for example https://<branch>.moolresha-web.pages.dev). */
export type OriginEnv = Env & { PREVIEW_ORIGIN?: string };

/**
 * The set of origins allowed to call write endpoints. Both the apex and `www` are listed:
 * the apex (`moolresha.com`) is the domain actually used everywhere else (DNS, Turnstile
 * hostnames, launch planning) and is the Cloudflare Pages custom domain; `www` is kept too
 * in case it is ever added as a second custom domain or redirect target.
 */
export const ALLOWED_ORIGINS = (env: OriginEnv): Set<string> =>
  new Set(
    ["https://moolresha.com", "https://www.moolresha.com", env.PREVIEW_ORIGIN].filter(
      (o): o is string => typeof o === "string" && o.length > 0,
    ),
  );

/** Returns a 403 `origin_not_allowed` response when the Origin header is missing or not allowed, else null. */
export function checkOrigin(req: Request, env: OriginEnv): Response | null {
  const origin = req.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS(env).has(origin)) return null;
  return errorResponse(403, "origin_not_allowed");
}
