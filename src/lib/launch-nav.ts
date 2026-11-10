/**
 * Pure helpers for the header navigation and the Hub_Pages (Requirement 2.4).
 *
 * The header links only to Launch_Page section anchors, the Journal and the
 * Privacy_Notice. Hub_Pages stay reachable by URL (article breadcrumbs link to
 * them) but are `noindex` and not in the navigation or the sitemap.
 */
import { PAGE_SECTIONS, type PageSection } from '../content/config/allow-lists';

export type NavKind = 'anchor' | 'journal' | 'privacy';

export interface NavItem {
  label: string;
  href: string;
  kind: NavKind;
}

/**
 * Launch_Page sections the header links to. The page composition (task 8.10)
 * must give each of these sections an element with `id` equal to `section`.
 */
export const NAV_SECTIONS: readonly { section: PageSection; label: string }[] = [
  { section: 'journey', label: 'Our journey' },
  { section: 'concepts', label: 'Designs' },
  { section: 'trends', label: 'Trends' },
  { section: 'frustration', label: 'Your voice' },
];

export const PRIVACY_PATH = '/privacy';

/** Hub_Pages: kept out of the navigation, the sitemap and search indexing. */
export const HUB_PAGE_PATHS = [
  '/comparisons',
  '/fabric-school',
  '/fibre-stories',
  '/shopping-guides',
] as const;

/**
 * Header links in display order. Anchors are written as `/#id` so they work
 * from every page, not only the home page. The Journal link is left out when
 * there is no published article to point to.
 */
export function buildNavItems(opts: { journalHref?: string } = {}): NavItem[] {
  const items: NavItem[] = NAV_SECTIONS.map(({ section, label }) => ({
    label,
    href: `/#${section}`,
    kind: 'anchor',
  }));
  if (opts.journalHref) items.push({ label: 'Journal', href: opts.journalHref, kind: 'journal' });
  items.push({ label: 'Privacy', href: PRIVACY_PATH, kind: 'privacy' });
  return items;
}

/** Strips a trailing slash (but keeps "/"). */
function normalisePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** True when `path` is one of the four Hub_Pages. */
export function isHubPagePath(path: string): boolean {
  const p = normalisePath(path);
  return (HUB_PAGE_PATHS as readonly string[]).includes(p);
}

/** Whether a nav item should carry `aria-current="page"` on `path`. Anchors never do. */
export function isCurrentNavItem(item: NavItem, path: string): boolean {
  const p = normalisePath(path);
  if (item.kind === 'privacy') return p === PRIVACY_PATH;
  if (item.kind === 'journal') return p === '/journal' || p.startsWith('/article/');
  return false;
}

/** Section ids the header expects to find on the Launch_Page. */
export function navAnchorIds(): PageSection[] {
  return NAV_SECTIONS.map((s) => s.section).filter((s) => PAGE_SECTIONS.includes(s));
}
