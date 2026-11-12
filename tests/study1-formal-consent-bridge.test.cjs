'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/Study1FormalConsent.js'),'utf8');
const id='SLOT_OFFLINE_0001',rid='RSV_OFFLINE_0001',app='APP_OFFLINE_0001';
const sha='a'.repeat(64),pin='b'.repeat(64);
function harness(){
 const t=Date.now(),now=n=>new Date(t+n).toISOString();
 const doc={id:'PDF_APPROVED_OFFLINE',experiment:'E1',sha256:sha,version:'V1',researcherPresigned:true};
 const rows=[[rid,app,id,'HELD',now(600000),'HOLD_KEY',now(-60000),'','',now(-60000)]];
 const slots=[[id,now(3600000),now(7200000),2,'TEST','OPEN','OWNER','']];
 const props=new Map([
  ['OPEN','true'],['CONSENT_READY','true'],
  ['STUDY1_E1_REMOTE_CONSENT_REC_SCOPE_VERIFIED','true'],
  ...['STUDY1_ECONSENT_PROVIDER_VERIFIED','STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED',
     'STUDY1_ECONSENT_WIZARD_LINK_VERIFIED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
     'STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','STUDY1_E1_SLOT_REGISTRY_APPROVED']
     .map(k=>[k,'true'])
 ]);
 const policy={approvalDocumentId:'REC_APPROVED_OFFLINE',approvalDocumentSha256:pin,
  approved:true,approvedAtUtc:now(-3600000),consentDocumentId:doc.id,
  consentDocumentSha256:sha,experiment:'E1',reviewedBy:'PI_RESEARCHER',
  scope:'202604EM033_E1_REMOTE_PDF_SIGN_AND_COPY',validThroughUtc:now(86400000)};
 props.set('STUDY1_E1_REMOTE_CONSENT_POLICY_V1',JSON.stringify(policy));
 const seen={writes:0,adapter:[],snapshot:0,slot:0,original:[],piReads:0},registry={schemaVersion:1,revision:0,records:[]};
 let held=false,actor=app,access='PRIVATE';
 const lock={tryLock:()=>{held=true;return true;},hasLock:()=>held,
  releaseLock:()=>{held=false;}};
 const hmac=()=>('f'.repeat(64));
 const scope={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null})},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:id=>{
   seen.piReads++;return {getSharingAccess:()=>access};
  }},
  study1TrustApprovedFile_:(id,sourceSha)=>{
   seen.original.push([id,sourceSha]);
   if(!['REC_APPROVED_OFFLINE','PDF_APPROVED_OFFLINE'].includes(id))throw Error('source mismatch');
  },
  study1BindingUtc_:v=>{const m=Date.parse(v);if(!Number.isFinite(m))throw Error('timestamp invalid');return m;},
  study1ParticipantGate_:()=>{if(props.get('OPEN')!=='true')throw Error('CLOSED');},
  study1BindingId_:v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(v))throw Error('bad id');return v;},
  study1FormalWithLock_:(proof,fn)=>{
   if(proof!=='MAIL_PROOF')throw Error('EMAIL_OTP_PROOF_INVALID');
   if(!lock.tryLock())throw Error('LOCK_BUSY');
   try{return fn({identity:{applicantId:actor,screeningId:'SCR_OFFLINE_0001',
      challengeId:'CHAL_OFFLINE_0001',experiment:'E1',evidenceSha256:'c'.repeat(64)},
      nowUtc:now(0),snapshot:{reservations:{rows},slots:{rows:slots}},lock});}
   finally{lock.releaseLock();}
  },
  study1FormalSlot_:(ctx,slotId)=>{seen.slot++;if(slotId!==id||slots[0][0]!==slotId)throw Error('untrusted slot');return slots[0];},
  study1EConsentReadyDocument_:(experiment)=>{if(experiment!=='E1')throw Error('E2 blocked');return doc;},
  study1PdfLayoutRead_:()=>({verified:true}),
  study1PdfResearcherLayoutRead_:()=>({verified:true}),
  study1ConsentDocumentBytes_:()=>[...Buffer.from('%PDF-'+('SYNTHETIC REC ORIGINAL '.repeat(10)))],
  study1BindingRecheck_:(_binding,_doc,_adapter,_now,lockObj)=>{
   if(lockObj!==lock||!held||rows[0][3]!=='HELD'||Date.parse(rows[0][4])<=Date.now())
    throw Error('FORMAL_ORIGINAL_PDF_BOOKING_CHANGED');
   return true;
  },
  study1EConsentBindingAdapter_:(audience)=>{
   seen.adapter.push(audience);
   if(audience!=='PUBLIC_E1')throw Error('WRONG_AUDIENCE');
   return {readTrustedSnapshot:(input,lockObj)=>{if(lockObj!==lock||!held)throw Error('UNLOCKED');
    seen.snapshot++;return {identity:{evidenceSha256:'c'.repeat(64)},request:input};}};
  },
  study1BindingVerify_:(snap,input,source)=>{
   if(input.reservationId!==rid||input.slotId!==id||input.documentSha!==sha||source!==doc)
    throw Error('BINDING_SOURCE_INVALID');
   return {applicantId:input.applicantId,reservationId:rid,identityEvidenceSha:'c'.repeat(64),
    holdUntilUtc:rows[0][4]};
  },
  study1BindingDigest_:hmac,
  study1EConsentRegistry_:()=>registry,
  STUDY1_ECONSENT_MAX_RECORDS_:50,
  study1EConsentHash_:()=>('d'.repeat(64)),
  study1EConsentWrite_:(before,after)=>{
   if(!held||after.revision!==before.revision+1)throw Error('CAS_NOT_LOCKED');
   seen.writes++;registry.revision=after.revision;registry.records=after.records;
  },
  study1EConsentEntry_:()=>{if(!registry.records.length)throw Error('TOKEN_INVALID');return registry.records[0];},
  study1EConsentSession_:()=>({state:'ISSUED'}),
  study1EConsentSession:()=>({explanation:null}),
  LockService:{getScriptLock:()=>lock},
  Utilities:{getUuid:(()=>{let i=0;return ()=>('aaaaaa'+String(++i).padStart(2,'0')+'-bbbb-4ccc-8ddd-000000000001');})(),
   base64Encode:bytes=>Buffer.from(bytes).toString('base64')},
  Date,Number,String,Array,Object,JSON,Error,Set,Math,
 };
 vm.createContext(scope);vm.runInContext(src,scope);
 return {scope,rows,slots,props,seen,registry,doc,policy,
  actor:v=>{actor=v;},access:v=>{access=v;}};
}
test('FORMAL remote REC gate rejects missing policy, disabled switch, untrusted ACL and E2',()=>{
 const h=harness();
 h.props.delete('STUDY1_E1_REMOTE_CONSENT_POLICY_V1');
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/NOT_CONFIGURED/);
 h.props.set('STUDY1_E1_REMOTE_CONSENT_POLICY_V1',JSON.stringify({...h.policy,experiment:'E2'}));
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/POLICY_INVALID/);
 h.props.set('STUDY1_E1_REMOTE_CONSENT_POLICY_V1',JSON.stringify(h.policy));
 h.access('ANYONE');
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/ACL_NOT_PRIVATE/);
 assert.equal(h.seen.writes,0);
});
test('single valid self-declared E1 applicant and HELD reservation generate an unconfirmed one-use invitation',()=>{
 const h=harness();
 const result=h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid});
 assert.equal(result.state,'ISSUED');
 assert.equal(result.signatureAccepted,false);
 assert.equal(result.needsResearcherExplanation,false);
 assert.equal(result.researcherPresigned,true);
 assert.equal(result.documentSha256,sha);
 assert.equal(h.registry.records.length,1);
 assert.equal(h.registry.records[0].channel,'FORMAL_E1');
 assert.equal(h.seen.writes,1);
 assert.equal(h.seen.snapshot,1);
 assert.deepEqual(h.seen.adapter,['PUBLIC_E1']);
 assert.ok(h.seen.piReads>=2);
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/ALREADY_ISSUED/);
 assert.equal(h.seen.writes,1);
});
test('a different applicant, altered or expired reservation cannot issue a PDF invitation',()=>{
 const h=harness();
 h.actor('APP_OTHER_0001');
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/NO_CURRENT_PERSONAL_HOLD/);
 h.actor(app);h.rows[0][3]='WAITLISTED';
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/NO_CURRENT_PERSONAL_HOLD/);
 h.rows[0][3]='HELD';h.rows[0][4]=new Date(Date.now()-1000).toISOString();
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/NO_CURRENT_PERSONAL_HOLD/);
 assert.equal(h.seen.writes,0);
});
test('mutated PDF SHA, missing original slot and counterfeit Email OTP are rejected with no registry write',()=>{
 const h=harness();
 h.policy.consentDocumentSha256='e'.repeat(64);
 h.props.set('STUDY1_E1_REMOTE_CONSENT_POLICY_V1',JSON.stringify(h.policy));
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/PDF_VERSION_MISMATCH/);
 h.policy.consentDocumentSha256=sha;
 h.props.set('STUDY1_E1_REMOTE_CONSENT_POLICY_V1',JSON.stringify(h.policy));
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'BAD',reservationId:rid}),/EMAIL_OTP_PROOF_INVALID/);
 h.slots[0][0]='MOVED_SLOT';
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),/untrusted slot/);
 assert.equal(h.seen.writes,0);
});
test('signed or confirmed status cannot bypass binding or proof gates',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1FormalConsentStatus('wrong token'),/TOKEN_INVALID/);
 h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid});
 const r=h.scope.study1FormalConsentStatus('TOKEN');
 assert.equal(r.state,'ISSUED');
 assert.equal(r.copyAvailable,false);assert.equal(r.staffConfirmed,false);
 h.props.set('OPEN','false');
 assert.throws(()=>h.scope.study1FormalConsentStatus('TOKEN'),/CLOSED/);
});

