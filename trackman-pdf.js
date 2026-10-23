/* Trackman Team Portal / Power BI PDF reader; spatial table extraction.
   Missing PDF cells remain null. The coach reviews values before saving. */
(() => {
 'use strict';
 const types={fastball:['fb','Fastball'],fourseam:['fb','Fastball'],fourseamfastball:['fb','Fastball'],fourseamer:['fb','Fastball'],curveball:['cb','Curveball'],curve:['cb','Curveball'],changeup:['ch','ChangeUp'],change:['ch','ChangeUp'],sinker:['sk','Sinker'],twoseam:['sk','Sinker'],sweeper:['sw','Sweeper'],splitter:['sp','Splitter'],slider:['sl','Slider'],cutter:['ct','Cutter']};
 const type=s=>types[String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')]||null;
 const number=s=>{const t=String(s||'').replace(/\u00a0/g,'').replace(/,/g,'').replace(/%/g,'').trim();return /^-?\d+(?:\.\d+)?$/.test(t)?Number(t):null;};
 const tokens=s=>String(s||'').replace(/\u00a0/g,' ').match(/-?\d[\d,]*(?:\.\d+)?\s*%?|\d{1,2}:\d{2}/g)||[];
 function group(items){
  const source=items.filter(i=>Number.isFinite(i.x)&&Number.isFinite(i.y)&&String(i.s||'').trim()).sort((a,b)=>a.y-b.y||a.x-b.x),rows=[];
  for(const it of source){let r=rows[rows.length-1];if(!r||Math.abs(it.y-r.y)>3.7){r={y:it.y,items:[]};rows.push(r);}r.items.push(it);r.y=r.items.reduce((s,c)=>s+c.y,0)/r.items.length;}
  for(const r of rows)r.items.sort((a,b)=>a.x-b.x);return rows;
 }

 // Second supported Team Portal layout: "Stats by Pitch Type" with release
 // point/spin columns rather than the count-based three-section summary.
 // Bind cells by their actual PDF x-coordinate: blank cells must NOT shift
 // neighbouring columns (notably the absent Cutter extension in this layout).
 const advancedTypes={
   fastball:['fb','Fastball'],fourseam:['fb','Fastball'],
   curveball:['cb','Curveball'],slider:['sl','Slider'],cutter:['ct','Cutter'],
   changeup:['ch','ChangeUp'],sinker:['sk','Sinker'],sweeper:['sw','Sweeper'],
   splitter:['sp','Splitter'],knuckleball:['kn','Knuckleball'],other:['ot','Other']
 };
 function parseReleaseSummary(pages){
   const columns=[
     ['velo',/(^mph$|pitch\s*speed)/i],
     ['spin',/^rpm$/i],
     ['ivb',/^ivb$/i],
     ['hb',/^hb$/i],
     ['ext',/^extension$/i],
     ['relHeight',/rel\s*height/i],
     ['relSide',/rel\s*side/i],
     ['axis2d',/^2d\s*spin\s*axis$/i],
     ['axis3d',/^3d\s*spin\s*axis$/i],
     ['gyro',/^gyro$/i]
   ];
   const seen=new Map(),names=[],hands=[];
   for(const page of pages){
     const scale=612/(page.width||612);
     const lines=group((page.items||[]).map(it=>({
       x:it.x*scale,y:it.y*scale,s:String(it.s||'').replace(/\u00a0/g,' ').trim()
     })));
     for(let i=0;i<lines.length;i++){
       const row=lines[i],strings=row.items.map(it=>it.s);
       const full=strings.join(' ').replace(/\s+/g,' ').trim();
       if(row.y<130){
         const name=strings.find(x=>/^[A-Za-z][A-Za-z .'-]+,\s*[A-Za-z][A-Za-z .'-]+$/.test(x));
         if(name)names.push(name.replace(/^([^,]+),\s*(.*)$/,'$2 $1').trim());
         if(/\bLHP\b/.test(full))hands.push('L');
         else if(/\bRHP\b/.test(full))hands.push('R');
       }
       const headerItems=row.items.filter(it=>columns.some(([,pattern])=>pattern.test(it.s)));
       const isHeader=headerItems.some(it=>/rel\s*height/i.test(it.s)) &&
         headerItems.some(it=>/rel\s*side/i.test(it.s)) &&
         headerItems.some(it=>/^mph$/i.test(it.s));
       if(!isHeader)continue;
       const positions={};
       for(const [field,pat] of columns){
         const found=row.items.find(it=>pat.test(it.s));
         if(found)positions[field]=found.x;
       }
       if(Object.keys(positions).length<7)continue;
       for(let j=i+1;j<lines.length;j++){
         const record=lines[j];
         if(record.y-row.y>165)break;
         if(record.items.some(it=>/reset filters|pitch location|release point|stats by pitch|see pitches by/i.test(it.s)))break;
         const first=record.items.find(it=>it.x>=20&&it.x<positions.velo-8 &&
           advancedTypes[it.s.toLowerCase().replace(/[^a-z]/g,'')]);
         if(!first)continue;
         const tuple=advancedTypes[first.s.toLowerCase().replace(/[^a-z]/g,'')];
         const out={
           key:tuple[0],name:tuple[1],n:null,velo:null,veloMax:null,spin:null,
           spinMax:null,ext:null,ivb:null,hb:null,tilt:null,strike:null,
           strikeExt:null,out:null,vaa:null,relHeight:null,relSide:null,
           axis2d:null,axis3d:null,gyro:null
         };
         for(const it of record.items){
           const value=number(it.s);
           if(value===null || it.x<positions.velo-4)continue;
           let closest=null,d=Infinity;
           for(const [field,x] of Object.entries(positions)){
             const distance=Math.abs(it.x-x);
             if(distance<d){d=distance;closest=field;}
           }
           // Require close physical alignment, so decorative plot coordinates
           // cannot become pitch data; blank values remain null.
           if(closest&&d<13)out[closest]=value;
         }
         if(out.velo!==null && out.velo>=20 && out.velo<=120)seen.set(out.key,out);
       }
     }
   }
   return {
     pitches:[...seen.values()],
     playerName:names[0]||null,throwingHand:hands[0]||null,
     selectedSessions:null,
     reportFormat:'pitch-type-summary',hasPitchCounts:false,
     text:'Pitch-type averages only: pitch counts, usage, maximums and exact session count are unavailable in this export.'
   };
 }
 function isReleaseSummary(pages){
   return pages.some(page=>{
     const s=(page.items||[]).map(it=>String(it.s||'').replace(/\u00a0/g,' ')).join(' ');
     return /rel\s*height\s*\(?ft\)?/i.test(s)&&/rel\s*side\s*\(?ft\)?/i.test(s)&&/spin\s*axis/i.test(s);
   });
 }

 function parsePages(pages){
  if(isReleaseSummary(pages))return parseReleaseSummary(pages);
  const byKey=new Map(),debug=[],names=[],sessions=[];
  for(const page of pages){
   const scale=612/(page.width||612),lines=group((page.items||[]).map(it=>({x:it.x*scale,y:it.y*scale,s:String(it.s||'').trim()})));
   for(const row of lines){
    const t=row.items.map(i=>i.s).join(' ').replace(/\s+/g,' ').trim();debug.push(t);
    if(row.y<160){const m=t.match(/\b(\d+)\s+sessions?\s+selected\b/i);if(m)sessions.push(Number(m[1]));
      const n=row.items.find(it=>it.x>25&&it.x<190&&it.s.length>=5&&/^[A-Za-z][\w .'-]+$/.test(it.s)&&!/tracked by|pitching report|microsoft power|session|all/i.test(it.s));
      if(n&&row.y>55&&row.y<130)names.push(n.s);
    }
   }
   let section=null,headerY=0;
   for(const row of lines){
    const title=row.items.map(i=>i.s).join(' ');
    if(/Pitch\s*Type/i.test(title)){
      if(/\bVelo\b/i.test(title)&&/\bSpin\b/i.test(title))section='release';
      else if(/\bIVB\b/i.test(title)&&/\bHB\b/i.test(title))section='movement';
      else if(/\bStrike\b/i.test(title)&&/\bVAA\b/i.test(title))section='location';
      if(section)headerY=row.y;continue;
    }
    if(!section||row.y<=headerY||row.y-headerY>120)continue;
    const n=row.items.find(it=>it.x>=30&&it.x<=115&&type(it.s));if(!n)continue;
    const [k,name]=type(n.s);
    if(!byKey.has(k))byKey.set(k,{name,key:k,n:null,velo:null,veloMax:null,spin:null,spinMax:null,ext:null,ivb:null,hb:null,tilt:null,strike:null,strikeExt:null,out:null,vaa:null});
    const out=byKey.get(k),cells=row.items.filter(it=>it.x>n.x+26&&!type(it.s));
    if(section==='release'){
      const nums=cells.flatMap(it=>tokens(it.s).map(number)).filter(v=>v!==null);
      if(nums.length>=3&&Number.isInteger(nums[0])&&nums[0]>0){['n','velo','veloMax','spin','spinMax','ext'].forEach((f,i)=>{if(nums[i]!==undefined)out[f]=nums[i];});}
    }else if(section==='movement'){
      for(const it of cells.filter(it=>it.x>=99&&it.x<172)){
        const v=tokens(it.s).map(number).filter(x=>x!==null);if(!v.length)continue;
        if(it.x<116){out.n=v[0];if(v.length>1)out.ivb=v[1];if(v.length>2)out.hb=v[2];}
        else if(it.x<143){out.ivb=v[0];if(v.length>1)out.hb=v[1];}
        else out.hb=v[0];
      }
      for(const it of cells){if(it.x>=173&&it.x<213){const m=it.s.match(/\b\d{1,2}:\d{2}\b/);if(m)out.tilt=m[0];}}
    }else if(section==='location'){
      for(const it of cells){
        const v=tokens(it.s).filter(t=>t.includes('%')||/^\s*-?\d+(?:\.\d+)?\s*$/.test(t));
        if(!v.length)continue;
        if(it.x>=102&&it.x<151)out.strike=number(v[0]);
        else if(it.x>=151&&it.x<200)out.strikeExt=number(v[0]);
        else if(it.x>=200&&it.x<242)out.out=number(v[0]);
        else if(it.x>=242&&it.x<302)out.vaa=number(v[0]);
      }
    }
   }
  }
  const pitches=[...byKey.values()].filter(p=>Number.isInteger(p.n)&&p.n>0&&p.velo>0).map(p=>{for(const f of ['spin','spinMax','strike','strikeExt','out'])if(p[f]!==null)p[f]=Math.round(p[f]);return p;}).sort((a,b)=>b.n-a.n);
  return {pitches,text:debug.join('\n'),playerName:names[0]||null,selectedSessions:sessions[0]||null,reportFormat:'count-summary',hasPitchCounts:true};
 }
 async function fromFile(file){
  if(!window.pdfjsLib)throw Error('PDF reader unavailable. Check your connection and reload the page.');
  const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise, pages=[];
  for(let p=1;p<=Math.min(doc.numPages,20);p++){
    const page=await doc.getPage(p),view=page.getViewport({scale:1}),data=await page.getTextContent();
    pages.push({width:view.width,items:data.items.map(it=>({x:it.transform[4],y:view.height-it.transform[5],s:it.str}))});
  }
  if(window.DZ_TRACKMAN_SESSION?.isSessionPages(pages)){
    try{return await window.DZ_TRACKMAN_SESSION.parse(doc,pages);}
    catch(error){throw Error('Trackman individual-session import failed: '+String(error?.message||error));}
  }
  const result=parsePages(pages);
  if(!result.pitches.length)throw Error('No complete Trackman summary rows found in PDF. Use the review table or a CSV export.');
  return result;
 }
 window.DZ_TRACKMAN_PDF={parsePages,fromFile};
})();