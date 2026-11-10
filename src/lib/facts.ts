/**
 * Fact helpers.
 *
 * `factViewModel` and `resolveFact` are pure and importable by Vitest.
 * `getFact` reads the `facts` content collection and imports `astro:content`
 * lazily, so loading this file outside Astro never touches the Astro runtime.
 */
import type { ClaimLabelText, FactEntry } from './fact-schema';

/** Every Source_Link opens the external source with this `rel` (Requirement 3.8). */
export const SOURCE_LINK_REL = 'noopener noreferrer' as const;

export interface SourceLinkViewModel {
  name: string;
  date: string;
  url: string;
  rel: typeof SOURCE_LINK_REL;
  /** Visible link text: "<source name>, <date>". */
  text: string;
}

export interface MethodNoteViewModel {
  listings: number;
  from: string;
  to: string;
  channels: string[];
  /** Plain-language note, e.g. "12 listings, 1 Nov 2026 to 7 Nov 2026, online marketplaces, brand sites". */
  text: string;
}

interface FactViewBase {
  id: string;
  text: string;
  lastChecked: string;
}

export type FactViewModel =
  | (FactViewBase & {
      label: 'FACT' | 'INDUSTRY CLAIM' | 'BRAND CLAIM';
      sourceLink: SourceLinkViewModel;
    })
  | (FactViewBase & { label: 'MoolResha estimate'; assumptions: string[] })
  | (FactViewBase & { label: 'MoolResha market scan'; methodNote: MethodNoteViewModel });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-07" -> "7 Nov 2026". Pure string handling, so it never depends on ICU or the time zone. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month} ${y}` : iso;
}

/**
 * Build the data a Fact_Element renders (Requirements 3.1 to 3.4).
 * The result carries the Source_Link only for FACT / INDUSTRY CLAIM / BRAND CLAIM,
 * the assumptions only for `MoolResha estimate`, and the method note only for
 * `MoolResha market scan`. Absent parts are absent keys, not `undefined`.
 */
export function factViewModel(entry: FactEntry): FactViewModel {
  const base: FactViewBase = { id: entry.id, text: entry.text, lastChecked: entry.lastChecked };
  switch (entry.label) {
    case 'FACT':
    case 'INDUSTRY CLAIM':
    case 'BRAND CLAIM':
      return {
        ...base,
        label: entry.label,
        sourceLink: {
          name: entry.source.name,
          date: entry.source.date,
          url: entry.source.url,
          rel: SOURCE_LINK_REL,
          text: `${entry.source.name}, ${entry.source.date}`,
        },
      };
    case 'MoolResha estimate':
      return { ...base, label: entry.label, assumptions: [...entry.assumptions] };
    case 'MoolResha market scan': {
      const { listings, from, to, channels } = entry.methodNote;
      const noun = listings === 1 ? 'listing' : 'listings';
      return {
        ...base,
        label: entry.label,
        methodNote: {
          listings,
          from,
          to,
          channels: [...channels],
          text: `${listings} ${noun}, ${formatIsoDate(from)} to ${formatIsoDate(to)}, ${channels.join(', ')}`,
        },
      };
    }
  }
}

/** Pure lookup used by `getFact` and by tests. Throws on an unknown id. */
export function resolveFact(id: string, entries: readonly FactEntry[]): FactEntry {
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    throw new Error(
      `Unknown fact id "${id}". Add src/content/facts/${id}.yaml or fix the id in the page.`,
    );
  }
  return entry;
}

/**
 * Load one Fact_Registry entry at build time. Throws if the id is unknown, so a
 * page that references a missing fact fails the build (Requirement 3.5).
 */
export async function getFact(id: string): Promise<FactEntry> {
  const { getEntry } = await import('astro:content');
  const entry = await getEntry('facts', id);
  if (!entry) {
    throw new Error(
      `Unknown fact id "${id}". Add src/content/facts/${id}.yaml or fix the id in the page.`,
    );
  }
  return entry.data as FactEntry;
}

export type { ClaimLabelText };
