import {sha256, encryptToken, decryptToken, discoverInstagramAccount} from './instagram-auth.mjs';
import {generateDraft} from './generate.mjs';
import {putMedia, getMedia, isValidMediaKey} from './media.mjs';
import {publishCarousel, publishReel} from '../../automation/instagram.mjs';
const IST_OFFSET_MS = 330 * 60 * 1000;
const SLOTS = new Map([[2, 'carousel-morning'], [7, 'reel-midday'], [13, 'carousel-evening']]);
const ORIGIN = 'https://moolresha-content-studio.sunilrathore24.workers.dev';
const CALLBACK = ORIGIN + '/auth/callback';
const HEADERS = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"};
function slotFor(now) {
  const hour = now.getUTCHours();
  if (now.getUTCMinutes() !== 30 || !SLOTS.has(hour)) return null;
  const day = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0,10);
  return {key:day+':'+SLOTS.get(hour),kind:hour===7?'reel':'carousel',day};
}
const json = (value,status=200) => Response.json(value,{status,headers:HEADERS});
const html = (body,status=200) => new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>MoolResha Instagram connection</title></head><body>'+body+'</body></html>',{status,headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8'}});
const error = (message,status=400) => json({error:message},status);
function secureCompare(a,b) {
  if (!a || !b) return false;
  let mismatch=a.length ^ b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) mismatch |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return mismatch===0;
}
// Separate from INSTAGRAM_SETUP_KEY: the setup key authenticates the human owner
// starting OAuth once; EXECUTOR_KEY authenticates the unattended GitHub Actions
// job that generates, renders and publishes daily content. Neither can impersonate
// the other, and neither ever carries the Meta token itself.
const authorizedExecutor = (request,env) => !!env.EXECUTOR_KEY && secureCompare(request.headers.get('Authorization')||'', 'Bearer '+env.EXECUTOR_KEY);
const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
async function startAuth(request,env) {
  if(!env.CONTENT_DB || !env.META_APP_ID || !env.INSTAGRAM_SETUP_KEY || !env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || !env.META_APP_SECRET) return error('OAuth service not configured',503);
  if(!secureCompare(request.headers.get('Authorization')||'', 'Bearer '+env.INSTAGRAM_SETUP_KEY)) return error('Unauthorized',401);
  const state=randomState(), now=new Date(), expiry=new Date(now.getTime()+10*60*1000);
  await env.CONTENT_DB.prepare('INSERT INTO oauth_sessions (state_hash,created_at,expires_at) VALUES (?,?,?)').bind(await sha256(state),now.toISOString(),expiry.toISOString()).run();
  const params=new URLSearchParams({client_id:env.META_APP_ID,display:'page',extras:JSON.stringify({setup:{channel:'IG_API_ONBOARDING'}}),redirect_uri:CALLBACK,response_type:'token',scope:'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',state});
  return json({loginUrl:'https://www.facebook.com/v27.0/dialog/oauth?'+params.toString(),expiresAt:expiry.toISOString(),note:'Open loginUrl in a browser within 10 minutes. Do not share this URL.'});
}
async function verifyMetaToken(token,env) {
  const url='https://graph.facebook.com/v27.0/debug_token';
  const body=new URLSearchParams({input_token:token,access_token:env.META_APP_ID+'|'+env.META_APP_SECRET});
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'error'});
  if(!res.ok) throw Error('Meta token verification unavailable');
  const data=(await res.json()).data;
  if(!data?.is_valid || String(data.app_id)!==String(env.META_APP_ID)) throw Error('Meta token is invalid or belongs to another app');
  const scopes=data.scopes||[];
  if(!['instagram_basic','instagram_content_publish','pages_show_list'].every(s=>scopes.includes(s))) throw Error('Missing required Meta permissions');
  return data.expires_at ? new Date(data.expires_at*1000).toISOString() : null;
}
async function completeAuth(request,env) {
  if(!env.CONTENT_DB || !env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || !env.META_APP_SECRET || !env.META_APP_ID) return error('OAuth service not configured',503);
  if((Number(request.headers.get('content-length'))||0)>16384) return error('Request too large',413);
  let input;
  try {input=await request.json();} catch {return error('Invalid request');}
  const {state,token}=input||{};
  if(typeof state!=='string'|| !/^[0-9a-f]{64}$/.test(state)||typeof token!=='string'||token.length<20||token.length>8192) return error('Invalid authorization data');
  const hash=await sha256(state);
  const session=await env.CONTENT_DB.prepare('SELECT expires_at,consumed_at FROM oauth_sessions WHERE state_hash=?').bind(hash).first();
  if(!session || session.consumed_at || session.expires_at<=new Date().toISOString()) return error('Authorization expired or already used',403);
  // Consume state before any external network calls. Prevent replay, even after failure.
  const consumed=await env.CONTENT_DB.prepare('UPDATE oauth_sessions SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?').bind(new Date().toISOString(),hash,new Date().toISOString()).run();
  if(consumed.meta?.changes!==1) return error('Authorization already used',403);
  try {
    const expiresAt=await verifyMetaToken(token,env);
    const accounts=await discoverInstagramAccount(token);
    const expected=env.IG_EXPECTED_ACCOUNT_ID;
    const matches=expected?accounts.filter(a=>a.instagramAccountId===expected):accounts;
    if(matches.length!==1) return error('Could not uniquely verify the intended Instagram account; no token stored',409);
    const account=matches[0], cipher=await encryptToken(token,env.INSTAGRAM_TOKEN_ENCRYPTION_KEY),now=new Date().toISOString();
    await env.CONTENT_DB.prepare('INSERT INTO instagram_connections (instagram_account_id,facebook_page_id,facebook_page_name,encrypted_user_token,token_iv,token_expires_at,connected_at,updated_at,status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(instagram_account_id) DO UPDATE SET facebook_page_id=excluded.facebook_page_id,facebook_page_name=excluded.facebook_page_name,encrypted_user_token=excluded.encrypted_user_token,token_iv=excluded.token_iv,token_expires_at=excluded.token_expires_at,updated_at=excluded.updated_at,status=excluded.status').bind(account.instagramAccountId,account.pageId,account.pageName,cipher.encrypted,cipher.iv,expiresAt,now,now,'connected').run();
    return json({connected:true,pageName:account.pageName,instagramAccountId:account.instagramAccountId,publishingEnabled:false});
  } catch {return error('Instagram authorization could not be verified. Start a new connection attempt.',422);}
}
// --- Executor routes: unattended GitHub Actions job (generate -> render -> upload -> publish). ---
// All require EXECUTOR_KEY. None of them accept or return the Meta token; publishing happens
// entirely server-side using the token already stored encrypted in D1 from the OAuth flow above.
async function claimNextJob(env) {
  const candidates=await env.CONTENT_DB.prepare("SELECT job_key,content_kind FROM content_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 5").all();
  for(const row of candidates.results||[]) {
    const claim=await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='claimed',updated_at=? WHERE job_key=? AND status='pending'").bind(new Date().toISOString(),row.job_key).run();
    if(claim.meta?.changes===1) return row;
  }
  return null;
}
async function jobsPending(request,env) {
  if(!authorizedExecutor(request,env)) return error('Unauthorized',401);
  if(!env.CONTENT_DB) return error('Content Studio not configured',503);
  const job=await claimNextJob(env);
  if(!job) return new Response(null,{status:204,headers:HEADERS});
  return json({jobKey:job.job_key,contentKind:job.content_kind});
}
async function generateRoute(request,env) {
  if(!authorizedExecutor(request,env)) return error('Unauthorized',401);
  let input; try {input=await request.json();} catch {return error('Invalid request');}
  const kind=input?.kind==='reel'?'reel':'carousel';
  try {
    const draft=await generateDraft(env,{kind});
    if(typeof input?.jobKey==='string' && env.CONTENT_DB) {
      await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='generated',draft_payload=?,caption=?,updated_at=? WHERE job_key=? AND status IN ('claimed','generated')").bind(JSON.stringify(draft),draft.caption,new Date().toISOString(),input.jobKey).run();
    }
    return json({draft});
  } catch(e) {
    if(typeof input?.jobKey==='string' && env.CONTENT_DB) await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='failed',error=?,updated_at=? WHERE job_key=?").bind(String(e.message).slice(0,300),new Date().toISOString(),input.jobKey).run();
    return error('Generation failed: '+String(e.message).slice(0,200),502);
  }
}
async function uploadMedia(request,env) {
  if(!authorizedExecutor(request,env)) return error('Unauthorized',401);
  if(!env.CONTENT_MEDIA) return error('Media storage not configured',503);
  const contentType=request.headers.get('content-type')||'';
  const len=Number(request.headers.get('content-length')||0);
  if(len<=0||len>24*1024*1024) return error('Invalid media size',413); // KV's hard per-value limit is 25 MiB.
  const bytes=await request.arrayBuffer();
  try {
    const key=await putMedia(env.CONTENT_MEDIA,bytes,contentType);
    return json({key,url:ORIGIN+'/media/'+key},201);
  } catch(e) {return error(String(e.message),400);}
}
async function serveMedia(request,env) {
  if(!env.CONTENT_MEDIA) return error('Media storage not configured',503);
  const key=new URL(request.url).pathname.slice('/media/'.length);
  const object=await getMedia(env.CONTENT_MEDIA,key);
  if(!object) return error('Not found',404);
  return new Response(object.body,{headers:{...HEADERS,'Content-Type':object.contentType,'Cache-Control':'public, max-age=3600'}});
}
async function publishRoute(request,env) {
  if(!authorizedExecutor(request,env)) return error('Unauthorized',401);
  if(!env.CONTENT_DB||!env.INSTAGRAM_TOKEN_ENCRYPTION_KEY) return error('Content Studio not configured',503);
  let input; try {input=await request.json();} catch {return error('Invalid request');}
  const {jobKey,kind,mediaKeys,caption}=input||{};
  if(typeof jobKey!=='string'||!jobKey) return error('jobKey required');
  if(kind!=='carousel'&&kind!=='reel') return error('kind must be carousel or reel');
  if(!Array.isArray(mediaKeys)||!mediaKeys.length||mediaKeys.some(k=>!isValidMediaKey(k))) return error('mediaKeys must reference media uploaded via POST /media');
  if(typeof caption!=='string'||!caption.trim()) return error('caption required');
  const job=await env.CONTENT_DB.prepare('SELECT status FROM content_jobs WHERE job_key=?').bind(jobKey).first();
  if(!job) return error('Unknown job',404);
  if(job.status==='published'||job.status==='dry-run') return error('Job already finalized: '+job.status,409);
  const connection=await env.CONTENT_DB.prepare("SELECT instagram_account_id,encrypted_user_token,token_iv FROM instagram_connections WHERE status='connected' ORDER BY updated_at DESC LIMIT 1").first();
  if(!connection) {
    await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='failed',error='Instagram not connected',updated_at=? WHERE job_key=?").bind(new Date().toISOString(),jobKey).run();
    return error('Instagram not connected',409);
  }
  // The only place either publishing flag is read. Both must be 'true', set only by the
  // owner after a verified dry run, or every publish attempt stays a no-op dry run.
  const liveEnabled=env.ENABLE_INSTAGRAM_PUBLISH==='true'&&env.IG_ACTIVATION_APPROVED==='true';
  const urls=mediaKeys.map(key=>ORIGIN+'/media/'+key);
  try {
    const token=await decryptToken(connection.encrypted_user_token,connection.token_iv,env.INSTAGRAM_TOKEN_ENCRYPTION_KEY);
    const params={igUserId:connection.instagram_account_id,token,caption,dryRun:!liveEnabled};
    const result=kind==='reel'?await publishReel({...params,videoUrl:urls[0]}):await publishCarousel({...params,images:urls});
    const now=new Date().toISOString();
    await env.CONTENT_DB.prepare("UPDATE content_jobs SET status=?,media_keys=?,caption=?,instagram_media_id=?,published_at=?,updated_at=? WHERE job_key=?")
      .bind(liveEnabled?'published':'dry-run',JSON.stringify(mediaKeys),caption,result.id||null,liveEnabled?now:null,now,jobKey).run();
    return json({status:liveEnabled?'published':'dry-run',jobKey,kind,mediaCount:mediaKeys.length,instagramMediaId:result.id||null});
  } catch(e) {
    await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='failed',error=?,updated_at=? WHERE job_key=?").bind(String(e.message).slice(0,300),new Date().toISOString(),jobKey).run();
    return error('Publish failed: '+String(e.message).slice(0,200),502);
  }
}
async function failJob(request,env,jobKey) {
  if(!authorizedExecutor(request,env)) return error('Unauthorized',401);
  if(!env.CONTENT_DB) return error('Content Studio not configured',503);
  let input={}; try {input=await request.json();} catch {}
  await env.CONTENT_DB.prepare("UPDATE content_jobs SET status='failed',error=?,updated_at=? WHERE job_key=?").bind(String(input?.error||'executor failure').slice(0,300),new Date().toISOString(),jobKey).run();
  return json({ok:true});
}
const CALLBACK_HTML = `<h1>MoolResha Instagram connection</h1><p id="status">Checking Meta authorization…</p><script>
(function(){
  var status=document.getElementById('status');
  var fragment=new URLSearchParams(location.hash.slice(1));
  var state=fragment.get('state')||new URLSearchParams(location.search).get('state'), token=fragment.get('long_lived_token')||fragment.get('access_token');
  history.replaceState(null,'',location.pathname);
  if(!state||!token){status.textContent='Authorization was cancelled or no valid credentials were returned. No account was connected.';return;}
  fetch('/auth/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:state,token:token}),credentials:'omit'})
    .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
    .then(function(x){status.textContent=x.ok?'Instagram account '+x.body.instagramAccountId+' connected. Publishing remains disabled until tests pass.':(x.body.error||'Authorization failed');})
    .catch(function(){status.textContent='Connection failed. Please retry from the secure setup flow.';});
})();
</script>`;
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/health') return json({service:'moolresha-content-studio',status:'ok',instagramPublishing:env.ENABLE_INSTAGRAM_PUBLISH==='true'&&env.IG_ACTIVATION_APPROVED==='true'});
    if(request.method==='POST' && url.pathname==='/auth/start') return startAuth(request,env);
    if(request.method==='GET' && url.pathname==='/auth/callback') return html(CALLBACK_HTML);
    if(request.method==='POST' && url.pathname==='/auth/complete') return completeAuth(request,env);
    if(request.method==='GET' && url.pathname==='/jobs/pending') return jobsPending(request,env);
    if(request.method==='POST' && url.pathname==='/generate') return generateRoute(request,env);
    if(request.method==='POST' && url.pathname==='/media') return uploadMedia(request,env);
    if(request.method==='GET' && url.pathname.startsWith('/media/')) return serveMedia(request,env);
    if(request.method==='POST' && url.pathname==='/publish') return publishRoute(request,env);
    const failMatch=url.pathname.match(/^\/jobs\/([A-Za-z0-9:_-]+)\/fail$/);
    if(request.method==='POST' && failMatch) return failJob(request,env,failMatch[1]);
    return new Response('Not found',{status:404,headers:HEADERS});
  },
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      const slot=slotFor(new Date(event.scheduledTime));
      if(!slot) return;
      await env.CONTENT_DB.prepare("INSERT OR IGNORE INTO content_jobs (job_key,content_kind,status,created_at) VALUES (?,?,'pending',?)").bind(slot.key,slot.kind,new Date(event.scheduledTime).toISOString()).run();
    })());
  }
};
export {slotFor};
