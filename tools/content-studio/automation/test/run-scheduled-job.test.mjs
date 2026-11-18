import test from 'node:test';
import assert from 'node:assert/strict';
import {runScheduledJob} from '../run-scheduled-job.mjs';

const BASE = 'https://moolresha-content-studio.sunilrathore24.workers.dev';
const DRAFT = {title: 't', hook: 'h', slides: ['1', '2', '3', '4', '5', '6'], caption: 'A caption worth reading.', sources: []};

function routedFetch(routes) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options = {}) => {
      const path = new URL(url).pathname;
      calls.push({path, method: options.method || 'GET', body: options.body});
      const handler = routes[path];
      if (!handler) throw Error('Unexpected fetch to ' + path);
      return handler(options);
    },
  };
}

test('claims a pending job, generates, renders, uploads media and publishes it', async () => {
  const {fetchImpl, calls} = routedFetch({
    '/jobs/pending': () => Response.json({jobKey: 'job-1', contentKind: 'carousel'}, {status: 200}),
    '/generate': () => Response.json({draft: DRAFT}),
    '/media': () => Response.json({key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', url: BASE + '/media/aaaaaaaa.png'}, {status: 201}),
    '/publish': () => Response.json({status: 'dry-run', jobKey: 'job-1', kind: 'carousel', mediaCount: 2, instagramMediaId: null}),
  });
  const result = await runScheduledJob({
    baseUrl: BASE, executorKey: 'k', fetchImpl,
    renderCarousel: async () => ['/tmp/slide-1.png', '/tmp/slide-2.png'],
    renderVideo: async () => { throw Error('should not render video for a carousel job'); },
    readFileImpl: async () => new Uint8Array([9, 9]),
    log: () => {},
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(calls.filter(c => c.path === '/media').length, 2);
  assert.equal(calls.at(-1).path, '/publish');
  const published = JSON.parse(calls.at(-1).body);
  assert.deepEqual(published.mediaKeys, ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png']);
  assert.equal(published.caption, DRAFT.caption);
});

test('does nothing and makes no further calls when no job is pending', async () => {
  const {fetchImpl, calls} = routedFetch({'/jobs/pending': () => new Response(null, {status: 204})});
  const result = await runScheduledJob({baseUrl: BASE, executorKey: 'k', fetchImpl, log: () => {}});
  assert.deepEqual(result, {skipped: true});
  assert.equal(calls.length, 1);
});

test('reports a render failure to /jobs/:key/fail and rethrows, without ever calling /publish', async () => {
  const {fetchImpl, calls} = routedFetch({
    '/jobs/pending': () => Response.json({jobKey: 'job-2', contentKind: 'reel'}, {status: 200}),
    '/generate': () => Response.json({draft: DRAFT}),
    '/jobs/job-2/fail': () => Response.json({ok: true}),
  });
  await assert.rejects(
    () => runScheduledJob({baseUrl: BASE, executorKey: 'k', fetchImpl, renderVideo: async () => { throw Error('ffmpeg exited 1'); }, log: () => {}}),
    /ffmpeg exited 1/,
  );
  const failCall = calls.find(c => c.path === '/jobs/job-2/fail');
  assert.ok(failCall);
  assert.match(JSON.parse(failCall.body).error, /ffmpeg exited 1/);
  assert.ok(!calls.some(c => c.path === '/publish'));
});

test('fetches the generated background image and renders the photo variant when the draft has a backgroundImageKey', async () => {
  const draftWithImage = {...DRAFT, backgroundImageKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'};
  const writes = [];
  const {fetchImpl, calls} = routedFetch({
    '/jobs/pending': () => Response.json({jobKey: 'job-3', contentKind: 'carousel'}, {status: 200}),
    '/generate': () => Response.json({draft: draftWithImage}),
    '/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg': () => new Response(new Uint8Array([7, 7, 7]).buffer, {status: 200}),
    '/media': () => Response.json({key: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png', url: BASE + '/media/bbbbbbbb.png'}, {status: 201}),
    '/publish': () => Response.json({status: 'dry-run', jobKey: 'job-3', kind: 'carousel', mediaCount: 1, instagramMediaId: null}),
  });
  const result = await runScheduledJob({
    baseUrl: BASE, executorKey: 'k', fetchImpl,
    renderCarousel: async () => { throw Error('should use the photo renderer, not the flat one'); },
    renderPhotoCarousel: async (draft, backgroundPath) => { assert.match(backgroundPath, /background\.jpg$/); return ['/tmp/slide-1.png']; },
    readFileImpl: async () => new Uint8Array([1]),
    writeFileImpl: async (path, bytes) => { writes.push({path, bytes}); },
    log: () => {},
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].bytes, Buffer.from([7, 7, 7]));
  assert.ok(calls.some(c => c.path === '/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'));
});

test('falls back to the flat template render, without failing the job, when the background image fetch fails', async () => {
  const draftWithImage = {...DRAFT, backgroundImageKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'};
  const {fetchImpl, calls} = routedFetch({
    '/jobs/pending': () => Response.json({jobKey: 'job-4', contentKind: 'carousel'}, {status: 200}),
    '/generate': () => Response.json({draft: draftWithImage}),
    '/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg': () => new Response(null, {status: 404}),
    '/media': () => Response.json({key: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png', url: BASE + '/media/bbbbbbbb.png'}, {status: 201}),
    '/publish': () => Response.json({status: 'dry-run', jobKey: 'job-4', kind: 'carousel', mediaCount: 1, instagramMediaId: null}),
  });
  const result = await runScheduledJob({
    baseUrl: BASE, executorKey: 'k', fetchImpl,
    renderCarousel: async () => ['/tmp/fallback-slide-1.png'],
    renderPhotoCarousel: async () => { throw Error('should not use the photo renderer when the fetch failed'); },
    readFileImpl: async () => new Uint8Array([1]),
    log: () => {},
  });
  assert.equal(result.status, 'dry-run');
  assert.ok(!calls.some(c => c.path.includes('/jobs/job-4/fail')));
});

test('refuses to run without CONTENT_STUDIO_BASE_URL and CONTENT_STUDIO_EXECUTOR_KEY', async () => {
  await assert.rejects(() => runScheduledJob({baseUrl: '', executorKey: '', fetchImpl: async () => { throw Error('should not fetch'); }}), /CONTENT_STUDIO_BASE_URL/);
});
