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
 assert.equal(b.remoteElectronicConsentApproved,false);
 assert.equal(b.emailOtpProvesLegalIdentity,false);
 assert.equal(b.e2MustNotHaveParticipatedE1,true);
});
test('All feature flags, owner privileges, and synthetic E1/E2 values cannot authorize online invitation',()=>{
 const h=isolated();
 for(const input of [
  {experiment:'E1'},
  {experiment:'E2'},
  {applicantId:'APP_12345678',challengeId:'CHAL_12345678',
   documentSha:'f'.repeat(64),documentVersion:'Version02',
   experiment:'E1',reservationId:'RSV_12345678',screeningId:'SCR_12345678',
   slotId:'SLOT_12345678'}
 ]){
  assert.throws(()=>h.scope.study1EConsentIssueBound_(input),
   /REC_REVIEW_REQUIRED.*網路電子簽署/);
 }
 assert.equal(h.externalIO,0);
});
test('PDF handwritten online signature never writes evidence without a REC-approved amendment',async()=>{
 const h=isolated();
 await assert.rejects(h.scope.study1EConsentSignPdf({
  token:'attacker',name:'TEST',documentSha:'a'.repeat(64),
  signature:'fake',agree:true,read:true,answerAcknowledged:true
 }),/REC_REVIEW_REQUIRED.*網路電子簽署/);
 assert.equal(h.externalIO,0);
});
test('OTP and email/phone are contact checks, not a REC-sanctioned real-world identity attestation',()=>{
 const h=isolated();
 assert.throws(()=>h.scope.study1EConsentIdentityAttestation_({
  applicantId:'APP_12345678',email:'participant@example.org',otpVerified:true
 }),/REC_REVIEW_REQUIRED/);
 assert.equal(h.externalIO,0);
});
