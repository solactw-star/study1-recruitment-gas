'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scripts=['BookingCore.js','BookingHoldTransaction.js','Study1EConsentBinding.js','Study1WizardP0Bridge.js'].map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI';
const O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const ts=(t,delta)=>new Date(t+delta).toISOString();
function fixture({approved=true,identity=true,slotProof=true,experiment='E1',capacity=1}={}){
 const t=Date.now();
 const req={applicantId:'APP_12345678',challengeId:'CHL_12345678',screeningId:'SCR_12345678',slotId:'SLOT_12345678',
  experiment,documentSha:'a'.repeat(64),documentVersion:'2026-05-11/Version02',
  requestId:'REQ_12345678_ABCDEFGH',holdUntilUtc:ts(t,600000)};
 const tables={
  Applicants:{headers:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],rows:[[req.applicantId,'TEST','participant@example.org','',ts(t,-7200000),ts(t,-100000),'EMAIL_VERIFIED']]},
  Screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],rows:[[req.screeningId,req.applicantId,'SCREEN_V1','ELIGIBLE',ts(t,-350000),'PARTICIPANT_SELF_REPORT']]},
  Verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],rows:[[req.challengeId,req.applicantId,'EMAIL_VERIFICATION','b'.repeat(64),ts(t,300000),1,ts(t,-50000),'participant@example.org',ts(t,-200000)]]},
  Slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],rows:[[req.slotId,ts(t,7200000),ts(t,10800000),capacity,'TEST','OPEN','STAFF_TEST','']]},
  Reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],rows:[]}
 };
 const person={applicantId:req.applicantId,screeningId:req.screeningId,challengeId:req.challengeId,experiment,verified:true,
  provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
  emailControlSource:'ORIGINAL_VERIFICATION_FG',
  eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',eligibilityEvidenceSha256:'c'.repeat(64),
  evidenceSha256:'d'.repeat(64),screeningVersion:'SCREEN_V1',email:'participant@example.org',
  verifiedAtUtc:ts(t,-50000)};
 const slot={verified:true,provenance:'TRUSTED_FORMAL_SLOT_EXPERIMENT_REGISTRY',slotId:req.slotId,experiment,evidenceSha256:'f'.repeat(64)};
 let locked=false,readCount=0,writes=[],n=0,beforeAppend=null,otpCalls=0;
 function tab(name){return {
  getLastRow:()=>tables[name].rows.length+1,
  getLastColumn:()=>tables[name].headers.length,
  getRange:(row,col,height,width)=>{
   if(col!==1||width!==tables[name].headers.length)throw Error('Unexpected range');
   if(row===1)return {getValues:()=>[tables[name].headers.slice()]};
   if(row===2&&height===tables[name].rows.length)return {getValues:()=>tables[name].rows.map(r=>r.slice())};
   throw Error('Unexpected row/height');
  },
  appendRow:r=>{
   if(name!=='Reservations'||!locked)throw Error('Unauthorized test write');
   if(beforeAppend)beforeAppend();
   tables.Reservations.rows.push(r.slice());writes.push(r.slice());return true;
  }
 }}
 const context=vm.createContext({
  Date,JSON,Array,Object,Set,Number,String,Math,Error,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='STUDY1_ECONSENT_BINDING_HMAC_KEY'?'0123456789abcdef'.repeat(5):
     ['STUDY1_WIZARD_P0_SHEET_HOLD_VERIFIED','STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','STUDY1_E1_BOOKING_APPROVED'].includes(k)&&approved?'true':null})},
  Utilities:{Charset:{UTF_8:'UTF-8'},
   getUuid:()=> '00000000-1111-4222-8333-'+String(++n).padStart(12,'0'),
   computeHmacSha256Signature:(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()]},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked)return false;locked=true;return true;},
   hasLock:()=>locked,releaseLock:()=>{locked=false}
  })},
  SpreadsheetApp:{
   openById:id=>{readCount++;if(id===P)return {getSheetByName:name=>tab(name)};if(id!==O)throw Error('Wrong official Sheet');return {getSheetByName:name=>tab(name)}},
   flush:()=>{}
  }
 });
 vm.runInContext(scripts,context,{timeout:5000});
 context.SITE_RESOURCES_={personal:P,operations:O};
 context.study1BindingGate_=()=>{if(!approved)throw Error('BACKEND_NOT_READY');return true};
 context.study1ParticipantGate_=()=>{if(!approved)throw Error('BACKEND_NOT_READY');return true};
 context.study1EConsentReadyDocument_=exp=>({experiment:exp,sha256:'a'.repeat(64),version:'2026-05-11/Version02'});
 context.study1BindingSheetRow_=(_book,name,headers,id)=>{
  if(!tables[name]||JSON.stringify(tables[name].headers)!==JSON.stringify(Array.from(headers)))
   throw Error('schema drift');
  const found=tables[name].rows.filter(r=>r[0]===id);
  if(found.length!==1)throw Error('unique row missing');
  return {headers:Array.from(headers),rows:[found[0].slice()]};
 };
 if(identity)context.study1WizardApplicantAuthority_=()=>person;
 else context.study1SelfReportedAuthority_=()=>{throw Error('SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED')};
 if(slotProof)context.study1WizardSlotAuthority_=()=>slot;
 context.study1ParticipantRecPolicy_=()=>({screeningVersion:'SCREEN_V1'});
 context.study1ParticipantVerifiedPolicy_=p=>p;
 context.study1ParticipantOtpVerify_=()=>{otpCalls++;return {verified:true,reason:'EMAIL_CONTROL_ONLY',emailProof:{signature:'a'.repeat(64)}}};
 context.study1ParticipantEmailStatus_=()=>({
  emailVerified:true,eligibilitySource:'PARTICIPANT_SELF_REPORT',
  applicationState:'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED'});
 return {context,req,tables,person,slot,writes,set beforeAppend(f){beforeAppend=f},
  get locked(){return locked},get readCount(){return readCount},get otpCalls(){return otpCalls}};
}
test('CLOSED denies before touching official Sheets',()=>{
 const h=fixture({approved:false});
 assert.throws(()=>h.context.study1WizardHoldBound_(h.req),/BACKEND_NOT_READY/);
 assert.equal(h.readCount,0);assert.equal(h.writes.length,0);
});
test('Missing trusted identity rejects before opening booking data',()=>{
 const h=fixture({identity:false});
 assert.throws(()=>h.context.study1WizardHoldBound_(h.req),/SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED/);
 assert.equal(h.readCount,0);assert.equal(h.writes.length,0);
});
test('Official Slots has no experiment column: unverified E1/E2 mapping cannot create a hold',()=>{
 const h=fixture({slotProof:false});
 assert.throws(()=>h.context.study1WizardHoldBound_(h.req),/SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED/);
 assert.equal(h.writes.length,0);assert.equal(h.locked,false);
});
test('Original transaction creates one formal-shaped HELD row and a SHA-256 HMAC receipt',()=>{
 const h=fixture(),a=h.context.study1WizardHoldBound_(h.req);
 assert.equal(a.held,true);assert.equal(a.reason,'CREATED');
 assert.equal(a.applicantId,h.req.applicantId);assert.equal(a.documentSha,h.req.documentSha);
 assert.match(a.receipt,/^[a-f0-9]{64}$/);
 assert.match(a.reservationId,/^RSV_[0-9a-f]{32}$/);
 assert.equal(h.tables.Reservations.rows[0][0],a.reservationId);
 assert.equal(h.tables.Reservations.rows[0][1],h.req.applicantId);
 assert.equal(h.tables.Reservations.rows[0][2],h.req.slotId);
 assert.equal(h.writes.length,1);assert.equal(h.locked,false);
 const retry=h.context.study1WizardHoldBound_(h.req);
 assert.equal(retry.held,true);assert.equal(retry.reason,'REPLAY');
 assert.equal(retry.reservationId,a.reservationId);assert.equal(retry.receipt,a.receipt);
 assert.equal(h.writes.length,1);
});
test('Same applicant cannot acquire two active holds using different idempotency IDs',()=>{
 const h=fixture();h.context.study1WizardHoldBound_(h.req);
 const again=h.context.study1WizardHoldBound_({...h.req,requestId:'REQ_DIFFERENT_123456789'});
 assert.equal(again.held,false);assert.equal(again.reason,'REJECTED');
 assert.equal(h.writes.length,1);
});
test('Concurrent second hold cannot acquire same ScriptLock and overbook',()=>{
 const h=fixture();let rejected=false;
 h.beforeAppend=()=>{
  assert.throws(()=>h.context.study1WizardHoldBound_({...h.req,requestId:'REQ_CONCURRENT_123456789'}),/無法取得預約全域交易鎖/);
  rejected=true;
 };
 assert.equal(h.context.study1WizardHoldBound_(h.req).held,true);
 assert.equal(rejected,true);assert.equal(h.writes.length,1);assert.equal(h.locked,false);
});
test('Impersonation, document mismatch, wrong experiment, no OTP and invalid request ID all fail',()=>{
 const mutations=[
  h=>{h.person.applicantId='APP_ATTACKER'},
  h=>{h.person.email='attacker@example.org'},
  h=>{h.person.provenance='BROWSER_ID_CARD_CLAIM'},
  h=>{h.person.emailControlSource='BROWSER_ASSERTION'},
  h=>{h.tables.Verification.rows[0][6]=''},
  h=>{h.tables.Screenings.rows[0][3]='INELIGIBLE'},
  h=>{h.tables.Applicants.rows[0][6]='PENDING_EMAIL'},
  h=>{h.slot.experiment='E2'},
  h=>{h.req.documentSha='f'.repeat(64)},
  h=>{h.req.requestId='short'}
 ];
 for(const patch of mutations){const h=fixture();patch(h);
  assert.throws(()=>h.context.study1WizardHoldBound_(h.req));
  assert.equal(h.writes.length,0);assert.equal(h.locked,false);
 }
});
test('E2 cannot be booked even with a claimed prior E1 history',()=>{
 const h=fixture({experiment:'E2'});
 assert.throws(()=>h.context.study1WizardHoldBound_(h.req),/EXPERIMENT_NOT_OPEN/);
 assert.equal(h.writes.length,0);
});
test('Original capacity calculator prevents second applicant entering full slot',()=>{
 const h=fixture({capacity:1});h.context.study1WizardHoldBound_(h.req);
 const id='APP_87654321',screen='SCR_87654321',challenge='CHL_87654321';
 h.req.applicantId=id;h.req.screeningId=screen;h.req.challengeId=challenge;h.req.requestId='REQ_SECOND_PERSON_123456789';
 h.person.applicantId=id;h.person.screeningId=screen;h.person.challengeId=challenge;
 const now=Date.now();
 h.tables.Applicants.rows.push([id,'OTHER_TEST','participant@example.org','',ts(now,-7200000),ts(now,-100000),'EMAIL_VERIFIED']);
 h.tables.Screenings.rows.push([screen,id,'SCREEN_V1','ELIGIBLE',ts(now,-350000),'PARTICIPANT_SELF_REPORT']);
 h.tables.Verification.rows.push([challenge,id,'EMAIL_VERIFICATION','b'.repeat(64),ts(now,300000),1,ts(now,-50000),'participant@example.org',ts(now,-200000)]);
 h.person.verifiedAtUtc=ts(now,-50000);
 const result=h.context.study1WizardHoldBound_(h.req);
 assert.equal(result.held,false);assert.equal(result.reason,'REJECTED');assert.equal(h.writes.length,1);
});
test('Step 03 OTP verifies via existing adapter, not TEST 00000000 state',()=>{
 const h=fixture();h.tables.Applicants.rows[0][6]='PENDING_EMAIL';
 const a=h.context.study1WizardOtpVerifyBound_({
  applicantId:h.req.applicantId,challengeId:h.req.challengeId,
  screeningId:h.req.screeningId,experiment:h.req.experiment,code:'12345678'
 });
 assert.equal(a.verified,true);assert.equal(h.otpCalls,1);
 assert.throws(()=>h.context.study1WizardOtpVerifyBound_({wrong:'payload'}),/格式/);
});

