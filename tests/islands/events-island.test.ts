import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBody } from '../../functions/_shared/schemas';
import { resetUtmMemory, UTM_KEY } from '../../src/islands/utm';

let initEvents: typeof import('../../src/islands/events-island').initEvents;

// The module starts itself on import. Stub the transports first so that run goes nowhere.
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  vi.stubGlobal('navigator', { ...navigator, sendBeacon: vi.fn(() => true) });
  ({ initEvents } = await import('../../src/islands/events-island'));
  vi.unstubAllGlobals();
});

let ioInstances: Array<{ cb: IntersectionObserverCallback; opts?: IntersectionObserverInit; observed: Element[] }> = [];

function stubIO() {
  ioInstances = [];
  class FakeIO {
    rec: (typeof ioInstances)[number];
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      this.rec = { cb, opts, observed: [] };
      ioInstances.push(this.rec);
    }
    observe(el: Element) {
      this.rec.observed.push(el);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeIO);
}

function see(doc: Document, section: string, ratio: number) {
  const target = doc.querySelector(`[data-section="${section}"]`) as Element;
  const io = ioInstances[0] as (typeof ioInstances)[number];
  io.cb(
    [{ target, isIntersecting: ratio > 0, intersectionRatio: ratio } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

const PAGE = `
<section data-section="hero"></section>
<section data-section="journey"></section>
<section data-section="money"></section>
<section data-section="concepts"></section>
<section data-section="interest"></section>
<footer><a id="j" href="/article/buying-a-linen-shirt">Journal</a><a id="o" href="/privacy">Privacy</a></footer>`;

let beacon: ReturnType<typeof vi.fn>;
const bodies = async (calls: unknown[][]) =>
  Promise.all(calls.map(async (c) => JSON.parse(await (c[1] as Blob).text())));

beforeEach(() => {
  stubIO();
  sessionStorage.clear();
  resetUtmMemory();
  beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
});
afterEach(() => vi.unstubAllGlobals());

describe('events island: page_view', () => {
  it('sends page_view once on init, as a JSON Blob via sendBeacon', async () => {
    const doc = makeDoc(PAGE);
    expect(initEvents(doc)).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('/api/events');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ event: 'page_view' });
  });

  it('is idempotent', () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    expect(initEvents(doc)).toBe(false);
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe('events island: section_reached', () => {
  it('uses a 50% threshold and observes only allowed sections', () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    expect(ioInstances[0]?.opts?.threshold).toBe(0.5);
    const names = ioInstances[0]?.observed.map((e) => (e as HTMLElement).dataset.section);
    expect(names).toEqual(['journey', 'money', 'concepts', 'interest']);
  });

  it('sends once per section, only when at least half visible', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    see(doc, 'journey', 0.3);
    expect(beacon).not.toHaveBeenCalled();
    see(doc, 'journey', 0.6);
    see(doc, 'journey', 1);
    see(doc, 'money', 0.5);
    expect(await bodies(beacon.mock.calls)).toEqual([
      { event: 'section_reached', section: 'journey' },
      { event: 'section_reached', section: 'money' },
    ]);
  });

  it('never sends a section outside the allow-list', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    see(doc, 'hero', 1);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('works without IntersectionObserver (page_view only)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const doc = makeDoc(PAGE);
    expect(() => initEvents(doc)).not.toThrow();
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe('events island: journal_click', () => {
  it('sends journal_click for /article/ links only', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    (doc.getElementById('o') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(beacon).not.toHaveBeenCalled();
    (doc.getElementById('j') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(await bodies(beacon.mock.calls)).toEqual([{ event: 'journal_click' }]);
  });
});

describe('events island: bodies and transport', () => {
  it('every body passes the strict EventBody schema and never holds an anonId', async () => {
    localStorage.setItem('mr_anon_id', 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
    const doc = makeDoc(PAGE);
    initEvents(doc);
    see(doc, 'concepts', 1);
    (doc.getElementById('j') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    const all = await bodies(beacon.mock.calls);
    expect(all).toHaveLength(3);
    for (const b of all) {
      expect(EventBody.safeParse(b).success).toBe(true);
      expect(JSON.stringify(b)).not.toContain('anonId');
      expect(JSON.stringify(b)).not.toContain('f47ac10b');
    }
  });

  it('attaches utm from captureUtm()', async () => {
    sessionStorage.setItem(UTM_KEY, JSON.stringify({ source: 'ig', campaign: 'launch' }));
    const doc = makeDoc(PAGE);
    initEvents(doc);
    const [body] = await bodies(beacon.mock.calls);
    expect(body).toEqual({ event: 'page_view', utm: { source: 'ig', campaign: 'launch' } });
    expect(EventBody.safeParse(body).success).toBe(true);
  });

  it('falls back to fetch with keepalive when sendBeacon is missing', () => {
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: undefined });
    const fetchImpl = vi.fn(async () => new Response('{}'));
    initEvents(makeDoc(PAGE), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/events');
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ event: 'page_view' });
  });

  it('falls back to fetch when sendBeacon refuses the payload', () => {
    beacon.mockReturnValue(false);
    const fetchImpl = vi.fn(async () => new Response('{}'));
    initEvents(makeDoc(PAGE), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('swallows every failure', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: () => {
        throw new Error('boom');
      },
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(() => initEvents(makeDoc(PAGE), { fetchImpl })).not.toThrow();
    await Promise.resolve();
  });
});
