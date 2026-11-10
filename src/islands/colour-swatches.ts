/**
 * Colour swatches island (progressive enhancement over ConceptCard.astro's colour panels).
 *
 * Without JavaScript every `[data-colour-panel]` (one complete Angle_Viewer per
 * Palette_Colour) stays visible, one after another, and each swatch is a plain
 * `href="#<panel id>"` anchor jumping to it. With JavaScript exactly one panel
 * shows at a time, and clicking a swatch swaps it instead of jumping.
 *
 * Modelled on `design-lab.ts`'s "one panel visible, the rest `hidden`" pattern,
 * deliberately kept independent of `angle-viewer-island.ts` (each panel runs
 * its own, untouched Angle_Viewer instance underneath).
 *
 * Hooks:
 *   [data-colour-swatches]            root; gets the class `cs-enhanced` once the island runs
 *   a[data-colour-swatch]             one per colour; a plain `href="#<panel id>"` anchor
 *                                      without JS; the island intercepts its click so the
 *                                      page swaps panels in place instead of jumping
 *   [data-colour-panel]               one full Angle_Viewer wrapper per colour; `id` matches
 *                                      the swatch's `href="#<id>"`
 */

export const ENHANCED_CLASS = 'cs-enhanced';

export function initColourSwatches(root: HTMLElement): boolean {
  if (root.classList.contains(ENHANCED_CLASS)) return false;
  const swatches = [...root.querySelectorAll<HTMLAnchorElement>('[data-colour-swatch]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-colour-panel]')];
  if (swatches.length < 2 || panels.length < 2) return false;

  function select(colour: string, focusTarget?: HTMLElement | null): void {
    panels.forEach((p) => {
      p.hidden = p.dataset.colourPanel !== colour;
    });
    swatches.forEach((s) => {
      s.setAttribute('aria-pressed', String(s.dataset.colourSwatch === colour));
    });
    focusTarget?.focus();
  }

  swatches.forEach((s) => {
    s.addEventListener('click', (e) => {
      e.preventDefault();
      select(s.dataset.colourSwatch ?? '', s);
    });
  });

  root.classList.add(ENHANCED_CLASS);
  select(swatches[0]?.dataset.colourSwatch ?? '');
  return true;
}

export function initAll(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-colour-swatches]').forEach((r) => initColourSwatches(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