test('Step 05 readback validates original held reservation, OTP, E1/E2 and PDF before last consent stage',()=>{
 const h=fixture(),held=h.context.study1WizardHoldBound_(h.req);
 const review=h.context.study1WizardReviewBound_({...h.req,reservationId:held.reservationId,receipt:held.receipt});
 assert.equal(review.verified,true);
 assert.equal(review.stage,'CONFIRM');
 assert.equal(review.reservationId,held.reservationId);
 assert.equal(review.documentSha,h.req.documentSha);
 assert.equal(review.experiment,'E1');
 assert.ok(review.startAtUtc>new Date().toISOString());
 assert.equal(h.writes.length,1,'summary is read-only');
 assert.equal(h.locked,false);
});
test('Step 05 rejects tampered HMAC, exchanged applicant, cross E1/E2 and changed document',()=>{
 const mutations=[
  (h,x)=>{x.receipt='0'.repeat(64)},
  (h,x)=>{x.experiment='E2'},
  (h,x)=>{x.applicantId='APP_ATTACKER'},
  (h,x)=>{x.documentSha='f'.repeat(64)},
  (h,x)=>{x.reservationId='RSV_00000000000000000000000000000000'},
  (h,x)=>{h.person.evidenceSha256='3'.repeat(64)},
  (h,x)=>{h.slot.evidenceSha256='4'.repeat(64)}
 ];
 for(const mutate of mutations){
  const h=fixture(),held=h.context.study1WizardHoldBound_(h.req);
  const x={...h.req,reservationId:held.reservationId,receipt:held.receipt};
  mutate(h,x);
  assert.throws(()=>h.context.study1WizardReviewBound_(x));
  assert.equal(h.writes.length,1,'failed review never writes or duplicates a booking');
  assert.equal(h.locked,false);
 }
});
test('Step 05 never reports a canceled, expired or moved reservation as confirmed',()=>{
 const cases=[
  b=>{b[3]='CANCELLED'},
  b=>{b[4]='2020-01-01T00:00:00.000Z'},
  b=>{b[2]='SLOT_EXCHANGED'}
 ];
 for(const mutate of cases){
  const h=fixture(),held=h.context.study1WizardHoldBound_(h.req);
  mutate(h.tables.Reservations.rows[0]);
  assert.throws(()=>h.context.study1WizardReviewBound_({...h.req,
   reservationId:held.reservationId,receipt:held.receipt}));
  assert.equal(h.locked,false);
 }
});
test('Step 05 cannot read original participant record if technical gate is closed after holding',()=>{
 const h=fixture(),held=h.context.study1WizardHoldBound_(h.req);
 h.context.study1ParticipantGate_=()=>{throw Error('BACKEND_NOT_READY');};
 assert.throws(()=>h.context.study1WizardReviewBound_({...h.req,
  reservationId:held.reservationId,receipt:held.receipt}),/BACKEND_NOT_READY/);
 assert.equal(h.writes.length,1);
});
