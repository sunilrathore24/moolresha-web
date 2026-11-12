/**
 * Site-wide footer and trust-signal config (Requirement 19). Plain TypeScript, no imports,
 * so Vitest and Astro components can both load it.
 *
 * Edit the values here. No component change is needed.
 */
export interface SiteEntity {
  /** Registered legal entity name. Leave empty until an entity exists (Requirement 19.4). */
  name: string;
  /** Registered address. Leave empty until an entity exists. */
  address: string;
}

export interface SiteConfig {
  /** Contact email shown in the footer. */
  contactEmail: string;
  /** Where the footer "Journal" link goes (Requirement 2.5). */
  journalHref: string;
  entity: SiteEntity;
}

export const SITE: SiteConfig = {
  // Online-only at launch: no studio name or location is disclosed in the footer.
  // ⚠️ confirm: support@ is a PLACEHOLDER address. Founder to confirm the mailbox exists before launch.
  contactEmail: 'support@moolresha.com',
  // The Journal index (src/pages/journal.astro) lists every published article.
  journalHref: '/journal',
  // Empty by default: no registered legal entity yet. Fill both fields when one exists.
  entity: { name: '', address: '' },
};
