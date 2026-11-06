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

test('Participant navigation uses the original full /exec URL and GAS iframe-safe link target',()=>{
 assert.match(html,/<base target="_top">/);
 assert.match(html,/https:\/\/script\.google\.com\/macros\/s\/AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s\/exec/);
 assert.match(html,/target="_top"/);
});


test('V06 last confirmation lists only synthetic research, Taiwan time, owner demo contact and non-REC consent',()=>{
 assert.match(html,/id="v06Summary"/);
 for(const id of ['v06Study','v06Date','v06Time','v06Place','v06Email','v06Consent','v06Status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/確認這筆虛構預約/);
 assert.match(html,/非REC正式電子簽署/);
 assert.match(html,/demo\.study1@example\.invalid（不寄信）/);
 assert.match(html,/v06Preview_\(model,a\)/);
 assert.match(html,/v06Render_\(\)/);
 assert.doesNotMatch(html,/<input[^>]*type="email"/);
});

test('V06 reservation confirmation requires a single consistent valid TEST slot and reviewed synthetic consent',()=>{
 const vm=require('node:vm');
 const start=html.indexOf('function v06Preview_('),end=html.indexOf('function render(){',start);
 assert.ok(start>0&&end>start);
 const source=html.slice(start,end);
 const now=Date.parse('2026-11-06T12:00:00Z');
 const model={mode:'TEST',open:false,consentReady:false,
  formalReadiness:{activationAllowed:false},
  recruitment:{E1:{year:2026},E2:{year:2027}},
  definitions:{E1:{label:'虛構研究E1'},E2:{label:'虛構研究E2'}},
  pdfFixture:{kind:'SIMULATED_PDF_NOT_REC'},config:{},applications:[],
  policy:{consent:{E1:{version:'PENDING_REC_APPROVAL_E1',sha256:''}}},
  b02:{sessions:{}},slots:[{id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',
   remaining:0,bookable:true}]};
 const app={id:'SIM-001',experiment:'E1',phase:'CONSENTED',eligible:true,
  signatureDemo:true,consentReviewedAt:now-10000,holdUntil:now+600000,holdExpired:false,
  consentVersion:'PENDING_REC_APPROVAL_E1',consentSha256:'',slotId:'SIM-SLOT-E1-A'};
 const context={safePreview:x=>x.mode==='TEST'&&x.open===false&&x.consentReady===false,
  Date:class extends Date{static now(){return now;}},Number,String};
 vm.createContext(context);
 vm.runInContext(source,context);
 const summary=context.v06Preview_(model,app);
 assert.ok(summary);
 assert.equal(summary.study,'虛構研究E1');
 assert.equal(summary.date,'2027-01-05');
 assert.equal(summary.time,'10:00（臺灣）');
 assert.match(summary.email,/example\.invalid/);
 assert.match(summary.consent,/非REC正式電子簽署/);
 for(const invalid of [
  {...app,phase:'CONFIRMED'}, {...app,eligible:false},
  {...app,signatureDemo:false}, {...app,consentReviewedAt:null},
  {...app,holdExpired:true}, {...app,holdUntil:now-1},
  {...app,consentVersion:'PENDING_WRONG'}, {...app,slotId:'SIM-NOT-A-SLOT'}
 ])assert.equal(context.v06Preview_(model,invalid),null,'unsafe application must not get confirmation');
 for(const bad of [
  {...model,open:true},
  {...model,slots:[{...model.slots[0],when:'2027-02-30 10:00'}]},
  {...model,slots:[{...model.slots[0],experiment:'E2'}]},
  {...model,slots:[...model.slots,model.slots[0]]},
  {...model,b02:{sessions:{'SIM-SLOT-E1-A':{status:'CANCELLED'}}}},
  {...model,b02:{sessions:{'SIM-SLOT-E1-A':{status:'CLOSED'}}}},
  {...model,policy:{consent:{E1:{version:'PENDING_DIFFERENT',sha256:''}}}}
 ])assert.equal(context.v06Preview_(bad,app),null,'inconsistent TEST source must fail closed');
});

test('V06 final confirmation is disabled on bad source and does not create a new endpoint or storage',()=>{
 const vm=require('node:vm');
 const start=html.indexOf('function v06Preview_('),end=html.indexOf('function render(){',start);
 const source=html.slice(start,end);
 const status={};
 const nodes=new Map(['v06Study','v06Date','v06Time','v06Place','v06Email','v06Consent','v06Status','confirm']
  .map(id=>[id,{textContent:'stale',disabled:false}]));
 const ctx={safePreview:()=>false,model:null,current:()=>null,busy:false,$:id=>nodes.get(id),
  Date,Number,String};
 vm.createContext(ctx);
 vm.runInContext(source+';v06Render_();',ctx);
 assert.equal(nodes.get('confirm').disabled,true);
 for(const id of ['v06Study','v06Date','v06Time','v06Place','v06Email','v06Consent'])
  assert.equal(nodes.get(id).textContent,'無法核實');
 assert.match(nodes.get('v06Status').textContent,/禁止提交/);
 assert.doesNotMatch(html,/new\s+XMLHttpRequest|localStorage|\.innerHTML\s*=/);
});
