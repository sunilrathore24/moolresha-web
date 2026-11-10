import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAll, initAngleViewer, type AngleViewerEnv } from '../../src/islands/angle-viewer-island';
import { VIEW_BASES, VIEW_NAMES } from '../../src/lib/concept-views';

const [first, ...rest] = VIEW_BASES;

const frame = (v: string, extra = '') =>
  `<figure class="av-frame" data-view="${v}" ${extra}><img src="/${v}.png" alt="${v}" loading="lazy"></figure>`;

/** Hand-built copy of the AngleViewer.astro markup (no-JS state): one big photo, then
 * the always-visible thumbnail strip — no Previous/Next buttons, no separate tabs. */
function html(): string {
  const thumb = (v: string) =>
    `<li><button type="button" class="av-thumb" data-view="${v}" aria-current="${v === first ? 'true' : 'false'}" aria-label="Show ${VIEW_NAMES[v]}"><img src="/${v}.png" alt="" loading="lazy"></button></li>`;
  return `
<div class="angle-viewer" data-angle-viewer data-concept-id="mens-cotton-shirt">
  <div class="av-stage" role="group" tabindex="0" aria-label="views">
    ${frame(first, 'data-current')}
  </div>
  <p class="av-position" aria-live="polite">Front, 1 of 8</p>
  <template data-av-frames>${rest.map((v) => frame(v, 'hidden')).join('')}</template>
  <ul class="av-grid">${VIEW_BASES.map(thumb).join('')}</ul>
</div>`;
}

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, s: string) => root.querySelector(s) as T;
const current = (root: ParentNode) =>
  [...root.querySelectorAll('.av-frame')].filter((f) => f.hasAttribute('data-current')).map((f) => (f as HTMLElement).dataset.view);
const mq = (reduce: boolean, hover = true): AngleViewerEnv => ({
  matchMedia: (query) => ({ matches: query.includes('reduced-motion') ? reduce : hover }),
});

