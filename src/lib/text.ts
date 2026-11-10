// Plain-text helpers for visitor free text (Requirement 14.7).
// Free text is stored plainly (normalised, never HTML-escaped) and escaped on display.

// Unicode "Cc" category: C0 and C1 control characters, including TAB, CR, LF and DEL.
const CONTROL_CHARS = /\p{Cc}/gu;

/**
 * NFC-normalise, strip control characters and trim.
 * Control characters are stripped first so that NFC runs on the final text,
 * which keeps the function idempotent.
 */
export function normaliseText(s: string): string {
  return s.replace(CONTROL_CHARS, '').normalize('NFC').trim();
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const UNESCAPES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Escape the five HTML-significant characters. Output has no raw < > " ' and no bare &. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Exact inverse of `escapeHtml`. Single pass, so "&amp;lt;" becomes "&lt;", not "<". */
export function unescapeHtml(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => UNESCAPES[e]);
}
