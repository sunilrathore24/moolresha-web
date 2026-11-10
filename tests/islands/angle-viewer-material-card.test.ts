import { beforeEach, describe, expect, it } from 'vitest';
import { initAngleViewer, type AngleViewerEnv } from '../../src/islands/angle-viewer-island';
import { VIEW_BASES, VIEW_NAMES } from '../../src/lib/concept-views';

const [first, ...rest] = VIEW_BASES;
const frame = (v: string, extra = '') =>
  `<figure class="av-frame" data-view="${v}" ${extra}><img src="/${v}.png" alt="${v}" loading="lazy"></figure>`;
const thumbOf = (v: string) =>
  `<li><button type="button" class="av-thumb" data-view="${v}" aria-current="${v === first ? 'true' : 'false'}" aria-label="Show ${VIEW_NAMES[v] ?? 'Material passport'}"><img src="/${v}.png" alt="" loading="lazy"></button></li>`;

/** A viewer with the ninth, dynamic material-card frame and thumbnail present. */
function html(): string {
  return `
<div class="angle-viewer" data-angle-viewer>
  <div class="av-stage" role="group" tabindex="0" aria-label="views">
    ${frame(first, 'data-current')}
  </div>
  <p class="av-position" aria-live="polite">Front, 1 of 9</p>
  <template data-av-frames>${rest.map((v) => frame(v, 'hidden')).join('')}${frame('material-card', 'hidden')}</template>
  <ul class="av-grid">${VIEW_BASES.map(thumbOf).join('')}${thumbOf('material-card')}</ul>
</div>`;
}

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, s: string) => root.querySelector(s) as T;
const current = (root: ParentNode) =>
  [...root.querySelectorAll('.av-frame')].filter((f) => f.hasAttribute('data-current')).map((f) => (f as HTMLElement).dataset.view);
const thumb = (v: string) => `.av-thumb[data-view="${v}"]`;
const mq = (reduce: boolean): AngleViewerEnv => ({ matchMedia: (q) => ({ matches: q.includes('reduced-motion') ? reduce : true }) });

let root: HTMLElement;
function setup() {
  document.body.innerHTML = html();
  root = q(document, '[data-angle-viewer]');
  initAngleViewer(root, mq(true));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the dynamic material-card thumbnail (present only for colours that have one)', () => {
  it('clicking it shows the extra frame and marks only it current', () => {
    setup();
    q(root, thumb('material-card')).click();
    expect(current(root)).toEqual(['material-card']);
    expect(q(root, thumb('material-card')).getAttribute('aria-current')).toBe('true');
    expect(q(root, thumb('01-front')).getAttribute('aria-current')).toBe('false');
    expect(q(root, '.av-position').textContent).toBe('Material passport, 9 of 9');
  });

  it('clicking a real view afterwards swaps away from it cleanly, even back to the same Turn_View', () => {
    setup();
    q(root, thumb('03-side')).click();
    q(root, thumb('material-card')).click();
    expect(current(root)).toEqual(['material-card']);
    q(root, thumb('03-side')).click(); // same Turn_View as before showing the card
    expect(current(root)).toEqual(['03-side']);
    expect(q(root, '.av-position').textContent).toBe('Side, 3 of 9');
  });

  it('keyboard turning works from the material card too: it is just the last item in the strip', () => {
    setup();
    q(root, thumb('material-card')).click();
    const stage = q(root, '.av-stage');
    // It's last, so ArrowRight (next) does nothing...
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(current(root)).toEqual(['material-card']);
    // ...and ArrowLeft (prev) steps back to the view right before it in the strip.
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(current(root)).toEqual(['08-on-model']);
  });
});