test('copy TTL is never implicit: PI must approve a finite 1–720 hour window',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1FormalConsentCopyExpiry_(),/WINDOW_NOT_APPROVED/);
 h.props.set('STUDY1_E1_PDF_COPY_ACCESS_HOURS_APPROVED','true');
 for(const hours of ['0','721','-1','24.5','not-a-number']){
  h.props.set('STUDY1_E1_PDF_COPY_ACCESS_HOURS',hours);
  assert.throws(()=>h.scope.study1FormalConsentCopyExpiry_(),/WINDOW_INVALID/);
 }
 h.props.set('STUDY1_E1_PDF_COPY_ACCESS_HOURS','24');
 const now=Date.now(),expires=h.scope.study1FormalConsentCopyExpiry_();
 assert.ok(expires>=now+24*3600000&&expires<=Date.now()+24*3600000);
});
test('a confirmed consent may read its existing status after intake closes, but an unconfirmed invitation cannot',()=>{
 const h=harness();
 h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid});
 h.props.set('OPEN','false');
 assert.throws(()=>h.scope.study1FormalConsentStatus('TOKEN'),/CLOSED/);
 h.registry.records[0].state='CONFIRMED';
 const result=h.scope.study1FormalConsentStatus('TOKEN');
 assert.equal(result.staffConfirmed,false,'a state flag cannot replace the two private signed PDFs');
 assert.equal(result.state,'CONFIRMED');
 assert.equal(result.copyAvailable,false,'copy still requires both independent PDF SHA refs');
});

