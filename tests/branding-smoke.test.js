/* Brand consistency, gradient artwork, browser and link preview title. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const cloud=fs.readFileSync('cloud.js','utf8');
const artwork=fs.readFileSync('dz-teal-background.svg','utf8');
const icon=fs.readFileSync('dz-logo.svg','utf8');
const css=html.slice(0,html.indexOf('</style>'));
const head=html.slice(html.indexOf('<head>'),html.indexOf('</head>'));
assert.match(head,/<title>DZ Pitching Portal<\/title>/);
assert.match(head,/<meta property="og:title" content="DZ Pitching Portal">/);
assert.match(head,/<meta name="twitter:title" content="DZ Pitching Portal">/);
assert.match(head,/<meta property="og:site_name" content="DiamondZone">/);
assert.match(head,/<meta name="description" content="DiamondZone/);
assert.match(html,/<strong>DiamondZone<\/strong>/);
assert.match(html,/DiamondZone CT · Pitching Lab/);
assert.match(cloud,/Contact DiamondZone/);
assert.doesNotMatch(html,/Diamond Zone/);
assert.doesNotMatch(cloud,/Diamond Zone/);
for(const [name,svg] of [['header',artwork],['logo',icon]]){
 assert.match(svg,/<linearGradient/,'missing gradient in '+name);
 assert.match(svg,/<stop offset="52%" stop-color="#008c95"/,'brand midpoint missing in '+name);
 assert.match(svg,/fill="url\(#dz-(?:logo|brand)-gradient\)"/,'path is not gradient filled in '+name);
 assert.match(svg,/DiamondZone/,'old branding in '+name);
}
assert.match(css,/background-image:url\('\.\/dz-teal-background\.svg\?v=opacityfade1'\),\s*linear-gradient\(/);
assert.match(css,/background-size:310px 310px,cover/);
assert.match(css,/background-size:210px 210px,cover/);
console.log('DiamondZone gradient + title and preview metadata checks passed.');
