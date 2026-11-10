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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const A = 'mens-cotton-shirt';
const B = 'mens-relaxed-pant';

function conceptForm(id: string): string {
  const radio = (n: string, v: string) => `<label><input type="radio" name="${n}" value="${v}"></label>`;
  const box = (n: string, v: string, extra = '') => `<label><input type="checkbox" name="${n}" value="${v}" ${extra}></label>`;
  return `<form data-feedback-form data-concept-id="${id}" method="post" action="/api/feedback">
    ${['would_wear', 'maybe', 'not_for_me'].map((v) => radio('verdict', v)).join('')}
    ${['fit', 'fabric_weight', 'colour', 'pockets', 'price'].map((v) => box('changes', v)).join('')}
    ${box('changes', 'other', 'aria-controls="o-' + id + '"')}
    <div data-other-field id="o-${id}" hidden><input type="text" name="otherText" maxlength="200"></div>
    ${['flax', 'clay'].map((v) => radio('colour', v)).join('')}
    ${['softness', 'no_shrinking', 'colour_lasts', 'breathability', 'easy_care', 'long_life'].map((v) => box('priorities', v)).join('')}
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
const pick = (f: ParentNode, name: string, value: string) => {
  const el = $<HTMLInputElement>(`input[name="${name}"][value="${value}"]`, f);
  el.checked = !el.checked || el.type === 'radio';
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const live = (f: ParentNode) => $('[data-live-region]', f).textContent ?? '';
const submit = (f: HTMLFormElement) => f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const market = (id: string) => $<HTMLDetailsElement>(`details[data-market-for="${id}"]`);

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
let fetchMock: ReturnType<typeof vi.fn>;
const sent = (n = 0) => JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string);

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

async function sendOk(f: HTMLFormElement) {
  submit(f);
  await vi.waitFor(() => expect(live(f)).not.toBe(''));
}

describe('form behaviour', () => {
  it('reveals the submit button and toggles the other field and aria-expanded', () => {
    initFeedbackForms();
    const f = form(A);
    expect($('[data-submit]', f).hasAttribute('hidden')).toBe(false);
    expect($<HTMLElement>('[data-other-field]', f).hidden).toBe(true);
    pick(f, 'changes', 'other');
    expect($<HTMLElement>('[data-other-field]', f).hidden).toBe(false);
    expect($('input[value="other"]', f).getAttribute('aria-expanded')).toBe('true');
    pick(f, 'changes', 'other');
    expect($<HTMLElement>('[data-other-field]', f).hidden).toBe(true);
    expect($('input[value="other"]', f).getAttribute('aria-expanded')).toBe('false');
  });

  it('is idempotent: a second init does not double-submit', async () => {
    initFeedbackForms();
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps submit aria-disabled (not disabled) until a verdict is chosen', async () => {
    initFeedbackForms();
    const f = form(A);
    const btn = $('[data-submit]', f);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
    submit(f);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(live(f)).toMatch(/wear/i);
    pick(f, 'verdict', 'maybe');
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('sends a verdict-only submission with exactly the expected body', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'would_wear');
    await sendOk(f);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feedback');
    expect(sent()).toEqual({
      anonId: expect.stringMatching(UUID),
      conceptId: A,
      verdict: 'would_wear',
      changes: [],
      priorities: [],
      turnstileToken: 'tok-1',
    });
    expect(live(f)).toMatch(/saved/i);
  });

  it('sends chips in allow-list order, otherText only with "other", colour when chosen', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'changes', 'other');
    pick(f, 'changes', 'fit');
    pick(f, 'priorities', 'long_life');
    pick(f, 'priorities', 'softness');
    pick(f, 'colour', 'clay');
    $<HTMLInputElement>('input[name="otherText"]', f).value = '  longer sleeves ';
    await sendOk(f);
    expect(sent()).toMatchObject({
      changes: ['fit', 'other'],
      priorities: ['softness', 'long_life'],
      colour: 'clay',
      otherText: 'longer sleeves',
    });
  });

  it('omits otherText when "other" is not ticked', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    $<HTMLInputElement>('input[name="otherText"]', f).value = 'stale';
    await sendOk(f);
    expect(sent()).not.toHaveProperty('otherText');
  });

  it('skip clears the band, sets aria-pressed, and sends priceSkipped only', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b2');
    $('button[data-price-skip]', f).dispatchEvent(new Event('click', { bubbles: true }));
    expect($('button[data-price-skip]', f).getAttribute('aria-pressed')).toBe('true');
    expect($<HTMLInputElement>('input[value="b2"]', f).checked).toBe(false);
    await sendOk(f);
    const body = sent();
    expect(body.priceSkipped).toBe(true);
    expect(body).not.toHaveProperty('priceBandId');
  });

  it('choosing a band after skip resets aria-pressed and sends priceBandId only', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    $('button[data-price-skip]', f).dispatchEvent(new Event('click', { bubbles: true }));
    pick(f, 'priceBandId', 'b1');
    expect($('button[data-price-skip]', f).getAttribute('aria-pressed')).toBe('false');
    await sendOk(f);
    expect(sent().priceBandId).toBe('b1');
    expect(sent()).not.toHaveProperty('priceSkipped');
  });

  it('the frustration form needs a chip and sends { anonId, chips, otherText?, turnstileToken }', async () => {
    initFeedbackForms();
    const f = $<HTMLFormElement>('form[data-frustration-form]');
    expect($('[data-submit]', f).getAttribute('aria-disabled')).toBe('true');
    pick(f, 'chips', 'other');
    pick(f, 'chips', 'shrinks');
    expect($<HTMLElement>('[data-other-field]', f).hidden).toBe(false);
    $<HTMLInputElement>('input[name="otherText"]', f).value = 'itchy';
    await sendOk(f);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/frustration');
    expect(sent()).toEqual({
      anonId: expect.stringMatching(UUID),
      chips: ['shrinks', 'other'],
      otherText: 'itchy',
      turnstileToken: 'tok-1',
    });
  });
});

describe('messages, retries and persistence', () => {
  it('shows the unavailable message when there is no token and sends nothing', async () => {
    ts.token = null;
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(live(f)).toBe('Feedback is temporarily unavailable.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps selections and shows the message after an error', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'invalid_request' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b1');
    await sendOk(f);
    expect(live(f)).toMatch(/didn't go through/);
    expect($<HTMLInputElement>('input[value="maybe"]', f).checked).toBe(true);
    expect($<HTMLInputElement>('input[value="b1"]', f).checked).toBe(true);
  });

  it.each([
    [403, 'origin_not_allowed', /moolresha\.com/],
    [409, 'notice_outdated', /privacy notice/],
    [503, 'storage_unavailable', /temporarily unavailable/],
  ])('maps %s %s to its message', async (status, error, re) => {
    fetchMock.mockResolvedValue(reply(status as number, { error }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(live(f)).toMatch(re as RegExp);
  });

  it('shows the rate-limit message with minutes', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'rate_limited' }, { 'Retry-After': '120' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(live(f)).toMatch(/2 minutes/);
  });

  it('on bot_check_failed resets Turnstile and retries once with a fresh token', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'bot_check_failed' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ts.reset).toHaveBeenCalledTimes(1);
    expect(sent(0).turnstileToken).toBe('tok-1');
    expect(sent(1).turnstileToken).toBe('tok-2');
    expect(live(f)).toMatch(/saved/i);
  });

  it('stops after one bot-check retry and shows the message', async () => {
    fetchMock.mockImplementation(async () => reply(403, { error: 'bot_check_failed' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(live(f)).toMatch(/not a bot/);
  });

  it('on invalid_anon_id clears the stored id and retries once with a new one', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_anon_id' }));
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(1).anonId).toMatch(UUID);
    expect(sent(1).anonId).not.toBe(sent(0).anonId);
  });

  it('saves selections to sessionStorage under mr_form_<conceptId> and restores them', () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    $('button[data-price-skip]', f).dispatchEvent(new Event('click', { bubbles: true }));
    expect(sessionStorage.getItem(`mr_form_${A}`)).toContain('maybe');

    document.body.innerHTML = conceptForm(A);
    initFeedbackForms();
    const g = form(A);
    expect($<HTMLInputElement>('input[value="maybe"]', g).checked).toBe(true);
    expect($('button[data-price-skip]', g).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('market reveal', () => {
  it('hides every unanswered card on start-up', () => {
    initFeedbackForms();
    for (const id of [A, B]) {
      expect(market(id).hidden).toBe(true);
      expect(market(id).dataset.reveal).toBe('hidden');
    }
  });

  it('reveals only the stored Concept, from either storage', () => {
    sessionStorage.setItem('mr_price_answered', JSON.stringify([A]));
    localStorage.setItem('mr_price_answered', JSON.stringify([B]));
    initFeedbackForms();
    for (const id of [A, B]) {
      expect(market(id).hidden).toBe(false);
      expect(market(id).dataset.reveal).toBe('shown');
      expect(market(id).open).toBe(true);
    }
    resetFeedbackIslandMemory();
    document.body.innerHTML = conceptForm(A) + conceptForm(B);
    localStorage.clear();
    initFeedbackForms();
    expect(market(A).hidden).toBe(false);
    expect(market(B).hidden).toBe(true);
  });

  it.each([
    ['band', () => pick(form(A), 'priceBandId', 'b1')],
    ['skip', () => $('button[data-price-skip]', form(A)).dispatchEvent(new Event('click', { bubbles: true }))],
  ])('reveals and opens only that card after a %s 200, announces it and keeps focus', async (_n, answer) => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    answer();
    const focused = $<HTMLInputElement>('input[value="maybe"]', f);
    focused.focus();
    await sendOk(f);
    expect(market(A).hidden).toBe(false);
    expect(market(A).open).toBe(true);
    expect(market(A).dataset.reveal).toBe('shown');
    expect(market(B).hidden).toBe(true);
    expect(live(f)).toContain("Similar pieces' prices are now shown below.");
    expect(document.activeElement).toBe(focused);
    for (const st of [sessionStorage, localStorage]) expect(JSON.parse(st.getItem('mr_price_answered')!)).toEqual([A]);
  });

  it('does not reveal after a 200 without a price answer', async () => {
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    await sendOk(f);
    expect(market(A).hidden).toBe(true);
    expect(sessionStorage.getItem('mr_price_answered')).toBeNull();
    expect(live(f)).not.toContain('Similar pieces');
  });

  it.each([
    ['400', () => reply(400, { error: 'invalid_request' })],
    ['429', () => reply(429, { error: 'rate_limited' })],
    ['network error', () => Promise.reject(new TypeError('offline'))],
  ])('does not reveal after a %s', async (_n, make) => {
    fetchMock.mockImplementation(async () => make());
    initFeedbackForms();
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b1');
    await sendOk(f);
    expect(market(A).hidden).toBe(true);
    expect(sessionStorage.getItem('mr_price_answered')).toBeNull();
  });

  it('still reveals when both storages throw', async () => {
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
    expect(market(A).hidden).toBe(true);
    const f = form(A);
    pick(f, 'verdict', 'maybe');
    pick(f, 'priceBandId', 'b1');
    await sendOk(f);
    expect(market(A).hidden).toBe(false);
    expect(market(A).open).toBe(true);
  });
});

describe('no-JS markup', () => {
  it('keeps each details present, closed and not hidden before init', () => {
    for (const id of [A, B]) {
      expect(market(id)).toBeTruthy();
      expect(market(id).hasAttribute('open')).toBe(false);
      expect(market(id).hasAttribute('hidden')).toBe(false);
      expect(market(id).dataset.reveal).toBe('pending');
    }
  });
});
