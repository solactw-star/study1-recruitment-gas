'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const toBuffer=v=>typeof v==='string'?Buffer.from(v,'utf8'):Buffer.from(v.map(n=>n&255));
const newBlob=v=>({getBytes:()=>[...toBuffer(v)].map(n=>n>127?n-256:n),
 getDataAsString:()=>toBuffer(v).toString('utf8')});
const fixtureUtilities={
 newBlob:v=>newBlob(v),
 gzip:b=>newBlob(zlib.gzipSync(toBuffer(b.getBytes()))),
 ungzip:b=>newBlob(zlib.gunzipSync(toBuffer(b.getBytes()))),
 base64Encode:bytes=>toBuffer(bytes).toString('base64'),
 Charset:{UTF_8:'UTF-8'},
 DigestAlgorithm:{SHA_256:'SHA_256'},
 base64Decode:b64=>[...Buffer.from(b64,'base64')].map(b=>b>127?b-256:b),
 computeDigest:(alg,bytes)=>{assert.equal(alg,'SHA_256');
  return [...crypto.createHash('sha256')
   .update(Buffer.from(bytes.map(x=>x<0?x+256:x))).digest()].map(b=>b>127?b-256:b);},
 computeHmacSha256Signature:(payload,secret)=>[...crypto.createHmac('sha256',secret)
  .update(payload,'utf8').digest()].map(b=>b>127?b-256:b)
};
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
 const props={getProperty:k=>p.has(k)?p.get(k):null,setProperty:(k,v)=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B01_OWNER_LAYOUT_V1'].includes(k));p.set(k,v);writes++;},deleteProperty:k=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B01_OWNER_LAYOUT_V1'].includes(k));p.delete(k);deletes++;}};
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

