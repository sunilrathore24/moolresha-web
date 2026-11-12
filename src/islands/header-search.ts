/**
 * Header search box (2026-11). Markup hooks: src/components/Header.astro.
 *
 * Without JavaScript the search icon is a plain `<a href="/journal">` — a real fallback, not
 * a dead end. With JS, clicking it opens `[data-search-panel]` instead of following the link,
 * and submitting the form inside sends the visitor straight to the best-matching Concept
 * (src/lib/concept-search.ts) or to the homepage when nothing matches well enough — this never
 * lands on a results/error page, per explicit instruction.
 *
 * Hooks:
 *   a[data-search-toggle][aria-expanded]   the icon; click is intercepted (preventDefault)
 *   [data-search-panel][hidden]            the panel; island removes `hidden` on first use
 *   form[data-search-form]                 contains the one text input
 */
import { matchConcept } from '../lib/concept-search';

const started = new WeakSet<Element>();

export function initHeaderSearch(root: ParentNode = document): boolean {
  const toggle = root.querySelector<HTMLAnchorElement>('[data-search-toggle]');
  const panel = root.querySelector<HTMLElement>('[data-search-panel]');
  const form = root.querySelector<HTMLFormElement>('[data-search-form]');
  const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
  if (!toggle || !panel || !form || !input || started.has(toggle)) return false;
  started.add(toggle);

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  };

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    setOpen(panel.hidden);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = matchConcept(input.value);
    window.location.href = id ? `/designs/${id}` : '/';
  });

  return true;
}

if (typeof document !== 'undefined') {
  const run = (): void => void initHeaderSearch();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
