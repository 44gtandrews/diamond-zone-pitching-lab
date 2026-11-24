/* XSS regression guard: source data must never be interpreted as markup.
 * These tests intentionally include malicious-looking inert test strings;
 * they run locally and never interact with real player data or Firebase.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const sessions=fs.readFileSync('session-ui.js','utf8');
const directory=fs.readFileSync('directory-weekly-counts.js','utf8');

const escapeMatch=html.match(/function dzEscapeText\(text\)\s*\{[\s\S]*?\n\}/);
assert.ok(escapeMatch,'HTML text escaping helper must exist');
const escape=vm.runInNewContext(escapeMatch[0]+';dzEscapeText;');
const payload='<img src=x onerror="alert(1)">';
const hostileAttribute='" onmouseover="alert(1)';
assert.equal(escape(payload),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
assert.equal(escape(hostileAttribute),'&quot; onmouseover=&quot;alert(1)');
assert.ok(!escape(payload).includes('<img'));

function section(start,end){
 const a=html.indexOf(start);
 assert.ok(a>=0,'Missing section: '+start);
 const b=html.indexOf(end,a+start.length);
 assert.ok(b>a,'Missing section end: '+end);
 return html.slice(a,b);
}
const directoryRenderer=section('async function renderHome()', '/* ================= Reusable scatter chart');
assert.ok(directoryRenderer.includes('dzEscapeText(player.name)'));
assert.ok(directoryRenderer.includes('dzEscapeText(p.name)'));
assert.ok(directoryRenderer.includes('dzEscapeText(player.publicId?window.DZ_LINK_FOR(player)'));

const chart=section('function scatterChart(', '/* ================= Player view: Overview');
assert.ok(chart.includes('tooltip.replaceChildren(heading,document.createTextNode(p.tooltipDetails))'));
assert.ok(chart.includes('heading.textContent=p.tooltipTitle'));
assert.ok(!chart.includes('tooltip.innerHTML'));
const move=section('function renderMovementChart(', 'function buildFootnote(');
assert.ok(move.includes('tooltipTitle:String(p.name??"")'));
assert.ok(!move.includes('tooltip:'));

const pitchTable=section('async function renderPitchTable(', 'function renderOverview(');
assert.ok(pitchTable.includes('dzEscapeText(p.name)'),'Pitch names cannot be inserted as HTML');
assert.ok(pitchTable.includes('dzEscapeText(p.n'));
assert.ok(pitchTable.includes('dzEscapeText(p.spin)'));
assert.ok(pitchTable.includes('data-pitch-key="'+'$'+'{dzEscapeText(p.key)}"'));
assert.ok(!pitchTable.includes('$'+'{p.name}</td>'),'Raw pitch-name interpolation is forbidden');
const overview=section('function renderOverview(', "document.querySelectorAll('#move-toggle");
assert.ok(overview.includes('dzEscapeText(k.value)'),'Scouting KPI value must be escaped');
assert.ok(overview.includes('dzEscapeText(p.name)'),'Velocity summary pitch names must be escaped');
assert.ok(overview.includes("overview-footnote').textContent"),'Footnotes must be rendered as text');
const pitchLog=section('function renderPitchLog(', "document.getElementById('log-sort').addEventListener");
for(const field of ['p.no','p.date','p.spin','p.tilt','p.spinEff']){
 assert.ok(pitchLog.includes('dzEscapeText('+field+')'),'Pitch log must escape '+field);
}
assert.ok(sessions.includes('tooltipTitle:String(left?.name||right?.name||key)'));
assert.ok(sessions.includes('tooltipTitle:String(right?.name||left?.name||key)'));
assert.ok(sessions.includes('Number.isFinite(p.n)'));
assert.ok(!sessions.includes('tooltip:'),'Comparison chart must not provide raw HTML tooltips');
assert.ok(directory.includes('el.replaceChildren(...saved.nodes.map(node=>node.cloneNode(true)))'),
 'Directory cards must not be restored from innerHTML');

console.log('Security XSS smoke tests passed: encoded pitch data, DOM-only tooltips, safe summaries and directory restoration.');