test('Byte-verified synthetic PDF and owner governance expose NO approved REC document',()=>{
 const s=setup(),state=s.read(),f=state.pdfFixture;
 assert.equal(f.kind,'SIMULATED_PDF_NOT_REC');
 assert.equal(f.approved,false);assert.equal(f.mime,'application/pdf');
 const bytes=Buffer.from(f.base64,'base64');
 assert.equal(bytes.length,615);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
  '82e8b20b8d0849f5482a94f1f8adf1e3c3bf1d41b45c33ab48dbd4481fe72ad1');
 assert.equal(state.governance.approval,'PENDING');
 assert.equal(state.governance.publicIntake,'DISABLED');
 assert.equal(state.governance.retention.days,null);
 assert.equal(state.governance.subjectExport,'FORMAL_BLOCKED');
 assert.equal(state.governance.documents.E1.formalPdfAvailable,false);
 assert.equal(state.governance.documents.E1.sourceBytesVerified,false);
 assert.equal(s.writes,0,'Read-only PDF/governance must never persist');
});
test('Synthetic PDF review records only demo metadata while REC consent remains PENDING',()=>{
 const s=setup();
 s.cmd('START',{experiment:'E1'});
 assert.throws(()=>s.cmd('PDF_DEMO_REVIEW',{id:'SIM-001',sha256:s.read().pdfFixture.sha256}),/有效暫留/);
 s.cmd('SCREEN',{id:'SIM-001',answers:good});
 s.cmd('OTP_REQUEST',{id:'SIM-001'});
 s.cmd('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 s.cmd('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 const bad=s.read().revision;
 assert.throws(()=>s.cmd('PDF_DEMO_REVIEW',{id:'SIM-001',sha256:'0'.repeat(64)}),/完整雜湊/);
 assert.equal(s.read().revision,bad);
 const f=s.read().pdfFixture;
 let result=s.cmd('PDF_DEMO_REVIEW',{id:'SIM-001',sha256:f.sha256});
 assert.ok(result.applications[0].pdfDemoReviewedAt);
 assert.equal(result.applications[0].consentReviewedAt,null);
 assert.equal(result.governance.documents.E1.approved,false);
 assert.equal(result.governance.documents.E1.formalPdfAvailable,false);
 assert.throws(()=>s.cmd('PDF_DEMO_REVIEW',{id:'SIM-001',sha256:f.sha256}),/有效暫留/);
 assert.doesNotMatch(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'),/JVBERi0xLjQ/);
 assert.equal(s.p.get('OPEN'),'false');
 assert.equal(s.p.get('CONSENT_READY'),'false');
});
test('Synthetic PDF byte mismatch causes fail-closed read with zero writes',()=>{
 const s=setup(),prev=s.writes;
 const orig=s.ctx.Utilities.computeDigest;
 s.ctx.Utilities.computeDigest=()=>new Array(32).fill(0);
 assert.throws(()=>s.read(),/SHA-256 驗證失敗/);
 assert.equal(s.writes,prev);
 s.ctx.Utilities.computeDigest=orig;
 assert.equal(s.read().pdfFixture.kind,'SIMULATED_PDF_NOT_REC');
});

test('Formal readiness is a complete, source-provenance checklist with every real port blocked',()=>{
 const s=setup(),m=s.read(),r=m.formalReadiness;
 assert.equal(r.mode,'FORMAL_BLOCKED');
 assert.equal(r.activationAllowed,false);assert.equal(r.passed,0);
 assert.equal(r.total,16);assert.equal(r.gates.length,16);
 assert.equal(r.gates.find(g=>g.id==='E2_EIGHT_WEEK_PLAN_APPROVAL').state,'PENDING');
 assert.equal(r.gates.find(g=>g.id==='FORMAL_DATA_PORT_AUTHORIZATION').state,'BLOCKED');
 assert.equal(r.gates.find(g=>g.id==='E1_REC_PDF_BYTES').state,'BLOCKED');
 assert.equal(r.gates.find(g=>g.id==='E2_SCREENING_SOURCE').state,'PENDING');
 assert.equal(r.provenance.E1.sourceBytesVerified,false);
 assert.equal(r.provenance.E2.recApprovalVerified,false);
 assert.equal(r.notificationPolicy.channel,'DISABLED');
 assert.deepEqual([...r.notificationPolicy.sendOnlyAfter],
  ['CONFIRM_COMMITTED','MOVE_COMMITTED','CANCEL_COMMITTED']);
 assert.equal(r.storagePolicy.formalWrite,'DENIED');
 assert.equal(s.writes,0);assert.equal(s.p.size,2);
});
test('Owner-supplied draft PDF SHA and screening version never unlock a formal gate',()=>{
 const s=setup(),initial=s.read(),consent={};
 for(const exp of ['E1','E2'])consent[exp]={
  version:'PENDING_'+exp+'_DRAFT_V2',sha256:'a'.repeat(64)};
 s.cmd('ADMIN_POLICY',{questions:initial.policy.screening.questions,consent});
 const m=s.read(),r=m.formalReadiness;
 assert.equal(r.provenance.E1.declaredSha256,'a'.repeat(64));
 assert.equal(r.provenance.E2.recVersion,'PENDING_E2_DRAFT_V2');
 assert.equal(r.provenance.E1.sourceBytesVerified,false);
 assert.equal(r.provenance.E1.sourceVersionVerified,false);
 assert.equal(r.activationAllowed,false);assert.equal(r.passed,0);
 assert.equal(r.gates.find(g=>g.id==='E1_REC_PDF_BYTES').state,'BLOCKED');
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
});

test('Owner-only GAS whole-site in-memory acceptance uses same E1/E2 kernels with zero writes',()=>{
 const s=setup(),before=s.read(),writes=s.writes,deletes=s.deletes;
 const r=JSON.parse(JSON.stringify(s.ctx.study1UnifiedPreviewSelfTest()));
 assert.equal(r.ok,true);assert.equal(r.mode,'OWNER_ONLY_IN_MEMORY');
 assert.equal(r.formalMode,'FORMAL_BLOCKED');assert.equal(r.persistentWrites,0);
 assert.ok(r.passed>=14);assert.equal(r.failed,0);
 assert.ok(r.checks.includes('E1_CONFIRM'));assert.ok(r.checks.includes('E2_EXCLUSION'));
 assert.ok(r.checks.includes('FORMAL_ADAPTER_DENIED'));
 assert.equal(s.writes,writes);assert.equal(s.deletes,deletes);
 const after=s.read();
 // Queue asOf is a READ-ONLY server timestamp; time may elapse during a zero-write self test.
 assert.ok(Number.isSafeInteger(after.waitlist.asOf)&&after.waitlist.asOf>=before.waitlist.asOf);
 assert.deepEqual({...after,waitlist:{...after.waitlist,asOf:before.waitlist.asOf}},before);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
 assert.equal(s.held,false);
});
test('Whole-site in-memory acceptance rejects non-owner and OPEN flags',()=>{
 for(const opts of [{active:'intruder@example.invalid'},{open:'true'},{consent:'true'}]){
  const s=setup(opts);
  assert.throws(()=>s.ctx.study1UnifiedPreviewSelfTest());
  assert.equal(s.writes,0);assert.equal(s.deletes,0);assert.equal(s.held,false);
 }
});


test('E2 eight-week planning is editable only inside the SAME TEST state with strict chronology',()=>{
 const s=setup();let m=s.read();
 assert.equal(m.e2Operations.mode,'TEST_PLANNING');
 assert.equal(m.e2Operations.plannedWeeks,0);
 assert.equal(m.e2Operations.weeks.length,8);
 assert.equal(s.writes,0);
 const weeks=m.e2Operations.weeks.map((w,i)=>({...w,date:'2027-02-'+String(1+i).padStart(2,'0'),notes:'〔TEST〕行政規劃'}));
 m=s.cmd('ADMIN_E2_WEEKS',{weeks});
 assert.equal(m.e2Operations.plannedWeeks,8);assert.equal(m.e2Operations.weeks[7].date,'2027-02-08');
 assert.equal(m.formalPorts.activated,false);assert.equal(m.formalPorts.ports.every(p=>p.state==='BLOCKED'),true);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
 const before=s.p.get('STUDY1_UNIFIED_FIXTURE_V1'),revision=s.read().revision;
 const outOfOrder=weeks.map(x=>({...x}));outOfOrder[4].date='2027-02-01';
 assert.throws(()=>s.cmd('ADMIN_E2_WEEKS',{weeks:outOfOrder}),/順序重複/);
 const missing=weeks.slice(1);
 assert.throws(()=>s.cmd('ADMIN_E2_WEEKS',{weeks:missing}),/完整八週/);
 const bad=weeks.map(x=>({...x}));bad[1].date='2027-02-30';
 assert.throws(()=>s.cmd('ADMIN_E2_WEEKS',{weeks:bad}),/日期無效/);
 assert.equal(s.read().revision,revision);
 assert.equal(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'),before);
});
test('All formal data/OTP/booking/consent/notice ports are non-activatable and no production access exists',()=>{
 const s=setup(),m=s.read(),p=m.formalPorts;
 assert.equal(p.mode,'FORMAL_BLOCKED');assert.equal(p.activated,false);
 for(const expected of ['IDENTITY_VERIFY','OTP_SEND_REAL','BOOKING_RESERVE',
  'E2_EIGHT_WEEK_OPERATIONS','CONSENT_PDF_READ','CONSENT_SIGN','NOTIFICATION_DISPATCH','SUBJECT_DATA_ACCESS'])
  assert.equal(p.ports.find(port=>port.name===expected).state,'BLOCKED');
 assert.equal(p.pdf.sourceBytesVerified,false);assert.equal(p.pdf.signatureEnabled,false);
 assert.equal(p.notification.realDelivery,false);assert.equal(p.retention.policy,'PENDING');
 for(const op of ['readParticipant','writeParticipant','requestOtp','verifyOtp','holdSlot',
  'submitConsent','sendNotification','deleteParticipant'])
  assert.throws(()=>s.ctx.study1UnifiedProductionAdapter_()[op](),/尚未核准/);
 assert.equal(s.writes,0);
 assert.match(html,/adminE2WeeksJson/);assert.match(html,/formalPortsStatus/);
});

test('2026 experiment 2 is coming soon for the visitor, and team changes never open formal enrollment',()=>{
 const s=setup(),before=s.read();
 assert.equal(before.recruitment.E1.mode,'DEMO_OPEN');
 assert.equal(before.recruitment.E2.mode,'COMING_SOON');
 assert.equal(before.recruitment.E2.year,2027);
 const next=JSON.parse(JSON.stringify(before.recruitment));
 next.E2.mode='DEMO_OPEN';
 const changed=s.cmd('ADMIN_RECRUITMENT',{settings:next});
 assert.equal(changed.recruitment.E2.mode,'DEMO_OPEN');
 assert.equal(changed.open,false);assert.equal(changed.consentReady,false);
 assert.equal(changed.formalReadiness.activationAllowed,false);
 assert.equal(changed.formalPorts.activated,false);
 assert.equal(changed.policy.consent.E2.approval,'PENDING');
 const bad=JSON.parse(JSON.stringify(next));bad.E2.year=2026;
 assert.throws(()=>s.cmd('ADMIN_RECRUITMENT',{settings:bad}),/2027年實驗二不可提前/);
 bad.E2.year=2027;bad.E2.mode='FORMAL_OPEN';
 assert.throws(()=>s.cmd('ADMIN_RECRUITMENT',{settings:bad}),/示範開放/);
 assert.equal(s.read().recruitment.E2.year,2027);
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
});
test('Legacy fixture receives display settings without changing old test applications on read',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 const fixture=JSON.parse(s.p.get('STUDY1_UNIFIED_FIXTURE_V1'));
 delete fixture.recruitment;s.p.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(fixture));
 const prior=s.writes,now=s.read();
 assert.equal(s.writes,prior);
 assert.equal(now.recruitment.E2.mode,'COMING_SOON');
 assert.equal(now.applications[0].id,'SIM-001');
});

test('B08 owner snapshot covers all 15 original bounded notifications without a new property or data migration',()=>{
 const instance=setup();instance.cmd('START',{experiment:'E1'});
 const source=instance.ctx.study1UnifiedRead_(),writes=instance.writes;
 source.notifications=Array.from({length:15},(_,i)=>({
  id:'SIM-001',event:i%2?'MOVE':'CONFIRM',
  text:'〔SIM〕虛構操作 '+i+'（僅預覽，未寄送）',
  status:'SIM_PENDING',attempts:0,lastError:null
 }));
 const view=JSON.parse(JSON.stringify(instance.ctx.study1UnifiedView_(source)));
 assert.equal(view.notifications.length,15);
 assert.deepEqual(view.notifications.map(n=>n.index),
  Array.from({length:15},(_,i)=>i));
 assert.equal(view.notifications[0].text,source.notifications[0].text);
 assert.equal(view.notifications[14].text,source.notifications[14].text);
 assert.equal(view.open,false);assert.equal(view.consentReady,false);
 assert.equal(view.formalReadiness.activationAllowed,false);
 assert.equal(instance.writes,writes);
 assert.deepEqual([...instance.p.keys()].sort(),
  ['CONSENT_READY','OPEN','STUDY1_UNIFIED_FIXTURE_V1']);
});

test('B11 atomic TEST-only settings: scoped E1 change preserves E2 and all formal gates',()=>{
 const s=setup(),start=s.read(),writes=s.writes;
 const x=s.cmd('ADMIN_B11_SETTINGS',{
  scope:'E1',modes:{E1:'COMING_SOON'},site:null,release:'TEST_ONLY'
 });
 assert.equal(x.revision,start.revision+1);
 assert.equal(x.recruitment.E1.mode,'COMING_SOON');
 assert.equal(x.recruitment.E2.mode,'COMING_SOON');
 assert.deepEqual(x.config,start.config);
 assert.equal(s.writes,writes+1,'one existing TEST key and one atomic revision');
 assert.equal(s.p.get('OPEN'),'false');
 assert.equal(s.p.get('CONSENT_READY'),'false');
 assert.equal(x.formalReadiness.activationAllowed,false);
 assert.equal(x.formalPorts.activated,false);
 assert.equal(x.policy.consent.E1.approval,'PENDING');
 assert.equal(x.policy.consent.E2.approval,'PENDING');
 assert.deepEqual([...s.p.keys()].sort(),['CONSENT_READY','OPEN','STUDY1_UNIFIED_FIXTURE_V1']);
});
test('B11 combined modes and optional global site copy commit atomically without overwriting untouched research',()=>{
 const s=setup(),before=s.read(),writes=s.writes;
 const p={scope:'ALL',modes:{E1:'HIDDEN',E2:'DEMO_OPEN'},
  site:{title:'虛構網站主標題',notice:'僅展示TEST內容',emailTemplate:'模擬通知，不寄送'},
  release:'TEST_ONLY'};
 const x=s.cmd('ADMIN_B11_SETTINGS',p);
 assert.equal(x.revision,before.revision+1);
 assert.equal(x.recruitment.E1.mode,'HIDDEN');
 assert.equal(x.recruitment.E2.mode,'DEMO_OPEN');
 assert.equal(x.recruitment.E2.year,2027);
 assert.equal(x.config.title,'虛構網站主標題');
 assert.equal(x.config.notice,'僅展示TEST內容');
 assert.equal(x.config.emailTemplate,'模擬通知，不寄送');
 assert.deepEqual(x.definitions,before.definitions);
 assert.deepEqual(x.policy,before.policy);
 assert.deepEqual(x.slots,before.slots);
 assert.equal(s.writes,writes+1);
 assert.equal(x.open,false);assert.equal(x.consentReady,false);
});
test('B11 rejects publishing, scoped tamper, invalid content, no-op, stale CAS and unauthorized owner',()=>{
 const s=setup(),before=s.read(),writes=s.writes;
 const valid={scope:'E1',modes:{E1:'HIDDEN'},site:null,release:'TEST_ONLY'};
 assert.throws(()=>s.ctx.study1UnifiedB11FormalPublish_(),/正式網站發布未經REC/);
 assert.throws(()=>s.cmd('ADMIN_B11_FORMAL_PUBLISH',{}),/未核准的測試指令/);
 const bad=[
  {...valid,release:'FORMAL_PUBLISH'},
  {...valid,scope:'E2'},
  {...valid,modes:{E1:'HIDDEN',E2:'HIDDEN'}},
  {...valid,modes:{E1:'PUBLIC_OPEN'}},
  {...valid,site:{title:'<script>',notice:'ok',emailTemplate:'ok'}},
  {...valid,site:{title:'a'.repeat(161),notice:'ok',emailTemplate:'ok'}},
  {...valid,site:{title:'ok',notice:'ok',emailTemplate:'ok',formalApproval:true}},
  {...valid,authority:'PI'},
  {...valid,scope:'ALL'}
 ];
 for(const p of bad)assert.throws(()=>s.cmd('ADMIN_B11_SETTINGS',p));
 assert.equal(s.writes,writes);assert.deepEqual(s.read().config,before.config);
 assert.deepEqual(s.read().recruitment,before.recruitment);
 const done=s.cmd('ADMIN_B11_SETTINGS',valid,before.revision,'REQ-SIM-B11_IDEMP0001');
 assert.equal(done.recruitment.E1.mode,'HIDDEN');
 const once=s.writes;
 const replay=s.cmd('ADMIN_B11_SETTINGS',valid,before.revision,'REQ-SIM-B11_IDEMP0001');
 assert.equal(replay.deduplicated,true);assert.equal(s.writes,once);
 assert.throws(()=>s.cmd('ADMIN_B11_SETTINGS',{
  scope:'E2',modes:{E2:'HIDDEN'},site:null,release:'TEST_ONLY'},before.revision,
  'REQ-SIM-B11_IDEMP0002'),/版本已變更/);
 assert.throws(()=>s.cmd('ADMIN_B11_SETTINGS',valid),/沒有實質設定變更/);
 assert.equal(s.writes,once);
 for(const identity of [
  {active:'intruder@example.invalid'},{effective:'intruder@example.invalid'},
  {open:'true'},{consent:'true'}]){
  const untrusted=setup(identity);
  assert.throws(()=>untrusted.cmd('ADMIN_B11_SETTINGS',valid));
  assert.equal(untrusted.writes,0);
 }
});


test('B07 only records pending synthetic source checks, without money, payments, or second storage keys',()=>{
 const s=setup(),start=s.read();
 assert.deepEqual(JSON.parse(JSON.stringify(start.b07)),{reviews:{},history:[],itemReviews:{},itemHistory:[]});
 assert.equal(s.writes,0);
 s.cmd('START',{experiment:'E1'});
 const before=s.writes;
 const old=s.read().revision;
 let m=s.cmd('ADMIN_B07_REVIEW',{id:'SIM-001',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'},
  old,'REQ-SIM-B07CHECK001');
 assert.equal(m.revision,old+1);
 assert.equal(m.b07.reviews['SIM-001'].status,'SOURCE_PENDING');
 assert.equal(m.b07.history[0].from,'UNRECORDED');
 assert.equal(m.b07.history[0].to,'SOURCE_PENDING');
 assert.equal(m.b07.history[0].actor,'OWNER');
 assert.equal(s.writes,before+1);
 assert.equal(s.p.size,3);
 assert.equal(s.p.has('STUDY1_B07_PAYMENTS_V1'),false);
 assert.equal(JSON.stringify(m.b07).includes('amount'),false);
 assert.equal(JSON.stringify(m.b07).includes('PAID'),false);
 assert.equal(m.open,false);assert.equal(m.consentReady,false);
 const replay=s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'},
  old,'REQ-SIM-B07CHECK001');
 assert.equal(replay.deduplicated,true);
 assert.equal(s.writes,before+1,'replay cannot create duplicate B07 events');
 for(const status of ['PAID','APPROVED','DISBURSED',null]){
  assert.throws(()=>s.cmd('ADMIN_B07_REVIEW',
   {id:'SIM-001',status,reason:'SOURCE_CHECK'}),/B07只能記錄/);
 }
 assert.throws(()=>s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'SOURCE_PENDING',reason:'SOURCE_CHECK',amount:200}),/B07只能記錄/);
 assert.throws(()=>s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'}),/沒有實際變更/);
 assert.equal(s.writes,before+1);
});

