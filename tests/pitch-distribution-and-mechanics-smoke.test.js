/* Prototype-derived pitch donut and mechanical checklist regression checks.
 * Neither feature changes the source of TrackMan stats or existing Firestore
 * mechanical notes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const donut=require('../pitch-distribution.js');
const mechanics=require('../mechanical-changes.js');
const html=fs.readFileSync('index.html','utf8');
const ci=fs.readFileSync('.github/workflows/deploy-firebase.yml','utf8');
const staging=fs.readFileSync('prepare-firebase-hosting.sh','utf8');

// The donut must use actual pitch counts. Historical reports and empty or
// unusable counts remain unavailable, never assigned hypothetical usage.
const summary=[
 {key:'fb',name:'Fastball',n:18},
 {key:'sl',name:'Slider',n:12},
 {key:'ch',name:'ChangeUp',n:10},
 {key:'cb',name:'Curveball',n:0}
];
const colors={fb:'#F25760',sl:'#E2C34F',ch:'#52BC89',cb:'#5299EC'};
const color=key=>colors[key];
const actual=donut.distribution(summary,true,color);
assert.equal(actual.total,40);
assert.equal(actual.types,3);
assert.deepEqual(actual.segments.map(s=>s.count),[18,12,10]);
assert.deepEqual(actual.segments.map(s=>s.share),[45,30,25]);
assert.equal(actual.segments[0].start,0);
assert.equal(actual.segments.at(-1).end,100);
assert.equal(actual.segments[0].color,colors.fb);
assert.equal(donut.fmtShare(33.333333),'33.3%');
assert.equal(donut.distribution(summary,false,color),null,'summary-only reports have no counted distribution');
assert.equal(donut.distribution([{key:'fb',name:'Fastball',n:null}],true,color),null);
assert.equal(donut.distribution([{key:'fb',name:'Fastball',n:0}],true,color),null);
assert.equal(donut.distribution([],true,color),null);
assert.equal(donut.distribution([{key:'fb',name:'Fastball',n:1}],true,()=> 'url(unsafe)')?.segments[0].color,'#008c95');

// Tiny DOM model tests rendering without third-party browser dependencies.
class El{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};
  this.style={};this.dataset={};this.listeners={};this.className='';this.textContent='';
  this.classList={add:()=>{}};}
 append(...values){this.children.push(...values);}
 replaceChildren(...values){this.children=values;}
 setAttribute(key,value){this.attrs[key]=value;}
 getAttribute(key){return this.attrs[key]||null;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 querySelectorAll(selector){
  const matches=[];
  const tag=selector.startsWith('textarea')?'TEXTAREA':selector.startsWith('input')?'INPUT':null;
  function visit(el){
   if(!el||typeof el!=='object')return;
   if(el.tagName===tag && (!selector.includes('[data-mech-index]')||
      Object.prototype.hasOwnProperty.call(el.dataset,'mechIndex')))matches.push(el);
   for(const c of el.children||[])visit(c);
  }
  visit(this);return matches;
 }
 focus(){}
}
function findClass(root,name){
 if(!root||typeof root!=='object')return null;
 if(typeof root.className==='string'&&root.className.split(' ').includes(name))return root;
 for(const c of root.children||[]){
  const found=findClass(c,name);if(found)return found;
 }
 return null;
}
const baseDoc={createElement:tag=>new El(tag),createTextNode:text=>({textContent:text})};
const host=new El();
global.document=baseDoc;
donut.render(host,summary,true,color);
const ring=findClass(host,'dz-distribution-ring');
const legend=findClass(host,'dz-distribution-legend');
assert.ok(ring&&legend,'donut and legend should render');
assert.match(ring.style.background,/^conic-gradient\(/);
assert.match(ring.style.background,/#F25760 0\.00000% 45\.00000%/);
assert.match(ring.attrs['aria-label'],/Fastball 45%/);
assert.equal(legend.children.length,3);
assert.equal(findClass(host,'dz-distribution-center').children[0].textContent,'3');
const none=new El();
donut.render(none,summary,false,color);
assert.match(none.children[0].textContent,/does not provide individual pitch counts/);
delete global.document;

// Legacy mechanical strengths/positives and completion history must not change.
const original={positives:['Strong lead leg block','Good posture'],
 negatives:['Stay closed longer'],completed:[{text:'Consistent arm action',
  from:'negatives',completedAt:'2026-11-01T12:00:00.000Z'}]};
const normalized=mechanics.normalize(original);
assert.deepEqual(normalized,{...original,drills:[]});
const checked=mechanics.complete(original,'negatives',0,'2026-11-18T12:00:00.000Z');
assert.deepEqual(checked.positives,original.positives);
assert.equal(checked.negatives.length,0);
assert.equal(checked.completed.length,2);
assert.equal(mechanics.reopen(checked,1).negatives[0],'Stay closed longer');

// Exercise real DOM checkbox handlers, not just data helpers.
function boardFor(editable){
 const ids=['mech-pos-list','mech-neg-list','mech-drills-list','mech-completed-list',
   'mech-pos-add','mech-neg-add','mech-drills-add','status-mechanics'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new El()]));
 const document={
  ...baseDoc,
  getElementById:id=>{assert.ok(nodes[id],'Missing fixture '+id);return nodes[id];}
 };
 const window={DZ_EDIT_ENABLED:editable};
 vm.runInNewContext(fs.readFileSync('mechanical-changes.js','utf8'),
   {document,window,console,Date},{timeout:1000});
 return {board:window.DZ_CREATE_MECHANICAL_BOARD(original),nodes};
}
const {board,nodes}=boardFor(true);
assert.equal(nodes['mech-pos-list'].querySelectorAll('textarea').length,2);
assert.equal(nodes['mech-pos-list'].querySelectorAll('input').length,0,
 'Mechanical strengths must have no Complete checkbox');
assert.ok(findClass(nodes['mech-pos-list'],'mech-remove-btn'),
 'Mechanical strengths still need their Remove action');
assert.equal(typeof nodes['mech-pos-add'].onclick,'function',
 'Coaches must still be able to add mechanical strengths');
assert.equal(nodes['mech-drills-list'].querySelectorAll('input').length,0,
 'Recommended drills must have no completion checkboxes');
assert.equal(typeof nodes['mech-drills-add'].onclick,'function',
 'Coaches can add recommended drills');
nodes['mech-drills-add'].onclick();
const drillInput=nodes['mech-drills-list'].querySelectorAll('textarea')[0];
drillInput.value='Connection ball drill - 2 x 5';
drillInput.listeners.input();
assert.deepEqual(Array.from(board.getValues().drills),['Connection ball drill - 2 x 5']);
const drillRemove=findClass(nodes['mech-drills-list'],'mech-remove-btn');
assert.ok(drillRemove,'Coach should be able to remove a drill');
drillRemove.listeners.click();
assert.deepEqual(Array.from(board.getValues().drills),[]);
assert.equal(nodes['mech-neg-list'].querySelectorAll('textarea').length,1);
assert.equal(nodes['mech-neg-list'].querySelectorAll('input').length,1);
const activeCheck=nodes['mech-neg-list'].querySelectorAll('input')[0];
assert.equal(activeCheck.type,'checkbox');
activeCheck.checked=true;
activeCheck.listeners.change();
const moved=board.getValues();
assert.deepEqual(moved.positives,original.positives);
assert.deepEqual(moved.negatives,[]);
assert.equal(moved.completed.length,2);
const completedChecks=nodes['mech-completed-list'].querySelectorAll('input');
assert.equal(completedChecks.length,2);
assert.ok(completedChecks.every(c=>c.checked));
completedChecks[1].checked=false;
completedChecks[1].listeners.change();
const restored=board.getValues();
assert.deepEqual(restored.positives,original.positives);
assert.deepEqual(restored.negatives,['Stay closed longer']);
assert.equal(restored.completed.length,1);
assert.match(nodes['status-mechanics'].textContent,/Unsaved changes/);
const readonly=boardFor(false);
assert.equal(readonly.nodes['mech-pos-list'].querySelectorAll('textarea').length,2);
assert.equal(readonly.nodes['mech-pos-list'].querySelectorAll('input').length,0,
 'Read-only mechanical strengths must not show completion checkboxes');
assert.ok(readonly.nodes['mech-neg-list'].querySelectorAll('input').every(c=>c.disabled));
assert.ok(readonly.nodes['mech-completed-list'].querySelectorAll('input').every(c=>c.disabled));
assert.equal(readonly.nodes['mech-pos-add'].style.display,'none');
assert.equal(readonly.nodes['mech-drills-add'].style.display,'none');
assert.equal(readonly.nodes['mech-drills-list'].querySelectorAll('input').length,0);
assert.deepEqual(Array.from(readonly.board.getValues().drills),[]);
assert.deepEqual(readonly.board.getValues().positives,original.positives);

assert.match(html,/<p class="chart-title">Pitch Distribution<\/p>/);
assert.match(html,/window\.DZ_PITCH_DISTRIBUTION\.render\(/);
assert.match(html,/const usageAvailable=!player\.summaryOnly&&totalN>0;/);
assert.match(html,/id="chart-usage"/);
assert.match(html,/id="panel-strength"/);
assert.match(html,/id="mech-pos-list"/);
assert.match(html,/Mechanical strengths/);
assert.match(html,/mech-strength-actions\{justify-content:flex-end;/);
assert.match(html,/id="mech-neg-list"/);
assert.match(html,/id="mech-drills-list"/);
assert.match(html,/id="mech-drills-add"/);
assert.match(html,/id="mech-completed-list"/);
assert.match(html,/id="mechanics-save"/);
assert.match(html,/\.dz-distribution-ring\{/);
assert.match(html,/\.mech-task-checkbox\{/);
assert.ok(html.indexOf('src="./pitch-distribution.js"')<html.indexOf('src="./cloud.js"'));
assert.match(staging,/pitch-distribution\.js/);
assert.match(ci,/node --check "\$file"/);
assert.match(ci,/node tests\/pitch-distribution-and-mechanics-smoke\.test\.js/);

console.log('Donut and mechanical checklist tests passed: percentages, missing counts, DOM checkboxes, reopen, strengths and read-only roles.');
