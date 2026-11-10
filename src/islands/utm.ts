/**
 * UTM capture. Reads utm_source, utm_medium and utm_campaign from the landing
 * URL, keeps only values that match the allow-list pattern after lower-casing
 * (invalid values are dropped, never truncated), and stores them in
 * sessionStorage for the visit. Requirements 18.2, 14.6.
 */

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
}

export const UTM_KEY = 'mr_utm';
export const UTM_VALUE = /^[a-z0-9._-]{1,64}$/;

const PARAMS = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
] as const;

/** Parses a query string (with or without the leading "?"). Ignores other parameters. */
export function parseUtm(search: string): Utm {
  const out: Utm = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return out;
  }
  for (const [param, key] of PARAMS) {
    const raw = params.get(param);
    if (raw === null) continue;
    const value = raw.toLowerCase();
    if (UTM_VALUE.test(value)) out[key] = value;
  }
  return out;
}

/** Returns sessionStorage, or null when the browser blocks access to it. */
export function safeSessionStorage(): Storage | null {
  try {
    const storage = globalThis.sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Re-validates stored data, so a tampered value cannot reach a request body. */
function sanitise(value: unknown): Utm {
  const out: Utm = {};
  if (typeof value !== 'object' || value === null) return out;
  const record = value as Record<string, unknown>;
  for (const [, key] of PARAMS) {
    const v = record[key];
    if (typeof v === 'string' && UTM_VALUE.test(v)) out[key] = v;
  }
  return out;
}

function isEmpty(utm: Utm): boolean {
  return utm.source === undefined && utm.medium === undefined && utm.campaign === undefined;
}

/** In-memory copy for the page's lifetime when sessionStorage is blocked. */
let memoryUtm: Utm = {};

/**
 * Captures UTM values for this visit. When the URL carries valid UTM values,
 * they replace what was stored. Otherwise the stored values for the visit are
 * kept. Returns the values to attach to requests.
 */
export function captureUtm(
  search: string = typeof location === 'undefined' ? '' : location.search,
  storage: Storage | null = safeSessionStorage(),
): Utm {
  const fromUrl = parseUtm(search);
  if (!isEmpty(fromUrl)) {
    memoryUtm = fromUrl;
    try {
      storage?.setItem(UTM_KEY, JSON.stringify(fromUrl));
    } catch {
      // Blocked or full. The in-memory copy still serves this page view.
    }
    return fromUrl;
  }
  return getStoredUtm(storage);
}

/** Returns the UTM values stored for this visit (possibly empty). */
export function getStoredUtm(storage: Storage | null = safeSessionStorage()): Utm {
  try {
    const raw = storage?.getItem(UTM_KEY);
    if (raw) {
      const stored = sanitise(JSON.parse(raw));
      if (!isEmpty(stored)) return stored;
    }
  } catch {
    // Unreadable storage or bad JSON: fall through to the in-memory copy.
  }
  return { ...memoryUtm };
}

/** Test helper: forget the in-memory copy. */
export function resetUtmMemory(): void {
  memoryUtm = {};
}
