// Property test for fact rendering (task 2.2).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import type { FactEntry } from '../../src/lib/fact-schema';
import { Fact } from '../../src/lib/fact-schema';
import { factViewModel } from '../../src/lib/facts';
import { factEntry } from '../generators/fact-entries';

const SOURCED = ['FACT', 'INDUSTRY CLAIM', 'BRAND CLAIM'];

describe('fact rendering', () => {
  // Feature: launch-feedback-website, Property 15: Fact rendering carries the right label and evidence
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.8, 7.6**
  test.prop([factEntry()], { numRuns: 300 })(
    'the view model carries the label and id, and exactly the evidence its label needs',
    (entry: FactEntry) => {
      expect(Fact.safeParse(entry).success).toBe(true);
      const vm = factViewModel(entry);

      expect(vm.label).toBe(entry.label);
      expect(vm.id).toBe(entry.id);

      const hasSource = 'sourceLink' in vm;
      expect(hasSource).toBe(SOURCED.includes(entry.label));
      if (hasSource && 'source' in entry) {
        expect(vm.sourceLink.name).toBe(entry.source.name);
        expect(vm.sourceLink.date).toBe(entry.source.date);
        expect(vm.sourceLink.rel).toBe('noopener noreferrer');
        expect(vm.sourceLink.text).toContain(entry.source.name);
        expect(vm.sourceLink.text).toContain(entry.source.date);
      }

      const hasAssumptions = 'assumptions' in vm;
      expect(hasAssumptions).toBe(entry.label === 'MoolResha estimate');
      if (hasAssumptions && 'assumptions' in entry) expect(vm.assumptions).toEqual(entry.assumptions);

      const hasMethod = 'methodNote' in vm;
      expect(hasMethod).toBe(entry.label === 'MoolResha market scan');
      if (hasMethod && 'methodNote' in entry) {
        expect(vm.methodNote.listings).toBe(entry.methodNote.listings);
        expect(vm.methodNote.text.length).toBeGreaterThan(0);
      }
    },
  );
});
