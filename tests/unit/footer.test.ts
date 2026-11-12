import { describe, expect, it } from 'vitest';
import { SITE, type SiteConfig } from '../../src/content/config/site';
import { entityOrNull, footerModel, footerNav } from '../../src/lib/footer';
import { loadPrivacy } from '../../src/lib/privacy-schema';
import { readFileSync } from 'node:fs';

const grievance = loadPrivacy().grievance;

describe('site config', () => {
  it('has a contact address and no entity by default, with no studio name or location disclosed', () => {
    expect(SITE.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    expect(SITE.entity).toEqual({ name: '', address: '' });
    expect(SITE).not.toHaveProperty('studio');
  });

  it('links the Journal to the Journal index', () => {
    expect(SITE.journalHref).toBe('/journal');
  });
});

describe('entityOrNull', () => {
  it('is null when both fields are blank', () => {
    expect(entityOrNull({ name: '', address: '' })).toBeNull();
    expect(entityOrNull({ name: '  ', address: ' ' })).toBeNull();
  });

  it('keeps an entity when either field is set', () => {
    expect(entityOrNull({ name: 'X Pvt Ltd', address: '' })).toEqual({ name: 'X Pvt Ltd', address: '' });
    expect(entityOrNull({ name: ' X ', address: ' Indore ' })).toEqual({ name: 'X', address: 'Indore' });
  });
});

describe('footerNav', () => {
  it('launch footer has Journal and Privacy only, and no Hub_Page links', () => {
    const nav = footerNav(true, SITE);
    expect(nav.map((l) => l.label)).toEqual(['Journal', 'Privacy notice']);
    expect(nav.map((l) => l.href)).toContain('/privacy');
  });

  it('other pages keep the five existing links in order, then Journal and Privacy', () => {
    const nav = footerNav(false, SITE);
    expect(nav.map((l) => l.href).slice(0, 5)).toEqual([
      '/fibre-stories',
      '/fabric-school',
      '/comparisons',
      '/shopping-guides',
      '/about',
    ]);
    expect(nav.slice(5).map((l) => l.label)).toEqual(['Journal', 'Privacy notice']);
  });
});

describe('footerModel', () => {
  it('carries the launch trust signals, with no studio name or statement line', () => {
    const m = footerModel(true, SITE, grievance, 2026);
    expect(m).not.toHaveProperty('studio');
    expect(m).not.toHaveProperty('statement');
    expect(m.grievanceLabel).toBe('Grievance Contact');
    expect(m.grievanceEmail).toBe(grievance.email);
    expect(m.entity).toBeNull();
  });

  it('shows the entity when one is configured', () => {
    const site: SiteConfig = { ...SITE, entity: { name: 'X Pvt Ltd', address: 'Indore' } };
    expect(footerModel(true, site, grievance, 2026).entity).toEqual({ name: 'X Pvt Ltd', address: 'Indore' });
  });

  it('keeps the launch bottom line free of a bare year and to just the brand name', () => {
    expect(footerModel(true, SITE, grievance, 2026).baseLine).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(footerModel(true, SITE, grievance, 2026).baseLine).toBe('MoolResha.');
    expect(footerModel(false, SITE, grievance, 2026).baseLine).toBe('\u00a9 2026 MoolResha.');
    expect(footerModel(true, SITE, grievance, 2026).copyrightYear).toBeNull();
    expect(footerModel(false, SITE, grievance, 2026).copyrightYear).toBe(2026);
  });
});

describe('Footer.astro', () => {
  const src = readFileSync('src/components/Footer.astro', 'utf8');

  it('keeps data-section="footer" on the launch page and every remaining model field, with no studio, statement or grievance markup', () => {
    expect(src).toContain("data-section={launch ? 'footer' : undefined}");
    for (const attr of ['data-footer-contact', 'data-footer-entity']) {
      expect(src).toContain(attr);
    }
    // Grievance Contact was a second, duplicate email in the footer — removed per explicit
    // instruction (no grievance mailbox exists yet); the dedicated /privacy page section
    // (src/pages/privacy.astro's #grievance-contact) is unchanged and still has it.
    for (const attr of ['data-footer-statement', 'data-footer-studio', 'data-footer-grievance']) {
      expect(src).not.toContain(attr);
    }
  });

  it('is a dark olive band with the real logo image', () => {
    expect(src).toContain('background: var(--color-footer-bg)');
    expect(src).toMatch(/<Image class="footer-logo" src={logo}/);
  });
});
