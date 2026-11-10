/**
 * Results_View island (Requirements 16.1, 16.3, 16.4, 16.6, 22.3).
 * Markup hooks: src/components/launch/ResultsView.astro.
 *
 * Fetches GET /api/results when the section is within 200 px of the viewport.
 * Output is built with createElement and textContent only, so no server value
 * can inject markup. Below the response threshold a Concept shows only its
 * response count and "Not enough responses yet", never a percentage.
 */
import {
  CONCEPT_IDS,
  PRIORITY_LABELS,
  VERDICTS,
  type ConceptId,
  type PaletteColour,
  type PriorityChip,
  type Verdict,
} from '../content/config/allow-lists';
import type { PublicConceptResult } from '../lib/aggregate';

export const MSG_RESULTS_UNAVAILABLE = 'Results unavailable right now';
export const MSG_NOT_ENOUGH = 'Not enough responses yet';

/** Concept display names, as on the Concept_Cards. */
export const CONCEPT_NAMES: Record<ConceptId, string> = {
  'mens-cotton-shirt': "Men's cotton shirt",
  'mens-cotton-linen-shirt': "Men's cotton-linen shirt",
  'mens-linen-shirt': "Men's linen shirt",
  'mens-relaxed-pant': "Men's relaxed pant",
  'womens-coord-set': "Women's co-ord set",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  would_wear: 'Would wear',
  maybe: 'Maybe',
  not_for_me: 'Not for me',
};

const COLOUR_LABELS: Record<PaletteColour, string> = {
  flax: 'Flax',
  clay: 'Clay',
  meadow: 'Meadow',
  indigo_dusk: 'Indigo Dusk',
  chalk_white: 'Chalk White',
};

const REQUEST_TIMEOUT_MS = 10_000;
const rupees = new Intl.NumberFormat('en-IN');

/**
 * Band label from the band id (`mcs-under-1000`, `mcs-1500-1999`, `mcs-3000-plus`),
 * in the same form as bandLabel(): "Under ₹1,000", "₹1,500–1,999", "₹3,000+".
 * Returns null for an id of any other shape, so the line is left out.
 */
export function bandLabelFromId(id: string): string | null {
  const m = /^[a-z]{2,4}-(?:(under)-(\d{1,6})|(\d{1,6})-(?:(plus)|(\d{1,6})))$/.exec(id);
  if (!m) return null;
  if (m[1]) return `Under ₹${rupees.format(Number(m[2]))}`;
  if (m[4]) return `₹${rupees.format(Number(m[3]))}+`;
  return `₹${rupees.format(Number(m[3]))}–${rupees.format(Number(m[5]))}`;
}

