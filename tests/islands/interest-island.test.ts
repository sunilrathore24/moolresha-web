import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initInterestForm,
  MSG_CONFIRM_DELAYED,
  MSG_FIX_FIELDS,
  MSG_LINK_COPIED,
  MSG_LINK_COPY_FAILED,
} from '../../src/islands/interest-island';
import { ANON_ID_KEY, UUID_V4 } from '../../src/islands/anon-id';
import { ERROR_MESSAGES, MSG_UNAVAILABLE } from '../../src/islands/api-client';

const turnstile = vi.hoisted(() => ({
  token: vi.fn<() => Promise<string | null>>(),
  reset: vi.fn(),
}));
vi.mock('../../src/islands/turnstile-loader', () => ({
  createTurnstile: () => ({ token: turnstile.token, reset: turnstile.reset }),
}));

const FORM = `
<div data-section="interest">
<form data-interest-form data-notice-version="2026-10-01">
  <input type="email" name="email" aria-describedby="interest-email-error" />
  <p data-error-for="email" id="interest-email-error"></p>
  <input type="tel" name="whatsapp" aria-describedby="interest-whatsapp-hint interest-whatsapp-error" />
  <p data-error-for="whatsapp" id="interest-whatsapp-error"></p>
  <select name="size"><option value="">Choose</option><option value="m">M</option></select>
  <p data-error-for="size" id="interest-size-error"></p>
  <input type="checkbox" name="consent-email" /><p data-error-for="consent-email" id="interest-consent-email-error"></p>
  <input type="checkbox" name="consent-whatsapp" /><p data-error-for="consent-whatsapp" id="interest-consent-whatsapp-error"></p>
  <input type="checkbox" name="consent-link" /><p data-error-for="consent-link" id="interest-consent-link-error"></p>
  <input type="checkbox" name="consent-adult" /><p data-error-for="consent-adult" id="interest-consent-adult-error"></p>
  <div data-turnstile></div>
  <button type="submit" data-submit hidden>Join</button>
  <p role="status" data-live-region></p>
</form>
<div data-share-prompt hidden>
  <button type="button" data-share-copy>Copy link</button>
  <p role="status" data-share-status></p>
</div>
</div>`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(responses: Response[] = [json(200, { ok: true })]) {
  document.body.innerHTML = FORM;
  const form = document.querySelector('form') as HTMLFormElement;
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => queue.shift() ?? json(200, { ok: true }));
  initInterestForm(form, { fetchImpl });
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
    await vi.waitFor(() => expect(q('[data-live-region]').textContent).not.toBe('Sending…'));
  };
  const errorOf = (name: string) => q<HTMLElement>(`[data-error-for="${name}"]`).textContent;
  const live = () => q<HTMLElement>('[data-live-region]').textContent;
  const sentBody = (n = 0) => JSON.parse(((fetchImpl.mock.calls[n] as unknown[])[1] as RequestInit).body as string);
  const sharePromptHidden = () => document.querySelector('[data-share-prompt]')?.hasAttribute('hidden') ?? true;
  const clickShareCopy = () => {
    document.querySelector<HTMLButtonElement>('[data-share-copy]')?.click();
  };
  const shareStatus = () => document.querySelector('[data-share-status]')?.textContent;
  return { form, fetchImpl, input, type, tick, submit, errorOf, live, sentBody, q, sharePromptHidden, clickShareCopy, shareStatus };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  turnstile.token.mockReset().mockResolvedValue('tok-1');
  turnstile.reset.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('interest island: setup', () => {
  it('reveals the submit button and is idempotent', () => {
    const t = setup();
    expect(t.q('[data-submit]').hasAttribute('hidden')).toBe(false);
    expect(initInterestForm(t.form)).toBe(false);
  });
});

