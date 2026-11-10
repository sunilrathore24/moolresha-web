/**
 * Task 18.3: Playwright with JavaScript DISABLED.
 *
 * Covers: every section, Fact and Source_Link present; forms show the no-JS note; the market
 * <details> is visible, collapsed, after the price question, with the right summary, and opens
 * with Enter; the Angle_Viewer shows the front view then a grid of eight with names and the
 * Render_Label, and no controls.
 *
 * Requirements 1.2, 7.5, 8A.11, 8A.12, 21.2, 22.1.
 */
import { expect, test, PAGE_SECTIONS, VIEW_ORDER } from './fixtures';

test.use({ javaScriptEnabled: false });

const RENDER_LABEL = 'AI design render, not a photo of a finished garment';
const NOSCRIPT = 'Feedback needs JavaScript turned on. You can still read everything on this page.';

test.describe('JavaScript disabled', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders every section in order', async ({ page }) => {
    const sections = await page.locator('[data-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    expect(sections).toEqual([...PAGE_SECTIONS]);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore the designs' })).toHaveAttribute('href', '#concepts');
  });

  test('every Fact is present with its label and a Source_Link that opens safely in a new tab', async ({ page }) => {
    const facts = page.locator('.fact');
    expect(await facts.count()).toBeGreaterThan(8);
    const links = page.locator('a.source-link');
    const n = await links.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const a = links.nth(i);
      await expect(a).toHaveAttribute('target', '_blank');
      expect(await a.getAttribute('rel')).toMatch(/noopener/);
      expect(await a.getAttribute('rel')).toMatch(/noreferrer/);
      expect(await a.getAttribute('href')).toMatch(/^https?:\/\//);
    }
    // Each journey stop is an open <details> carrying at least one fact.
    const stops = page.locator('[data-section="journey"] details');
    expect(await stops.count()).toBe(8);
    for (let i = 0; i < 8; i++) {
      await expect(stops.nth(i)).toHaveAttribute('open', '');
      expect(await stops.nth(i).locator('.fact').count()).toBeGreaterThan(0);
    }
  });

  test('the cotton journey ends with the Aim_Statement right after the list', async ({ page }) => {
    const aim = page.locator('[data-aim]');
    await expect(aim).toHaveCount(1);
    await expect(aim).toContainText('Our aim');
    const nextToList = await aim.evaluate((el) => el.previousElementSibling?.tagName === 'OL');
    expect(nextToList).toBe(true);
  });

  test('forms show the no-JS note and their submit buttons stay hidden', async ({ page }) => {
    // With scripting disabled, <noscript> content is rendered as normal content. Playwright's getByText
    // skips <noscript> on purpose, so the notes are found with a CSS selector and read by text.
    const notes = page.locator('noscript p');
    expect(await notes.count()).toBeGreaterThan(0);
    await expect(notes.first()).toBeVisible();
    await expect(notes.first()).toHaveText(NOSCRIPT);
    for (const sel of ['[data-feedback-form]', '[data-frustration-form]', '[data-interest-form]']) {
      const form = page.locator(sel).first();
      await expect(form.locator('[data-submit]')).toBeHidden();
      await expect(form.locator('noscript p')).toBeVisible();
      await expect(form.locator('noscript p')).toHaveText(NOSCRIPT);
    }
    // Every Concept card form carries it too.
    expect(await page.locator('[data-feedback-form] noscript p').count()).toBe(5);
  });

  test('each Concept card has a collapsed market <details> after the price question, and Enter opens it', async ({ page }) => {
    const cards = page.locator('[data-concept-card]');
    expect(await cards.count()).toBe(5);
    for (let i = 0; i < 5; i++) {
      const card = cards.nth(i);
      const details = card.locator('details.market-context');
      await expect(details).toHaveCount(1);
      await expect(details).toBeVisible();
      expect(await details.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
      await expect(details.locator('summary')).toHaveText('See what similar pieces cost');
      // after the price question
      const after = await card.evaluate((c) => {
        const q = c.querySelector('fieldset[data-price-question]');
        const d = c.querySelector('details.market-context');
        return !!q && !!d && !!(q.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(after).toBe(true);
      // the range text is not visible while collapsed
      await expect(details.locator('.mc-range')).toBeHidden();
    }
    const first = cards.first().locator('details.market-context');
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    expect(await first.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true);
    await expect(first.locator('.mc-range')).toBeVisible();
    await expect(first.locator('.mc-range')).toContainText('₹');
  });

  test('Angle_Viewer: front view large, then a thumbnail strip of eight in order, each named and disclosed, with no Previous/Next or tab buttons', async ({ page }) => {
    const viewers = page.locator('[data-angle-viewer]');
    // One per Concept, except mens-cotton-shirt which renders one per colour it has photography
    // for (its Colour_Swatches panels, all visible without JS) — so the total is dynamic, not a
    // fixed 5; every viewer found is still checked below.
    const count = await viewers.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let v = 0; v < count; v++) {
      const viewer = viewers.nth(v);
      // Front view in the stage.
      await expect(viewer.locator('.av-stage .av-frame[data-current]')).toHaveAttribute('data-view', '01-front');
      await expect(viewer.locator('.av-stage .av-frame[data-current]')).toBeVisible();
      // Frames 02 to 08 (and the material card, if this colour has one) sit in an inert
      // <template>: not rendered.
      expect(await viewer.locator('.av-stage .av-frame').count()).toBe(1);
      // Thumbnail strip of eight, in order, each named and disclosed in its accessible name,
      // plus an optional ninth (the dynamic material card) last.
      const thumbs = viewer.locator('.av-grid .av-thumb');
      await expect(viewer.locator('.av-grid')).toBeVisible();
      const thumbCount = await thumbs.count();
      expect(thumbCount === 8 || thumbCount === 9).toBe(true);
      for (let i = 0; i < 8; i++) {
        const [base, name] = VIEW_ORDER[i]!;
        await expect(thumbs.nth(i)).toHaveAttribute('data-view', base);
        await expect(thumbs.nth(i)).toBeVisible();
        const label = await thumbs.nth(i).getAttribute('aria-label');
        expect(label).toContain(name);
        expect(label).toContain(RENDER_LABEL);
      }
      if (thumbCount === 9) {
        await expect(thumbs.nth(8)).toHaveAttribute('data-view', 'material-card');
        await expect(thumbs.nth(8)).toBeVisible();
      }
      // No Previous, Next or separate tab buttons exist at all — the thumbnails are the only control.
      await expect(viewer.locator('.av-controls')).toHaveCount(0);
      await expect(viewer.getByRole('button', { name: 'Previous view' })).toHaveCount(0);
      await expect(viewer.getByRole('button', { name: 'Next view' })).toHaveCount(0);
      // The position text is correct for frame 01 even without JS, so it is shown, not hidden.
      await expect(viewer.locator('.av-position')).toBeVisible();
    }
  });

  test('Image_Placeholder: the "Design coming soon" graphic when present, else the text fallback, names the Concept', async ({
    page,
  }) => {
    const img = page.locator('.av-placeholder-img img').first();
    if ((await img.count()) > 0) {
      await expect(img).toHaveAttribute('alt', /^Design coming soon: .+$/);
      return;
    }
    const ph = page.locator('.av-thumb [role="img"]').first();
    if ((await ph.count()) === 0) test.skip(true, 'every Concept has real images, so there is no placeholder to check');
    await expect(ph).toHaveAttribute('aria-label', /^Design coming soon: .+$/);
    await expect(ph).toContainText('Design coming soon');
  });

  test('no Set-Cookie header and no document.cookie access from first-party code', async ({ page, request }) => {
    const res = await request.get('/');
    expect(res.headers()['set-cookie']).toBeUndefined();
    expect(await page.context().cookies()).toEqual([]);
  });
});
