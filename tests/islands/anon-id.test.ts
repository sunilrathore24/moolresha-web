import { beforeEach, describe, expect, it } from 'vitest';
import { ANON_ID_KEY, UUID_V4, getAnonId, resetAnonIdMemory, safeLocalStorage } from '../../src/islands/anon-id';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return {
    get length() {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  } as unknown as Storage;
}

describe('getAnonId', () => {
  beforeEach(() => {
    resetAnonIdMemory();
    localStorage.clear();
  });

  it('creates a UUID v4 and stores it', () => {
    const storage = memoryStorage();
    const id = getAnonId(storage);
    expect(id).toMatch(UUID_V4);
    expect(storage.getItem(ANON_ID_KEY)).toBe(id);
  });

  it('returns the same ID across calls', () => {
    const storage = memoryStorage();
    const a = getAnonId(storage);
    const b = getAnonId(storage);
    expect(b).toBe(a);
  });

  it('reuses a valid stored ID', () => {
    const stored = '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13';
    expect(getAnonId(memoryStorage({ [ANON_ID_KEY]: stored }))).toBe(stored);
  });

  it.each([
    'not-a-uuid',
    '',
    '3f2b8c1e-9a4d-1b7e-8f21-6c0d5e4a9b13', // version 1
    '3F2B8C1E-9A4D-4B7E-8F21-6C0D5E4A9B13', // upper case
    '3f2b8c1e-9a4d-4b7e-cf21-6c0d5e4a9b13', // bad variant
  ])('replaces an invalid stored ID (%s)', (bad) => {
    const storage = memoryStorage({ [ANON_ID_KEY]: bad });
    const id = getAnonId(storage);
    expect(id).not.toBe(bad);
    expect(id).toMatch(UUID_V4);
    expect(storage.getItem(ANON_ID_KEY)).toBe(id);
  });

  it('keeps one in-memory ID when storage is null', () => {
    const a = getAnonId(null);
    expect(a).toMatch(UUID_V4);
    expect(getAnonId(null)).toBe(a);
  });

  it('keeps one in-memory ID when storage throws on read and write', () => {
    const storage = throwingStorage();
    const a = getAnonId(storage);
    expect(a).toMatch(UUID_V4);
    expect(getAnonId(storage)).toBe(a);
  });

  it('uses localStorage by default and survives repeat calls', () => {
    const a = getAnonId();
    expect(localStorage.getItem(ANON_ID_KEY)).toBe(a);
    expect(getAnonId()).toBe(a);
  });

  it('generates different IDs for different browsers', () => {
    const a = getAnonId(memoryStorage());
    resetAnonIdMemory();
    const b = getAnonId(memoryStorage());
    expect(a).not.toBe(b);
  });
});

describe('safeLocalStorage', () => {
  it('returns a Storage when available', () => {
    expect(safeLocalStorage()).not.toBeNull();
  });

  it('returns null when accessing localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(safeLocalStorage()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

describe('no cookies', () => {
  it('never writes document.cookie', () => {
    document.cookie = '';
    getAnonId(memoryStorage());
    expect(document.cookie).toBe('');
  });
});