describe('interest island: validation', () => {
  it('sends no request and sets error text and ARIA for a bad email', async () => {
    const t = setup();
    t.type('email', 'not-an-email');
    t.tick('consent-email');
    t.tick('consent-adult');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('email')).not.toBe('');
    expect(t.input('email').getAttribute('aria-invalid')).toBe('true');
    expect(t.input('email').getAttribute('aria-describedby')).toContain('interest-email-error');
    expect(t.live()).toBe(MSG_FIX_FIELDS);
    expect(document.activeElement).toBe(t.input('email'));
  });

  it('adds the error id to aria-describedby once, keeping the hint id', async () => {
    const t = setup();
    t.type('whatsapp', '12345');
    t.tick('consent-whatsapp');
    t.tick('consent-adult');
    await t.submit();
    await t.submit();
    const ids = (t.input('whatsapp').getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.filter((i) => i === 'interest-whatsapp-error')).toHaveLength(1);
    expect(ids).toContain('interest-whatsapp-hint');
    expect(t.errorOf('whatsapp')).not.toBe('');
  });

  it('blocks an email without the email consent', async () => {
    const t = setup();
    t.type('email', 'a@b.in');
    t.tick('consent-adult');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('consent-email')).not.toBe('');
    expect(t.input('consent-email').getAttribute('aria-invalid')).toBe('true');
  });

  it('blocks a number without the WhatsApp consent', async () => {
    const t = setup();
    t.type('whatsapp', '98765 43210');
    t.tick('consent-adult');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('consent-whatsapp')).not.toBe('');
    expect(t.errorOf('consent-adult')).toBe('');
  });

  it('blocks any contact without the 18+ confirmation', async () => {
    const t = setup();
    t.type('email', 'a@b.in');
    t.tick('consent-email');
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('consent-adult')).not.toBe('');
  });

  it('blocks an empty form', async () => {
    const t = setup();
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.errorOf('email')).not.toBe('');
  });

  it('does not require consent-link and clears an error when the field is edited', async () => {
    const t = setup();
    t.type('email', 'bad');
    t.tick('consent-email');
    t.tick('consent-adult');
    await t.submit();
    expect(t.errorOf('email')).not.toBe('');
    t.type('email', 'good@example.com');
    expect(t.errorOf('email')).toBe('');
    expect(t.input('email').hasAttribute('aria-invalid')).toBe(false);
    await t.submit();
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('allows a size alone with no consents', async () => {
    const t = setup();
    t.type('size', 'm');
    await t.submit();
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
    expect(t.sentBody().size).toBe('m');
  });
});

describe('interest island: request body', () => {
  it('sends exactly the strict body with mapped consents', async () => {
    const t = setup();
    t.type('email', '  Name@Example.com ');
    t.type('whatsapp', '98765-43210');
    t.type('size', 'm');
    t.tick('consent-email');
    t.tick('consent-whatsapp');
    t.tick('consent-adult');
    await t.submit();
    const body = t.sentBody();
    expect(Object.keys(body).sort()).toEqual(
      ['anonId', 'consents', 'email', 'noticeVersion', 'size', 'turnstileToken', 'whatsapp'].sort(),
    );
    expect(body.anonId).toMatch(UUID_V4);
    expect(body.anonId).toBe(localStorage.getItem(ANON_ID_KEY));
    expect(body.email).toBe('Name@Example.com');
    expect(body.whatsapp).toBe('+919876543210');
    expect(body.consents).toEqual({ email: true, whatsapp: true, link: false, adult: true });
    expect(body.noticeVersion).toBe('2026-10-01');
    expect(body.turnstileToken).toBe('tok-1');
    expect(((t.fetchImpl.mock.calls[0] as unknown[])[0] as string)).toBe('/api/interest');
  });

  it('omits blank optional fields and carries the link consent', async () => {
    const t = setup();
    t.type('email', 'a@b.in');
    t.tick('consent-email');
    t.tick('consent-link');
    t.tick('consent-adult');
    await t.submit();
    const body = t.sentBody();
    expect('whatsapp' in body).toBe(false);
    expect('size' in body).toBe(false);
    expect(body.consents.link).toBe(true);
  });
});

