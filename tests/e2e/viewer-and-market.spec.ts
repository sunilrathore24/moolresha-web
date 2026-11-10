/**
 * Task 18.3: Playwright with JavaScript ENABLED.
 *
 * Covers: market range hidden until a skip is submitted against a stubbed /api/feedback, then shown
 * in the same card; mouse drag 120 px moves one view and 10 px does not; touch swipe at 360x640 moves
 * one view (CDP Input.dispatchTouchEvent); a vertical touch swipe scrolls without turning; reduced
 * motion runs no transitions; no first-party document.cookie writes.
 *
 * Requirements 7.2, 7.3, 8A.3, 8A.9, 18.1.
 */
import type { Page } from '@playwright/test';
import { expect, test, FIRST_CONCEPT_ID, shownView, waitForIslands } from './fixtures';

/** Centre of the first Angle_Viewer stage in page (viewport) coordinates. */
async function stageCentre(page: Page) {
  const stage = page.locator('[data-angle-viewer]').first().locator('.av-stage');
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
}

/** Dispatches a touch drag with CDP, the way a finger would move: start, several moves, end. */
async function cdpTouchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('market reveal after a skip (JS on, stubbed API)', () => {
  test('the range is hidden before submitting and shown in the same card after a skip', async ({ page, api }) => {
    await page.goto('/');
    await waitForIslands(page);

    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    const market = card.locator('details.market-context');
    const others = page.locator(`details.market-context:not([data-market-for="${FIRST_CONCEPT_ID}"])`);

    // Before: hidden everywhere.
    await expect(market).toBeHidden();
    await expect(market).toHaveAttribute('data-reveal', 'hidden');
    expect(await others.count()).toBe(4);
    for (const d of await others.all()) await expect(d).toBeHidden();

    // Answer: a verdict and "Skip this question".
    await card.getByRole('radio', { name: 'Would wear' }).check();
    const skip = card.getByRole('button', { name: 'Skip this question' });
    await skip.click();
    await expect(skip).toHaveAttribute('aria-pressed', 'true');
    await card.getByRole('button', { name: 'Send feedback' }).click();

    // After: the same card's range is shown and open; the other four stay hidden.
    await expect(market).toBeVisible();
    expect(await market.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true);
    await expect(market).toHaveAttribute('data-reveal', 'shown');
    await expect(market.locator('.mc-range')).toBeVisible();
    for (const d of await others.all()) await expect(d).toBeHidden();

    // The stubbed API got exactly one request, with priceSkipped and no band.
    expect(api.feedback).toHaveLength(1);
    expect(api.feedback[0]).toMatchObject({ conceptId: FIRST_CONCEPT_ID, verdict: 'would_wear', priceSkipped: true, turnstileToken: 'e2e-stub-token' });
    expect(api.feedback[0]).not.toHaveProperty('priceBandId');

    // The announcement is in the card's live region, and the answer is remembered on reload.
    await expect(card.locator('[data-live-region]')).toContainText("Similar pieces' prices are now shown below.");
    await page.reload();
    await waitForIslands(page);
    await expect(card.locator('details.market-context')).toBeVisible();
    await expect(others.first()).toBeHidden();
  });

  test('a failed submit (stubbed 503) leaves the range hidden and keeps the answer', async ({ page, api }) => {
    api.feedbackStatus = 503;
    await page.goto('/');
    await waitForIslands(page);
    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    await card.getByRole('radio', { name: 'Maybe' }).check();
    await card.getByRole('button', { name: 'Skip this question' }).click();
    await card.getByRole('button', { name: 'Send feedback' }).click();
    await expect(card.locator('[data-live-region]')).toContainText(/temporarily unavailable/i);
    await expect(card.locator('details.market-context')).toBeHidden();
    await expect(card.getByRole('radio', { name: 'Maybe' })).toBeChecked();
  });

  test('nothing goes to the real network: every off-origin request was aborted or stubbed', async ({ page, api }) => {
    await page.goto('/');
    await waitForIslands(page);
    // Only the Turnstile host may be contacted, and that is stubbed; anything else would be in `blocked`.
    expect(api.blocked.filter((u) => !u.includes('challenges.cloudflare.com'))).toEqual([]);
  });
});