test('B07 owner CAS prevents stale review and validates recent before/after consistency',()=>{
 const s=setup();s.cmd('START',{experiment:'E2'});
 const stale=s.read().revision;
 let m=s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'DOCUMENTS_PENDING',reason:'DOCUMENT_CHECK'},stale);
 assert.equal(m.b07.reviews['SIM-001'].status,'DOCUMENTS_PENDING');
 assert.throws(()=>s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'PI_REVIEW_PENDING',reason:'PI_REVIEW_REQUEST'},stale),/版本已變更/);
 m=s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'PI_REVIEW_PENDING',reason:'PI_REVIEW_REQUEST'});
 assert.equal(m.b07.history.length,2);
 assert.equal(m.b07.history[1].from,'DOCUMENTS_PENDING');
 assert.equal(m.b07.history[1].to,'PI_REVIEW_PENDING');
 const before=s.writes;
 assert.throws(()=>s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-999',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'}),/B07只能記錄/);
 assert.equal(s.writes,before);
 assert.equal(s.read().b07.reviews['SIM-001'].status,'PI_REVIEW_PENDING');
});

test('B07 old owner fixture migrates on read only, and tampered pending records fail closed',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 let stored=JSON.parse(s.ctx.study1UnifiedStoredDecode_(
  s.p.get('STUDY1_UNIFIED_FIXTURE_V1')));
 delete stored.b07;
 s.p.set('STUDY1_UNIFIED_FIXTURE_V1',
  s.ctx.study1UnifiedStoredEncode_(JSON.stringify(stored)));
 const before=s.writes;
 assert.deepEqual(JSON.parse(JSON.stringify(s.read().b07)),{reviews:{},history:[],itemReviews:{},itemHistory:[]});
 assert.equal(s.writes,before,'read-only schema migration cannot write fixture');
 let m=s.cmd('ADMIN_B07_REVIEW',
  {id:'SIM-001',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'});
 assert.equal(m.b07.reviews['SIM-001'].status,'SOURCE_PENDING');
 const clean=JSON.parse(s.ctx.study1UnifiedStoredDecode_(
  s.p.get('STUDY1_UNIFIED_FIXTURE_V1')));
 for(const mutated of [
  {...clean,b07:{reviews:{'SIM-001':{actor:'OWNER',status:'PAID',at:'2026-11-06T11:00:00.000Z'}},
     history:clean.b07.history}},
  {...clean,b07:{reviews:clean.b07.reviews,history:[{...clean.b07.history[0],to:'APPROVED'}]}},
  {...clean,b07:{reviews:{'SIM-999':clean.b07.reviews['SIM-001']},history:[]}}
 ]){
  s.p.set('STUDY1_UNIFIED_FIXTURE_V1',
   s.ctx.study1UnifiedStoredEncode_(JSON.stringify(mutated)));
  assert.throws(()=>s.read(),/B07/);
 }
 s.p.set('STUDY1_UNIFIED_FIXTURE_V1',
  s.ctx.study1UnifiedStoredEncode_(JSON.stringify(clean)));
 assert.equal(s.read().b07.reviews['SIM-001'].status,'SOURCE_PENDING');
});

test('B07 bounded pending review history retains final state and remains nonfinancial',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 const statuses=['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'];
 for(let i=0;i<15;i++)s.cmd('ADMIN_B07_REVIEW',{
  id:'SIM-001',status:statuses[i%3],reason:'SOURCE_CHECK'});
 const view=s.read();
 assert.equal(view.b07.history.length,12);
 assert.equal(view.b07.history[0].from,'PI_REVIEW_PENDING');
 assert.equal(view.b07.reviews['SIM-001'].status,'PI_REVIEW_PENDING');
 assert.equal(view.b07.history[11].to,view.b07.reviews['SIM-001'].status);
 assert.equal(view.b07.history[11].at,view.b07.reviews['SIM-001'].at);
 assert.equal(view.revision,16);
});