describe('interest island: responses', () => {
  const valid = (t: ReturnType<typeof setup>) => {
    t.type('email', 'a@b.in');
    t.tick('consent-email');
    t.tick('consent-adult');
  };

  it('asks for a reload on notice_outdated and keeps the selections', async () => {
    const t = setup([json(409, { error: 'notice_outdated' })]);
    valid(t);
    await t.submit();
    expect(t.live()).toBe(ERROR_MESSAGES.notice_outdated);
    expect(t.live()).toMatch(/reload the page/i);
    expect(t.input('email').value).toBe('a@b.in');
    expect(t.input('consent-email').checked).toBe(true);
  });

  it('says the confirmation email may take longer when delayed', async () => {
    const t = setup([json(200, { ok: true, emailConfirmation: 'delayed' })]);
    valid(t);
    await t.submit();
    expect(t.live()).toBe(MSG_CONFIRM_DELAYED);
    expect(t.live()).toMatch(/longer/);
  });

  it('shows a thank-you on success', async () => {
    const t = setup();
    valid(t);
    await t.submit();
    expect(t.live()).toMatch(/Thank you/);
    expect(turnstile.reset).toHaveBeenCalled();
  });

  it('reveals the share prompt on a real success, and only then', async () => {
    const t = setup();
    expect(t.sharePromptHidden()).toBe(true);
    valid(t);
    await t.submit();
    expect(t.live()).toMatch(/Thank you/);
    expect(t.sharePromptHidden()).toBe(false);
  });

  it('keeps the share prompt hidden when the submit is rejected (e.g. an outdated notice)', async () => {
    const t = setup([json(409, { error: 'notice_outdated' })]);
    valid(t);
    await t.submit();
    expect(t.live()).not.toMatch(/Thank you/);
    expect(t.sharePromptHidden()).toBe(true);
  });

  it('retries once with a fresh token after bot_check_failed', async () => {
    turnstile.token.mockResolvedValueOnce('tok-a').mockResolvedValueOnce('tok-b');
    const t = setup([json(403, { error: 'bot_check_failed' }), json(200, { ok: true })]);
    valid(t);
    await t.submit();
    expect(t.fetchImpl).toHaveBeenCalledTimes(2);
    expect(t.sentBody(0).turnstileToken).toBe('tok-a');
    expect(t.sentBody(1).turnstileToken).toBe('tok-b');
    expect(turnstile.reset).toHaveBeenCalledTimes(2);
    expect(t.live()).toMatch(/Thank you/);
  });

  it('shows the bot-check message when the retry fails too', async () => {
    const t = setup([json(403, { error: 'bot_check_failed' }), json(403, { error: 'bot_check_failed' })]);
    valid(t);
    await t.submit();
    expect(t.fetchImpl).toHaveBeenCalledTimes(2);
    expect(t.live()).toBe(ERROR_MESSAGES.bot_check_failed);
  });

  it('shows the unavailable message and sends nothing when the token is null', async () => {
    turnstile.token.mockResolvedValue(null);
    const t = setup();
    valid(t);
    await t.submit();
    expect(t.fetchImpl).not.toHaveBeenCalled();
    expect(t.live()).toBe(MSG_UNAVAILABLE);
    expect(t.live()).toMatch(/temporarily unavailable/);
  });

  it('shows the unavailable message on a network failure', async () => {
    document.body.innerHTML = FORM;
    const form = document.querySelector('form') as HTMLFormElement;
    initInterestForm(form, {
      fetchImpl: async () => {
        throw new TypeError('offline');
      },
    });
    (form.querySelector('[name="size"]') as HTMLSelectElement).value = 'm';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const live = form.querySelector('[data-live-region]') as HTMLElement;
    await vi.waitFor(() => expect(live.textContent).toBe(MSG_UNAVAILABLE));
  });
});

describe('interest island: share prompt copy button', () => {
  it('copies a link to the concepts section and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const t = setup();
    t.clickShareCopy();
    await vi.waitFor(() => expect(t.shareStatus()).toBe(MSG_LINK_COPIED));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#concepts'));
  });

  it('shows a fallback message when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const t = setup();
    t.clickShareCopy();
    await vi.waitFor(() => expect(t.shareStatus()).toBe(MSG_LINK_COPY_FAILED));
  });
});
