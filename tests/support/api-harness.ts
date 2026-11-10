/**
 * Shared helpers for property tests that drive the Pages Function handlers against the SQLite D1
 * adapter, with Turnstile and MailerLite mocked through an injected fetch.
 *
 * Nothing here reaches the network: the fake fetch throws for any URL it does not know.
 */
import { vi } from 'vitest';
import type { D1Like } from '../../functions/_shared/db';
import type { Env } from '../../functions/_shared/env';
import type { SqliteD1 } from './d1-sqlite';

export const ORIGIN = 'https://www.moolresha.com';
export const TEST_IP = '203.0.113.77';
export const TEST_UA = 'PropertyTest/1.0 (unit-test-ua)';
export const NOW = new Date('2026-11-10T10:00:00.000Z');
export const ML_GROUP = 'group-1';
export const ADMIN_SECRET = 'test-admin-secret';

/** Placeholder values only. No real secrets. */
export function testEnv(db: D1Like, over: Record<string, unknown> = {}): Env {
  return {
    DB: db,
    TURNSTILE_SECRET: 'test-secret',
    MAILERLITE_API_KEY: 'test-ml-key',
    ADMIN_BEARER_SECRET: ADMIN_SECRET,
    IDENTITY_SALT_SEED: 'test-salt-seed',
    ML_GROUP_ID: ML_GROUP,
    ...over,
  } as unknown as Env;
}

// ---------------------------------------------------------------------------
// Fake fetch (Turnstile + MailerLite)
// ---------------------------------------------------------------------------

export type FetchBehaviour = (url: string, init?: RequestInit) => Response | Promise<Response>;

export interface FakeFetchCall {
  url: string;
  init: RequestInit;
}

export interface FakeFetch {
  fn: (url: string, init?: RequestInit) => Promise<Response>;
  calls: FakeFetchCall[];
  turnstileCalls(): FakeFetchCall[];
  mailerliteCalls(): FakeFetchCall[];
}

export const turnstileOk: FetchBehaviour = () =>
  new Response(JSON.stringify({ success: true, hostname: 'www.moolresha.com', 'error-codes': [] }), { status: 200 });

/** Ways Turnstile verification can fail. Each one must make the handler answer 403 bot_check_failed. */
export const TURNSTILE_FAILURES: Record<string, FetchBehaviour> = {
  success_false: () =>
    new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
  timeout_or_duplicate: () =>
    new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), { status: 200 }),
  hostname_mismatch: () =>
    new Response(JSON.stringify({ success: true, hostname: 'evil.example', 'error-codes': [] }), { status: 200 }),
  non_200: () => new Response('{}', { status: 500 }),
  bad_body: () => new Response('<html>not json</html>', { status: 200 }),
  network_error: () => {
    throw new TypeError('network down');
  },
};

export function createFakeFetch(opts: { turnstile?: FetchBehaviour; mailerlite?: FetchBehaviour } = {}): FakeFetch {
  const calls: FakeFetchCall[] = [];
  const fn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init: init ?? {} });
    if (url.startsWith('https://challenges.cloudflare.com/')) return (opts.turnstile ?? turnstileOk)(url, init);
    if (url.startsWith('https://connect.mailerlite.com/')) {
      return (opts.mailerlite ?? (() => new Response('{}', { status: 200 })))(url, init);
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };
  return {
    fn,
    calls,
    turnstileCalls: () => calls.filter((c) => c.url.startsWith('https://challenges.cloudflare.com/')),
    mailerliteCalls: () => calls.filter((c) => c.url.startsWith('https://connect.mailerlite.com/')),
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ReqOptions {
  method?: string;
  /** `null` leaves the Origin header out. */
  origin?: string | null;
  /** `null` leaves Content-Type out. */
  contentType?: string | null;
  body?: unknown;
  rawBody?: string;
  ip?: string;
  headers?: Record<string, string>;
}

export function makeRequest(path: string, o: ReqOptions = {}): Request {
  const headers = new Headers({ 'CF-Connecting-IP': o.ip ?? TEST_IP, 'User-Agent': TEST_UA });
  if (o.origin !== null) headers.set('Origin', o.origin ?? ORIGIN);
  if (o.contentType !== null) headers.set('Content-Type', o.contentType ?? 'application/json');
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  const method = o.method ?? 'POST';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const text = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : '');
  return new Request(`https://www.moolresha.com${path}`, { method, headers, body: hasBody ? text : undefined });
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export const DATA_TABLES = ['concept_feedback', 'frustration', 'interest', 'consents', 'event_counts'] as const;

/** Every row of the given tables as a sorted list of `table:json` strings, for before/after comparison. */
export function snapshotTables(db: SqliteD1, tables: readonly string[] = DATA_TABLES): string[] {
  const out: string[] = [];
  for (const t of tables) {
    for (const row of db.raw.prepare(`SELECT * FROM ${t}`).all()) out.push(`${t}:${JSON.stringify(row)}`);
  }
  return out.sort();
}

export function countRows(db: SqliteD1, table: string): number {
  return (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

// ---------------------------------------------------------------------------
// Console noise
// ---------------------------------------------------------------------------

/** Silences console output (handlers log rejection events). Returns the restore function. */
export function silenceConsole(): () => void {
  const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  return () => spies.forEach((s) => s.mockRestore());
}
