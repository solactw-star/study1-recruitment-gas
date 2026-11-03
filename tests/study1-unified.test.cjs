'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const crypto=require('node:crypto');
const fixtureUtilities={Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(payload,secret)=>[...crypto.createHmac('sha256',secret).update(payload,'utf8').digest()].map(b=>b>127?b-256:b)};
const gasDir=path.join(__dirname,'../gas');
const src=fs.readFileSync(path.join(gasDir,'OtpCore.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'BookingCore.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'OtpThrottle.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'OtpTransaction.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'BookingHoldTransaction.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'Study1FixtureAdapter.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'AdminSandbox.js'),'utf8')+'\n'+fs.readFileSync(path.join(gasDir,'Study1Unified.js'),'utf8');
const html=fs.readFileSync(path.join(gasDir,'Study1Unified.html'),'utf8');
function setup({active='solac.tw@gmail.com',effective='solac.tw@gmail.com',open='false',consent='false'}={}){
 const p=new Map([['OPEN',open],['CONSENT_READY',consent]]);let writes=0,deletes=0;let held=false,locks=0;
 const props={getProperty:k=>p.has(k)?p.get(k):null,setProperty:(k,v)=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');p.set(k,v);writes++;},deleteProperty:k=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');p.delete(k);deletes++;}};
 const lock={tryLock:()=>{assert.equal(held,false);held=true;locks++;return true;},releaseLock:()=>{assert.equal(held,true);held=false;},hasLock:()=>held};
 const ctx=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>lock},Utilities:fixtureUtilities,Date,JSON,Number,String,Object,Array,Set,Map,Error
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
 return {p,ctx,read,cmd,get writes(){return writes},get deletes(){return deletes},get locks(){return locks},get held(){return held}};
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
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'}),/閱覽紀錄/);
 m=s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_APPROVAL_E1',sha256:''});
 assert.ok(m.applications[0].consentReviewedAt);
 m=s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'});
 assert.equal(m.applications[0].phase,'CONSENTED');
 m=s.cmd('CONFIRM',{id:'SIM-001'});assert.equal(m.applications[0].phase,'CONFIRMED');
 assert.equal(m.notifications.length,1);assert.match(m.notifications[0].text,/未寄送/);
 m=s.cmd('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'});
 assert.equal(m.slots[0].remaining,2);assert.equal(m.slots[1].remaining,1);
 m=s.cmd('CANCEL',{id:'SIM-001'});
 assert.equal(m.slots[1].remaining,2);assert.equal(m.applications[0].phase,'CANCELLED');
 assert.equal(s.writes,10);assert.equal(s.p.size,3);assert.equal(s.p.get('OPEN'),'false');
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
 m=s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_E1_REV2',sha256:'a'.repeat(64)});
 assert.ok(m.applications[0].consentReviewedAt);
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

