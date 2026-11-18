// Test doubles for the Cloudflare bindings (D1, R2, Workers AI) worker.mjs uses.
// Not a generic SQL engine: it dispatches on substrings of the specific SQL
// statements worker.mjs issues, which is enough for white-box testing those
// routes without pulling in a real SQLite dependency for a Node 22 test runner.
export function createFakeD1({jobs = [], connections = []} = {}) {
  const findJob = key => jobs.find(j => j.job_key === key);
  return {
    jobs, connections,
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async first() {
          if (sql.includes('FROM content_jobs WHERE job_key=?')) { const j = findJob(args[0]); return j ? {status: j.status} : null; }
          if (sql.includes('FROM instagram_connections')) return connections.find(c => c.status === 'connected') || null;
          if (sql.includes('FROM oauth_sessions')) return null;
          throw Error('fake D1: unhandled first() query: ' + sql);
        },
        async all() {
          if (sql.includes("FROM content_jobs WHERE status='pending'")) {
            return {results: jobs.filter(j => j.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)).map(j => ({job_key: j.job_key, content_kind: j.content_kind}))};
          }
          throw Error('fake D1: unhandled all() query: ' + sql);
        },
        async run() {
          if (sql.startsWith("UPDATE content_jobs SET status='claimed'")) {
            const [updatedAt, jobKey] = args; const j = findJob(jobKey);
            if (j && j.status === 'pending') { j.status = 'claimed'; j.updated_at = updatedAt; return {meta: {changes: 1}}; }
            return {meta: {changes: 0}};
          }
          if (sql.startsWith("UPDATE content_jobs SET status='generated'")) {
            const [draftPayload, caption, updatedAt, jobKey] = args; const j = findJob(jobKey);
            if (j && (j.status === 'claimed' || j.status === 'generated')) { j.status = 'generated'; j.draft_payload = draftPayload; j.caption = caption; j.updated_at = updatedAt; return {meta: {changes: 1}}; }
            return {meta: {changes: 0}};
          }
          if (sql.startsWith("UPDATE content_jobs SET status='failed',error='Instagram not connected'")) {
            const [updatedAt, jobKey] = args; const j = findJob(jobKey);
            if (j) { j.status = 'failed'; j.error = 'Instagram not connected'; j.updated_at = updatedAt; }
            return {meta: {changes: j ? 1 : 0}};
          }
          if (sql.startsWith("UPDATE content_jobs SET status='failed'")) {
            const [errorMessage, updatedAt, jobKey] = args; const j = findJob(jobKey);
            if (j) { j.status = 'failed'; j.error = errorMessage; j.updated_at = updatedAt; }
            return {meta: {changes: j ? 1 : 0}};
          }
          if (sql.startsWith('UPDATE content_jobs SET status=?,media_keys=?')) {
            const [status, mediaKeys, caption, instagramMediaId, publishedAt, updatedAt, jobKey] = args; const j = findJob(jobKey);
            if (j) Object.assign(j, {status, media_keys: mediaKeys, caption, instagram_media_id: instagramMediaId, published_at: publishedAt, updated_at: updatedAt});
            return {meta: {changes: j ? 1 : 0}};
          }
          throw Error('fake D1: unhandled run() query: ' + sql);
        },
      };
    },
  };
}

export function createFakeKV() {
  const store = new Map();
  return {
    store,
    async put(key, bytes, opts) { store.set(key, {bytes, metadata: opts?.metadata}); },
    async getWithMetadata(key) {
      const entry = store.get(key);
      return entry ? {value: entry.bytes, metadata: entry.metadata} : {value: null, metadata: null};
    },
  };
}

export function createFakeAI(response) {
  // `response` may be a fixed value, or a function of (model, options) so a
  // single fake can serve both the text model and the image model with
  // different behavior per model id.
  return {run: async (model, options) => (typeof response === 'function' ? response(model, options) : response)};
}
