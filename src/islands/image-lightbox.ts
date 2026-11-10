/**
 * A single, shared full-screen image viewer ("like Flipkart or Amazon"), reused by every
 * Angle_Viewer on the page rather than one `<dialog>` per instance. Built on the native
 * `<dialog>` element on purpose: `showModal()` gives focus-trapping and Escape-to-close for
 * free, so none of that needs reinventing here.
 *
 * Usage: `openLightbox({ src, alt, onPrev, onNext, trigger })`. `onPrev`/`onNext` are optional;
 * when given, the lightbox shows Previous/Next buttons and Left/Right arrow keys call them —
 * the caller is responsible for then calling `updateLightboxImage` with the new image. Closing
 * (the × button, Escape, or clicking the backdrop) returns focus to `trigger`.
 */

export interface LightboxHandlers {
  src: string;
  alt: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** Receives focus back when the lightbox closes. */
  trigger: HTMLElement;
}

let dialog: HTMLDialogElement | null = null;
let imgEl: HTMLImageElement | null = null;
let prevBtn: HTMLButtonElement | null = null;
let nextBtn: HTMLButtonElement | null = null;
let current: LightboxHandlers | null = null;

function build(): void {
  const d = document.createElement('dialog');
  d.className = 'av-lightbox';
  d.setAttribute('aria-label', 'Full screen image view');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'av-lightbox-btn av-lightbox-close';
  close.setAttribute('aria-label', 'Close full screen view');
  close.textContent = '✕';
  close.addEventListener('click', () => d.close());

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'av-lightbox-btn av-lightbox-prev';
  prev.setAttribute('aria-label', 'Previous view');
  prev.textContent = '‹';
  prev.hidden = true;
  prev.addEventListener('click', () => current?.onPrev?.());

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'av-lightbox-btn av-lightbox-next';
  next.setAttribute('aria-label', 'Next view');
  next.textContent = '›';
  next.hidden = true;
  next.addEventListener('click', () => current?.onNext?.());

  const img = document.createElement('img');
  img.className = 'av-lightbox-img';
  img.draggable = false;

  d.append(close, prev, img, next);
  document.body.append(d);

  // Clicking the backdrop (the dialog element itself, outside its content) closes it.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && current?.onPrev) {
      e.preventDefault();
      current.onPrev();
    } else if (e.key === 'ArrowRight' && current?.onNext) {
      e.preventDefault();
      current.onNext();
    }
  });
  d.addEventListener('close', () => {
    current?.trigger.focus();
    current = null;
  });

  dialog = d;
  imgEl = img;
  prevBtn = prev;
  nextBtn = next;
}

export function openLightbox(h: LightboxHandlers): void {
  if (!dialog) build();
  current = h;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- build() just set these
  imgEl!.src = h.src;
  imgEl!.alt = h.alt;
  prevBtn!.hidden = !h.onPrev;
  nextBtn!.hidden = !h.onNext;
  dialog!.showModal();
}

/** Called by the opener whenever stepping might have reached either end of its sequence. */
export function updateLightboxNav(hasPrev: boolean, hasNext: boolean): void {
  if (current && prevBtn && nextBtn) {
    prevBtn.hidden = !hasPrev;
    nextBtn.hidden = !hasNext;
  }
}

/**
 * True only while the lightbox is open *and* `trigger` is the element that opened it — the
 * shared lightbox has one `current` owner at a time, so every other Angle_Viewer on the page
 * must check this before touching the image (otherwise two viewers could stomp on each other).
 */
export function isLightboxOpenFor(trigger: HTMLElement): boolean {
  return current?.trigger === trigger;
}

/** Called by the opener after `onPrev`/`onNext` moves to a different view. */
export function updateLightboxImage(src: string, alt: string): void {
  if (current && imgEl) {
    imgEl.src = src;
    imgEl.alt = alt;
  }
}
