const IST_OFFSET_MS = 330 * 60 * 1000;
const SLOTS = new Map([[2, 'carousel-morning'], [7, 'reel-midday'], [13, 'carousel-evening']]);
function slotFor(now) {
  const utcHour = now.getUTCHours();
  const expectedMinute = 30;
  if (now.getUTCMinutes() !== expectedMinute || !SLOTS.has(utcHour)) return null;
  const istDay = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return { key: istDay + ':' + SLOTS.get(utcHour), kind: utcHour === 7 ? 'reel' : 'carousel', day: istDay };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ service: 'moolresha-content-studio', status: 'ok', instagramPublishing: false });
    }
    return new Response('Not found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const slot = slotFor(new Date(event.scheduledTime));
      if (!slot) return;
      // Job insertion is idempotent. No publishing or external API calls.
      await env.CONTENT_DB.prepare(
        "INSERT OR IGNORE INTO content_jobs (job_key, content_kind, status, created_at) VALUES (?, ?, 'pending', ?)"
      ).bind(slot.key, slot.kind, new Date(event.scheduledTime).toISOString()).run();
    })());
  }
};
export { slotFor };
