'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const names=['OtpCore.js','OtpThrottle.js','OtpTransaction.js','Study1EConsentBinding.js',
 'Study1EConsentOtpAdapter.js','Study1WizardEnrollment.js'];
const scripts=names.map(n=>fs.readFileSync(path.join(__dirname,'../gas',n),'utf8')).join('\n');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI';
const O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const HEAD={
 Applicants:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
 Screenings:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
 Verification:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc']
};
function fixture({enabled=true,identity=true,experiment='E1',priorE1=false}={}){
 const clock={now:Date.now()},flags=new Map(),secret=crypto.randomBytes(48).toString('hex');
 const locked={on:false},mail=[],writes=[],opens=[];
 const records={Applicants:[],Screenings:[],Verification:[]};
 const person={email:'synthetic.study1@example.org',name:'合成受試者',
  experiment,screeningVersion:'SCN_01',applicantId:null,screeningId:null,
  approved:true,provenance:'REC_APPROVED_IDENTITY_ATTESTATION',
  age18OrOlderVerified:true,cycuStudentVerified:true,eligibilityVerified:true,
  eligibilityEvidenceSource:'REC_APPROVED_ELIGIBILITY_VERIFICATION',
  evidenceSha256:'a'.repeat(64),eligibilityEvidenceSha256:'b'.repeat(64),
  priorE1ParticipationVerified:true,priorE1Participation:priorE1,
  priorE1Source:'REC_APPROVED_STUDY_HISTORY',priorE1EvidenceSha256:'c'.repeat(64)};
 for(const k of ['OPEN','CONSENT_READY','STUDY1_ECONSENT_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED','STUDY1_ECONSENT_WIZARD_LINK_VERIFIED',
  'STUDY1_ECONSENT_IDENTITY_SOURCE_APPROVED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_ECONSENT_OTP_VERIFY_APPROVED','STUDY1_WIZARD_APPLICANT_CREATE_APPROVED',
  'STUDY1_ECONSENT_OTP_ISSUE_APPROVED'])flags.set(k,enabled?'true':'false');
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(48).toString('hex'));
 flags.set('STUDY1_OTP_HMAC_SECRET',secret);
 const sheet=kind=>{
  const rows=records[kind],headers=HEAD[kind];
  return {getLastColumn:()=>headers.length,getLastRow:()=>rows.length+1,
   appendRow:row=>{assert.equal(locked.on,true);rows.push(row.slice());writes.push({kind,op:'append'});},
   getRange:(r,c,h,w)=>({
    getValues:()=>Array.from({length:h},(_,i)=>{
     const row=r+i===1?headers:rows[r+i-2];
     assert.ok(row,'requested unallocated row '+kind+':'+(r+i));
     return row.slice(c-1,c+w-1);
    }),
    setValues:values=>{
     assert.equal(locked.on,true);
     assert.equal(kind,'Verification');assert.equal(c,6);assert.equal(w,2);
     rows[r-2][5]=values[0][0];rows[r-2][6]=values[0][1];
     writes.push({kind,op:'F:G',values:values[0].slice()});
    },
    createTextFinder:term=>{
     let exact=false,sensitive=true,regex=true;
     const api={
      matchEntireCell(x){exact=x;return api},
      matchCase(x){sensitive=x;return api},
      useRegularExpression(x){regex=x;return api},
      findAll(){
       assert.equal(exact,true);assert.equal(regex,false);
       return rows.map((row,i)=>({value:row[c-1],row:i+2}))
        .filter(x=>sensitive?x.value===term:String(x.value).toLowerCase()===term.toLowerCase())
        .map(x=>({getRow:()=>x.row,getColumn:()=>c}));
      }
     };return api;
    }
   })}
 };
 const books={getSheetByName:name=>HEAD[name]?sheet(name):null};
 class FakeDate extends Date{
  constructor(...args){if(args.length)super(...args);else super(clock.now)}
  static now(){return clock.now}
 }
 const context={
  Date:FakeDate,Array,Object,JSON,Number,String,Boolean,Math,Set,Error,
  SITE_RESOURCES_:{personal:P,operations:O},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  Utilities:{Charset:{UTF_8:'utf8'},
   computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',key).update(data).digest()],
   getUuid:()=>crypto.randomUUID()},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked.on)return false;locked.on=true;return true},
   hasLock:()=>locked.on,releaseLock:()=>{locked.on=false}
  })},
  SpreadsheetApp:{openById:id=>{assert.equal(id,P);opens.push('personal');return books},
   flush:()=>writes.push({op:'flush'})},
  MailApp:{sendEmail:msg=>{assert.equal(locked.on,true);mail.push(msg)}}
 };
 const scope=vm.createContext(context);
 vm.runInContext(scripts,scope,{timeout:4000});
 scope.study1AdminOwnerRequired_=()=>true;
 if(identity){
  scope.study1WizardIntakeAuthority_=()=>person;
  scope.study1EConsentOtpApplicantAuthorization_=()=>({
   applicantId:person.applicantId,screeningId:person.screeningId,
   experiment:person.experiment,email:person.email,
   screeningVersion:person.screeningVersion,
   provenance:'REC_APPROVED_APPLICANT_SCREENING',approved:true
  });
 }
 const applicantRequest={email:person.email,name:person.name,phone:'',
  experiment:person.experiment,requestId:'REQ_APP_SYNTHETIC_12345'};
 const create=()=>{const created=scope.study1WizardCreateApplication_(applicantRequest);
  person.applicantId=created.applicantId;person.screeningId=created.screeningId;
  return created};
 const send=(id='REQ_SEND_SYNTHETIC_12345')=>scope.study1WizardOtpSendBound_({
  applicantId:person.applicantId,screeningId:person.screeningId,
  experiment:person.experiment,requestId:id});
 const verify=(challengeId,code)=>scope.study1EConsentVerifyContactOtp_({
  applicantId:person.applicantId,screeningId:person.screeningId,
  experiment:person.experiment,challengeId,code});
 return {scope,person,clock,flags,records,locked,mail,writes,opens,create,send,verify};
}
test('No source or flags -> no PII Sheet open, no applicant and no email',()=>{
 const blocked=fixture({enabled:false});
 assert.throws(()=>blocked.create(),/BACKEND_NOT_READY|APPLICATION_NOT_READY/);
 assert.equal(blocked.opens.length,0);assert.equal(blocked.mail.length,0);
 const noIdentity=fixture({identity:false});
 assert.throws(()=>noIdentity.create(),/IDENTITY_SOURCE_NOT_CONFIGURED/);
 assert.equal(noIdentity.opens.length,0);assert.equal(noIdentity.mail.length,0);
});
test('Original Applicants and Screenings append under shared lock and verify exact rows',()=>{
 const x=fixture(),out=x.create();
 assert.equal(out.created,true);
 assert.match(out.applicantId,/^APP_[0-9a-f]{28}$/);
 assert.match(out.screeningId,/^SCR_[0-9a-f]{28}$/);
 assert.equal(x.records.Applicants.length,1);
 assert.equal(x.records.Applicants[0].length,HEAD.Applicants.length);
 assert.equal(x.records.Applicants[0][6],'VERIFIED');
 assert.equal(x.records.Screenings[0][1],out.applicantId);
 assert.equal(x.records.Screenings[0][3],'ELIGIBLE');
 assert.equal(x.writes.filter(x=>x.op==='flush').length,2);
 const replay=x.create();assert.equal(replay.created,false);
 assert.equal(x.records.Applicants.length,1);
 assert.equal(x.records.Screenings.length,1);
});
test('Cross-experiment, E2 prior E1 and self-attestation cannot create identity',()=>{
 const x=fixture({experiment:'E2',priorE1:true});
 assert.throws(()=>x.create(),/ELIGIBILITY_EVIDENCE_MISSING/);
 assert.equal(x.opens.length,0);
 const y=fixture();y.person.age18OrOlderVerified=false;
 assert.throws(()=>y.create(),/IDENTITY_EVIDENCE_INVALID/);
 y.person.age18OrOlderVerified=true;y.person.experiment='E2';
 assert.throws(()=>y.create(),/IDENTITY_EVIDENCE_INVALID/);
 assert.equal(y.records.Applicants.length,0);
});
test('Original Verification A:I challenge HMAC, real MailApp signature and F:G once use',()=>{
 const x=fixture();x.create();
 const sent=x.send();assert.equal(sent.sent,true);
 assert.equal(x.mail.length,1);assert.equal(x.records.Verification.length,1);
 const row=x.records.Verification[0];
 assert.equal(row.length,9);assert.equal(row[5],0);assert.equal(row[6],'');
 assert.match(row[3],/^[a-f0-9]{64}$/);
 const code=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 assert.notEqual(code,'00000000');
 assert.equal(JSON.stringify(row).includes(code),false);
 assert.equal(JSON.stringify(sent).includes(code),false);
 const done=x.verify(sent.challengeId,code);
 assert.equal(done.verified,true);assert.equal(done.reason,'VERIFIED');
 assert.equal(row[5],1);assert.match(row[6],/^20\d\d/);
 assert.equal(x.writes.filter(z=>z.op==='F:G').length,1);
 assert.equal(x.verify(sent.challengeId,code).verified,false);
 assert.equal(x.writes.filter(z=>z.op==='F:G').length,1);
});
test('Same requestId never sends twice; immediate different request is throttled',()=>{
 const x=fixture();x.create();const first=x.send();
 assert.equal(x.send().reason,'ALREADY_ISSUED');
 assert.equal(x.send('REQ_SEND_SECOND_123456789').reason,'THROTTLED');
 assert.equal(x.mail.length,1);
 assert.equal(x.records.Verification.length,1);
 assert.equal(x.records.Verification[0][5],0);
});
test('Resend new challenge invalidates old code even while its expiry is valid',()=>{
 const x=fixture();x.create();
 const first=x.send();
 const old=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 x.clock.now+=62000;
 const next=x.send('REQ_SEND_SECOND_123456789');
 assert.equal(next.sent,true);assert.notEqual(next.challengeId,first.challengeId);
 assert.equal(x.mail.length,2);
 assert.throws(()=>x.verify(first.challengeId,old),/OTP_SUPERSEDED/);
 const code=x.mail[1].body.match(/驗證碼：(\d{8})/)[1];
 assert.equal(x.verify(next.challengeId,code).verified,true);
});
test('After three challenges in an hour a fourth is throttled',()=>{
 const x=fixture();x.create();
 assert.equal(x.send().sent,true);
 x.clock.now+=62000;assert.equal(x.send('REQ_SEND_SECOND_123456789').sent,true);
 x.clock.now+=62000;assert.equal(x.send('REQ_SEND_THIRD_123456789').sent,true);
 x.clock.now+=62000;
 const last=x.send('REQ_SEND_FOURTH_123456789');
 assert.equal(last.sent,false);assert.equal(last.reason,'THROTTLED');
 assert.equal(x.mail.length,3);assert.equal(x.records.Verification.length,3);
});
test('Lock competition and revoked approval prevent mutations and sending',()=>{
 const x=fixture();x.locked.on=true;
 assert.throws(()=>x.create(),/申請共用鎖/);
 assert.equal(x.records.Applicants.length,0);
 x.locked.on=false;x.create();
 x.locked.on=true;assert.throws(()=>x.send(),/OTP全域鎖/);
 assert.equal(x.records.Verification.length,0);
 x.locked.on=false;
 x.flags.set('STUDY1_ECONSENT_OTP_ISSUE_APPROVED','false');
 assert.throws(()=>x.send(),/OTP_ISSUE_NOT_READY/);
 assert.equal(x.mail.length,0);
});
test('Partial write never claims applicant created and cannot silently retry',()=>{
 const x=fixture();
 x.records.Applicants.push(['APP_UNRELATED_12345','X','x@example.org','',
  new Date().toISOString(),new Date().toISOString(),'PENDING']);
 const result=x.create();assert.equal(result.created,true);
 x.records.Screenings.pop();
 assert.throws(()=>x.create(),/APPLICATION_PARTIAL_WRITE_REQUIRES_REVIEW/);
 assert.equal(x.records.Applicants.length,2);
});
