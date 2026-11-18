// Cloudflare Worker auth primitives. Tokens must never be logged or returned to browsers.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const GRAPH = 'https://graph.facebook.com/v27.0';
const base64 = bytes => btoa(String.fromCharCode(...bytes));
const unbase64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function encryptionKey(secret) {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret)) throw Error('INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte Worker secret');
  const raw = unbase64(secret);
  if (raw.byteLength !== 32) throw Error('Invalid token encryption key length');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptToken(token, secret) {
  if (typeof token !== 'string' || token.length < 20) throw Error('Invalid Meta token');
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(token));
  return {encrypted:base64(new Uint8Array(cipher)),iv:base64(iv)};
}
export async function decryptToken(encrypted, iv, secret) {
  const key = await encryptionKey(secret);
  return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},key,unbase64(encrypted)));
}
export async function discoverInstagramAccount(userToken, fetchImpl = fetch) {
  // Authorization header prevents tokens from being included in request URLs.
  const response = await fetchImpl(GRAPH + '/me/accounts?fields=id,name,instagram_business_account&limit=100', {
    headers:{Authorization:'Bearer ' + userToken,Accept:'application/json'},redirect:'error'
  });
  if (!response.ok) throw Error('Meta account discovery failed: HTTP ' + response.status);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw Error('Unexpected Meta account response');
  return body.data.filter(p => p.instagram_business_account?.id && p.id && p.name)
    .map(p => ({pageId:String(p.id),pageName:String(p.name),instagramAccountId:String(p.instagram_business_account.id)}));
}
