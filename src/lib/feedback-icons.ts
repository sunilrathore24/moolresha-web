/**
 * Small hand-drawn-style line icons for the feedback form's verdict/change/priority chips
 * (redesign, 2026-11). Each is raw inner SVG markup (paths/shapes only, no outer `<svg>`),
 * stroke-based, matching the site's existing minimal icon style (e.g. the header's search
 * icon: `fill="none" stroke="currentColor" stroke-width="2"`). Rendered by `FeedbackIcon.astro`
 * via `set:html` — safe because every string here is static, developer-authored markup, never
 * user input.
 *
 * Plain TypeScript, no Astro import, so this stays testable/importable anywhere.
 */
export type FeedbackIconName =
  | 'would_wear'
  | 'maybe'
  | 'not_for_me'
  | 'fit'
  | 'fabric_weight'
  | 'colour'
  | 'pockets'
  | 'price'
  | 'other'
  | 'softness'
  | 'no_shrinking'
  | 'breathability'
  | 'easy_care'
  | 'colour_lasts'
  | 'long_life';

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const FEEDBACK_ICONS: Record<FeedbackIconName, string> = {
  // ---- Verdict ----
  would_wear: `<path ${S} d="M8 10v9H5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 3.5-6a2 2 0 0 1 2 2.2L13 10h5a2 2 0 0 1 2 2.3l-1.1 6A2 2 0 0 1 17 20H10a2 2 0 0 1-2-2v-8Z"/>`,
  maybe: `<circle ${S} cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path ${S} d="M8.5 15h7"/>`,
  not_for_me: `<circle ${S} cx="12" cy="12" r="8.5"/><path ${S} d="M9 9l6 6M15 9l-6 6"/>`,

  // ---- Change chips ----
  fit: `<rect ${S} x="4" y="9" width="16" height="6" rx="1.2"/><path ${S} d="M8 9v2.5M12 9v3.5M16 9v2.5"/>`,
  fabric_weight: `<path ${S} d="M5 16h14M6 12h12M7 8h10"/>`,
  colour: `<path ${S} d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3Z"/>`,
  pockets: `<path ${S} d="M5 8l1.2-3h11.6L19 8M5 8h14v10a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18V8Z"/>`,
  price: `<path ${S} d="M12.6 4H6.5A1.5 1.5 0 0 0 5 5.5v6.1c0 .4.16.78.44 1.06l8.4 8.4c.58.58 1.52.58 2.1 0l5.06-5.06c.58-.58.58-1.52 0-2.1l-8.4-8.4A1.5 1.5 0 0 0 12.6 4Z"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/>`,
  other: `<circle cx="6.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="17.5" cy="12" r="1.4" fill="currentColor"/>`,

  // ---- Priority chips ----
  softness: `<path ${S} d="M7.5 17a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 8a4.5 4.5 0 0 1 1.2 9H7.5Z"/>`,
  no_shrinking: `<path ${S} d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6"/>`,
  breathability: `<path ${S} d="M3 8h11a2.5 2.5 0 1 0-2.4-3.2M3 12h15a2.5 2.5 0 1 1-2.4 3.2M3 16h9a2 2 0 1 1-1.8 2.8"/>`,
  easy_care: `<circle ${S} cx="12" cy="12" r="8.5"/><path ${S} d="M8.2 12.3l2.6 2.6 5-5.4"/>`,
  colour_lasts: `<path ${S} d="M12 3.5l7 2.3v5.4c0 4.4-2.9 7.9-7 9.3-4.1-1.4-7-4.9-7-9.3V5.8L12 3.5Z"/>`,
  long_life: `<path ${S} d="M7.5 9a3 3 0 1 0 0 6c1.8 0 3.3-1.6 4.5-3 1.2 1.4 2.7 3 4.5 3a3 3 0 1 0 0-6c-1.8 0-3.3 1.6-4.5 3-1.2-1.4-2.7-3-4.5-3Z"/>`,
};
