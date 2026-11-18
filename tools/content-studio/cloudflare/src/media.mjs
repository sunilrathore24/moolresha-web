// Workers KV helpers for rendered carousel/Reel media. KV needs no payment
// method on file to create or use (unlike R2, which gates bucket creation
// behind a billing "subscription" screen even at $0 due) and already runs on
// the same free Workers plan as the rest of this Worker. Every read goes
// through this Worker's GET /media/:key route; the namespace itself is never
// exposed directly.
const EXTENSION_FOR = {'image/png':'png','image/jpeg':'jpg','video/mp4':'mp4'};
export const MEDIA_KEY_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|mp4)$/;
const MAX_BYTES = 24*1024*1024; // KV's hard per-value limit is 25 MiB; stay under it with margin.
const RETENTION_SECONDS = 30*24*60*60; // auto-expire so storage stays well inside the 1GB free tier without manual cleanup.

export function isValidMediaKey(key) { return typeof key==='string' && MEDIA_KEY_PATTERN.test(key); }

export async function putMedia(namespace,bytes,contentType) {
 const ext=EXTENSION_FOR[contentType];
 if(!ext) throw Error('Unsupported media type: '+contentType);
 if(!bytes||bytes.byteLength===0||bytes.byteLength>MAX_BYTES) throw Error('Invalid media size');
 const key=crypto.randomUUID()+'.'+ext;
 await namespace.put(key,bytes,{expirationTtl:RETENTION_SECONDS,metadata:{contentType}});
 return key;
}

export async function getMedia(namespace,key) {
 if(!isValidMediaKey(key)) return null;
 const {value,metadata}=await namespace.getWithMetadata(key,{type:'arrayBuffer'});
 if(!value) return null;
 return {body:value,contentType:metadata?.contentType||'application/octet-stream'};
}

// Workers AI image models return base64. Not a security boundary, just decoding.
export function base64ToBytes(base64) {
 return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
