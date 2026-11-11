/**
 * WhatsApp confirmation via Meta's WhatsApp Business Cloud API (Graph API).
 *
 * Mirrors `mailerlite.ts`'s shape and failure handling on purpose: best-effort, never throws,
 * never fails the visitor's request. The interest row is already saved before this runs.
 *
 * Not configured until `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and
 * `WHATSAPP_TEMPLATE_NAME` are all set as Cloudflare Pages secrets/vars — until then every call
 * returns `waSync: 'not_configured'` without making a network request, so the feature stays a
 * silent no-op in any environment (e.g. previews) where it hasn't been provisioned yet.
 *
 * The template itself (its exact wording) is approved in Meta's WhatsApp Manager, not here — this
 * module only names it and fills its one placeholder with the visitor's first name if available,
 * else a generic greeting is used by the template itself (template text decides that, not this code).
 */
import type { Env } from './env';

export const WHATSAPP_API_VERSION = 'v21.0';
export const WHATSAPP_TIMEOUT_MS = 5000;

export type WhatsappEnv = Pick<
  Env,
  'WHATSAPP_ACCESS_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID' | 'WHATSAPP_TEMPLATE_NAME' | 'WHATSAPP_TEMPLATE_LANGUAGE'
>;

/** Used when WHATSAPP_TEMPLATE_LANGUAGE is unset. Must match the template's approved language exactly. */
export const DEFAULT_TEMPLATE_LANGUAGE = 'en';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Value surfaced to the caller (and, in future, a DB column) after a send attempt. */
export type WaSync = 'sent' | 'pending' | 'failed' | 'not_configured';

export interface SendWhatsappResult {
  ok: boolean;
  /** HTTP status, or 0 when no response arrived (network error or timeout). */
  status: number;
  waSync: WaSync;
}

/** Logs only an event name and the status code, never the phone number or response body. */
function logStatus(event: string, status: number): void {
  console.warn(JSON.stringify({ event, status }));
}

/** Rejects when the signal aborts, so a fetch that ignores the signal still times out. */
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  });
}

function isConfigured(env: WhatsappEnv): env is Required<WhatsappEnv> {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE_NAME);
}

/** `+919812345678` -> `919812345678`. The Graph API's `to` field takes digits, no leading `+`. */
function toGraphRecipient(phone: string): string {
  return phone.replace(/^\+/, '');
}

/**
 * Sends the one approved confirmation template to `phone` (already validated/normalised to
 * `+91XXXXXXXXXX` by the interest schema).
 *
 * - 200             -> sent
 * - 400-499         -> failed (bad token, unapproved template, number not reachable, etc. — logged)
 * - 5xx, timeout     -> pending (treated as "try again later", same as MailerLite's pending state)
 * - not configured   -> not_configured, no network call made
 */
export async function sendWhatsappConfirmation(
  phone: string,
  env: WhatsappEnv,
  fetchImpl: FetchLike = fetch,
): Promise<SendWhatsappResult> {
  if (!isConfigured(env)) {
    return { ok: false, status: 0, waSync: 'not_configured' };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toGraphRecipient(phone),
    type: 'template',
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE ?? DEFAULT_TEMPLATE_LANGUAGE },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);
  let status = 0;
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      abortPromise(controller.signal),
    ]);
    status = response.status;
  } catch {
    status = 0;
  } finally {
    clearTimeout(timer);
  }

  if (status === 200) return { ok: true, status, waSync: 'sent' };
  if (status >= 400 && status < 500) {
    logStatus('wa_failed', status);
    return { ok: false, status, waSync: 'failed' };
  }
  logStatus('wa_pending', status);
  return { ok: false, status, waSync: 'pending' };
}
