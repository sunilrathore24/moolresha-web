export const palette = Object.freeze({ cream:'#f3ece0', paper:'#faf6ef', olive:'#3b3d2c', sage:'#9aa78c', clay:'#b5714f', ink:'#2c2620', muted:'#5c5245' });
export const topics = [
  {title:'Where do discarded clothes go?', hook:'Your clothes do not disappear when you throw them away.', takeaway:'Buy thoughtfully. Repair, reuse and wear longer.', sources:['https://www.unep.org/'], caption:'What happens to the clothes we stop wearing? Reuse, repair and responsible disposal matter. Save this reminder for your next wardrobe clean-out. #MoolResha #WearLonger'},
  {title:'How to evaluate a linen shirt', hook:'Before buying linen, check these three things.', takeaway:'Read fibre content, examine construction and consider care.', sources:[], caption:'A linen label is a starting point, not the full story. Look at the composition, finishing and fit. #MoolResha #Linen'},
  {title:'Is recycled polyester recycled clothing?', hook:'Recycled polyester may have started as a bottle.', takeaway:'Ask what the recycled feedstock actually was.', sources:['https://textileexchange.org/'], caption:'Recycled polyester and textile-to-textile recycling are not interchangeable. Look for transparent material sourcing. #MoolResha #FabricKnowledge'}
];
export function createDraft(input, now = new Date()) {
 const title=String(input.title??'').trim(), hook=String(input.hook??'').trim();
 if(!title||!hook) throw new Error('Title and hook are required');
 const slides = [hook,'The question worth asking','What the evidence actually says','What to look for','A better everyday choice',String(input.takeaway??'Choose well. Wear longer.')];
 return {id:crypto.randomUUID(),title,hook,slides,caption:String(input.caption??''),sources:Array.isArray(input.sources)?input.sources.filter(x=>typeof x==='string' && /^https:\/\//.test(x)):[],status:'draft',createdAt:now.toISOString(),updatedAt:now.toISOString()};
}
export function approve(draft) {
 if(draft.slides.length!==6 || draft.slides.some(s=>!String(s).trim())) throw new Error('Six nonempty slides required');
 if(!draft.caption.trim()) throw new Error('Caption required');
 return {...draft,status:'approved',updatedAt:new Date().toISOString()};
}
export function escapeXml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
export function svgSlide(draft, index){
 if(!Number.isInteger(index)||index<0||index>=6) throw new Error('Invalid slide');
 const headline=escapeXml(draft.slides[index]);
 const lines=wrap(headline,26).slice(0,6);
 const bg=index===0?palette.olive:palette.cream, fg=index===0?palette.paper:palette.ink;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="MoolResha carousel slide">
 <rect width="1080" height="1350" fill="${bg}"/>
 <path d="M-30 270 Q430 150 1110 410 M-30 295 Q430 175 1110 435" fill="none" stroke="${index===0?palette.sage:palette.clay}" stroke-width="3" opacity=".28"/>
 <text x="90" y="110" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="600" letter-spacing="6" fill="${fg}">MOOLRESHA</text>
 <text x="90" y="215" font-family="Inter,Arial,sans-serif" font-size="23" letter-spacing="4" fill="${index===0?palette.sage:palette.clay}">THE FIBRE JOURNAL  /  ${String(index+1).padStart(2,'0')}</text>
 ${lines.map((line,i)=>`<text x="90" y="${470+i*93}" font-family="Newsreader,Georgia,serif" font-size="67" font-weight="600" fill="${fg}">${line}</text>`).join('')}
 <line x1="90" y1="1190" x2="990" y2="1190" stroke="${fg}" opacity=".3"/>
 <text x="90" y="1255" font-family="Inter,Arial,sans-serif" font-size="26" fill="${fg}">Closer to the Root</text>
 <text x="990" y="1255" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="24" fill="${fg}">${index+1} / 6</text>
 </svg>`;
}
function wrap(text,max){const words=text.split(/\s+/);const lines=[];let current='';for(const word of words){if((current+' '+word).trim().length>max&&current){lines.push(current);current=word;}else current=(current+' '+word).trim();}if(current)lines.push(current);return lines;}
