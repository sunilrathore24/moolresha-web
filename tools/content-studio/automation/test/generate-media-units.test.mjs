import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJson} from '../../cloudflare/src/generate.mjs';
import {isValidMediaKey, putMedia} from '../../cloudflare/src/media.mjs';
import {createFakeR2} from './fakes.mjs';

test('extractJson pulls the object out of model chatter and markdown fences', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), {a: 1});
  assert.deepEqual(extractJson('Sure, here you go:\n{"a":1}\nHope that helps!'), {a: 1});
});
test('extractJson throws rather than silently returning nothing', () => {
  assert.throws(() => extractJson('no json here'), /no JSON object/);
});

test('isValidMediaKey accepts only exactly what POST /media produces', () => {
  assert.equal(isValidMediaKey('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'), true);
  assert.equal(isValidMediaKey('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp4'), true);
  assert.equal(isValidMediaKey('../../etc/passwd'), false);
  assert.equal(isValidMediaKey('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.PNG'), false);
  assert.equal(isValidMediaKey('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg'), false);
  assert.equal(isValidMediaKey(null), false);
});

test('putMedia rejects unsupported types, empty and oversized payloads', async () => {
  const bucket = createFakeR2();
  await assert.rejects(() => putMedia(bucket, new Uint8Array([1]), 'image/svg+xml'), /Unsupported media type/);
  await assert.rejects(() => putMedia(bucket, new Uint8Array(0), 'image/png'), /Invalid media size/);
  await assert.rejects(() => putMedia(bucket, new Uint8Array(61 * 1024 * 1024), 'video/mp4'), /Invalid media size/);
  const key = await putMedia(bucket, new Uint8Array([1, 2, 3]), 'image/jpeg');
  assert.match(key, /^[a-f0-9-]{36}\.jpg$/);
});
