import { beforeEach, describe, expect, it } from 'vitest';
import { UTM_KEY, captureUtm, getStoredUtm, parseUtm, resetUtmMemory, safeSessionStorage } from '../../src/islands/utm';

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
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail } as unknown as Storage;
}

describe('parseUtm', () => {
  it('reads the three parameters', () => {
    expect(parseUtm('?utm_source=instagram&utm_medium=social&utm_campaign=journey-01')).toEqual({
      source: 'instagram',
      medium: 'social',
      campaign: 'journey-01',
    });
  });

  it('accepts a search string without the leading ?', () => {
    expect(parseUtm('utm_source=news')).toEqual({ source: 'news' });
  });

  it('lower-cases values', () => {
    expect(parseUtm('?utm_source=InstaGram&utm_medium=SOCIAL')).toEqual({ source: 'instagram', medium: 'social' });
  });

  it('drops values that fail the pattern instead of truncating them', () => {
    const long = 'a'.repeat(65);
    const result = parseUtm(`?utm_source=${long}&utm_medium=has%20space&utm_campaign=ok_1`);
    expect(result).toEqual({ campaign: 'ok_1' });
  });

  it('keeps a 64-character value and drops an empty one', () => {
    const edge = 'a'.repeat(64);
    expect(parseUtm(`?utm_source=${edge}&utm_medium=`)).toEqual({ source: edge });
  });

  it.each(['<script>', 'a/b', 'a b', 'क', "x'y", 'a;b'])('drops %s', (bad) => {
    expect(parseUtm(`?utm_source=${encodeURIComponent(bad)}`)).toEqual({});
  });

  it('keeps one valid value when another is invalid', () => {
    expect(parseUtm('?utm_source=ok&utm_medium=!!')).toEqual({ source: 'ok' });
  });

  it('ignores other parameters', () => {
    const result = parseUtm('?utm_term=shirt&utm_content=a&ref=x&utm_source=ok');
    expect(result).toEqual({ source: 'ok' });
    expect(Object.keys(result)).toEqual(['source']);
  });

  it('returns an empty object for an empty search', () => {
    expect(parseUtm('')).toEqual({});
  });
});

describe('captureUtm', () => {
  beforeEach(() => resetUtmMemory());

  it('stores valid values in sessionStorage', () => {
    const storage = memoryStorage();
    expect(captureUtm('?utm_source=ig', storage)).toEqual({ source: 'ig' });
    expect(JSON.parse(storage.getItem(UTM_KEY)!)).toEqual({ source: 'ig' });
  });

  it('keeps stored values on a later page view without UTM parameters', () => {
    const storage = memoryStorage();
    captureUtm('?utm_source=ig&utm_campaign=c1', storage);
    expect(captureUtm('', storage)).toEqual({ source: 'ig', campaign: 'c1' });
  });

  it('replaces stored values when the URL carries new ones', () => {
    const storage = memoryStorage();
    captureUtm('?utm_source=ig', storage);
    expect(captureUtm('?utm_source=mail', storage)).toEqual({ source: 'mail' });
  });

  it('ignores tampered stored data', () => {
    const storage = memoryStorage({ [UTM_KEY]: JSON.stringify({ source: '<b>', medium: 'ok', extra: 'x' }) });
    expect(getStoredUtm(storage)).toEqual({ medium: 'ok' });
  });

  it('ignores unparseable stored data', () => {
    expect(getStoredUtm(memoryStorage({ [UTM_KEY]: '{not json' }))).toEqual({});
  });

  it('falls back to memory when storage throws', () => {
    const storage = throwingStorage();
    expect(captureUtm('?utm_source=ig', storage)).toEqual({ source: 'ig' });
    expect(captureUtm('', storage)).toEqual({ source: 'ig' });
  });

  it('falls back to memory when storage is null', () => {
    expect(captureUtm('?utm_medium=social', null)).toEqual({ medium: 'social' });
    expect(captureUtm('', null)).toEqual({ medium: 'social' });
  });

  it('returns an empty object when nothing was ever captured', () => {
    expect(captureUtm('', memoryStorage())).toEqual({});
  });

  it('never writes document.cookie', () => {
    document.cookie = '';
    captureUtm('?utm_source=ig', memoryStorage());
    expect(document.cookie).toBe('');
  });
});

describe('safeSessionStorage', () => {
  it('returns a Storage when available', () => {
    expect(safeSessionStorage()).not.toBeNull();
  });

  it('returns null when accessing sessionStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(safeSessionStorage()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    }
  });
});
