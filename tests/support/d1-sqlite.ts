/**
 * A better-sqlite3 stand-in for Cloudflare D1, for tests.
 *
 * It gives the D1 shape (`prepare().bind().run()/all()/first()` and `batch()`) over an
 * in-memory SQLite database. The real migrations from `migrations/` are applied, so tests
 * run against the production schema, constraints and SQL.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore better-sqlite3 ships no types and @types/better-sqlite3 is not installed
import Database from 'better-sqlite3';
import type { D1Like, D1PreparedStatementLike, D1RunResult, D1Value } from '../../functions/_shared/db';

interface SqliteStatement {
  reader: boolean;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/**
 * D1 accepts numbered placeholders (`?1`, `?2`, a number used more than once). better-sqlite3
 * does not, so rewrite each `?N` to a plain `?` and repeat/reorder the bound values to match.
 * The SQL under test stays exactly as it runs on D1. The SQL in this repo has no `?` inside
 * string literals, so a plain regex is enough.
 */
export function toPositional(sql: string, params: readonly D1Value[]): { sql: string; params: D1Value[] } {
  const out: D1Value[] = [];
  const rewritten = sql.replace(/\?(\d+)/g, (_m, n: string) => {
    const index = Number(n) - 1;
    if (index < 0 || index >= params.length) {
      throw new RangeError(`Placeholder ?${n} has no bound value (${params.length} bound)`);
    }
    out.push(params[index] as D1Value);
    return '?';
  });
  // Plain `?` placeholders keep their order; mixing the two styles is not used in this repo.
  if (out.length === 0) return { sql, params: [...params] };
  return { sql: rewritten, params: out };
}

class Statement implements D1PreparedStatementLike {
  constructor(
    private readonly db: SqliteDb,
    private readonly sql: string,
    private readonly params: D1Value[] = [],
  ) {}

  bind(...values: D1Value[]): D1PreparedStatementLike {
    return new Statement(this.db, this.sql, values);
  }

  private compile(): { stmt: SqliteStatement; params: D1Value[] } {
    const { sql, params } = toPositional(this.sql, this.params);
    return { stmt: this.db.prepare(sql), params };
  }

  /** Synchronous core, used by `batch()` so it can run inside one transaction. */
  runSync(): D1RunResult {
    const { stmt, params } = this.compile();
    if (stmt.reader) {
      stmt.all(...params);
      return { success: true, meta: { changes: 0 } };
    }
    const info = stmt.run(...params);
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  }

  async run(): Promise<D1RunResult> {
    return this.runSync();
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const { stmt, params } = this.compile();
    if (!stmt.reader) {
      stmt.run(...params);
      return { results: [] };
    }
    return { results: stmt.all(...params) as T[] };
  }

  async first<T = unknown>(): Promise<T | null> {
    const { stmt, params } = this.compile();
    if (!stmt.reader) {
      stmt.run(...params);
      return null;
    }
    return (stmt.get(...params) as T | undefined) ?? null;
  }
}

export interface SqliteD1 extends D1Like {
  /** Direct access for assertions in tests. */
  readonly raw: SqliteDb;
  close(): void;
}

/** Applies every `*.sql` file in `migrations/` in file-name order. */
export function applyMigrations(db: SqliteDb, dir: string = MIGRATIONS_DIR): void {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) db.exec(readFileSync(join(dir, f), 'utf8'));
}

/** Every table in delete order (children first), so a shared database can be emptied between property runs. */
export const ALL_TABLES = ['consents', 'interest', 'concept_feedback', 'frustration', 'event_counts', 'rate_limits'] as const;

/** Empties every table. Cheaper than a new database per run, and keeps the production schema. */
export function clearAllTables(db: { raw: SqliteDb }): void {
  for (const t of ALL_TABLES) db.raw.exec(`DELETE FROM ${t}`);
}

/** A fresh in-memory database with all migrations applied. */
export function createTestD1(): SqliteD1 {
  const db = new Database(':memory:') as SqliteDb;
  applyMigrations(db);
  return {
    raw: db,
    prepare: (sql: string) => new Statement(db, sql),
    // D1 runs a batch as one transaction: either every statement applies or none does.
    async batch(statements: D1PreparedStatementLike[]): Promise<unknown[]> {
      const run = db.transaction(() => statements.map((s) => (s as Statement).runSync()));
      return run();
    },
    close: () => db.close(),
  };
}
