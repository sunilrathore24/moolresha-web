import { beforeEach, describe, expect, it } from 'vitest';
import { ENHANCED_CLASS, initColourSwatches } from '../../src/islands/colour-swatches';

const COLOURS = ['flax', 'clay', 'meadow'];

function html(): string {
  const swatches = COLOURS.map((c) => `<a href="#panel-${c}" data-colour-swatch="${c}" aria-pressed="false">${c}</a>`).join('');
  const panels = COLOURS.map((c) => `<div data-colour-panel="${c}" id="panel-${c}">${c} content</div>`).join('');
  return `<div data-colour-swatches>${swatches}${panels}</div>`;
}

let root: HTMLElement;
function setup() {
  document.body.innerHTML = html();
  root = document.querySelector('[data-colour-swatches]') as HTMLElement;
  initColourSwatches(root);
}

const swatch = (c: string) => root.querySelector<HTMLAnchorElement>(`[data-colour-swatch="${c}"]`) as HTMLAnchorElement;
const panel = (c: string) => root.querySelector<HTMLElement>(`[data-colour-panel="${c}"]`) as HTMLElement;

describe('initColourSwatches', () => {
  beforeEach(() => setup());

  it('shows only the first colour panel, with its swatch pressed', () => {
    expect(panel('flax').hidden).toBe(false);
    expect(panel('clay').hidden).toBe(true);
    expect(panel('meadow').hidden).toBe(true);
    expect(swatch('flax').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('clay').getAttribute('aria-pressed')).toBe('false');
  });

  it('adds the enhanced class to the root', () => {
    expect(root.classList.contains(ENHANCED_CLASS)).toBe(true);
  });

  it('clicking a swatch shows only its panel and presses only it', () => {
    swatch('clay').click();
    expect(panel('flax').hidden).toBe(true);
    expect(panel('clay').hidden).toBe(false);
    expect(panel('meadow').hidden).toBe(true);
    expect(swatch('clay').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('flax').getAttribute('aria-pressed')).toBe('false');
  });

  it('prevents the anchor default (no in-page jump) on click', () => {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    swatch('meadow').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('does nothing twice: a second init call is a no-op', () => {
    expect(initColourSwatches(root)).toBe(false);
  });

  it('is a no-op with fewer than two swatches or panels', () => {
    document.body.innerHTML = '<div data-colour-swatches><a data-colour-swatch="flax" href="#x"></a><div data-colour-panel="flax"></div></div>';
    const r = document.querySelector('[data-colour-swatches]') as HTMLElement;
    expect(initColourSwatches(r)).toBe(false);
  });
});
