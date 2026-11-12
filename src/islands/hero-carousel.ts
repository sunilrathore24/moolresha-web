/**
 * Hero carousel behavior (progressive enhancement over Hero.astro).
 *
 * Rotates N backgrounds (`[data-hero-bg]`) and swaps the single text block's content
 * (`[data-hero-eyebrow]`/`[data-hero-headline]`/`[data-hero-support]`, plus the per-slide
 * "See more" link's href+label) from the hidden
 * `[data-hero-text-source] li[data-eyebrow][data-headline][data-support][data-link-href][data-link-label]`
 * list — the pinned "Explore the designs" CTA is untouched, it lives outside this component
 * entirely and always points at /designs regardless of slide.
 *
 * Auto-advances every 10s, paused by `prefers-reduced-motion` (dots still work manually),
 * while the mouse hovers or focus is within the hero (desktop), and — the mobile case —
 * for as long as a finger is actually down on the hero: `pointerdown` pauses immediately and
 * `pointerup`/`pointercancel` resumes, so press-and-hold stays on the current slide until the
 * tap is released, not just until the next tick. The video on slide 1 keeps playing muted in
 * the background even while hidden (cheap, avoids needing to coordinate play/pause across
 * hero-video.ts) — only the pause/play toggle button is hidden while any other slide shows,
 * since a video control floating over a static image slide would be confusing.
 *
 * Hooks: [data-hero-carousel] root, [data-hero-bg="<n>"] backgrounds, [data-hero-text-source]
 * (the real per-slide text, read once and never shown), [data-hero-eyebrow|headline|support]
 * (the live, swapped text), [data-hero-more] + [data-hero-more-label] (the live "See more"
 * link), [data-hero-dots][hidden] (dot row, `hidden` removed here), button[data-hero-dot],
 * [data-hero-status] (polite live region), [data-hero-video-toggle].
 */

const ADVANCE_MS = 10000;
const FADE_MS = 200;

export function initHeroCarousel(root: HTMLElement): boolean {
  if (root.dataset.heroEnhanced) return false;
  const backgrounds = [...root.querySelectorAll<HTMLElement>('[data-hero-bg]')];
  const slides = [...root.querySelectorAll<HTMLLIElement>('[data-hero-text-source] li')];
  const eyebrow = root.querySelector<HTMLElement>('[data-hero-eyebrow]');
  const headline = root.querySelector<HTMLElement>('[data-hero-headline]');
  const support = root.querySelector<HTMLElement>('[data-hero-support]');
  const moreLink = root.querySelector<HTMLAnchorElement>('[data-hero-more]');
  const moreLabel = root.querySelector<HTMLElement>('[data-hero-more-label]');
  const dotsWrap = root.querySelector<HTMLElement>('[data-hero-dots]');
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-hero-dot]')];
  const status = root.querySelector<HTMLElement>('[data-hero-status]');
  const videoToggle = root.querySelector<HTMLButtonElement>('[data-hero-video-toggle]');
  if (backgrounds.length < 2 || slides.length !== backgrounds.length || !eyebrow || !headline || !support) {
    return false;
  }

  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let current = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function applyText(i: number): void {
    const s = slides[i]!;
    eyebrow!.textContent = s.dataset.eyebrow ?? '';
    headline!.textContent = s.dataset.headline ?? '';
    support!.textContent = s.dataset.support ?? '';
    if (moreLink && s.dataset.linkHref) moreLink.href = s.dataset.linkHref;
    if (moreLabel && s.dataset.linkLabel) moreLabel.textContent = s.dataset.linkLabel;
  }

  function select(index: number): void {
    const n = backgrounds.length;
    const i = ((index % n) + n) % n;
    if (i === current) return;
    current = i;

    backgrounds.forEach((b, k) => {
      b.hidden = k !== i;
    });
    dots.forEach((d, k) => d.setAttribute('aria-selected', String(k === i)));
    if (videoToggle) videoToggle.hidden = i !== 0;
    if (status) status.textContent = `Slide ${i + 1} of ${n}: ${slides[i]!.dataset.eyebrow}`;

    root.classList.add('hero-text-fading');
    setTimeout(() => {
      applyText(i);
      root.classList.remove('hero-text-fading');
    }, FADE_MS);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(): void {
    stop();
    if (motion?.matches) return;
    timer = setInterval(() => select(current + 1), ADVANCE_MS);
  }

  dotsWrap?.addEventListener('click', (e) => {
    const dot = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-hero-dot]');
    if (!dot) return;
    select(dots.indexOf(dot));
    start(); // a manual pick still gets its own full ADVANCE_MS before moving on
  });

  root.addEventListener('keydown', (e) => {
    const onDot = (e.target as HTMLElement | null)?.closest('[data-hero-dot]');
    if (!onDot) return;
    const to = e.key === 'ArrowRight' ? current + 1 : e.key === 'ArrowLeft' ? current - 1 : null;
    if (to === null) return;
    e.preventDefault();
    select(to);
    dots[((to % dots.length) + dots.length) % dots.length]?.focus();
    start();
  });

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', start);
  // Press-and-hold (mobile tap, or a mouse held down): pause the instant the pointer goes
  // down, resume only once it's actually lifted or the gesture is cancelled — not on a timer,
  // so holding past the next tick still shows the same slide the whole time.
  root.addEventListener('pointerdown', stop);
  root.addEventListener('pointerup', start);
  root.addEventListener('pointercancel', start);
  motion?.addEventListener('change', start);

  dotsWrap?.removeAttribute('hidden');
  root.dataset.heroEnhanced = 'true';
  start();
  return true;
}

export function initAll(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-hero-carousel]').forEach((r) => initHeroCarousel(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
