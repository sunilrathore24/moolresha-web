/**
 * Interest_Form island (Requirements 12.4, 12.5, 12.6, 12.10, 14.7, 22.2).
 * Markup hooks: src/components/launch/InterestForm.astro (header comment).
 *
 * Field checks use validateInterest (src/lib/interest-validate.ts), a small copy of the
 * InterestBody rules in the Functions that does not pull zod into the browser bundle.
 * tests/unit/interest-validate.test.ts checks the two against each other, so the client
 * and server rules cannot drift. Messages are written here in plain words; the validator
 * only decides which field is wrong.
 */
import { validateInterest } from '../lib/interest-validate';
import {
  INTEREST_FIELDS as F,
  INTEREST_FIELD_ORDER,
  interestErrorId,
  whatsappForSubmit,
  type InterestFieldName,
} from '../lib/interest-fields';
import { getAnonId } from './anon-id';
import { MSG_UNAVAILABLE, post, type FetchImpl } from './api-client';
import { createTurnstile } from './turnstile-loader';

export const MSG_FIX_FIELDS = 'Please fix the highlighted fields and send again.';
export const MSG_THANKS = 'Thank you. You are on the list.';
export const MSG_THANKS_CONFIRM = 'Thank you. Please check your inbox for a confirmation email.';
export const MSG_CONFIRM_DELAYED =
  'Thank you. Your details are saved. The confirmation email may take longer than usual to arrive.';
export const MSG_LINK_COPIED = 'Link copied.';
export const MSG_LINK_COPY_FAILED = 'Could not copy the link. You can copy it from the address bar instead.';

/** The three success messages that mean the submission actually went through. */
const SUCCESS_MESSAGES: ReadonlySet<string> = new Set([MSG_THANKS, MSG_THANKS_CONFIRM, MSG_CONFIRM_DELAYED]);

const FIELD_MESSAGES: Record<InterestFieldName, string> = {
  email: 'Enter a valid email address, such as name@example.com.',
  whatsapp: 'Enter a 10-digit Indian mobile number that starts with 6, 7, 8 or 9.',
  size: 'Choose a size from the list.',
  'consent-email': 'Tick the email box to let us store your email address.',
  'consent-whatsapp': 'Tick the WhatsApp box to let us store your number.',
  'consent-link': 'Tick the link box only if you want your answers linked to your contact details.',
  'consent-adult': 'Confirm that you are 18 or older.',
};
const MSG_NEED_ONE = 'Add an email address, a WhatsApp number or choose a size.';

