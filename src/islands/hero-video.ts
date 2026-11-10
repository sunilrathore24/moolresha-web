/**
 * Hero background video: autoplay policy and the pause/play toggle (WCAG 2.2.2).
 *
 * - Never plays when the visitor prefers reduced motion or has Save-Data on; the poster stays.
 *   Both are re-checked when the media query changes.
 * - Playback starts only after the window `load` event, so the video never competes with the LCP image.
 * - `preload="none"` in the markup: nothing is fetched until play() is called.
 * - play() rejections (autoplay blocked, decode errors) are swallowed and the toggle shows "Play".
 */
import { shouldAutoplay, toggleState } from '../lib/hero-photo';

type ConnectionLike = { saveData?: boolean };

export function initHeroVideo(root: ParentNode = document): void {
  const video = root.querySelector<HTMLVideoElement>('[data-hero-video]');
  const button = root.querySelector<HTMLButtonElement>('[data-hero-video-toggle]');
  if (!video || !button) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = () => (navigator as Navigator & { connection?: ConnectionLike }).connection?.saveData;
  const allowed = () => shouldAutoplay({ reducedMotion: motion.matches, saveData: saveData() });

  /** Set once the visitor presses the toggle; their choice then wins over the automatic policy. */
  let userChoice: 'play' | 'pause' | null = null;
  let loaded = document.readyState === 'complete';

  const render = () => {
    const s = toggleState(video.paused);
    button.setAttribute('aria-label', s.label);
    button.setAttribute('aria-pressed', s.pressed);
    button.dataset.state = video.paused ? 'paused' : 'playing';
    video.toggleAttribute('data-playing', !video.paused);
  };

  const play = () => {
    video.play().then(render, render);
  };

  const pause = () => {
    video.pause();
    render();
  };

  const apply = () => {
    if (!loaded || userChoice === 'pause') return;
    if (userChoice === 'play' || allowed()) play();
    else pause();
  };

  video.addEventListener('play', render);
  video.addEventListener('pause', render);

  button.addEventListener('click', () => {
    if (video.paused) {
      userChoice = 'play';
      play();
    } else {
      userChoice = 'pause';
      pause();
    }
  });

  motion.addEventListener('change', () => {
    // Asking for less motion always stops the video, even after a manual Play.
    if (motion.matches) userChoice = null;
    apply();
  });

  button.hidden = false;
  render();

  if (loaded) apply();
  else
    window.addEventListener(
      'load',
      () => {
        loaded = true;
        apply();
      },
      { once: true },
    );
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initHeroVideo(), { once: true });
  else initHeroVideo();
}
