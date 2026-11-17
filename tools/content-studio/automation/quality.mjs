const prohibited=[/100% eco[- ]?friendly/i,/zero environmental impact/i,/completely sustainable/i,/cures? (?:eczema|allergies|skin)/i,/guaranteed (?:reach|engagement)/i];
export function auditDraft(draft){
 const issues=[];const text=[draft.title,draft.hook,draft.caption,...draft.slides].join(' ');
 if(draft.slides.length!==6)issues.push('Expected six slides');
 if(draft.slides.some(s=>s.length>180))issues.push('Slide exceeds 180 characters');
 if(prohibited.some(re=>re.test(text)))issues.push('Unsubstantiated or prohibited claim');
 if(/\b\d+(?:\.\d+)?\s*%|\b(?:million|billion|tonnes|tons)\b/i.test(text)&&!draft.sources.length)issues.push('Quantitative claim needs verified source');
 if(!draft.caption?.trim())issues.push('Missing caption');
 if(!draft.hook?.trim())issues.push('Missing hook');
 return {passed:issues.length===0,issues,requiresHumanReview:true};
}
