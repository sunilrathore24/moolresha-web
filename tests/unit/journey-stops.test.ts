import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import {
  aimBody,
  JOURNEY_IMAGE_KEYS,
  JOURNEY_STOPS,
  JOURNEY_STOP_IDS,
  journeyFactIds,
} from '../../src/lib/journey-stops';

describe('journey stops', () => {
  it('lists the eight stops in the required order', () => {
    expect(JOURNEY_STOPS.map((s) => s.id)).toEqual([
      'field',
      'ginning',
      'spinning',
      'weaving',
      'processing',
      'stitching',
      'warehousing-distribution',
      'retail',
    ]);
    expect(JOURNEY_STOPS.map((s) => s.id)).toEqual([...JOURNEY_STOP_IDS]);
  });

  it('gives every stop at least one fact id that exists in the registry', () => {
    const files = new Set(readdirSync('src/content/facts').map((f) => f.replace(/\.yaml$/, '')));
    for (const stop of JOURNEY_STOPS) {
      expect(stop.factIds.length).toBeGreaterThanOrEqual(1);
      for (const id of stop.factIds) expect(files.has(id)).toBe(true);
    }
  });

  it('collects all fact ids for the section date', () => {
    expect(journeyFactIds()).toHaveLength(8);
  });

  it('gives every stop an existing image and alt text', () => {
    const assets = new Set(readdirSync('src/assets/journey').map((f) => f.replace(/\.(png|jpg)$/, '')));
    const withImage = JOURNEY_STOPS.filter((s) => s.image).map((s) => s.id);
    expect(withImage).toEqual([...JOURNEY_STOP_IDS]);
    for (const s of JOURNEY_STOPS) {
      if (!s.image) continue;
      expect(JOURNEY_IMAGE_KEYS).toContain(s.image.key);
      expect(assets.has(s.image.key)).toBe(true);
      expect(s.image.alt.trim().length).toBeGreaterThan(10);
      expect(s.image.alt).not.toMatch(/[₹%]|\b(?:19|20)\d{2}\b/);
    }
  });

  it('keeps stop labels free of exclamation marks', () => {
    for (const s of JOURNEY_STOPS) expect(s.label).not.toContain('!');
  });
});

describe('aimBody', () => {
  it('removes the leading label so "Our aim" is not shown twice', () => {
    expect(aimBody('Our aim', 'Our aim: grown, spun, woven and stitched in India, with every step shown.')).toBe(
      'grown, spun, woven and stitched in India, with every step shown.',
    );
  });

  it('returns the statement unchanged when it has no label prefix', () => {
    expect(aimBody('Our aim', 'Something else.')).toBe('Something else.');
  });
});
