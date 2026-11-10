/**
 * Anonymous_ID: a random UUID v4 (122 random bits from the browser CSPRNG),
 * kept in localStorage so the same browser reuses it until site storage is
 * cleared. It is not derived from any device or personal data, and it only
 * travels in POST bodies. Requirements 15.1, 15.2.
 */

export const ANON_ID_KEY = 'mr_anon_id';

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** ID kept for the page's lifetime when storage is blocked. */
let memoryId: string | null = null;

/** Returns localStorage, or null when the browser blocks access to it. */
export function safeLocalStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Returns the visitor's Anonymous_ID. Reuses a valid stored ID, replaces an
 * invalid one, and falls back to an in-memory ID when storage is missing or
 * throws.
 */
export function getAnonId(storage: Storage | null = safeLocalStorage()): string {
  let existing: string | null = null;
  try {
    existing = storage?.getItem(ANON_ID_KEY) ?? null;
  } catch {
    existing = null;
  }
  if (existing && UUID_V4.test(existing)) {
    memoryId = existing;
    return existing;
  }

  // Storage holds nothing usable. Prefer an ID we already made this page view,
  // so a blocked or failing store still gives one stable ID.
  const id = memoryId && UUID_V4.test(memoryId) ? memoryId : newId();
  memoryId = id;
  try {
    storage?.setItem(ANON_ID_KEY, id);
  } catch {
    // Storage is blocked or full. The in-memory copy keeps the ID stable.
  }
  return id;
}

/** Test helper: forget the in-memory ID. */
export function resetAnonIdMemory(): void {
  memoryId = null;
}
