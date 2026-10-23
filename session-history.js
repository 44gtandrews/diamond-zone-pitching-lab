/* Diamond Zone: non-destructive session history and rolling profile windows.
   All timeframes draw from dated, independently stored sessions. Historical
   aggregate baselines remain undated and are included in Lifetime only. */
(() => {
  'use strict';
  const fields=['velo','spin','ivb','hb','ext','vaa','relHeight','relSide','axis2d','axis3d','gyro','spinEff','strike','strikeExt','out'];
  const maxima=['veloMax','spinMax'];
  const getDay=date=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
    const d=new Date(date+'T12:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
    return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  };
  const fromDay=date=>getDay(date);
  function recent(records,today,days){
    const now=getDay(today),cutoff=now-days*86400000;
    return records.filter(x=>x.kind==='single' && getDay(x.date)!==null &&
      getDay(x.date)>=cutoff&&getDay(x.date)<=now);
  }
  function defaultScope(records,today){
    if(recent(records,today,60).length>=2)return '60';
    if(recent(records,today,365).length>=1)return '365';
    return 'lifetime';
  }
  function scopeDescription(scope){
    return scope==='60'?'Last 60 Days':scope==='365'?'Past 365 Days':
      scope==='baseline'?'Fall 2026 Baseline':
      scope==='lifetime'?'Lifetime':'Individual Session';
  }
  const textDate=iso=>{
    const t=getDay(iso);
    return t===null?'Undated':new Date(t).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
  };
  function normalizedSessions(records){
    return records.map(x=>({...x,kind:x.kind==='baseline'?'baseline':x.kind==='historical'?'historical':'single'}))
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.importedAt||'').localeCompare(String(a.importedAt||'')));
  }
  // Preserve all existing legacy averages even if original per-metric
  // observation counts are unknown; use available counts for future records.
  function aggregate(records){
    const groups=new Map();
    for(const session of records){
      for(const pitch of session.pitches||[]){
        if(!pitch || !pitch.key)continue;
        let row=groups.get(pitch.key);
        if(!row){
          row={key:pitch.key,name:pitch.name||pitch.key,n:0,_totals:{},_weights:{},
            _max:{},_bestTilt:null,validCounts:{}};
          groups.set(pitch.key,row);
        }
        const n=Number.isInteger(pitch.n)&&pitch.n>0?pitch.n:0;
        row.n+=n;
        for(const field of fields){
          const value=pitch[field];
          if(typeof value!=='number'||!Number.isFinite(value))continue;
          const observed=pitch.validCounts?.[field];
          const weight=Number.isInteger(observed)&&observed>=0?observed:n;
          if(weight<=0)continue;
          row._totals[field]=(row._totals[field]||0)+value*weight;
          row._weights[field]=(row._weights[field]||0)+weight;
        }
        for(const field of maxima){
          const value=pitch[field];
          if(typeof value==='number'&&Number.isFinite(value)){
            row._max[field]=row._max[field]==null?value:Math.max(row._max[field],value);
          }
        }
        if(typeof pitch.tilt==='string'&&pitch.tilt&&
          (!row._bestTilt||n>row._bestTilt.n))row._bestTilt={n,tilt:pitch.tilt};
      }
    }
    return [...groups.values()].map(row=>{
      const p={key:row.key,name:row.name,n:row.n,tilt:row._bestTilt?.tilt||null,validCounts:{}};
      for(const field of fields){
        const count=row._weights[field]||0;
        p[field]=count?Math.round(row._totals[field]/count*100)/100:null;
        p.validCounts[field]=count;
      }
      for(const field of maxima)p[field]=row._max[field]??null;
      return p;
    }).filter(p=>p.n>0).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
  }
  function selection(records,player,mode,today){
    const scoped=mode==='auto'?defaultScope(records,today):mode;
    if(scoped==='lifetime')return {mode:scoped,label:scopeDescription(scoped),pitches:player.pitches||[],
      sessions:records.filter(x=>x.kind==='single'),source:'lifetime'};
    const source=scoped==='60'?recent(records,today,60):
      scoped==='365'?recent(records,today,365):
      scoped==='baseline'?records.filter(x=>x.kind==='baseline'||x.kind==='historical'):
      records.filter(x=>x.id===scoped);
    return {mode:scoped,label:scoped==='baseline'?'Fall 2026 Baseline':
        source.length===1&&scoped!=='60'&&scoped!=='365'?textDate(source[0].date):scopeDescription(scoped),
      pitches:aggregate(source),sessions:source,source:scoped};
  }
  window.DZ_HISTORY_MATH={getDay:fromDay,recent,defaultScope,scopeDescription,normalizedSessions,selection,aggregate,textDate};
})();