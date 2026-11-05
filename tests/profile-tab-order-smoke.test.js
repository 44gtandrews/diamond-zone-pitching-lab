/* Profile tab order: preserve all functionality and role-based visibility. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const bar=html.split('<div class="tabbar">')[1]?.split('</div>')[0];
assert.ok(bar,'Missing profile tab bar');
const order=Array.from(bar.matchAll(/<button class="tabbtn(?: active)?" data-tab="([^"]+)"/g),m=>m[1]);
assert.deepEqual(order,[
  'overview','pitch-counts','mechanics','strength','at-home','notes','evaluation','pitchlog'
]);
assert.match(bar,/data-tab="at-home" id="tab-at-home-btn" style="display:none;"/);
assert.match(bar,/data-tab="evaluation" id="tab-evaluation-btn" style="display:none;"/);
assert.match(bar,/data-tab="pitchlog" id="tab-pitchlog-btn" style="display:none;"/);
assert.match(html,/document.getElementById\('tab-evaluation-btn'\).style.display=/);
assert.match(html,/document.getElementById\('tab-at-home-btn'\).style.display/);
assert.match(html,/document.getElementById\('tab-pitchlog-btn'\).style.display/);
assert.match(html,/if\(btn.dataset.tab==='evaluation' && !\['admin','pitching_coach','coach'\].includes\(window.DZ_ROLE\)\)return;/);
assert.match(html,/if\(btn.dataset.tab==='at-home' && !window.DZ_IS_ADMIN\)return;/);
console.log('Profile tab order and role/conditional visibility checks passed.');
