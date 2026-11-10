import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { checkLaunchRecords, isValidIsoDate, runLaunchGate } from '../../scripts/launch-gate';

const ids = CONCEPT_IDS;

function checklist(lawyer: string, onModel: Record<string, string>): string {
  return [
    '# Launch checklist',
    `- lawyer-review-date: ${lawyer}`,
    ...ids.map((id) => `- on-model-review: ${id}: ${onModel[id] ?? ''}`),
    '- alt-text-review: ',
    '- free-tier-limits-recheck: ',
  ].join('\n');
}

const allDates = Object.fromEntries(ids.map((id) => [id, '2026-03-04']));

describe('checkLaunchRecords', () => {
  it('fails without records and names every missing record', () => {
    const result = checkLaunchRecords(checklist('', {}), ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1 + ids.length);
    expect(result.missing[0]).toContain('lawyer-review-date');
    for (const id of ids) expect(result.missing.join('\n')).toContain(`on-model-review: ${id}`);
  });

  it('fails on an empty document', () => {
    const result = checkLaunchRecords('', ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1 + ids.length);
  });

  it('names only the Concept whose review is missing', () => {
    const partial = { ...allDates, 'mens-relaxed-pant': '' };
    const result = checkLaunchRecords(checklist('2026-03-01', partial), ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain('mens-relaxed-pant');
  });

  it('names the lawyer date when only that is missing', () => {
    const result = checkLaunchRecords(checklist('', allDates), ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain('lawyer-review-date');
  });

  it('passes with all records filled', () => {
    const result = checkLaunchRecords(checklist('2026-03-01', allDates), ids);
    expect(result).toEqual({ ok: true, missing: [] });
  });

  it('ignores invalid dates', () => {
    const bad = { ...allDates, 'mens-cotton-shirt': '2026-02-30', 'womens-coord-set': 'done' };
    const result = checkLaunchRecords(checklist('01/03/2026', bad), ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing[0]).toContain('lawyer-review-date');
    expect(result.missing.join('\n')).toContain('mens-cotton-shirt');
    expect(result.missing.join('\n')).toContain('womens-coord-set');
  });

  it('ignores example records inside fenced code blocks', () => {
    const md = ['```', '- lawyer-review-date: 2026-03-01', '```'].join('\n');
    expect(checkLaunchRecords(md, ids).missing[0]).toContain('lawyer-review-date');
  });

  it('does not count a lawyer date as an on-model record', () => {
    const md = `- lawyer-review-date: 2026-03-01\n- on-model-review: mens-cotton-shirt: 2026-03-02`;
    const result = checkLaunchRecords(md, ids);
    expect(result.missing).toHaveLength(ids.length - 1);
  });

  it('the shipped checklist lists every Concept and has all values blank', () => {
    const md = readFileSync(resolve(__dirname, '../../docs/launch-checklist.md'), 'utf8');
    const result = checkLaunchRecords(md, ids);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1 + ids.length);
    for (const id of ids) expect(md).toContain(`- on-model-review: ${id}:`);
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates and rejects other values', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-3-1')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('runLaunchGate', () => {
  it.each([undefined, '', 'false', 'TRUE', '1'])('skips when PUBLIC_LAUNCH is %j', (value) => {
    const result = runLaunchGate({ PUBLIC_LAUNCH: value }, checklist('', {}), ids);
    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.messages[0]).toContain('skipped');
  });

  it('fails and lists every missing record when PUBLIC_LAUNCH is "true"', () => {
    const result = runLaunchGate({ PUBLIC_LAUNCH: 'true' }, checklist('', {}), ids);
    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(false);
    const text = result.messages.join('\n');
    expect(text).toContain('lawyer-review-date');
    for (const id of ids) expect(text).toContain(id);
  });

  it('passes when PUBLIC_LAUNCH is "true" and all records are filled', () => {
    const result = runLaunchGate({ PUBLIC_LAUNCH: 'true' }, checklist('2026-03-01', allDates), ids);
    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(true);
  });
});

describe('package.json dependencies (Requirement 8A.15)', () => {
  it('lists no 3D, 360-degree spin or carousel package', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >;
    const names = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap((key) => Object.keys(pkg[key] ?? {}));
    const banned =
      /(^|[/-])(three|babylonjs|model-viewer|aframe|a-frame|react-three|threesixty|360|spin|spinner|turntable|carousel|swiper|slick|glide|splide|embla|flickity|keen-slider|owl)([/.-]|$)/i;
    expect(names.filter((n) => banned.test(n))).toEqual([]);
  });
});
