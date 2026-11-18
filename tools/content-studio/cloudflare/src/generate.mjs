// Free-tier text and image generation for the daily carousel/Reel drafts,
// using the Workers AI binding (10,000 neurons/day free on the Workers Free
// plan) instead of a paid API. Runs inside the Worker so no AI credentials
// ever leave Cloudflare.
import {createDraft, topics} from '../../lib.mjs';
import {auditDraft} from '../../automation/quality.mjs';
import {base64ToBytes} from './media.mjs';

export const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const RULES = 'You are MoolResha\'s textile education editor. Brand line: "Closer to the Root". '
 +'Write useful, specific, evidence-aware content about cotton, linen, weave, GSM, yarn count, blends, care and quality. '
 +'No fabricated statistics, sources or certifications. No clickbait. '
 +'Reply with ONLY one JSON object, no prose and no markdown fences, with keys: '
 +'title, hook, takeaway, slides (exactly 6 short strings, each under 160 characters), caption, '
 +'sources (array, only using the verifiedSources you were given, otherwise empty), reelScript (one short spoken script). '
 +'Slide order: 1 hook, 2 problem, 3 insight, 4 evidence or caveat, 5 actionable advice, 6 close.';

export function extractJson(text) {
 const start=text.indexOf('{'), end=text.lastIndexOf('}');
 if(start===-1||end===-1||end<=start) throw Error('Model reply had no JSON object');
 return JSON.parse(text.slice(start,end+1));
}

export async function generateDraft(env,{kind='carousel',seed,attempts=2}={}) {
 if(!env.AI) throw Error('Workers AI binding missing');
 const brief=seed||topics[Math.floor(Math.random()*topics.length)];
 let lastError;
 for(let i=0;i<attempts;i++) {
  try {
   const result=await env.AI.run(MODEL,{
    messages:[
     {role:'system',content:RULES},
     {role:'user',content:JSON.stringify({kind,topic:brief.title,context:brief,verifiedSources:brief.sources})},
    ],
    max_tokens:900,
   });
   const raw=typeof result==='string'?result:result?.response;
   if(!raw) throw Error('Workers AI returned an empty response');
   const output=extractJson(raw);
   if(!Array.isArray(output.slides)||output.slides.length!==6||output.slides.some(x=>typeof x!=='string'||!x.trim()||x.length>180)) throw Error('Invalid slide content');
   if(typeof output.caption!=='string'||!output.caption.trim()) throw Error('Caption missing');
   const draft=createDraft({...output,sources:(output.sources||[]).filter(url=>brief.sources.includes(url))});
   draft.slides=output.slides;
   draft.kind=kind;
   draft.reelScript=typeof output.reelScript==='string'?output.reelScript:'';
   draft.aiGenerated=true;
   const check=auditDraft(draft);
   if(!check.passed) throw Error('Draft failed quality audit: '+check.issues.join('; '));
   return draft;
  } catch(error) { lastError=error; }
 }
 throw lastError||Error('Generation failed');
}

// flux-1-schnell: free, Cloudflare-hosted, zero data retention (confirmed in
// the Cloudflare dashboard's Models catalog, tagged "Cloudflare-hosted" —
// distinct from the paid "Third-party" models the same catalog also lists,
// e.g. OpenAI's gpt-image-2.6). Quality is a real step up from the flat
// template cards but is not that of a paid model; see cloudflare/README.md.
export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export function buildImagePrompt(draft) {
 const subject=String(draft.title||draft.hook||'natural fibre textile').replace(/[?.!]+$/,'').trim();
 return 'Editorial product photography of '+subject+'. Soft diffused daylight, warm neutral beige and olive tones, '
  +'natural fibre textile close-up, shallow depth of field, minimalist aesthetic. No text, no logo, no watermark, no people.';
}

export async function generateBackgroundImage(env,draft,{attempts=2}={}) {
 if(!env.AI) throw Error('Workers AI binding missing');
 const prompt=buildImagePrompt(draft);
 let lastError;
 for(let i=0;i<attempts;i++) {
  try {
   const result=await env.AI.run(IMAGE_MODEL,{prompt,steps:4});
   const base64=typeof result==='string'?result:result?.image;
   if(!base64) throw Error('Workers AI returned no image data');
   return {bytes:base64ToBytes(base64),contentType:'image/jpeg'};
  } catch(error) { lastError=error; }
 }
 throw lastError||Error('Image generation failed');
}
