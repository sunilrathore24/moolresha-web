import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateDraft} from './ai.mjs';
import {auditDraft} from './quality.mjs';
import {dueSlots} from './config.mjs';
import {renderSvgFiles,renderReel} from './render.mjs';
import {publishCarousel,publishReel} from './instagram.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const store=join(root,'data','drafts.json'),jobs=join(root,'data','jobs.json');
async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
async function write(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(data,null,2));}
const [command,arg]=process.argv.slice(2);
if(command==='generate'){
 const draft=await generateDraft({kind:arg==='reel'?'reel':'carousel'});
 const check=auditDraft(draft);if(!check.passed)throw Error(check.issues.join('; '));
 const rows=await read(store,[]);rows.unshift(draft);await write(store,rows);
 console.log(JSON.stringify({id:draft.id,status:draft.status,kind:draft.kind,quality:check},null,2));
}else if(command==='schedule'){
 const slots=dueSlots();const entries=await read(jobs,[]);let added=0;
 for(const slot of slots){if(!entries.some(j=>j.key===slot.key)){entries.push({...slot,status:'pending',createdAt:new Date().toISOString()});added++;}}
 await write(jobs,entries);console.log(JSON.stringify({added,pending:entries.filter(j=>j.status==='pending').length}));
}else if(command==='render'){
 const rows=await read(store,[]),draft=rows.find(d=>d.id===arg);if(!draft)throw Error('Unknown draft ID');
 const out=join(root,'data','renders',draft.id);
 if(draft.kind==='reel'){console.log(await renderReel(draft,out));}else{console.log((await renderSvgFiles(draft,out)).join('\n'));}
}else if(command==='publish'){
 if(process.env.ENABLE_INSTAGRAM_PUBLISH!=='true')throw Error('Publishing disabled. Set ENABLE_INSTAGRAM_PUBLISH=true after review.');
 const rows=await read(store,[]),draft=rows.find(d=>d.id===arg);
 if(!draft||draft.status!=='approved')throw Error('Only approved drafts may be published');
 const check=auditDraft(draft);if(!check.passed)throw Error(check.issues.join('; '));
 const manifest=await read(join(root,'data','manifests',arg+'.json'),null);
 if(!manifest)throw Error('Missing public HTTPS media manifest');
 if(!process.env.IG_USER_ID||!process.env.IG_ACCESS_TOKEN)throw Error('Meta credentials missing');
 if(draft.status==='published')throw Error('Already published');
 const params={igUserId:process.env.IG_USER_ID,token:process.env.IG_ACCESS_TOKEN,caption:draft.caption,dryRun:false};
 const result=draft.kind==='reel'?await publishReel({...params,videoUrl:manifest.videoUrl}):await publishCarousel({...params,images:manifest.images});
 draft.status='published';draft.instagramMediaId=result.id;draft.publishedAt=new Date().toISOString();await write(store,rows);console.log(JSON.stringify(result));
}else{console.log('Usage: node automation/cli.mjs generate [carousel|reel] | schedule | render <draft-id> | publish <approved-draft-id>');process.exitCode=1;}
