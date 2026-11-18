const IST_OFFSET_MS = 330 * 60 * 1000;
const SLOTS = new Map([[2, 'carousel-morning'], [7, 'reel-midday'], [13, 'carousel-evening']]);
function slotFor(now) {
  const utcHour = now.getUTCHours();
  if (now.getUTCMinutes() !== 30 || !SLOTS.has(utcHour)) return null;
  const istDay = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return { key: istDay + ':' + SLOTS.get(utcHour), kind: utcHour === 7 ? 'reel' : 'carousel', day: istDay };
}
const securityHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" };
function callbackResponse(message, status = 400) {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MoolResha Instagram connection</title></head><body><h1>MoolResha Content Studio</h1><p>' + message + '</p></body></html>', { status, headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ service: 'moolresha-content-studio', status: 'ok', instagramPublishing: false }, { headers: securityHeaders });
    }
    if (url.pathname === '/auth/callback' && request.method === 'GET') {
      // This endpoint is intentionally fail-closed until OAuth state verification,
      // token exchange and encrypted token storage are implemented. Never log or
      // reflect authorization codes, errors or state into the response.
      if (!url.searchParams.has('code') || !url.searchParams.has('state')) {
        return callbackResponse('Instagram authorization has not started. Please connect from the secure Content Studio authorization flow.');
      }
      return callbackResponse('Instagram authorization was received but has not been activated. No token has been exchanged or stored.', 503);
    }
    return new Response('Not found', { status: 404, headers: securityHeaders });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const slot = slotFor(new Date(event.scheduledTime));
      if (!slot) return;
      await env.CONTENT_DB.prepare(
        "INSERT OR IGNORE INTO content_jobs (job_key, content_kind, status, created_at) VALUES (?, ?, 'pending', ?)"
      ).bind(slot.key, slot.kind, new Date(event.scheduledTime).toISOString()).run();
    })());
  }
};
export { slotFor };
