'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../gas');
const binding=fs.readFileSync(path.join(dir,'Study1EConsentBinding.js'),'utf8');
const admin=fs.readFileSync(path.join(dir,'AdminSandbox.js'),'utf8');
function isolated(){
 let externalIO=0;
 const failIO=()=>{externalIO++;throw Error('External I/O must be impossible before REC approval');};
 const scope=vm.createContext({
  Date,JSON,Object,Array,String,Number,Set,Map,Error,Uint8Array,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'true'})},
  SpreadsheetApp:{openById:failIO},
  DriveApp:{getFileById:failIO,getFolderById:failIO},
  LockService:{getScriptLock:failIO},
  Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),
   getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})}
 });
 vm.runInContext(binding+'\n'+admin,scope,{timeout:3000});
 scope.study1AdminOwnerRequired_=()=>true;
 scope.study1EConsentEnabled_=()=>true;
 return {scope,get externalIO(){return externalIO}};
}
test('REC source-of-truth is NTU 202604EM033 2026-06-30 approval, 2026-05-11 oral/written consent',()=>{
 const h=isolated();
 const b=h.scope.STUDY1_REC_VERIFIED_BASELINE_;
 assert.equal(b.caseId,'202604EM033');
 assert.equal(b.approvalDate,'2026-06-30');
 assert.equal(b.validFrom,'2026-08-01');
 assert.equal(b.validThrough,'2027-07-31');
 assert.equal(b.consentVersionDate,'2026-05-11');
 assert.equal(b.protocolDate,'2026-05-19');
 assert.equal(b.certificateDriveId,'1O5rgS4q0_0wo9UNUD45kg5AEVnFCn2Iy');
 assert.equal(b.certificateSha256,
  'de6fb412f9f266c358f22744f20988e214633571843a1679d95d7c63a5a5eda4');
 assert.equal(b.approvedConsentProcedure,'RESEARCHER_EXPLANATION_AND_WRITTEN_SIGNATURE');
 assert.equal(b.remoteElectronicConsentApprovalStatus,'NOT_DETERMINED_BY_CERTIFICATE');
 assert.equal(b.emailOtpProvesLegalIdentity,false);
 assert.equal(b.e2MustNotHaveParticipatedE1,true);
});

test('Approved Study1 is not globally vetoed: invite follows real binding evidence checks',()=>{
 const h=isolated();
 h.scope.study1EConsentReadyDocument_=()=>({experiment:'E1',sha256:'f'.repeat(64),version:'Version02'});
 h.scope.LockService={getScriptLock:()=>({
  tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}
 })};
 const input={applicantId:'APP_12345678',challengeId:'CHAL_12345678',
  documentSha:'f'.repeat(64),documentVersion:'Version02',
  experiment:'E1',reservationId:'RSV_12345678',screeningId:'SCR_12345678',
  slotId:'SLOT_12345678'};
 // Its real, separate identity provider is still deliberately unconfigured;
 // this must not be expressed as a prohibition on the approved study.
 assert.throws(()=>h.scope.study1EConsentIssueBound_(input),
  /SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED/);
 assert.equal(h.externalIO,0);
});
test('PDF signing checks form input and independent source gates, not a blanket REC veto',async()=>{
 const h=isolated();
 await assert.rejects(h.scope.study1EConsentSignPdf({
  token:'attacker',name:'TEST',documentSha:'a'.repeat(64),
  signature:'INVALID*PNG',agree:true,read:true,answerAcknowledged:true
 }),/必須完成正式文件全文閱讀/);
 assert.equal(h.externalIO,0);
});
test('Legacy PNG route retains format and synthetic flag checks; no automatic live enablement',()=>{
 const h=isolated();
 assert.throws(()=>h.scope.study1EConsentSign({
  name:'TEST PERSON',token:'TEST',signature:'NOT_BASE64',
  documentSha:'a'.repeat(64),agree:true,read:true,answerAcknowledged:true
 }),/必須完成全文閱讀、說明確認/);
 assert.equal(h.externalIO,0);
});
test('CLOSED website still rejects both PDF and legacy signature paths',async()=>{
 const h=isolated();
 h.scope.study1EConsentEnabled_=()=>false;
 assert.throws(()=>h.scope.study1EConsentSign({}),/尚未開放有效電子簽署/);
 await assert.rejects(h.scope.study1EConsentSignPdf({}),/尚未開放有效電子簽署/);
 assert.equal(h.externalIO,0);
});
test('Email OTP alone cannot assert independent study-participant identity',()=>{
 const h=isolated();
 assert.throws(()=>h.scope.study1EConsentIdentityAttestation_({
  applicantId:'APP_12345678',email:'participant@example.org',otpVerified:true
 }),/SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED/);
 assert.equal(h.externalIO,0);
});
