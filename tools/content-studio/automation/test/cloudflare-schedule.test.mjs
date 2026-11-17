import test from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../../cloudflare/src/worker.mjs';

test('creates morning carousel at 08:00 IST', () => {
  assert.deepEqual(slotFor(new Date('2026-11-17T02:30:00Z')), {
    key: '2026-11-17:carousel-morning', kind: 'carousel', day: '2026-11-17'
  });
});
test('creates midday reel at 13:00 IST', () => {
  assert.equal(slotFor(new Date('2026-11-17T07:30:00Z')).kind, 'reel');
});
test('creates evening carousel at 19:00 IST', () => {
  assert.equal(slotFor(new Date('2026-11-17T13:30:00Z')).kind, 'carousel');
});
test('ignores other minutes and hours', () => {
  assert.equal(slotFor(new Date('2026-11-17T07:31:00Z')), null);
  assert.equal(slotFor(new Date('2026-11-17T06:30:00Z')), null);
});
test('health endpoint is read-only and publishing disabled', async () => {
  const {default: worker} = await import('../../cloudflare/src/worker.mjs');
  const res = await worker.fetch(new Request('https://example.com/health'), {});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).instagramPublishing, false);
  assert.equal((await worker.fetch(new Request('https://example.com/publish', {method:'POST'}), {})).status, 404);
});
