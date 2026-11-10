'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const src=['Study1EConsentBinding.js','Study1ParticipantTrust.js']
 .map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidenceA=Buffer.from('synthetic approval evidence for offline source test'.repeat(5));
const evidenceB=Buffer.from('synthetic consent evidence for offline source test, distinct'.repeat(5));
function harness({configured=true}={}){
 const props=new Map(),docs=new Map([['APPROVAL_SOURCE_12345',evidenceA],
  ['CONSENT_SOURCE_12345',evidenceB]]);
 let calls=0,replies=[],reads=[];
 const now=new Date(),earlier=new Date(now.getTime()-3600000),
  future=new Date(now.getTime()+3600000*24*60);
 const policy={approvalDocumentId:'APPROVAL_SOURCE_12345',
  approvalDocumentSha256:sha(evidenceA),
  approvalReference:'202604EM033-WEB-INTAKE-EXAMPLE',
  approved:true,approvedAtUtc:earlier.toISOString(),
  consentDocumentId:'CONSENT_SOURCE_12345',
  consentDocumentSha256:sha(evidenceB),
  experiment:'E1',provenance:'PI_REVIEWED_EFFECTIVE_REC_DOCUMENTS',
  reviewedBy:'SYNTHETIC_PI_OFFLINE_ONLY',scope:'E1_WEB_PRESCREEN_GOOGLE_SHEETS_PII',
  screeningVersion:'E1_REC_TEST_01',validThroughUtc:future.toISOString()};
 if(configured){
  props.set('STUDY1_E1_REC_WEB_INTAKE_POLICY_V1',JSON.stringify(policy));
  props.set('STUDY1_E1_TURNSTILE_SITEKEY','REALLOOKING_SITEKEY_ABCDEFGHIJKLMNOP');
  props.set('STUDY1_E1_TURNSTILE_SECRET','REALLOOKING_SECRET_ABCDEFGHIJKLMNOP');
  props.set('STUDY1_E1_TURNSTILE_HOSTNAME','script.google.com');
 }
 props.set('STUDY1_ECONSENT_BINDING_HMAC_KEY','test-unique-signature-key-48-symbols-for-offline-only');
 const ctx={
  JSON,Date,Array,Object,Number,Math,Error,String,Set,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null})},
  Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'SHA-256'},
   computeDigest:(algo,b)=>{assert.equal(algo,'SHA-256');
    return [...crypto.createHash('sha256').update(Buffer.from(b)).digest()]
     .map(n=>n>127?n-256:n)},
   computeHmacSha256Signature:(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()]},
  DriveApp:{getFileById:id=>{
   reads.push(id);const bytes=docs.get(id);
   if(!bytes)throw Error('missing evidence');
   return {getSize:()=>bytes.length,getBlob:()=>({getBytes:()=>[...bytes]})};
  }},
  UrlFetchApp:{fetch:(url,options)=>{
   calls++;
   assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
   assert.equal(options.method,'post');
   assert.equal(options.contentType,'application/json');
   const request=JSON.parse(options.payload);
   assert.equal(request.secret,props.get('STUDY1_E1_TURNSTILE_SECRET'));
   assert.equal(request.response,'SYNTHETIC_TOKEN_FOR_UNIT_TESTS_12345678');
   assert.deepEqual(Object.keys(request).sort(),['response','secret']);
   const response=replies.length?replies.shift():{
    success:true,hostname:'script.google.com',action:'study1_e1_apply',
    challenge_ts:new Date().toISOString()};
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)};
  }}
 };
 const scope=vm.createContext(ctx);
 vm.runInContext(src,scope,{timeout:4000});
 const request={requestId:'REQ_SYNTH_HUMAN_000000001',
  humanToken:'SYNTHETIC_TOKEN_FOR_UNIT_TESTS_12345678'};
 return {scope,props,docs,policy,reads,replies,request,get calls(){return calls}};
}
test('No effective policy or Turnstile configuration fails before network and consent reads',()=>{
 const x=harness({configured:false});
 assert.throws(()=>x.scope.study1ParticipantRecSource_(),/REC_INTAKE_POLICY_NOT_CONFIGURED/);
 assert.throws(()=>x.scope.study1ParticipantTurnstileConfig_(),/BOT_PROTECTION_PROVIDER_NOT_READY/);
 assert.equal(x.reads.length,0);assert.equal(x.calls,0);
});
test('Pinned independent REC approval + consent bytes validate only with explicit scope',()=>{
 const x=harness();
 const p=x.scope.study1ParticipantRecSource_();
 assert.equal(p.experiment,'E1');assert.equal(p.allowsProspectiveIntake,true);
 assert.equal(p.allowsPrivateSheetsStorage,true);
 assert.deepEqual(x.reads,['APPROVAL_SOURCE_12345','CONSENT_SOURCE_12345']);
 x.policy.scope='ANYTHING_OTHER_THAN_E1_WEB_INTAKE';
 x.props.set('STUDY1_E1_REC_WEB_INTAKE_POLICY_V1',JSON.stringify(x.policy));
 assert.throws(()=>x.scope.study1ParticipantRecSource_(),/REC_INTAKE_SCOPE_NOT_APPROVED/);
});
test('REC consent sha mismatch, copied approval and expired effective scope fail closed',()=>{
 const x=harness();
 x.docs.set('CONSENT_SOURCE_12345',Buffer.from('X'.repeat(evidenceB.length)));
 assert.throws(()=>x.scope.study1ParticipantRecSource_(),/REC_EVIDENCE_SHA_MISMATCH/);
 x.docs.set('CONSENT_SOURCE_12345',evidenceB);
 x.policy.approvalDocumentId=x.policy.consentDocumentId;
 x.props.set('STUDY1_E1_REC_WEB_INTAKE_POLICY_V1',JSON.stringify(x.policy));
 assert.throws(()=>x.scope.study1ParticipantRecSource_(),/REC_EVIDENCE_NOT_INDEPENDENT/);
 x.policy.approvalDocumentId='APPROVAL_SOURCE_12345';
 x.policy.validThroughUtc=new Date(Date.now()-10000).toISOString();
 x.props.set('STUDY1_E1_REC_WEB_INTAKE_POLICY_V1',JSON.stringify(x.policy));
 assert.throws(()=>x.scope.study1ParticipantRecSource_(),/REC_INTAKE_APPROVAL_NOT_EFFECTIVE/);
});
test('Turnstile accepts one valid bounded token after independent provider Siteverify only',()=>{
 const x=harness();
 const proof=x.scope.study1ParticipantTurnstileCheck_(x.request);
 assert.equal(proof.allowed,true);
 assert.equal(proof.requestId,x.request.requestId);
 assert.match(proof.configHmac,/^[a-f0-9]{64}$/);
 assert.match(proof.verificationHmac,/^[a-f0-9]{64}$/);
 assert.equal(x.calls,1);
 assert.equal(x.scope.study1ParticipantAbuseRecheck_(proof,x.request),true);
 assert.equal(x.calls,1,'recheck must never redeem a one-time token twice');
});
test('Wrong hostname or action, stale challenge, failed success are rejected',()=>{
 const variants=[
  {success:true,hostname:'attacker.example',action:'study1_e1_apply',challenge_ts:new Date().toISOString()},
  {success:true,hostname:'script.google.com',action:'something_else',challenge_ts:new Date().toISOString()},
  {success:true,hostname:'script.google.com',action:'study1_e1_apply',challenge_ts:new Date(Date.now()-3600000).toISOString()},
  {success:false,hostname:'script.google.com',action:'study1_e1_apply',challenge_ts:new Date().toISOString()}
 ];
 for(const result of variants){
  const x=harness();x.replies.push(result);
  assert.throws(()=>x.scope.study1ParticipantTurnstileCheck_(x.request),/BOT_PROTECTION_REJECTED/);
  assert.equal(x.calls,1);
 }
});
test('Bogus, absent and overlength human tokens fail before Siteverify',()=>{
 const x=harness();
 for(const token of ['',undefined,'a'.repeat(2049),'<script>alert(1)</script>']){
  assert.throws(()=>x.scope.study1ParticipantTurnstileCheck_({...x.request,humanToken:token}),
   /BOT_PROTECTION_TOKEN_INVALID/);
 }
 assert.equal(x.calls,0);
});
test('Cloudflare published test keys are refused as a real enrollment provider',()=>{
 const x=harness();x.props.set('STUDY1_E1_TURNSTILE_SITEKEY','1x00000000000000000000AA');
 assert.throws(()=>x.scope.study1ParticipantTurnstileConfig_(),/BOT_PROTECTION_PROVIDER_NOT_READY/);
});

test('Turnstile configuration rotation inside intake invalidates earlier grant without network replay',()=>{
 const x=harness();
 const proof=x.scope.study1ParticipantTurnstileCheck_(x.request);
 x.props.set('STUDY1_E1_TURNSTILE_SECRET','DIFFERENT_REVIEWED_SERVER_SECRET_ABCDEF12');
 assert.throws(()=>x.scope.study1ParticipantAbuseRecheck_(proof,x.request),
  /BOT_PROVIDER_CONFIG_CHANGED_DURING_INTAKE/);
 assert.equal(x.calls,1);
});
