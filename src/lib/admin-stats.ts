/**
 * Pure date-range, bucketing and trend helpers for the /admin dashboard
 * (functions/api/admin/stats.json.ts). No Astro, no D1 — just arithmetic over ISO 8601 UTC
 * timestamp strings, so this is plain, easily-reasoned-about TypeScript.
 */

/** Half-open UTC millisecond range: `fromMs` inclusive, `toMs` exclusive. */
export interface DateRange {
  fromMs: number;
  toMs: number;
}

const DAY_MS = 86_400_000;

/** Sentinel `weaveId` for a Concept that HAS weave variants (concept-weave-variants.ts) but
 * whose `weave` column wasn't tagged on this particular row — submitted before the weave field
 * existed, or the page's sync script didn't run. Kept as its own admin-dashboard row (never
 * silently folded into one weave or dropped) so every chart's totals still reconcile with the
 * Concept's real response count. Shared between the server (functions/api/admin/stats.json.ts)
 * and the client (src/islands/admin-dashboard.ts) so both agree on the one sentinel string. */
export const UNSPECIFIED_WEAVE = '__unspecified__';

/** `YYYY-MM-DD` (UTC) for a timestamp in ms. */
export function toDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Midnight UTC at the START of the given `YYYY-MM-DD` day, in ms. Invalid input throws. */
function dayStartMs(dateOnly: string): number {
  const ms = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid date "${dateOnly}"`);
  return ms;
}

/**
 * Resolves the dashboard's date range from optional `?from=&to=` query values (both
 * `YYYY-MM-DD`, inclusive on both ends from the caller's point of view). Falls back to the
 * last `days` days ending today (UTC) when either is missing or invalid — never throws.
 */
export function resolveRange(
  fromParam: string | null,
  toParam: string | null,
  nowMs: number,
  days = 30,
): DateRange {
  const todayStart = dayStartMs(toDateOnly(nowMs));
  const defaultTo = todayStart + DAY_MS; // end of "today", exclusive
  const defaultFrom = defaultTo - days * DAY_MS;

  let toMs = defaultTo;
  let fromMs = defaultFrom;
  try {
    if (toParam) toMs = dayStartMs(toParam) + DAY_MS;
    if (fromParam) fromMs = dayStartMs(fromParam);
  } catch {
    return { fromMs: defaultFrom, toMs: defaultTo };
  }
  if (!(fromMs < toMs)) return { fromMs: defaultFrom, toMs: defaultTo };
  return { fromMs, toMs };
}

/** The immediately-preceding range of the same length — for period-over-period trend %. */
export function previousRange(r: DateRange): DateRange {
  const length = r.toMs - r.fromMs;
  return { fromMs: r.fromMs - length, toMs: r.fromMs };
}

function parseMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function inRange(iso: string, r: DateRange): boolean {
  const ms = parseMs(iso);
  return Number.isFinite(ms) && ms >= r.fromMs && ms < r.toMs;
}

/** Timestamps (any ISO 8601 strings) that fall inside the range, from either end. */
export function filterInRange(timestamps: readonly string[], r: DateRange): string[] {
  return timestamps.filter((t) => inRange(t, r));
}

/** One `YYYY-MM-DD` entry per day in the range, ascending, both ends inclusive of real days. */
export function dailyBuckets(r: DateRange): string[] {
  const out: string[] = [];
  for (let ms = r.fromMs; ms < r.toMs; ms += DAY_MS) out.push(toDateOnly(ms));
  return out;
}

/** Count of `timestamps` landing on each day in `days` (same UTC-day bucketing as `dailyBuckets`). */
export function bucketByDay(timestamps: readonly string[], days: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of days) counts[d] = 0;
  for (const t of timestamps) {
    const ms = parseMs(t);
    if (!Number.isFinite(ms)) continue;
    const d = toDateOnly(ms);
    if (d in counts) counts[d] += 1;
  }
  return counts;
}

export interface Trend {
  current: number;
  previous: number;
  /** Percent change, rounded to 1 decimal. `null` when `previous` is 0 — a "vs 0" percent is
   * not a meaningful number (could be read as +∞%); the UI shows "New" instead in that case. */
  pct: number | null;
}

/** Period-over-period trend. `previous === 0 && current === 0` gives `pct: 0`, not `null` —
 * "no change" is meaningful there, unlike the "something from nothing" case. */
export function trend(current: number, previous: number): Trend {
  if (previous === 0) return { current, previous, pct: current === 0 ? 0 : null };
  return { current, previous, pct: Math.round(((current - previous) / previous) * 1000) / 10 };
}
