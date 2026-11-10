import type { Env } from './env';

export const MAILERLITE_BASE_URL = 'https://connect.mailerlite.com';
export const MAILERLITE_TIMEOUT_MS = 5000;

/**
 * `Env` (env.ts) does not declare ML_GROUP_ID yet, so it is added here.
 */
export type MailerLiteEnv = Pick<Env, 'MAILERLITE_API_KEY'> & { ML_GROUP_ID: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Value for the `interest.ml_sync` column after a subscribe attempt. */
export type MlSync = 'sent' | 'pending' | 'failed';

export interface SubscribeResult {
  ok: boolean;
  /** HTTP status, or 0 when no response arrived (network error or timeout). */
  status: number;
  mlSync: MlSync;
}

export interface ForgetResult {
  ok: boolean;
  status: number;
}

/** Logs only an event name and the status code, never the email or response body. */
function logStatus(event: string, status: number): void {
  console.warn(JSON.stringify({ event, status }));
}

/** Rejects when the signal aborts, so a fetch that ignores the signal still times out. */
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  });
}

async function callMailerLite(
  path: string,
  body: unknown,
  env: MailerLiteEnv,
  fetchImpl: FetchLike,
): Promise<{ status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAILERLITE_TIMEOUT_MS);
  try {
    const response = await Promise.race([
      fetchImpl(`${MAILERLITE_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      }),
      abortPromise(controller.signal),
    ]);
    return { status: response.status };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates or updates a subscriber as `unconfirmed` in the double opt-in group.
 * Sends no IP address. Never throws; the caller stores `mlSync` on the interest row
 * and still answers the visitor with 200.
 *
 * - 200 / 201            -> sent
 * - 422                  -> failed (logged as `ml_rejected`)
 * - other 4xx            -> failed
 * - 5xx, timeout, network -> pending (the admin retries pending rows)
 */
export async function subscribeToMailerLite(
  email: string,
  size: string | null | undefined,
  env: MailerLiteEnv,
  fetchImpl: FetchLike = fetch,
): Promise<SubscribeResult> {
  const body: Record<string, unknown> = {
    email,
    groups: [env.ML_GROUP_ID],
    status: 'unconfirmed',
  };
  if (size) body.fields = { size };

  const { status } = await callMailerLite('/api/subscribers', body, env, fetchImpl);

  if (status === 200 || status === 201) return { ok: true, status, mlSync: 'sent' };
  if (status === 422) {
    logStatus('ml_rejected', status);
    return { ok: false, status, mlSync: 'failed' };
  }
  if (status >= 400 && status < 500) {
    logStatus('ml_failed', status);
    return { ok: false, status, mlSync: 'failed' };
  }
  logStatus('ml_pending', status);
  return { ok: false, status, mlSync: 'pending' };
}

/**
 * Deletes all subscriber data at MailerLite (`POST /api/subscribers/:id/forget`).
 * Plain DELETE keeps data for re-subscription, so it does not satisfy a deletion request.
 */
export async function forgetSubscriber(
  id: string,
  env: MailerLiteEnv,
  fetchImpl: FetchLike = fetch,
): Promise<ForgetResult> {
  const { status } = await callMailerLite(
    `/api/subscribers/${encodeURIComponent(id)}/forget`,
    undefined,
    env,
    fetchImpl,
  );
  const ok = status >= 200 && status < 300;
  if (!ok) logStatus('ml_forget_failed', status);
  return { ok, status };
}