export interface InterestEnv {
  /** Injected in tests; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
}

const started = new WeakSet<Element>();

export function initInterestForm(form: HTMLFormElement, env: InterestEnv = {}): boolean {
  if (started.has(form)) return false;
  started.add(form);

  const control = (name: InterestFieldName) =>
    form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  const slot = (name: InterestFieldName) => form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  const live = form.querySelector<HTMLElement>('[data-live-region]');
  const submit = form.querySelector<HTMLElement>('[data-submit]');
  const say = (text: string) => {
    if (live) live.textContent = text;
  };

  // The share prompt is a sibling of the form (shown once, after a real success), not a
  // form control, so it is found from the section, not from `form`.
  const section = form.closest('[data-section]') ?? form.parentElement ?? document;
  const sharePrompt = (section as ParentNode).querySelector<HTMLElement>('[data-share-prompt]');
  const shareCopyBtn = (section as ParentNode).querySelector<HTMLButtonElement>('[data-share-copy]');
  const shareStatus = (section as ParentNode).querySelector<HTMLElement>('[data-share-status]');

  shareCopyBtn?.addEventListener('click', () => {
    void (async () => {
      try {
        const url = `${location.origin}${location.pathname}#concepts`;
        await navigator.clipboard.writeText(url);
        if (shareStatus) shareStatus.textContent = MSG_LINK_COPIED;
      } catch {
        if (shareStatus) shareStatus.textContent = MSG_LINK_COPY_FAILED;
      }
    })();
  });

  function setError(name: InterestFieldName, message: string): void {
    const s = slot(name);
    const c = control(name);
    if (s) s.textContent = message;
    if (c) {
      c.setAttribute('aria-invalid', 'true');
      const id = interestErrorId(name);
      const ids = (c.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      if (!ids.includes(id)) c.setAttribute('aria-describedby', [...ids, id].join(' '));
    }
  }

  function clearError(name: InterestFieldName): void {
    const s = slot(name);
    if (s) s.textContent = '';
    control(name)?.removeAttribute('aria-invalid');
  }

  const clearAll = () => INTEREST_FIELD_ORDER.forEach(clearError);

  function readBody(): Record<string, unknown> {
    const text = (n: InterestFieldName) => (control(n)?.value ?? '').trim();
    const checked = (n: InterestFieldName) => (control(n) as HTMLInputElement | null)?.checked === true;
    const body: Record<string, unknown> = { anonId: getAnonId() };
    const email = text(F.email);
    const whatsapp = whatsappForSubmit(text(F.whatsapp));
    const size = text(F.size);
    if (email) body.email = email;
    if (whatsapp) body.whatsapp = whatsapp;
    if (size) body.size = size;
    body.consents = {
      email: checked(F.consentEmail),
      whatsapp: checked(F.consentWhatsapp),
      link: checked(F.consentLink),
      adult: checked(F.consentAdult),
    };
    body.noticeVersion = form.dataset.noticeVersion ?? '';
    return body;
  }

  /** Returns the fields to flag, in page order. Empty when the body passes. */
  function validate(body: Record<string, unknown>): Map<InterestFieldName, string> {
    const bad = new Map<InterestFieldName, string>();
    for (const issue of validateInterest(body)) {
      const f = issue.field;
      if (f === 'other') continue;
      if (f === 'none') {
        if (!bad.has(F.email)) bad.set(F.email, MSG_NEED_ONE);
      } else if (!bad.has(f)) {
        bad.set(f, FIELD_MESSAGES[f]);
      }
    }
    return bad;
  }

  const ts = createTurnstile(form);
  let busy = false;

  async function send(body: Record<string, unknown>): Promise<string> {
    const opts = env.fetchImpl ? { fetchImpl: env.fetchImpl } : {};
    let retried = false;
    for (;;) {
      const token = await ts.token();
      if (token === null) return MSG_UNAVAILABLE;
      const res = await post<{ ok?: boolean; emailConfirmation?: string }>(
        '/api/interest',
        { ...body, turnstileToken: token },
        opts,
      );
      ts.reset(); // a Turnstile token works once
      if (res.ok) {
        if (res.data?.emailConfirmation === 'delayed') return MSG_CONFIRM_DELAYED;
        return body.email !== undefined ? MSG_THANKS_CONFIRM : MSG_THANKS;
      }
      if (!res.ok && res.kind === 'http' && res.code === 'bot_check_failed' && !retried) {
        retried = true;
        continue;
      }
      return res.message;
    }
  }

  async function onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (busy) return;
    clearAll();
    const body = readBody();
    const bad = validate(body);
    if (bad.size > 0) {
      for (const [name, msg] of bad) setError(name, msg);
      say(MSG_FIX_FIELDS);
      const first = INTEREST_FIELD_ORDER.find((n) => bad.has(n));
      if (first) control(first)?.focus();
      return;
    }
    busy = true;
    submit?.setAttribute('aria-disabled', 'true');
    say('Sending…');
    try {
      const result = await send(body);
      say(result);
      if (SUCCESS_MESSAGES.has(result)) sharePrompt?.removeAttribute('hidden');
    } catch {
      say(MSG_UNAVAILABLE);
    } finally {
      busy = false;
      submit?.removeAttribute('aria-disabled');
    }
  }

  const onEdit = (e: Event) => {
    const name = (e.target as HTMLInputElement | null)?.name as InterestFieldName | undefined;
    if (name && INTEREST_FIELD_ORDER.includes(name)) clearError(name);
  };
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('submit', (e) => void onSubmit(e));
  submit?.removeAttribute('hidden');
  return true;
}

export function initAll(scope: ParentNode = document, env?: InterestEnv): void {
  scope.querySelectorAll<HTMLFormElement>('form[data-interest-form]').forEach((f) => initInterestForm(f, env));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
