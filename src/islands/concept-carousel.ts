/**
 * Design lab carousel (progressive enhancement over ConceptsSection.astro).
 *
 * Without JavaScript all five Concept_Cards show stacked and the nav stays `hidden`,
 * so no dead buttons appear. With JavaScript one card shows at a time; the others
 * keep their markup and get the `hidden` attribute.
 *
 * Hooks:
 *   [data-concept-carousel]          root
 *   [data-cc-nav][hidden]            tabs and arrows; the island removes `hidden`
 *   button[data-cc-tab="<id>"]       one per Concept; the island sets aria-pressed
 *   button[data-cc-prev|data-cc-next] previous / next (wraps around)
 *   [data-cc-status]                 polite live text, "Concept 2 of 5: <name>"
 *   [data-concept-card][data-concept-id]  the cards
 *
 * A location hash that points at an element inside a card (for example
 * `#concept-mens-linen-shirt`) shows that card. Motion is CSS-only and is turned off
 * under prefers-reduced-motion.
 */

export function initConceptCarousel(root: HTMLElement): boolean {
  if (root.hasAttribute('data-cc-ready')) return false;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-concept-card]')];
  const nav = root.querySelector<HTMLElement>('[data-cc-nav]');
  if (!nav || cards.length < 2) return false;
  const tabs = [...nav.querySelectorAll<HTMLElement>('[data-cc-tab]')];
  const status = root.querySelector<HTMLElement>('[data-cc-status]');
  let current = -1;

  function show(index: number): void {
    const n = cards.length;
    const i = ((index % n) + n) % n;
    if (i === current) return;
    current = i;
    const card = cards[i] as HTMLElement;
    cards.forEach((c, k) => {
      c.hidden = k !== i;
    });
    for (const t of tabs) t.setAttribute('aria-pressed', String(t.dataset.ccTab === card.dataset.conceptId));
    const name = card.querySelector('h3')?.textContent?.trim() ?? '';
    if (status) status.textContent = `Concept ${i + 1} of ${n}${name ? `: ${name}` : ''}`;
  }

  /** Index of the card holding the hash target, or -1. */
  function fromHash(): { index: number; target: HTMLElement | null } {
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return { index: -1, target: null };
    }
    const target = id ? document.getElementById(id) : null;
    return { index: target ? cards.findIndex((c) => c.contains(target)) : -1, target };
  }

  nav.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>('button');
    if (!btn || !nav.contains(btn)) return;
    if (btn.hasAttribute('data-cc-prev')) show(current - 1);
    else if (btn.hasAttribute('data-cc-next')) show(current + 1);
    else if (btn.dataset.ccTab) show(cards.findIndex((c) => c.dataset.conceptId === btn.dataset.ccTab));
  });

  const onHash = (scroll: boolean): void => {
    const { index, target } = fromHash();
    if (index < 0) return;
    show(index);
    if (scroll && target) target.scrollIntoView();
  };
  window.addEventListener('hashchange', () => onHash(true));

  const initial = fromHash();
  show(initial.index >= 0 ? initial.index : 0);
  root.setAttribute('data-cc-ready', '');
  nav.hidden = false;
  if (initial.index >= 0 && initial.target) initial.target.scrollIntoView();
  return true;
}

export function initAll(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-concept-carousel]').forEach((r) => initConceptCarousel(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
