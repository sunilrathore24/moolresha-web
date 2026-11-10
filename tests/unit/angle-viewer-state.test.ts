import { describe, expect, it } from 'vitest';
import {
  INITIAL,
  canNext,
  canPrev,
  dragOutcome,
  goto,
  hintView,
  keyOutcome,
  next,
  positionText,
  prev,
  shown,
  toggleTab,
} from '../../src/islands/angle-viewer-state';
import { TURN_VIEWS } from '../../src/lib/concept-views';
import { applyActions, viewerActions, reachableState } from '../generators/viewer-actions';
import fc from 'fast-check';

describe('angle-viewer-state', () => {
  it('starts at 01 front with no tab', () => {
    expect(INITIAL).toEqual({ turn: 0, tab: null });
    expect(shown(INITIAL)).toBe('01-front');
    expect(positionText(INITIAL)).toBe('Front, 1 of 5');
  });

  it('walks the Turn_Views in order and clamps at both ends', () => {
    let s = INITIAL;
    expect(prev(s)).toEqual(s);
    expect(canPrev(s)).toBe(false);
    const seen = [shown(s)];
    for (let i = 0; i < 6; i++) {
      s = next(s);
      seen.push(shown(s));
    }
    expect(seen.slice(0, 5)).toEqual([...TURN_VIEWS]);
    expect(s.turn).toBe(4);
    expect(next(s)).toEqual(s);
    expect(canNext(s)).toBe(false);
  });

  it('keeps the remembered turn while a tab is open and closes it on next/prev', () => {
    const side = goto(INITIAL, '03-side');
    const inside = toggleTab(side, '06-inside');
    expect(inside).toEqual({ turn: 2, tab: '06-inside' });
    expect(positionText(inside)).toBe('Inside');
    expect(toggleTab(inside, '06-inside')).toEqual(side);
    expect(toggleTab(inside, '07-fabric-closeup').turn).toBe(2);
    expect(next(inside)).toEqual({ turn: 3, tab: null });
    expect(prev(inside)).toEqual({ turn: 1, tab: null });
    expect(goto(side, '08-on-model')).toEqual({ turn: 2, tab: '08-on-model' });
  });

  it('reports positions and hints', () => {
    expect(positionText(goto(INITIAL, '03-side'))).toBe('Side, 3 of 5');
    expect(hintView(INITIAL)).toBe('02-front-three-quarter');
    expect(hintView(goto(INITIAL, '05-back'))).toBeNull();
    expect(hintView(toggleTab(INITIAL, '06-inside'))).toBeNull();
  });

  it('maps drags and keys to directions', () => {
    expect(dragOutcome(-30, 5, 24)).toBe('next');
    expect(dragOutcome(30, 5, 24)).toBe('prev');
    expect(dragOutcome(-24, 0, 24)).toBe('next');
    expect(dragOutcome(-23, 0, 24)).toBeNull();
    expect(dragOutcome(-40, 40, 24)).toBeNull();
    expect(dragOutcome(10, 80, 24)).toBeNull();
    expect(keyOutcome('ArrowRight')).toBe('next');
    expect(keyOutcome('ArrowLeft')).toBe('prev');
    for (const k of ['ArrowUp', 'ArrowDown', 'Right', '', 'Enter']) expect(keyOutcome(k)).toBeNull();
  });
});

describe('viewer-actions generators', () => {
  it('reachableState() only yields valid states', () => {
    fc.assert(
      fc.property(reachableState(), (s) => {
        expect([0, 1, 2, 3, 4]).toContain(s.turn);
        expect(canNext(s)).toBe(JSON.stringify(next(s)) !== JSON.stringify(s));
        expect(canPrev(s)).toBe(JSON.stringify(prev(s)) !== JSON.stringify(s));
      }),
      { numRuns: 100 },
    );
  });

  it('viewerActions() sequences apply from INITIAL without leaving the state space', () => {
    fc.assert(
      fc.property(viewerActions(), (actions) => {
        const s = applyActions(INITIAL, actions);
        expect(s.turn).toBeGreaterThanOrEqual(0);
        expect(s.turn).toBeLessThanOrEqual(4);
      }),
      { numRuns: 100 },
    );
  });
});