/** "A", "A and B (tied)" or "A, B, C (tied)". Empty input gives ''. */
export function joinTied(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0] as string;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} (tied)`;
  return `${labels.join(', ')} (tied)`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function el(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function verdictLine(v: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const k of VERDICTS) {
    const n = v[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    parts.push(`${VERDICT_LABELS[k]} ${n}%`);
  }
  return parts.join(', ');
}

function renderConcept(r: PublicConceptResult): HTMLElement {
  const card = document.createElement('article');
  card.className = 'result-concept';
  card.appendChild(el('h3', CONCEPT_NAMES[r.conceptId]));
  card.appendChild(el('p', `${r.responses} ${r.responses === 1 ? 'response' : 'responses'}`, 'result-count'));

  if (!r.enough) {
    card.appendChild(el('p', MSG_NOT_ENOUGH, 'result-pending'));
    return card;
  }

  const line = isRecord(r.verdicts) ? verdictLine(r.verdicts) : null;
  if (line) card.appendChild(el('p', line, 'result-verdicts'));

  if (typeof r.leadingColour === 'string' && r.leadingColour in COLOUR_LABELS) {
    card.appendChild(el('p', `Leading colour: ${COLOUR_LABELS[r.leadingColour]}`));
  }

  const tops = (Array.isArray(r.topPriorities) ? r.topPriorities : [])
    .filter((c): c is PriorityChip => typeof c === 'string' && Object.hasOwn(PRIORITY_LABELS, c))
    .map((c) => PRIORITY_LABELS[c]);
  if (tops.length > 0) card.appendChild(el('p', `What matters most: ${joinTied(tops)}`));

  const band = typeof r.topPriceBandId === 'string' ? bandLabelFromId(r.topPriceBandId) : null;
  if (band) card.appendChild(el('p', `Most chosen price band: ${band}`));
  return card;
}

/**
 * "Would you wear it?" comparison bars, one per Concept that has enough responses — the
 * social-proof summary the research doc calls for ("sees others' votes... reason to
 * return"). Built with createElement and a numeric style.width, never innerHTML, same as
 * the rest of this module. Returns null when no Concept has enough data yet, so the section
 * stays exactly as plain as it is today until real responses exist.
 */
function renderSummary(rows: PublicConceptResult[]): HTMLElement | null {
  const withWouldWear = rows.filter(
    (r) => r.enough && isRecord(r.verdicts) && typeof r.verdicts.would_wear === 'number' && Number.isFinite(r.verdicts.would_wear),
  );
  if (withWouldWear.length === 0) return null;

  const wrap = document.createElement('div');
  wrap.className = 'result-summary';
  wrap.appendChild(el('h3', 'Would you wear it?'));

  const list = document.createElement('ul');
  list.className = 'result-bars';
  for (const r of withWouldWear) {
    const pct = Math.max(0, Math.min(100, (r.verdicts as Record<Verdict, number>).would_wear));
    const row = document.createElement('li');
    row.className = 'result-bar-row';
    row.appendChild(el('span', CONCEPT_NAMES[r.conceptId], 'result-bar-label'));
    const track = document.createElement('span');
    track.className = 'result-bar-track';
    const fill = document.createElement('span');
    fill.className = 'result-bar-fill';
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', `${pct}%`, 'result-bar-value'));
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

/** Keeps only well-formed rows for known Concepts, in CONCEPT_IDS order. */
function usable(results: unknown): PublicConceptResult[] {
  if (!Array.isArray(results)) return [];
  const out: PublicConceptResult[] = [];
  for (const id of CONCEPT_IDS) {
    const row = results.find((x) => isRecord(x) && x.conceptId === id);
    if (!isRecord(row) || typeof row.responses !== 'number' || !Number.isFinite(row.responses)) continue;
    out.push(row as unknown as PublicConceptResult);
  }
  return out;
}

export function renderResults(root: HTMLElement, live: HTMLElement | null, data: unknown): boolean {
  const rows = isRecord(data) && data.ok === true ? usable(data.results) : [];
  if (rows.length === 0) return false;
  const frag = document.createDocumentFragment();
  const summary = renderSummary(rows);
  if (summary) frag.appendChild(summary);
  for (const r of rows) frag.appendChild(renderConcept(r));
  const total = rows.reduce((sum, r) => sum + r.responses, 0);
  frag.appendChild(el('p', `Total responses: ${total}`, 'result-total'));
  const at = isRecord(data) && typeof data.computedAt === 'string' ? new Date(data.computedAt) : null;
  if (at && !Number.isNaN(at.getTime())) {
    frag.appendChild(el('p', `Last updated: ${at.toUTCString()}`, 'result-computed'));
  }
  root.replaceChildren(frag);
  if (live) live.textContent = '';
  return true;
}

export interface ResultsEnv {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

const started = new WeakSet<Element>();

export function initResults(root: HTMLElement, env: ResultsEnv = {}): boolean {
  if (started.has(root)) return false;
  started.add(root);
  const section = root.closest('[data-section]') ?? root.parentElement ?? document;
  const live = (section as ParentNode).querySelector<HTMLElement>('[data-live-region]');
  const doFetch = env.fetchImpl ?? ((i, init) => globalThis.fetch(i, init));
  let loaded = false;

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await doFetch('/api/results', { method: 'GET', signal: controller.signal });
      if (!res.ok) throw new Error('bad status');
      if (!renderResults(root, live, await res.json())) throw new Error('bad body');
    } catch {
      if (live) live.textContent = MSG_RESULTS_UNAVAILABLE;
    } finally {
      clearTimeout(timer);
    }
  }

  if (typeof IntersectionObserver === 'undefined') {
    void load();
    return true;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void load();
      }
    },
    { rootMargin: '200px 0px' },
  );
  io.observe(root);
  return true;
}

export function initAll(scope: ParentNode = document, env?: ResultsEnv): void {
  scope.querySelectorAll<HTMLElement>('[data-results-root]').forEach((r) => initResults(r, env));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
}
