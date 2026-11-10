import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bandLabelFromId,
  CONCEPT_NAMES,
  initResults,
  joinTied,
  MSG_NOT_ENOUGH,
  MSG_RESULTS_UNAVAILABLE,
} from '../../src/islands/results-island';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';

const HTML = `<section data-section="results">
  <div data-results-root><p>Results load here.</p></div>
  <p role="status" data-live-region></p>
</section>`;

function ok(results: unknown[], extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, computedAt: '2026-11-02T10:00:00.000Z', results, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const notEnough = (conceptId: string, responses = 3) => ({ conceptId, responses, enough: false });
const enough = (conceptId: string, over: Record<string, unknown> = {}) => ({
  conceptId,
  responses: 40,
  enough: true,
  verdicts: { would_wear: 50, maybe: 30, not_for_me: 20 },
  leadingColour: 'clay',
  topPriceBandId: 'mcs-1500-1999',
  priceAnswers: 30,
  priceSkips: 10,
  topPriorities: ['softness'],
  ...over,
});

let observers: Array<{ cb: IntersectionObserverCallback; opts?: IntersectionObserverInit; observed: Element[] }> = [];

function stubIO() {
  observers = [];
  class FakeIO {
    entry: (typeof observers)[number];
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      this.entry = { cb, opts, observed: [] };
      observers.push(this.entry);
    }
    observe(el: Element) {
      this.entry.observed.push(el);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeIO);
}

function reveal() {
  const o = observers[0] as (typeof observers)[number];
  o.cb([{ isIntersecting: true, target: o.observed[0] } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
}

function mount(response: Response | (() => Promise<Response>)) {
  document.body.innerHTML = HTML;
  const root = document.querySelector('[data-results-root]') as HTMLElement;
  const live = document.querySelector('[data-live-region]') as HTMLElement;
  const fetchImpl = vi.fn(typeof response === 'function' ? response : async () => response);
  initResults(root, { fetchImpl });
  return { root, live, fetchImpl };
}

beforeEach(() => stubIO());
afterEach(() => vi.unstubAllGlobals());

describe('results island: loading', () => {
  it('waits for the section to scroll near the viewport (200 px margin)', async () => {
    const { root, fetchImpl } = mount(ok([]));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(observers[0]?.opts?.rootMargin).toBe('200px 0px');
    expect(observers[0]?.observed[0]).toBe(root);
    reveal();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe('/api/results');
  });

  it('fetches once even if the observer fires twice', async () => {
    const { fetchImpl } = mount(ok([notEnough('mens-cotton-shirt')]));
    reveal();
    reveal();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });

  it('fetches at once when IntersectionObserver is missing', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { fetchImpl } = mount(ok([]));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });

  it('is idempotent', () => {
    const { root } = mount(ok([]));
    expect(initResults(root)).toBe(false);
  });
});

describe('results island: rendering', () => {
  it('renders an enough Concept as text with percentages, colour, priorities and band', async () => {
    const { root, live } = mount(ok([enough('mens-cotton-shirt'), ...CONCEPT_IDS.slice(1).map((c) => notEnough(c))]));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain("Men's cotton shirt"));
    const text = root.textContent ?? '';
    expect(text).toContain('40 responses');
    expect(text).toContain('Would wear 50%, Maybe 30%, Not for me 20%');
    expect(text).toContain('Clay');
    expect(text).toContain('What matters most: Softness');
    expect(text).toContain('₹1,500–1,999');
    expect(text).toContain('Total responses: 52');
    expect(text).toContain('Last updated:');
    expect(live.textContent).toBe('');
  });

  it('shows "Not enough responses yet" and no percentage for a Concept below the threshold', async () => {
    const { root } = mount(ok(CONCEPT_IDS.map((c) => notEnough(c, 4))));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain(MSG_NOT_ENOUGH));
    expect(root.textContent).not.toContain('%');
    expect(root.textContent).toContain('4 responses');
    expect(root.querySelectorAll('.result-pending')).toHaveLength(5);
  });

  it('ignores any percentages sent for a not-enough Concept', async () => {
    const leaky = { ...notEnough('mens-cotton-shirt'), verdicts: { would_wear: 100, maybe: 0, not_for_me: 0 } };
    const { root } = mount(ok([leaky]));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain(MSG_NOT_ENOUGH));
    expect(root.textContent).not.toContain('%');
  });

  it('writes tied priorities as "A and B (tied)" and "A, B, C (tied)"', async () => {
    const { root } = mount(
      ok([
        enough('mens-cotton-shirt', { topPriorities: ['softness', 'easy_care'] }),
        enough('mens-linen-shirt', { topPriorities: ['softness', 'breathability', 'long_life'] }),
      ]),
    );
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain('(tied)'));
    expect(root.textContent).toContain('What matters most: Softness and Easy care (tied)');
    expect(root.textContent).toContain('What matters most: Softness, Breathability, Long life (tied)');
  });

  it('omits the priorities line when topPriorities is empty', async () => {
    const { root } = mount(ok([enough('mens-cotton-shirt', { topPriorities: [] })]));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain('Would wear'));
    expect(root.textContent).not.toContain('What matters most');
  });

  it('omits the band line for an unrecognised band id', async () => {
    const { root } = mount(ok([enough('mens-cotton-shirt', { topPriceBandId: '<b>x</b>' })]));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain('Would wear'));
    expect(root.textContent).not.toContain('price band');
  });

  it('builds only text nodes: hostile strings never become elements', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const row = enough('mens-cotton-shirt', {
      topPriorities: [hostile, 'softness'],
      leadingColour: hostile,
      verdicts: { would_wear: hostile, maybe: 1, not_for_me: 1 },
    });
    const rows = [
      row,
      { conceptId: hostile, responses: 99, enough: true },
      enough('mens-linen-shirt', { topPriceBandId: hostile }),
    ];
    const { root } = mount(ok(rows, { computedAt: hostile }));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain("Men's cotton shirt"));
    expect(root.querySelector('img')).toBeNull();
    expect(root.innerHTML).not.toContain('<img');
    expect(root.textContent).not.toContain('onerror');
    // Unknown Concept ids are dropped, so only the two known Concepts count.
    expect(root.textContent).toContain('Total responses: 80');
  });

  it('shows Concept names only from the fixed name map', () => {
    expect(CONCEPT_NAMES['womens-coord-set']).toBe("Women's co-ord set");
    expect(Object.keys(CONCEPT_NAMES).sort()).toEqual([...CONCEPT_IDS].sort());
  });
});

