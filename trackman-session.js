/* Diamond Zone Trackman "Pitches in session" PDF reader.
   Extracts actual pitch rows and their color-coded pitch types, checks
   against Trackman's own summary, then calculates true observed averages.
   Does not infer types from velocity or fill missing measurements with zero. */
(() => {
  'use strict';
  const names={fb:'Fastball',ct:'Cutter',sp:'Splitter',ch:'ChangeUp',sw:'Sweeper',
    cb:'Curveball',sl:'Slider',sk:'Sinker',kn:'Knuckleball',ot:'Other'};
  const keys=Object.fromEntries(Object.entries(names)
    .map(([k,n])=>[n.toLowerCase().replace(/[^a-z]/g,''),k]));
  const num=value=>{
    const s=String(value??'').replace(/,/g,'').replace(/%/g,'').trim();
    return /^-?\d+(?:\.\d+)?$/.test(s)?Number(s):null;
  };
  const round=(v,d=2)=>Math.round(v*10**d)/10**d;
  const avg=a=>{const v=a.filter(Number.isFinite);return v.length?
    round(v.reduce((t,n)=>t+n,0)/v.length):null;};
  const max=a=>{const v=a.filter(Number.isFinite);return v.length?Math.max(...v):null;};
  function feet(s){
    s=String(s??'').trim();
    if(!s||s==='—'||s==='-')return null;
    // Trackman uses 6'5", 2', 5'11" (values are feet + inches).
    const m=/^(-?)(\d+)\s*'\s*(\d{1,2})?\s*"?$/.exec(s);
    if(m){const inches=Number(m[3]||0);return inches<12?
      round((Number(m[2])+inches/12)*(m[1]?-1:1),3):null;}
    return num(s);
  }
  function tiltAverage(pitches){
    const angles=pitches.map(p=>{
      const m=/^(\d{1,2}):(\d{2})$/.exec(p.tilt||'');
      if(!m||Number(m[1])>12||Number(m[2])>59)return null;
      const mins=(Number(m[1])%12)*60+Number(m[2]);
      return mins/720*2*Math.PI;
    }).filter(v=>v!==null);
    if(!angles.length)return null;
    const a=Math.atan2(angles.reduce((t,x)=>t+Math.sin(x),0),
      angles.reduce((t,x)=>t+Math.cos(x),0));
    const minutes=Math.round(((a<0?a+2*Math.PI:a)/(2*Math.PI))*720)%720;
    const hour=Math.floor(minutes/60)||12;
    return hour+':'+String(minutes%60).padStart(2,'0');
  }
  function linesFor(page){
    const scale=792/page.width;
    const sorted=(page.items||[]).map(it=>({
      x:it.x*scale,y:it.y*scale,s:String(it.s||'').trim()
    })).filter(it=>it.s&&Number.isFinite(it.x)&&Number.isFinite(it.y))
      .sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const it of sorted){
      let row=rows[rows.length-1];
      if(!row||Math.abs(it.y-row.y)>3.7){
        row={y:it.y,items:[]};rows.push(row);
      }
      row.items.push(it);
      row.y=row.items.reduce((sum,x)=>sum+x.y,0)/row.items.length;
    }
    rows.forEach(row=>row.items.sort((a,b)=>a.x-b.x));
    return rows;
  }
  function isSessionPages(pages){
    const all=pages.map(p=>(p.items||[]).map(x=>x.s).join(' '));
    return all.some(s=>/pitches\s+in\s+session/i.test(s)) &&
      all.some(s=>/stats\s+by\s+pitch\s+type/i.test(s));
  }
  function summary(pages){
    const first=linesFor(pages[0]),expected={},raw=[];
    let titleFound=false;
    for(const row of first){
      const line=row.items.map(i=>i.s).join(' ');
      if(/stats\s+by\s+pitch\s+type/i.test(line)){titleFound=true;continue;}
      if(!titleFound)continue;
      const pitch=row.items.find(it=>it.x>=12&&it.x<72&&
        keys[it.s.toLowerCase().replace(/[^a-z]/g,'')]);
      if(!pitch)continue;
      const count=row.items.find(it=>it.x>70&&it.x<103&&
        Number.isInteger(num(it.s))&&num(it.s)>0);
      if(!count)continue;
      const key=keys[pitch.s.toLowerCase().replace(/[^a-z]/g,'')];
      if(expected[key]!==undefined)throw Error('Ambiguous pitch-type summary: '+pitch.s);
      expected[key]=num(count.s);
      raw.push(pitch.s+': '+expected[key]);
    }
    const rowName=first.find(r=>r.items.some(it=>/pitching\s+practice/i.test(it.s)) ||
      (r.items.some(it=>it.s.toLowerCase()==='pitching')&&
       r.items.some(it=>it.s.toLowerCase()==='practice')));
    let playerName=null,sessionDate=null;
    if(rowName){
      const left=rowName.items.filter(it=>it.x>4&&it.x<98).map(it=>it.s);
      playerName=left.join(' ').trim()||null;
      const full=rowName.items.map(it=>it.s).join(' ');
      const d=/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i.exec(full);
      if(d){
        const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(d[2].toLowerCase())+1;
        sessionDate=d[3]+'-'+String(month).padStart(2,'0')+'-'+d[1].padStart(2,'0');
      }
    }
    if(!Object.keys(expected).length)throw Error('The Trackman session PDF is missing its pitch-type count summary.');
    return {expected,playerName,sessionDate,raw};
  }
  function colorDistance(a,b){
    return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  }
  function parsePages(pages,sample){
    if(!isSessionPages(pages))throw Error('This is not a Trackman individual-pitch session PDF.');
    if(typeof sample!=='function')throw Error('Pitch-marker color reader unavailable.');
    const {expected,playerName,sessionDate,raw}=summary(pages),pitches=[],seen=new Set();
    for(let pageIndex=1;pageIndex<pages.length;pageIndex++){
      const page=pages[pageIndex],rows=linesFor(page);
      if(!rows.some(r=>r.items.some(it=>it.s==='Pitch') &&
        r.items.some(it=>it.s==='no.')))continue;
      const legends={};
      for(const row of rows){
        if(row.y>=78)break;
        for(const item of row.items){
          const type=keys[item.s.toLowerCase().replace(/[^a-z]/g,'')];
          if(!type||item.x<300||item.x>790)continue;
          const rgb=sample(pageIndex,item.x-4.5,item.y-2.9);
          if(rgb&&rgb.length>=3)legends[type]=rgb;
        }
      }
      // "Other" is omitted from the chart legend but appears in the report.
      // It has the light-gray marker tint in the same PDF generation style.
      legends.ot=legends.ot||[233,233,233];
      if(Object.keys(legends).length<2)
        throw Error('Unable to read the Trackman pitch-color key on page '+(pageIndex+1)+'.');
      for(const row of rows){
        const tag=row.items.find(it=>it.x>12&&it.x<42&&/^#\d{1,4}$/.test(it.s));
        if(!tag)continue;
        const no=Number(tag.s.slice(1));
        if(seen.has(no))throw Error('Duplicate pitch #'+no+' in this PDF.');
        const speedToken=row.items.find(it=>it.x>58&&it.x<95&&num(it.s)!==null);
        if(!speedToken)throw Error('No velocity for pitch #'+no+'.');
        const vel=num(speedToken.s);
        if(vel<20||vel>120)throw Error('Invalid velocity for pitch #'+no+'.');
        const rgb=sample(pageIndex,9.9,row.y-2.6);
        if(!rgb)throw Error('Cannot read pitch-type marker for pitch #'+no+'.');
        const candidates=Object.entries(legends).map(([key,col])=>({key,d:colorDistance(rgb,col)}))
          .sort((a,b)=>a.d-b.d);
        // Require a close unambiguous marker match; do NOT guess pitch type
        // from speed or movement. Fails safe rather than corrupt a profile.
        if(!candidates.length||candidates[0].d>26||
          (candidates[1]&&candidates[1].d-candidates[0].d<3))
          throw Error('Cannot confidently identify the colored pitch-type marker for pitch #'+no+
            '. Try a native Trackman PDF export.');
        const key=candidates[0].key;
        const cell=(x)=>row.items.find(it=>Math.abs(it.x-x)<12)?.s??null;
        const p={
          no,key,name:names[key],velo:vel,
          spin:num(cell(143.6)),tilt:/^\d{1,2}:\d{2}$/.test(cell(225.5)||'')?cell(225.5):null,
          ivb:num(cell(307.5)),hb:num(cell(389.4)),
          ext:feet(cell(471.4)),relHeight:feet(cell(553.3)),
          relSide:feet(cell(635.2)),spinEff:num(cell(717.2))
        };
        seen.add(no);pitches.push(p);
      }
    }
    pitches.sort((a,b)=>a.no-b.no);
    if(!pitches.length)throw Error('No individual pitches could be read from this PDF.');
    for(let i=0;i<pitches.length;i++){
      if(pitches[i].no!==i+1)
        throw Error('Missing pitch row #'+(i+1)+'. This PDF cannot be imported safely.');
    }
    const counts={};
    pitches.forEach(p=>counts[p.key]=(counts[p.key]||0)+1);
    if(Object.keys(counts).length!==Object.keys(expected).length ||
       Object.keys(expected).some(k=>counts[k]!==expected[k])){
      throw Error('Pitch-type counts do not match Trackman’s summary. PDF: '+
        raw.join(', ')+'; extracted: '+Object.entries(counts).map(([k,n])=>names[k]+': '+n).join(', ')+
        '. No data was saved.');
    }
    const grouped=Object.entries(counts).map(([key,n])=>{
      const rows=pitches.filter(p=>p.key===key);
      return {
        key,name:names[key],n,
        velo:avg(rows.map(p=>p.velo)),veloMax:max(rows.map(p=>p.velo)),
        spin:avg(rows.map(p=>p.spin)),spinMax:max(rows.map(p=>p.spin)),
        ext:avg(rows.map(p=>p.ext)),ivb:avg(rows.map(p=>p.ivb)),
        hb:avg(rows.map(p=>p.hb)),tilt:tiltAverage(rows),
        strike:null,strikeExt:null,out:null,vaa:null,
        relHeight:avg(rows.map(p=>p.relHeight)),
        relSide:avg(rows.map(p=>p.relSide)),axis2d:null,axis3d:null,gyro:null,
        spinEff:avg(rows.map(p=>p.spinEff))
      };
    }).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
    return {
      pitches:grouped,individualPitches:pitches,playerName,sessionDate,
      selectedSessions:1,reportFormat:'individual-session',hasPitchCounts:true,
      text:'Trackman individual-pitch session: '+pitches.length+' pitches. '+raw.join('; ')+
        '. Calculated per-type averages and maximums from the original pitch rows; blanks excluded.'
    };
  }
  async function parse(doc,pages){
    const canvases=new Map();
    for(let i=1;i<pages.length;i++){
      if(!(pages[i].items||[]).some(it=>/^#\d{1,4}$/.test(String(it.s||'').trim())))continue;
      const page=await doc.getPage(i+1),view=page.getViewport({scale:1});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('Your browser cannot read Trackman PDF marker colors.');
      await page.render({canvasContext:ctx,viewport:view}).promise;
      canvases.set(i,{ctx,width:view.width,height:view.height});
    }
    function sample(index,x,y){
      const d=canvases.get(index);if(!d)return null;
      const px=Math.round(x*d.width/792),py=Math.round(y*d.width/792);
      if(px<1||py<1||px>=d.ctx.canvas.width-1||py>=d.ctx.canvas.height-1)return null;
      const a=d.ctx.getImageData(px,py,1,1).data;
      return [a[0],a[1],a[2]];
    }
    try{return parsePages(pages,sample);}
    finally{for(const c of canvases.values()){c.ctx.canvas.width=0;c.ctx.canvas.height=0;}}
  }
  window.DZ_TRACKMAN_SESSION={isSessionPages,parsePages,parse};
})();
