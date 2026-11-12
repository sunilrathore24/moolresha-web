/**
 * Pure helpers for the header navigation and the Hub_Pages.
 *
 * Redesign (2026-11): the header used to link only to Launch_Page section
 * anchors (`/#journey` etc.) because every section lived on one long home
 * page. The redesign gives each area its own route, so the header now links
 * to real pages: Home, Our Journey, Design Lab, Journal & Research, Your
 * Voice, Our Story — matching the redesign spec's mobile menu exactly.
 * Privacy stays out of the primary nav (it's in the footer already) to keep
 * the compact header focused on the six real sections.
 *
 * Hub_Pages stay reachable by URL (article breadcrumbs link to them) but are
 * `noindex` and not in the navigation or the sitemap.
 */
import { PAGE_SECTIONS, type PageSection } from '../content/config/allow-lists';

export interface NavItem {
  label: string;
  href: string;
}

/** Header links, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Our Journey', href: '/journey' },
  { label: 'Design Lab', href: '/designs' },
  { label: 'Journal & Research', href: '/journal' },
  { label: 'Your Voice', href: '/your-voice' },
  { label: 'Our Story', href: '/about' },
];

export const PRIVACY_PATH = '/privacy';

/** Hub_Pages: kept out of the navigation, the sitemap and search indexing. */
export const HUB_PAGE_PATHS = [
  '/comparisons',
  '/fabric-school',
  '/fibre-stories',
  '/shopping-guides',
] as const;

/** Header links in display order. Pure passthrough now that every link is a real route. */
export function buildNavItems(): NavItem[] {
  return [...NAV_ITEMS];
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

/**
 * Whether a nav item should carry `aria-current="page"` on `path`.
 * "Home" only matches the exact root. Everything else matches its own path
 * and any sub-route under it (e.g. "/designs" also matches
 * "/designs/mens-cotton-shirt"). "Journal & Research" also matches an
 * article page, since `/article/[...slug]` stays the canonical article URL.
 */
export function isCurrentNavItem(item: NavItem, path: string): boolean {
  const p = normalisePath(path);
  if (item.href === '/') return p === '/';
  if (item.href === '/journal') return p === '/journal' || p.startsWith('/article/');
  return p === item.href || p.startsWith(`${item.href}/`);
}
