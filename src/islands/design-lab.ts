/**
 * Design lab island (progressive enhancement over ConceptsSection.astro).
 *
 * Without JavaScript the slide row is a stack of plain sections, each with a
 * `href="#concept-<id>"` link ("View the design"), and all five Concept_Cards show one
 * after another. With JavaScript the slide row becomes a single-at-a-time carousel: one
 * slide and its matching card show at a time, the rest get the `hidden` attribute but keep
 * their markup.
 *
 * Hooks:
 *   [data-design-lab]               root; gets the class `dl-enhanced` once the island runs
 *   [data-dl-stage]                 the carousel: arrows, slides and dots
 *   [data-dl-slides]                slide row
 *   [data-dl-slide="<panel id>"]    one slide per Concept
 *   [data-dl-dots][hidden]          dot row; `hidden` removed here
 *   button[data-dl-dot]             one dot per Concept, index as its value
 *   button[data-dl-prev|data-dl-next][hidden]
 *   [data-dl-status]                visible "Concept 2 of 5" text (polite live region)
 *   [data-concept-card]             the panels, found by the slide's panel id
 *
 * Keys on the stage (while an arrow or a dot has focus): Left / Right move and select
 * (wrapping), Home / End jump. A location hash that points inside a card shows that card.
 */

export const ENHANCED_CLASS = 'dl-enhanced';

export function initDesignLab(root: HTMLElement): boolean {
  if (root.classList.contains(ENHANCED_CLASS)) return false;
  const stage = root.querySelector<HTMLElement>('[data-dl-stage]');
  const list = root.querySelector<HTMLElement>('[data-dl-slides]');
  if (!stage || !list) return false;
  const slides = [...list.querySelectorAll<HTMLElement>('[data-dl-slide]')];
  const panels = slides.map((s) => document.getElementById(s.dataset.dlSlide ?? ''));
  if (slides.length < 2 || panels.some((p) => !p || !root.contains(p))) return false;
  const ps = panels as HTMLElement[];
  const prev = stage.querySelector<HTMLButtonElement>('[data-dl-prev]');
  const next = stage.querySelector<HTMLButtonElement>('[data-dl-next]');
  const dotsWrap = stage.querySelector<HTMLElement>('[data-dl-dots]');
  const dots = [...stage.querySelectorAll<HTMLButtonElement>('[data-dl-dot]')];
  const status = root.querySelector<HTMLElement>('[data-dl-status]');
  let current = -1;

  function select(index: number, focusTarget?: HTMLElement | null): void {
    const n = slides.length;
    const i = ((index % n) + n) % n;
    if (i !== current) {
      current = i;
      slides.forEach((s, k) => {
        s.hidden = k !== i;
      });
      ps.forEach((p, k) => {
        p.hidden = k !== i;
      });
      dots.forEach((d, k) => {
        d.setAttribute('aria-selected', String(k === i));
      });
      if (status) status.textContent = `Concept ${i + 1} of ${n}`;
    }
    focusTarget?.focus();
  }

  dotsWrap?.addEventListener('click', (e) => {
    const dot = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-dl-dot]');
    if (!dot) return;
    select(dots.indexOf(dot));
  });

  prev?.addEventListener('click', () => select(current - 1));
  next?.addEventListener('click', () => select(current + 1));

  stage.addEventListener('keydown', (e) => {
    const onControl = (e.target as HTMLElement | null)?.closest('[data-dl-dot], [data-dl-prev], [data-dl-next]');
    if (!onControl) return;
    const to =
      e.key === 'ArrowRight' ? current + 1
      : e.key === 'ArrowLeft' ? current - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? slides.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    select(to, dots[((to % dots.length) + dots.length) % dots.length]);
  });

  /** Index of the panel holding the hash target, or -1. */
  function fromHash(): { index: number; target: HTMLElement | null } {
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return { index: -1, target: null };
    }
    const target = id ? document.getElementById(id) : null;
    return { index: target ? ps.findIndex((p) => p.contains(target)) : -1, target };
  }

  window.addEventListener('hashchange', () => {
    const { index, target } = fromHash();
    if (index < 0) return;
    select(index);
    target?.scrollIntoView();
  });

  const initial = fromHash();
  select(initial.index >= 0 ? initial.index : 0);
  root.classList.add(ENHANCED_CLASS);
  prev?.removeAttribute('hidden');
  next?.removeAttribute('hidden');
  dotsWrap?.removeAttribute('hidden');
  if (initial.index >= 0) initial.target?.scrollIntoView();
  return true;
}

export function initAll(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-design-lab]').forEach((r) => initDesignLab(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
