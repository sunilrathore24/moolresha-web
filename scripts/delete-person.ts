/**
 * Deletion helper for a withdrawal or deletion request (Requirements 13.5, 13.6).
 *
 * This script PRINTS. It never executes a delete, never opens the database and never
 * calls the network. A human reviews the output and runs it with `wrangler`.
 * See docs/deletion-procedure.md.
 *
 * Step 1, lookup (prints the SELECT for the operator to run):
 *   npx tsx scripts/delete-person.ts lookup <email | +91XXXXXXXXXX | 10-digit mobile>
 *
 * Step 2, plan (prints the delete statements for the row that step 1 found):
 *   npx tsx scripts/delete-person.ts plan --id <interest.id> --linked <0|1> [--anon-id <uuid>]
 *
 * Statements use bound parameters (?1). The values are printed separately.
 * The `runnable` section is for `wrangler d1 execute --file`, which cannot bind values.
 * It inlines only the validated integer id and the validated Anonymous_ID, never an
 * email or phone number.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DATABASE_NAME = 'moolresha_feedback';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Conservative: no quotes, spaces, backticks, `$` or other characters that matter to a shell or to SQL.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const PHONE_E164 = /^\+91[6-9][0-9]{9}$/;
const PHONE_LOCAL = /^[6-9][0-9]{9}$/;

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** Classifies the requester's identifier. Returns null when it is neither a plain email nor an Indian mobile. */
export function parseIdentifier(raw: string): Identifier | null {
  const s = raw.trim();
  if (EMAIL.test(s)) return { kind: 'email', value: s };
  const compact = s.replace(/[\s-]/g, '');
  if (PHONE_E164.test(compact)) return { kind: 'phone', value: compact };
  if (PHONE_LOCAL.test(compact)) return { kind: 'phone', value: `+91${compact}` };
  return null;
}

/**
 * The exact command the operator runs to find the row. `wrangler d1 execute` cannot bind
 * parameters, so the value is inlined, but only after `parseIdentifier` has restricted it to
 * characters that are safe in both a double-quoted shell string and a SQL string literal.
 */
