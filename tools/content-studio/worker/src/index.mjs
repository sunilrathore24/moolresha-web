import {json,isAuthorized,validateOrigin,validateManifest,parseDraft,encryptToken,decryptToken,safeEqual} from './security.mjs';
import {authorizationUrl,exchangeCode,identity,createMediaContainer,containerStatus,metaPost} from './meta.mjs';
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const noStore={'cache-control':'no-store'};
async function event(env,draftId,name,details={}){await env.STUDIO_DB.prepare('INSERT INTO studio_events(id,draft_id,event,details,created_at) VALUES(?,?,?,?,?)').bind(id(),draftId,name,JSON.stringify(details),now()).run();}
async function account(env){const row=await env.STUDIO_DB.prepare('SELECT * FROM studio_accounts ORDER BY updated_at DESC LIMIT 1').first();if(!row)throw Error('Instagram not connected');return {id:row.id,token:await decryptToken(row.token_ciphertext,row.token_iv,env.STUDIO_ENCRYPTION_SECRET)};}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));}
async function publish(env,draft){
 if(env.ENABLE_INSTAGRAM_PUBLISH!=='true')throw Error('Publishing disabled');
 const manifest=JSON.parse(draft.media_manifest||'null');validateManifest(draft.kind,manifest);
 const acct=await account(env),payload=JSON.parse(draft.payload);
 // At most one publishing attempt per draft. A failed or interrupted attempt must be reconciled manually.
 const claim=await env.STUDIO_DB.prepare("UPDATE studio_drafts SET status='publishing',updated_at=? WHERE id=? AND status='scheduled'").bind(now(),draft.id).run();
 if(claim.meta.changes!==1)return {skipped:true};
 await event(env,draft.id,'publish_attempt_started');
 try{
  const container=await createMediaContainer(env,acct.id,manifest,draft.kind,payload.caption,acct.token);
  await event(env,draft.id,'container_created',{containerId:container.id});
  // Poll with bounded runtime. If unfinished, leave publishing for explicit reconciliation, never create duplicate posts.
  let ready=false;
  for(let i=0;i<10;i++){const status=await containerStatus(env,container.id,acct.token);if(status.status_code==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(status.status_code))throw Error('Media processing failed: '+status.status_code);await new Promise(r=>setTimeout(r,3000));}
  if(!ready){await event(env,draft.id,'processing_pending',{containerId:container.id});return {pending:true,containerId:container.id};}
  const result=await metaPost(env,acct.id+'/media_publish',{creation_id:container.id},acct.token);
  await env.STUDIO_DB.prepare("UPDATE studio_drafts SET status='published',instagram_media_id=?,published_at=?,updated_at=? WHERE id=? AND status='publishing'").bind(result.id,now(),now(),draft.id).run();
  await event(env,draft.id,'published',{mediaId:result.id});return result;
 }catch(error){await env.STUDIO_DB.prepare("UPDATE studio_drafts SET status='failed',last_error=?,updated_at=? WHERE id=? AND status='publishing'").bind(String(error.message).slice(0,300),now(),draft.id).run();await event(env,draft.id,'publish_failed',{reason:String(error.message).slice(0,180)});throw error;}
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(path==='/setup'&&method==='GET')return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoolResha Instagram Connection</title><style>body{font:16px system-ui;max-width:540px;margin:5rem auto;padding:1rem;background:#faf6ef;color:#3b3d2c}input,button{font:inherit;padding:12px;margin:8px 0;width:100%;box-sizing:border-box}button{background:#3b3d2c;color:#fff;border:0}p{line-height:1.5}</style><h1>Connect MoolResha Instagram</h1><p>Enter the private Content Studio admin secret. It is used only for this request and is not saved in the browser.</p><form id="form"><input type="password" id="secret" autocomplete="off" placeholder="Content Studio admin secret" required><button>Authorize Instagram Business</button></form><p id="message" role="status"></p><script>document.getElementById('form').onsubmit=async e=>{e.preventDefault();const secret=document.getElementById('secret').value;document.getElementById('secret').value='';try{const r=await fetch('/auth/start',{headers:{authorization:'Bearer '+secret}});const d=await r.json();if(!r.ok)throw Error(d.error||'Authorization failed');location.assign(d.authorizationUrl)}catch(err){document.getElementById('message').textContent=err.message}}</script></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 if(path==='/health'&&method==='GET')return json({ok:true,service:'moolresha-content-studio'});
 if(path==='/auth/callback'&&method==='GET'){
  const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('studio_oauth='))?.slice(13);
  const state=url.searchParams.get('state')||'';
  if(!cookie||!safeEqual(cookie,state))return json({error:'Invalid OAuth state'},403);
  const parts=state.split('.');if(parts.length!==2)return json({error:'Invalid OAuth state'},403);
  const [nonce,signature]=parts;
  const expected=await sign(nonce,env.STUDIO_ADMIN_SECRET);if(!safeEqual(expected,signature))return json({error:'Invalid OAuth state'},403);
  const [timestamp]=nonce.split('_');if(!Number.isFinite(Number(timestamp))||Math.abs(Date.now()-Number(timestamp))>600000)return json({error:'Expired OAuth state'},403);
  const code=url.searchParams.get('code');if(!code)return json({error:'OAuth authorization declined'},400);
  const token=await exchangeCode(env,code),profile=await identity(token.token);
  const userId=String(profile.user_id||profile.id||'');if(!userId)throw Error('Instagram identity missing');
  const encrypted=await encryptToken(token.token,env.STUDIO_ENCRYPTION_SECRET);
  const expires=token.expiresIn?new Date(Date.now()+token.expiresIn*1000).toISOString():null;
  await env.STUDIO_DB.prepare('INSERT INTO studio_accounts(id,username,token_ciphertext,token_iv,expires_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(userId,String(profile.username||''),encrypted.ciphertext,encrypted.iv,expires,now()).run();
  return new Response('Instagram connected. You may close this tab.',{headers:{'content-type':'text/plain; charset=utf-8','set-cookie':'studio_oauth=; Path=/auth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax',...noStore}});
 }
 if(method==='GET'&&/^\\/media\\/[a-f0-9-]{36}\\.(jpg|jpeg|png|mp4)$/.test(path)){const key=path.slice(7);const object=await env.STUDIO_MEDIA.get(key);if(!object)return json({error:'Not found'},404);return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});}
 if(!isAuthorized(req,env))return json({error:'Unauthorized'},401);
 if(!validateOrigin(req,env))return json({error:'Invalid origin'},403);
 if(method==='GET'&&path==='/auth/start'){
  if(!env.INSTAGRAM_APP_ID||!env.INSTAGRAM_APP_SECRET||!env.STUDIO_ENCRYPTION_SECRET||!env.STUDIO_ORIGIN)throw Error('OAuth configuration missing');
  const nonce=Date.now()+'_'+id();const state=nonce+'.'+await sign(nonce,env.STUDIO_ADMIN_SECRET);
  return new Response(JSON.stringify({authorizationUrl:authorizationUrl(env,state)}),{status:200,headers:{'content-type':'application/json; charset=utf-8','set-cookie':'studio_oauth='+state+'; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax',...noStore}});
 }
 if(method==='POST'&&path==='/media'){const contentType=req.headers.get('content-type')||'';const ext=contentType==='image/jpeg'?'jpg':contentType==='image/png'?'png':contentType==='video/mp4'?'mp4':null;if(!ext)return json({error:'Unsupported media type'},415);const len=Number(req.headers.get('content-length')||0);if(len>30*1024*1024)return json({error:'File too large'},413);const bytes=await req.arrayBuffer();if(bytes.byteLength>30*1024*1024||bytes.byteLength===0)return json({error:'Invalid media size'},413);const key=id()+'.'+ext;await env.STUDIO_MEDIA.put(key,bytes,{httpMetadata:{contentType}});return json({url:env.STUDIO_ORIGIN+'/media/'+key},201);}
 if(method==='GET'&&path==='/account'){const row=await env.STUDIO_DB.prepare('SELECT id,username,expires_at,updated_at FROM studio_accounts LIMIT 1').first();return json({connected:!!row,account:row||null});}
 if(method==='GET'&&path==='/drafts'){const rows=await env.STUDIO_DB.prepare('SELECT id,kind,title,status,scheduled_at,created_at,updated_at,published_at,instagram_media_id,last_error FROM studio_drafts ORDER BY created_at DESC LIMIT 100').all();return json({drafts:rows.results});}
 if(method==='POST'&&path==='/drafts'){
  const data=await req.json(),draft=parseDraft(data),draftId=id(),time=now();
  await env.STUDIO_DB.prepare('INSERT INTO studio_drafts(id,kind,title,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(draftId,draft.kind,draft.title,JSON.stringify(draft),'draft',time,time).run();
  await event(env,draftId,'created');return json({id:draftId,status:'draft'},201);
 }
 const match=path.match(/^\/drafts\/([0-9a-f-]{36})(?:\/(approve|schedule|manifest|events))?$/);
 if(match){
  const draft=await env.STUDIO_DB.prepare('SELECT * FROM studio_drafts WHERE id=?').bind(match[1]).first();if(!draft)return json({error:'Not found'},404);
  if(method==='GET'&&!match[2])return json({...draft,payload:JSON.parse(draft.payload),media_manifest:draft.media_manifest?JSON.parse(draft.media_manifest):null});
  if(method==='GET'&&match[2]==='events'){const rows=await env.STUDIO_DB.prepare('SELECT event,details,created_at FROM studio_events WHERE draft_id=? ORDER BY created_at DESC LIMIT 50').bind(draft.id).all();return json({events:rows.results});}
  if(method==='PUT'&&!match[2]){if(draft.status!=='draft')return json({error:'Draft locked'},409);const payload=parseDraft(await req.json());await env.STUDIO_DB.prepare('UPDATE studio_drafts SET title=?,kind=?,payload=?,updated_at=? WHERE id=?').bind(payload.title,payload.kind,JSON.stringify(payload),now(),draft.id).run();return json({ok:true});}
  if(method==='PUT'&&match[2]==='manifest'){if(!['draft','approved'].includes(draft.status))return json({error:'Manifest locked'},409);const manifest=await req.json();validateManifest(draft.kind,manifest);await env.STUDIO_DB.prepare('UPDATE studio_drafts SET media_manifest=?,updated_at=? WHERE id=?').bind(JSON.stringify(manifest),now(),draft.id).run();return json({ok:true});}
  if(method==='POST'&&match[2]==='approve'){if(draft.status!=='draft'||!draft.media_manifest)return json({error:'Media required or draft locked'},409);validateManifest(draft.kind,JSON.parse(draft.media_manifest));await env.STUDIO_DB.prepare("UPDATE studio_drafts SET status='approved',updated_at=? WHERE id=? AND status='draft'").bind(now(),draft.id).run();await event(env,draft.id,'approved');return json({status:'approved'});}
  if(method==='POST'&&match[2]==='schedule'){if(draft.status!=='approved')return json({error:'Approval required'},409);const data=await req.json();if(!validDate(data.scheduledAt)||Date.parse(data.scheduledAt)<=Date.now())return json({error:'Future UTC ISO timestamp required'},400);await env.STUDIO_DB.prepare("UPDATE studio_drafts SET status='scheduled',scheduled_at=?,updated_at=? WHERE id=? AND status='approved'").bind(data.scheduledAt,now(),draft.id).run();await event(env,draft.id,'scheduled',{at:data.scheduledAt});return json({status:'scheduled'});}
 }
 return json({error:'Not found'},404);
}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
export default {
 async fetch(req,env){try{return await handle(req,env)}catch(error){console.error('studio request failed',String(error.message).slice(0,180));return json({error:'Request failed'},500);}},
 async scheduled(controller,env,ctx){if(env.ENABLE_INSTAGRAM_PUBLISH!=='true')return;ctx.waitUntil((async()=>{const due=await env.STUDIO_DB.prepare("SELECT * FROM studio_drafts WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 3").bind(now()).all();for(const draft of due.results){try{await publish(env,draft)}catch(e){console.error('publish attempt failed',draft.id,String(e.message).slice(0,100));}}})());}
};
