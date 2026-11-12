'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../gas/Study1EConsentBinding.js'),'utf8');
const SHA='a'.repeat(64),doc={experiment:'E1',sha256:SHA,version:'Version02'};
const req={applicantId:'APP_00000001',screeningId:'SCR_00000001',
 challengeId:'CHAL_00000001',reservationId:'RSV_00000001',slotId:'SLOT_00000001',
 experiment:'E1',documentSha:SHA,documentVersion:'Version02'};
const iso=ms=>new Date(ms).toISOString();
function snapshot(now){
 const t=now.getTime(),ts=offset=>iso(t+offset);
 return {
  applicants:{headers:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
   rows:[[req.applicantId,'TEST PERSON','participant@example.org','',''+ts(-7200000),ts(-600000),'EMAIL_VERIFIED']]},
  screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
   rows:[[req.screeningId,req.applicantId,'REC_SCREEN_V1','ELIGIBLE',ts(-5400000),'PARTICIPANT_SELF_REPORT']]},
  verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
   rows:[[req.challengeId,req.applicantId,'EMAIL_VERIFICATION','b'.repeat(64),
    ts(-1200000),1,ts(-1500000),'participant@example.org',ts(-1800000)]]},
  reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc',
   'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[[req.reservationId,req.applicantId,req.slotId,'HELD',ts(600000),'HOLD-ONE',
    ts(-900000),'','',ts(-900000)]]},
  slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
   rows:[[req.slotId,ts(7200000),ts(10800000),5,'SYNTHETIC','OPEN','STAFF-TEST','']]},
  identity:{verified:true,provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
   consentProcedureApproved:true,
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   eligibilityEvidenceSha256:'e'.repeat(64),applicantId:req.applicantId,experiment:'E1',
   email:'participant@example.org',evidenceSha256:'c'.repeat(64),
   verifiedAtUtc:ts(-1500000),screeningVersion:'REC_SCREEN_V1',
   screeningId:req.screeningId,slotId:req.slotId,reservationId:req.reservationId,
   challengeId:req.challengeId}
 };
}
function harness(snap,now=new Date()){
 let writes=0,locked=false,registry={schemaVersion:1,revision:0,records:[]};
 const key=crypto.randomBytes(40).toString('hex');
 const properties={getProperty:name=>name==='STUDY1_ECONSENT_BINDING_HMAC_KEY'?key:null};
 const lock={tryLock:()=>{if(locked)return false;locked=true;return true},
  hasLock:()=>locked,releaseLock:()=>{locked=false}};
 let next=0;
 const uuids=['aaaaaaaa-bbbb-4ccc-8ddd-000000000001','aaaaaaaa-bbbb-4ccc-8ddd-000000000002',
 'aaaaaaaa-bbbb-4ccc-8ddd-000000000003','aaaaaaaa-bbbb-4ccc-8ddd-000000000004'];
 const sandbox=vm.createContext({Date,JSON,Array,Object,String,Number,Math,Error,Set,
  PropertiesService:{getScriptProperties:()=>properties},
  LockService:{getScriptLock:()=>lock},
  Utilities:{Charset:{UTF_8:'UTF-8'},getUuid:()=>uuids[next++ % uuids.length],
   computeHmacSha256Signature:(str,secret)=>[...crypto.createHmac('sha256',secret).update(str).digest()]}
 });
 vm.runInContext(source,sandbox,{timeout:2000});
 sandbox.STUDY1_ECONSENT_MAX_RECORDS_=12;
 const originalFactory=sandbox.study1EConsentBindingAdapter_;
 // Inject synthetic source ONLY in the offline VM; production code has no adapter argument.
 sandbox.study1EConsentBindingAdapter_=()=>({readTrustedSnapshot:()=>snap});
 sandbox.study1AdminOwnerRequired_=()=>true;
 sandbox.study1EConsentReadyDocument_=exp=>{
  assert.equal(exp,'E1');return doc;
 };
 sandbox.study1EConsentHash_=token=>crypto.createHash('sha256').update(token).digest('hex');
 sandbox.study1EConsentRegistry_=()=>registry;
 sandbox.study1EConsentWrite_=(old,next)=>{
  if(registry!==old||next.revision!==old.revision+1)throw Error('CAS refusal');
  writes++;registry=next;
 };
 return {sandbox,snap,now,originalFactory,adapter:{readTrustedSnapshot:()=>snap},
  get registry(){return registry},get writes(){return writes},get locked(){return locked}};
}
test('Real adapter is deliberately absent; no browser-provided proof can activate production',()=>{
 const h=harness(snapshot(new Date()));
 assert.throws(()=>h.originalFactory(),/BACKEND_NOT_READY/);
 assert.equal(h.registry.records.length,0);
});
test('One trusted identity + consumed OTP + screened applicant + HELD booking + exact E1 PDF issue one short-lived invite',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 const binding=h.sandbox.study1BindingVerify_(snap,req,doc,now.toISOString());
 binding.digest=h.sandbox.study1BindingDigest_({...binding,digest:''});
 assert.match(binding.digest,/^[0-9a-f]{64}$/);
 assert.equal(h.sandbox.study1BindingRecheck_(binding,doc,h.adapter,now.toISOString()).applicantId,req.applicantId);
 const issued=h.sandbox.study1EConsentIssueBound_(req);
 assert.equal(issued.experiment,'E1');
 assert.equal(h.writes,1);
 assert.equal(h.registry.records.length,1);
 assert.equal(h.registry.records[0].binding.applicantId,req.applicantId);
 assert.ok(h.registry.records[0].expires<=Date.parse(snap.reservations.rows[0][4]));
 assert.equal(h.locked,false);
 assert.throws(()=>h.sandbox.study1EConsentIssueBound_(req),/重複/);
 assert.equal(h.writes,1);
});
test('Identity/OTP/slot/current source mutations all fail closed with no new issued invite',()=>{
 const cases=[
  s=>{s.identity.verified=false},
  s=>{s.identity.provenance='EMAIL_ONLY'},
  s=>{s.identity.experiment='E2'},
  s=>{s.identity.email='other@example.org'},
  s=>{s.identity.consentProcedureApproved=false},
  s=>{s.identity.emailControlSource='BROWSER_SELF_REPORT'},
  s=>{s.identity.eligibilityEvidenceSource='NOT_SELF_REPORTED'},
  s=>{s.identity.eligibilityEvidenceSha256='bad'},
  s=>{s.identity.evidenceSha256='a'},
  s=>{s.applicants.rows[0][6]='PENDING'},
  s=>{s.screenings.rows[0][3]='INELIGIBLE'},
  s=>{s.screenings.rows[0][2]='WRONG'},
  s=>{s.verification.rows[0][1]='APP_00000002'},
  s=>{s.verification.rows[0][6]=''},
  s=>{s.verification.rows[0][7]='other@example.org'},
  s=>{s.verification.rows.push(s.verification.rows[0].slice())},
  s=>{s.reservations.rows[0][1]='APP_00000002'},
  s=>{s.reservations.rows[0][2]='SLOT_00000002'},
  s=>{s.reservations.rows[0][3]='CANCELLED'},
  s=>{s.reservations.rows[0][4]='2020-01-01T00:00:00.000Z'},
  s=>{s.reservations.rows.push(s.reservations.rows[0].slice())},
  s=>{s.slots.rows[0][5]='CLOSED'},
  s=>{s.identity.slotId='SLOT_00000002'},
  s=>{s.identity.reservationId='RSV_00000002'},
  s=>{s.identity.challengeId='CHAL_00000002'},
  s=>{delete s.applicants.rows[0][3]},
  s=>{s.screenings.headers[1]='wrong_applicant_id'}
 ];
 for(const mutate of cases){
  const now=new Date(),s=snapshot(now),h=harness(s,now);
  mutate(s);
  assert.throws(()=>h.sandbox.study1EConsentIssueBound_(req));
  assert.equal(h.writes,0,'no registry writes on an untrusted read');
  assert.equal(h.locked,false,'lock released on error');
 }
});
test('Cross-experiment and source document SHA, version or applicant ID cannot be substituted',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 for(const wrong of [{...req,experiment:'E2'}, {...req,documentSha:'f'.repeat(64)},
  {...req,documentVersion:'Version03'}, {...req,applicantId:'APP_00000002'},
  {...req,slotId:'SLOT_00000002'}, {...req,reservationId:'RSV_00000002'}])
  assert.throws(()=>h.sandbox.study1EConsentIssueBound_(wrong));
 assert.equal(h.writes,0);
});
test('At sign time, fresh source re-read invalidates changed identity evidence or reserved slot',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 const binding=h.sandbox.study1BindingVerify_(snap,req,doc,now.toISOString());
 binding.digest=h.sandbox.study1BindingDigest_({...binding,digest:''});
 const good=h.sandbox.study1BindingRecheck_(binding,doc,h.adapter,now.toISOString());
 assert.equal(good.documentSha,doc.sha256);
 snap.identity.evidenceSha256='f'.repeat(64);
 assert.throws(()=>h.sandbox.study1BindingRecheck_(binding,doc,h.adapter,now.toISOString()),/更新/);
 snap.identity.evidenceSha256='c'.repeat(64);
 snap.reservations.rows[0][3]='CANCELLED';
 assert.throws(()=>h.sandbox.study1BindingRecheck_(binding,doc,h.adapter,now.toISOString()));
 snap.reservations.rows[0][3]='HELD';
 assert.throws(()=>h.sandbox.study1BindingRecheck_({...binding,digest:'e'.repeat(64)},doc,h.adapter,now.toISOString()),/簽章/);
});
test('One script lock protects source validation and invitation CAS from concurrent issue',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 let injected=false;
 const racingAdapter={readTrustedSnapshot:()=>{
  if(!injected){
   injected=true;
   assert.throws(()=>h.sandbox.study1EConsentIssueBound_(req),/鎖/);
  }
  return snap;
 }};
 h.sandbox.study1EConsentBindingAdapter_=()=>racingAdapter;
 h.sandbox.study1EConsentIssueBound_(req);
 assert.equal(h.writes,1);
 assert.equal(h.locked,false);
});
test('No fake TEST applicant, identity attestation or expired identity is acceptable',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 for(const bad of [{...req,applicantId:'SIM-001'}, {...req,challengeId:'SIMOTP_001'}]){
  assert.throws(()=>h.sandbox.study1EConsentIssueBound_(bad));
 }
 snap.identity.verifiedAtUtc='2020-01-01T00:00:00.000Z';
 assert.throws(()=>h.sandbox.study1EConsentIssueBound_(req));
 assert.equal(h.writes,0);
});

test('E2 remains closed regardless of prior E1-history claims',()=>{
 const now=new Date(),snap=snapshot(now),h=harness(snap,now);
 const e2={...req,experiment:'E2'};
 snap.identity.experiment='E2';
 snap.identity.priorE1ParticipationVerified=true;
 snap.identity.priorE1Participation=false;
 snap.identity.priorE1Source='REC_APPROVED_STUDY_HISTORY';
 snap.identity.priorE1EvidenceSha256='d'.repeat(64);
 assert.throws(()=>h.sandbox.study1BindingVerify_(snap,e2,
  {...doc,experiment:'E2'},now.toISOString()),/EXPERIMENT_NOT_OPEN/);
 assert.equal(h.registry.records.length,0);
});
