import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTurnstile, TURNSTILE_SRC } from '../../src/islands/turnstile-loader';

interface Fake {
  render: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  callbacks: Array<(t: string) => void>;
}

let form: HTMLFormElement;
let fake: Fake;

beforeEach(() => {
  document.body.innerHTML = '<form><input name="a"><div data-turnstile></div></form>';
  form = document.querySelector('form')!;
  fake = { render: vi.fn(), remove: vi.fn(), callbacks: [] };
  fake.render.mockImplementation((_el: HTMLElement, o: { callback: (t: string) => void }) => {
    fake.callbacks.push(o.callback);
    return `w${fake.callbacks.length}`;
  });
  (window as unknown as { turnstile: Fake }).turnstile = fake;
});

afterEach(() => {
  delete (window as unknown as { turnstile?: Fake }).turnstile;
  vi.useRealTimers();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createTurnstile', () => {
  it('does not load the script until the first focus or change', async () => {
    const loadScript = vi.fn().mockResolvedValue(undefined);
    createTurnstile(form, { siteKey: 'k', loadScript });
    expect(loadScript).not.toHaveBeenCalled();
    form.querySelector('input')!.dispatchEvent(new Event('focusin', { bubbles: true }));
    form.dispatchEvent(new Event('change'));
    await flush();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(TURNSTILE_SRC);
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(fake.render.mock.calls[0][0]).toBe(form.querySelector('[data-turnstile]'));
  });

  it('resolves null without a site key and never loads the script', async () => {
    const loadScript = vi.fn().mockResolvedValue(undefined);
    const h = createTurnstile(form, { siteKey: '', loadScript });
    expect(await h.token()).toBeNull();
    expect(loadScript).not.toHaveBeenCalled();
  });

  it('resolves the token that the widget produces', async () => {
    const h = createTurnstile(form, { siteKey: 'k', loadScript: () => Promise.resolve() });
    const p = h.token();
    await flush();
    fake.callbacks[0]('tok-1');
    expect(await p).toBe('tok-1');
  });

  it('gives a fresh token after reset', async () => {
    const h = createTurnstile(form, { siteKey: 'k', loadScript: () => Promise.resolve() });
    const p1 = h.token();
    await flush();
    fake.callbacks[0]('tok-1');
    expect(await p1).toBe('tok-1');
    h.reset();
    expect(fake.remove).toHaveBeenCalledWith('w1');
    expect(fake.render).toHaveBeenCalledTimes(2);
    const p2 = h.token();
    fake.callbacks[1]('tok-2');
    expect(await p2).toBe('tok-2');
  });

  it('resolves null when the script fails to load', async () => {
    const h = createTurnstile(form, { siteKey: 'k', loadScript: () => Promise.reject(new Error('blocked')) });
    expect(await h.token()).toBeNull();
    expect(await h.token()).toBeNull();
  });

  it('resolves null after the timeout when no token arrives', async () => {
    vi.useFakeTimers();
    const h = createTurnstile(form, { siteKey: 'k', loadScript: () => Promise.resolve(), timeoutMs: 10_000 });
    const p = h.token();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBeNull();
  });
});
