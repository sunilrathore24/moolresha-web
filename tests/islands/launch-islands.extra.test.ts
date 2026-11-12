/**
 * Task 16.9 (optional): extra happy-dom tests for the interest, results and events islands.
 *
 * The three existing files (interest-island.test.ts, results-island.test.ts, events-island.test.ts)
 * cover the main paths. This file adds only the missing cases:
 *   - interest: aria-describedby / aria-invalid on every field-level error, focus on the first bad
 *     field in page order, consent blocking per consent, a second submit after fixing, the
 *     "give at least one" rule, the 409 and 429 and 503 messages, the in-flight guard, and the
 *     same flows against the REAL built interest form in dist/index.html (skipped without dist/).
 *   - results: enough / not enough / ties / failure on the REAL results markup, response count
 *     wording ("1 response"), tied priorities across 4+ chips, a 200 with an empty results list,
 *     a timeout abort, and a retry-free single fetch.
 *   - events: once per section even if the observer reports again after the first hit, page_view
 *     exactly once across two init calls on different documents, a click on a non-link, a link
 *     whose href only contains "/article/" later in the path, and the section list on the real page.
 *
 * Requirements 12.4, 12.5, 12.10, 16.3, 16.6, 18.3, 22.3.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const turnstile = vi.hoisted(() => ({
  token: vi.fn<() => Promise<string | null>>(),
  reset: vi.fn(),
}));
vi.mock('../../src/islands/turnstile-loader', () => ({
  createTurnstile: () => ({ token: turnstile.token, reset: turnstile.reset }),
}));

import { initInterestForm, MSG_FIX_FIELDS } from '../../src/islands/interest-island';
import { ERROR_MESSAGES, MSG_UNAVAILABLE } from '../../src/islands/api-client';
import { initResults, joinTied, MSG_NOT_ENOUGH, MSG_RESULTS_UNAVAILABLE } from '../../src/islands/results-island';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';

const DIST_INDEX = join(process.cwd(), 'dist', 'index.html');
const hasDist = existsSync(DIST_INDEX);

// The redesign relocated InterestForm and ResultsView off the homepage onto /your-voice
// (unchanged components, just a new host page) — their "real built markup" checks below
// read from there instead. The events-island checks further down are genuinely about the
// homepage itself, so they still read dist/index.html.
const DIST_YOUR_VOICE = join(process.cwd(), 'dist', 'your-voice', 'index.html');
const hasYourVoiceDist = existsSync(DIST_YOUR_VOICE);

function bodyOf(path: string): string {
  const html = readFileSync(path, 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  return body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

function realBody(): string {
  return bodyOf(DIST_INDEX);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

// ===========================================================================
// Interest island
// ===========================================================================

const FORM = `
<form data-interest-form data-notice-version="2026-10-01">
  <input type="email" name="email" aria-describedby="interest-email-error" />
  <p data-error-for="email" id="interest-email-error"></p>
  <input type="tel" name="whatsapp" aria-describedby="interest-whatsapp-hint interest-whatsapp-error" />
  <p data-error-for="whatsapp" id="interest-whatsapp-error"></p>
  <select name="size"><option value="">Choose</option><option value="m">M</option></select>
  <p data-error-for="size" id="interest-size-error"></p>
  <input type="checkbox" name="consent-email" aria-describedby="interest-consent-email-error" /><p data-error-for="consent-email" id="interest-consent-email-error"></p>
  <input type="checkbox" name="consent-whatsapp" aria-describedby="interest-consent-whatsapp-error" /><p data-error-for="consent-whatsapp" id="interest-consent-whatsapp-error"></p>
  <input type="checkbox" name="consent-link" /><p data-error-for="consent-link" id="interest-consent-link-error"></p>
  <input type="checkbox" name="consent-adult" aria-describedby="interest-consent-adult-error" /><p data-error-for="consent-adult" id="interest-consent-adult-error"></p>
  <div data-turnstile></div>
  <button type="submit" data-submit hidden>Join</button>
  <p role="status" data-live-region></p>
</form>`;

function setupInterest(html: string, responses: Response[] = [json(200, { ok: true })], root: ParentNode = document) {
  document.body.innerHTML = html;
  const form = root.querySelector<HTMLFormElement>('form[data-interest-form]')!;
  const queue = [...responses];
  const fetchImpl = vi.fn(async (..._a: unknown[]) => queue.shift() ?? json(200, { ok: true }));
  initInterestForm(form, { fetchImpl: fetchImpl as never });
  const q = <T extends Element>(sel: string) => form.querySelector(sel) as T;
  const input = (name: string) => q<HTMLInputElement>(`[name="${name}"]`);
  const type = (name: string, value: string) => {
    const i = input(name);
    i.value = value;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const tick = (name: string, on = true) => {
    const i = input(name);
    i.checked = on;
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const submit = async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(q('[data-live-region]').textContent).not.toMatch(/^(Sending…)?$/));
  };
  const errorOf = (name: string) => q<HTMLElement>(`[data-error-for="${name}"]`).textContent;
  const live = () => q<HTMLElement>('[data-live-region]').textContent;
  const sentBody = (n = 0) => JSON.parse(((fetchImpl.mock.calls[n] as unknown[])[1] as RequestInit).body as string);
  return { form, fetchImpl, input, type, tick, submit, errorOf, live, sentBody, q };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  turnstile.token.mockReset().mockResolvedValue('tok-1');
  turnstile.reset.mockReset();
});

describe('interest island: field errors with ARIA (Req 12.4, 12.5, 12.10, 22.3)', () => {
  it('sets aria-invalid and a describing error id on every wrong field, and focuses the first in page order', async () => {
    const t = setupInterest(FORM);
    t.type('email', 'nope');
    t.type('whatsapp', '123');
    // no consents at all
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    for (const name of ['email', 'whatsapp', 'consent-email', 'consent-whatsapp', 'consent-adult']) {
      const c = t.input(name);
      const err = t.q<HTMLElement>(`[data-error-for="${name}"]`);
      expect(c.getAttribute('aria-invalid'), name).toBe('true');
      expect(c.getAttribute('aria-describedby') ?? '', name).toContain(err.id);
      expect(err.textContent, name).not.toBe('');
    }
    expect(t.input('consent-link').hasAttribute('aria-invalid')).toBe(false);
    expect(document.activeElement).toBe(t.input('email'));
    expect(t.live()).toBe(MSG_FIX_FIELDS);
  });

  it('focuses the first bad field that exists: whatsapp when the email is fine', async () => {
    const t = setupInterest(FORM);
    t.type('email', 'a@b.in');
    t.tick('consent-email');
    t.tick('consent-adult');
    t.type('whatsapp', '5555555555');
    await t.submit();
    expect(document.activeElement).toBe(t.input('whatsapp'));
    expect(t.errorOf('email')).toBe('');
  });

  it('blocks a number without the WhatsApp consent but not the email that has its consent', async () => {
    const t = setupInterest(FORM);
    t.type('email', 'a@b.in');
    t.type('whatsapp', '9876543210');
    t.tick('consent-email');
    t.tick('consent-adult');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('consent-whatsapp')).not.toBe('');
    expect(t.errorOf('consent-email')).toBe('');
    expect(t.input('consent-whatsapp').getAttribute('aria-invalid')).toBe('true');
    expect(t.input('consent-email').hasAttribute('aria-invalid')).toBe(false);
  });

  it('ticking the missing consent clears its error and the form then sends', async () => {
    const t = setupInterest(FORM);
    t.type('email', 'a@b.in');
    t.tick('consent-adult');
    await t.submit();
    expect(t.errorOf('consent-email')).not.toBe('');
    t.tick('consent-email');
    expect(t.errorOf('consent-email')).toBe('');
    expect(t.input('consent-email').hasAttribute('aria-invalid')).toBe(false);
    await t.submit();
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
    expect(t.sentBody().consents).toMatchObject({ email: true, adult: true, whatsapp: false });
  });

  it('shows the "give at least one" message on the email slot for an empty form and flags no stray field', async () => {
    const t = setupInterest(FORM);
    await t.submit();
    expect(t.errorOf('email')).toMatch(/email address|WhatsApp|size/i);
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('size')).toBe('');
  });

  it('clears all previous errors on a new submit before showing the new ones', async () => {
    const t = setupInterest(FORM);
    t.type('email', 'bad');
    await t.submit();
    expect(t.errorOf('email')).not.toBe('');
    t.type('email', '');
    t.type('size', 'm');
    await t.submit();
    expect(t.errorOf('email')).toBe('');
    expect(t.errorOf('consent-adult')).toBe('');
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('interest island: server errors and guards (Req 22.3)', () => {
  const valid = (t: ReturnType<typeof setupInterest>) => {
    t.type('email', 'a@b.in');
    t.tick('consent-email');
    t.tick('consent-adult');
  };

  it.each([
    [429, 'rate_limited', /few minutes|minute/],
    [503, 'storage_unavailable', /temporarily unavailable/],
    [400, 'invalid_request', /didn't go through/],
    [400, 'consent_required', /consent box/],
    [413, 'payload_too_large', /didn't go through/],
  ])('maps %s %s to a plain message and keeps what was typed', async (status, error, re) => {
    const t = setupInterest(FORM, [json(status, { error }, status === 429 ? { 'Retry-After': '120' } : {})]);
    valid(t);
    await t.submit();
    expect(t.live()).toMatch(re as RegExp);
    expect(t.live()).not.toContain(error);
    expect(t.input('email').value).toBe('a@b.in');
    expect(t.input('consent-email').checked).toBe(true);
  });

  it('shows the minutes for a 429 with Retry-After', async () => {
    const t = setupInterest(FORM, [json(429, { error: 'rate_limited' }, { 'Retry-After': '180' })]);
    valid(t);
    await t.submit();
    expect(t.live()).toMatch(/3 minutes/);
  });

  it('maps an unknown error code to the unavailable message', async () => {
    const t = setupInterest(FORM, [json(500, { error: 'who_knows' })]);
    valid(t);
    await t.submit();
    expect(t.live()).toBe(MSG_UNAVAILABLE);
  });

  it('ignores a second submit while the first is in flight and re-enables the button after', async () => {
    let release!: (r: Response) => void;
    document.body.innerHTML = FORM;
    const form = document.querySelector('form') as HTMLFormElement;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (release = r)));
    initInterestForm(form, { fetchImpl: fetchImpl as never });
    (form.querySelector('[name="size"]') as HTMLSelectElement).value = 'm';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(form.querySelector('[data-submit]')!.getAttribute('aria-disabled')).toBe('true');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    release(json(200, { ok: true }));
    await vi.waitFor(() => expect(form.querySelector('[data-live-region]')!.textContent).toMatch(/Thank you/));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(form.querySelector('[data-submit]')!.hasAttribute('aria-disabled')).toBe(false);
  });

  it('a size-only thank-you does not promise a confirmation email', async () => {
    const t = setupInterest(FORM);
    t.type('size', 'm');
    await t.submit();
    expect(t.live()).toBe('Thank you. You are on the list.');
  });

  it('an email thank-you asks the visitor to check the inbox', async () => {
    const t = setupInterest(FORM);
    valid(t);
    await t.submit();
    expect(t.live()).toMatch(/inbox/);
  });

  it('the notice_outdated message is the one in the shared map', async () => {
    const t = setupInterest(FORM, [json(409, { error: 'notice_outdated' })]);
    valid(t);
    await t.submit();
    expect(t.live()).toBe(ERROR_MESSAGES.notice_outdated);
  });
});

describe.skipIf(!hasYourVoiceDist)('interest island on the real built form (dist/your-voice/index.html)', () => {
  const real = () => setupInterest(bodyOf(DIST_YOUR_VOICE));

  it('starts with the submit button hidden, then reveals it; the notice comes before the fields', () => {
    document.body.innerHTML = bodyOf(DIST_YOUR_VOICE);
    const form = document.querySelector<HTMLFormElement>('form[data-interest-form]')!;
    expect(form.querySelector('[data-submit]')!.hasAttribute('hidden')).toBe(true);
    const notice = document.querySelector('[data-interest-notice]')!;
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    initInterestForm(form);
    expect(form.querySelector('[data-submit]')!.hasAttribute('hidden')).toBe(false);
  });

  it('every consent starts unticked and every field has an error slot referenced by aria-describedby', () => {
    const t = real();
    for (const n of ['consent-email', 'consent-whatsapp', 'consent-link', 'consent-adult']) {
      expect(t.input(n).checked, n).toBe(false);
    }
    for (const n of ['email', 'whatsapp', 'size', 'consent-email', 'consent-whatsapp', 'consent-link', 'consent-adult']) {
      const slot = t.q<HTMLElement>(`[data-error-for="${n}"]`);
      expect(slot.id, n).toBeTruthy();
      expect(t.input(n).getAttribute('aria-describedby') ?? '', n).toContain(slot.id);
    }
  });

  it('blocks an email without consent and sets the real ARIA ids', async () => {
    const t = real();
    t.type('email', 'a@b.in');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.input('consent-email').getAttribute('aria-invalid')).toBe('true');
    expect(t.input('consent-adult').getAttribute('aria-invalid')).toBe('true');
    expect(t.errorOf('consent-email')).not.toBe('');
  });

  it('sends the page notice version and an E.164 number for a valid submission', async () => {
    const t = real();
    t.type('whatsapp', '98765 43210');
    t.tick('consent-whatsapp');
    t.tick('consent-adult');
    await t.submit();
    const body = t.sentBody();
    expect(body.whatsapp).toBe('+919876543210');
    expect(body.noticeVersion).toBe(t.form.dataset.noticeVersion);
    expect(body.consents).toEqual({ email: false, whatsapp: true, link: false, adult: true });
    expect(body).not.toHaveProperty('email');
  });
});

// ===========================================================================
// Results island
// ===========================================================================

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
const intersect = () => {
  const o = observers[0]!;
  o.cb([{ isIntersecting: true, target: o.observed[0] } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
};

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
const okBody = (results: unknown[], extra: Record<string, unknown> = {}) =>
  json(200, { ok: true, computedAt: '2026-11-02T10:00:00.000Z', results, ...extra });

function mountResults(html: string, fetchImpl: (...a: never[]) => Promise<Response>) {
  document.body.innerHTML = html;
  const root = document.querySelector<HTMLElement>('[data-results-root]')!;
  const live = document.querySelector<HTMLElement>('[data-live-region]');
  initResults(root, { fetchImpl: fetchImpl as never });
  return { root, live };
}

const RESULTS_HTML = `<section data-section="results"><div data-results-root><p>Results load here.</p></div><p role="status" data-live-region></p></section>`;

describe('results island: extra cases (Req 16.3, 16.6, 22.3)', () => {
  beforeEach(() => stubIO());
  afterEach(() => vi.unstubAllGlobals());

  it('says "1 response" (singular) for a Concept with one response', async () => {
    const { root } = mountResults(RESULTS_HTML, async () => okBody([notEnough('mens-cotton-shirt', 1)]));
    intersect();
    await vi.waitFor(() => expect(root.textContent).toContain('1 response'));
    expect(root.textContent).not.toContain('1 responses');
  });

  it('a mix of enough and not-enough Concepts renders each in the fixed Concept order', async () => {
    const rows = [
      notEnough('womens-coord-set', 2),
      enough('mens-linen-shirt', { topPriorities: [] }),
      enough('mens-cotton-shirt'),
    ];
    const { root } = mountResults(RESULTS_HTML, async () => okBody(rows));
    intersect();
    await vi.waitFor(() => expect(root.querySelectorAll('.result-concept').length).toBe(3));
    // Scoped to each Concept's own card, not every h3 under root: with enough would-wear data
    // present, the "Would you wear it?" summary (a sibling, before the cards) adds one more.
    const names = [...root.querySelectorAll('.result-concept h3')].map((h) => h.textContent);
    expect(names).toEqual(["Men's cotton shirt", "Men's linen shirt", "Women's co-ord set"]);
    expect(root.querySelectorAll('.result-pending')).toHaveLength(1);
  });

  it('a four-way tie reads "A, B, C, D (tied)" and a single leader has no "(tied)"', async () => {
    const rows = [
      enough('mens-cotton-shirt', { topPriorities: ['softness', 'no_shrinking', 'colour_lasts', 'breathability'] }),
      enough('mens-linen-shirt', { topPriorities: ['long_life'] }),
    ];
    const { root } = mountResults(RESULTS_HTML, async () => okBody(rows));
    intersect();
    await vi.waitFor(() => expect(root.textContent).toContain('What matters most'));
    const lines = [...root.querySelectorAll('p')].map((p) => p.textContent ?? '').filter((s) => s.startsWith('What matters most'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\(tied\)$/);
    expect(lines[0]!.split(',')).toHaveLength(4);
    expect(lines[1]).toBe('What matters most: Long life');
  });

  it('shows "Results unavailable right now" for a 200 with an empty results list, and never zeros', async () => {
    const { root, live } = mountResults(RESULTS_HTML, async () => okBody([]));
    intersect();
    await vi.waitFor(() => expect(live!.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
    expect(root.textContent).toContain('Results load here');
    expect(root.textContent).not.toMatch(/\b0\b/);
  });

  it('shows the message when the body is not JSON', async () => {
    const { live } = mountResults(RESULTS_HTML, async () => new Response('<html>', { status: 200 }));
    intersect();
    await vi.waitFor(() => expect(live!.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
  });

  it('aborts a request that never answers after 10 s and shows the message', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_u: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))),
      );
      const { live } = mountResults(RESULTS_HTML, fetchImpl as never);
      intersect();
      await vi.advanceTimersByTimeAsync(10_001);
      expect(live!.textContent).toBe(MSG_RESULTS_UNAVAILABLE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not refetch after a failure when the section is scrolled into view again', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
    const { live } = mountResults(RESULTS_HTML, fetchImpl as never);
    intersect();
    await vi.waitFor(() => expect(live!.textContent).toBe(MSG_RESULTS_UNAVAILABLE));
    intersect();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('clears an earlier failure message on a later successful render', async () => {
    document.body.innerHTML = RESULTS_HTML;
    const live = document.querySelector<HTMLElement>('[data-live-region]')!;
    live.textContent = MSG_RESULTS_UNAVAILABLE;
    const root = document.querySelector<HTMLElement>('[data-results-root]')!;
    initResults(root, { fetchImpl: (async () => okBody([enough('mens-cotton-shirt')])) as never });
    intersect();
    await vi.waitFor(() => expect(root.textContent).toContain("Men's cotton shirt"));
    expect(live.textContent).toBe('');
  });

  it('joinTied keeps the order it is given', () => {
    expect(joinTied(['B', 'A'])).toBe('B and A (tied)');
  });

  it('the not-enough note appears exactly once per Concept below the threshold, with no percentage', async () => {
    const { root } = mountResults(RESULTS_HTML, async () => okBody(CONCEPT_IDS.map((c) => notEnough(c, 19))));
    intersect();
    await vi.waitFor(() => expect(root.textContent).toContain(MSG_NOT_ENOUGH));
    expect(root.textContent!.split(MSG_NOT_ENOUGH).length - 1).toBe(5);
    expect(root.textContent).not.toContain('%');
  });
});

describe.skipIf(!hasYourVoiceDist)('results island on the real built markup (dist/your-voice/index.html)', () => {
  beforeEach(() => stubIO());
  afterEach(() => vi.unstubAllGlobals());

  it('has its placeholder and a noscript link, observes the root with a 200 px margin and renders into it', async () => {
    document.body.innerHTML = bodyOf(DIST_YOUR_VOICE);
    const root = document.querySelector<HTMLElement>('[data-results-root]')!;
    expect(root.textContent).toMatch(/Results load here/i);
    const tabpanel = root.closest('[role="tabpanel"]');
    expect(tabpanel).not.toBeNull();
    const fetchImpl = vi.fn(async () => okBody(CONCEPT_IDS.map((c) => notEnough(c, 2))));
    initResults(root, { fetchImpl: fetchImpl as never });
    expect(observers[0]!.opts?.rootMargin).toBe('200px 0px');
    intersect();
    await vi.waitFor(() => expect(root.querySelectorAll('.result-concept')).toHaveLength(5));
    expect(root.textContent).not.toContain('Results load here');
  });
});

// ===========================================================================
// Events island
// ===========================================================================

let initEvents: typeof import('../../src/islands/events-island').initEvents;

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  vi.stubGlobal('navigator', { ...navigator, sendBeacon: vi.fn(() => true) });
  ({ initEvents } = await import('../../src/islands/events-island'));
  vi.unstubAllGlobals();
});

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}
function see(doc: Document, section: string, ratio: number) {
  const target = doc.querySelector(`[data-section="${section}"]`) as Element;
  const io = observers[0]!;
  io.cb(
    [{ target, isIntersecting: ratio > 0, intersectionRatio: ratio } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}
const eventBodies = async (calls: unknown[][]) =>
  Promise.all(calls.map(async (c) => JSON.parse(await (c[1] as Blob).text())));

describe('events island: extra cases (Req 18.3)', () => {
  let beacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    stubIO();
    sessionStorage.clear();
    beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
  });
  afterEach(() => vi.unstubAllGlobals());

  const PAGE = `
    <section data-section="design-lab"></section><section data-section="why"></section>
    <section data-section="beyond-label"></section><section data-section="trends"></section>
    <a id="a" href="/article/x">J</a><a id="b" href="/privacy?next=/article/x">P</a><button id="c">B</button>`;

  it('sends each section once even when the observer reports it many times, in any order', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    for (const s of ['trends', 'design-lab', 'trends', 'design-lab', 'why', 'beyond-label', 'why']) see(doc, s, 1);
    const bodies = await eventBodies(beacon.mock.calls);
    expect(bodies.map((b) => b.section)).toEqual(['trends', 'design-lab', 'why', 'beyond-label']);
    expect(new Set(bodies.map((b) => b.section)).size).toBe(4);
  });

  it('does not send for a section reported at exactly 49% and sends at 50%', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    see(doc, 'design-lab', 0.49);
    expect(beacon).not.toHaveBeenCalled();
    see(doc, 'design-lab', 0.5);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('counts a click on an /article/ link and ignores a button and a link whose query merely mentions it', async () => {
    const doc = makeDoc(PAGE);
    initEvents(doc);
    beacon.mockClear();
    for (const id of ['c', 'b']) (doc.getElementById(id) as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(beacon).not.toHaveBeenCalled();
    (doc.getElementById('a') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(await eventBodies(beacon.mock.calls)).toEqual([{ event: 'journal_click' }]);
  });

  it('a click on a child of the link still counts', async () => {
    const doc = makeDoc(`<a href="/article/x"><span id="s">J</span></a>`);
    initEvents(doc);
    beacon.mockClear();
    (doc.getElementById('s') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('page_view is sent once per document, so a second document gets its own and the first none extra', () => {
    const d1 = makeDoc(PAGE);
    const d2 = makeDoc(PAGE);
    initEvents(d1);
    initEvents(d1);
    expect(beacon).toHaveBeenCalledTimes(1);
    initEvents(d2);
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('every request goes to /api/events as application/json with no cookie header or credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: undefined });
    initEvents(makeDoc(PAGE), { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/events');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.credentials).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie/i);
  });
});

describe.skipIf(!hasDist)('events island on the real built page (dist/index.html)', () => {
  beforeEach(() => {
    stubIO();
    sessionStorage.clear();
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: vi.fn(() => true) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('observes exactly the two allow-listed sections that exist on the page, not hero/footer', () => {
    // why/beyond-label/trends moved to /journal in the redesign — still real SECTIONS values,
    // just tracked from their new page now, not the homepage. `signup` (LaunchSignup.astro)
    // was removed from the homepage entirely (2026-11) — Footer.astro now has its own
    // always-present email panel on every page, so the homepage-only copy was redundant.
    const doc = makeDoc(realBody());
    initEvents(doc);
    const names = observers[0]!.observed.map((e) => (e as HTMLElement).dataset.section);
    expect(names).toEqual(['design-lab', 'nav-cards']);
  });

  it('the real Journal link in the footer or header triggers journal_click', async () => {
    // The only /article/ link on the homepage itself lived inside WhyItMatters/BeyondTheLabel/
    // Trends content, which moved to /journal in the redesign — check there instead; same real
    // markup, same island, just relocated.
    const doc = makeDoc(bodyOf(join(process.cwd(), 'dist', 'journal', 'index.html')));
    initEvents(doc);
    const beacon = navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>;
    beacon.mockClear();
    const link = doc.querySelector<HTMLElement>('a[href^="/article/"]');
    expect(link).not.toBeNull();
    link!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(await eventBodies(beacon.mock.calls)).toEqual([{ event: 'journal_click' }]);
  });
});
