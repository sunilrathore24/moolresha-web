import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createDraft,approve,svgSlide,topics} from './lib.mjs';
const root=dirname(fileURLToPath(import.meta.url)), store=join(root,'data','drafts.json'),port=4179;
async function load(){try{return JSON.parse(await readFile(store,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
async function save(rows){await mkdir(dirname(store),{recursive:true});await writeFile(store,JSON.stringify(rows,null,2));}
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
const body=async req=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>100000)throw Error('Payload too large');}return JSON.parse(data||'{}');};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(req.method==='GET'&&p==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(await readFile(join(root,'index.html'),'utf8'));return;}
 if(req.method==='GET'&&p==='/api/topics')return json(res,200,topics);
 if(req.method==='GET'&&p==='/api/drafts')return json(res,200,await load());
 if(req.method==='POST'&&p==='/api/drafts'){const rows=await load();const d=createDraft(await body(req));rows.unshift(d);await save(rows);return json(res,201,d);}
 const match=p.match(/^\/api\/drafts\/([a-f0-9-]+)(?:\/(approve|reject|slide\/(\d)))?$/);
 if(match){const rows=await load(),i=rows.findIndex(d=>d.id===match[1]);if(i<0)return json(res,404,{error:'Draft not found'});const d=rows[i];
 if(req.method==='GET'&&match[2]?.startsWith('slide/')){const svg=svgSlide(d,Number(match[3]));res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'x-content-type-options':'nosniff'});res.end(svg);return;}
 if(req.method==='PATCH'&&!match[2]){if(d.status!=='draft')return json(res,409,{error:'Only drafts can be edited'});const input=await body(req);const allowed=['title','hook','caption','slides','sources'];for(const key of allowed)if(Object.hasOwn(input,key))d[key]=input[key];if(!Array.isArray(d.slides)||d.slides.length!==6||d.slides.some(x=>typeof x!=='string'))throw Error('Six text slides required');d.updatedAt=new Date().toISOString();await save(rows);return json(res,200,d);}
 if(req.method==='POST'&&match[2]==='approve'){rows[i]=approve(d);await save(rows);return json(res,200,rows[i]);}
 if(req.method==='POST'&&match[2]==='reject'){rows[i]={...d,status:'rejected',updatedAt:new Date().toISOString()};await save(rows);return json(res,200,rows[i]);}
 }
 json(res,404,{error:'Not found'});
 }catch(e){json(res,400,{error:e.message});}});
server.listen(port,'127.0.0.1',()=>console.log('MoolResha Content Studio: http://127.0.0.1:'+port));
