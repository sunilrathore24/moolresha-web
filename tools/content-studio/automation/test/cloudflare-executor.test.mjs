import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../cloudflare/src/worker.mjs';
import {encryptToken} from '../../cloudflare/src/instagram-auth.mjs';
import {createFakeD1, createFakeKV, createFakeAI} from './fakes.mjs';

const base = 'https://moolresha-content-studio.sunilrathore24.workers.dev';
const EXECUTOR_KEY = 'test-executor-key';
const auth = {Authorization: 'Bearer ' + EXECUTOR_KEY};
const ENCRYPTION_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

const VALID_DRAFT_TEXT = JSON.stringify({
  title: 'Linen basics', hook: 'Before buying linen, check these three things.',
  takeaway: 'Choose well. Wear longer.', slides: ['a', 'b', 'c', 'd', 'e', 'f'],
  caption: 'A linen label is a starting point, not the full story. #MoolResha', sources: [], reelScript: 'Linen, explained.',
});

test('GET /jobs/pending claims the oldest pending job and is single-use', async () => {
  const db = createFakeD1({jobs: [
    {job_key: '2026-11-17:carousel-morning', content_kind: 'carousel', status: 'pending', created_at: '2026-11-17T02:30:00Z'},
    {job_key: '2026-11-17:reel-midday', content_kind: 'reel', status: 'pending', created_at: '2026-11-17T07:30:00Z'},
  ]});
  const env = {EXECUTOR_KEY, CONTENT_DB: db};
  const first = await worker.fetch(new Request(base + '/jobs/pending', {headers: auth}), env);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {jobKey: '2026-11-17:carousel-morning', contentKind: 'carousel'});
  const second = await worker.fetch(new Request(base + '/jobs/pending', {headers: auth}), env);
  assert.equal((await second.json()).jobKey, '2026-11-17:reel-midday');
  const third = await worker.fetch(new Request(base + '/jobs/pending', {headers: auth}), env);
  assert.equal(third.status, 204);
});

test('GET /jobs/pending fails closed without CONTENT_DB configured', async () => {
  const res = await worker.fetch(new Request(base + '/jobs/pending', {headers: auth}), {EXECUTOR_KEY});
  assert.equal(res.status, 503);
});

test('POST /generate returns a validated draft and records it on the job', async () => {
  const db = createFakeD1({jobs: [{job_key: 'job-1', content_kind: 'carousel', status: 'claimed', created_at: 'x'}]});
  const env = {EXECUTOR_KEY, CONTENT_DB: db, AI: createFakeAI({response: VALID_DRAFT_TEXT})};
  const res = await worker.fetch(new Request(base + '/generate', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({kind: 'carousel', jobKey: 'job-1'})}), env);
  assert.equal(res.status, 200);
  const {draft} = await res.json();
  assert.equal(draft.slides.length, 6);
  assert.match(draft.caption, /linen label/i);
  const job = db.jobs.find(j => j.job_key === 'job-1');
  assert.equal(job.status, 'generated');
  assert.equal(JSON.parse(job.draft_payload).title, 'Linen basics');
});

test('POST /generate retries once on malformed model output, then succeeds', async () => {
  let calls = 0;
  const env = {EXECUTOR_KEY, AI: createFakeAI(() => { calls++; return {response: calls === 1 ? 'not json at all' : VALID_DRAFT_TEXT}; })};
  const res = await worker.fetch(new Request(base + '/generate', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({kind: 'carousel'})}), env);
  assert.equal(res.status, 200);
  assert.equal(calls, 2);
});

test('POST /generate fails the job when every attempt is malformed', async () => {
  const db = createFakeD1({jobs: [{job_key: 'job-2', content_kind: 'reel', status: 'claimed', created_at: 'x'}]});
  const env = {EXECUTOR_KEY, CONTENT_DB: db, AI: createFakeAI({response: 'garbage'})};
  const res = await worker.fetch(new Request(base + '/generate', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({kind: 'reel', jobKey: 'job-2'})}), env);
  assert.equal(res.status, 502);
  assert.equal(db.jobs[0].status, 'failed');
});

test('POST /media stores an upload and GET /media/:key serves it back with the same bytes and content type', async () => {
  const kv = createFakeKV();
  const env = {EXECUTOR_KEY, CONTENT_MEDIA: kv};
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const upload = await worker.fetch(new Request(base + '/media', {method: 'POST', headers: {...auth, 'content-type': 'image/png', 'content-length': '4'}, body: bytes}), env);
  assert.equal(upload.status, 201);
  const {key, url} = await upload.json();
  assert.match(key, /^[a-f0-9-]{36}\.png$/);
  assert.equal(url, base + '/media/' + key);
  const served = await worker.fetch(new Request(url), env);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);
});