test('original FORMAL REC PDF is token, OTP and HELD-bound; never calls CLOSED demo read',()=>{
 const h=harness(),issued=h.scope.study1FormalConsentBegin({
  emailProof:'MAIL_PROOF',reservationId:rid});
 const doc=h.scope.study1FormalConsentOriginalPdf(issued.token);
 assert.equal(doc.experiment,'E1');assert.equal(doc.version,h.doc.version);
 assert.equal(doc.sha256,h.doc.sha256);assert.equal(doc.mime,'application/pdf');
 assert.ok(Buffer.from(doc.base64,'base64').toString().startsWith('%PDF-'));
 assert.equal(h.seen.writes,1,'read must not write new participant data');
 h.rows[0][3]='CANCELLED';
 assert.throws(()=>h.scope.study1FormalConsentOriginalPdf(issued.token),
  /FORMAL_ORIGINAL_PDF_BOOKING_CHANGED/);
 h.rows[0][3]='HELD';h.registry.records[0].state='SIGNED';
 assert.throws(()=>h.scope.study1FormalConsentOriginalPdf(issued.token),
  /FORMAL_ORIGINAL_PDF_NOT_AUTHORIZED/);
});
test('FORMAL original PDF requires the REC gate and cannot be read across experiments',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1FormalConsentOriginalPdf('FORGED'),/TOKEN_INVALID/);
 h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid});
 h.props.set('OPEN','false');
 assert.throws(()=>h.scope.study1FormalConsentOriginalPdf('TOKEN'),/CLOSED/);
});

// §70-S.24: older uploaded blank E1 PDFs are never silently treated as a
// researcher-signed source, even when REC and booking flags are synthetic-on.
test('MVP never offers participant signature from an un-attested researcher-blank source',()=>{
 const h=harness();h.doc.researcherPresigned=false;
 assert.throws(()=>h.scope.study1FormalConsentBegin({emailProof:'MAIL_PROOF',reservationId:rid}),
  /E1_RESEARCHER_PRESIGNED_PDF_NOT_UPLOADED/);
 assert.equal(h.seen.writes,0);
});
