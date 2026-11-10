'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const src=['Study1EConsentBinding.js','Study1WizardEnrollment.js','Study1ParticipantIntake.js']
 .map(f=>fs.readFileSync(path.join(__dirname,'../gas',f),'utf8')).join('\n');
const columns={
 Applicants:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
 Screenings:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
 Verification:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc']
};
function env({enabled=true,policy=true,abuse=true}={}){
 const flags=new Map(),open=[],writes=[],records={Applicants:[],Screenings:[],Verification:[]};
 const lock={held:false};
 for(const key of ['OPEN','CONSENT_READY','STUDY1_E1_INTAKE_APPROVED',
  'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED','STUDY1_PARTICIPANT_DATA_USE_APPROVED',
  'STUDY1_PARTICIPANT_ABUSE_PROTECTION_VERIFIED'])
  flags.set(key,enabled?'true':'false');
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(36).toString('hex'));
 const getTab=n=>{
  const rows=records[n],headers=columns[n];
  if(!rows||!headers)return null;
  return {getLastRow:()=>rows.length+1,getLastColumn:()=>headers.length,
   appendRow:v=>{assert.equal(lock.held,true);rows.push(v.slice());writes.push('append '+n);},
   getRange:(start,col,count,width)=>({
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
  Date,JSON,Object,Array,Set,String,Number,Error,Boolean,Math,Map,
  SITE_RESOURCES_:{personal:'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
   operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  Utilities:{Charset:{UTF_8:'utf8'},
   computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',key).update(data).digest()]},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(lock.held)return false;lock.held=true;return true},
   hasLock:()=>lock.held,releaseLock:()=>{lock.held=false}
  })},
  SpreadsheetApp:{openById:id=>{
   assert.equal(id,'1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI');
   open.push(id);return book;},
   flush:()=>{assert.equal(lock.held,true);writes.push('flush')}
  }
 };
 const scope=vm.createContext(ctx);
 vm.runInContext(src,scope,{timeout:4000});
 const source={
  approved:true,provenance:'REC_EFFECTIVE_SCREENING_AND_DATA_PROCESSING',
  experiment:'E1',documentSha256:'a'.repeat(64),screeningVersion:'REC_2026_05',
  allowsProspectiveIntake:true,allowsPrivateSheetsStorage:true
 };
 if(policy)scope.study1ParticipantRecPolicy_=()=>source;
 if(abuse)scope.study1ParticipantAbuseProtection_=r=>({
  allowed:true,provenance:'SERVER_APPROVED_RATE_AND_BOT_PROTECTION',requestId:r.requestId});
 const input={experiment:'E1',name:'合成申請者',email:'synthetic.person@example.org',
  phone:'',adult:true,cycu:true,noDx:true,noTreatment:true,noPractice:true,
  requestId:'REQ_SYNTH_PERSON_000001'};
 return {scope,flags,open,writes,records,lock,source,input,
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
 assert.equal(x.records.Screenings[0][3],'PENDING_REVIEW');
 assert.equal(x.records.Screenings[0][5],'SELF_REPORT_NOT_VERIFIED');
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
 assert.throws(()=>q.begin(),/ABUSE_PROTECTION_NOT_CONFIGURED/);
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
