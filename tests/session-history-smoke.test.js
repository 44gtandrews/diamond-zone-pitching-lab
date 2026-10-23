const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('session-history.js','utf8'),{window,Date,Number,Math,Map,Set});
const h=window.DZ_HISTORY_MATH;
const today='2026-10-23';
const baseline={id:'fall-2026-baseline',kind:'baseline',date:null,
 pitches:[{key:'fb',name:'Fastball',n:300,velo:60,veloMax:64,ivb:15,spin:1450}]};
const oct={id:'session-oct',kind:'single',date:'2026-10-20',
 pitches:[{key:'fb',name:'Fastball',n:15,velo:75,veloMax:78,ivb:16,spin:2000,validCounts:{spin:10,velo:15,ivb:15}}]};
const sep={id:'session-sep',kind:'single',date:'2026-09-15',
 pitches:[{key:'fb',name:'Fastball',n:20,velo:70,veloMax:73,ivb:17,spin:1600,validCounts:{spin:5,velo:20,ivb:20}}]};
const spring={id:'session-spring',kind:'single',date:'2026-04-11',
 pitches:[{key:'fb',name:'Fastball',n:30,velo:67,veloMax:72,spin:1550}]};
const old={id:'session-old',kind:'single',date:'2025-06-01',
 pitches:[{key:'fb',name:'Fastball',n:25,velo:55,veloMax:59}]};
const player={pitches:[{key:'fb',name:'Fastball',n:370,velo:62.4,veloMax:78}]};
assert.equal(h.defaultScope([baseline,oct,sep,spring],today),'60');
assert.equal(h.defaultScope([baseline,oct,spring],today),'365');
assert.equal(h.defaultScope([baseline,old],today),'lifetime');
assert.equal(h.defaultScope([baseline],today),'lifetime');
assert.equal(h.defaultScope([oct],today),'365');
const win60=h.selection([baseline,oct,sep,spring],player,'auto',today);
assert.equal(win60.mode,'60');
assert.equal(win60.sessions.length,2);
assert.equal(win60.pitches[0].n,35);
assert.equal(win60.pitches[0].velo,72.14);
assert.equal(win60.pitches[0].spin,1866.67,'valid spin observations weighted by their own counts');
assert.equal(win60.pitches[0].validCounts.spin,15);
assert.equal(win60.pitches[0].veloMax,78);
const year=h.selection([baseline,oct,spring],player,'auto',today);
assert.equal(year.mode,'365');
assert.equal(year.sessions.length,2);
assert.equal(year.pitches[0].n,45);
const life=h.selection([baseline,old],player,'auto',today);
assert.equal(life.mode,'lifetime');
assert.equal(life.pitches[0].n,370);
assert.equal(life.pitches[0].velo,62.4);
const fall=h.selection([baseline,oct],player,'baseline',today);
assert.equal(fall.sessions.length,1);
assert.equal(fall.pitches[0].n,300);
assert.deepEqual(h.recent([baseline,oct,sep,spring],today,60).map(x=>x.id).sort(),['session-oct','session-sep']);
assert.equal(h.getDay('2026-02-30'),null);
assert.equal(h.getDay('2026-10-23')!==null,true);
console.log('Session-history regression tests passed: 60/365/lifetime fallback, baseline, valid sample weighting.');
