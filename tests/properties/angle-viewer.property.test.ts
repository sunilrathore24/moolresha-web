// Properties 36, 37, 38 and 39: the pure Angle_Viewer state module (tasks 6.2 to 6.5).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { TAB_VIEWS, TURN_VIEWS, VIEW_NAMES } from '../../src/lib/concept-views';
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
  type ViewerState,
} from '../../src/islands/angle-viewer-state';
import {
  applyAction,
  reachableState,
  viewerActions,
  type ViewerAction,
} from '../generators/viewer-actions';

const runs = { numRuns: 100 };
const tabArb = fc.constantFrom(...TAB_VIEWS);

/** Reference model: an integer turn 0-4 and an optional tab. */
function modelStep(m: ViewerState, a: ViewerAction): ViewerState {
  switch (a.type) {
    case 'next':
      return { turn: Math.min(m.turn + 1, 4) as ViewerState['turn'], tab: null };
    case 'prev':
      return { turn: Math.max(m.turn - 1, 0) as ViewerState['turn'], tab: null };
    case 'goto': {
      const i = (TURN_VIEWS as readonly string[]).indexOf(a.view);
      return i >= 0 ? { turn: i as ViewerState['turn'], tab: null } : { turn: m.turn, tab: a.view as ViewerState['tab'] };
    }
    case 'toggleTab':
      return { turn: m.turn, tab: m.tab === a.tab ? null : a.tab };
  }
}

