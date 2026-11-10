/**
 * Shared Playwright fixtures for the end-to-end specs.
 *
 * `test` is Playwright's `test` plus an automatic `api` fixture that, for every test:
 *   - aborts any request to an origin other than baseURL (so no real network is used),
 *   - stubs the Turnstile script with a stand-in that hands out a fixed token,
 *   - stubs /api/feedback, /api/frustration, /api/interest, /api/events and /api/results,
 *   - records what the page posted, so specs can assert on request bodies.
 *
 * It needs the page's own scripts to run for the form specs, and the dev (or preview) server to be
 * up. The Turnstile site key is read by the island from PUBLIC_TURNSTILE_SITE_KEY at build time; the
 * local .env holds Cloudflare's published always-pass dummy key, so the dev server has one.
 */
import { test as base, expect, type Page } from '@playwright/test';

/** Stand-in for https://challenges.cloudflare.com/turnstile/v0/api.js. */
export const TURNSTILE_STUB = `
window.turnstile = {
  render(el, opts) {
    setTimeout(() => opts && opts.callback && opts.callback('e2e-stub-token'), 0);
    return 'e2e-widget';
  },
  remove() {},
  reset() {},
};`;

export const RESULTS_STUB = {
  ok: true,
  computedAt: '2026-11-20T10:00:00.000Z',
  results: [
    { conceptId: 'mens-cotton-shirt', responses: 3, enough: false },
    { conceptId: 'mens-cotton-linen-shirt', responses: 0, enough: false },
    { conceptId: 'mens-linen-shirt', responses: 0, enough: false },
    { conceptId: 'mens-relaxed-pant', responses: 0, enough: false },
    { conceptId: 'womens-coord-set', responses: 0, enough: false },
  ],
};

export interface ApiLog {
  feedback: Array<Record<string, unknown>>;
  frustration: Array<Record<string, unknown>>;
  interest: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  /** How many requests to /api/* were made (any method). */
  apiRequests: string[];
  /** Off-origin requests that were aborted. */
  blocked: string[];
  /** Set to change what /api/feedback answers. */
  feedbackStatus: number;
}

export async function installStubs(page: Page, baseURL: string): Promise<ApiLog> {
  const log: ApiLog = { feedback: [], frustration: [], interest: [], events: [], apiRequests: [], blocked: [], feedbackStatus: 200 };
  const origin = new URL(baseURL).origin;

  // Registered first, so the more specific routes below take precedence.
  await page.route(
    (url) => url.protocol.startsWith('http') && url.origin !== origin,
    (route) => {
      log.blocked.push(route.request().url());
      return route.abort();
    },
  );

  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_STUB }),
  );

  const json = (status: number, body: unknown) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  const body = (r: { postDataJSON(): unknown }): Record<string, unknown> => {
    try {
      return (r.postDataJSON() ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  await page.route('**/api/feedback', (route) => {
    log.apiRequests.push('/api/feedback');
    log.feedback.push(body(route.request()));
    return route.fulfill(
      log.feedbackStatus === 200
        ? json(200, { ok: true, storedAt: '2026-11-20T10:00:00.000Z' })
        : json(log.feedbackStatus, { ok: false, error: 'storage_unavailable' }),
    );
  });
  await page.route('**/api/frustration', (route) => {
    log.apiRequests.push('/api/frustration');
    log.frustration.push(body(route.request()));
    return route.fulfill(json(200, { ok: true }));
  });
  await page.route('**/api/interest', (route) => {
    log.apiRequests.push('/api/interest');
    log.interest.push(body(route.request()));
    return route.fulfill(json(200, { ok: true, emailConfirmation: 'sent' }));
  });
  await page.route('**/api/events', (route) => {
    log.apiRequests.push('/api/events');
    log.events.push(body(route.request()));
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/results', (route) => {
    log.apiRequests.push('/api/results');
    return route.fulfill(json(200, RESULTS_STUB));
  });
  return log;
}

export const test = base.extend<{ api: ApiLog }>({
  api: [
    async ({ page, baseURL }, use) => {
      const log = await installStubs(page, baseURL ?? 'http://localhost:4321');
      await use(log);
    },
    { auto: true },
  ],
});

export { expect };

/** The Concept ids in page order, as rendered. */
export const FIRST_CONCEPT_ID = 'mens-cotton-shirt';

/** Section order on the Launch_Page (PAGE_SECTIONS). */
export const PAGE_SECTIONS = [
  'hero',
  'journey',
  'money',
  'price-layers',
  'concepts',
  'why',
  'beyond-label',
  'trends',
  'frustration',
  'interest',
  'results',
  'footer',
] as const;

/** The eight views in order, with the visible names (src/lib/concept-views.ts). */
export const VIEW_ORDER: ReadonlyArray<readonly [string, string]> = [
  ['01-front', 'Front'],
  ['02-front-three-quarter', 'Front three-quarter'],
  ['03-side', 'Side'],
  ['04-back-three-quarter', 'Back three-quarter'],
  ['05-back', 'Back'],
  ['06-inside', 'Inside'],
  ['07-fabric-closeup', 'Fabric close-up'],
  ['08-on-model', 'On a model'],
];

/** Waits for the page's islands to have run (the submit button is revealed by the feedback island). */
export async function waitForIslands(page: Page): Promise<void> {
  await page.locator('[data-feedback-form] [data-submit]:not([hidden])').first().waitFor({ state: 'attached' });
  await page.locator('.angle-viewer.av-enhanced').first().waitFor({ state: 'attached' });
}

/** The shown Angle_Viewer view name of the first viewer. */
export async function shownView(page: Page, index = 0): Promise<string | null> {
  return page.locator('[data-angle-viewer]').nth(index).locator('.av-frame[data-current]').getAttribute('data-view');
}
