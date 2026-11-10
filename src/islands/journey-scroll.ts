/**
 * Prev/next arrows for the cotton journey row (CottonJourney.astro). Progressive enhancement:
 * without this script the row still scrolls by touch, trackpad, scrollbar and keyboard, and the
 * arrow controls stay `hidden`.
 */
function initJourneyScroll(): void {
  const row = document.getElementById('journey-stops');
  const controls = document.querySelector<HTMLElement>('[data-journey-controls]');
  const prev = document.querySelector<HTMLButtonElement>('[data-journey-prev]');
  const next = document.querySelector<HTMLButtonElement>('[data-journey-next]');
  if (!row || !controls || !prev || !next) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const step = (): number => {
    const card = row.querySelector<HTMLElement>(':scope > li');
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    return card ? card.offsetWidth + gap : row.clientWidth * 0.8;
  };
  const update = (): void => {
    const max = row.scrollWidth - row.clientWidth - 1;
    prev.setAttribute('aria-disabled', String(row.scrollLeft <= 1));
    next.setAttribute('aria-disabled', String(row.scrollLeft >= max));
  };
  const go = (dir: number) => (e: Event) => {
    if ((e.currentTarget as HTMLElement).getAttribute('aria-disabled') === 'true') return;
    row.scrollBy({ left: dir * step(), behavior: reduce.matches ? 'auto' : 'smooth' });
  };

  prev.addEventListener('click', go(-1));
  next.addEventListener('click', go(1));
  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  controls.hidden = false;
  update();
}

initJourneyScroll();
