/**
 * Pure state module for the Angle_Viewer. No DOM access, so it can be tested
 * without a browser. The island (angle-viewer-island.ts) renders this state.
 *
 * - The turn axis (Turn_Views 01–05) clamps at both ends and never wraps.
 * - A tab (Inside, Fabric close-up, On a model) is shown over the remembered
 *   Turn_View. Tabs never change `turn`. Previous and Next close the tab.
 * - A Palette_Colour may also have one optional "extra" photo beyond the
 *   eight Concept_Views (today: the colour's material card, when the asset
 *   folder has one — see `conceptMaterialCards` in `concept-images.ts`).
 *   It behaves exactly like a tab: `goto` shows it over the remembered turn,
 *   without moving `turn`.
 */
import {
  TURN_VIEWS,
  TAB_VIEWS,
  VIEW_NAMES,
  type TabView,
  type TurnView,
  type ViewBase,
} from '../lib/concept-views';

export type TurnIndex = 0 | 1 | 2 | 3 | 4;

/** Extra_Views: the material card, plus up to three generic "extra photo" slots for real
 * photography that does not fit one of the eight named Concept_Views (see
 * `concept-image-resolver.ts`'s `resolveExtraPhotos`). Add more literal slots here if a fourth
 * is ever needed — nothing else in this module hardcodes the count. */
export const EXTRA_VIEWS = ['material-card', 'extra-1', 'extra-2', 'extra-3'] as const;
export type ExtraView = (typeof EXTRA_VIEWS)[number];
export const EXTRA_VIEW_NAMES: Record<ExtraView, string> = {
  'material-card': 'Material passport',
  'extra-1': 'Detail view',
  'extra-2': 'Additional view',
  'extra-3': 'More detail',
};

export interface ViewerState {
  /** Index into TURN_VIEWS. */
  turn: TurnIndex;
  /** The open tab or Extra_View, or null while a Turn_View is shown. */
  tab: TabView | ExtraView | null;
}

export const INITIAL: ViewerState = { turn: 0, tab: null };

const LAST_TURN = (TURN_VIEWS.length - 1) as TurnIndex;

export function next(s: ViewerState): ViewerState {
  return { turn: Math.min(s.turn + 1, LAST_TURN) as TurnIndex, tab: null };
}

export function prev(s: ViewerState): ViewerState {
  return { turn: Math.max(s.turn - 1, 0) as TurnIndex, tab: null };
}

function isTabView(v: ViewBase): v is TabView {
  return (TAB_VIEWS as readonly string[]).includes(v);
}

/** Turn_View → that turn, no tab. Tab or Extra_View → that view over the remembered turn. */
export function goto(s: ViewerState, v: ViewBase | ExtraView): ViewerState {
  if ((EXTRA_VIEWS as readonly string[]).includes(v) || isTabView(v as ViewBase)) {
    return { turn: s.turn, tab: v as TabView | ExtraView };
  }
  return { turn: (TURN_VIEWS as readonly string[]).indexOf(v) as TurnIndex, tab: null };
}

/** Pressing the open tab closes it; otherwise opens `t`. `turn` never changes. */
export function toggleTab(s: ViewerState, t: TabView): ViewerState {
  return { turn: s.turn, tab: s.tab === t ? null : t };
}

export function shown(s: ViewerState): ViewBase | ExtraView {
  return s.tab ?? TURN_VIEWS[s.turn];
}

export function canPrev(s: ViewerState): boolean {
  return s.tab !== null || s.turn > 0;
}

export function canNext(s: ViewerState): boolean {
  return s.tab !== null || s.turn < LAST_TURN;
}

/** "Side, 3 of 5" for a Turn_View; the view name for a tab or Extra_View. */
export function positionText(s: ViewerState): string {
  if (s.tab !== null) return VIEW_NAMES[s.tab as TabView] ?? EXTRA_VIEW_NAMES[s.tab as ExtraView];
  return `${VIEW_NAMES[TURN_VIEWS[s.turn]]}, ${s.turn + 1} of ${TURN_VIEWS.length}`;
}

/** The next Turn_View for the hover hint, or null at 05 and while a tab is shown. */
export function hintView(s: ViewerState): TurnView | null {
  if (s.tab !== null || s.turn >= LAST_TURN) return null;
  return TURN_VIEWS[s.turn + 1];
}

/**
 * Horizontal gestures only: |dx| >= threshold and |dx| > |dy|.
 * Dragging left (dx < 0) shows the next view; right shows the previous one.
 */
export function dragOutcome(dx: number, dy: number, threshold: number): 'next' | 'prev' | null {
  const ax = Math.abs(dx);
  if (ax < threshold || ax <= Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

export function keyOutcome(key: string): 'next' | 'prev' | null {
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  return null;
}
