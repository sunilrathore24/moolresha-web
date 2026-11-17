export const schedule = Object.freeze([{hour:8,minute:0,kind:'carousel'},{hour:13,minute:0,kind:'reel'},{hour:19,minute:0,kind:'carousel'}]);
export const timezone='Asia/Kolkata';
export function slotKey(date,kind){return date+'-'+kind;}
export function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function dueSlots(now=new Date()){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const h=Number(parts.find(p=>p.type==='hour').value),m=Number(parts.find(p=>p.type==='minute').value);return schedule.filter(s=>h>s.hour||(h===s.hour&&m>=s.minute)).map(s=>({...s,date:localDay(now),key:localDay(now)+'-'+String(s.hour).padStart(2,'0')+s.kind}));}
