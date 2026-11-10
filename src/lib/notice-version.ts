/**
 * Privacy_Notice version, shared by the privacy page, the Interest_Form notice
 * and the interest endpoint (which stores it with each consent row and rejects
 * a stale value with `409 notice_outdated`).
 *
 * Pure constant with no imports, so it runs in the browser island, in Pages
 * Functions and in Vitest. The single source of truth is
 * `src/content/config/privacy.yaml#version`. Keep this value equal to it:
 * `tests/unit/privacy.test.ts` and `src/pages/privacy.astro` both fail the
 * build when the two differ.
 */
export const NOTICE_VERSION = '0.1';
