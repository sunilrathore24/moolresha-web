import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWhatsappConfirmation, WHATSAPP_API_VERSION } from '../../functions/_shared/whatsapp';

// Test-only placeholder values. No real secrets.
const waEnv = {
  WHATSAPP_ACCESS_TOKEN: 'test-wa-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456',
  WHATSAPP_TEMPLATE_NAME: 'interest_confirmation',
};

type Call = { url: string; init: RequestInit };

function mockFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return respond(url, init ?? {});
  });
  return { fn, calls };
}

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe('sendWhatsappConfirmation', () => {
  it('sends the documented request shape and strips the leading +', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(200, { messages: [{ id: 'wamid.1' }] }));
    const r = await sendWhatsappConfirmation('+919812345678', waEnv, fn);
    expect(r).toEqual({ ok: true, status: 200, waSync: 'sent' });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/123456/messages`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-wa-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '919812345678',
      type: 'template',
      template: { name: 'interest_confirmation', language: { code: 'en' } },
    });
  });

  it('never makes a network call when not fully configured', async () => {
    const { fn } = mockFetch(() => jsonResponse(200));
    const partial = { WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '', WHATSAPP_TEMPLATE_NAME: 'x' };
    const r = await sendWhatsappConfirmation('+919812345678', partial, fn);
    expect(r).toEqual({ ok: false, status: 0, waSync: 'not_configured' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('treats 200 as sent', async () => {
    const { fn } = mockFetch(() => jsonResponse(200));
    const r = await sendWhatsappConfirmation('+919812345678', waEnv, fn);
    expect(r).toEqual({ ok: true, status: 200, waSync: 'sent' });
  });

  it('treats 401/404 as failed and logs wa_failed with the status only, never the phone', async () => {
    const { fn } = mockFetch(() => jsonResponse(401, { error: { message: 'bad token for +919812345678' } }));
    const r = await sendWhatsappConfirmation('+919812345678', waEnv, fn);
    expect(r).toEqual({ ok: false, status: 401, waSync: 'failed' });
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain('wa_failed');
    expect(logged).not.toContain('919812345678');
  });

  it.each([500, 502, 503])('treats %i as pending so a retry could succeed later', async (status) => {
    const { fn } = mockFetch(() => jsonResponse(status));
    const r = await sendWhatsappConfirmation('+919812345678', waEnv, fn);
    expect(r).toEqual({ ok: false, status, waSync: 'pending' });
  });

  it('treats a network error as pending with status 0 and does not throw', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const r = await sendWhatsappConfirmation('+919812345678', waEnv, fn);
    expect(r).toEqual({ ok: false, status: 0, waSync: 'pending' });
  });

  it('aborts after 5 s and reports pending', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const pending = sendWhatsappConfirmation('+919812345678', waEnv, fn);
    await vi.advanceTimersByTimeAsync(4999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const r = await pending;
    expect(aborted).toBe(true);
    expect(r).toEqual({ ok: false, status: 0, waSync: 'pending' });
  });
});
