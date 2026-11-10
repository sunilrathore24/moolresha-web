/**
 * Pure helpers for the hero media (Requirement 1.1, superseded by a user decision, Nov 2026).
 *
 * The hero shows a looping, muted cotton-field video with a poster frame and a pause control.
 * The files live in `public/video/` (served as-is, not processed by Astro). No Astro imports,
 * so Vitest and the hero's inline script can both load this file.
 */

/** The hero video, its poster frame and its intrinsic size (both files are 1920 x 1080). */
export const HERO_VIDEO = {
  src: '/video/cotton-field.mp4',
  type: 'video/mp4',
  poster: '/video/cotton-field-poster.jpg',
  width: 1920,
  height: 1080,
} as const;

/** Fixed frame of the hero media (16:9), used for the poster and the video. */
export const HERO_FRAME = { width: HERO_VIDEO.width, height: HERO_VIDEO.height } as const;

/** Alt text of the still frame behind the video (the LCP image and the no-JS fallback). */
export const HERO_PHOTO_ALT = 'Cotton field at sunrise';

/** Preference order for `src/assets/hero/hero.<ext>`. */
const HERO_PHOTO_EXTS = ['jpg', 'jpeg', 'webp', 'png'] as const;

/**
 * Picks the hero still from `import.meta.glob` keys: `hero.jpg` first, then jpeg, webp, png.
 * Returns undefined when no `hero.<ext>` file exists.
 */
export function pickHeroPhotoKey(keys: readonly string[]): string | undefined {
  for (const ext of HERO_PHOTO_EXTS) {
    const hit = keys.find((k) => k.endsWith(`/hero.${ext}`));
    if (hit) return hit;
  }
  return undefined;
}

export const HERO_VIDEO_LABELS = {
  pause: 'Pause background video',
  play: 'Play background video',
} as const;

export interface AutoplayContext {
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches` */
  reducedMotion: boolean;
  /** `navigator.connection?.saveData`, undefined when the browser does not expose it. */
  saveData?: boolean;
}

/** The video starts on its own only when the visitor has not asked for less motion or less data. */
export function shouldAutoplay({ reducedMotion, saveData }: AutoplayContext): boolean {
  return !reducedMotion && saveData !== true;
}

/** Label and pressed state of the toggle button. `aria-pressed="true"` means the video is paused. */
export function toggleState(paused: boolean): { label: string; pressed: 'true' | 'false' } {
  return paused
    ? { label: HERO_VIDEO_LABELS.play, pressed: 'true' }
    : { label: HERO_VIDEO_LABELS.pause, pressed: 'false' };
}
