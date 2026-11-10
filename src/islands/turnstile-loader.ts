/**
 * Turnstile loader. The widget script is third-party, so it is fetched lazily on the
 * first focus or change inside a form, never on page load. A token is single-use:
 * `token()` hands one out, `reset()` renders a fresh widget for the next submission.
 * `token()` resolves null when the key is missing, the script cannot load or no
 * token arrives within the timeout, so the island can say feedback is unavailable.
 * Requirements 14.3, 22.2.
 */

export interface TurnstileHandle {
  token(): Promise<string | null>;
  reset(): void;
}

export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
export const TURNSTILE_TIMEOUT_MS = 10_000;

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string | undefined;
  remove(widgetId: string): void;
}

function readSiteKey(): string | undefined {
  try {
    // @ts-ignore Vite inlines this at build time; outside Vite `import.meta.env` is undefined.
    const key: unknown = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
    return typeof key === 'string' && key !== '' ? key : undefined;
  } catch {
    return undefined;
  }
}

let scriptPromise: Promise<void> | undefined;

/** Default loader: one `<script>` element for the whole page, shared by every form. */
function loadScriptTag(src: string): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined;
      reject(new Error('turnstile script failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function createTurnstile(
  form: HTMLElement,
  opts: { siteKey?: string; loadScript?: (src: string) => Promise<void>; timeoutMs?: number } = {},
): TurnstileHandle {
  const siteKey = opts.siteKey || readSiteKey();
  const load = opts.loadScript ?? loadScriptTag;
  const timeoutMs = opts.timeoutMs ?? TURNSTILE_TIMEOUT_MS;

  let started = false;
  let broken = false;
  let widget: string | undefined;
  let current: string | null = null;
  let used = false;
  let waiters: Array<(t: string | null) => void> = [];

  const api = (): TurnstileApi | undefined => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

  const flush = (t: string | null): void => {
    const w = waiters;
    waiters = [];
    w.forEach((f) => f(t));
  };

  const deliver = (t: string): void => {
    if (waiters.length > 0) {
      used = true;
      current = null;
      flush(t);
    } else {
      current = t;
    }
  };

  const fail = (): void => {
    broken = true;
    flush(null);
  };

  const render = (): void => {
    const turnstile = api();
    const el = form.querySelector<HTMLElement>('[data-turnstile]');
    if (!turnstile || !el) return fail();
    widget = turnstile.render(el, {
      sitekey: siteKey,
      callback: deliver,
      'error-callback': () => flush(null),
      'expired-callback': () => {
        current = null;
      },
    });
  };

  const start = (): void => {
    if (started || !siteKey) return;
    started = true;
    load(TURNSTILE_SRC).then(render).catch(fail);
  };

  form.addEventListener('focusin', start, { once: true });
  form.addEventListener('change', start, { once: true });

  const reset = (): void => {
    current = null;
    used = false;
    if (widget === undefined) return;
    try {
      api()?.remove(widget);
    } catch {
      // The widget is already gone.
    }
    widget = undefined;
    render();
  };

  return {
    token() {
      if (!siteKey || broken) return Promise.resolve(null);
      if (used) reset();
      start();
      if (current !== null) {
        const t = current;
        current = null;
        used = true;
        return Promise.resolve(t);
      }
      return new Promise<string | null>((resolve) => {
        const done = (t: string | null): void => {
          clearTimeout(timer);
          resolve(t);
        };
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== done);
          resolve(null);
        }, timeoutMs);
        waiters.push(done);
      });
    },
    reset,
  };
}
