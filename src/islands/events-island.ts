/**
 * Event_Counter island (Requirements 18.1, 18.3, 18.4). Sends page_view once,
 * section_reached once per allowed [data-section] when it is at least half
 * visible, and journal_click for links to /article/. Bodies follow EventBody
 * (functions/_shared/schemas.ts): never an anonId. Every failure is swallowed.
 */
import { SECTIONS, type SectionName } from '../content/config/allow-lists';
import { captureUtm } from './utm';

const ENDPOINT = '/api/events';

type EventPayload = { event: 'page_view' | 'section_reached' | 'journal_click'; section?: SectionName };

export interface EventsEnv {
  /** Fallback transport when sendBeacon is missing; defaults to global fetch. */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<unknown>;
}

const started = new WeakSet<object>();

function isAllowedSection(v: string | undefined): v is SectionName {
  return v !== undefined && (SECTIONS as readonly string[]).includes(v);
}

export function initEvents(doc: Document = document, env: EventsEnv = {}): boolean {
  if (started.has(doc)) return false;
  started.add(doc);

  function send(payload: EventPayload): void {
    try {
      const utm = captureUtm();
      const hasUtm = utm.source !== undefined || utm.medium !== undefined || utm.campaign !== undefined;
      const json = JSON.stringify(hasUtm ? { ...payload, utm } : payload);
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav && typeof nav.sendBeacon === 'function') {
        if (nav.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))) return;
      }
      const f = env.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
      void Promise.resolve(
        f?.(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
          keepalive: true,
        }),
      ).catch(() => {});
    } catch {
      // Counting must never disturb the page.
    }
  }

  send({ event: 'page_view' });

  // section_reached: once per section, at 50% visibility.
  const seen = new Set<string>();
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          const name = (e.target as HTMLElement).dataset.section;
          if (!isAllowedSection(name) || seen.has(name)) continue;
          seen.add(name);
          io.unobserve(e.target);
          send({ event: 'section_reached', section: name });
        }
      },
      { threshold: 0.5 },
    );
    doc.querySelectorAll<HTMLElement>('[data-section]').forEach((s) => {
      if (isAllowedSection(s.dataset.section)) io.observe(s);
    });
  }

  doc.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    const href = a?.getAttribute('href') ?? '';
    if (href.startsWith('/article/')) send({ event: 'journal_click' });
  });
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initEvents(), { once: true });
  else initEvents();
}
