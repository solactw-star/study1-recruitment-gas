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
 assert.match(html,/id="formalContact"[^>]*hidden/);
 assert.match(html,/id="formalEmail"[^>]*disabled/);
 const demoOnly=html.replace(/<div id="formalContact"[\s\S]*?<\/div>/,'');
 assert.doesNotMatch(demoOnly,/<input[^>]*type="email"/);
});
test('Deprecated demo route cannot publish the old test page; routes to owner-guarded formal while intake remains CLOSED',()=>{
 assert.match(website,/view==='demo'\)\{study1AdminOwnerRequired_\(\);const t=HtmlService\.createTemplateFromFile\('Study1Visitor'\);/);
 assert.doesNotMatch(website,/HtmlService\.createHtmlOutputFromFile\('Study1Visitor'\)/);
 for(const name of ['requestOtp','verifyOtp','holdSlot','submitConsent'])
  assert.match(website,new RegExp('function '+name+'\\(\\)\\{return rejectIntake_\\(\\);\\}'));
 assert.match(workflow,/'gas\/Study1Visitor\.html'/);
 assert.match(workflow,/main-visitor-after\.html/);
 assert.match(auto,/deployedVisitorHtml!==visitorHtml/);
 assert.match(auto,/visitorHtmlSha256/);
});
test('Any external scripts, raw HTML injection, or missing signup flow fail DEMO deployment gate',()=>{
 assert.throws(()=>gate.assertVisitorHtml(html+'<script src="https://evil.example/x.js"></script>'),/Visitor formal entry contract/);
 assert.throws(()=>gate.assertVisitorHtml(html.replace('id="otpVerify"','id="missing-otp"')),/Visitor formal entry contract/);
 assert.throws(()=>gate.assertVisitorHtml(html+'<div onclick="window.fetch(1)"></div>'),/Visitor formal entry contract/);
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
 assert.match(html,/https:\/\/script\.google\.com\/macros\/s\/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s\/exec/);
 assert.match(html,/target="_top"/);
});


