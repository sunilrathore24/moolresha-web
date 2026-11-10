import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile, TURNSTILE_VERIFY_URL } from '../../functions/_shared/turnstile';
import {
  forgetSubscriber,
  subscribeToMailerLite,
  MAILERLITE_BASE_URL,
} from '../../functions/_shared/mailerlite';

// Test-only placeholder values. No real secrets.
const tsEnv = { TURNSTILE_SECRET: 'test-secret', PREVIEW_ORIGIN: 'https://feature-x.moolresha-web.pages.dev' };
const mlEnv = { MAILERLITE_API_KEY: 'test-ml-key', ML_GROUP_ID: 'group-123' };

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

describe('verifyTurnstile', () => {
  it('posts the secret, token and ip to siteverify and accepts a good result', async () => {
    const { fn, calls } = mockFetch(() =>
      jsonResponse(200, { success: true, hostname: 'www.moolresha.com', 'error-codes': [] }),
    );
    const r = await verifyTurnstile('tok', '203.0.113.9', tsEnv, fn);
    expect(r).toEqual({ ok: true, codes: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TURNSTILE_VERIFY_URL);
    expect(calls[0].init.method).toBe('POST');
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get('secret')).toBe('test-secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('203.0.113.9');
  });

  it('accepts the configured preview hostname', async () => {
    const { fn } = mockFetch(() =>
      jsonResponse(200, { success: true, hostname: 'feature-x.moolresha-web.pages.dev' }),
    );
    expect((await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn)).ok).toBe(true);
  });

  it('fails on success: false and returns the error codes', async () => {
    const { fn } = mockFetch(() =>
      jsonResponse(200, { success: false, 'error-codes': ['invalid-input-response'] }),
    );
    const r = await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn);
    expect(r.ok).toBe(false);
    expect(r.codes).toEqual(['invalid-input-response']);
  });

  it('fails on a replayed token (timeout-or-duplicate)', async () => {
    const { fn } = mockFetch(() =>
      jsonResponse(200, { success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    const r = await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn);
    expect(r).toEqual({ ok: false, codes: ['timeout-or-duplicate'] });
    expect(warn).not.toHaveBeenCalled(); // a bot or replay is not an infrastructure failure
  });

  it('fails on hostname mismatch even when success is true', async () => {
    const { fn } = mockFetch(() => jsonResponse(200, { success: true, hostname: 'evil.example' }));
    const r = await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn);
    expect(r.ok).toBe(false);
    expect(r.codes).toContain('hostname_mismatch');
  });

  it('fails when the hostname is missing', async () => {
    const { fn } = mockFetch(() => jsonResponse(200, { success: true }));
    expect((await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn)).ok).toBe(false);
  });

  it('fails and logs turnstile_unavailable on network failure, without personal data', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const r = await verifyTurnstile('secret-token-value', '203.0.113.9', tsEnv, fn);
    expect(r.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain('turnstile_unavailable');
    expect(logged).not.toContain('secret-token-value');
    expect(logged).not.toContain('203.0.113.9');
    expect(logged).not.toContain('test-secret');
  });

  it('fails and logs turnstile_unavailable on a non-200 response', async () => {
    const { fn } = mockFetch(() => jsonResponse(500, { success: true, hostname: 'www.moolresha.com' }));
    const r = await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn);
    expect(r.ok).toBe(false);
    expect(String(warn.mock.calls[0][0])).toContain('turnstile_unavailable');
  });

  it('fails when the response body is not JSON', async () => {
    const { fn } = mockFetch(() => new Response('<html>', { status: 200 }));
    const r = await verifyTurnstile('tok', '1.2.3.4', tsEnv, fn);
    expect(r.ok).toBe(false);
    expect(String(warn.mock.calls[0][0])).toContain('turnstile_unavailable');
  });

  it('fails without calling the network when the token is empty', async () => {
    const { fn } = mockFetch(() => jsonResponse(200, { success: true }));
    expect((await verifyTurnstile('', '1.2.3.4', tsEnv, fn)).ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('subscribeToMailerLite', () => {
  it('sends the documented request shape', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(201, { data: { id: '1' } }));
    const r = await subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    expect(r).toEqual({ ok: true, status: 201, mlSync: 'sent' });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(`${MAILERLITE_BASE_URL}/api/subscribers`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-ml-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      email: 'a@example.com',
      groups: ['group-123'],
      status: 'unconfirmed',
      fields: { size: 'm' },
    });
  });

  it('sends no IP address or other personal field', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(200));
    await subscribeToMailerLite('a@example.com', 'l', mlEnv, fn);
    const body = JSON.parse(String(calls[0].init.body));
    expect(Object.keys(body).sort()).toEqual(['email', 'fields', 'groups', 'status']);
    expect(JSON.stringify(body)).not.toMatch(/ip_address|opted_in_at|optin_ip/);
  });

  it('omits fields when no size is given', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(200));
    await subscribeToMailerLite('a@example.com', null, mlEnv, fn);
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('fields');
  });

  it.each([200, 201])('treats %i as sent', async (status) => {
    const { fn } = mockFetch(() => jsonResponse(status));
    const r = await subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    expect(r).toEqual({ ok: true, status, mlSync: 'sent' });
  });

  it('treats 422 as failed and logs ml_rejected with the status only', async () => {
    const { fn } = mockFetch(() => jsonResponse(422, { message: 'invalid email a@example.com' }));
    const r = await subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    expect(r).toEqual({ ok: false, status: 422, mlSync: 'failed' });
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain('ml_rejected');
    expect(logged).not.toContain('a@example.com');
  });

  it.each([500, 502, 503])('treats %i as pending so the admin can retry', async (status) => {
    const { fn } = mockFetch(() => jsonResponse(status));
    const r = await subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    expect(r).toEqual({ ok: false, status, mlSync: 'pending' });
  });

  it('treats a network error as pending with status 0 and does not throw', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const r = await subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    expect(r).toEqual({ ok: false, status: 0, mlSync: 'pending' });
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
    const pending = subscribeToMailerLite('a@example.com', 'm', mlEnv, fn);
    await vi.advanceTimersByTimeAsync(4999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const r = await pending;
    expect(aborted).toBe(true);
    expect(r).toEqual({ ok: false, status: 0, mlSync: 'pending' });
  });
});

describe('forgetSubscriber', () => {
  it('posts to /api/subscribers/:id/forget (not DELETE)', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(200));
    const r = await forgetSubscriber('42', mlEnv, fn);
    expect(r).toEqual({ ok: true, status: 200 });
    expect(calls[0].url).toBe(`${MAILERLITE_BASE_URL}/api/subscribers/42/forget`);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer test-ml-key');
  });

  it('encodes the id in the path', async () => {
    const { fn, calls } = mockFetch(() => jsonResponse(200));
    await forgetSubscriber('a/b', mlEnv, fn);
    expect(calls[0].url).toBe(`${MAILERLITE_BASE_URL}/api/subscribers/a%2Fb/forget`);
  });

  it('reports failure on 404 and on network error', async () => {
    const notFound = mockFetch(() => jsonResponse(404));
    expect(await forgetSubscriber('1', mlEnv, notFound.fn)).toEqual({ ok: false, status: 404 });
    const down = vi.fn(async () => {
      throw new TypeError('down');
    });
    expect(await forgetSubscriber('1', mlEnv, down)).toEqual({ ok: false, status: 0 });
  });
});
