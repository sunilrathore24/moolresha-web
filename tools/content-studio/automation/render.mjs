import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {svgSlide} from '../lib.mjs';
export async function renderSvgFiles(draft,outDir){await mkdir(outDir,{recursive:true});const paths=[];for(let i=0;i<6;i++){const p=join(outDir,'slide-'+(i+1)+'.svg');await writeFile(p,svgSlide(draft,i));paths.push(p);}return paths;}
function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:'pipe'});let err='';p.stderr.on('data',x=>err+=x.toString().slice(-2000));p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(bin+' exited '+code+': '+err.slice(-600))));});}
// Requires ffmpeg and ImageMagick installed on the rendering host.
// No shell interpolation. Output is deterministic motion graphics, not generative fashion footage.
export async function renderReel(draft,outDir,{ffmpeg='ffmpeg',convert='magick'}={}){
 const slides=await renderSvgFiles(draft,outDir);const frames=[];
 for(let i=0;i<slides.length;i++){const png=join(outDir,'frame-'+i+'.png');await run(convert,[slides[i],'-resize','1080x1920!','-background','#f3ece0',png]);frames.push(png);}
 const args=['-y'];for(const frame of frames)args.push('-loop','1','-t','3','-i',frame);
 const filters=frames.map((_,i)=>'['+i+':v]fps=30,format=yuv420p,setsar=1[v'+i+']').join(';')+';'+frames.map((_,i)=>'[v'+i+']').join('')+'concat=n='+frames.length+':v=1:a=0[out]';
 const output=join(outDir,'reel.mp4');args.push('-filter_complex',filters,'-map','[out]','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output);
 await run(ffmpeg,args);return output;
}