test('V06 last confirmation lists only synthetic research, Taiwan time, owner demo contact and non-REC consent',()=>{
 assert.match(html,/id="v06Summary"/);
 for(const id of ['v06Study','v06Date','v06Time','v06Place','v06Email','v06Consent','v06Status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/資料正確，前往最後PDF與簽名步驟/);
 assert.match(html,/尚未簽署；下一步才進入最後的知情同意/);
 assert.match(html,/demo\.study1@example\.invalid（不寄信）/);
 assert.match(html,/v06Preview_\(model,a\)/);
 assert.match(html,/v06Render_\(\)/);
 assert.match(html,/id="formalContact"[^>]*hidden/);
 assert.match(html,/id="formalEmail"[^>]*disabled/);
 const demoOnly=html.replace(/<div id="formalContact"[\s\S]*?<\/div>/,'');
 assert.doesNotMatch(demoOnly,/<input[^>]*type="email"/);
});

test('V06 pre-signature review requires a single consistent verified HELD TEST slot before PDF consent',()=>{
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
 const app={id:'SIM-001',experiment:'E1',phase:'HELD',eligible:true,
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
 assert.match(summary.consent,/尚未簽署/);
 for(const invalid of [
  {...app,phase:'CONFIRMED'}, {...app,eligible:false},
  {...app,phase:'CONSENTED'}, {...app,slotId:null},
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


test('V05 mobile calendar keeps accessible dates, touch controls, source-derived times and original select',()=>{
 for(const id of ['v05Prev','v05Next','v05Month','v05Dates','v05Status','v05Choices','slot','hold'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(html,/\.v05Day\{[^}]*min-height:44px/);
 assert.match(html,/@media\(max-width:540px\)/);
 assert.match(html,/role="group" aria-label="選擇可預約的虛構日期"/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/v05Read_\(model,a\)/);
 assert.match(html,/s\.day===v05State\.date/);
 assert.match(html,/issue\('HOLD',\{id:a\.id,slotId:\$\('slot'\)\.value\}\)/);
 assert.doesNotMatch(html,/localStorage|<script[^>]+src=|\.innerHTML\s*=/);
});
test('V05 source rejects malformed dates, forged availability, duplicate slot and crossed E1/E2',()=>{
 const vm=require('node:vm'),now=Date.parse('2026-11-06T12:00:00Z');
 const begin=html.indexOf('function v05Read_(response,a){'),end=html.indexOf('function v05Render_(a){',begin);
 assert.ok(begin>=0&&end>begin);
 const model={mode:'TEST',open:false,consentReady:false,
  formalPorts:{activated:false},recruitment:{E1:{year:2026,mode:'DEMO_OPEN'},E2:{year:2027,mode:'COMING_SOON'}},
  b02:{sessions:{'SIM-SLOT-E1-A':{title:'模擬活動',place:'測試室',minutes:60,status:'OPEN'}}},
  slots:[
   {id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',capacity:2,remaining:1,bookable:true},
   {id:'SIM-SLOT-E1-B',experiment:'E1',when:'2027-02-06 14:00',capacity:2,remaining:2,bookable:true},
   {id:'SIM-SLOT-E2-A',experiment:'E2',when:'2027-03-01 10:00',capacity:2,remaining:1,bookable:true}
  ]};
 const app={id:'SIM-001',experiment:'E1',phase:'VERIFIED',eligible:true};
 const ctx={Date:class extends Date{static now(){return now;}},Number,Object,Set,Array,String,
  safePreview:r=>r.mode==='TEST'&&r.open===false&&r.consentReady===false};
 vm.createContext(ctx);vm.runInContext(html.slice(begin,end),ctx);
 const rows=ctx.v05Read_(model,app);
 assert.equal(rows.length,2);
 assert.equal(rows[0].month,'2027-01');
 assert.equal(rows[0].end,'2027-01-05 11:00（臺灣）');
 assert.equal(rows[0].remaining,1);
 assert.equal(ctx.v05Read_(model,{...app,experiment:'E2'}),null,'E2 coming soon cannot select');
 const deny=[
  {...model,mode:'FORMAL'},
  {...model,open:true},
  {...model,formalPorts:{activated:true}},
  {...model,slots:[...model.slots,model.slots[0]]},
  {...model,slots:[{...model.slots[0],when:'2027-02-30 10:00'},...model.slots.slice(1)]},
  {...model,slots:[{...model.slots[0],remaining:3},...model.slots.slice(1)]},
  {...model,slots:[{...model.slots[0],experiment:'E2'},...model.slots.slice(1)]},
  {...model,slots:[{...model.slots[0],bookable:true,when:'2025-01-01 10:00'},...model.slots.slice(1)]},
  {...model,b02:{sessions:{'SIM-SLOT-E1-A':{status:'CANCELLED'}}}},
  {...model,b02:{sessions:{'SIM-SLOT-E1-A':{status:'OPEN',minutes:900}}}}
 ];
 for(const bad of deny)assert.equal(ctx.v05Read_(bad,app),null,'conflicting TEST slot must fail closed');
 assert.equal(ctx.v05Read_(model,{...app,phase:'CONFIRMED'}),null);
 assert.equal(ctx.v05Read_(model,{...app,eligible:false}),null);
});
test('V05 month picker reads same synthetic snapshot, filters dates and clears on denied owner source',()=>{
 const vm=require('node:vm'),now=Date.parse('2026-11-06T12:00:00Z');
 const begin=html.indexOf('const v05State='),end=html.indexOf('/* V06 confirmation summary',begin);
 assert.ok(begin>=0&&end>begin);
 function node(tagName='div'){
  return {tagName,children:[],handlers:{},attributes:{},disabled:false,value:'',textContent:'',
   append(...items){this.children.push(...items);},
   replaceChildren(...items){this.children=[...items];if(this.tagName==='select')this.value=items[0]?.value||'';},
   addEventListener(k,fn){this.handlers[k]=fn;},
   setAttribute(k,v){this.attributes[k]=v;}
  };
 }
 const ids=new Map(['v05Dates','v05Choices','slot','hold','v05Prev','v05Next','v05Month','v05Status']
  .map(id=>[id,node(id==='slot'?'select':'div')]));
 const app={id:'SIM-001',experiment:'E1',phase:'VERIFIED',eligible:true};
 const model={mode:'TEST',open:false,consentReady:false,formalPorts:{activated:false},
  recruitment:{E1:{mode:'DEMO_OPEN'}},b02:{sessions:{}},slots:[
    {id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',capacity:2,remaining:1,bookable:true},
    {id:'SIM-SLOT-E1-B',experiment:'E1',when:'2027-02-06 14:00',capacity:2,remaining:2,bookable:true}
  ]};
 const ctx={Date:class extends Date{static now(){return now;}},Number,Object,Set,Array,String,
  model,current:()=>app,busy:false,$:id=>{assert.ok(ids.has(id));return ids.get(id);},
  safePreview:r=>r.mode==='TEST'&&r.open===false&&r.consentReady===false,
  document:{createElement:node},
  makeOptions:(n,items)=>{n.replaceChildren(...items.map(r=>Object.assign(node('option'),{value:r.id,textContent:r.when})));}};
 vm.createContext(ctx);vm.runInContext(html.slice(begin,end),ctx);
 ctx.v05Render_(app);
 assert.equal(ids.get('v05Month').textContent,'2027 年 01 月（虛構）');
 assert.equal(ids.get('v05Choices').children.length,1);
 assert.equal(ids.get('slot').children[0].value,'SIM-SLOT-E1-A');
 assert.equal(ids.get('v05Prev').disabled,true);
 assert.equal(ids.get('v05Next').disabled,false);
 assert.ok(ids.get('v05Dates').children.some(n=>n.tagName==='button'&&n.textContent==='5'&&n.disabled===false));
 assert.equal(ids.get('hold').disabled,false);
 ids.get('v05Next').handlers.click();
 assert.equal(ids.get('v05Month').textContent,'2027 年 02 月（虛構）');
 assert.equal(ids.get('slot').value,'SIM-SLOT-E1-B');
 assert.equal(ids.get('v05Prev').disabled,false);
 model.open=true;
 ctx.v05Render_(app);
 assert.equal(ids.get('hold').disabled,true);
 assert.equal(ids.get('slot').children.length,0);
 assert.equal(ids.get('v05Choices').children.length,0);
 assert.equal(ids.get('v05Dates').children.length,0);
 assert.match(ids.get('v05Status').textContent,/拒絕選擇/);
});

test('V07 exposes only safe synthetic booking-result uncertainty, GET rescan and no automatic command replay',()=>{
 for(const id of ['v07Result','v07Rescan'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/function v07Readback_\(afterFailure,detail\)/);
 assert.match(html,/function v07SafeRead_\(response,last\)/);
 assert.match(html,/function v07ConfirmResponse_\(action,payload,response,priorRevision\)/);
 assert.match(html,/v07\.blocked=true/);
 assert.match(html,/v07Readback_\(true,detail\)/);
 assert.match(html,/study1UnifiedPreviewGet\(\)/);
 assert.match(html,/重新核對原GAS狀態（不重送）/);
 assert.match(html,/結果未知/);
 assert.match(html,/時段已滿或失效/);
 assert.match(html,/資格不符/);
 assert.match(html,/無法證明剛才那次提交成功/);
 assert.doesNotMatch(html,/\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest)\b/);
});

test('P1-08 V08 in-session appointment changes require explicit TEST source preview, acknowledge and existing locked GAS RPC',()=>{
 for(const id of ['v08ManageReview','v08Action','v08From','v08To','v08ManageStatus',
  'v08Ack','v08Commit','v08Back'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/function v08Plan_\(response,a,action,targetId\)/);
 assert.match(html,/function v08Matches_\(\)/);
 assert.match(html,/function v08Preview_\(action\)/);
 assert.match(html,/function v08Commit_\(\)/);
 assert.match(html,/v08\.draft=\{\.\.\.plan,preparedAt\}/);
 assert.match(html,/const preparedAt=Date\.now\(\)/);
 assert.match(html,/v08Fresh_\(draft,Date\.now\(\)\)/);
 assert.match(html,/next\.revision===draft\.revision&&next\.signature===draft\.signature/);
 assert.match(html,/v08Ack'\)\.checked/);
 assert.match(html,/v08Clear_\('V07正在回讀原GAS/);
 assert.match(html,/issue\('MOVE',\{id:draft\.applicationId,slotId:draft\.destinationId\}\)/);
 assert.match(html,/issue\('CANCEL',\{id:draft\.applicationId\}\)/);
 assert.doesNotMatch(html,/study1V08ConsumeAtomic_|STUDY1_V08_ENABLED_|study1V08Guard_/,
  'unfinished PR #90 token contract must not be adopted by this UI');
 assert.doesNotMatch(html,/localStorage|sessionStorage|<script[^>]+src=|\.innerHTML\s*=/);
});
test('P1-08 V08 source preflight rejects crossed experiments, full/past/duplicate slots, invalid dates, disabled ownership',()=>{
 const vm=require('node:vm');
 const begin=html.indexOf('function v08CheckTime_('),
  end=html.indexOf('function v08Matches_(',begin);
 assert.ok(begin>0&&end>begin);
 let safe=true;
 const ctx={v07SafeRead_:()=>safe,
  Date:class extends Date{static now(){return Date.parse('2026-11-07T00:00:00Z')}},
  Number,Set,JSON,String};
 vm.createContext(ctx);vm.runInContext(html.slice(begin,end),ctx);
 const app={id:'SIM-001',experiment:'E1',phase:'CONFIRMED',eligible:true,signatureDemo:true,
  slotId:'SIM-SLOT-E1-A'};
 const origin={id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-02-01 10:00',
  capacity:2,remaining:1,bookable:true};
 const next={id:'SIM-SLOT-E1-B',experiment:'E1',when:'2027-02-08 10:00',
  capacity:2,remaining:1,bookable:true};
 // The current original owner GET always includes a server-pinned TEST clock
 // and FIFO entries; this compact preflight fixture must honor that contract.
 const model={revision:3,applications:[app],slots:[origin,next],
  b02:{sessions:{}},waitlist:{asOf:Date.parse('2026-11-07T00:00:00Z'),entries:[]}};
 const okay=ctx.v08Plan_(model,app,'MOVE','SIM-SLOT-E1-B');
 assert.ok(okay);assert.equal(okay.destinationId,'SIM-SLOT-E1-B');
 assert.ok(ctx.v08Plan_(model,app,'CANCEL',null));
 const reject=[
  {...model,slots:[origin,{...next,experiment:'E2'}]},
  {...model,slots:[origin,{...next,remaining:0}]},
  {...model,slots:[origin,{...next,remaining:3}]},
  {...model,slots:[origin,{...next,when:'2026-01-01 10:00'}]},
  {...model,slots:[origin,{...next,when:'2027-02-30 10:00'}]},
  {...model,slots:[origin,next,next]},
  {...model,b02:{sessions:{'SIM-SLOT-E1-B':{status:'CANCELLED'}}}}
 ];
 for(const bad of reject)
  assert.equal(ctx.v08Plan_(bad,app,'MOVE','SIM-SLOT-E1-B'),null);
 assert.equal(ctx.v08Plan_(model,{...app,phase:'CANCELLED'},'MOVE','SIM-SLOT-E1-B'),null);
 assert.equal(ctx.v08Plan_(model,{...app,eligible:false},'CANCEL',null),null);
 assert.equal(ctx.v08Plan_(model,{...app,experiment:'E2'},'CANCEL',null),null);
 assert.equal(ctx.v08Plan_(model,app,'DELETE',null),null);
 safe=false;
 assert.equal(ctx.v08Plan_(model,app,'CANCEL',null),null,'closed/unauthorized test-only source must fail');
});

test('V08 pure TEST two-minute review TTL has an exact non-inclusive boundary and rejects backward or malformed clocks',()=>{
 const vm=require('node:vm');
 const begin=html.indexOf('function v08Fresh_('),
  end=html.indexOf('function v08Matches_(',begin);
 assert.ok(begin>=0&&end>begin,'expiry guard must be present in the original owner-only visitor UI');
 const ctx=vm.createContext({Number});
 vm.runInContext(html.slice(begin,end),ctx,{timeout:1000});
 const fresh=ctx.v08Fresh_;
 const draft={preparedAt:1000000};
 assert.equal(fresh(draft,1000000),true,'creation moment is fresh');
 assert.equal(fresh(draft,1119999),true,'last millisecond before cutoff is fresh');
 assert.equal(fresh(draft,1120000),false,'exact 120-second cutoff is expired');
 assert.equal(fresh(draft,1120001),false);
 assert.equal(fresh(draft,999999),false,'clock rollback invalidates review');
 for(const bad of [{preparedAt:-1},{preparedAt:NaN},{preparedAt:'1000000'},
  {preparedAt:Number.MAX_SAFE_INTEGER+1},null])
  assert.equal(fresh(bad,1000000),false);
 for(const bad of [NaN,Infinity,-Infinity,'1000000',Number.MAX_SAFE_INTEGER+1])
  assert.equal(fresh(draft,bad),false);
});
test('V08 expiry protection remains client-only and cannot authorize the unmerged Draft #90 email capability',()=>{
 assert.match(html,/function v08Fresh_\(draft,now\)/);
 assert.match(html,/now-draft\.preparedAt<120000/);
 assert.match(html,/preparedAt:?[ ,]?/);
 assert.match(html,/本頁核對預覽僅有效2分鐘/);
 assert.match(html,/v08Clear_\('確認預覽已逾期/);
 assert.doesNotMatch(html,/study1V08Guard_|study1V08ConsumeAtomic_|STUDY1_V08_ENABLED_|localStorage|MailApp|GmailApp/);
});
