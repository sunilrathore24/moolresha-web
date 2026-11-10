import { describe, expect, it } from 'vitest';
import {
  HUB_PAGE_PATHS,
  buildNavItems,
  isCurrentNavItem,
  isHubPagePath,
  navAnchorIds,
} from '../../src/lib/launch-nav';
import {
  HERO_FRAME,
  HERO_PHOTO_ALT,
  HERO_VIDEO,
  pickHeroPhotoKey,
  shouldAutoplay,
  toggleState,
} from '../../src/lib/hero-photo';
import { PAGE_SECTIONS } from '../../src/content/config/allow-lists';

describe('buildNavItems', () => {
  it('links only to page sections, the Journal and Privacy', () => {
    const items = buildNavItems({ journalHref: '/article/example' });
    for (const item of items) {
      if (item.kind === 'anchor') {
        const id = item.href.replace('/#', '');
        expect(item.href.startsWith('/#')).toBe(true);
        expect(PAGE_SECTIONS).toContain(id);
      }
    }
    expect(items.map((i) => i.kind)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'journal', 'privacy']);
  });

  it('uses the storyboard labels and anchors in order', () => {
    const items = buildNavItems({ journalHref: '/article/example' });
    expect(items.map((i) => [i.label, i.href])).toEqual([
      ['Our journey', '/#journey'],
      ['Designs', '/#concepts'],
      ['Trends', '/#trends'],
      ['Your voice', '/#frustration'],
      ['Journal', '/article/example'],
      ['Privacy', '/privacy'],
    ]);
  });

  it('contains no Hub_Page link', () => {
    const hrefs = buildNavItems({ journalHref: '/article/example' }).map((i) => i.href);
    for (const hub of HUB_PAGE_PATHS) expect(hrefs).not.toContain(hub);
  });

  it('leaves out Journal when there is no article', () => {
    const items = buildNavItems();
    expect(items.some((i) => i.kind === 'journal')).toBe(false);
    expect(items.at(-1)?.href).toBe('/privacy');
  });

  it('exposes every section id the header expects', () => {
    expect(navAnchorIds()).toEqual(['journey', 'concepts', 'trends', 'frustration']);
  });
});

describe('isCurrentNavItem', () => {
  const items = buildNavItems({ journalHref: '/article/example' });
  const journal = items.find((i) => i.kind === 'journal')!;
  const privacy = items.find((i) => i.kind === 'privacy')!;

  it('marks Journal on article pages and Privacy on /privacy', () => {
    expect(isCurrentNavItem(journal, '/article/example')).toBe(true);
    expect(isCurrentNavItem(journal, '/privacy')).toBe(false);
    expect(isCurrentNavItem(privacy, '/privacy')).toBe(true);
    expect(isCurrentNavItem(privacy, '/privacy/')).toBe(true);
  });

  it('never marks an anchor', () => {
    expect(items.filter((i) => i.kind === 'anchor').some((i) => isCurrentNavItem(i, '/'))).toBe(false);
  });
});

describe('isHubPagePath', () => {
  it('recognises the four Hub_Pages only', () => {
    for (const p of HUB_PAGE_PATHS) {
      expect(isHubPagePath(p)).toBe(true);
      expect(isHubPagePath(`${p}/`)).toBe(true);
    }
    expect(HUB_PAGE_PATHS).toHaveLength(4);
    for (const p of ['/', '/privacy', '/about', '/article/x']) expect(isHubPagePath(p)).toBe(false);
  });
});

describe('pickHeroPhotoKey', () => {
  it('returns undefined without a hero file', () => {
    expect(pickHeroPhotoKey([])).toBeUndefined();
    expect(pickHeroPhotoKey(['/src/assets/hero/.gitkeep', '/src/assets/hero/other.jpg'])).toBeUndefined();
  });

  it('picks hero.<ext>, preferring jpg over webp over png', () => {
    expect(pickHeroPhotoKey(['/src/assets/hero/hero.png', '/src/assets/hero/hero.webp'])).toBe(
      '/src/assets/hero/hero.webp',
    );
    expect(pickHeroPhotoKey(['/src/assets/hero/hero.webp', '/src/assets/hero/hero.jpg'])).toBe(
      '/src/assets/hero/hero.jpg',
    );
  });

  it('uses the 16:9 frame of the video and its poster', () => {
    expect(HERO_FRAME).toEqual({ width: 1920, height: 1080 });
    expect(HERO_VIDEO.src).toBe('/video/cotton-field.mp4');
    expect(HERO_VIDEO.poster).toBe('/video/cotton-field-poster.jpg');
    expect(HERO_PHOTO_ALT).toBe('Cotton field at sunrise');
  });
});

describe('hero video policy', () => {
  it('autoplays only without reduced motion and without Save-Data', () => {
    expect(shouldAutoplay({ reducedMotion: false })).toBe(true);
    expect(shouldAutoplay({ reducedMotion: false, saveData: false })).toBe(true);
    expect(shouldAutoplay({ reducedMotion: true })).toBe(false);
    expect(shouldAutoplay({ reducedMotion: false, saveData: true })).toBe(false);
  });

  it('labels the toggle by the action it performs', () => {
    expect(toggleState(true)).toEqual({ label: 'Play background video', pressed: 'true' });
    expect(toggleState(false)).toEqual({ label: 'Pause background video', pressed: 'false' });
  });
});
