/**
 * Task 18.4: axe accessibility audit with zero violations on `/`, `/privacy` and one Journal page
 * (/article/*), checked against WCAG 2.0, 2.1 and 2.2 level A and AA rules, with the page's scripts
 * running (so the revealed controls are audited too) and again with a reveal state (market open).
 *
 * Requirement 21.1. A manual keyboard and screen-reader pass is recorded in docs/launch-checklist.md;
 * axe cannot replace it.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, FIRST_CONCEPT_ID, waitForIslands } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Short, readable list of violations for the failure message. */
function summarise(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`)
    .join('\n');
}

async function audit(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/** Finds one Journal article path from the page's own links. */
async function journalPath(page: Page): Promise<string> {
  await page.goto('/');
  const href = await page.locator('a[href^="/article/"]').first().getAttribute('href');
  expect(href, 'the Launch_Page links to a Journal article').toBeTruthy();
  return href!;
}

test.describe('axe: zero violations (Requirement 21.1)', () => {
  test('/ (Launch_Page) with scripts running', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });

  test('/ (Launch_Page) after a price answer reveals a market range', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const card = page.locator(`[data-concept-card][data-concept-id="${FIRST_CONCEPT_ID}"]`);
    await card.getByRole('radio', { name: 'Would wear' }).check();
    await card.getByRole('button', { name: 'Skip this question' }).click();
    await card.getByRole('button', { name: 'Send feedback' }).click();
    await expect(card.locator('details.market-context')).toBeVisible();
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });

  test('/ (Launch_Page) with an Angle_Viewer tab open and a form error shown', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    await page.locator('[data-angle-viewer]').first().getByRole('button', { name: 'Inside', exact: true }).click();
    // Trigger the Interest_Form field errors.
    const form = page.locator('[data-interest-form]');
    await form.locator('input[name="email"]').fill('not-an-email');
    await form.locator('[data-submit]').scrollIntoViewIfNeeded();
    await form.locator('[data-submit]').click();
    await expect(form.locator('[data-error-for="email"]')).not.toBeEmpty();
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });

  // Not included: axe with JavaScript disabled. axe-core must run a script in the page, so it cannot
  // audit a page whose scripts are switched off. The audits above start from the same server-rendered
  // HTML and add what the islands change; the no-JS page itself is covered by no-js.spec.ts, not by axe.

  test('/privacy', async ({ page }) => {
    await page.goto('/privacy');
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });

  test('a Journal page (/article/*)', async ({ page }) => {
    const path = await journalPath(page);
    await page.goto(path);
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });

  test('/ at 320 px (reflow)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await waitForIslands(page);
    const results = await audit(page);
    expect(results.violations, summarise(results.violations)).toEqual([]);
  });
});