test('Synthetic consent review binds held version and hash, never substitutes for a real REC PDF',()=>{
 const s=setup();
 s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 const before=s.read().revision;
 assert.throws(()=>s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_OTHER',sha256:''}),/版本核對/);
 assert.equal(s.read().revision,before);
 assert.throws(()=>s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'}),/閱覽紀錄/);
 const m=s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_APPROVAL_E1',sha256:''});
 assert.ok(Number.isFinite(m.applications[0].consentReviewedAt));
 assert.deepEqual(m.audit.at(-1).action,'CONSENT_REVIEW');
 assert.equal(s.read().policy.consent.E1.approval,'PENDING');
});
test('Owner-edited notification template drives SAME workflow, without sending mail',()=>{
 const s=setup();s.cmd('ADMIN_EDIT',{title:'SIM',notice:'TEST',emailTemplate:'自訂 SIM 通知模板'});
 s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_APPROVAL_E1',sha256:''});
 s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'});
 const m=s.cmd('CONFIRM',{id:'SIM-001'});
 assert.match(m.notifications[0].text,/自訂 SIM 通知模板/);
 assert.match(m.notifications[0].text,/未寄送/);
 assert.equal(s.p.size,3);
});
test('Owner can reset ONLY dedicated unified fixture after exact confirmation and revision check',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 const before=s.read().revision;
 assert.throws(()=>s.cmd('ADMIN_RESET',{confirmation:'WRONG'}),/完整確認字串/);
 assert.throws(()=>s.cmd('ADMIN_RESET',{confirmation:'RESET_SIM_FIXTURE_ONLY'},0),/版本已變更/);
 assert.equal(s.read().revision,before);
 const m=s.cmd('ADMIN_RESET',{confirmation:'RESET_SIM_FIXTURE_ONLY'});
 assert.equal(m.reset,true);assert.equal(m.revision,0);assert.equal(m.applications.length,0);
 assert.equal(s.deletes,1);assert.equal(s.p.size,2);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
 assert.equal(s.held,false);
 const restarted=s.cmd('START',{experiment:'E2'});
 assert.equal(restarted.applications[0].id,'SIM-001');
});

test('Owner edits E1/E2 draft research copy used by the SAME participant view; provenance remains PENDING',()=>{
 const s=setup(),before=s.read();
 const research=Object.fromEntries(['E1','E2'].map(exp=>[exp,{
  label:'〔SIM〕'+exp+' 新標題',duration:'測試時長 60 分鐘',
  procedure:'僅供測試的研究步驟',compensation:'虛構補貼文字'}]));
 const m=s.cmd('ADMIN_RESEARCH',{research});
 assert.equal(m.definitions.E1.label,'〔SIM〕E1 新標題');
 assert.equal(m.definitions.E2.procedure,'僅供測試的研究步驟');
 assert.equal(m.researchSource,'REC_DRAFT_ONLY');
 assert.equal(m.researchApproval,'PENDING');
 assert.equal(m.definitions.E1.recVersion,before.definitions.E1.recVersion);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
 assert.equal(s.p.size,3);
 assert.equal(m.audit.at(-1).action,'ADMIN_RESEARCH');
});
test('Draft research editor rejects markup, missing fields and unreviewed provenance without mutating fixture',()=>{
 const s=setup(),r=s.read().definitions;
 const research=Object.fromEntries(['E1','E2'].map(exp=>[exp,
  Object.fromEntries(['label','duration','procedure','compensation'].map(k=>[k,r[exp][k]]))]));
 const revision=s.read().revision;
 assert.throws(()=>s.cmd('ADMIN_RESEARCH',{research:{E1:research.E1}}),/草稿欄位/);
 assert.throws(()=>s.cmd('ADMIN_RESEARCH',{research:{...research,E2:{...research.E2,label:'<script>'}}}),/欄位不合法/);
 assert.throws(()=>s.cmd('ADMIN_RESEARCH',{research:{...research,E2:{...research.E2,extra:'x'}}}),/欄位不合法/);
 assert.throws(()=>s.ctx.study1UnifiedValidateResearch_({...research,source:'APPROVED',approval:'APPROVED'}),/草稿來源/);
 assert.equal(s.read().revision,revision);assert.equal(s.writes,0);
});
test('Legacy owner-only fixture receives draft research defaults on read without a migration write',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 const stored=JSON.parse(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'));
 delete stored.research;
 s.p.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(stored));
 const before=s.writes,m=s.read();
 assert.equal(s.writes,before);
 assert.equal(m.definitions.E1.label,'實驗一｜記憶與內感覺');
 assert.equal(m.researchApproval,'PENDING');
 s.cmd('START',{experiment:'E2'});
 assert.equal(JSON.parse(s.p.get('STUDY1_UNIFIED_FIXTURE_V1')).research.source,'REC_DRAFT_ONLY');
});

