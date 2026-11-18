import test from 'node:test';
import assert from 'node:assert/strict';
import {publishCarousel,publishReel} from '../instagram.mjs';

const carousel={igUserId:'17841400000000000',token:'fake-token',caption:'Learn about linen',images:['https://media.example.com/1.jpg','https://media.example.com/2.jpg']};
const reel={igUserId:'17841400000000000',token:'fake-token',caption:'Natural fibres explained',videoUrl:'https://media.example.com/reel.mp4'};
test('carousel and reel are dry-run by default',async()=>{
 const noNetwork=()=>{throw Error('Unexpected network request')};
 assert.deepEqual(await publishCarousel({...carousel,fetchImpl:noNetwork}),{dryRun:true,kind:'carousel',count:2});
 assert.deepEqual(await publishReel({...reel,fetchImpl:noNetwork}),{dryRun:true,kind:'reel'});
});
test('rejects non-HTTPS media',async()=>{
 await assert.rejects(()=>publishCarousel({...carousel,images:['http://example.com/1.jpg','https://example.com/2.jpg']}),/HTTPS/);
 await assert.rejects(()=>publishReel({...reel,videoUrl:'file:\/\/reel.mp4'}),/HTTPS/);
});
test('carousel publishes only after child and parent containers finish',async()=>{
 const calls=[];let next=0;
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url);calls.push({path:u.pathname,method:options.method||'GET'});
  if(options.method==='POST'){
   const body=new URLSearchParams(options.body);
   assert.equal(body.get('access_token'),'fake-token');
   if(u.pathname.endsWith('/media_publish'))return new Response(JSON.stringify({id:'published-carousel'}));
   return new Response(JSON.stringify({id:'container-'+(++next)}));
  }
  return new Response(JSON.stringify({status_code:'FINISHED'}));
 };
 const result=await publishCarousel({...carousel,fetchImpl,dryRun:false});
 assert.equal(result.id,'published-carousel');
 assert.equal(calls.filter(c=>c.method==='POST').length,4);
 assert.equal(calls.filter(c=>c.method==='GET').length,3);
 assert.match(calls.at(-1).path,/media_publish$/);
});
test('reel publishes only after video processing finishes',async()=>{
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,method:options.method||'GET'});
  if(options.method==='POST' && url.endsWith('/media_publish'))return new Response(JSON.stringify({id:'published-reel'}));
  if(options.method==='POST'){
   assert.equal(new URLSearchParams(options.body).get('media_type'),'REELS');
   return new Response(JSON.stringify({id:'video-container'}));
  }
  return new Response(JSON.stringify({status_code:'FINISHED'}));
 };
 const result=await publishReel({...reel,fetchImpl,dryRun:false});
 assert.equal(result.id,'published-reel');
 assert.equal(calls.length,3);
});