test('B07 E1 one-time and E2 pretest, eight-week intervention and posttest ledger are separate TEST items',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});s.cmd('START',{experiment:'E2'});
 const stages=['PRETEST','INTERVENTION_8W','POSTTEST'];
 let m=s.cmd('ADMIN_B07_ITEM_REVIEW',
  {id:'SIM-001',stage:'SINGLE_SESSION',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'});
 assert.equal(m.b07.itemReviews['SIM-001:SINGLE_SESSION'].status,'SOURCE_PENDING');
 for(const [i,stage] of stages.entries()){
  m=s.cmd('ADMIN_B07_ITEM_REVIEW',{id:'SIM-002',stage,
   status:['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'][i],reason:'DOCUMENT_CHECK'});
 }
 assert.deepEqual(Object.keys(m.b07.itemReviews).sort(),
  ['SIM-001:SINGLE_SESSION',...stages.map(x=>'SIM-002:'+x)].sort());
 assert.equal(m.b07.itemHistory.length,4);
 assert.deepEqual(m.b07.itemHistory.map(h=>h.from),Array(4).fill('UNRECORDED'));
 assert.equal(m.b07Summary.mode,'SYNTHETIC_PENDING_ONLY');
 assert.equal(m.b07Summary.total.total,4);
 assert.equal(m.b07Summary.total.unrecorded,0);
 assert.equal(m.b07Summary.total.sourcePending,2);
 assert.equal(m.b07Summary.total.documentsPending,1);
 assert.equal(m.b07Summary.total.piReviewPending,1);
 assert.equal(m.b07Summary.byExperiment.E1.total,1);
 assert.equal(m.b07Summary.byExperiment.E2.total,3);
 assert.equal(m.b07Summary.historyRetained,4);
 assert.equal(m.b07Summary.payment,false);
 assert.equal(m.b07Summary.approved,false);
 assert.equal(s.p.has('STUDY1_B07_PAYMENT_LEDGER'),false);
 assert.equal(JSON.stringify(m.b07).includes('amount'),false);
 assert.equal(JSON.stringify(m.b07).includes('PAID'),false);
 assert.equal(m.open,false);assert.equal(m.consentReady,false);
 const before=s.writes;
 for(const p of [
  {id:'SIM-001',stage:'PRETEST',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'},
  {id:'SIM-002',stage:'SINGLE_SESSION',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'},
  {id:'SIM-999',stage:'PRETEST',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'},
  {id:'SIM-002',stage:'POSTTEST',status:'PAID',reason:'SOURCE_CHECK'},
  {id:'SIM-002',stage:'POSTTEST',status:'APPROVED',reason:'SOURCE_CHECK'},
  {id:'SIM-002',stage:'POSTTEST',status:'SOURCE_PENDING',reason:'SOURCE_CHECK',amount:200}
 ])assert.throws(()=>s.cmd('ADMIN_B07_ITEM_REVIEW',p),/B07階段項目/);
 assert.equal(s.writes,before);
});
test('B07 stage item correction captures before after reason and rejects duplicate or stale competing edits',()=>{
 const s=setup();s.cmd('START',{experiment:'E2'});
 const initial=s.read().revision;
 const payload={id:'SIM-001',stage:'PRETEST',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'};
 let m=s.cmd('ADMIN_B07_ITEM_REVIEW',payload,initial,'REQ-SIM-B07ITEMONE01');
 assert.equal(m.b07.itemHistory[0].from,'UNRECORDED');
 assert.equal(m.b07.itemHistory[0].to,'SOURCE_PENDING');
 assert.equal(m.b07.itemHistory[0].reason,'SOURCE_CHECK');
 const before=s.writes;
 const replay=s.cmd('ADMIN_B07_ITEM_REVIEW',payload,initial,'REQ-SIM-B07ITEMONE01');
 assert.equal(replay.deduplicated,true);assert.equal(s.writes,before);
 assert.throws(()=>s.cmd('ADMIN_B07_ITEM_REVIEW',
  {...payload,status:'DOCUMENTS_PENDING'},initial),/版本已變更/);
 assert.throws(()=>s.cmd('ADMIN_B07_ITEM_REVIEW',payload),/重複項目事件/);
 m=s.cmd('ADMIN_B07_ITEM_REVIEW',{...payload,status:'PI_REVIEW_PENDING',reason:'PI_REVIEW_REQUEST'});
 assert.equal(m.b07.itemHistory[1].from,'SOURCE_PENDING');
 assert.equal(m.b07.itemHistory[1].to,'PI_REVIEW_PENDING');
 assert.equal(m.b07.itemHistory[1].reason,'PI_REVIEW_REQUEST');
 assert.equal(m.b07.itemReviews['SIM-001:PRETEST'].at,m.b07.itemHistory[1].at);
 assert.equal(s.writes,before+1);
});
test('B07 stage ledger migrates old pending fixture read-only and fails closed on forged item keys or history',()=>{
 const s=setup();s.cmd('START',{experiment:'E1'});
 const key='STUDY1_UNIFIED_FIXTURE_V1';
 const decode=()=>JSON.parse(s.ctx.study1UnifiedStoredDecode_(s.p.get(key)));
 const put=v=>s.p.set(key,s.ctx.study1UnifiedStoredEncode_(JSON.stringify(v)));
 const legacy=decode();delete legacy.b07.itemReviews;delete legacy.b07.itemHistory;
 put(legacy);const writes=s.writes;
 assert.deepEqual(JSON.parse(JSON.stringify(s.read().b07.itemReviews)),{});
 assert.equal(s.writes,writes,'legacy read cannot mutate backing TEST storage');
 let m=s.cmd('ADMIN_B07_ITEM_REVIEW',
  {id:'SIM-001',stage:'SINGLE_SESSION',status:'SOURCE_PENDING',reason:'SOURCE_CHECK'});
 const clean=decode();const record=clean.b07.itemReviews['SIM-001:SINGLE_SESSION'];
 const h=clean.b07.itemHistory[0];
 for(const b07 of [
  {...clean.b07,itemReviews:{'SIM-001:PRETEST':record}},
  {...clean.b07,itemReviews:{'SIM-001:SINGLE_SESSION':{...record,status:'PAID'}}},
  {...clean.b07,itemReviews:{...clean.b07.itemReviews,'SIM-999:SINGLE_SESSION':record}},
  {...clean.b07,itemHistory:[{...h,from:'PI_REVIEW_PENDING'}]},
  {...clean.b07,itemHistory:[h,{...h}]},
  {...clean.b07,itemHistory:[{...h,reason:'PAYMENT_SENT'}]},
  {...clean.b07,itemHistory:[{...h,to:'DOCUMENTS_PENDING'}]}
 ]){
  put({...clean,b07});
  assert.throws(()=>s.read(),/B07/);
 }
 put(clean);assert.equal(s.read().b07.itemReviews['SIM-001:SINGLE_SESSION'].status,'SOURCE_PENDING');
 assert.equal(s.p.get('OPEN'),'false');assert.equal(s.p.get('CONSENT_READY'),'false');
});
test('B07 independent stage histories retain at most 32 recent TEST corrections',()=>{
 const s=setup();s.cmd('START',{experiment:'E2'});
 const values=['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'];
 for(let i=0;i<35;i++)s.cmd('ADMIN_B07_ITEM_REVIEW',{
  id:'SIM-001',stage:'INTERVENTION_8W',status:values[i%3],reason:'PI_REVIEW_REQUEST'});
 const view=s.read(),key='SIM-001:INTERVENTION_8W';
 assert.equal(view.b07.itemHistory.length,32);
 assert.equal(view.b07.itemHistory.at(-1).to,view.b07.itemReviews[key].status);
 assert.equal(view.b07.itemHistory.at(-1).at,view.b07.itemReviews[key].at);
 assert.equal(view.b07.itemHistory.length,32);
 assert.equal(view.revision,36);
});

test('B01 non-sensitive owner layout defaults without writing and persists exact stable card IDs',()=>{
 const x=setup(),ctx=x.ctx,first=JSON.parse(JSON.stringify(ctx.study1UnifiedB01LayoutGet()));
 assert.equal(first.mode,'TEST_LAYOUT_ONLY');assert.equal(first.revision,0);
 assert.equal(first.order.length,13);assert.deepEqual(first.hidden,[]);
 assert.equal(x.writes,0);assert.equal(x.p.has('STUDY1_B01_OWNER_LAYOUT_V1'),false);
 const order=first.order.slice();[order[0],order[1]]=[order[1],order[0]];
 const cmd={order,hidden:[first.order[0]],expectedRevision:0,
  requestId:'REQ-SIM-B01_layout00000001'};
 const saved=JSON.parse(JSON.stringify(ctx.study1UnifiedB01LayoutSave(cmd)));
 assert.equal(saved.revision,1);assert.deepEqual(saved.order,order);
 assert.deepEqual(saved.hidden,[first.order[0]]);assert.equal(saved.deduplicated,false);
 assert.equal(x.writes,1);
 assert.equal(x.p.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
 const raw=x.p.get('STUDY1_B01_OWNER_LAYOUT_V1');
 assert.doesNotMatch(raw,/SIM-001|email|amount|payment|approved|phone|compensation/i);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.study1UnifiedB01LayoutGet())).order,order);
 assert.equal(x.p.get('OPEN'),'false');assert.equal(x.p.get('CONSENT_READY'),'false');
 assert.equal(x.held,false);
});
test('B01 revision CAS blocks second tab, request replay is idempotent and no-op denied',()=>{
 const x=setup(),ctx=x.ctx,base=JSON.parse(JSON.stringify(ctx.study1UnifiedB01LayoutGet()));
 const id='REQ-SIM-B01_concurrent00000001';
 const cmd={order:base.order.slice().reverse(),hidden:[],expectedRevision:0,requestId:id};
 const saved=ctx.study1UnifiedB01LayoutSave(cmd),w=x.writes;
 assert.equal(saved.revision,1);
 const replay=ctx.study1UnifiedB01LayoutSave(cmd);
 assert.equal(replay.deduplicated,true);assert.equal(x.writes,w);
 assert.throws(()=>ctx.study1UnifiedB01LayoutSave({...cmd,hidden:[base.order[0]]}),/請求識別碼/);
 assert.throws(()=>ctx.study1UnifiedB01LayoutSave({...cmd,
  requestId:'REQ-SIM-B01_stale0000000001',hidden:[base.order[0]]}),/版本已變更/);
 assert.throws(()=>ctx.study1UnifiedB01LayoutSave({...cmd,
  requestId:'REQ-SIM-B01_noop00000000001',expectedRevision:1}),/沒有修改/);
 assert.equal(x.writes,w);
 const second=ctx.study1UnifiedB01LayoutGet();
 assert.equal(second.revision,1);
 assert.equal(x.held,false);
});
test('B01 layout denies forged identifiers, duplicate ordering, PII fields, unsafe flags and unauthorized owner',()=>{
 const x=setup(),ctx=x.ctx,base=JSON.parse(JSON.stringify(ctx.study1UnifiedB01LayoutGet()));
 const valid={order:base.order.slice().reverse(),hidden:[base.order[0]],expectedRevision:0,
  requestId:'REQ-SIM-B01_inval0000000001'};
 const writes=x.writes;
 for(const payload of [
  {...valid,order:[...valid.order.slice(0,12),'A_PERSON']},
  {...valid,order:[valid.order[0],...valid.order.slice(0,12)]},
  {...valid,hidden:[base.order[0],base.order[0]]},
  {...valid,hidden:[base.order[5],base.order[0]]},
  {...valid,email:'name@example.invalid'},
  {...valid,amount:100},
  {...valid,hidden:['SIM-001']},
  {...valid,requestId:'INVALID'}
 ])assert.throws(()=>ctx.study1UnifiedB01LayoutSave(payload),/B01/);
 assert.equal(x.writes,writes);
 x.p.set('STUDY1_B01_OWNER_LAYOUT_V1','{"schema":"STUDY1_B01_LAYOUT_V1","order":["PII"]}');
 assert.throws(()=>ctx.study1UnifiedB01LayoutGet(),/B01/);
 x.p.delete('STUDY1_B01_OWNER_LAYOUT_V1');
 const unsafe=setup({open:'true'});
 assert.throws(()=>unsafe.ctx.study1UnifiedB01LayoutGet(),/OPEN|關閉|權限|拒絕/);
 assert.throws(()=>unsafe.ctx.study1UnifiedB01LayoutSave(valid),/OPEN|關閉|權限|拒絕/);
 const noOwner=setup({active:'other@example.invalid'});
 assert.throws(()=>noOwner.ctx.study1UnifiedB01LayoutGet(),/權限|拒絕|帳號/);
 assert.throws(()=>noOwner.ctx.study1UnifiedB01LayoutSave(valid),/權限|拒絕|帳號/);
 assert.equal(noOwner.writes,0);assert.equal(unsafe.writes,0);
});
