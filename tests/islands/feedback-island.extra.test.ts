/**
 * Task 16.7 (optional): extra happy-dom tests for the feedback island and the market reveal.
 *
 * tests/islands/feedback-island.test.ts already covers the main paths. This file adds only the
 * cases that were missing:
 *   - every API error code the feedback forms can meet, mapped to its plain-language message
 *   - the frustration form's own messages
 *   - selections kept and saved after errors (not only a 400)
 *   - the in-flight guard against a double submit
 *   - market reveal corner cases: malformed or unknown stored ids, a repeat answer is not
 *     announced twice, a union of ids in both storages, no answers stored, frustration never reveals
 *   - the same checks against the REAL server-rendered markup in dist/index.html (skipped when
 *     dist/ is absent), including "no JS": each <details class="market-context"> is present,
 *     closed and not hidden before the island runs.
 *
 * Requirements 7.2, 7.3, 7.4, 7.5, 9.3, 9.9, 9.10, 9.16, 9.17, 21.5.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const ts = vi.hoisted(() => ({
  token: null as string | null,
  reset: undefined as unknown as Mock<(...a: unknown[]) => void>,
  tokens: 0,
}));
vi.mock('../../src/islands/turnstile-loader', () => ({
  createTurnstile: () => ({
    token: () => Promise.resolve(ts.token === null ? null : `${ts.token}-${++ts.tokens}`),
    reset: (...a: unknown[]) => ts.reset(...a),
  }),
}));

import { initFeedbackForms, resetFeedbackIslandMemory } from '../../src/islands/feedback-island';
import { resetAnonIdMemory } from '../../src/islands/anon-id';
import { ERROR_MESSAGES, MSG_UNAVAILABLE } from '../../src/islands/api-client';

const A = 'mens-cotton-shirt';
const B = 'mens-relaxed-pant';
const ANSWERED = 'mr_price_answered';

// ---------------------------------------------------------------------------
// Fixtures (same hooks as ConceptFeedbackForm.astro / FrustrationForm.astro)
// ---------------------------------------------------------------------------

function conceptForm(id: string): string {
  const radio = (n: string, v: string) => `<label><input type="radio" name="${n}" value="${v}"></label>`;
  const box = (n: string, v: string, extra = '') =>
    `<label><input type="checkbox" name="${n}" value="${v}" ${extra}></label>`;
  return `<form data-feedback-form data-concept-id="${id}" method="post" action="/api/feedback">
    ${['would_wear', 'maybe', 'not_for_me'].map((v) => radio('verdict', v)).join('')}
    ${['fit', 'fabric_weight', 'colour', 'pockets', 'price'].map((v) => box('changes', v)).join('')}
    ${box('changes', 'other', 'aria-controls="o-' + id + '"')}
    <div data-other-field id="o-${id}" hidden><input type="text" name="otherText" maxlength="200"></div>
    ${['flax', 'clay'].map((v) => radio('colour', v)).join('')}
    ${['softness', 'no_shrinking'].map((v) => box('priorities', v)).join('')}
    <fieldset data-price-question>
      ${radio('priceBandId', 'b1')}${radio('priceBandId', 'b2')}
      <button type="button" aria-pressed="false" data-price-skip>Skip this question</button>
    </fieldset>
    <div data-turnstile></div>
    <button type="submit" data-submit hidden>Send feedback</button>
    <p role="status" data-live-region></p>
  </form>
  <details class="market-context" data-market-for="${id}" data-reveal="pending"><summary>See what similar pieces cost</summary><p>x</p></details>`;
}

const frustrationForm = `<form data-frustration-form>
  <input type="checkbox" name="chips" value="shrinks"><input type="checkbox" name="chips" value="fades">
  <input type="checkbox" name="chips" value="other" aria-controls="fo">
  <div data-other-field id="fo" hidden><input type="text" name="otherText"></div>
  <div data-turnstile></div><button type="submit" data-submit hidden>Send</button><p data-live-region></p></form>`;

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const form = (id: string) => $<HTMLFormElement>(`form[data-concept-id="${id}"]`);
const frus = () => $<HTMLFormElement>('form[data-frustration-form]');
const pick = (f: ParentNode, name: string, value: string) => {
  const el = $<HTMLInputElement>(`input[name="${name}"][value="${value}"]`, f);
  el.checked = !el.checked || el.type === 'radio';
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const skip = (f: ParentNode) => $('button[data-price-skip]', f).dispatchEvent(new Event('click', { bubbles: true }));
const live = (f: ParentNode) => $('[data-live-region]', f).textContent ?? '';
const submit = (f: HTMLFormElement) => f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const market = (id: string) => $<HTMLDetailsElement>(`details[data-market-for="${id}"]`);

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
let fetchMock: ReturnType<typeof vi.fn>;
const sent = (n = 0) => JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string);

async function sendAndWait(f: HTMLFormElement) {
  submit(f);
  await vi.waitFor(() => expect(live(f)).not.toBe(''));
}

beforeEach(() => {
  document.body.innerHTML = conceptForm(A) + conceptForm(B) + frustrationForm;
  sessionStorage.clear();
  localStorage.clear();
  resetFeedbackIslandMemory();
  resetAnonIdMemory();
  ts.token = 'tok';
  ts.tokens = 0;
  ts.reset = vi.fn();
  fetchMock = vi.fn(async () => reply(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Error codes and messages
// ---------------------------------------------------------------------------

describe('feedback island: error-code messages (Req 9.16, 9.17, 22.2)', () => {
  it.each([
    [400, 'invalid_request'],
    [413, 'payload_too_large'],
    [415, 'unsupported_media_type'],
    [400, 'invalid_anon_id'],
  ])('shows the mapped message for %s %s and never the raw code', async (status, error) => {
    // invalid_anon_id is retried once, so make every attempt fail.
    fetchMock.mockImplementation(async () => reply(status, { error }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(live(f)).toBe(ERROR_MESSAGES[error]);
    expect(live(f)).not.toContain(error);
  });

  it('maps an unknown error code and a plain 500 to the unavailable message', async () => {
    fetchMock.mockImplementation(async () => reply(500, { error: 'internal_error' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(live(f)).toBe(MSG_UNAVAILABLE);
  });

  it('maps a network error to the unavailable message', async () => {
    fetchMock.mockImplementation(async () => Promise.reject(new TypeError('offline')));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(live(f)).toBe(MSG_UNAVAILABLE);
  });

  it.each([
    [undefined, /few minutes/],
    ['60', /1 minute\./],
    ['3600', /60 minutes/],
  ])('rate limit with Retry-After %s', async (retryAfter, re) => {
    fetchMock.mockResolvedValue(
      reply(429, { error: 'rate_limited' }, retryAfter ? { 'Retry-After': retryAfter } : {}),
    );
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(live(f)).toMatch(re as RegExp);
  });

  it('stops after a second invalid_anon_id and shows its message', async () => {
    fetchMock.mockImplementation(async () => reply(400, { error: 'invalid_anon_id' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(live(f)).toBe(ERROR_MESSAGES.invalid_anon_id);
  });
});

// ---------------------------------------------------------------------------
// Live region, selections and guards
// ---------------------------------------------------------------------------

describe('feedback island: live region, selections and guards', () => {
  it('asks for a verdict when submit is pressed without one, in the live region, and sends nothing', async () => {
    initFeedbackForms();
    const f = form(A);
    submit(f);
    await Promise.resolve();
    expect(live(f)).toBe('Please choose whether you would wear it.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the frustration form asks for a chip with its own message', async () => {
    initFeedbackForms();
    submit(frus());
    await Promise.resolve();
    expect(live(frus())).toBe('Please tick at least one option.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['429', () => reply(429, { error: 'rate_limited' })],
    ['503', () => reply(503, { error: 'storage_unavailable' })],
    ['network error', () => Promise.reject(new TypeError('offline'))],
  ])('keeps every selection after a %s and saves them to sessionStorage', async (_n, make) => {
    fetchMock.mockImplementation(async () => make());
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'would_wear');
    pick(f, 'changes', 'fit');
    pick(f, 'priorities', 'softness');
    pick(f, 'colour', 'flax');
    pick(f, 'priceBandId', 'b2');
    await sendAndWait(f);
    for (const [n, v] of [
      ['verdict', 'would_wear'],
      ['changes', 'fit'],
      ['priorities', 'softness'],
      ['colour', 'flax'],
      ['priceBandId', 'b2'],
    ]) {
      expect($<HTMLInputElement>(`input[name="${n}"][value="${v}"]`, f).checked).toBe(true);
    }
    const saved = JSON.parse(sessionStorage.getItem(`mr_form_${A}`)!);
    expect(saved.fields.verdict).toEqual(['would_wear']);
    expect(saved.fields.priceBandId).toEqual(['b2']);
  });

  it('keeps a skip pressed after an error', async () => {
    fetchMock.mockResolvedValue(reply(503, { error: 'storage_unavailable' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    skip(f);
    await sendAndWait(f);
    expect($('button[data-price-skip]', f).getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(sessionStorage.getItem(`mr_form_${A}`)!).skipped).toBe(true);
  });

  it('pressing Skip twice un-presses it and the body then carries neither price field', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    skip(f);
    skip(f);
    expect($('button[data-price-skip]', f).getAttribute('aria-pressed')).toBe('false');
    await sendAndWait(f);
    expect(sent()).not.toHaveProperty('priceSkipped');
    expect(sent()).not.toHaveProperty('priceBandId');
  });

  it('never sends a band and a skip together, whatever the click order', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b1');
    skip(f);
    pick(f, 'priceBandId', 'b2');
    await sendAndWait(f);
    expect(sent().priceBandId).toBe('b2');
    expect(sent()).not.toHaveProperty('priceSkipped');
  });

  it('ignores a second submit while the first is in flight', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (release = r)));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    submit(f);
    submit(f);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(reply(200, { ok: true }));
    await vi.waitFor(() => expect(live(f)).toMatch(/saved/i));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends otherText for the frustration form only with the "other" chip ticked', async () => {
    initFeedbackForms();
    const f = frus();
    pick(f, 'chips', 'shrinks');
    $<HTMLInputElement>('input[name="otherText"]', f).value = 'stale';
    await sendAndWait(f);
    expect(sent()).not.toHaveProperty('otherText');
    expect(sent().chips).toEqual(['shrinks']);
  });

  it('shows an error on a frustration 400 and keeps the chips', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'invalid_request' }));
    initFeedbackForms();
    const f = frus();
    pick(f, 'chips', 'fades');
    await sendAndWait(f);
    expect(live(f)).toBe(ERROR_MESSAGES.invalid_request);
    expect($<HTMLInputElement>('input[value="fades"]', f).checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Market reveal corner cases
// ---------------------------------------------------------------------------

describe('market reveal: corner cases (Req 7.2, 7.3, 7.4)', () => {
  it.each([
    ['malformed JSON', '{nope'],
    ['not an array', '{"a":1}'],
    ['unknown ids only', JSON.stringify(['not-a-concept', 7, null])],
  ])('keeps every card hidden when storage holds %s', (_n, raw) => {
    sessionStorage.setItem(ANSWERED, raw);
    localStorage.setItem(ANSWERED, raw);
    initFeedbackForms();
    for (const id of [A, B]) {
      expect(market(id).hidden).toBe(true);
      expect(market(id).dataset.reveal).toBe('hidden');
      expect(market(id).open).toBe(false);
    }
  });

  it('reveals the known id and ignores unknown ids stored next to it', () => {
    localStorage.setItem(ANSWERED, JSON.stringify(['junk', B]));
    initFeedbackForms();
    expect(market(B).hidden).toBe(false);
    expect(market(A).hidden).toBe(true);
  });

  it('a stored id reveals the card at start-up without any announcement or focus change', () => {
    sessionStorage.setItem(ANSWERED, JSON.stringify([A]));
    const before = document.activeElement;
    initFeedbackForms();
    expect(market(A).open).toBe(true);
    expect(live(form(A))).toBe('');
    expect(document.activeElement).toBe(before);
  });

  it('writes the union of ids to both storages, sorted, and stores no price answers', async () => {
    sessionStorage.setItem(ANSWERED, JSON.stringify([B]));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b1');
    await sendAndWait(f);
    for (const st of [sessionStorage, localStorage]) {
      const raw = st.getItem(ANSWERED)!;
      expect(JSON.parse(raw)).toEqual([A, B].sort());
      expect(raw).not.toContain('b1');
      expect(raw).not.toContain('maybe');
    }
  });

  it('does not announce the reveal a second time for a Concept that is already shown', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    skip(f);
    await sendAndWait(f);
    expect(live(f)).toContain("Similar pieces' prices are now shown below.");
    $('[data-live-region]', f).textContent = '';
    await sendAndWait(f);
    expect(live(f)).not.toContain('Similar pieces');
    expect(live(f)).toMatch(/saved/i);
    expect(market(A).hidden).toBe(false);
  });

  it('reveals the Concept after a later price answer, though the first submit had none', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendAndWait(f);
    expect(market(A).hidden).toBe(true);
    pick(f, 'priceBandId', 'b2');
    $('[data-live-region]', f).textContent = '';
    await sendAndWait(f);
    expect(market(A).hidden).toBe(false);
    expect(market(B).hidden).toBe(true);
  });

  it('a frustration 200 never reveals a card', async () => {
    initFeedbackForms();
    pick(frus(), 'chips', 'shrinks');
    await sendAndWait(frus());
    expect(market(A).hidden).toBe(true);
    expect(market(B).hidden).toBe(true);
    expect(sessionStorage.getItem(ANSWERED)).toBeNull();
  });

  it('a 409 notice_outdated style failure and a 503 leave the card hidden and storage untouched', async () => {
    fetchMock.mockResolvedValue(reply(503, { error: 'storage_unavailable' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    skip(f);
    await sendAndWait(f);
    expect(market(A).hidden).toBe(true);
    expect(localStorage.getItem(ANSWERED)).toBeNull();
  });

  it('with both storages throwing, a skip reveals only that card and the next submit still works', async () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('sessionStorage', broken);
    vi.stubGlobal('localStorage', broken);
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    skip(f);
    await sendAndWait(f);
    expect(market(A).hidden).toBe(false);
    expect(market(A).open).toBe(true);
    expect(market(B).hidden).toBe(true);
    expect(live(f)).toContain("Similar pieces' prices are now shown below.");
  });
});

// ---------------------------------------------------------------------------
// Real server-rendered markup (dist/index.html). Skipped when dist/ is absent.
// ---------------------------------------------------------------------------

const DIST_INDEX = join(process.cwd(), 'dist', 'index.html');
// The redesign moved each Concept's feedback form off the homepage onto its own
// /designs/<id> page (one card per page, not five) — this describe block's assertions
// (e.g. "4 other cards besides the first") assume the old five-cards-on-one-page layout, so
// it's skipped rather than force-fit, pending a follow-up test pass against the new
// single-card-per-page reality (deliberately not written yet, per the user's request to
// hold off on new tests until the visual redesign is reviewed). ConceptFeedbackForm itself
// is unchanged — only where it's mounted changed.
const hasDist = existsSync(DIST_INDEX) && readFileSync(DIST_INDEX, 'utf8').includes('data-concept-card');

function realBody(): string {
  const html = readFileSync(DIST_INDEX, 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  // The island under test is loaded by the test, not by the page.
  return body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

describe.skipIf(!hasDist)('real built markup (dist/index.html)', () => {
  beforeEach(() => {
    document.body.innerHTML = realBody();
  });

  it('no JS: each market <details> is present, closed, not hidden, in its card', () => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-concept-card]')];
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      const id = card.dataset.conceptId!;
      const d = card.querySelectorAll<HTMLDetailsElement>('details.market-context');
      expect(d).toHaveLength(1);
      expect(d[0]!.dataset.marketFor).toBe(id);
      expect(d[0]!.hasAttribute('open')).toBe(false);
      expect(d[0]!.hasAttribute('hidden')).toBe(false);
      expect(d[0]!.dataset.reveal).toBe('pending');
      expect(d[0]!.querySelector('summary')?.textContent?.trim()).toBe('See what similar pieces cost');
      // after the price question
      const price = card.querySelector('fieldset[data-price-question]')!;
      expect(price.compareDocumentPosition(d[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('with empty storage the island hides every card and the form hooks work', () => {
    initFeedbackForms();
    document.querySelectorAll<HTMLElement>('details.market-context').forEach((d) => {
      expect(d.hidden).toBe(true);
      expect(d.dataset.reveal).toBe('hidden');
    });
    const first = $<HTMLFormElement>('form[data-feedback-form]');
    expect($('[data-submit]', first).hasAttribute('hidden')).toBe(false);
    expect($('[data-submit]', first).getAttribute('aria-disabled')).toBe('true');
    const other = $<HTMLInputElement>('input[name="changes"][value="other"]', first);
    expect($<HTMLElement>('[data-other-field]', first).hidden).toBe(true);
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    expect($<HTMLElement>('[data-other-field]', first).hidden).toBe(false);
    expect(other.getAttribute('aria-expanded')).toBe('true');
    expect(other.getAttribute('aria-controls')).toBe($('[data-other-field]', first).id);
  });

  it('a skip answered on the real first card reveals only that card', async () => {
    initFeedbackForms();
    const first = $<HTMLFormElement>('form[data-feedback-form]');
    const id = first.dataset.conceptId!;
    pick(first, 'verdict', 'would_wear');
    skip(first);
    await sendAndWait(first);
    expect(sent().priceSkipped).toBe(true);
    expect(sent().conceptId).toBe(id);
    expect(market(id).hidden).toBe(false);
    expect(market(id).open).toBe(true);
    const others = [...document.querySelectorAll<HTMLDetailsElement>('details.market-context')].filter(
      (d) => d.dataset.marketFor !== id,
    );
    expect(others).toHaveLength(4);
    others.forEach((d) => expect(d.hidden).toBe(true));
  });

  it('a real price band id is accepted and sent as priceBandId only', async () => {
    initFeedbackForms();
    const first = $<HTMLFormElement>('form[data-feedback-form]');
    const band = $<HTMLInputElement>('input[name="priceBandId"]', first).value;
    pick(first, 'verdict', 'maybe');
    pick(first, 'priceBandId', band);
    await sendAndWait(first);
    expect(sent().priceBandId).toBe(band);
    expect(sent()).not.toHaveProperty('priceSkipped');
  });
});
