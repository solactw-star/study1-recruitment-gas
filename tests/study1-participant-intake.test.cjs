'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const src=['OtpCore.js','OtpThrottle.js','OtpTransaction.js','Study1EConsentBinding.js','Study1EConsentOtpAdapter.js','Study1WizardEnrollment.js','Study1ParticipantTrust.js','Study1ParticipantIntake.js']
 .map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
const columns={
 Applicants:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
 Screenings:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
 Verification:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc']
};
function env({enabled=true,policy=true,abuse=true,slotReady=true}={}){
 const flags=new Map(),open=[],writes=[],mail=[],time={now:Date.now()},records={Applicants:[],Screenings:[],Verification:[]};
 const lock={held:false};
 for(const key of ['OPEN','CONSENT_READY','STUDY1_E1_INTAKE_APPROVED',
  'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED','STUDY1_PARTICIPANT_DATA_USE_APPROVED',
  'STUDY1_PARTICIPANT_ABUSE_PROTECTION_VERIFIED','STUDY1_PARTICIPANT_EMAIL_ISSUE_APPROVED','STUDY1_PARTICIPANT_EMAIL_VERIFY_APPROVED'])
  flags.set(key,enabled?'true':'false');
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(36).toString('hex'));
 flags.set('STUDY1_OTP_HMAC_SECRET',crypto.randomBytes(48).toString('hex'));
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[time.now]))}static now(){return time.now}}

 const getTab=n=>{
  const rows=records[n],headers=columns[n];
  if(!rows||!headers)return null;
  return {getLastRow:()=>rows.length+1,getLastColumn:()=>headers.length,
   appendRow:v=>{assert.equal(lock.held,true);rows.push(v.slice());writes.push('append '+n);},
   getRange:(start,col,count,width)=>({
    setValues:values=>{
     assert.equal(lock.held,true);assert.equal(col,6);assert.equal(width,2);
     if(n==='Verification'){
      records.Verification[start-2][5]=values[0][0];
      records.Verification[start-2][6]=values[0][1];
      writes.push('F:G');
     }else if(n==='Applicants'){
      records.Applicants[start-2][5]=values[0][0];
      records.Applicants[start-2][6]=values[0][1];
      writes.push('Applicant-email-status');
     }else throw Error('unexpected Sheet mutation');
    },
    getValues:()=>Array.from({length:count},(_,i)=>{
     const row=start+i===1?headers:rows[start+i-2];
     assert.ok(row,'no row '+n+':'+(start+i));
     return row.slice(col-1,col-1+width);
    }),
    createTextFinder:term=>{
     let entire=false,caseSensitive=true,regex=true;
     const finder={
      matchEntireCell:v=>{entire=v;return finder},
      matchCase:v=>{caseSensitive=v;return finder},
      useRegularExpression:v=>{regex=v;return finder},
      findAll:()=>{
       assert.equal(entire,true);assert.equal(regex,false);
       return rows.map((r,i)=>({v:r[col-1],row:i+2}))
        .filter(x=>caseSensitive?x.v===term:String(x.v).toLowerCase()===term.toLowerCase())
        .map(x=>({getRow:()=>x.row,getColumn:()=>col}));
      }
     };return finder;
    }
   })}
 };
 const book={getSheetByName:getTab};
 const ctx={
  Date:ClockDate,JSON,Object,Array,Set,String,Number,Error,Boolean,Math,Map,
  SITE_RESOURCES_:{personal:'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
   operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  Utilities:{Charset:{UTF_8:'utf8'},getUuid:()=>crypto.randomUUID(),
   computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',key).update(data).digest()]},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(lock.held)return false;lock.held=true;return true},
   hasLock:()=>lock.held,releaseLock:()=>{lock.held=false}
  })},
  MailApp:{sendEmail:message=>{assert.equal(lock.held,true);mail.push(message)}},
  SpreadsheetApp:{openById:id=>{
   assert.equal(id,'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI');
   open.push(id);return book;},
   flush:()=>{assert.equal(lock.held,true);writes.push('flush')}
  }
 };
 const scope=vm.createContext(ctx);
 vm.runInContext(src,scope,{timeout:4000});
 // The original PI-pinned Slots reader is independently tested with real
 // snapshot/HMAC mocks; this intake unit fixture controls only its result.
 const slotSource={ready:slotReady,checks:0};
 scope.study1FormalPublicSlotReady_=heldLock=>{
  if(heldLock)assert.equal(lock.held,true);
  slotSource.checks++;
  return slotSource.ready;
 };
 const source={
  approved:true,provenance:'REC_EFFECTIVE_SCREENING_AND_DATA_PROCESSING',
  experiment:'E1',documentSha256:'a'.repeat(64),screeningVersion:'REC_2026_05',
  allowsProspectiveIntake:true,allowsPrivateSheetsStorage:true
 };
 if(policy)scope.study1ParticipantRecPolicy_=()=>source;
 if(abuse){
  scope.study1ParticipantAbuseProtection_=r=>({
   allowed:true,provenance:'SERVER_APPROVED_RATE_AND_BOT_PROTECTION',
   requestId:r.requestId,validatedAtUtc:new Date().toISOString(),
   verificationHmac:'a'.repeat(64)});
  scope.study1ParticipantAbuseRecheck_=(grant,r)=>{
   assert.equal(grant.requestId,r.requestId);
   assert.equal(grant.allowed,true);
   return true;
  };
 }
 const input={experiment:'E1',name:'合成申請者',email:'synthetic.person@example.org',
  phone:'',adult:true,cycu:true,noDx:true,noTreatment:true,noPractice:true,
  requestId:'REQ_SYNTH_PERSON_000001',humanToken:'SYNTHETIC_HUMAN_TOKEN_ABC123456789'};
 return {scope,flags,open,writes,records,lock,source,input,mail,time,slotSource,
  begin:x=>scope.study1ParticipantBegin_(x||input)};
}
test('Public intake remains closed before reading PII or opening Sheets',()=>{
 const x=env({enabled:false});
 assert.throws(()=>x.begin(),/PARTICIPANT_INTAKE_NOT_READY/);
 assert.equal(x.open.length,0);assert.equal(x.records.Applicants.length,0);
});
test('Valid self-reported E1 request creates PENDING only, never VERIFIED',()=>{
 const x=env(),created=x.begin();
 assert.equal(created.accepted,true);assert.equal(created.created,true);
 assert.match(created.applicantId,/^APP_[a-f0-9]{28}$/);
 assert.match(created.screeningId,/^SCR_[a-f0-9]{28}$/);
 assert.equal(created.phase,'PENDING_EMAIL');
 assert.equal(x.records.Applicants[0][6],'PENDING_EMAIL');
 assert.equal(x.records.Screenings[0][3],'ELIGIBLE');
 assert.equal(x.records.Screenings[0][5],'PARTICIPANT_SELF_REPORT');
 assert.equal(x.records.Applicants[0].length,7);
 assert.equal(x.records.Screenings[0].length,6);
 assert.equal(x.writes.filter(x=>x==='flush').length,2);
 assert.equal(JSON.stringify(x.records).includes('noDx'),false);
});
test('Rejected self-report is not persisted; no health question details are saved',()=>{
 const x=env();
 const bad={...x.input,noDx:false};
 const r=x.begin(bad);
 assert.equal(r.accepted,false);assert.equal(r.reason,'SCREENING_NOT_ELIGIBLE');
 assert.equal(x.open.length,0);assert.equal(x.records.Applicants.length,0);
});
test('Same requestId replays exact pending rows without duplicate; duplicate email blocked',()=>{
 const x=env(),a=x.begin(),b=x.begin();
 assert.equal(a.created,true);assert.equal(b.created,false);
 assert.equal(x.records.Applicants.length,1);assert.equal(x.records.Screenings.length,1);
 assert.throws(()=>x.begin({...x.input,requestId:'REQ_SYNTH_PERSON_000002'}),/EMAIL_ALREADY_PENDING/);
 assert.equal(x.records.Applicants.length,1);
});
test('Changing applicant details with replay key fails closed',()=>{
 const x=env();x.begin();
 assert.throws(()=>x.begin({...x.input,name:'另一位合成申請者'}),/APPLICATION_REPLAY_MISMATCH/);
 assert.equal(x.records.Applicants.length,1);
});
test('Partial cross-sheet write cannot silently claim an application success',()=>{
 const x=env();x.begin();x.records.Screenings.pop();
 assert.throws(()=>x.begin(),/APPLICATION_PARTIAL_WRITE_REQUIRES_REVIEW/);
 assert.equal(x.records.Applicants.length,1);
});
test('Experiment E2 cannot be enrolled via E1 path even with flags set',()=>{
 const x=env();
 assert.throws(()=>x.begin({...x.input,experiment:'E2'}),/EXPERIMENT_NOT_OPEN/);
 assert.equal(x.open.length,0);
});
test('No approved REC policy or anti-abuse provider means no personal data write',()=>{
 const p=env({policy:false});
 assert.throws(()=>p.begin(),/REC_INTAKE_POLICY_NOT_CONFIGURED/);
 assert.equal(p.open.length,0);
 const q=env({abuse:false});
 assert.throws(()=>q.begin(),/BOT_PROTECTION_PROVIDER_NOT_READY/);
 assert.equal(q.open.length,0);
});
test('Shared script lock contention forbids opening the formal data source',()=>{
 const x=env();x.lock.held=true;
 assert.throws(()=>x.begin(),/正式申請共用交易鎖不可用/);
 assert.equal(x.open.length,0);assert.equal(x.records.Applicants.length,0);
});
test('Authority source changing within lock aborts before any write',()=>{
 const x=env();let n=0;
 x.scope.study1ParticipantRecPolicy_=()=>({...x.source,
  documentSha256:(++n>1?'b':'a').repeat(64)});
 assert.throws(()=>x.begin(),/REC正式來源在申請期間變動/);
 assert.equal(x.records.Applicants.length,0);
});

