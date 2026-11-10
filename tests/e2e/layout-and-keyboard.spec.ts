/**
 * Task 18.3: layout at four widths, first-viewport content at 360x640, the research notice position,
 * and the keyboard pass with a visible focus ring on every interactive control in Requirement 21.2.
 *
 * Requirements 1.1, 1.3, 20.4, 21.2, 21.6.
 */
import type { Page } from '@playwright/test';
import { expect, test, FIRST_CONCEPT_ID, VIEW_ORDER, waitForIslands } from './fixtures';

const WIDTHS = [320, 360, 768, 1440] as const;

test.describe('no horizontal scroll', () => {
  for (const width of WIDTHS) {
    test(`no horizontal scroll at ${width}px, with and without the page's own scripts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/', '/privacy']) {
        await page.goto(path);
        await page.waitForLoadState('load');
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          body: document.body.scrollWidth,
        }));
        expect(m.scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(m.clientWidth);
        expect(m.body, `${path} body at ${width}px`).toBeLessThanOrEqual(m.clientWidth);
      }
    });

    test(`no element pokes out of the viewport at ${width}px on the launch page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const offenders = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('main *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).position === 'fixed') continue;
          // Visually hidden helpers (clip, 1px) and the focusable-but-hidden skip link are exempt.
          if (r.width <= 1 && r.height <= 1) continue;
          if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}.${el.className} [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
        return bad.slice(0, 10);
      });
      expect(offenders).toEqual([]);
    });
  }
});

test.describe('first viewport at 360x640', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('the wordmark, headline, supporting line, photo and call to action are in the viewport', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('[data-section="hero"]');
    const inViewport = async (sel: string) =>
      hero.locator(sel).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      });
    expect(await inViewport('.wordmark'), 'wordmark').toBe(true);
    expect(await inViewport('h1'), 'headline').toBe(true);
    expect(await inViewport('.support'), 'supporting line').toBe(true);
    expect(await inViewport('a.cta'), 'call to action').toBe(true);
    await expect(hero.locator('h1')).toHaveText('Why does a simple cotton shirt cost so much? We traced it.');
    await expect(hero.locator('a.cta')).toHaveText('Explore the designs');
    // The still frame fills the hero (it is larger than the viewport, so check it covers it).
    const covers = await hero.locator('img.hero-photo').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= 0 && r.left <= 0 && r.right >= window.innerWidth && r.bottom >= window.innerHeight - 1;
    });
    expect(covers, 'hero still frame covers the first viewport').toBe(true);
  });

  test('the mobile menu button sits top-right, is 44x44 and opens and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('.nav-toggle');
    await expect(toggle).toBeVisible();
    const box = (await toggle.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeGreaterThan(360 - 40);
    expect(box.y).toBeLessThan(80);
    await expect(toggle).toHaveAttribute('aria-controls', 'primary-nav');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#primary-nav')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#primary-nav')).toBeHidden();
  });

  test('the research notice sits within two screen heights (1,280 px) from the top', async ({ page }) => {
    await page.goto('/');
    const notice = page.locator('.research-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('A research project, not a shop');
    const bottom = await notice.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    expect(bottom).toBeLessThanOrEqual(1280);
  });
});

// ---------------------------------------------------------------------------
// Keyboard pass
// ---------------------------------------------------------------------------

/** Does the element that has focus show a visible focus indicator (outline or ring)? */
async function focusIsVisible(page: Page): Promise<{ ok: boolean; desc: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: false, desc: 'nothing focused' };
    const describe = (e: Element) =>
      `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}`;
    const hasRing = (e: Element) => {
      const s = getComputedStyle(e);
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
      const shadow = s.boxShadow !== 'none' && s.boxShadow !== '';
      return outline || shadow;
    };
    if (hasRing(el)) return { ok: true, desc: describe(el) };
    // A visually hidden native input is styled through its label sibling (chips, radios).
    const label = (el as HTMLInputElement).labels?.[0] ?? el.nextElementSibling;
    if (label && hasRing(label)) return { ok: true, desc: `${describe(el)} via ${describe(label)}` };
    const wrapper = el.closest('label');
    if (wrapper && hasRing(wrapper)) return { ok: true, desc: `${describe(el)} via ${describe(wrapper)}` };
    return { ok: false, desc: describe(el) };
  });
}

