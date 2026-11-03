'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const gasDir=path.join(__dirname,'../gas');
const src=fs.readFileSync(path.join(gasDir,'AdminSandbox.js'),'utf8')+'\n'+fs.readFileSync(path.join(gasDir,'Study1Unified.js'),'utf8');
const html=fs.readFileSync(path.join(gasDir,'Study1Unified.html'),'utf8');
function setup({active='solac.tw@gmail.com',effective='solac.tw@gmail.com',open='false',consent='false'}={}){
 const p=new Map([['OPEN',open],['CONSENT_READY',consent]]);let writes=0;let held=false,locks=0;
 const props={getProperty:k=>p.has(k)?p.get(k):null,setProperty:(k,v)=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');p.set(k,v);writes++;},deleteProperty:()=>{throw Error('No deletes in unified workflow');}};
 const lock={tryLock:()=>{assert.equal(held,false);held=true;locks++;return true;},releaseLock:()=>{assert.equal(held,true);held=false;},hasLock:()=>held};
 const ctx=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>lock},Date,JSON,Number,String,Object,Array,Set,Map,Error
 });
 vm.runInContext(src,ctx,{timeout:2000});
 let n=0;
 const read=()=>JSON.parse(JSON.stringify(ctx.study1UnifiedPreviewGet()));
 const cmd=(action,payload,rev,requestId)=>{
  const r=rev??read().revision;
  return JSON.parse(JSON.stringify(ctx.study1UnifiedPreviewCommand({
   action,payload,expectedRevision:r,requestId:requestId||'REQ-SIM-TEST'+String(++n).padStart(6,'0')
  })));
 };
 return {p,ctx,read,cmd,get writes(){return writes},get locks(){return locks},get held(){return held}};
}
const good={adult:true,cycu:true,diagnosed:false,treatment:false,frequentPractice:false,joinedE1:false};
test('Production recruitment remains unavailable; only owner-locked TEST fixture flow exists',()=>{
 const s=setup(),m=s.read();
 assert.equal(m.mode,'TEST');assert.equal(m.open,false);assert.equal(m.consentReady,false);
 assert.equal(m.formalApproval,'PENDING');
 assert.equal(m.applications.length,0);assert.equal(m.slots.length,4);
 assert.equal(s.writes,0);assert.equal(s.p.size,2);
 assert.match(m.definitions.E2.procedure,/8 週/);
 assert.match(m.definitions.E1.procedure,/單次/);
 assert.equal(s.held,false);
});
test('Experiment 1 complete participant-shaped flow uses synthetic OTP, slot, consent version and notification only',()=>{
 const s=setup();
 let m=s.cmd('START',{experiment:'E1'});assert.equal(m.applications[0].id,'SIM-001');
 m=s.cmd('SCREEN',{id:'SIM-001',answers:good});assert.equal(m.applications[0].phase,'SCREENED');
 m=s.cmd('OTP_REQUEST',{id:'SIM-001'});assert.equal(m.applications[0].phase,'OTP_SENT');
 m=s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});assert.equal(m.applications[0].phase,'VERIFIED');
 m=s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 assert.equal(m.applications[0].phase,'HELD');assert.equal(m.slots[0].remaining,1);
 m=s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'});
 assert.equal(m.applications[0].phase,'CONSENTED');
 m=s.cmd('CONFIRM',{id:'SIM-001'});assert.equal(m.applications[0].phase,'CONFIRMED');
 assert.equal(m.notifications.length,1);assert.match(m.notifications[0].text,/不會發送/);
 m=s.cmd('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'});
 assert.equal(m.slots[0].remaining,2);assert.equal(m.slots[1].remaining,1);
 m=s.cmd('CANCEL',{id:'SIM-001'});
 assert.equal(m.slots[1].remaining,2);assert.equal(m.applications[0].phase,'CANCELLED');
 assert.equal(s.writes,9);assert.equal(s.p.size,3);assert.equal(s.p.get('OPEN'),'false');
 assert.equal(s.p.get('CONSENT_READY'),'false');assert.equal(s.held,false);
 assert.deepEqual([...s.p.keys()].sort(),['CONSENT_READY','OPEN','STUDY1_UNIFIED_FIXTURE_V1']);
});
test('Experiment 2 eligibility rejects prior E1 participation and still permits a separate eligible test case',()=>{
 const s=setup();
 s.cmd('START',{experiment:'E2'});
 let m=s.cmd('SCREEN',{id:'SIM-001',answers:{...good,joinedE1:true}});
 assert.equal(m.applications[0].phase,'INELIGIBLE');
 assert.throws(()=>s.cmd('OTP_REQUEST',{id:'SIM-001'}),/尚未符合/);
 s.cmd('START',{experiment:'E2'});
 m=s.cmd('SCREEN',{id:'SIM-002',answers:good});
 assert.equal(m.applications[1].phase,'SCREENED');
 s.cmd('OTP_REQUEST',{id:'SIM-002'});
 s.cmd('OTP_VERIFY',{id:'SIM-002',code:'00000000'});
 m=s.cmd('HOLD',{id:'SIM-002',slotId:'SIM-SLOT-E2-A'});
 assert.equal(m.applications[1].phase,'HELD');
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-002',accepted:true,
  version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'}),/版本/);
 assert.equal(s.read().applications[1].phase,'HELD');
});
test('OTP wrong codes are counted, retry limits apply, and never generate a real email',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});s.cmd('OTP_REQUEST',{id:'SIM-001'});
 for(let i=1;i<=5;i++){
  const m=s.cmd('OTP_VERIFY',{id:'SIM-001',code:'12345678'});
  assert.equal(m.applications[0].otpAttempts,i);assert.equal(m.applications[0].phase,'OTP_SENT');
 }
 assert.throws(()=>s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'}),/過期或超過/);
 assert.equal(s.read().applications[0].otpAttempts,5);
 assert.equal(s.held,false);
});
test('Revision rejection, same-request idempotency and changed fingerprints preserve state',()=>{
 const s=setup(),first=s.cmd('START',{experiment:'E1'},0,'REQ-SIM-IDEMP0001');
 assert.equal(first.revision,1);
 const old=s.writes;
 const again=s.cmd('START',{experiment:'E1'},0,'REQ-SIM-IDEMP0001');
 assert.equal(again.deduplicated,true);assert.equal(s.writes,old);
 assert.throws(()=>s.cmd('START',{experiment:'E2'},0,'REQ-SIM-IDEMP0001'),/不同操作/);
 assert.throws(()=>s.cmd('START',{experiment:'E2'},0,'REQ-SIM-IDEMP0002'),/版本已變更/);
 assert.equal(s.read().applications.length,1);assert.equal(s.writes,old);
});
test('Capacity, experiment boundaries, false consent and malformed screen are fail-closed',()=>{
 const s=setup();
 for(let i=0;i<3;i++){
  const id='SIM-'+String(i+1).padStart(3,'0');
  s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id,answers:good});
  s.cmd('OTP_REQUEST',{id});s.cmd('OTP_VERIFY',{id,code:'00000000'});
  if(i<2)s.cmd('HOLD',{id,slotId:'SIM-SLOT-E1-A'});
 }
 const rev=s.read().revision;
 assert.throws(()=>s.cmd('HOLD',{id:'SIM-003',slotId:'SIM-SLOT-E1-A'}),/額滿/);
 assert.throws(()=>s.cmd('HOLD',{id:'SIM-003',slotId:'SIM-SLOT-E2-A'}),/時段不存在/);
 assert.throws(()=>s.cmd('HOLD',{id:'SIM-002',slotId:'SIM-SLOT-E1-B'}),/尚未完成/);
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'REAL NAME'}),/簽署不符/);
 assert.equal(s.read().revision,rev);
});
test('Owner TEST configuration is shared with participant UI, not formal Sheets or other script properties',()=>{
 const s=setup();
 const m=s.cmd('ADMIN_EDIT',{title:'〔測試〕統一研究網站',notice:'僅為虛構模式',
  emailTemplate:'〔測試〕確認通知，不寄信'});
 assert.equal(m.config.title,'〔測試〕統一研究網站');
 assert.equal(s.read().config.emailTemplate,'〔測試〕確認通知，不寄信');
 assert.throws(()=>s.cmd('ADMIN_EDIT',{title:'<script>',notice:'',emailTemplate:''}),/格式錯誤/);
});
test('Non-owner or missing closed flags fail before any read/write',()=>{
 for(const opts of [{active:''},{effective:'other@example.test'},{open:'true'},{consent:'true'}]){
  const s=setup(opts);assert.throws(()=>s.read(),/拒絕存取|旗標/);assert.equal(s.writes,0);assert.equal(s.locks,0);
  assert.throws(()=>s.cmd('START',{experiment:'E1'},0),/拒絕存取|旗標/);
  assert.equal(s.writes,0);
 }
});
test('Unified HTML is a complete user journey in one owner-only interface with no real data collection code',()=>{
 assert.match(html,/<!doctype html>/i);
 for(const stage of ['步驟一','步驟二','步驟三','步驟四','步驟五','步驟六','研究室後台']){
  assert.ok(html.includes(stage),'Missing '+stage);
 }
 assert.match(html,/study1UnifiedPreviewGet\(\)/);
 assert.match(html,/study1UnifiedPreviewCommand\(envelope\)/);
 assert.match(html,/SIMULATED_SIGN_ONLY/);
 assert.match(html,/不寄送電子郵件/);
 assert.match(html,/@media\(max-width:700px\)/);
 assert.doesNotMatch(html,/<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\bfetch\s*\(|\blocalStorage\b/i);
 assert.doesNotMatch(html,/<input[^>]+type="email"/i);
 assert.match(html,/正式報名未開放/);
});

test('Synthetic request audit never persists screening answers or plaintext OTP',()=>{
 const sim=setup();
 sim.cmd('START',{experiment:'E1'});
 sim.cmd('SCREEN',{id:'SIM-001',answers:good});
 sim.cmd('OTP_REQUEST',{id:'SIM-001'});
 sim.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 const raw=sim.p.get('STUDY1_UNIFIED_FIXTURE_V1');
 assert.ok(typeof raw==='string');
 const stored=JSON.parse(raw);
 // Policy schema contains question KEYS by design; no per-applicant answers are stored.
 assert.doesNotMatch(JSON.stringify({applications:stored.applications,requests:stored.requests}),/"diagnosed"|"frequentPractice"|"treatment"|"joinedE1"/);
 assert.doesNotMatch(raw,/00000000/);
 assert.match(raw,/"eligible":true/);
});

test('Unified owner admin edits synthetic slot capacity with occupancy and historical reference guards',()=>{
 const s=setup(),slots=s.read().slots.map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}));
 let m=s.cmd('ADMIN_SLOTS',{slots:[...slots,{id:'SIM-SLOT-E1-C',experiment:'E1',when:'2027-01-10 11:30',capacity:2}]});
 assert.equal(m.slots.length,5);assert.equal(m.audit.at(-1).action,'ADMIN_SLOTS');
 s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-C'});
 assert.throws(()=>s.cmd('ADMIN_SLOTS',{slots}),/歷史預約/);
 assert.throws(()=>s.cmd('ADMIN_SLOTS',{slots:[...slots,{id:'SIM-SLOT-E1-C',experiment:'E1',when:'2027-01-11 11:30',capacity:2}]}),/歷史預約/);
 assert.equal(s.read().slots.length,5);
});
test('Pending REC versions and question labels are editable but held consent stays pinned',()=>{
 const s=setup(),p=s.read().policy;
 const questions={...p.screening.questions,adult:'模擬：成年者'};
 const consent={E1:{version:'PENDING_REC_E1_REV2',sha256:'a'.repeat(64)},
 E2:{version:p.consent.E2.version,sha256:''}};
 let m=s.cmd('ADMIN_POLICY',{questions,consent});
 assert.equal(m.policy.screening.questions.adult,'模擬：成年者');
 assert.equal(m.policy.consent.E1.approval,'PENDING');
 assert.equal(m.policy.retention.status,'PENDING');
 s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 m=s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 assert.equal(m.applications[0].consentVersion,'PENDING_REC_E1_REV2');
 assert.equal(m.applications[0].consentSha256,'a'.repeat(64));
 assert.throws(()=>s.cmd('ADMIN_POLICY',{questions,consent:{...consent,E1:{version:'PENDING_REC_E1_REV3',sha256:''}}}),/版本鎖定/);
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'}),/版本/);
 m=s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_E1_REV2',signature:'SIMULATED_SIGN_ONLY'});
 assert.equal(m.applications[0].phase,'CONSENTED');
 m=s.cmd('CONFIRM',{id:'SIM-001'});
 m=s.cmd('ADMIN_POLICY',{questions,consent:{...consent,E1:{version:'PENDING_REC_E1_REV3',sha256:'b'.repeat(64)}}});
 assert.equal(m.applications[0].consentVersion,'PENDING_REC_E1_REV2');
 assert.equal(m.applications[0].consentSha256,'a'.repeat(64));
 assert.equal(m.policy.consent.E1.sha256,'b'.repeat(64));
 assert.throws(()=>s.ctx.study1UnifiedProductionAdapter_().writeParticipant(),/尚未核准/);
 assert.doesNotMatch(JSON.stringify(m.audit),/00000000|diagnosed|frequentPractice/);
});

test('Legacy synthetic hold missing PDF hash cannot be silently treated as newly pinned',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 const raw=JSON.parse(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'));
 delete raw.applications[0].consentSha256; // Historical owner-only fixture, not a participant record.
 s.p.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(raw));
 assert.equal(s.read().applications[0].consentSha256,null);
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-001',accepted:true,
  version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'}),/雜湊/);
 assert.equal(s.read().applications[0].phase,'HELD');
});
