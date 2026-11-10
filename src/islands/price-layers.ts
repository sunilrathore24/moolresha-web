/**
 * Price_Layers "Show more" island. Server markup: src/components/launch/PriceLayers.astro.
 *
 * Mobile only (below 40rem — `.layers`' own single-column breakpoint, mirrored here via
 * matchMedia so this script and that CSS never disagree on what counts as "mobile"): the first
 * two layer tiles show, the second clipped to about half under a "Show more" overlay, and every
 * tile after that starts collapsed to zero height. Tapping the overlay reveals everything with
 * a plain CSS `max-height` transition — prefers-reduced-motion is handled once, in that CSS
 * rule, not here.
 *
 * Without this script, or at 40rem and up: `.layers` never gets `data-collapsed`, so every tile
 * already renders in full — nothing here can ever hide content that isn't reachable another way.
 */
const MOBILE = '(max-width: 39.99rem)';

export function initPriceLayers(
  root: HTMLElement | null = document.querySelector('[data-price-layers]'),
): void {
  if (!root || root.dataset.plReady === 'true') return;
  const items = [...root.querySelectorAll<HTMLLIElement>(':scope > li')];
  const more = root.querySelector<HTMLButtonElement>('[data-layers-more]');
  if (items.length < 3 || !more) return; // nothing worth collapsing
  root.dataset.plReady = 'true';

  const hiddenItems = items.slice(2);
  const mq = typeof matchMedia === 'function' ? matchMedia(MOBILE) : undefined;

  function setCollapsed(on: boolean): void {
    root?.toggleAttribute('data-collapsed', on);
    more!.hidden = !on;
    more!.setAttribute('aria-expanded', String(!on));
    for (const li of hiddenItems) li.setAttribute('aria-hidden', String(on));
  }

  const sync = () => setCollapsed(mq?.matches ?? false);
  sync();
  mq?.addEventListener?.('change', sync);

  more.addEventListener('click', () => {
    setCollapsed(false);
    // The button that had focus is about to hide (CSS, driven by data-collapsed); move focus
    // to the list itself rather than letting it fall back to the document.
    root?.setAttribute('tabindex', '-1');
    root?.focus({ preventScroll: true });
    root?.addEventListener('blur', () => root?.removeAttribute('tabindex'), { once: true });
  });
}

export function initAll(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-price-layers]').forEach((r) => initPriceLayers(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
