'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gate=require('../scripts/study1-gas-backend-allowlist.cjs');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const website=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
const auto=fs.readFileSync(path.join(__dirname,'../scripts/study1-gas-auto-index.cjs'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
test('Visitor registration DEMO is an ordinary participant-only page, not the engineering admin',()=>{
 assert.doesNotThrow(()=>gate.assertVisitorHtml(html));
 for(const step of ['step-choose','step-screen','step-otp','step-slots','step-consent','step-done'])
  assert.match(html,new RegExp('id="'+step+'"'));
 for(const term of ['研究室後台','adminPolicySave','adminSlotsJson','adminResearchJson','formalReadinessStatus','稽核紀錄'])
  assert.doesNotMatch(html,new RegExp(term));
 assert.match(html,/不接受正式報名/);
 assert.doesNotMatch(html,/<script[^>]+src=|\.innerHTML\s*=|localStorage|<iframe\b/);
});
test('Teacher DEMO runs the SAME Study1Unified E1/E2 eligibility, OTP, booking, PDF and consent state machine',()=>{
 for(const action of ['START','SCREEN','OTP_REQUEST','OTP_VERIFY','HOLD',
   'PDF_DEMO_REVIEW','CONSENT_REVIEW','CONSENT','CONFIRM','MOVE','CANCEL'])
  assert.match(html,new RegExp("issue\\('"+action+"'"));
 assert.match(html,/study1UnifiedPreviewGet\(\)/);
 assert.match(html,/study1UnifiedPreviewCommand\(envelope\)/);
 assert.match(html,/SIMULATED_SIGN_ONLY/);
 assert.match(html,/demo\.study1@example\.invalid/);
 assert.doesNotMatch(html,/<input[^>]*type="email"/);
});
test('The teacher-facing route requires owner identity and CLOSED flags; no real public booking endpoints are opened',()=>{
 assert.match(website,/view==='demo'\)\{study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\);/);
 assert.match(website,/HtmlService\.createHtmlOutputFromFile\('Study1Visitor'\)/);
 for(const name of ['requestOtp','verifyOtp','holdSlot','submitConsent'])
  assert.match(website,new RegExp('function '+name+'\\(\\)\\{return rejectIntake_\\(\\);\\}'));
 assert.match(workflow,/'gas\/Study1Visitor\.html'/);
 assert.match(workflow,/main-visitor-after\.html/);
 assert.match(auto,/deployedVisitorHtml!==visitorHtml/);
 assert.match(auto,/visitorHtmlSha256/);
});
test('Any external scripts, raw HTML injection, or missing signup flow fail DEMO deployment gate',()=>{
 assert.throws(()=>gate.assertVisitorHtml(html+'<script src="https://evil.example/x.js"></script>'),/Visitor demo/);
 assert.throws(()=>gate.assertVisitorHtml(html.replace('id="otpVerify"','id="missing-otp"')),/Visitor demo/);
 assert.throws(()=>gate.assertVisitorHtml(html+'<div onclick="window.fetch(1)"></div>'),/Visitor demo/);
});

test('Research-team enrollment presentation settings display E2 2027 as coming soon',()=>{
 assert.match(html,/model\.recruitment\[exp\]/);
 assert.match(html,/settings\.mode!=='DEMO_OPEN'/);
 assert.match(html,/settings\.year/);
 assert.match(html,/2027/);
 assert.match(html,/id="visitorHeroTitle"/);
 assert.match(html,/id="siteNoticeText"/);
});
