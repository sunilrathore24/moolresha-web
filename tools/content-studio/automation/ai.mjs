import {createDraft,topics} from '../lib.mjs';
const rules=`You are MoolResha's textile education editor. Brand: Closer to the Root. Write useful, specific, evidence-aware content about cotton, linen, weave, care, quality and conscious fashion. Avoid exaggerated health or sustainability claims. No fabricated statistics, sources or certifications. Do not pretend a brand product has certifications. Create one distinctive hook that earns its payoff. No clickbait. Return only JSON with keys title, hook, takeaway, slides (exactly 6 short strings), caption, sources (only verified source URLs provided to you), reelScript (short spoken script), kind. Slides 1 hook, 2 problem, 3 insight, 4 evidence/caveat, 5 actionable advice, 6 close. Captions concise and helpful.`;
export async function generateDraft({apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL||'gpt-4.1-mini',kind='carousel',seed,fetchImpl=fetch}={}){
 if(!apiKey)throw Error('OPENAI_API_KEY missing');
 const brief=seed||topics[Math.floor(Math.random()*topics.length)];
 const response=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({model,temperature:0.65,response_format:{type:'json_object'},messages:[{role:'system',content:rules},{role:'user',content:JSON.stringify({kind,topic:brief.title,context:brief,verifiedSources:brief.sources})}]})});
 if(!response.ok)throw Error('AI generation failed HTTP '+response.status);
 const result=await response.json();const raw=result.choices?.[0]?.message?.content;if(!raw)throw Error('AI response empty');
 const output=JSON.parse(raw);
 if(!Array.isArray(output.slides)||output.slides.length!==6||output.slides.some(x=>typeof x!=='string'||x.length>180||!x.trim()))throw Error('Invalid slide content');
 if(typeof output.caption!=='string'||!output.caption.trim())throw Error('Caption missing');
 const draft=createDraft({...output,sources:(output.sources||[]).filter(url=>brief.sources.includes(url))});
 draft.slides=output.slides;draft.kind=kind;draft.reelScript=typeof output.reelScript==='string'?output.reelScript:'';draft.aiGenerated=true;
 return draft;
}
