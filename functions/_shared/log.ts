/**
 * Structured logger that must never write personal data (Requirement 14.9).
 * - Drops these keys: email, phone, ip, ua, anonId, token, text (matched ignoring case,
 *   spaces, underscores and hyphens, so `anon_id` and `AnonId` are dropped too).
 * - Redacts values that look like email addresses, Indian mobile numbers or IP addresses.
 */

export const DROPPED_KEYS = ["email", "phone", "ip", "ua", "anonId", "token", "text"] as const;

export const REDACTED = "[redacted]";

const normaliseKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const DROPPED = new Set<string>(DROPPED_KEYS.map(normaliseKey));

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// Indian mobile: optional +91 / 91 / 0091 / 0 prefix, then 10 digits starting 6-9 (optional space or hyphen after 5 digits).
const IN_MOBILE = /(?<!\d)(?:(?:\+|00)?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g;
const H = "[0-9a-fA-F]{1,4}";
const IPV6 = new RegExp(
  `(?<![\\w:])(?:(?:${H}:){7}${H}|(?:${H}(?::${H}){0,6})?::(?:${H}(?::${H}){0,6})?)(?![\\w:])`,
  "g",
);

/** Replaces email-, Indian-mobile- and IP-like substrings with `[redacted]`. */
export function redact(value: string): string {
  return value
    .replace(EMAIL, REDACTED)
    .replace(IPV4, REDACTED)
    .replace(IPV6, REDACTED)
    .replace(IN_MOBILE, REDACTED);
}

export type LogFields = Record<string, string | number | boolean>;

/** Returns a copy without dropped keys and with redacted string and number values. */
export function sanitiseFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DROPPED.has(normaliseKey(key))) continue;
    if (typeof value === "string") out[key] = redact(value);
    else if (typeof value === "number") {
      out[key] = redact(String(value)) === String(value) ? value : REDACTED;
    } else out[key] = value;
  }
  return out;
}

export function log(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ event: redact(event), ...sanitiseFields(fields) }));
}