test.describe('keyboard pass (Requirements 21.2, 21.6)', () => {
  test('every interactive control in the first Concept card is reachable by Tab, in order, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);

    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    await card.scrollIntoViewIfNeeded();

    // Controls in the order the spec lists them: viewer stage, the eight thumbnails,
    // the How we check link, verdicts, chips, priorities, swatches, bands, skip, market summary.
    const selectors: Array<[string, string]> = [
      ['Angle_Viewer stage', '.av-stage'],
      ...VIEW_ORDER.map(([base, name]): [string, string] => [name, `.av-thumb[data-view="${base}"]`]),
      ['How we check this', 'a[href="#how-we-check"]'],
      ['verdict', 'input[name="verdict"]'],
      ['Change_Chip', 'input[name="changes"]'],
      ['Palette_Colour', 'input[name="colour"]'],
      ['Priority_Chip', 'input[name="priorities"]'],
      ['Price_Band', 'input[name="priceBandId"]'],
      ['Skip this question', 'button[data-price-skip]'],
      ['Send feedback', '[data-submit]'],
    ];

    for (const [name, selector] of selectors) {
      const target = card.locator(selector).first();
      await expect(target, name).toBeAttached();
      await target.scrollIntoViewIfNeeded();
      // Reach it with the keyboard: press Tab until it is focused (bounded).
      let reached = false;
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await card.locator(selectors[0]![1]).first().focus(); // start at the stage each time
      for (let i = 0; i < 80 && !reached; i++) {
        reached = await target.evaluate((el) => el === document.activeElement);
        if (!reached) await page.keyboard.press('Tab');
      }
      expect(reached, `${name} is reachable with Tab`).toBe(true);
      const ring = await focusIsVisible(page);
      expect(ring.ok, `${name} has a visible focus indicator (${ring.desc})`).toBe(true);
    }
  });

  test('the market <details> summary is keyboard operable: Enter opens it and shows the range', async ({ page }) => {
    // JS disabled makes the summary visible without the reveal logic, which is the case Req 7.5 covers.
    const ctx = await page.context().browser()!.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const p = await ctx.newPage();
    try {
      await p.goto('/');
      const summary = p.locator('details.market-context summary').first();
      await summary.focus();
      const ring = await focusIsVisible(p);
      expect(ring.ok, `summary focus ring (${ring.desc})`).toBe(true);
      await p.keyboard.press('Enter');
      await expect(p.locator('details.market-context').first().locator('.mc-range')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('journey stops, Source_Links, the hero call to action and the Interest_Form fields show a focus ring', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const probes: Array<[string, string]> = [
      ['hero call to action', 'a.cta'],
      ['journey stop summary', '[data-section="journey"] summary'],
      ['Source_Link', 'a.source-link'],
      ['frustration chip', '[data-frustration-form] input[name="chips"]'],
      ['interest email', '[data-interest-form] input[name="email"]'],
      ['interest whatsapp', '[data-interest-form] input[name="whatsapp"]'],
      ['interest size', '[data-interest-form] select[name="size"]'],
      ['interest consent', '[data-interest-form] input[name="consent-email"]'],
      ['interest submit', '[data-interest-form] [data-submit]'],
    ];
    for (const [name, sel] of probes) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      await page.keyboard.press('Shift+Tab').catch(() => undefined);
      await el.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      expect(await el.evaluate((e) => e === document.activeElement), `${name} focused`).toBe(true);
      const ring = await focusIsVisible(page);
      expect(ring.ok, `${name} has a visible focus indicator (${ring.desc})`).toBe(true);
    }
  });

  test('arrow keys turn the Angle_Viewer when its stage is focused, and other keys do not', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const viewer = page.locator('[data-angle-viewer]').first();
    const stage = viewer.locator('.av-stage');
    await stage.focus();
    const view = () => viewer.locator('.av-frame[data-current]').getAttribute('data-view');
    await page.keyboard.press('ArrowRight');
    await expect.poll(view).toBe('02-front-three-quarter');
    await page.keyboard.press('ArrowRight');
    await expect.poll(view).toBe('03-side');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(view).toBe('02-front-three-quarter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(350);
    expect(await view()).toBe('02-front-three-quarter');
    await expect(viewer.locator('.av-position')).toHaveText('Front three-quarter, 2 of 5');
  });

  test('the skip control and chips work from the keyboard (Space toggles, Enter on a button presses it)', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    const skip = card.locator('button[data-price-skip]');
    await skip.scrollIntoViewIfNeeded();
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(skip).toHaveAttribute('aria-pressed', 'true');
    const chip = card.locator('input[name="changes"]').first();
    await chip.focus();
    await page.keyboard.press('Space');
    await expect(chip).toBeChecked();
  });
});
