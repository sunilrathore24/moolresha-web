// Unit tests for the Quality_Card and Fabric_Notes view models (task 8.5).
// Requirements 8.3, 8.4, 8C.1 to 8C.6.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { Concept, QUALITY_ROWS, QUALITY_ROW_NAMES } from '../../src/lib/concept-schema';
import { TARGET_NOTE } from '../../src/lib/content-rules/story-quality-rules';
import {
  TARGET_NOTE_TEXT,
  compositionText,
  fabricNoteItems,
  formatRange,
  qualityRowViews,
  testText,
} from '../../src/lib/quality-card-view';

const dir = join(process.cwd(), 'src/content/concepts');
const concepts = readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => Concept.parse(parse(readFileSync(join(dir, f), 'utf8'))));

describe('quality-card-view', () => {
  it('uses the same Target note as the Content_Check', () => {
    expect(TARGET_NOTE_TEXT).toBe(TARGET_NOTE);
  });

  it('formats ranges as ranges, never a single value', () => {
    expect(formatRange({ kind: 'gsm', min: 110, max: 135 })).toBe('110\u2013135 GSM');
    expect(formatRange({ kind: 'count', min: 40, max: 60 })).toBe('40s\u201360s count');
  });

  it('writes the We\'ll test sentence', () => {
    expect(testText({ what: 'colour after washes.', publish: 'photos' })).toBe(
      "What we'll test: colour after washes. What we'll publish: photos.",
    );
  });

  it.each(concepts.map((c) => [c.id, c] as const))('%s: seven rows in order with one label each', (_id, c) => {
    const views = qualityRowViews(c.quality);
    expect(views.map((v) => v.row)).toEqual([...QUALITY_ROWS]);
    for (const v of views) {
      expect(v.name).toBe(QUALITY_ROW_NAMES[v.row]);
      expect(v.note !== undefined).toBe(v.label === 'Target');
      expect(v.testText !== undefined).toBe(v.label === 'WeWillTest');
      expect(v.factId !== undefined).toBe(v.label === 'FACT');
      if (v.note) expect(v.note).toBe(TARGET_NOTE);
    }
  });

  it('shows the yarn range only on a Target row', () => {
    const shirt = concepts.find((c) => c.id === 'mens-cotton-shirt')!;
    const yarn = qualityRowViews(shirt.quality).find((v) => v.row === 'yarn')!;
    expect(yarn.rangeText).toBe('40s\u201360s count');
  });

  it('lists Fabric_Notes in order and omits yarn quality without a factId', () => {
    const shirt = concepts.find((c) => c.id === 'mens-cotton-shirt')!;
    const keys = fabricNoteItems(shirt.fabricNotes).map((i) => i.key);
    expect(keys).toEqual(['composition', 'weave', 'weight', 'handFeel', 'softness', 'care']);
    const withYarn = fabricNoteItems({
      ...shirt.fabricNotes,
      yarnQuality: { term: 'fine yarn', factId: 'some-fact' },
    });
    expect(withYarn.map((i) => i.key)[1]).toBe('yarnQuality');
    expect(withYarn[1]!.factId).toBe('some-fact');
  });

  it('writes composition with percentages', () => {
    expect(
      compositionText([
        { fibre: 'cotton', percent: 85 },
        { fibre: 'linen', percent: 15 },
      ]),
    ).toBe('85% cotton, 15% linen');
  });
});