// Integrated recovery of synthetic reservations and expired consent locks.
test('Expired synthetic hold can be renewed with fresh capacity and cleared consent metadata',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_APPROVAL_E1',sha256:''});
 s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'});
 const old=JSON.parse(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'));
 old.applications[0].holdUntil=Date.now()-1000;
 s.p.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(old));
 assert.equal(s.read().applications[0].holdExpired,true);
 assert.equal(s.read().slots[0].remaining,2);
 assert.throws(()=>s.cmd('CANCEL',{id:'SIM-001'}),/只有有效/);
 assert.throws(()=>s.cmd('CONFIRM',{id:'SIM-001'}),/期限/);
 const m=s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 assert.equal(m.applications[0].phase,'HELD');
 assert.equal(m.applications[0].holdExpired,false);
 assert.equal(m.applications[0].consentReviewedAt,null);
 assert.equal(m.applications[0].signatureDemo,false);
 assert.ok(m.applications[0].holdUntil>Date.now());
 assert.equal(m.slots[0].remaining,1);
 assert.equal(s.p.get('OPEN'),'false');
 assert.equal(s.p.get('CONSENT_READY'),'false');
});
test('Unified booking never offers or reserves past Taipei-local synthetic slots',()=>{
 const s=setup(),slots=s.read().slots.map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}));
 slots[0].when='2020-01-05 10:00';
 s.cmd('ADMIN_SLOTS',{slots});
 assert.equal(s.read().slots[0].bookable,false);
 assert.equal(s.read().slots[0].remaining,0);
 s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 const rev=s.read().revision;
 assert.throws(()=>s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'}),/已開始/);
 assert.equal(s.read().revision,rev);
 const m=s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'});
 assert.equal(m.applications[0].phase,'HELD');
});

test('The unified E1/E2 TEST flow executes the existing pure BookingCore and OtpCore under a locked fake adapter',()=>{
 const s=setup();
 assert.equal(typeof s.ctx.bookingComputeAvailability_,'function');
 assert.equal(typeof s.ctx.otpEvaluateVerification_,'function');
 s.cmd('START',{experiment:'E1'});
 s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});
 const m=s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 assert.equal(m.applications[0].phase,'VERIFIED');
 let status=s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 const sim=s.ctx.study1UnifiedRead_();
 const rows=s.ctx.study1UnifiedCoreAvailability_(sim,Date.now());
 assert.equal(rows.find(row=>row.slotId==='SIM-SLOT-E1-A').remaining,1);
 assert.equal(status.slots.find(row=>row.id==='SIM-SLOT-E1-A').remaining,1);
 assert.equal(s.ctx.study1UnifiedCoreOtpDecision_(sim.applications[0],'12345678',Date.now()).reason,'INVALID');
 assert.equal(s.p.get('OPEN'),'false');
 assert.equal(s.p.get('CONSENT_READY'),'false');
 assert.equal(s.held,false);
});
test('A malformed kernel row rejects every synthetic slot rather than guessing availability',()=>{
 const s=setup(),fixture=s.ctx.study1UnifiedInitial_();
 fixture.slots[0].capacity=0;
 assert.throws(()=>s.ctx.study1UnifiedCoreAvailability_(fixture,Date.now()),/容量不合法/);
 assert.equal(s.writes,0);
});

test('All formal-site adapter ports reject until REC/data approval, without touching real resources',()=>{
 const s=setup();
 const a=s.ctx.study1UnifiedProductionAdapter_();
 assert.equal(a.mode,'FORMAL_BLOCKED');
 assert.equal(a.approved,false);
 assert.equal(a.source,'PENDING_REC_AND_DATA_APPROVAL');
 assert.equal(Object.isFrozen(a),true);
 for(const name of ['read','readParticipant','lookupEligibility','writeParticipant',
  'requestOtp','verifyOtp','listSlots','holdSlot','confirmBooking',
  'rescheduleBooking','cancelBooking','readConsent','submitConsent',
  'sendNotification','exportAudit','deleteParticipant']){
  assert.equal(typeof a[name],'function',name);
  assert.throws(()=>a[name]({id:'SIM-001'}),/尚未核准/);
 }
 assert.equal(s.writes,0);
 assert.deepEqual([...s.p.keys()].sort(),['CONSENT_READY','OPEN']);
});

