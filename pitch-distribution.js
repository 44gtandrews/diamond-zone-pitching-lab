/* DiamondZone: real pitch-distribution donut, based on recorded counts.
 * Uses the same selected TrackMan performance window as the other charts.
 * Historical reports without counts never receive invented usage values. */
(function(){
'use strict';
function distribution(summary, countsAvailable, getColor){
 if(!countsAvailable||!Array.isArray(summary))return null;
 const valid=summary.filter(p=>p&&Number.isSafeInteger(p.n)&&p.n>0);
 const total=valid.reduce((n,p)=>n+p.n,0);
 if(!valid.length||!Number.isSafeInteger(total)||total<=0)return null;
 const segments=[];
 let cumulative=0;
 for(const [index,p] of valid.entries()){
   const start=100*cumulative/total;
   cumulative+=p.n;
   const end=index===valid.length-1?100:100*cumulative/total;
   const untrustedColor=String(getColor(p.key)||'');
   const color=/^#[0-9a-fA-F]{6}$/.test(untrustedColor)?untrustedColor:'#008c95';
   segments.push({key:p.key,name:String(p.name||'Unknown pitch'),count:p.n,
     share:p.n/total*100,start,end,color});
 }
 return {total,segments,types:segments.length};
}
function fmtShare(x){return Number(x.toFixed(1)).toLocaleString('en-US',{maximumFractionDigits:1})+'%';}
function render(element,summary,countsAvailable,colorForKey){
 if(!element)return;
 element.replaceChildren();
 const model=distribution(summary,countsAvailable,colorForKey);
 if(!model){
   const p=document.createElement('p');
   p.className='dz-no-counts';
   p.textContent='Pitch distribution unavailable. This TrackMan report does not provide individual pitch counts.';
   element.append(p);
   return;
 }
 const root=document.createElement('div');root.className='dz-distribution';
 const ring=document.createElement('div');
 ring.className='dz-distribution-ring';
 ring.setAttribute('role','img');
 ring.setAttribute('aria-label','Pitch distribution: '+model.segments.map(s=>s.name+' '+fmtShare(s.share)).join(', '));
 ring.style.background='conic-gradient('+model.segments
   .map(s=>s.color+' '+s.start.toFixed(5)+'% '+s.end.toFixed(5)+'%').join(', ')+')';
 const center=document.createElement('div');center.className='dz-distribution-center';
 const count=document.createElement('strong');count.textContent=String(model.types);
 const label=document.createElement('small');label.textContent=model.types===1?'pitch type':'pitch types';
 center.append(count,label);ring.append(center);
 const legend=document.createElement('ul');legend.className='dz-distribution-legend';
 legend.setAttribute('aria-label','Pitch distribution breakdown');
 for(const s of model.segments){
   const li=document.createElement('li');
   const dot=document.createElement('span');dot.className='dz-distribution-dot';
   dot.style.backgroundColor=s.color;dot.setAttribute('aria-hidden','true');
   const name=document.createElement('span');name.className='dz-distribution-name';
   name.textContent=s.name;
   const pct=document.createElement('strong');pct.textContent=fmtShare(s.share);
   pct.title=String(s.count)+' tracked pitches';
   li.append(dot,name,pct);legend.append(li);
 }
 root.append(ring,legend);element.append(root);
}
const api={distribution,fmtShare,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window!=='undefined')window.DZ_PITCH_DISTRIBUTION=api;
})();