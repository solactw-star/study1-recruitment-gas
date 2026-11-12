'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=['Study1EConsentBinding.js','Study1ParticipantIntake.js','Study1WizardEnrollment.js']
 .map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
function harness({enabled=true}={}){
 let locked=false,writeCount=0;const opened=[],issued=[];
 const flags=new Map();
 for(const key of ['STUDY1_WIZARD_APPLICANT_CREATE_APPROVED','STUDY1_ECONSENT_OTP_ISSUE_APPROVED'])
  flags.set(key,enabled?'true':'false');
 const id='APP_SYNTH_12345678',screenId='SCR_SYNTH_12345678';
 const input={adult:true,cycu:true,noDx:true,noPractice:true,noTreatment:true,
  experiment:'E1',name:'合成自陳申請者',email:'synthetic@example.org',phone:'',
  requestId:'REQ_SELF_REPORT_123456789',humanToken:'SYNTHETIC_HUMAN_PROOF_123456789'};
 const app=[id,'合成自陳申請者','synthetic@example.org','',
  '2026-11-10T00:00:00.000Z','2026-11-10T00:01:00.000Z','PENDING_EMAIL'];
 const screening=[screenId,id,'E1_REC_V1','ELIGIBLE',
  '2026-11-10T00:00:02.000Z','PARTICIPANT_SELF_REPORT'];
 const ctx={
  Date,JSON,Array,Object,String,Number,Math,Error,Set,
  SITE_RESOURCES_:{personal:'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
   operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked)return false;locked=true;return true},
   hasLock:()=>locked,releaseLock:()=>{locked=false}
  })},
  SpreadsheetApp:{openById:ref=>{opened.push(ref);return {}}},
  MailApp:{sendEmail:()=>{throw Error('No direct mail in old wizard')}}
 };
 const scope=vm.createContext(ctx);vm.runInContext(source,scope,{timeout:3000});
 scope.study1BindingGate_=()=>{if(!enabled)throw Error('BACKEND_NOT_READY')};
 scope.study1ParticipantBegin_=request=>{
  writeCount++;
  return {accepted:true,created:true,applicantId:id,screeningId:screenId,
   phase:'PENDING_EMAIL',request};
 };
 scope.study1BindingSheetRow_=(_book,tab,headers,key)=>{
  const row=tab==='Applicants'?app:tab==='Screenings'?screening:null;
  if(!row||row[0]!==key)throw Error('ORIGINAL_APPLICATION_NOT_FOUND');
  return {rows:[row.slice()]};
 };
 scope.study1ParticipantRecPolicy_=()=>({screeningVersion:'E1_REC_V1'});
 scope.study1ParticipantVerifiedPolicy_=p=>p;
 scope.study1ParticipantOtpSend_=r=>{issued.push(r);return {sent:true,challengeId:'CHL_TEST_12345678'}};
 const send=(payload={applicantId:id,screeningId:screenId,experiment:'E1',
  requestId:'REQ_SEND_SELF_REPORT_123456789'})=>scope.study1WizardOtpSendBound_(payload);
 return {scope,flags,input,id,screenId,app,screening,send,opened,issued,
  get locked(){return locked},set locked(x){locked=x},
  get writeCount(){return writeCount}};
}
test('Closed original legacy entry fails before any formal applicant record read',()=>{
 const h=harness({enabled:false});
 assert.throws(()=>h.scope.study1WizardCreateApplication_(h.input),/BACKEND_NOT_READY/);
 assert.throws(()=>h.send(),/BACKEND_NOT_READY/);
 assert.equal(h.opened.length,0);assert.equal(h.writeCount,0);
});
test('Original wizard application delegates to the one real E1 intake writer',()=>{
 const h=harness(),created=h.scope.study1WizardCreateApplication_(h.input);
 assert.equal(created.created,true);
 assert.equal(created.applicantId,h.id);
 assert.equal(created.screeningId,h.screenId);
 assert.equal(created.request.adult,true);
 assert.equal(created.request.cycu,true);
 assert.equal(h.writeCount,1);
});
test('A failed self-reported eligibility declaration is rejected before any write',()=>{
 const h=harness();
 const result=h.scope.study1WizardCreateApplication_({...h.input,noDx:false});
 assert.equal(result.accepted,false);
 assert.equal(result.reason,'SCREENING_NOT_ELIGIBLE');
 assert.equal(h.writeCount,0);assert.equal(h.opened.length,0);
});
test('No documentary identity source, student card or researcher approval is requested',()=>{
 const h=harness();
 const att=h.scope.study1WizardIntakeAuthority_(h.input);
 assert.equal(att.accepted,true);
 assert.equal(att.experiment,'E1');
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../gas/Study1WizardEnrollment.js'),'utf8'),
  /REC_APPROVED_IDENTITY_ATTESTATION|age18OrOlderVerified|cycuStudentVerified|studentCardNumber/);
});
test('E2 cannot enter the E1 self-report registration path',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1WizardCreateApplication_({...h.input,experiment:'E2'}),/EXPERIMENT_NOT_OPEN/);
 assert.equal(h.writeCount,0);
});
test('Invalid one-time request ID and omitted self-report fields fail before delegation',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1WizardCreateApplication_({...h.input,requestId:'a'}));
 const wrong={...h.input};delete wrong.cycu;
 assert.throws(()=>h.scope.study1WizardCreateApplication_(wrong));
 assert.equal(h.writeCount,0);
});
test('Original OTP send is bound to the original pending applicant and self-report only',()=>{
 const h=harness(),result=h.send();
 assert.equal(result.sent,true);
 assert.equal(h.issued.length,1);
 assert.equal(h.issued[0].email,'synthetic@example.org');
 assert.equal(h.issued[0].experiment,'E1');
 assert.equal(h.issued[0].applicantId,h.id);
 assert.equal(h.issued[0].screeningId,h.screenId);
 assert.equal(h.opened.length,1);
 assert.equal(h.locked,false);
});
test('Cross-application, ineligible and E2 OTP requests never delegate to MailApp',()=>{
 const h=harness();
 for(const p of [
  {experiment:'E2'}, {applicantId:'APP_ATTACK_12345678'},
  {screeningId:'SCR_ATTACK_12345678'}
 ]){
  assert.throws(()=>h.send({applicantId:h.id,screeningId:h.screenId,
   experiment:'E1',requestId:'REQ_SEND_SELF_REPORT_123456789',...p}));
 }
 h.screening[5]='STAFF_CARD_CHECK';
 assert.throws(()=>h.send(),/自陳資格/);
 assert.equal(h.issued.length,0);
});
test('OTP source lock contention and approval revocation abort with no mail',()=>{
 const h=harness();h.locked=true;
 assert.throws(()=>h.send(),/OTP申請來源共用鎖/);
 h.locked=false;
 h.flags.set('STUDY1_ECONSENT_OTP_ISSUE_APPROVED','false');
 assert.throws(()=>h.send(),/OTP_ISSUE_NOT_READY/);
 assert.equal(h.issued.length,0);assert.equal(h.locked,false);
});
