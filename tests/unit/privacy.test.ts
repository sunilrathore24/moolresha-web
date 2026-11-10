import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CONFIRM_MARKER, loadPrivacy, parsePrivacy } from '../../src/lib/privacy-schema';
import { NOTICE_VERSION } from '../../src/lib/notice-version';
import { loadWordRules } from '../../src/lib/word-rules-schema';

const yamlPath = join(process.cwd(), 'src/content/config/privacy.yaml');
const raw = parse(readFileSync(yamlPath, 'utf8')) as Record<string, unknown>;
const page = readFileSync(join(process.cwd(), 'src/pages/privacy.astro'), 'utf8');

describe('privacy.yaml', () => {
  it('parses with the schema', () => {
    expect(() => loadPrivacy()).not.toThrow();
  });

  it('NOTICE_VERSION equals privacy.yaml#version', () => {
    expect(NOTICE_VERSION).toBe(raw.version);
    expect(NOTICE_VERSION).toBe(loadPrivacy().version);
  });

  it('has a last-updated date in YYYY-MM-DD form', () => {
    expect(loadPrivacy().lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('marks every placeholder retention, the response times and the grievance contact', () => {
    const p = loadPrivacy();
    for (const item of p.dataItems.filter((i) => i.placeholder)) {
      expect(item.retention, item.id).toContain(CONFIRM_MARKER);
    }
    expect(p.responseTimes.note).toContain(CONFIRM_MARKER);
    expect(p.grievance.note).toContain(CONFIRM_MARKER);
  });

  it('rejects an unmarked placeholder retention period', () => {
    const bad = structuredClone(raw) as any;
    bad.dataItems[0].retention = 'Up to 24 months';
    expect(() => parsePrivacy(bad)).toThrow(/must contain/);
  });

  it('rejects an unmarked response time', () => {
    const bad = structuredClone(raw) as any;
    bad.responseTimes.note = 'We reply within 7 days.';
    expect(() => parsePrivacy(bad)).toThrow(/must contain/);
  });

  it('lists every required data item', () => {
    const ids = loadPrivacy().dataItems.map((i) => i.id);
    for (const id of [
      'feedback',
      'frustration',
      'contact-email',
      'contact-whatsapp',
      'contact-size',
      'consent-records',
      'event-counts',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('names the three processors', () => {
    const names = loadPrivacy().processors.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Cloudflare', 'Cloudflare Turnstile', 'MailerLite']));
  });

  it('has withdrawal, deletion, response times and a Grievance_Contact', () => {
    const p = loadPrivacy();
    expect(p.withdrawal.steps.length).toBeGreaterThan(0);
    expect(p.deletion.steps.length).toBeGreaterThan(0);
    expect(p.responseTimes.acknowledgeDays).toBeGreaterThan(0);
    expect(p.responseTimes.completeDays).toBeGreaterThanOrEqual(p.responseTimes.acknowledgeDays);
    expect(p.grievance.email).toContain('@');
  });

  it('contains no Health_Term_List word', () => {
    const text = readFileSync(yamlPath, 'utf8').toLowerCase();
    for (const term of loadWordRules().healthTerms) {
      expect(text.includes(term.toLowerCase()), term).toBe(false);
    }
  });
});

describe('privacy.astro (source checks)', () => {
  it('uses the site BaseLayout and loads the notice from the schema loader', () => {
    expect(page).toContain('layouts/BaseLayout.astro');
    expect(page).toContain('loadPrivacy');
    expect(page).toContain('NOTICE_VERSION');
  });

  it('renders the required sections', () => {
    for (const s of ['data-items', 'processors', 'withdrawal', 'deletion', 'response-times', 'grievance']) {
      expect(page, s).toContain(`data-privacy-section="${s}"`);
    }
  });

  it('shows the version and last-updated date', () => {
    expect(page).toContain('data-notice-version');
    expect(page).toContain('data-last-updated');
  });
});
