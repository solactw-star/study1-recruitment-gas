'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gate=require('../scripts/study1-gas-backend-allowlist.cjs');
const dir=path.join(__dirname,'../gas');
const html=fs.readFileSync(path.join(dir,'Study1Team.html'),'utf8');
const unified=fs.readFileSync(path.join(dir,'Study1Unified.js'),'utf8');
const website=fs.readFileSync(path.join(dir,'Website.js'),'utf8');
const visitor=fs.readFileSync(path.join(dir,'Study1Visitor.html'),'utf8');
const index=fs.readFileSync(path.join(dir,'Index.html'),'utf8');
const sync=fs.readFileSync(path.join(__dirname,'../scripts/study1-gas-auto-index.cjs'),'utf8');
const flow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
test('Research team gets GUI forms for experiment state, copy, slots, weeks and summaries, not raw JSON',()=>{
 assert.doesNotThrow(()=>gate.assertTeamHtml(html));
 for(const id of ['modeE1','modeE2','saveModes','saveSite','saveResearch','saveSlots','saveWeeks','slotRows','weekRows','entries'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const action of ['ADMIN_RECRUITMENT','ADMIN_RESEARCH','ADMIN_EDIT','ADMIN_SLOTS','ADMIN_E2_WEEKS'])
  assert.match(html,new RegExp("save\\('"+action+"'"));
 assert.match(html,/study1UnifiedPreviewGet\(\)/);
 assert.match(html,/study1UnifiedPreviewCommand\(\{action,payload,requestId:id,expectedRevision:model\.revision\}\)/);
 assert.doesNotMatch(html,/<textarea[^>]*spellcheck="false"|admin.*Json|JSON\.stringify/);
});
test('Team setting cannot open formal intake and E2 remains in 2027',()=>{
 assert.match(html,/實驗二 · 2027/);
 assert.match(html,/E2:\{year:2027,mode:/);
 assert.match(unified,/E2:\{year:2027,mode:'COMING_SOON'\}/);
 assert.match(unified,/\['DEMO_OPEN','COMING_SOON','HIDDEN'\]/);
 assert.match(unified,/function study1UnifiedValidateRecruitment_/);
 assert.match(unified,/action==='ADMIN_RECRUITMENT'/);
 assert.match(unified,/正式.*CLOSED|All \/exec formal intake endpoints remain CLOSED/);
 assert.match(website,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});
test('Only the authenticated owner can open the visual research-team management route',()=>{
 assert.match(website,/view==='team'\)\{study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\);/);
 assert.match(website,/HtmlService\.createHtmlOutputFromFile\('Study1Team'\)/);
 assert.match(flow,/'gas\/Study1Team\.html'/);
 assert.match(flow,/main-team-after\.html/);
 assert.match(sync,/deployedTeamHtml!==teamHtml/);
 assert.match(sync,/teamHtmlSha256/);
 assert.match(gate.APPROVED_BACKEND.map(x=>x.name).join(' '),/Study1Team/);
});
test('Homepage and visitor demo use one research visual language and homepage links to demo',()=>{
 assert.match(index,/\/exec\?view=demo/);
 assert.match(html,/\/exec\?view=demo/);
 assert.match(visitor,/\/exec" target="_top"/);
 assert.match(visitor,/--ink:#163341;--sea:#1b7d80/);
 assert.match(visitor,/linear-gradient\(115deg,#f0f9f7,#e4f1ed\)/);
 assert.match(index,/2027 年進行，2026 年不招募/);
 assert.match(visitor,/id="stateE2"/);
});
test('Team UI rejects network/unsafe scripts or a missing editor',()=>{
 assert.throws(()=>gate.assertTeamHtml(html+'<script src="https://example.org/exfil.js"></script>'),/Research team UI/);
 assert.throws(()=>gate.assertTeamHtml(html.replace('id="saveModes"','id="missing"')),/Research team UI/);
 assert.throws(()=>gate.assertTeamHtml(html+'<iframe src="x"></iframe>'),/Research team UI/);
});

test('B01 clears previously rendered statistics when owner snapshot is rejected or refresh fails',()=>{
 assert.match(html,/function b01Clear\(reason\)\{\$\('b01Cards'\)\.replaceChildren\(\)/);
 assert.match(html,/model=null;b01Clear\('管理權限或研究安全設定無法核實/);
 assert.match(html,/model=null;b01Clear\('資料載入失敗/);
 assert.match(html,/if\(!safe\)\{b01Clear\('資料或安全設定未核實/);
 assert.match(html,/model\.open===false&&model\.consentReady===false/);
});
