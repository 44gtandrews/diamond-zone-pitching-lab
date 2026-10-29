/* TrackMan import policy: admin-only opt-in for source-name / source-date
   mismatches. Never bypass pitch integrity, duplicate detection or Firebase IAM. */
(function(){
  'use strict';
  const normalize=name=>{
    const raw=String(name||'').trim().replace(/\s+pitching\s+practice\b.*$/i,'').trim();
    const ordered=raw.includes(',')?raw.replace(/^([^,]+),\s*(.*)$/,'$2 $1'):raw;
    return ordered.toLowerCase().replace(/[^a-z]/g,'');
  };
  function issues(info){
    const out=[];
    if(info.mode==='update'&&info.sourceName&&info.profileName &&
       normalize(info.sourceName)!==normalize(info.profileName)){
      out.push({type:'name',source:String(info.sourceName),target:String(info.profileName)});
    }
    if(info.reportFormat==='individual-session' &&
       String(info.sourceDate||'')!==String(info.enteredDate||'')){
      out.push({type:'date',source:String(info.sourceDate||''),target:String(info.enteredDate||'')});
    }
    return out;
  }
  function approval(problems,isAdmin,optedIn){
    if(!problems.length)return {allowed:true,needsConfirmation:false};
    if(!isAdmin)return {allowed:false,needsConfirmation:false,message:'This report does not match the selected player or source session date. An administrator must review and approve the mismatch.'};
    if(!optedIn)return {allowed:false,needsConfirmation:false,message:'Review the name/date discrepancy and enable Admin Override to save this session.'};
    return {allowed:true,needsConfirmation:true};
  }
  const api={normalize,issues,approval};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.DZ_IMPORT_OVERRIDE_POLICY=api;
})();