let root: HTMLElement;
function setup(env: AngleViewerEnv = mq(true)) {
  document.body.innerHTML = html();
  root = q(document, '[data-angle-viewer]');
  initAngleViewer(root, env);
}
const click = (s: string) => q(root, s).click();
// `.av-thumb[data-view]` and `.av-frame[data-view]` share the attribute name, so the
// selector must be scoped to the thumbnail, not just any `[data-view]` match.
const thumb = (v: string) => `.av-thumb[data-view="${v}"]`;
const press = (target: Element, key: string) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};
function pointer(target: Element, type: string, x: number, y: number, id = 1) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: id, isPrimary: true, button: 0, clientX: x, clientY: y, pointerType: 'mouse' });
  target.dispatchEvent(ev);
}
function drag(dx: number, dy = 0) {
  const stage = q(root, '.av-stage');
  pointer(stage, 'pointerdown', 100, 100);
  pointer(stage, 'pointerup', 100 + dx, 100 + dy);
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('no-JS markup before init', () => {
  it('shows the big photo and the thumbnail strip, with no hidden controls', () => {
    document.body.innerHTML = html();
    expect(document.querySelector('.av-controls')).toBeNull();
    expect(q(document, '.av-grid').hidden).toBe(false);
    expect(q(document, '.av-position').hasAttribute('hidden')).toBe(false);
    expect(document.querySelectorAll('.av-stage .av-frame')).toHaveLength(1);
    expect(document.querySelectorAll('.av-grid li')).toHaveLength(8);
    expect(document.querySelectorAll('.av-thumb')).toHaveLength(8);
  });
});

describe('start-up', () => {
  it('clones frames 02 to 08 and marks the first thumbnail current', () => {
    setup();
    const views = [...root.querySelectorAll('.av-stage .av-frame')].map((f) => (f as HTMLElement).dataset.view);
    expect(views).toEqual([...VIEW_BASES]);
    expect(current(root)).toEqual(['01-front']);
    expect(q(root, '.av-position').textContent).toBe('Front, 1 of 8');
    expect(q(root, thumb('01-front')).getAttribute('aria-current')).toBe('true');
    for (const v of VIEW_BASES.slice(1)) expect(q(root, thumb(v)).getAttribute('aria-current')).toBe('false');
  });

  it('is idempotent and initAll covers every root', () => {
    document.body.innerHTML = html() + html();
    initAll(document, mq(true));
    const roots = [...document.querySelectorAll<HTMLElement>('[data-angle-viewer]')];
    expect(roots.every((r) => r.querySelectorAll('.av-frame').length === 8)).toBe(true);
    expect(initAngleViewer(roots[0], mq(true))).toBe(false);
    expect(roots[0].querySelectorAll('.av-frame')).toHaveLength(8);
  });
});

describe('thumbnails', () => {
  it('clicking any thumbnail makes it the current frame and marks it aria-current, unmarking the rest', () => {
    setup();
    click(thumb('05-back'));
    expect(current(root)).toEqual(['05-back']);
    expect(q(root, thumb('05-back')).getAttribute('aria-current')).toBe('true');
    expect(q(root, thumb('01-front')).getAttribute('aria-current')).toBe('false');
    expect(q(root, '.av-position').textContent).toBe('Back, 5 of 8');
  });

  it('jumps directly between non-adjacent views (no stepping through the ones in between)', () => {
    setup();
    click(thumb('08-on-model'));
    expect(current(root)).toEqual(['08-on-model']);
    click(thumb('02-front-three-quarter'));
    expect(current(root)).toEqual(['02-front-three-quarter']);
  });

  it('clicking a Tab_View thumbnail, then a Turn_View thumbnail, behaves like goto (no remembered-turn surprises)', () => {
    setup();
    click(thumb('03-side'));
    click(thumb('06-inside'));
    expect(current(root)).toEqual(['06-inside']);
    expect(q(root, '.av-position').textContent).toBe('Inside, 6 of 8');
    click(thumb('04-back-three-quarter'));
    expect(current(root)).toEqual(['04-back-three-quarter']);
    expect(q(root, '.av-position').textContent).toBe('Back three-quarter, 4 of 8');
  });
});

describe('arrow keys', () => {
  it('turns on ArrowRight and ArrowLeft and prevents default only for those keys', () => {
    setup();
    const stage = q(root, '.av-stage');
    expect(press(stage, 'ArrowRight').defaultPrevented).toBe(true);
    expect(current(root)).toEqual(['02-front-three-quarter']);
    expect(press(stage, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(current(root)).toEqual(['01-front']);
    for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'a', 'Home']) {
      expect(press(stage, key).defaultPrevented).toBe(false);
    }
    expect(current(root)).toEqual(['01-front']);
  });

  it('clamps at the first and last view in the thumbnail strip (now the full eight, not just the five Turn_Views)', () => {
    setup();
    const stage = q(root, '.av-stage');
    press(stage, 'ArrowLeft');
    expect(current(root)).toEqual(['01-front']);
    for (let i = 0; i < 10; i++) press(stage, 'ArrowRight');
    expect(current(root)).toEqual(['08-on-model']);
    expect(q(root, '.av-position').textContent).toBe('On a model, 8 of 8');
  });
});

describe('drag and swipe', () => {
  beforeEach(() => {
    setup();
    q(root, '.av-stage').getBoundingClientRect = () => ({ width: 400 }) as DOMRect; // threshold = max(24, 32) = 32
  });

  it('moves one step in the drag direction when beyond the threshold', () => {
    drag(-40);
    expect(current(root)).toEqual(['02-front-three-quarter']);
    drag(60);
    expect(current(root)).toEqual(['01-front']);
  });

  it('does nothing below the threshold or when the move is mostly vertical', () => {
    drag(-20);
    expect(current(root)).toEqual(['01-front']);
    drag(-40, 60);
    expect(current(root)).toEqual(['01-front']);
  });

  it('captures the pointer and discards the gesture on pointercancel', () => {
    const stage = q(root, '.av-stage');
    const capture = vi.fn();
    stage.setPointerCapture = capture;
    pointer(stage, 'pointerdown', 100, 100);
    expect(capture).toHaveBeenCalledWith(1);
    pointer(stage, 'pointercancel', 100, 100);
    pointer(stage, 'pointerup', 0, 100);
    expect(current(root)).toEqual(['01-front']);
  });
});

describe('crossfade and reduced motion', () => {
  it('swaps instantly under reduced motion, with the old frame hidden', () => {
    setup(mq(true));
    click(thumb('02-front-three-quarter'));
    expect(current(root)).toEqual(['02-front-three-quarter']);
    expect(q(root, '[data-view="01-front"]').hidden).toBe(true);
  });

  it('under normal motion keeps both frames, then finishes within 300 ms', async () => {
    vi.useFakeTimers();
    setup(mq(false));
    click(thumb('02-front-three-quarter'));
    expect(current(root)).toEqual(['01-front']);
    await vi.advanceTimersByTimeAsync(301);
    expect(current(root)).toEqual(['02-front-three-quarter']);
    expect(q(root, '[data-view="02-front-three-quarter"]').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(301);
    expect(q(root, '[data-view="01-front"]').hidden).toBe(true);
  });

  it('ends on the state the module holds after fast clicking', async () => {
    vi.useFakeTimers();
    setup(mq(false));
    click(thumb('02-front-three-quarter'));
    click(thumb('03-side'));
    click(thumb('04-back-three-quarter'));
    await vi.advanceTimersByTimeAsync(700);
    expect(current(root)).toEqual(['04-back-three-quarter']);
    const visible = [...root.querySelectorAll<HTMLElement>('.av-frame')].filter((f) => !f.hidden);
    expect(visible.map((f) => f.dataset.view)).toEqual(['04-back-three-quarter']);
  });
});

describe('prefetch', () => {
  it('sets neighbour images to eager on first interaction only', () => {
    setup(mq(true));
    const loading = (v: string) => q(root, `[data-view="${v}"] img`).getAttribute('loading');
    expect(loading('02-front-three-quarter')).toBe('lazy');
    pointer(q(root, '.av-stage'), 'pointerenter', 0, 0);
    expect(loading('02-front-three-quarter')).toBe('eager');
    expect(loading('05-back')).toBe('lazy');
  });
});
