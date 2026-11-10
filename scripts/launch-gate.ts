/**
 * Launch gate (Requirements 8B.10, 19.5).
 *
 * Runs only when `PUBLIC_LAUNCH=true`. It reads `docs/launch-checklist.md` and
 * fails (exit 1) when either of these records is missing:
 *   - the lawyer review date, and
 *   - the on-model no-face review date for every Concept in `CONCEPT_IDS`.
 *
 * It checks only that a valid `YYYY-MM-DD` date is recorded. The reviews
 * themselves are human work. The alt-text and free-tier records in the
 * checklist are for people and are not enforced here.
 *
 * Record format, one per list line in the checklist:
 *   - lawyer-review-date: <YYYY-MM-DD>
 *   - on-model-review: <concept-id>: <YYYY-MM-DD>
 * A blank or invalid value means "not recorded". Lines inside fenced code
 * blocks are ignored, so the checklist can show examples.
 *
 * The logic is in pure, exported functions. The CLI at the bottom only runs
 * when this file is the entry point. No network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONCEPT_IDS } from '../src/content/config/allow-lists';

export const LAWYER_RECORD = 'lawyer-review-date';
export const ON_MODEL_RECORD = 'on-model-review';

export interface LaunchCheckResult {
  ok: boolean;
  /** One message per missing record, in a stable order (lawyer date first, then Concepts in the given order). */
  missing: string[];
}

export interface LaunchGateResult extends LaunchCheckResult {
  /** True when the gate did not run because `PUBLIC_LAUNCH` is not "true". */
  skipped: boolean;
  /** Lines for the CLI to print. */
  messages: string[];
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function stripFencedCode(markdown: string): string {
  const out: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      const marker = m[1] as string;
      if (fence === undefined) fence = marker.charAt(0);
      else if (marker.charAt(0) === fence) fence = undefined;
      continue;
    }
    if (fence === undefined) out.push(line);
  }
  return out.join('\n');
}

/**
 * Checks the launch records in the checklist text.
 *
 * @param markdown  The contents of `docs/launch-checklist.md`.
 * @param conceptIds  The Concepts that each need an on-model review date.
 */
export function checkLaunchRecords(markdown: string, conceptIds: readonly string[]): LaunchCheckResult {
  const lines = stripFencedCode(markdown).split('\n');
  const lawyerRe = new RegExp(`^\\s*[-*]\\s+${LAWYER_RECORD}:[ \\t]*(.*?)\\s*$`);
  const onModelRe = new RegExp(`^\\s*[-*]\\s+${ON_MODEL_RECORD}:[ \\t]*([a-z0-9-]+)[ \\t]*:[ \\t]*(.*?)\\s*$`);

  let lawyerRecorded = false;
  const onModelRecorded = new Set<string>();
  for (const line of lines) {
    const lawyer = lawyerRe.exec(line);
    if (lawyer) {
      if (isValidIsoDate(lawyer[1] as string)) lawyerRecorded = true;
      continue;
    }
    const onModel = onModelRe.exec(line);
    if (onModel && isValidIsoDate(onModel[2] as string)) onModelRecorded.add(onModel[1] as string);
  }

  const missing: string[] = [];
  if (!lawyerRecorded) missing.push(`${LAWYER_RECORD}: no valid YYYY-MM-DD date recorded`);
  for (const id of conceptIds) {
    if (!onModelRecorded.has(id)) missing.push(`${ON_MODEL_RECORD}: ${id}: no valid YYYY-MM-DD date recorded`);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Applies the `PUBLIC_LAUNCH` switch and formats the output.
 *
 * @param env  The environment values (only `PUBLIC_LAUNCH` is read).
 * @param markdown  The checklist text (not read when the gate is skipped).
 */
export function runLaunchGate(
  env: { PUBLIC_LAUNCH?: string | undefined },
  markdown: string,
  conceptIds: readonly string[] = CONCEPT_IDS,
): LaunchGateResult {
  if (env.PUBLIC_LAUNCH !== 'true') {
    return {
      skipped: true,
      ok: true,
      missing: [],
      messages: ['launch-gate: skipped (PUBLIC_LAUNCH is not "true").'],
    };
  }
  const result = checkLaunchRecords(markdown, conceptIds);
  const messages = result.ok
    ? ['launch-gate: OK. All required launch records are present.']
    : [
        `launch-gate: FAIL. ${result.missing.length} required record(s) missing in docs/launch-checklist.md:`,
        ...result.missing.map((m) => `  - ${m}`),
      ];
  return { ...result, skipped: false, messages };
}

/** CLI wrapper. Returns the exit code. */
export function main(
  env: NodeJS.ProcessEnv = process.env,
  checklistPath: string = resolve(process.cwd(), 'docs/launch-checklist.md'),
): number {
  if (env.PUBLIC_LAUNCH !== 'true') {
    console.log(runLaunchGate(env, '').messages.join('\n'));
    return 0;
  }
  if (!existsSync(checklistPath)) {
    console.error(`launch-gate: FAIL. ${checklistPath} not found.`);
    return 1;
  }
  const result = runLaunchGate(env, readFileSync(checklistPath, 'utf8'));
  const text = result.messages.join('\n');
  if (result.ok) console.log(text);
  else console.error(text);
  return result.ok ? 0 : 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.exit(main());
}
