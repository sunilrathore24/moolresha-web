/**
 * fast-check arbitraries for the Angle_Viewer state module.
 * `viewerActions()` yields action sequences; `reachableState()` applies one
 * from INITIAL, so tests only see states the viewer can actually reach.
 */
import fc from 'fast-check';
import { VIEW_BASES, TAB_VIEWS, type TabView, type ViewBase } from '../../src/lib/concept-views';
import { INITIAL, goto, next, prev, toggleTab, type ViewerState } from '../../src/islands/angle-viewer-state';

export type ViewerAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; view: ViewBase }
  | { type: 'toggleTab'; tab: TabView };

export function viewerAction(): fc.Arbitrary<ViewerAction> {
  return fc.oneof(
    fc.constant<ViewerAction>({ type: 'next' }),
    fc.constant<ViewerAction>({ type: 'prev' }),
    fc.constantFrom(...VIEW_BASES).map<ViewerAction>((view) => ({ type: 'goto', view })),
    fc.constantFrom(...TAB_VIEWS).map<ViewerAction>((tab) => ({ type: 'toggleTab', tab })),
  );
}

/** A sequence (possibly empty) of viewer actions. */
export function viewerActions(): fc.Arbitrary<ViewerAction[]> {
  return fc.array(viewerAction(), { minLength: 0, maxLength: 40 });
}

export function applyAction(s: ViewerState, a: ViewerAction): ViewerState {
  switch (a.type) {
    case 'next':
      return next(s);
    case 'prev':
      return prev(s);
    case 'goto':
      return goto(s, a.view);
    case 'toggleTab':
      return toggleTab(s, a.tab);
  }
}

export function applyActions(s: ViewerState, actions: readonly ViewerAction[]): ViewerState {
  return actions.reduce(applyAction, s);
}

/** A state reached from INITIAL by some sequence of actions. */
export function reachableState(): fc.Arbitrary<ViewerState> {
  return viewerActions().map((actions) => applyActions(INITIAL, actions));
}