describe('results island: "would you wear it?" summary bars', () => {
  it('shows one bar per Concept with enough data, with the would-wear percentage as its width and as text', async () => {
    const { root } = mount(
      ok([
        enough('mens-cotton-shirt', { verdicts: { would_wear: 68, maybe: 20, not_for_me: 12 } }),
        enough('mens-linen-shirt', { verdicts: { would_wear: 42, maybe: 30, not_for_me: 28 } }),
        notEnough('mens-cotton-linen-shirt'),
        notEnough('mens-relaxed-pant'),
        notEnough('womens-coord-set'),
      ]),
    );
    reveal();
    await vi.waitFor(() => expect(root.querySelector('.result-summary')).not.toBeNull());
    const rows = [...root.querySelectorAll<HTMLElement>('.result-bar-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.result-bar-label')?.textContent).toBe("Men's cotton shirt");
    expect(rows[0]?.querySelector('.result-bar-value')?.textContent).toBe('68%');
    expect((rows[0]?.querySelector('.result-bar-fill') as HTMLElement).style.width).toBe('68%');
    expect(rows[1]?.querySelector('.result-bar-value')?.textContent).toBe('42%');
  });

  it('omits the summary entirely when no Concept has enough data yet', async () => {
    const { root } = mount(ok(CONCEPT_IDS.map((c) => notEnough(c, 4))));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain(MSG_NOT_ENOUGH));
    expect(root.querySelector('.result-summary')).toBeNull();
  });

  it('never turns a hostile would_wear value into markup', async () => {
    const row = enough('mens-cotton-shirt', {
      verdicts: { would_wear: '<img src=x onerror=alert(1)>', maybe: 1, not_for_me: 1 },
    });
    const { root } = mount(ok([row]));
    reveal();
    await vi.waitFor(() => expect(root.textContent).toContain("Men's cotton shirt"));
    expect(root.querySelector('.result-summary')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });
});

describe('results island: failure', () => {
  it('shows "Results unavailable right now" on an HTTP error', async () => {
    const { live, root } = mount(new Response('{}', { status: 503 }));
    reveal();
    await vi.waitFor(() => expect(live.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
    expect(root.textContent).toContain('Results load here');
  });

  it('shows it when fetch rejects', async () => {
    const { live } = mount(async () => {
      throw new TypeError('offline');
    });
    reveal();
    await vi.waitFor(() => expect(live.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
  });

  it('shows it for a body of the wrong shape', async () => {
    const { live } = mount(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    reveal();
    await vi.waitFor(() => expect(live.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
  });
});

describe('results island: helpers', () => {
  it('joinTied', () => {
    expect(joinTied([])).toBe('');
    expect(joinTied(['A'])).toBe('A');
    expect(joinTied(['A', 'B'])).toBe('A and B (tied)');
    expect(joinTied(['A', 'B', 'C'])).toBe('A, B, C (tied)');
  });

  it('bandLabelFromId matches the bandLabel format', () => {
    expect(bandLabelFromId('mcs-under-1000')).toBe('Under ₹1,000');
    expect(bandLabelFromId('mcs-1500-1999')).toBe('₹1,500–1,999');
    expect(bandLabelFromId('wcs-4000-plus')).toBe('₹4,000+');
    expect(bandLabelFromId('nonsense')).toBeNull();
  });
});
