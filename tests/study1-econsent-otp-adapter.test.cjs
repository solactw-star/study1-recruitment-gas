'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const names=['OtpCore.js','OtpThrottle.js','OtpTransaction.js',
 'Study1EConsentBinding.js','Study1EConsentOtpAdapter.js'];
const scripts=names.map(n=>fs.readFileSync(path.join(__dirname,'../gas',n),'utf8')).join('\n');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI';
const O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const app='APP_12345678',challenge='CHL_12345678',screen='SCR_12345678',
 secret=crypto.randomBytes(45).toString('hex'),code='12345678';
const headers=['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc',
 'attempts','used_at_utc','email','created_at_utc'];
function setup({enabled=true,identityApproved=true,duplicate=false}={}){
 const flags=new Map(),now=Date.now(),date=ms=>new Date(now+ms).toISOString();
 for(const k of ['OPEN','CONSENT_READY','STUDY1_ECONSENT_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED','STUDY1_ECONSENT_WIZARD_LINK_VERIFIED',
  'STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_ECONSENT_OTP_VERIFY_APPROVED'])
  flags.set(k,enabled?'true':'false');
 flags.set('STUDY1_OTP_HMAC_SECRET',secret);
 flags.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',crypto.randomBytes(36).toString('hex'));
 const records=[],writes=[],reads=[],locked={on:false};
 const m={Date,JSON,Number,String,Array,Object,Math,Set,Error,
  SITE_RESOURCES_:{personal:P,operations:O},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>flags.get(k)||null})},
  Utilities:{Charset:{UTF_8:'UTF-8'},
   computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',key).update(data).digest()]},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(locked.on)return false;locked.on=true;return true;},
   hasLock:()=>locked.on,releaseLock:()=>{locked.on=false;}
  })},
  SpreadsheetApp:{openById:id=>{assert.equal(id,P);reads.push('OPEN');return {
   getSheetByName:name=>{assert.equal(name,'Verification');return tab;}
  };},flush:()=>writes.push('FLUSH')}
 };
 const scope=vm.createContext(m);vm.runInContext(scripts,scope,{timeout:2000});
 scope.study1AdminOwnerRequired_=()=>true;
 const hmac=scope.otpHmacHex_(challenge,app,'EMAIL_VERIFICATION',code,secret);
 records.push([challenge,app,'EMAIL_VERIFICATION',hmac,date(8*60000),0,'','person@example.org',date(-2*60000)]);
 if(duplicate)records.push(records[0].slice());
 let beforeWrite=null;
 const tab={
  getLastRow:()=>records.length+1,getLastColumn:()=>headers.length,
  getRange:(row,col,height,width)=>{
   assert.ok(Number.isSafeInteger(height)&&height>=1&&height<=records.length,
    'only bounded header, targeted search, individual row or F:G ranges');
   reads.push({row,col,width});
   if(row===1&&col===1&&width===9)return {getValues:()=>[headers.slice()]};
   if(row===2&&[1,2,8].includes(col)&&width===1)return {
    createTextFinder:target=>{
     let caseSensitive=true,full=false,regex=true;
     const finder={
      matchEntireCell(v){full=v;return finder},
      matchCase(v){caseSensitive=v;return finder},
      useRegularExpression(v){regex=v;return finder},
      findAll(){
       assert.equal(full,true);assert.equal(regex,false);
       return records.map((r,i)=>({i,v:r[col-1]}))
        .filter(x=>caseSensitive?x.v===target:String(x.v).toLowerCase()===target.toLowerCase())
        .map(x=>({getRow:()=>x.i+2,getColumn:()=>col}));
      }
     };
     return finder;
    }
   };
   if(col===1&&width===9&&row>=2&&row<=records.length+1)
    return {getValues:()=>[records[row-2].slice()]};
   if(col===6&&width===2&&row>=2&&row<=records.length+1)
    return {
     getValues:()=>[records[row-2].slice(5,7)],
     setValues:values=>{
      assert.equal(locked.on,true,'OTP write under shared lock');
      writes.push({row,values});
      [records[row-2][5],records[row-2][6]]=values[0];
      if(beforeWrite)beforeWrite(); // out-of-band change after attempted write
     }
    };
   throw Error('Unexpected GAS range: '+row+'/'+col+'/'+height+'/'+width);
  }
 };
 const owner={applicantId:app,screeningId:screen,experiment:'E1',
  email:'person@example.org',provenance:'REC_APPROVED_APPLICANT_SCREENING',approved:true};
 if(identityApproved)scope.study1EConsentOtpApplicantAuthorization_=()=>owner;
 const request={applicantId:app,challengeId:challenge,screeningId:screen,
  experiment:'E1',code};
 return {scope,flags,request,owner,records,writes,reads,locked,
  setBeforeWrite:fn=>{beforeWrite=fn}};
}
test('No approval blocks OTP verification before reading a single real Sheet cell',()=>{
 const h=setup({enabled:false});
 assert.throws(()=>h.scope.study1EConsentVerifyContactOtp_(h.request),/BACKEND_NOT_READY|IDENTITY_SOURCE_NOT_CONFIGURED|OTP_TRANSACTION_NOT_READY/);
 assert.equal(h.reads.length,0);
 assert.equal(h.writes.length,0);
});
test('All flags on but missing independently approved applicant/experiment source remains closed',()=>{
 const h=setup({identityApproved:false});
 assert.throws(()=>h.scope.study1EConsentVerifyContactOtp_(h.request),/BACKEND_NOT_READY|IDENTITY_SOURCE_NOT_CONFIGURED|OTP_TRANSACTION_NOT_READY/);
 assert.equal(h.reads.length,0);
});
test('One code is verified and consumed exactly once with F:G atomic write and reread',()=>{
 const h=setup();
 const done=h.scope.study1EConsentVerifyContactOtp_(h.request);
 assert.equal(done.verified,true);
 assert.equal(done.reason,'VERIFIED');
 assert.equal(h.records[0][5],1);
 assert.match(h.records[0][6],/^20\d\d-/);
 const pairs=h.writes.filter(x=>typeof x==='object');
 assert.equal(pairs.length,1);
 assert.equal(pairs[0].row,2);
 assert.deepEqual([...pairs[0].values[0]],[1,h.records[0][6]]);
 assert.equal(h.writes.filter(x=>x==='FLUSH').length,1);
 assert.equal(h.locked.on,false);
 assert.deepEqual([...Object.keys(done)].sort(),['reason','verified']);
 const again=h.scope.study1EConsentVerifyContactOtp_(h.request);
 assert.equal(again.verified,false,'replayed OTP does not verify');
 assert.equal(h.writes.filter(x=>typeof x==='object').length,1);
});
test('Wrong OTP records failed attempts once, then correct code consumes remaining challenge',()=>{
 const h=setup();
 const wrong=h.scope.study1EConsentVerifyContactOtp_({...h.request,code:'00000001'});
 assert.equal(wrong.verified,false);assert.equal(wrong.reason,'REJECTED');
 assert.equal(h.records[0][5],1);
 assert.equal(h.records[0][6],'');
 const good=h.scope.study1EConsentVerifyContactOtp_(h.request);
 assert.equal(good.verified,true);assert.equal(h.records[0][5],2);
});
test('Cross-experiment, applicant swapping, unverified source and invalid OTP syntax never write',()=>{
 for(const change of [
  h=>{h.request.experiment='E2'},
  h=>{h.request.applicantId='APP_ATTACKER1'},
  h=>{h.owner.approved=false},
  h=>{h.owner.email='other@example.org'},
  h=>{h.request.code='1234abcd'}
 ]){
  const h=setup();change(h);
  let rejected=false;
  try{const response=h.scope.study1EConsentVerifyContactOtp_(h.request);
   rejected=response.verified===false&&response.reason==='REJECTED';}
  catch(_){rejected=true;}
  assert.equal(rejected,true,'mismatched applicant or email must not verify');
  assert.equal(h.writes.length,0);
  assert.equal(h.locked.on,false);
 }
});
test('Duplicate challenge IDs, stale writer state and concurrent lock contention fail closed',()=>{
 const d=setup({duplicate:true});
 assert.throws(()=>d.scope.study1EConsentVerifyContactOtp_(d.request),/不是唯一/);
 assert.equal(d.writes.length,0);
 const r=setup();
 r.setBeforeWrite(()=>{r.records[0][5]=3});
 // A fixture-controlled concurrent mutation before the F:G check models
 // an out-of-band writer bypassing the shared lock.
 assert.throws(()=>r.scope.study1EConsentVerifyContactOtp_(r.request),/寫後|回讀|不一致/);
 const c=setup();c.locked.on=true;
 assert.throws(()=>c.scope.study1EConsentVerifyContactOtp_(c.request),/無法取得 OTP 全域交易鎖/);
 assert.equal(c.writes.length,0);
});
test('Read-only Sheets approval does not itself authorize OTP verification writes',()=>{
 const h=setup();h.flags.set('STUDY1_ECONSENT_OTP_VERIFY_APPROVED','false');
 assert.throws(()=>h.scope.study1EConsentVerifyContactOtp_(h.request),/BACKEND_NOT_READY|IDENTITY_SOURCE_NOT_CONFIGURED|OTP_TRANSACTION_NOT_READY/);
 assert.equal(h.reads.length,0);
 assert.equal(h.writes.length,0);
});
test('Revoking source approval or losing the HMAC key denies all live writes',()=>{
 const h=setup();h.flags.set('STUDY1_ECONSENT_LIVE_SHEETS_APPROVED','false');
 assert.throws(()=>h.scope.study1EConsentVerifyContactOtp_(h.request),/BACKEND_NOT_READY|IDENTITY_SOURCE_NOT_CONFIGURED|OTP_TRANSACTION_NOT_READY/);
 assert.equal(h.reads.length,0);
 const k=setup();k.flags.delete('STUDY1_OTP_HMAC_SECRET');
 assert.throws(()=>k.scope.study1EConsentVerifyContactOtp_(k.request),/金鑰/);
 assert.equal(k.reads.length,0);
});
