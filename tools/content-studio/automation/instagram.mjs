// Meta Graph API adapter. No credentials or publishing are enabled by default.
// Images/videos MUST be publicly reachable HTTPS URLs. Meta fetches them from your media host.
const base='https://graph.facebook.com';
export async function graphRequest(path,params,{token,version=process.env.META_GRAPH_VERSION||'v22.0',fetchImpl=fetch}={}){
 if(!token)throw Error('Instagram access token missing');
 const body=new URLSearchParams({...params,access_token:token});
 const r=await fetchImpl(base+'/'+version+'/'+path,{method:'POST',body});
 const data=await r.json();if(!r.ok||data.error)throw Error('Meta API error: '+(data.error?.message||r.status));return data;
}
export async function waitForContainer(containerId,{token,igUserId,fetchImpl=fetch,version=process.env.META_GRAPH_VERSION||'v22.0',attempts=15,delayMs=4000}={}){
 for(let i=0;i<attempts;i++){const u=new URL(base+'/'+version+'/'+containerId);u.search=new URLSearchParams({fields:'status_code,status',access_token:token}).toString();const r=await fetchImpl(u);const data=await r.json();if(!r.ok)throw Error('Meta container status HTTP '+r.status);if(data.status_code==='FINISHED')return;if(data.status_code==='ERROR'||data.status_code==='EXPIRED')throw Error('Meta media processing '+data.status_code);await new Promise(resolve=>setTimeout(resolve,delayMs));}
 throw Error('Media processing timeout');
}
export async function publishCarousel({igUserId,token,images,caption,fetchImpl=fetch,dryRun=true}){
 if(!Array.isArray(images)||images.length<2||images.length>10||images.some(u=>!/^https:\/\//.test(u)))throw Error('Carousel needs 2-10 public HTTPS images');
 if(!igUserId||!caption)throw Error('Instagram user ID and caption required');
 if(dryRun)return {dryRun:true,kind:'carousel',count:images.length};
 const opts={token,fetchImpl};const children=[];
 for(const image_url of images){const item=await graphRequest(igUserId+'/media',{image_url,is_carousel_item:'true'},opts);children.push(item.id);await waitForContainer(item.id,opts);}
 const parent=await graphRequest(igUserId+'/media',{media_type:'CAROUSEL',children:children.join(','),caption},opts);
 await waitForContainer(parent.id,opts);
 return graphRequest(igUserId+'/media_publish',{creation_id:parent.id},opts);
}
export async function publishReel({igUserId,token,videoUrl,caption,fetchImpl=fetch,dryRun=true}){
 if(!/^https:\/\//.test(videoUrl||''))throw Error('Reel needs public HTTPS MP4 URL');
 if(!igUserId||!caption)throw Error('Instagram user ID and caption required');
 if(dryRun)return {dryRun:true,kind:'reel'};
 const opts={token,fetchImpl};const container=await graphRequest(igUserId+'/media',{media_type:'REELS',video_url:videoUrl,caption,share_to_feed:'true'},opts);
 await waitForContainer(container.id,opts);
 return graphRequest(igUserId+'/media_publish',{creation_id:container.id},opts);
}
