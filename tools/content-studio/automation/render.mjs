import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {svgSlide, svgTextPanel} from '../lib.mjs';
export async function renderSvgFiles(draft,outDir){await mkdir(outDir,{recursive:true});const paths=[];for(let i=0;i<6;i++){const p=join(outDir,'slide-'+(i+1)+'.svg');await writeFile(p,svgSlide(draft,i));paths.push(p);}return paths;}
function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:'pipe'});let err='';p.stderr.on('data',x=>err+=x.toString().slice(-2000));p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(bin+' exited '+code+': '+err.slice(-600))));});}
// Requires ffmpeg and ImageMagick installed on the rendering host.
// No shell interpolation. Output is deterministic motion graphics, not generative fashion footage.
// Instagram's Graph API needs JPEG/PNG and MP4 URLs, never raw SVG, so every publishable
// asset goes through this rasterization step before it is uploaded anywhere.
async function rasterize(slides,outDir,geometry,prefix,convert,indexOffset=0){
 const frames=[];
 for(let i=0;i<slides.length;i++){const png=join(outDir,prefix+'-'+(i+indexOffset)+'.png');await run(convert,[slides[i],'-density','300','-resize',geometry,'-background','#f3ece0','-flatten',png]);frames.push(png);}
 return frames;
}
async function concatToVideo(frames,outDir,ffmpeg){
 const args=['-y'];for(const frame of frames)args.push('-loop','1','-t','3','-i',frame);
 const filters=frames.map((_,i)=>'['+i+':v]fps=30,format=yuv420p,setsar=1[v'+i+']').join(';')+';'+frames.map((_,i)=>'[v'+i+']').join('')+'concat=n='+frames.length+':v=1:a=0[out]';
 const output=join(outDir,'reel.mp4');args.push('-filter_complex',filters,'-map','[out]','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output);
 await run(ffmpeg,args);return output;
}
// 1080x1350 (4:5), matching svgSlide's own canvas, for Instagram carousel feed posts.
export async function renderCarouselImages(draft,outDir,{convert='magick'}={}){
 const slides=await renderSvgFiles(draft,outDir);
 return rasterize(slides,outDir,'1080x1350','slide',convert,1);
}
export async function renderReel(draft,outDir,{ffmpeg='ffmpeg',convert='magick'}={}){
 const slides=await renderSvgFiles(draft,outDir);
 const frames=await rasterize(slides,outDir,'1080x1920!','frame',convert);
 return concatToVideo(frames,outDir,ffmpeg);
}

// --- Photo + caption-panel variants, used when the Worker's /generate call
// also produced a free Workers AI background image (see
// cloudflare/src/generate.mjs). The photo always sits above a solid-colour
// text panel (svgTextPanel), never behind the text itself, so legibility
// never depends on what the generated photo actually contains.
async function renderTextPanels(draft,outDir,{width=1080,height=567,convert='magick'}={}){
 await mkdir(outDir,{recursive:true});
 const panels=[];
 for(let i=0;i<6;i++){
  const svgPath=join(outDir,'panel-'+(i+1)+'.svg');
  await writeFile(svgPath,svgTextPanel(draft,i,{width,height}));
  const png=join(outDir,'panel-'+(i+1)+'.png');
  await run(convert,[svgPath,'-density','300','-resize',width+'x'+height,'-background','#f3ece0','-flatten',png]);
  panels.push(png);
 }
 return panels;
}
async function coverCrop(sourcePath,outPath,width,height,convert){
 await run(convert,[sourcePath,'-resize',width+'x'+height+'^','-gravity','center','-extent',width+'x'+height,outPath]);
 return outPath;
}
async function stackVertically(topPath,bottomPath,outPath,convert){
 await run(convert,[topPath,bottomPath,'-append',outPath]);
 return outPath;
}
// 1080x1350 overall: ~58% generated photo on top, 42% caption panel below.
export async function renderPhotoCarouselImages(draft,backgroundPath,outDir,{convert='magick'}={}){
 await mkdir(outDir,{recursive:true});
 const panelHeight=567, photoHeight=1350-panelHeight;
 const top=await coverCrop(backgroundPath,join(outDir,'photo-top.png'),1080,photoHeight,convert);
 const panels=await renderTextPanels(draft,outDir,{width:1080,height:panelHeight,convert});
 const images=[];
 for(let i=0;i<panels.length;i++){
  const out=join(outDir,'slide-'+(i+1)+'.png');
  await stackVertically(top,panels[i],out,convert);
  images.push(out);
 }
 return images;
}
// 1080x1920 overall: same photo reused across all six frames (one Workers AI
// call per Reel, not six), only the caption panel changes per frame.
export async function renderPhotoReel(draft,backgroundPath,outDir,{ffmpeg='ffmpeg',convert='magick'}={}){
 await mkdir(outDir,{recursive:true});
 const panelHeight=567, photoHeight=1920-panelHeight;
 const top=await coverCrop(backgroundPath,join(outDir,'photo-top-reel.png'),1080,photoHeight,convert);
 const panels=await renderTextPanels(draft,outDir,{width:1080,height:panelHeight,convert});
 const frames=[];
 for(let i=0;i<panels.length;i++){
  const out=join(outDir,'frame-'+i+'.png');
  await stackVertically(top,panels[i],out,convert);
  frames.push(out);
 }
 return concatToVideo(frames,outDir,ffmpeg);
}
