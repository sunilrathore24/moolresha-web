/**
 * Pure model for `Footer.astro` (Requirements 19.1, 19.4, 13.2, 2.5).
 * No Astro imports, so Vitest can test it.
 */
import type { SiteConfig } from '../content/config/site';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterModel {
  contactEmail: string;
  grievanceLabel: string;
  grievanceEmail: string;
  /** Registered entity lines, or null when none is configured (Requirement 19.4). */
  entity: { name: string; address: string } | null;
  nav: FooterLink[];
  /** Bottom line. The launch variant has no year: a bare year in page copy fails CC-09. */
  baseLine: string;
  /** The year inside `baseLine`, or null on the launch variant. Footer.astro wraps it in `<time>`. */
  copyrightYear: number | null;
}

/** The five existing links, in their existing order. */
const EXISTING_NAV: readonly FooterLink[] = [
  { label: 'Fibre Stories', href: '/fibre-stories' },
  { label: 'Fabric School', href: '/fabric-school' },
  { label: 'Comparisons', href: '/comparisons' },
  { label: 'Guides', href: '/shopping-guides' },
  { label: 'About', href: '/about' },
];

/** Returns the entity, or null when both fields are blank. */
export function entityOrNull(entity: { name: string; address: string }): { name: string; address: string } | null {
  const name = entity.name.trim();
  const address = entity.address.trim();
  return name === '' && address === '' ? null : { name, address };
}

/**
 * Launch_Page footer: Journal and Privacy only (Hub_Pages are not linked from it, Requirement 2.4).
 * Other pages keep their five links and gain Journal and Privacy.
 */
export function footerNav(launch: boolean, site: Pick<SiteConfig, 'journalHref'>): FooterLink[] {
  const journal: FooterLink = { label: 'Journal', href: site.journalHref };
  const privacy: FooterLink = { label: 'Privacy notice', href: '/privacy' };
  return launch ? [journal, privacy] : [...EXISTING_NAV, journal, privacy];
}

export function footerModel(
  launch: boolean,
  site: SiteConfig,
  grievance: { label: string; email: string },
  year: number,
): FooterModel {
  return {
    contactEmail: site.contactEmail,
    grievanceLabel: grievance.label,
    grievanceEmail: grievance.email,
    entity: entityOrNull(site.entity),
    nav: footerNav(launch, site),
    baseLine: launch ? 'MoolResha.' : `\u00a9 ${year} MoolResha.`,
    copyrightYear: launch ? null : year,
  };
}
