import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ERROR_MESSAGES,
  MSG_UNAVAILABLE,
  post,
  rateLimitedMessage,
  type FetchImpl,
} from '../../src/islands/api-client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fetchReturning(res: Response): FetchImpl & ReturnType<typeof vi.fn> {
  return vi.fn(async () => res) as unknown as FetchImpl & ReturnType<typeof vi.fn>;
}

const noUtm = { utm: {} };

describe('post: success', () => {
  it('returns parsed data and sends JSON via POST', async () => {
    const fetchImpl = fetchReturning(jsonResponse(200, { ok: true, storedAt: 'now' }));
    const result = await post<{ ok: boolean }>('/api/feedback', { conceptId: 'x' }, { fetchImpl, ...noUtm });
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true, storedAt: 'now' } });

    const [path, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/feedback');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ conceptId: 'x' });
  });

  it('does not set cookies or send credentials', async () => {
    document.cookie = '';
    const fetchImpl = fetchReturning(jsonResponse(200, {}));
    await post('/api/events', {}, { fetchImpl, ...noUtm });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBeUndefined();
    expect(document.cookie).toBe('');
  });
});

describe('post: UTM', () => {
  it('attaches utm to the body', async () => {
    const fetchImpl = fetchReturning(jsonResponse(200, {}));
    await post('/api/feedback', { a: 1 }, { fetchImpl, utm: { source: 'ig', campaign: 'c1' } });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ a: 1, utm: { source: 'ig', campaign: 'c1' } });
  });

  it('omits utm when the visit has none', async () => {
    const fetchImpl = fetchReturning(jsonResponse(200, {}));
    await post('/api/feedback', { a: 1 }, { fetchImpl, ...noUtm });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ a: 1 });
  });

  it('captures utm from the session by default', async () => {
    sessionStorage.setItem('mr_utm', JSON.stringify({ source: 'news' }));
    try {
      const fetchImpl = fetchReturning(jsonResponse(200, {}));
      await post('/api/events', { name: 'page_view' }, { fetchImpl });
      const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
      expect(body.utm).toEqual({ source: 'news' });
    } finally {
      sessionStorage.clear();
    }
  });
});

describe('post: network errors and timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns kind network when fetch rejects', async () => {
    const fetchImpl: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'network', reason: 'offline', message: MSG_UNAVAILABLE });
  });

  it('aborts after 10 seconds and reports a network error', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchImpl = (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    };
    const pending = post('/api/feedback', {}, { fetchImpl, ...noUtm });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);

    await expect(pending).resolves.toMatchObject({ ok: false, kind: 'network', reason: 'timeout' });
  });

  it('does not abort a request that finishes in time', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchImpl = async (_input, init) => {
      signal = init?.signal ?? undefined;
      return jsonResponse(200, { ok: true });
    };
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(result.ok).toBe(true);
    expect(signal?.aborted).toBe(false);
  });
});

describe('post: error codes', () => {
  const cases: Array<[number, string]> = [
    [400, 'invalid_request'],
    [400, 'invalid_anon_id'],
    [400, 'consent_required'],
    [403, 'origin_not_allowed'],
    [403, 'bot_check_failed'],
    [409, 'notice_outdated'],
    [413, 'payload_too_large'],
    [415, 'unsupported_media_type'],
    [503, 'storage_unavailable'],
    [503, 'results_unavailable'],
  ];

  it.each(cases)('maps %i %s to its plain-language message', async (status, code) => {
    const fetchImpl = fetchReturning(jsonResponse(status, { error: code }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', status, code, message: ERROR_MESSAGES[code] });
  });

  it('uses the exact copy from the design for key messages', () => {
    expect(ERROR_MESSAGES.invalid_request).toBe(
      "Something in your answer didn't go through. Please check and try again.",
    );
    expect(ERROR_MESSAGES.origin_not_allowed).toBe('Feedback can only be sent from moolresha.com.');
    expect(ERROR_MESSAGES.bot_check_failed).toBe("We couldn't confirm you're not a bot. Please try again.");
    expect(ERROR_MESSAGES.storage_unavailable).toBe(
      'Feedback is temporarily unavailable. Everything on this page is still here to read.',
    );
    expect(ERROR_MESSAGES.payload_too_large).toBe(ERROR_MESSAGES.invalid_request);
  });

  it('includes the retry time on a 429', async () => {
    const fetchImpl = fetchReturning(jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': '120' }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 429, code: 'rate_limited', retryAfter: 120 });
    expect((result as { message: string }).message).toBe(
      "You've sent a lot of answers in a short time. Please try again in 2 minutes.",
    );
  });

  it('rounds Retry-After up and uses the singular for one minute', () => {
    expect(rateLimitedMessage(1)).toContain('in 1 minute.');
    expect(rateLimitedMessage(61)).toContain('in 2 minutes.');
    expect(rateLimitedMessage(null)).toContain('in a few minutes.');
  });

  it('exposes the field paths from a 400 invalid_request', async () => {
    const fetchImpl = fetchReturning(jsonResponse(400, { error: 'invalid_request', fields: ['priorities', 7] }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', fields: ['priorities'] });
  });

  it('maps an unknown code to the temporarily unavailable message and never shows raw text', async () => {
    const fetchImpl = fetchReturning(jsonResponse(500, { error: 'boom_internal_stack', message: 'secret details' }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 500, message: MSG_UNAVAILABLE });
    expect(result).not.toHaveProperty('code');
    expect(JSON.stringify(result)).not.toContain('secret details');
  });

  it('does not treat inherited property names as known codes', async () => {
    const fetchImpl = fetchReturning(jsonResponse(400, { error: 'constructor' }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, message: MSG_UNAVAILABLE });
  });

  it('handles a non-JSON error body', async () => {
    const fetchImpl = fetchReturning(new Response('<html>nope</html>', { status: 415 }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 415, message: MSG_UNAVAILABLE });
  });

  it('treats a 2xx without JSON as a failure', async () => {
    const fetchImpl = fetchReturning(new Response('ok', { status: 200 }));
    const result = await post('/api/feedback', {}, { fetchImpl, ...noUtm });
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 200, message: MSG_UNAVAILABLE });
  });
});
