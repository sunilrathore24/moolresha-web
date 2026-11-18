// R2 helpers for rendered carousel/Reel media. The bucket is bound privately
// (no public R2 URL, no R2 "public access" feature); every read goes through
// this Worker's GET /media/:key route, keeping the whole thing inside the free tier.
const EXTENSION_FOR = {'image/png':'png','image/jpeg':'jpg','video/mp4':'mp4'};
export const MEDIA_KEY_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|mp4)$/;
const MAX_BYTES = 60*1024*1024;

export function isValidMediaKey(key) { return typeof key==='string' && MEDIA_KEY_PATTERN.test(key); }

export async function putMedia(bucket,bytes,contentType) {
 const ext=EXTENSION_FOR[contentType];
 if(!ext) throw Error('Unsupported media type: '+contentType);
 if(!bytes||bytes.byteLength===0||bytes.byteLength>MAX_BYTES) throw Error('Invalid media size');
 const key=crypto.randomUUID()+'.'+ext;
 await bucket.put(key,bytes,{httpMetadata:{contentType}});
 return key;
}

export async function getMedia(bucket,key) {
 if(!isValidMediaKey(key)) return null;
 return bucket.get(key);
}
