/* Registration intent is untrusted applicant data, never an authorization role.
   Only an administrator may approve a role or link a player. */
(function(){
'use strict';
const INTENTS=['player','parent','coach'];
const label={player:'Player',parent:'Parent / Guardian',coach:'Coach'};
function normalizeName(s){
 return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
}
function validIntent(role,name,code){
 if(!INTENTS.includes(role))return false;
 if(role==='coach')return name===''&&code==='';
 return typeof name==='string'&&name.trim().length>=2&&name.trim().length<=100
   && /^[\p{L}\p{M}\s.'-]+$/u.test(name.trim())
   && (code===''||/^[1-9][0-9]{5}$/.test(code));
}
function family(role){return role==='player'||role==='parent';}
function suggestions(request,players){
 if(!request||!family(request.requestedRole))return [];
 const name=normalizeName(request.playerName);
 const code=String(request.playerCode||'').trim();
 const list=Object.values(players||{}).filter(p=>p&&p.inactive!==true&&p.id&&p.name);
 const byId=code?list.filter(p=>p.publicId===code):[];
 if(byId.length){
   return byId.map(p=>({id:p.id,name:p.name,publicId:p.publicId||null,
     reason:'Player ID',nameMatches:!!name&&normalizeName(p.name)===name}));
 }
 if(!name)return [];
 const exact=list.filter(p=>normalizeName(p.name)===name);
 return exact.map(p=>({id:p.id,name:p.name,publicId:p.publicId||null,
   reason:'Exact name',nameMatches:true}));
}
const api={INTENTS,label,normalizeName,validIntent,family,suggestions};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window!=='undefined')window.DZ_REGISTRATION=api;
})();