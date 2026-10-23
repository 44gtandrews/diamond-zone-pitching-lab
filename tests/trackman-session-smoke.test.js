/* Node-only pre-deployment smoke tests for color-coded Trackman sessions.
   Reference counts and velocities are from the approved 38-pitch PDF. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const window={};
vm.runInNewContext(fs.readFileSync('trackman-session.js','utf8'),{window});
const parser=window.DZ_TRACKMAN_SESSION;
assert.ok(parser);
const velocities=[66,72,71.9,75.2,76.5,76.3,74.4,75.5,77.6,78.3,79.8,67.4,67.5,66.5,70,68.4,77.2,67.2,64.8,64.3,68.7,68.6,79.9,68.4,63.5,63.3,63.9,64.6,65.5,78.4,66.9,70.7,69.3,62.7,80.8,80.3,69.7,70.3];
const groups=[
 ['fb',[1,2,3,4,5,6,8,9,10,11,17,23,30,35,36]],
 ['ct',[13,14,15,16,33,37,38]],
 ['sp',[21]],['ch',[22,24,31,32]],
 ['sw',[20,25,26,27,28,29,34]],['ot',[7,12,18,19]]
];
const keys={},expected={};
groups.forEach(([key,indices])=>{
  expected[key]=indices.length;
  indices.forEach(no=>{keys[no]=key;});
});
const names={fb:'Fastball',ct:'Cutter',sp:'Splitter',ch:'ChangeUp',sw:'Sweeper',ot:'Other'};
const colors={fb:[233,204,207],ct:[218,213,204],sp:[204,228,231],
  ch:[226,236,204],sw:[240,232,204],ot:[233,233,233]};
const pages=[{width:792,items:[]}];
const add=(p,x,y,s)=>pages[p].items.push({x,y,s:String(s)});
add(0,6.6,29,'Griffin');add(0,42,29,'Andrews');
add(0,102.2,29,'Pitching practice');add(0,167.6,29,'31 Jul 2026');
add(0,6.6,385.6,'Stats by pitch type');
groups.forEach(([key,nums],i)=>{
  add(0,19.8,428.3+i*22,names[key]);add(0,78.1,428.3+i*22,nums.length);
});
for(let part=0;part<2;part++){
  const p=part+1,start=part?21:0,end=part?38:21;
  pages.push({width:792,items:[]});
  add(p,6.6,75,'Pitches in session');
  add(p,6.6,94,'Pitch no.');add(p,61.6,94,'Pitch Speed');
  [['fb',750.3],['ct',714.2],['sp',674.3],['ch',623.1],['sw',578.7]]
    .forEach(([key,x])=>add(p,x,51.35,names[key]));
  for(let i=start;i<end;i++){
    const y=116.423+(i-start)*22;
    add(p,17.6,y,'#'+(i+1));add(p,61.6,y,velocities[i]);
    add(p,143.6,y,i===18?'-':Math.round(1300+velocities[i]*6));
    add(p,225.5,y,'12:45');add(p,307.5,y,15);add(p,389.4,y,10);
    add(p,471.4,y,i===0?'-':"6'2\"");
    add(p,553.3,y,"6'5\"");add(p,635.2,y,"1'10\"");add(p,717.2,y,'92%');
  }
}
const legendMarkers=[['fb',745.8],['ct',709.7],['sp',669.7],['ch',618.6],['sw',574.2]];
function pixel(page,x,y){
  if(y<70){
    const k=legendMarkers.find(([,v])=>Math.abs(v-x)<2)?.[0];
    return k?colors[k]:null;
  }
  const idx=Math.round((y+2.6-116.423)/22);
  const no=(page===1?1:22)+idx;
  return colors[keys[no]]||null;
}
assert.equal(parser.isSessionPages(pages),true);
const result=parser.parsePages(pages,pixel);
assert.equal(result.individualPitches.length,38);
assert.equal(result.playerName,'Griffin Andrews');
assert.equal(result.sessionDate,'2026-07-31');
assert.equal(result.selectedSessions,1);
assert.equal(result.reportFormat,'individual-session');
assert.equal(result.pitches.reduce((n,p)=>n+p.n,0),38);
for(const [key,indices] of groups)
  assert.equal(result.pitches.find(p=>p.key===key).n,indices.length,key);
for(const [key,average,maximum] of [
  ['fb',76.38,80.8],['ct',68.81,70.3],
  ['sp',68.7,68.7],['ch',68.65,70.7],
  ['sw',63.97,65.5],['ot',68.45,74.4]
]){
  const p=result.pitches.find(p=>p.key===key);
  assert.equal(p.velo,average,key+' average');
  assert.equal(p.veloMax,maximum,key+' maximum');
}
assert.equal(result.individualPitches[0].ext,null,'absent extension remains missing');
assert.equal(result.individualPitches[1].ext,6.167,'feet-and-inches conversion precision');
const dropped=pages.map(p=>({...p,items:p.items.slice()}));
dropped[2].items=dropped[2].items.filter(it=>it.s!=='#38');
assert.throws(()=>parser.parsePages(dropped,pixel),/Missing pitch row|Pitch-type counts do not match/);
const wrongColor=(page,x,y)=>page===2&&y>90&&Math.abs(y-(116.423-2.6))<1
  ?colors.fb:pixel(page,x,y);
assert.throws(()=>parser.parsePages(pages,wrongColor),/counts do not match/);
assert.equal(parser.isSessionPages([{items:[{s:'Stats by Pitch Type'},{s:'Release Height'}]}]),false);
console.log('Trackman session PDF smoke tests passed: 38 pitches, 6 types, missing-cell handling, strict validation.');
