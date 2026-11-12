import { describe, expect, it } from 'vitest';
import { HUB_PAGE_PATHS, buildNavItems, isCurrentNavItem, isHubPagePath } from '../../src/lib/launch-nav';
import {
  HERO_FRAME,
  HERO_PHOTO_ALT,
  HERO_VIDEO,
  pickHeroPhotoKey,
  shouldAutoplay,
  toggleState,
} from '../../src/lib/hero-photo';

describe('buildNavItems', () => {
  it('links to the six redesign routes, in order, with no Privacy link', () => {
    const items = buildNavItems();
    expect(items.map((i) => [i.label, i.href])).toEqual([
      ['Home', '/'],
      ['Our Journey', '/journey'],
      ['Design Lab', '/designs'],
      ['Journal & Research', '/journal'],
      ['Your Voice', '/your-voice'],
      ['Our Story', '/about'],
    ]);
    expect(items.some((i) => i.href === '/privacy')).toBe(false);
  });

  it('contains no Hub_Page link', () => {
    const hrefs = buildNavItems().map((i) => i.href);
    for (const hub of HUB_PAGE_PATHS) expect(hrefs).not.toContain(hub);
  });
});

describe('isCurrentNavItem', () => {
  const items = buildNavItems();
  const home = items.find((i) => i.href === '/')!;
  const journey = items.find((i) => i.href === '/journey')!;
  const designs = items.find((i) => i.href === '/designs')!;
  const journal = items.find((i) => i.href === '/journal')!;
  const yourVoice = items.find((i) => i.href === '/your-voice')!;
  const ourStory = items.find((i) => i.href === '/about')!;

  it('marks Home only on the exact root', () => {
    expect(isCurrentNavItem(home, '/')).toBe(true);
    expect(isCurrentNavItem(home, '/journey')).toBe(false);
  });

  it('marks a route current on itself and any sub-route', () => {
    expect(isCurrentNavItem(journey, '/journey')).toBe(true);
    expect(isCurrentNavItem(journey, '/journey/pricing')).toBe(true);
    expect(isCurrentNavItem(designs, '/designs')).toBe(true);
    expect(isCurrentNavItem(designs, '/designs/mens-cotton-shirt')).toBe(true);
    expect(isCurrentNavItem(designs, '/designs/rootweave-01')).toBe(true);
    expect(isCurrentNavItem(yourVoice, '/your-voice')).toBe(true);
    expect(isCurrentNavItem(ourStory, '/about')).toBe(true);
    expect(isCurrentNavItem(ourStory, '/about/')).toBe(true);
  });

  it('marks Journal & Research current on an article page too', () => {
    expect(isCurrentNavItem(journal, '/journal')).toBe(true);
    expect(isCurrentNavItem(journal, '/article/example')).toBe(true);
    expect(isCurrentNavItem(journal, '/privacy')).toBe(false);
  });

  it('does not cross-match unrelated routes', () => {
    expect(isCurrentNavItem(journey, '/designs')).toBe(false);
    expect(isCurrentNavItem(designs, '/journey')).toBe(false);
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
