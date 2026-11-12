'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=['Study1EConsentBinding.js','Study1SelfReportAuthority.js']
 .map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
const iso=(t,n)=>new Date(t+n).toISOString();
function env(){
 const now=Date.now(),flags=new Map(),lock={held:false},seen=[];
 const req={applicantId:'APP_TEST_123456789',screeningId:'SCR_TEST_123456789',
  challengeId:'CHL_TEST_123456789',experiment:'E1'};
 const email='selfreport@example.org';
 const rows={
  Applicants:[req.applicantId,'合成自陳參與者',email,'',iso(now,-7200000),
   iso(now,-240000),'EMAIL_VERIFIED'],
  Screenings:[req.screeningId,req.applicantId,'REC_E1_V2','ELIGIBLE',
   iso(now,-7000000),'PARTICIPANT_SELF_REPORT'],
  Verification:[req.challengeId,req.applicantId,'EMAIL_VERIFICATION',
   'a'.repeat(64),iso(now,300000),1,iso(now,-240000),
   email,iso(now,-300000)]
 };
 const history=[rows.Verification];
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(48).toString('hex'));
 flags.set('STUDY1_E1_REMOTE_CONSENT_REC_SCOPE_VERIFIED','false');
 const scope=vm.createContext({
  Date,JSON,Array,Object,Number,String,Math,Error,Set,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  SITE_RESOURCES_:{personal:'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
   operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'},
  LockService:{getScriptLock:()=>({hasLock:()=>lock.held})},
  SpreadsheetApp:{openById:id=>{seen.push(id);return {}}},
  Utilities:{Charset:{UTF_8:'utf8'},
   computeHmacSha256Signature:(raw,key)=>[...crypto.createHmac('sha256',key).update(raw).digest()]}
 });
 vm.runInContext(source,scope,{timeout:4000});
 scope.study1ParticipantGate_=()=>true; // public gate tested separately
 flags.set('STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','true');
 scope.study1ParticipantRecPolicy_=()=>({screeningVersion:'REC_E1_V2',documentSha256:'b'.repeat(64)});
 scope.study1ParticipantVerifiedPolicy_=p=>p;
 scope.study1BindingSheetRow_=(_book,tab,heads,id)=>{
  if(!rows[tab]||rows[tab][0]!==id)throw Error('UNIQUE_ORIGINAL_ROW_NOT_FOUND');
  return {rows:[rows[tab].slice()]};
 };
 scope.study1WizardIssueRows_=()=>({snapshot:{rows:history.map(x=>x.slice())}});
 return {scope,rows,history,req,email,now,lock,flags,seen,
  bind:()=>scope.study1SelfReportedAuthority_(req,{hasLock:()=>lock.held})};
}
test('No shared ScriptLock means no applicant PII read or server HMAC',()=>{
 const x=env();
 assert.throws(()=>x.bind(),/SELF_REPORT_SHARED_LOCK_REQUIRED/);
 assert.equal(x.seen.length,0);
});
test('Original E1 self-report + Email F:G generates server HMAC without documentary identity',()=>{
 const x=env();x.lock.held=true;
 const id=x.bind();
 assert.equal(id.verified,true);
 assert.equal(id.provenance,'STUDY1_E1_SELF_REPORT_OTP_HMAC');
 assert.equal(id.eligibilityEvidenceSource,'PARTICIPANT_SELF_REPORT');
 assert.equal(id.emailControlSource,'ORIGINAL_VERIFICATION_FG');
 assert.equal(id.screeningVersion,'REC_E1_V2');
 assert.equal(id.verifiedAtUtc,x.rows.Verification[6]);
 assert.match(id.evidenceSha256,/^[a-f0-9]{64}$/);
 assert.match(id.eligibilityEvidenceSha256,/^[a-f0-9]{64}$/);
 assert.equal(id.consentProcedureApproved,false);
 for(const field of ['age18OrOlderVerified','cycuStudentVerified','verifierId','identityCard','studentCard'])
  assert.equal(Object.hasOwn(id,field),false);
 assert.equal(JSON.stringify(id).includes('合成自陳參與者'),false);
});
test('Independent remote-consent REC scope is still a separate mandatory gate',()=>{
 const x=env();x.lock.held=true;
 assert.equal(x.bind().consentProcedureApproved,false);
 x.flags.set('STUDY1_E1_REMOTE_CONSENT_REC_SCOPE_VERIFIED','true');
 assert.equal(x.bind().consentProcedureApproved,true);
});
test('E2 never inherits E1 self-report, even with same original applicant',()=>{
 const x=env();x.lock.held=true;x.req.experiment='E2';
 assert.throws(()=>x.bind(),/EXPERIMENT_NOT_OPEN/);
 assert.equal(x.seen.length,0);
});
test('Applicant must have MAIL verified status and self-reported eligible Screenings',()=>{
 for(const mutation of [
  x=>{x.rows.Applicants[6]='VERIFIED'},
  x=>{x.rows.Applicants[6]='PENDING_EMAIL'},
  x=>{x.rows.Screenings[3]='PENDING_REVIEW'},
  x=>{x.rows.Screenings[5]='STAFF_CHECKED_ID'},
  x=>{x.rows.Screenings[2]='OLD_SCREENING_V1'}
 ]){
  const x=env();x.lock.held=true;mutation(x);
  assert.throws(()=>x.bind(),/SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID/);
 }
});
test('Wrong mailbox, unused F:G, changed screening identity and stale OTP are denied',()=>{
 for(const mutation of [
  x=>{x.rows.Verification[7]='attacker@example.org'},
  x=>{x.rows.Verification[6]=''},
  x=>{x.rows.Verification[1]='APP_OTHER_123456789'},
  x=>{x.rows.Verification[5]=0},
  x=>{x.rows.Verification[6]=iso(x.now,-3600000)},
  x=>{x.rows.Verification[3]='tampered'}
 ]){
  const x=env();x.lock.held=true;mutation(x);
  assert.throws(()=>x.bind());
 }
});
test('Newer issue invalidates the consumed challenge; original evidence SHA changes',()=>{
 const x=env();x.lock.held=true;const previous=x.bind();
 x.history.push(['CHL_OTHER_123456789',x.req.applicantId,'EMAIL_VERIFICATION',
  'c'.repeat(64),iso(x.now,360000),0,'',x.email,iso(x.now,-10000)]);
 assert.throws(()=>x.bind(),/SELF_REPORT_EMAIL_OTP_SUPERSEDED/);
 x.history.pop();
 x.rows.Screenings[4]=iso(x.now,-6900000);
 assert.notEqual(x.bind().eligibilityEvidenceSha256,previous.eligibilityEvidenceSha256);
 assert.notEqual(x.bind().evidenceSha256,previous.evidenceSha256);
});