test('Pending applicant can issue a real shaped email OTP with MailApp fake only',()=>{
 const x=env(),created=x.begin();
 const payload={applicantId:created.applicantId,screeningId:created.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_EMAIL_SYNTH_000001'};
 const sent=x.scope.study1ParticipantOtpSend_(payload);
 assert.equal(sent.sent,true);assert.equal(sent.reason,'ISSUED');
 assert.equal(x.mail.length,1);
 const code=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 assert.notEqual(code,'00000000');
 assert.equal(x.records.Applicants[0][6],'PENDING_EMAIL');
 const row=x.records.Verification[0];
 assert.equal(row[5],0);assert.equal(row[6],'');
 assert.match(row[3],/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(row).includes(code),false);
 const verified=x.scope.study1ParticipantOtpVerify_({
  applicantId:payload.applicantId,screeningId:payload.screeningId,
  experiment:'E1',email:x.input.email,challengeId:sent.challengeId,code
 });
 assert.equal(verified.verified,true);
 assert.equal(verified.reason,'EMAIL_CONTROL_ONLY');
 assert.equal(x.records.Applicants[0][6],'PENDING_EMAIL');
 assert.equal(x.records.Screenings[0][3],'ELIGIBLE');
 assert.equal(x.records.Verification[0][5],1);
 assert.match(x.records.Verification[0][6],/^20\d{2}/);
 assert.equal(x.writes.filter(y=>y==='F:G').length,1);
 const second=x.scope.study1ParticipantOtpVerify_({
  applicantId:payload.applicantId,screeningId:payload.screeningId,
  experiment:'E1',email:x.input.email,challengeId:sent.challengeId,code
 });
 assert.equal(second.verified,false);
 assert.equal(x.writes.filter(y=>y==='F:G').length,1);
});
test('Same OTP request never double sends, cooldown and supersession enforce one code',()=>{
 const x=env(),created=x.begin();
 const p={applicantId:created.applicantId,screeningId:created.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_EMAIL_SYNTH_000001'};
 const one=x.scope.study1ParticipantOtpSend_(p);
 const old=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 assert.equal(x.scope.study1ParticipantOtpSend_(p).reason,'ALREADY_ISSUED');
 assert.equal(x.scope.study1ParticipantOtpSend_({...p,requestId:'REQ_EMAIL_SYNTH_000002'}).reason,'THROTTLED');
 x.time.now+=62000;
 const two=x.scope.study1ParticipantOtpSend_({...p,requestId:'REQ_EMAIL_SYNTH_000002'});
 assert.equal(two.sent,true);
 assert.equal(x.mail.length,2);
 assert.throws(()=>x.scope.study1ParticipantOtpVerify_({
  applicantId:p.applicantId,screeningId:p.screeningId,
  experiment:'E1',email:p.email,challengeId:one.challengeId,code:old
 }),/OTP_SUPERSEDED/);
 const fresh=x.mail[1].body.match(/驗證碼：(\d{8})/)[1];
 assert.equal(x.scope.study1ParticipantOtpVerify_({
  applicantId:p.applicantId,screeningId:p.screeningId,
  experiment:'E1',email:p.email,challengeId:two.challengeId,code:fresh
 }).verified,true);
});
test('OTP gate, cross-address recipient and shared ScriptLock fail before email',()=>{
 const x=env(),c=x.begin();
 const p={applicantId:c.applicantId,screeningId:c.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_EMAIL_SYNTH_000001'};
 x.flags.set('STUDY1_PARTICIPANT_EMAIL_ISSUE_APPROVED','false');
 assert.throws(()=>x.scope.study1ParticipantOtpSend_(p),/PUBLIC_EMAIL_OTP_NOT_READY/);
 x.flags.set('STUDY1_PARTICIPANT_EMAIL_ISSUE_APPROVED','true');
 assert.throws(()=>x.scope.study1ParticipantOtpSend_({...p,email:'attacker@example.org'}),/OTP_PENDING_APPLICATION_MISMATCH/);
 assert.equal(x.mail.length,0);
 x.lock.held=true;
 assert.throws(()=>x.scope.study1ParticipantOtpSend_(p),/OTP核發共用鎖/);
 assert.equal(x.mail.length,0);
});
test('Expired prospective email OTP never validates, no Applicant status escalation',()=>{
 const x=env(),a=x.begin();
 const p={applicantId:a.applicantId,screeningId:a.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_EMAIL_SYNTH_000001'};
 const sent=x.scope.study1ParticipantOtpSend_(p);
 const code=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 x.time.now+=11*60000;
 const result=x.scope.study1ParticipantOtpVerify_({
  applicantId:p.applicantId,screeningId:p.screeningId,
  experiment:'E1',email:p.email,challengeId:sent.challengeId,code});
 assert.equal(result.verified,false);
 assert.equal(x.records.Applicants[0][6],'PENDING_EMAIL');
});

test('Formula injection in applicant-controlled Sheet cells is rejected before any write',()=>{
 const x=env();
 for(const bad of [
  {...x.input,name:'=IMPORTXML("https://example.org","//x")'},
  {...x.input,name:' +HYPERLINK("https://example.org","x")'},
  {...x.input,phone:'=1+2'},
  {...x.input,email:'=SUM(1)@example.org'}
 ]){
  assert.throws(()=>x.begin(bad),/申請欄位包含禁止的試算表公式前綴/);
  assert.equal(x.open.length,0);
  assert.equal(x.records.Applicants.length,0);
 }
});

test('OTP email-control proof binds verified original F:G under lock; forged tickets fail',()=>{
 const x=env(),app=x.begin();
 const send=x.scope.study1ParticipantOtpSend_({
  applicantId:app.applicantId,screeningId:app.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_EMAIL_PROOF_TEST_00001'});
 const code=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 const done=x.scope.study1ParticipantOtpVerify_({
  applicantId:app.applicantId,screeningId:app.screeningId,
  experiment:'E1',email:x.input.email,challengeId:send.challengeId,code});
 assert.equal(done.verified,true);
 assert.equal(done.reason,'EMAIL_CONTROL_ONLY');
 assert.equal(done.emailProof.experiment,'E1');
 assert.match(done.emailProof.signature,/^[a-f0-9]{64}$/);
 assert.equal(done.emailProof.emailHash.length,64);
 assert.equal(JSON.stringify(done.emailProof).includes(x.input.email),false);
 const status=x.scope.study1ParticipantEmailStatus_(done.emailProof);
 assert.equal(status.emailVerified,true);
 assert.equal(status.applicationState,'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED');
 assert.equal(status.eligibilitySource,'PARTICIPANT_SELF_REPORT');
 assert.equal(x.records.Applicants[0][6],'EMAIL_VERIFIED');
 assert.equal(x.records.Screenings[0][3],'ELIGIBLE');
 assert.equal(x.records.Screenings[0][5],'PARTICIPANT_SELF_REPORT');
 assert.equal(x.writes.filter(y=>y==='Applicant-email-status').length,1);
 const again=x.scope.study1ParticipantEmailStatus_(done.emailProof);
 assert.equal(again.applicationState,status.applicationState);
 assert.equal(x.writes.filter(y=>y==='Applicant-email-status').length,1);
 assert.equal(status.reservationState,'NOT_AUTHORIZED');
 assert.equal(status.consentState,'NOT_SIGNED');
 const before=x.open.length;
 assert.throws(()=>x.scope.study1ParticipantEmailStatus_({
  ...done.emailProof,signature:'0'.repeat(64)
 }),/EMAIL_PROOF_SIGNATURE_INVALID/);
 assert.equal(x.open.length,before,'signature failure must precede any Sheet I/O');
 assert.throws(()=>x.scope.study1ParticipantEmailStatus_({
  ...done.emailProof,experiment:'E2'
 }),/EMAIL_PROOF_NOT_VALID/);
 x.records.Verification[0][6]='';
 assert.throws(()=>x.scope.study1ParticipantEmailStatus_(done.emailProof),
  /時間來源必須是|EMAIL_CONTROL_EVIDENCE_CHANGED/);
});
test('Expired mail possession proof and newer challenge cannot recover booking authority',()=>{
 const x=env(),app=x.begin();
 const params={applicantId:app.applicantId,screeningId:app.screeningId,
  experiment:'E1',email:x.input.email,requestId:'REQ_MAIL_BOUND_00000001'};
 const issued=x.scope.study1ParticipantOtpSend_(params);
 const code=x.mail[0].body.match(/驗證碼：(\d{8})/)[1];
 const receipt=x.scope.study1ParticipantOtpVerify_({
  applicantId:app.applicantId,screeningId:app.screeningId,
  experiment:'E1',email:x.input.email,challengeId:issued.challengeId,code
 }).emailProof;
 x.time.now+=61000;
 x.scope.study1ParticipantOtpSend_({
  ...params,requestId:'REQ_MAIL_BOUND_00000002'});
 assert.throws(()=>x.scope.study1ParticipantEmailStatus_(receipt),
  /EMAIL_CONTROL_EVIDENCE_CHANGED/);
 x.time.now+=31*60000;
 assert.throws(()=>x.scope.study1ParticipantEmailStatus_(receipt),
  /EMAIL_PROOF_EXPIRED/);
});
test('Readiness uses configured Turnstile sitekey without redeeming any single-use token',()=>{
 const x=env(),called=[];
 x.scope.study1ParticipantTurnstileConfig_=()=>{
  called.push('config');return {siteKey:'OFFLINE_TEST_SITEKEY_123456789'};
 };
 x.scope.study1ParticipantAbuseProtection_=()=>{
  called.push('verify');throw Error('must not redeem a token on readiness');
 };
 const ready=x.scope.study1ParticipantReadiness();
 assert.equal(ready.ready,true);assert.equal(ready.experiment,'E1');
 assert.equal(ready.siteKey,'OFFLINE_TEST_SITEKEY_123456789');
 assert.deepEqual(called,['config']);
 const y=env({enabled:false});
 assert.equal(y.scope.study1ParticipantReadiness().ready,false);
 assert.equal(y.open.length,0);
});

test('Global hourly guard counts original Applicants timestamps only under shared lock',()=>{
 const x=env();
 const now=new Date(x.time.now).toISOString();
 for(let n=0;n<60;n++)x.records.Applicants.push([
  'APP_OTHER_'+String(n).padStart(8,'0'),'ANOTHER_TEST',
  'unrelated'+n+'@example.org','',now,now,'PENDING_EMAIL'
 ]);
 assert.throws(()=>x.begin(),/GLOBAL_INTAKE_RATE_LIMIT/);
 assert.equal(x.records.Applicants.length,60);
 assert.equal(x.records.Screenings.length,0);
});
test('Corrupt original Applicants timestamp aborts before writing real participant data',()=>{
 const x=env(),date=new Date(x.time.now).toISOString();
 x.records.Applicants.push(['APP_OTHERTIMESTAMP','OTHER_NAME',
  'other@example.org','',date,date,'PENDING_EMAIL']);
 x.records.Applicants[0][4]='not-a-utc-date';
 assert.throws(()=>x.begin(),/時間來源必須是 UTC ISO 毫秒/);
 assert.equal(x.records.Applicants.length,1);
});

test('Self-declared eligibility is not a documentary identity verification',()=>{
 const x=env(),app=x.begin();
 assert.equal(x.records.Screenings[0][3],'ELIGIBLE');
 assert.equal(x.records.Screenings[0][5],'PARTICIPANT_SELF_REPORT');
 assert.equal(x.records.Applicants[0][6],'PENDING_EMAIL');
 assert.equal(JSON.stringify(x.records).includes('studentId'),false);
 assert.equal(JSON.stringify(x.records).includes('identityCard'),false);
 assert.equal(JSON.stringify(x.records).includes('noDx'),false);
 assert.equal(x.scope.study1ParticipantReadiness().ready,false);
});

test('Public intake refuses personal data without a real E1 slot preflight',()=>{
 const x=env({slotReady:false});
 // Isolate the Slots guard from the otherwise unconfigured Turnstile fixture.
 x.scope.study1ParticipantTurnstileConfig_=()=>({siteKey:'REAL_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'});
 assert.equal(x.scope.study1ParticipantReadiness().ready,false);
 assert.throws(()=>x.begin(),/E1_OFFICIAL_SLOTS_NOT_AVAILABLE/);
 assert.equal(x.open.length,0);
 assert.deepEqual(x.writes,[]);
 assert.equal(x.records.Applicants.length,0);
 assert.equal(x.records.Screenings.length,0);
 assert.ok(x.slotSource.checks>=2);
});
test('A Slot removed after initial preflight fails under the shared lock before any write',()=>{
 const x=env();
 const original=x.scope.study1ParticipantAbuseProtection_;
 x.scope.study1ParticipantAbuseProtection_=r=>{
  const verified=original(r);
  x.slotSource.ready=false;
  return verified;
 };
 assert.throws(()=>x.begin(),/E1_OFFICIAL_SLOTS_CHANGED_DURING_INTAKE/);
 assert.equal(x.lock.held,false);
 assert.deepEqual(x.writes,[]);
 assert.deepEqual(x.open,[]);
});
