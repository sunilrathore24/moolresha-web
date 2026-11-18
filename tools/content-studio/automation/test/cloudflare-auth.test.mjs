import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../cloudflare/src/worker.mjs';
import {encryptToken,decryptToken,discoverInstagramAccount,sha256} from '../../cloudflare/src/instagram-auth.mjs';

const base='https://moolresha-content-studio.sunilrathore24.workers.dev';
test('OAuth setup cannot start without provisioned secrets',async()=>{
 const response=await worker.fetch(new Request(base+'/auth/start',{method:'POST'}),{});
 assert.equal(response.status,503);
});
test('OAuth completion fails closed without configured secrets',async()=>{
 const response=await worker.fetch(new Request(base+'/auth/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'bad',token:'bad'})}),{});
 assert.equal(response.status,503);
});
test('OAuth callback does not echo authorization codes or tokens',async()=>{
 const response=await worker.fetch(new Request(base+'/auth/callback?code=secret&state=secret'),{});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const html=await response.text();
 assert.equal(html.includes('code=secret'),false);
 assert.equal(html.includes('state=secret'),false);
 assert.match(html,/history\.replaceState/);
});
test('publishing route remains unavailable',async()=>{
 assert.equal((await worker.fetch(new Request(base+'/publish',{method:'POST'}),{})).status,404);
});
test('AES-GCM token encryption round trip',async()=>{
 const key=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
 const token='sample-meta-token-1234567890';
 const first=await encryptToken(token,key),second=await encryptToken(token,key);
 assert.notEqual(first.encrypted,token);
 assert.notEqual(first.encrypted,second.encrypted);
 assert.equal(await decryptToken(first.encrypted,first.iv,key),token);
 await assert.rejects(()=>decryptToken(first.encrypted,first.iv,Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')));
});
test('account discovery uses bearer auth and excludes Pages without Instagram',async()=>{
 const accounts=await discoverInstagramAccount('secret-token',async(url,options)=>{
  assert.equal(new URL(url).searchParams.has('access_token'),false);
  assert.equal(options.headers.Authorization,'Bearer secret-token');
  return new Response(JSON.stringify({data:[{id:'123',name:'MoolResha',instagram_business_account:{id:'456'}},{id:'999',name:'Unlinked'}]}),{status:200});
 });
 assert.deepEqual(accounts,[{pageId:'123',pageName:'MoolResha',instagramAccountId:'456'}]);
});
test('sha256 stable',async()=>assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
