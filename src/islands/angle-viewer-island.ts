/**
 * Angle_Viewer island (Requirements 8A.2 to 8A.10, 8A.15). Own code, no library.
 * Server markup: src/components/launch/AngleViewer.astro (its header comment
 * lists the hooks used here). `goto`/`shown`/`INITIAL` (from ./angle-viewer-state.ts)
 * still track which frame is current — `goto` already does exactly "jump to any
 * of the Concept_Views or Extra_Views", which is all a thumbnail click needs.
 *
 * Keyboard Left/Right and drag/swipe no longer step through the fixed five
 * Turn_Views: the thumbnail strip is dynamic (AngleViewer.astro renders only the
 * views that actually have a photo, see `shownBases`), so instead they step
 * through `navigable` — the views actually rendered, read from the DOM in order
 * at init — one at a time. Clicking, keying and dragging all land on the exact
 * same set of views: whatever is really in the thumbnail strip.
 */
import { VIEW_NAMES, VIEW_BASES, type ViewBase } from '../lib/concept-views';
import {
  EXTRA_VIEW_NAMES,
  EXTRA_VIEWS,
  INITIAL,
  dragOutcome,
  goto,
  keyOutcome,
  shown,
  type ExtraView,
  type ViewerState,
} from './angle-viewer-state';
import { isLightboxOpenFor, openLightbox, updateLightboxImage, updateLightboxNav } from './image-lightbox';

const CLICKABLE_VIEWS: readonly string[] = [...VIEW_BASES, ...EXTRA_VIEWS];

function displayName(view: string): string {
  return VIEW_NAMES[view as ViewBase] ?? EXTRA_VIEW_NAMES[view as ExtraView] ?? view;
}

/** Crossfade budget in ms (CSS fades over 250 ms). Also caps the wait for decode(). */
const FADE_MS = 300;

/** Added to the root once the island has run (e2e waits for this; no visible effect). */
export const ENHANCED_CLASS = 'av-enhanced';

type MediaQuery = { matches: boolean; addEventListener?: (type: 'change', cb: () => void) => void };
export interface AngleViewerEnv {
  matchMedia?: (query: string) => MediaQuery;
}

const started = new WeakSet<Element>();

