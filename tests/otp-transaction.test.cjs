'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'../gas');
const otp=fs.readFileSync(path.join(root,'OtpCore.js'),'utf8');
const transaction=fs.readFileSync(path.join(root,'OtpTransaction.js'),'utf8');
const throttle=fs.readFileSync(path.join(root,'OtpThrottle.js'),'utf8');
const secret='offline-fixture-only-key-01234567890123456789';
const headers=['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc',
 'attempts','used_at_utc','email','created_at_utc'];
const now='2026-10-29T08:05:00Z';
const request={challengeId:'ch-1',applicantId:'app-1',
 email:'fake@example.invalid',code:'00001234',nowUtc:now};
function context(){
 const ctx={Utilities:{Charset:{UTF_8:'UTF-8'},
 computeHmacSha256Signature(text,key,charset){
   assert.equal(charset,'UTF-8');
   return Array.from(crypto.createHmac('sha256',key).update(text,'utf8').digest())
    .map(b=>b>127?b-256:b);
 }}};
 vm.createContext(ctx);
 vm.runInContext(otp+'\n'+throttle+'\n'+transaction,ctx);
 return ctx;
}
function fixture(options={}){
 const ctx=context();
 const digest=ctx.otpHmacHex_('ch-1','app-1','EMAIL_VERIFICATION','00001234',secret);
 let rows=[['ch-1','app-1','EMAIL_VERIFICATION',digest,
  '2026-10-29T08:10:00Z',0,'','fake@example.invalid','2026-10-29T08:00:00Z']];
 let acquired=false, reads=0,writes=0,releases=0;
 const lock={
  tryLock(ms){assert.equal(ms,5000);if(options.denyLock)return false;
    assert.equal(acquired,false);acquired=true;return true;},
  hasLock(){return acquired;},
  releaseLock(){assert.equal(acquired,true);acquired=false;releases++;}
 };
 const adapters={
  getLock(){return lock;},
  getSecret(){return secret;},
  readSnapshot(){
   assert.equal(acquired,true,'must read under lock');reads++;
   const snap={headers:options.badHeaders?['broken']:headers,
     rows:rows.map(r=>r.slice())};
   if(options.badReadback && reads>1) snap.rows[0][5]=0;
   return snap;
  },
  writeAttemptAndUse(rowNumber,attempts,usedAt){
   assert.equal(acquired,true,'must write under lock');writes++;
   if(options.failWrite)throw Error('simulated write failure');
   if(options.falseWrite)return false;
   assert.equal(rowNumber,2);
   rows[rowNumber-2][5]=attempts;rows[rowNumber-2][6]=usedAt;
   return true;
  }
 };
 return {ctx,adapters,lock,request:{...request},
  get rows(){return rows;},set rows(v){rows=v;},
  get counts(){return {reads,writes,releases,acquired};}};
}
function invoke(f,req=f.request){return JSON.parse(JSON.stringify(
 f.ctx.otpVerifyOnceLocked_(req,f.adapters)));}
test('One correct OTP verifies once; replay rejected without second write',()=>{
 const f=fixture();
 assert.deepEqual(invoke(f),{verified:true,reason:'VERIFIED'});
 assert.equal(f.rows[0][5],1);
 assert.equal(f.rows[0][6],'2026-10-29T08:05:00.000Z');
 assert.deepEqual(invoke(f),{verified:false,reason:'REJECTED'});
 assert.deepEqual(f.counts,{reads:3,writes:1,releases:2,acquired:false});
});
test('Wrong code consumes one attempt; fifth wrong code blocks later correct code',()=>{
 const f=fixture();
 for(let i=0;i<5;i++)assert.deepEqual(invoke(f,{...f.request,code:'00000000'}),{verified:false,reason:'REJECTED'});
 assert.equal(f.rows[0][5],5);
 assert.deepEqual(invoke(f),{verified:false,reason:'REJECTED'});
 assert.equal(f.counts.writes,5);
 assert.equal(f.counts.releases,6);
});
test('Identity binding denies wrong applicant or email without changing state',()=>{
 const f=fixture();
 assert.deepEqual(invoke(f,{...f.request,applicantId:'app-2'}),{verified:false,reason:'REJECTED'});
 assert.deepEqual(invoke(f,{...f.request,email:'other@example.invalid'}),{verified:false,reason:'REJECTED'});
 assert.equal(f.counts.writes,0);
 assert.equal(f.counts.releases,2);
});
test('Expired challenge never updates state',()=>{
 const f=fixture();
 assert.deepEqual(invoke(f,{...f.request,nowUtc:'2026-10-29T08:10:00Z'}),{verified:false,reason:'REJECTED'});
 assert.equal(f.counts.writes,0);
});
test('Duplicate challenge IDs block verification before any write',()=>{
 const f=fixture();f.rows=[...f.rows,f.rows[0].slice()];
 assert.throws(()=>invoke(f),/重複/);
 assert.equal(f.counts.writes,0);assert.equal(f.counts.releases,1);
});
test('Lock failure prevents any read or write',()=>{
 const f=fixture({denyLock:true});
 assert.throws(()=>invoke(f),/交易鎖/);
 assert.deepEqual(f.counts,{reads:0,writes:0,releases:0,acquired:false});
});
test('Missing or malformed snapshot rejects and releases lock',()=>{
 const f=fixture({badHeaders:true});
 assert.throws(()=>invoke(f),/欄位/);
 assert.equal(f.counts.writes,0);assert.equal(f.counts.releases,1);
});
test('Write failures never return verified success and release lock',()=>{
 for(const option of [{failWrite:true},{falseWrite:true},{badReadback:true}]){
  const f=fixture(option);
  assert.throws(()=>invoke(f),/寫入|failure/);
  assert.equal(f.counts.releases,1);
  assert.equal(f.counts.acquired,false);
 }
});
test('Missing challenge returns generic rejection; no writes',()=>{
 const f=fixture();
 assert.deepEqual(invoke(f,{...f.request,challengeId:'nonexistent'}),{verified:false,reason:'REJECTED'});
 assert.equal(f.counts.writes,0);
});
test('No participant identifiers, secret or code in returned result',()=>{
 const f=fixture();const result=invoke(f);
 assert.deepEqual(Object.keys(result).sort(),['reason','verified']);
 assert.doesNotMatch(JSON.stringify(result),/fake@example|app-1|ch-1|00001234|offline-fixture/);
});
test('No live Sheet write, email, or public OTP endpoint is introduced',()=>{
 const site=fs.readFileSync(path.join(root,'Website.js'),'utf8');
 assert.match(site,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.match(site,/function verifyOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.doesNotMatch(transaction,/SpreadsheetApp|MailApp|GmailApp|google\.script\.run|\.appendRow\s*\(/);
});
