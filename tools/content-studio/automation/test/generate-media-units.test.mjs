import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJson, buildImagePrompt, generateBackgroundImage} from '../../cloudflare/src/generate.mjs';
import {isValidMediaKey, putMedia, base64ToBytes} from '../../cloudflare/src/media.mjs';
import {createFakeKV, createFakeAI} from './fakes.mjs';

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

test('base64ToBytes round-trips arbitrary bytes', () => {
  const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const base64 = Buffer.from(original).toString('base64');
  assert.deepEqual(base64ToBytes(base64), original);
});

test('buildImagePrompt never asks for text, logos or people in the image, and excludes no-op punctuation', () => {
  const prompt = buildImagePrompt({title: 'How to evaluate a linen shirt?'});
  assert.match(prompt, /no text, no logo, no watermark, no people/i);
  assert.doesNotMatch(prompt, /shirt\?/);
});

test('generateBackgroundImage decodes the model response and retries once on failure', async () => {
  let calls = 0;
  const base64 = Buffer.from([1, 2, 3]).toString('base64');
  const env = {AI: createFakeAI(() => { calls++; if (calls === 1) throw Error('model unavailable'); return {image: base64}; })};
  const result = await generateBackgroundImage(env, {title: 'Linen'});
  assert.equal(calls, 2);
  assert.equal(result.contentType, 'image/jpeg');
  assert.deepEqual(result.bytes, new Uint8Array([1, 2, 3]));
});

test('generateBackgroundImage requires the AI binding', async () => {
  await assert.rejects(() => generateBackgroundImage({}, {title: 'Linen'}), /Workers AI binding missing/);
});

test('putMedia rejects unsupported types, empty and oversized payloads (KV caps values at 25 MiB)', async () => {
  const namespace = createFakeKV();
  await assert.rejects(() => putMedia(namespace, new Uint8Array([1]), 'image/svg+xml'), /Unsupported media type/);
  await assert.rejects(() => putMedia(namespace, new Uint8Array(0), 'image/png'), /Invalid media size/);
  await assert.rejects(() => putMedia(namespace, new Uint8Array(25 * 1024 * 1024), 'video/mp4'), /Invalid media size/);
  const key = await putMedia(namespace, new Uint8Array([1, 2, 3]), 'image/jpeg');
  assert.match(key, /^[a-f0-9-]{36}\.jpg$/);
});