/** Starts one viewer. Returns false when it was already started or has no stage. */
export function initAngleViewer(root: HTMLElement, env: AngleViewerEnv = {}): boolean {
  const stage = root.querySelector<HTMLElement>('.av-stage');
  if (!stage || started.has(root)) return false;
  started.add(root);

  const mm = env.matchMedia ?? (typeof matchMedia === 'function' ? matchMedia.bind(globalThis) : undefined);
  const reduceMq = mm?.('(prefers-reduced-motion: reduce)');
  let reduced = !!reduceMq?.matches;
  reduceMq?.addEventListener?.('change', () => {
    reduced = !!reduceMq.matches;
    if (reduced) settle();
  });

  // Frames 02 to 08 come out of the inert template, still `hidden`.
  const tpl = root.querySelector<HTMLTemplateElement>('template[data-av-frames]');
  if (tpl) stage.append(tpl.content.cloneNode(true));
  const frames = new Map<string, HTMLElement>();
  stage.querySelectorAll<HTMLElement>('.av-frame[data-view]').forEach((f) => frames.set(f.dataset.view ?? '', f));

  const thumbs = [...root.querySelectorAll<HTMLButtonElement>('.av-thumb')];
  const live = root.querySelector<HTMLElement>('.av-position');

  // The views actually rendered, in DOM order — exactly what's in the thumbnail strip, and
  // the sequence keyboard/drag step through. `goto` still resolves a click or step to the
  // right ViewerState; `navigable` only decides *which view comes next*.
  const navigable = thumbs.map((t) => t.dataset.view ?? '').filter((v) => v !== '');

  let state: ViewerState = INITIAL;
  let token = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;

  /** Ends any fade at once: every frame that is not current is hidden. */
  function settle(): void {
    clearTimeout(timer);
    for (const f of frames.values()) if (!f.hasAttribute('data-current')) f.hidden = true;
  }

  function swap(to: HTMLElement | undefined): void {
    if (!to) return;
    const mine = ++token;
    settle();
    const from = [...frames.values()].find((f) => f.hasAttribute('data-current'));
    if (from === to) return;
    to.hidden = false;
    const commit = () => {
      if (mine !== token) return;
      void to.offsetWidth; // flush styles so the opacity transition runs
      from?.removeAttribute('data-current');
      to.setAttribute('data-current', '');
      if (!from) return;
      if (reduced) {
        from.hidden = true;
        return;
      }
      const hide = () => {
        clearTimeout(timer);
        if (mine === token) from.hidden = true;
      };
      from.addEventListener('transitionend', (e) => e.target === from && hide(), { once: true });
      timer = setTimeout(hide, FADE_MS);
    };
    const img = to.querySelector('img');
    if (reduced || !img) return commit();
    img.loading = 'eager';
    const decoded = typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
    void Promise.race([decoded, new Promise((r) => setTimeout(r, FADE_MS))]).then(commit);
  }

  /** Index of a view within `navigable`, or -1 if it isn't rendered at all. */
  function navIndex(view: string): number {
    return navigable.indexOf(view);
  }

  /** The next view after `view` in the thumbnail strip, or null at the end. */
  function navNeighbour(view: string, dir: 'next' | 'prev'): string | null {
    const i = navIndex(view);
    if (i === -1) return null;
    return navigable[i + (dir === 'next' ? 1 : -1)] ?? null;
  }

  function navPositionText(view: string): string {
    const i = navIndex(view);
    return i === -1 ? displayName(view) : `${displayName(view)}, ${i + 1} of ${navigable.length}`;
  }

  /** Starts the download of the views next to the current one in the thumbnail strip. */
  function prefetch(): void {
    for (const v of [navNeighbour(shown(state), 'prev'), navNeighbour(shown(state), 'next')]) {
      if (v) frames.get(v)?.querySelector('img')?.setAttribute('loading', 'eager');
    }
  }

  function arm(): void {
    armed = true;
    prefetch();
  }

  /** The current frame's own image, if it has one (not a placeholder). */
  function currentImg(): HTMLImageElement | null {
    return frames.get(shown(state))?.querySelector('img') ?? null;
  }

  function render(before: ViewerState, after: ViewerState): void {
    const current = shown(after);
    for (const t of thumbs) t.setAttribute('aria-current', String(t.dataset.view === current));
    const text = navPositionText(current);
    if (live && live.textContent !== text) live.textContent = text;
    if (shown(before) !== current) swap(frames.get(current));
    if (armed) prefetch();
    if (expandBtn && isLightboxOpenFor(expandBtn)) {
      const img = currentImg();
      if (img) updateLightboxImage(img.currentSrc || img.src, img.alt);
      updateLightboxNav(navNeighbour(current, 'prev') !== null, navNeighbour(current, 'next') !== null);
    }
  }

  /** Steps to the next/previous view in the thumbnail strip; does nothing at either end. */
  function step(dir: 'next' | 'prev'): void {
    const to = navNeighbour(shown(state), dir);
    if (to) set(goto(state, to as ViewBase | ExtraView));
  }

  const expandBtn = root.querySelector<HTMLButtonElement>('[data-av-expand]');
  expandBtn?.addEventListener('click', () => {
    const img = currentImg();
    if (!img) return; // a placeholder has nothing to show full screen
    openLightbox({
      src: img.currentSrc || img.src,
      alt: img.alt,
      onPrev: () => step('prev'),
      onNext: () => step('next'),
      trigger: expandBtn,
    });
    updateLightboxNav(navNeighbour(shown(state), 'prev') !== null, navNeighbour(shown(state), 'next') !== null);
  });

  function set(to: ViewerState): void {
    const before = state;
    state = to;
    render(before, to);
  }

  render(state, state);

  root.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLElement>('.av-thumb');
    if (!b || !root.contains(b)) return;
    const view = b.dataset.view;
    if (view && CLICKABLE_VIEWS.includes(view)) set(goto(state, view as ViewBase | ExtraView));
  });

  root.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const o = keyOutcome(e.key);
    if (!o) return;
    e.preventDefault();
    step(o);
  });

  root.addEventListener('focusin', arm, { once: true });

  // Drag and swipe: one step per gesture, horizontal only.
  let start: { id: number; x: number; y: number } | null = null;
  const release = (id: number) => {
    try {
      stage.releasePointerCapture(id);
    } catch {
      /* not captured */
    }
  };
  stage.addEventListener('pointerdown', (e) => {
    arm();
    if (!e.isPrimary || e.button > 0) return;
    // Pointer capture retargets the mouse's later `click` to the capturing element (here,
    // `stage`) instead of whatever was actually under the cursor — so capturing on a
    // pointerdown that started on the expand button would silently swallow its own click.
    // Skip starting a drag/capture at all when the gesture begins on a real control.
    if ((e.target as Element).closest('button, a')) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
  });
  stage.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const { x, y, id } = start;
    start = null;
    release(id);
    const threshold = Math.max(24, 0.08 * stage.getBoundingClientRect().width);
    const o = dragOutcome(e.clientX - x, e.clientY - y, threshold);
    if (o) step(o);
  });
  stage.addEventListener('pointercancel', (e) => {
    if (start && e.pointerId === start.id) release(start.id);
    start = null;
  });

  // Arms prefetch-on-hover-intent even before a click.
  stage.addEventListener('pointerenter', arm);

  root.classList.add(ENHANCED_CLASS);
  return true;
}

export function initAll(scope: ParentNode = document, env?: AngleViewerEnv): void {
  scope.querySelectorAll<HTMLElement>('[data-angle-viewer]').forEach((r) => initAngleViewer(r, env));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
