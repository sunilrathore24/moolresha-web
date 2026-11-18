// Entry point for the free-tier GitHub Actions executor (see
// .github/workflows/content-studio-publish.yml). Runs on a runner that has ffmpeg
// and ImageMagick installed, because the Cloudflare Worker cannot run either.
// Holds no Meta/Instagram credentials: it only carries CONTENT_STUDIO_EXECUTOR_KEY,
// which the Worker uses to gate /jobs/pending, /generate, /media and /publish.
// The Worker decides dry-run vs. real publish from ENABLE_INSTAGRAM_PUBLISH and
// IG_ACTIVATION_APPROVED; this script cannot force a live post either way.
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditDraft} from './quality.mjs';
import {renderCarouselImages, renderReel, renderPhotoCarouselImages, renderPhotoReel} from './render.mjs';

export async function runScheduledJob({
  baseUrl = process.env.CONTENT_STUDIO_BASE_URL,
  executorKey = process.env.CONTENT_STUDIO_EXECUTOR_KEY,
  fetchImpl = fetch,
  renderCarousel = renderCarouselImages,
  renderVideo = renderReel,
  renderPhotoCarousel = renderPhotoCarouselImages,
  renderPhotoVideo = renderPhotoReel,
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  tempDir,
  log = console.log,
} = {}) {
  if (!baseUrl || !executorKey) throw Error('CONTENT_STUDIO_BASE_URL and CONTENT_STUDIO_EXECUTOR_KEY are required');
  const authHeaders = {Authorization: 'Bearer ' + executorKey};

  const pendingRes = await fetchImpl(baseUrl + '/jobs/pending', {headers: authHeaders});
  if (pendingRes.status === 204) { log('No pending job.'); return {skipped: true}; }
  if (!pendingRes.ok) throw Error('GET /jobs/pending failed: HTTP ' + pendingRes.status);
  const job = await pendingRes.json();
  log('Claimed job ' + job.jobKey + ' (' + job.contentKind + ')');

  try {
    const genRes = await fetchImpl(baseUrl + '/generate', {
      method: 'POST', headers: {...authHeaders, 'content-type': 'application/json'},
      body: JSON.stringify({kind: job.contentKind, jobKey: job.jobKey}),
    });
    if (!genRes.ok) throw Error('POST /generate failed: HTTP ' + genRes.status + ' ' + (await genRes.text()).slice(0, 200));
    const {draft} = await genRes.json();
    const check = auditDraft(draft);
    if (!check.passed) throw Error('Draft failed quality audit: ' + check.issues.join('; '));

    const dir = tempDir || await mkdtemp(join(tmpdir(), 'content-studio-'));
    let files;
    if (draft.backgroundImageKey) {
      try {
        const imageRes = await fetchImpl(baseUrl + '/media/' + draft.backgroundImageKey);
        if (!imageRes.ok) throw Error('background image fetch failed: HTTP ' + imageRes.status);
        const backgroundPath = join(dir, 'background.jpg');
        await writeFileImpl(backgroundPath, Buffer.from(await imageRes.arrayBuffer()));
        files = job.contentKind === 'reel' ? [await renderPhotoVideo(draft, backgroundPath, dir)] : await renderPhotoCarousel(draft, backgroundPath, dir);
        log('Rendered with the generated background image ' + draft.backgroundImageKey);
      } catch (error) {
        log('Background image unavailable (' + error.message + '); falling back to the flat template card look.');
        files = job.contentKind === 'reel' ? [await renderVideo(draft, dir)] : await renderCarousel(draft, dir);
      }
    } else {
      files = job.contentKind === 'reel' ? [await renderVideo(draft, dir)] : await renderCarousel(draft, dir);
    }

    const mediaKeys = [];
    for (const filePath of files) {
      const bytes = await readFileImpl(filePath);
      const contentType = filePath.endsWith('.mp4') ? 'video/mp4' : 'image/png';
      const uploadRes = await fetchImpl(baseUrl + '/media', {
        method: 'POST', headers: {...authHeaders, 'content-type': contentType, 'content-length': String(bytes.byteLength)}, body: bytes,
      });
      if (!uploadRes.ok) throw Error('POST /media failed: HTTP ' + uploadRes.status);
      mediaKeys.push((await uploadRes.json()).key);
    }

    const publishRes = await fetchImpl(baseUrl + '/publish', {
      method: 'POST', headers: {...authHeaders, 'content-type': 'application/json'},
      body: JSON.stringify({jobKey: job.jobKey, kind: job.contentKind, mediaKeys, caption: draft.caption}),
    });
    if (!publishRes.ok) throw Error('POST /publish failed: HTTP ' + publishRes.status + ' ' + (await publishRes.text()).slice(0, 200));
    const result = await publishRes.json();
    log('Job ' + job.jobKey + ' -> ' + result.status);
    return result;
  } catch (error) {
    log('Job ' + job.jobKey + ' failed: ' + error.message);
    await fetchImpl(baseUrl + '/jobs/' + job.jobKey + '/fail', {
      method: 'POST', headers: {...authHeaders, 'content-type': 'application/json'}, body: JSON.stringify({error: error.message}),
    }).catch(() => {});
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScheduledJob().then(result => { console.log(JSON.stringify(result)); }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