test('Versioned E1/E2 screening stores only eligibility and locked draft source',()=>{
 const s=setup(),m=JSON.parse(JSON.stringify(s.read().policy.screening.mappings));
 m.E1.rules.frequentPractice=null;
 assert.throws(()=>s.cmd('ADMIN_SCREENING',{mappings:m}),/更新 PENDING 版本/);
 m.E1.version='PENDING_E1_RULES_V2';s.cmd('ADMIN_SCREENING',{mappings:m});
 const policy=s.read().policy;
 s.cmd('ADMIN_POLICY',{questions:policy.screening.questions,consent:{
  E1:{version:policy.consent.E1.version,sha256:policy.consent.E1.sha256},
  E2:{version:policy.consent.E2.version,sha256:policy.consent.E2.sha256}}});
 assert.equal(s.read().policy.screening.mappings.E1.version,'PENDING_E1_RULES_V2');
 s.cmd('START',{experiment:'E1'});
 let v=s.cmd('SCREEN',{id:'SIM-001',answers:{...good,frequentPractice:true}});
 assert.equal(v.applications[0].phase,'SCREENED');
 assert.equal(v.applications[0].screeningVersion,'PENDING_E1_RULES_V2');
 assert.doesNotMatch(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'),/"answers"|"frequentPractice":true/);
 m.E1.rules.frequentPractice=false;m.E1.version='PENDING_E1_RULES_V3';
 v=s.cmd('ADMIN_SCREENING',{mappings:m});
 assert.equal(v.applications[0].screeningVersion,'PENDING_E1_RULES_V2');
 s.cmd('START',{experiment:'E1'});
 v=s.cmd('SCREEN',{id:'SIM-002',answers:{...good,frequentPractice:true}});
 assert.equal(v.applications[1].phase,'INELIGIBLE');
 assert.equal(v.applications[1].screeningVersion,'PENDING_E1_RULES_V3');
 m.E2.rules.joinedE1=null;
 assert.throws(()=>s.cmd('ADMIN_SCREENING',{mappings:m}),/最低安全條件/);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
});
test('Simulated notification failure and retry never enable formal sending',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 s.cmd('CONSENT_REVIEW',{id:'SIM-001',version:'PENDING_REC_APPROVAL_E1',sha256:''});
 s.cmd('CONSENT',{id:'SIM-001',accepted:true,version:'PENDING_REC_APPROVAL_E1',signature:'SIMULATED_SIGN_ONLY'});
 let v=s.cmd('CONFIRM',{id:'SIM-001'});assert.equal(v.notifications[0].status,'SIM_PENDING');
 v=s.cmd('ADMIN_NOTIFY_ATTEMPT',{index:0,result:'FAIL'});
 assert.equal(v.notifications[0].status,'SIM_FAILED');assert.equal(v.notifications[0].attempts,1);
 v=s.cmd('ADMIN_NOTIFY_ATTEMPT',{index:0,result:'SIM_OK'});
 assert.equal(v.notifications[0].status,'SIM_DELIVERED');assert.equal(v.notifications[0].attempts,2);
 assert.throws(()=>s.cmd('ADMIN_NOTIFY_ATTEMPT',{index:0,result:'SIM_OK'}),/已完成/);
 assert.equal(s.read().policy.notification.status,'DISABLED');
 assert.equal(s.read().policy.retention.status,'PENDING');
 assert.deepEqual([...s.p.keys()].sort(),['CONSENT_READY','OPEN','STUDY1_UNIFIED_FIXTURE_V1']);
});