test('POST /media rejects unsupported content types and unauthenticated callers', async () => {
  const env = {EXECUTOR_KEY, CONTENT_MEDIA: createFakeKV()};
  const badType = await worker.fetch(new Request(base + '/media', {method: 'POST', headers: {...auth, 'content-type': 'text/plain', 'content-length': '3'}, body: 'abc'}), env);
  assert.equal(badType.status, 400);
  const unauthed = await worker.fetch(new Request(base + '/media', {method: 'POST', headers: {'content-type': 'image/png', 'content-length': '4'}, body: new Uint8Array(4)}), env);
  assert.equal(unauthed.status, 401);
});

test('GET /media/:key never leaks a 500 for a malformed or unknown key', async () => {
  const env = {CONTENT_MEDIA: createFakeKV()};
  const traversal = await worker.fetch(new Request(base + '/media/..%2f..%2fetc%2fpasswd'), env);
  assert.equal(traversal.status, 404);
  const unknown = await worker.fetch(new Request(base + '/media/' + '0'.repeat(36) + '.png'.replace('0000', 'aaaa')), env);
  assert.equal(unknown.status, 404);
});

async function connectedEnv({live = false} = {}) {
  const cipher = await encryptToken('fake-long-lived-token-0123456789', ENCRYPTION_KEY);
  const db = createFakeD1({
    jobs: [{job_key: 'job-pub', content_kind: 'carousel', status: 'generated', created_at: 'x'}],
    connections: [{instagram_account_id: '17841400000000000', encrypted_user_token: cipher.encrypted, token_iv: cipher.iv, status: 'connected'}],
  });
  const env = {EXECUTOR_KEY, CONTENT_DB: db, INSTAGRAM_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY};
  if (live) { env.ENABLE_INSTAGRAM_PUBLISH = 'true'; env.IG_ACTIVATION_APPROVED = 'true'; }
  return {db, env};
}
const mediaKeys = ['11111111-1111-1111-1111-111111111111.png', '22222222-2222-2222-2222-222222222222.png'];

test('POST /publish dry-runs by default, even with a connected account and valid media', async () => {
  const {db, env} = await connectedEnv();
  const res = await worker.fetch(new Request(base + '/publish', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({jobKey: 'job-pub', kind: 'carousel', mediaKeys, caption: 'Hello'})}), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'dry-run');
  assert.equal(body.instagramMediaId, null);
  assert.equal(db.jobs[0].status, 'dry-run');
  assert.equal(db.jobs[0].published_at, null);
});

test('POST /publish only makes a real Meta call when both ENABLE_INSTAGRAM_PUBLISH and IG_ACTIVATION_APPROVED are true', async (t) => {
  const {db, env} = await connectedEnv({live: true});
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (url) => { called++; const u = new URL(url); if (u.pathname.endsWith('/media_publish')) return Response.json({id: 'ig-media-1'}); return Response.json({id: 'container-' + called, status_code: 'FINISHED'}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const res = await worker.fetch(new Request(base + '/publish', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({jobKey: 'job-pub', kind: 'carousel', mediaKeys, caption: 'Hello'})}), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'published');
  assert.equal(body.instagramMediaId, 'ig-media-1');
  assert.equal(db.jobs[0].status, 'published');
  assert.ok(db.jobs[0].published_at);
  assert.ok(called > 0);
});

test('POST /publish fails safely when no Instagram account is connected', async () => {
  const db = createFakeD1({jobs: [{job_key: 'job-nolink', content_kind: 'carousel', status: 'generated', created_at: 'x'}], connections: []});
  const env = {EXECUTOR_KEY, CONTENT_DB: db, INSTAGRAM_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY};
  const res = await worker.fetch(new Request(base + '/publish', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({jobKey: 'job-nolink', kind: 'carousel', mediaKeys, caption: 'Hello'})}), env);
  assert.equal(res.status, 409);
  assert.equal(db.jobs[0].status, 'failed');
});

test('POST /publish refuses to re-finalize an already dry-run or published job', async () => {
  const {db, env} = await connectedEnv();
  db.jobs[0].status = 'dry-run';
  const res = await worker.fetch(new Request(base + '/publish', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({jobKey: 'job-pub', kind: 'carousel', mediaKeys, caption: 'Hello'})}), env);
  assert.equal(res.status, 409);
});

test('POST /publish rejects media keys that were not returned by POST /media', async () => {
  const {env} = await connectedEnv();
  const res = await worker.fetch(new Request(base + '/publish', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({jobKey: 'job-pub', kind: 'carousel', mediaKeys: ['../../etc/passwd'], caption: 'Hello'})}), env);
  assert.equal(res.status, 400);
});

test('POST /jobs/:key/fail records the executor-reported error', async () => {
  const db = createFakeD1({jobs: [{job_key: 'job-fail', content_kind: 'reel', status: 'claimed', created_at: 'x'}]});
  const env = {EXECUTOR_KEY, CONTENT_DB: db};
  const res = await worker.fetch(new Request(base + '/jobs/job-fail/fail', {method: 'POST', headers: {...auth, 'content-type': 'application/json'}, body: JSON.stringify({error: 'ffmpeg exited 1'})}), env);
  assert.equal(res.status, 200);
  assert.equal(db.jobs[0].status, 'failed');
  assert.equal(db.jobs[0].error, 'ffmpeg exited 1');
});
