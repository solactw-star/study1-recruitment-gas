'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../gas/Study1EConsentBinding.js'),'utf8');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI';
const O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const req={applicantId:'APP_12345678',screeningId:'SCR_12345678',challengeId:'CHL_12345678',
 reservationId:'RES_12345678',slotId:'SLOT_12345678',experiment:'E1',
 documentSha:'a'.repeat(64),documentVersion:'Version02'};
const doc={experiment:'E1',sha256:req.documentSha,version:req.documentVersion};
const ms=Date.now(),stamp=offset=>new Date(ms+offset).toISOString();
function evidence(){
 return {verified:true,provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
  applicantId:req.applicantId,experiment:req.experiment,consentProcedureApproved:true,
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   eligibilityEvidenceSha256:'e'.repeat(64),
  evidenceSha256:'c'.repeat(64),verifiedAtUtc:stamp(-1500000),
  email:'test@example.org',screeningVersion:'APPROVED_V1',
  screeningId:req.screeningId,reservationId:req.reservationId,
  slotId:req.slotId,challengeId:req.challengeId};
}
function syntheticTables(){
 return {
  Applicants:{headers:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
   rows:[[req.applicantId,'FAKE_TEST','test@example.org','',new Date(ms-7200000),stamp(-600000),'EMAIL_VERIFIED']]},
  Screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
   rows:[[req.screeningId,req.applicantId,'APPROVED_V1','ELIGIBLE',stamp(-5400000),'PARTICIPANT_SELF_REPORT']]},
  Verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
   rows:[[req.challengeId,req.applicantId,'EMAIL_VERIFICATION','b'.repeat(64),
    stamp(-1200000),1,stamp(-1500000),'test@example.org',stamp(-1800000)]]},
  Reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[[req.reservationId,req.applicantId,req.slotId,'HELD',stamp(900000),
    'IDEMPOTENT',stamp(-900000),'','',stamp(-850000)]]},
  Slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
   rows:[[req.slotId,stamp(7200000),stamp(10800000),4,'TEST','OPEN','STAFF_SYNTHETIC','']]}
 };
}
function harness({enabled=false,approveIdentity=false,identity=evidence(),tables=syntheticTables()}={}){
 const flags=new Map(),reads=[],lookups=[],writes=[],locked={state:false};
 for(const name of ['OPEN','CONSENT_READY','STUDY1_ECONSENT_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED','STUDY1_ECONSENT_WIZARD_LINK_VERIFIED',
  'STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED'])
  flags.set(name,enabled?'true':'false');
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(40).toString('hex'));
 const book=(id)=>({
  getSheetByName:tab=>{
   const data=tables[tab];if(!data)return null;
   return {
    getLastRow:()=>data.rows.length+1,getLastColumn:()=>data.headers.length,
    getRange:(row,col,height,width)=>{
     assert.equal(col,1);assert.equal(width,row===1?data.headers.length:width);
     reads.push({id,tab,row,height,width});
     if(row===1)return {getValues:()=>[data.headers.slice()]};
     if(width===1&&row===2)return {createTextFinder:term=>{
      const opts={};const finder={
       matchEntireCell(b){opts.full=b;return finder;},
       matchCase(b){opts.caseSensitive=b;return finder;},
       useRegularExpression(b){opts.regex=b;return finder;},
       findAll(){
        assert.deepEqual(opts,{full:true,caseSensitive:true,regex:false});
        lookups.push({tab,term});
        return data.rows.map((v,i)=>({v,i})).filter(x=>x.v[0]===term).map(x=>({
         getRow:()=>x.i+2,getColumn:()=>1
        }));
       }
      };
      return finder;
     }};
     return {getValues:()=>[data.rows[row-2].slice()]};
    },
    appendRow:()=>{writes.push('append');throw Error('No write allowed')},
    getDataRange:()=>{writes.push('bulk');throw Error('Never bulk read PII')}
   };
  }
 });
 let attempts=0,registry={schemaVersion:1,revision:0,records:[]};
 const lock={tryLock:()=>{if(locked.state)return false;locked.state=true;return true;},
  hasLock:()=>locked.state,releaseLock:()=>{locked.state=false}};
 const scope=vm.createContext({
  Date,Array,Object,JSON,Math,Number,String,Set,Error,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>flags.get(key)||null})},
  SITE_RESOURCES_:{personal:P,operations:O},
  SpreadsheetApp:{openById:id=>{if(![P,O].includes(id))throw Error('Wrong spreadsheet');reads.push({open:id});return book(id)}},
  LockService:{getScriptLock:()=>lock},
  Utilities:{Charset:{UTF_8:'UTF-8'},getUuid:()=>String(++attempts).padStart(8,'0')+'-0000-4000-8000-000000000000',
   computeHmacSha256Signature:(txt,key)=>[...crypto.createHmac('sha256',key).update(txt).digest()]}
 });
 vm.runInContext(source,scope);
 scope.STUDY1_ECONSENT_MAX_RECORDS_=12;
 scope.study1AdminOwnerRequired_=()=>true;
 scope.study1EConsentReadyDocument_=exp=>{
  if(exp!=='E1')throw Error('Experiment gated');return doc;
 };
 scope.study1EConsentHash_=token=>crypto.createHash('sha256').update(token).digest('hex');
 scope.study1EConsentRegistry_=()=>registry;
 scope.study1EConsentWrite_=(prev,next)=>{if(prev!==registry)throw Error('CAS collision');registry=next;};
 if(approveIdentity)scope.study1EConsentIdentityAttestation_=()=>identity;
 return {scope,flags,reads,lookups,writes,tables,locked,identity,
  get registry(){return registry}};
}
test('A closed system does not even open real Sheets or request an identity attestation',()=>{
 const h=harness();
 assert.throws(()=>h.scope.study1EConsentBindingAdapter_(),/BACKEND_NOT_READY/);
 assert.equal(h.reads.length,0);
 assert.throws(()=>h.scope.study1EConsentIssueBound_(req),/BACKEND_NOT_READY|尚未開放/);
 assert.equal(h.reads.length,0);
 assert.equal(h.registry.records.length,0);
});
test('Even with all flags true, missing REC authority blocks all applicant/OTP/booking data reads',()=>{
 const h=harness({enabled:true});
 assert.throws(()=>h.scope.study1EConsentBindingAdapter_().readTrustedSnapshot(req),/SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED/);
 assert.equal(h.reads.length,0);
 assert.equal(h.lookups.length,0);
});
test('The approved-style private adapter selects exactly five unique ID rows without bulk PII reads',()=>{
 const h=harness({enabled:true,approveIdentity:true});
 const snapshot=h.scope.study1EConsentBindingAdapter_().readTrustedSnapshot(req);
 assert.deepEqual(h.lookups.map(x=>x.tab),
  ['Applicants','Screenings','Verification','Reservations','Slots']);
 assert.equal(h.reads.filter(x=>x.open).length,2);
 assert.equal(h.reads.filter(x=>Number.isInteger(x.row)&&x.row!==1&&x.width!==1).length,5);
 assert.equal(h.writes.length,0);
 assert.equal(snapshot.applicants.rows[0][4],stamp(-7200000),'Sheet Date normalised to UTC ISO');
 const verified=h.scope.study1BindingVerify_(snapshot,req,doc,new Date().toISOString());
 assert.equal(verified.documentSha,doc.sha256);
 assert.equal(verified.reservationId,req.reservationId);
});
test('A valid synthetic approved-style source can issue once and concurrent replay is rejected under the same ScriptLock',()=>{
 const h=harness({enabled:true,approveIdentity:true});
 const first=h.scope.study1EConsentIssueBound_(req);
 assert.equal(first.experiment,'E1');
 assert.equal(h.registry.records.length,1);
 assert.equal(h.locked.state,false);
 assert.throws(()=>h.scope.study1EConsentIssueBound_(req),/重複/);
 assert.equal(h.registry.records.length,1);
 h.locked.state=true;
 assert.throws(()=>h.scope.study1EConsentIssueBound_(req),/鎖/);
 h.locked.state=false;
});
test('Identity swap, experiment swap and source permission errors fail before opening Sheets',()=>{
 for(const mutation of [
  a=>{a.applicantId='APP_00000000'},
  a=>{a.experiment='E2'},
  a=>{a.verified=false},
  a=>{a.emailControlSource='CLIENT_ONLY'},
  a=>{a.eligibilityEvidenceSource='CLIENT_ASSERTION'},
  a=>{a.eligibilityEvidenceSha256='bad'},
  a=>{a.evidenceSha256='bad'},
  a=>{a.reservationId='RES_00000000'}
 ]){
  const id=evidence();mutation(id);
  const h=harness({enabled:true,approveIdentity:true,identity:id});
  assert.throws(()=>h.scope.study1EConsentBindingAdapter_().readTrustedSnapshot(req),/SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID/);
  assert.equal(h.reads.length,0);
 }
});
test('Mismatched table headers, duplicate IDs and changed email or slot fail closed',()=>{
 const mutators=[
  t=>{t.Verification.headers[1]='wrong_id'},
  t=>{t.Applicants.rows.push(t.Applicants.rows[0].slice())},
  t=>{t.Verification.rows[0][7]='attacker@example.org'},
  t=>{t.Reservations.rows[0][2]='SLOT_ATTACKER'},
  t=>{t.Slots.rows[0][5]='CANCELLED'},
  t=>{delete t.Screenings.rows[0][1]}
 ];
 for(const mutate of mutators){
  const t=syntheticTables(),h=harness({enabled:true,approveIdentity:true,tables:t});
  mutate(t);
  assert.throws(()=>h.scope.study1EConsentIssueBound_(req));
  assert.equal(h.registry.records.length,0);
  assert.equal(h.writes.length,0);
 }
});
test('Revoking approval between successful reads blocks source rechecks and no records are appended',()=>{
 const h=harness({enabled:true,approveIdentity:true});
 const a=h.scope.study1EConsentBindingAdapter_();
 const b=h.scope.study1BindingVerify_(a.readTrustedSnapshot(req),req,doc,new Date().toISOString());
 b.digest=h.scope.study1BindingDigest_({...b,digest:''});
 h.flags.set('STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','false');
 assert.throws(()=>h.scope.study1BindingRecheckWithLock_(b,doc,a),/BACKEND_NOT_READY/);
 assert.equal(h.locked.state,false);
 assert.equal(h.registry.records.length,0);
});