test.describe('Angle_Viewer drag (desktop mouse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
  });

  test('a 120 px drag left shows 02-front-three-quarter and a 120 px drag right returns to 01-front', async ({ page }) => {
    const { x, y } = await stageCentre(page);
    expect(await shownView(page)).toBe('01-front');

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 6 });
    await page.mouse.move(x - 120, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => shownView(page)).toBe('02-front-three-quarter');

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 6 });
    await page.mouse.move(x + 120, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => shownView(page)).toBe('01-front');
  });

  test('a 10 px drag changes nothing', async ({ page }) => {
    const { x, y } = await stageCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 10, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await shownView(page)).toBe('01-front');
  });

  test('a mostly vertical drag does not turn the view', async ({ page }) => {
    const { x, y } = await stageCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y + 160, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await shownView(page)).toBe('01-front');
  });

  test('a thumbnail click jumps straight to that view, and the stage keyboard still clamps at 05-back', async ({ page }) => {
    const viewer = page.locator('[data-angle-viewer]').first();
    const thumb = (view: string) => viewer.locator(`.av-thumb[data-view="${view}"]`);
    const stage = viewer.locator('.av-stage');

    // Keyboard still turns the five Turn_Views and clamps at the end (no visible button for this).
    await stage.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => shownView(page)).toBe('05-back');
    await expect(viewer.locator('.av-position')).toHaveText('Back, 5 of 5');

    // A thumbnail click jumps directly to that view and is marked current.
    await thumb('06-inside').click();
    await expect.poll(() => shownView(page)).toBe('06-inside');
    await expect(thumb('06-inside')).toHaveAttribute('aria-current', 'true');
    await expect(thumb('05-back')).toHaveAttribute('aria-current', 'false');
  });
});

test.describe('Angle_Viewer touch (Chromium touch via CDP, 360x640)', () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });

  test('a horizontal touch swipe moves exactly one view in the swipe direction', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const { x, y } = await stageCentre(page);
    expect(await shownView(page)).toBe('01-front');

    await cdpTouchDrag(page, { x: x + 100, y }, { x: x - 100, y }); // swipe left -> next
    await expect.poll(() => shownView(page)).toBe('02-front-three-quarter');
    await page.waitForTimeout(400);
    expect(await shownView(page)).toBe('02-front-three-quarter'); // exactly one step

    await cdpTouchDrag(page, { x: x - 100, y }, { x: x + 100, y }); // swipe right -> previous
    await expect.poll(() => shownView(page)).toBe('01-front');
  });

  test('a vertical touch swipe scrolls the page and leaves the view unchanged', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const { x, y } = await stageCentre(page);
    const before = await page.evaluate(() => window.scrollY);
    await cdpTouchDrag(page, { x, y: Math.min(y + 120, 600) }, { x, y: Math.max(y - 200, 20) }, 12);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    expect(await shownView(page)).toBe('01-front');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a thumbnail click swaps the view at once and no CSS transition is running on .av-frame', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const viewer = page.locator('[data-angle-viewer]').first();
    await viewer.locator('.av-thumb[data-view="02-front-three-quarter"]').click();
    expect(await shownView(page)).toBe('02-front-three-quarter'); // no waiting for a fade
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a instanceof CSSTransition && a.effect && (a.effect as KeyframeEffect).target?.classList.contains('av-frame')).length,
    );
    expect(running).toBe(0);
    const frameTransition = await viewer.locator('.av-frame').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(frameTransition).toMatch(/^0s(, 0s)*$/);
  });

  test('thumbnails have no transitions under reduced motion', async ({ page }) => {
    await page.goto('/');
    const d = await page.locator('.av-thumb').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(d).toMatch(/^0s(, 0s)*$/);
  });
});

test.describe('cookies', () => {
  test('first-party code never writes document.cookie, and no cookies exist after use', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cookieWrites: string[] };
      w.__cookieWrites = [];
      const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get() {
          return desc.get!.call(document);
        },
        set(v: string) {
          w.__cookieWrites.push(String(v));
          desc.set!.call(document, v);
        },
      });
    });
    await page.goto('/');
    await waitForIslands(page);
    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    await card.getByRole('radio', { name: 'Would wear' }).check();
    await card.getByRole('button', { name: 'Skip this question' }).click();
    await card.getByRole('button', { name: 'Send feedback' }).click();
    await expect(card.locator('details.market-context')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __cookieWrites: string[] }).__cookieWrites)).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
  });

  test('the page response sets no cookie', async ({ request }) => {
    for (const path of ['/', '/privacy']) {
      const res = await request.get(path);
      expect(res.headers()['set-cookie'], path).toBeUndefined();
    }
  });
});