describe('Property 36: turn axis clamps and follows the Turn_View order', () => {
  // Feature: launch-feedback-website, Property 36: Angle_Viewer turn axis clamps and follows the Turn_View order
  test.prop([viewerActions()], runs)('state matches the clamping model after every action', (actions) => {
    let s = INITIAL;
    let m = INITIAL;
    for (const a of actions) {
      s = applyAction(s, a);
      m = modelStep(m, a);
      expect(s).toEqual(m);
      expect(s.turn).toBeGreaterThanOrEqual(0);
      expect(s.turn).toBeLessThanOrEqual(4);
    }
  });

  // Feature: launch-feedback-website, Property 36: Angle_Viewer turn axis clamps and follows the Turn_View order
  test.prop([reachableState()], runs)(
    'next and prev clamp, close the tab and never wrap; canNext/canPrev agree with the transition',
    (s) => {
      expect(next(s)).toEqual({ turn: Math.min(s.turn + 1, 4), tab: null });
      expect(prev(s)).toEqual({ turn: Math.max(s.turn - 1, 0), tab: null });
      if (s.tab === null && s.turn === 4) expect(next(s)).toEqual(s);
      if (s.tab === null && s.turn === 0) expect(prev(s)).toEqual(s);
      expect(canNext(s)).toBe(JSON.stringify(next(s)) !== JSON.stringify(s));
      expect(canPrev(s)).toBe(JSON.stringify(prev(s)) !== JSON.stringify(s));
    },
  );

  // Feature: launch-feedback-website, Property 36: Angle_Viewer turn axis clamps and follows the Turn_View order
  test.prop([fc.nat({ max: 20 })], runs)('repeated next walks 01 to 05 in order and stays on 05', (n) => {
    let s = INITIAL;
    for (let i = 0; i < n; i++) s = next(s);
    expect(shown(s)).toBe(TURN_VIEWS[Math.min(n, 4)]);
    for (let i = 0; i < n; i++) s = prev(s);
    expect(shown(s)).toBe(TURN_VIEWS[0]);
  });

  // Feature: launch-feedback-website, Property 36: Angle_Viewer turn axis clamps and follows the Turn_View order
  test.prop([reachableState()], runs)('hintView is the next Turn_View, or null at 05 and while a tab is open; it does not mutate', (s) => {
    const before = JSON.stringify(s);
    const expected = s.tab === null && s.turn < 4 ? TURN_VIEWS[s.turn + 1] : null;
    expect(hintView(s)).toBe(expected);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('Property 37: tabs never move the remembered turn', () => {
  // Feature: launch-feedback-website, Property 37: Angle_Viewer tabs never move the remembered turn
  test.prop([reachableState(), tabArb], runs)('toggleTab and goto keep turn; shown follows the toggle', (s, t) => {
    expect(toggleTab(s, t).turn).toBe(s.turn);
    expect(goto(s, t).turn).toBe(s.turn);
    expect(shown(toggleTab(s, t))).toBe(s.tab !== t ? t : TURN_VIEWS[s.turn]);
  });

  // Feature: launch-feedback-website, Property 37: Angle_Viewer tabs never move the remembered turn
  test.prop([reachableState(), tabArb], runs)('pressing a tab twice returns to the view left; goto is idempotent', (s, t) => {
    if (s.tab === null || s.tab === t) expect(toggleTab(toggleTab(s, t), t)).toEqual(s);
    expect(goto(goto(s, t), t)).toEqual(goto(s, t));
  });

  // Feature: launch-feedback-website, Property 37: Angle_Viewer tabs never move the remembered turn
  test.prop([reachableState(), fc.array(fc.oneof(
    tabArb.map<ViewerAction>((tab) => ({ type: 'toggleTab', tab })),
    tabArb.map<ViewerAction>((tab) => ({ type: 'goto', view: tab })),
  ), { maxLength: 30 })], runs)('a run of tab actions leaves turn unchanged', (s, actions) => {
    const end = actions.reduce(applyAction, s);
    expect(end.turn).toBe(s.turn);
  });
});

describe('Property 38: drag and key direction rules', () => {
  const finite = fc.oneof(
    fc.double({ noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 }),
    fc.integer({ min: -100, max: 100 }),
    fc.constant(0),
  );
  const threshold = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.001, max: 500 }), fc.integer({ min: 1, max: 100 }));

  // Feature: launch-feedback-website, Property 38: Drag and key direction rules
  test.prop([finite, finite, threshold], runs)('dragOutcome follows the threshold and dominance rule', (dx, dy, th) => {
    const out = dragOutcome(dx, dy, th);
    const dominant = Math.abs(dx) > Math.abs(dy);
    expect(out === 'next').toBe(dx <= -th && dominant);
    expect(out === 'prev').toBe(dx >= th && dominant);
    if (Math.abs(dy) >= Math.abs(dx)) expect(out).toBeNull();
    const mirrored = dragOutcome(-dx, dy, th);
    expect(mirrored).toBe(out === 'next' ? 'prev' : out === 'prev' ? 'next' : null);
  });

  // Feature: launch-feedback-website, Property 38: Drag and key direction rules
  test.prop([fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 5 })], runs)('values exactly on the threshold count', (th, extra) => {
    expect(dragOutcome(-th, 0, th)).toBe('next');
    expect(dragOutcome(th, 0, th)).toBe('prev');
    expect(dragOutcome(-th, th + extra, th)).toBeNull();
  });

  // Feature: launch-feedback-website, Property 38: Drag and key direction rules
  test.prop([fc.oneof(fc.string(), fc.constantFrom('ArrowUp', 'ArrowDown', 'Right', 'Left', 'arrowright', ''))], runs)(
    'keyOutcome maps only ArrowRight and ArrowLeft',
    (key) => {
      const expected = key === 'ArrowRight' ? 'next' : key === 'ArrowLeft' ? 'prev' : null;
      expect(keyOutcome(key)).toBe(expected);
    },
  );
});

describe('Property 39: position text names the view and its place', () => {
  // Feature: launch-feedback-website, Property 39: Position text names the view and its place
  test.prop([reachableState()], runs)('text matches the format and contains the shown view name', (s) => {
    const text = positionText(s);
    const expected =
      s.tab === null ? `${VIEW_NAMES[TURN_VIEWS[s.turn]]}, ${s.turn + 1} of 5` : VIEW_NAMES[s.tab];
    expect(text).toBe(expected);
    expect(text).toContain(VIEW_NAMES[shown(s)]);
  });
});