export function buildLookupCommand(id: Identifier): string {
  if (id.kind === 'email' ? !EMAIL.test(id.value) : !PHONE_E164.test(id.value)) {
    throw new Error('buildLookupCommand: identifier was not validated');
  }
  const where = id.kind === 'email' ? `lower(email) = lower('${id.value}')` : `phone = '${id.value}'`;
  const sql = `SELECT id, anon_id, linked FROM interest WHERE ${where}`;
  return `npx wrangler d1 execute ${DATABASE_NAME} --remote --command "${sql}"`;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** The columns of the `interest` row that the plan needs. */
export interface InterestRowRef {
  id: number;
  anon_id: string | null;
  linked: 0 | 1 | boolean;
}

export type PlanValue = string | number;

export interface PlanStatement {
  purpose: string;
  sql: string;
  params: PlanValue[];
}

export interface DeletionPlan {
  /** In the order they must run: children first, `interest` last. */
  statements: PlanStatement[];
  /** Plain-text steps for the MailerLite side. Nothing here is executed. */
  mailerLite: string[];
}

export const MAILERLITE_STEPS: readonly string[] = [
  'In the MailerLite dashboard, or with GET /api/subscribers/:email, find the subscriber for the requester\'s email and note the subscriber id.',
  'Call POST /api/subscribers/:id/forget. Do not use DELETE: it keeps the data in case of re-subscription.',
  'MailerLite finishes a forget within 30 days. Note that date for the reply. If the requester gave only a phone number, there is no MailerLite record to forget.',
];

/**
 * Pure. Builds the delete statements for one `interest` row.
 *
 * - Linked row: delete its `concept_feedback` and `frustration` rows through `anon_id`.
 * - Unlinked row: those two statements are left out, because no feedback is tied to the person.
 * - `consents` is deleted explicitly even though ON DELETE CASCADE would remove it, so the
 *   plan reads as a complete audit trail.
 * - `interest` is deleted last.
 */
export function buildDeletionPlan(row: InterestRowRef): DeletionPlan {
  if (!Number.isInteger(row.id) || row.id <= 0) {
    throw new Error('buildDeletionPlan: id must be a positive integer');
  }
  const linked = row.linked === true || row.linked === 1;
  const unlinked = row.linked === false || row.linked === 0;
  if (!linked && !unlinked) throw new Error('buildDeletionPlan: linked must be 0 or 1');

  const statements: PlanStatement[] = [];
  if (linked) {
    if (typeof row.anon_id !== 'string' || !UUID.test(row.anon_id)) {
      throw new Error('buildDeletionPlan: a linked row needs a valid anon_id (UUID)');
    }
    statements.push(
      {
        purpose: 'Delete the linked Concept feedback',
        sql: 'DELETE FROM concept_feedback WHERE anon_id = ?1',
        params: [row.anon_id],
      },
      {
        purpose: 'Delete the linked frustration answer',
        sql: 'DELETE FROM frustration WHERE anon_id = ?1',
        params: [row.anon_id],
      },
    );
  } else if (row.anon_id !== null && row.anon_id !== undefined) {
    throw new Error('buildDeletionPlan: an unlinked row must not have an anon_id');
  }
  statements.push(
    {
      purpose: 'Delete the consent records (also removed by ON DELETE CASCADE; listed for the audit trail)',
      sql: 'DELETE FROM consents WHERE interest_id = ?1',
      params: [row.id],
    },
    {
      purpose: 'Delete the interest row (email, phone, size)',
      sql: 'DELETE FROM interest WHERE id = ?1',
      params: [row.id],
    },
  );
  return { statements, mailerLite: [...MAILERLITE_STEPS] };
}

/**
 * Text for `wrangler d1 execute --file`, which cannot bind values. Inlines only the integer id
 * and the UUID anon_id. A value of any other shape throws, so no other text can reach the SQL.
 */
export function renderRunnableSql(plan: DeletionPlan): string {
  return plan.statements
    .map((s) => {
      if (s.params.length !== 1) throw new Error('renderRunnableSql: expected one parameter');
      const v = s.params[0] as PlanValue;
      let literal: string;
      if (typeof v === 'number' && Number.isInteger(v) && v > 0) literal = String(v);
      else if (typeof v === 'string' && UUID.test(v)) literal = `'${v}'`;
      else throw new Error('renderRunnableSql: only a positive integer id or a UUID can be inlined');
      return `${s.sql.replace('?1', literal)};`;
    })
    .join('\n');
}

export function formatPlan(plan: DeletionPlan): string {
  const out: string[] = ['-- Review these statements. This script has not run them.', ''];
  plan.statements.forEach((s, i) => {
    out.push(`-- ${i + 1}. ${s.purpose}`);
    out.push(`${s.sql};`);
    out.push(`-- ?1 = ${JSON.stringify(s.params[0])}`);
    out.push('');
  });
  out.push('-- Runnable file for `wrangler d1 execute` (inlines only the validated id / Anonymous_ID):');
  out.push(renderRunnableSql(plan));
  out.push('');
  out.push(
    `-- Run: save the lines above as delete.sql, then: npx wrangler d1 execute ${DATABASE_NAME} --remote --file=delete.sql`,
  );
  out.push('');
  out.push('MailerLite (manual steps):');
  plan.mailerLite.forEach((m, i) => out.push(`  ${i + 1}. ${m}`));
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI (thin)
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  tsx scripts/delete-person.ts lookup <email | +91XXXXXXXXXX | 10-digit mobile>
  tsx scripts/delete-person.ts plan --id <interest.id> --linked <0|1> [--anon-id <uuid>]`;

/** Pure: argv (after the script name) to output text. Throws Error with a message on bad input. */
export function run(args: readonly string[]): string {
  const [command, ...rest] = args;
  if (command === 'lookup') {
    if (rest.length !== 1) throw new Error(USAGE);
    const id = parseIdentifier(rest[0] as string);
    if (id === null) throw new Error('Not a plain email address or an Indian mobile number.\n' + USAGE);
    return [
      'Run this, then pass the id, linked and anon_id it returns to the "plan" command:',
      '',
      buildLookupCommand(id),
    ].join('\n');
  }
  if (command === 'plan') {
    const opts = new Map<string, string>();
    for (let i = 0; i < rest.length; i += 2) {
      const key = rest[i];
      const value = rest[i + 1];
      if (key === undefined || !key.startsWith('--') || value === undefined) throw new Error(USAGE);
      opts.set(key, value);
    }
    const idText = opts.get('--id');
    const linkedText = opts.get('--linked');
    if (idText === undefined || linkedText === undefined) throw new Error(USAGE);
    if (!/^[0-9]+$/.test(idText)) throw new Error('--id must be a positive integer');
    if (linkedText !== '0' && linkedText !== '1') throw new Error('--linked must be 0 or 1');
    const anon = opts.get('--anon-id');
    const row: InterestRowRef = {
      id: Number(idText),
      linked: linkedText === '1' ? 1 : 0,
      anon_id: anon === undefined || anon === 'null' ? null : anon,
    };
    return formatPlan(buildDeletionPlan(row));
  }
  throw new Error(USAGE);
}

function main(): void {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
