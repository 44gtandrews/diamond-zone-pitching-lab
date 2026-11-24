'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),importer=fs.readFileSync('importer.js','utf8');
const dialog=html.slice(html.indexOf('<div id="session-import-overlay"'),html.indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'));
for(const id of ['session-import-title','session-cancel','session-player-details','session-player-name','session-player-age','session-player-affiliation','session-file','session-date','session-manual-actions','session-create-manual','session-report-optional','session-read','session-review','session-save','session-admin-override','session-override-confirm','session-import-status']){
 assert.equal(dialog.split('id="'+id+'"').length-1,1,id+' must appear exactly once');
}
assert.ok(dialog.includes('class="dz-import-file-grid"'));
assert.ok(dialog.includes('aria-describedby="session-file-help"'));
assert.ok(dialog.includes('aria-describedby="session-date-help"'));
assert.ok(dialog.indexOf('id="session-upload-heading"')<dialog.indexOf('id="session-manual-actions"'));
assert.ok(dialog.indexOf('id="session-manual-actions"')<dialog.indexOf('id="session-review"'));
assert.ok(html.includes('#session-import-dialog [hidden]{display:none!important}'));
assert.ok(html.includes('.dz-import-file-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)'));
assert.ok(html.includes('#session-import-dialog #session-new-fields,.dz-import-file-grid{grid-template-columns:minmax(0,1fr)'));
assert.ok(html.includes('#session-import-dialog:has(#session-review[style*="block"]){max-width:1080px}'));
assert.ok(importer.includes("const manualAvailable=m==='new'&&window.DZ_IS_ADMIN"));
assert.ok(importer.includes("$('session-manual-actions').hidden=!manualAvailable"));
assert.ok(importer.includes("$('session-player-details').hidden=m!=='new'"));
assert.ok(importer.includes("$('session-report-optional').hidden=!manualAvailable"));
assert.ok(importer.includes("$('session-cancel').onclick=close"));
console.log('Import dialog structure, responsive layout, existing controls and role-dependent sections passed.');
