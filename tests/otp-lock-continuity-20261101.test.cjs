'use strict';
// CLOSED OTP lock-continuity regression. Only synthetic challenge rows and
// fake LockService; never touches GAS, real Sheets, email or participant data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = ['OtpCore.js','OtpThrottle.js','OtpTransaction.js']
  .map(name=>fs.readFileSync(path.join(root,'gas',name),'utf8')).join('\n');
const headers=['challenge_id','applicant_id','purpose','otp_hmac',
  'expires_at_utc','attempts','used_at_utc','email','created_at_utc'];
const secret='synthetic-only-secret-01234567890123456789';
const request={challengeId:'ch-1',applicantId:'app-1',
  email:'person@example.invalid',code:'12345678',nowUtc:'2026-10-29T08:05:00Z'};
function scenario(mode) {
  const ctx={Utilities:{Charset:{UTF_8:'UTF-8'},
    computeHmacSha256Signature(payload,key) {
      return Array.from(crypto.createHmac('sha256',key).update(payload).digest())
        .map(n=>n>127?n-256:n);
    }}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const digest=ctx.otpHmacHex_('ch-1','app-1','EMAIL_VERIFICATION',
    '12345678',secret);
  const rows=[['ch-1','app-1','EMAIL_VERIFICATION',digest,
    '2026-10-29T08:10:00Z',0,'','person@example.invalid',
    '2026-10-29T08:00:00Z']];
  let held=false,reads=0,writes=0,releases=0;
  const lock={
    tryLock(){held=true;return true;},
    hasLock(){return mode==='false-ownership'?false:held;},
    releaseLock(){held=false;releases++;}
  };
  if(mode==='missing-hasLock')delete lock.hasLock;
  const adapters={
    getLock(){return lock;},
    getSecret(){if(mode==='secret')held=false;return secret;},
    readSnapshot(){
      reads++;
      if(mode==='initial-read'&&reads===1)held=false;
      if(mode==='readback'&&reads===2)held=false;
      return {headers:headers.slice(),rows:rows.map(row=>row.slice())};
    },
    writeAttemptAndUse(row,attempts,usedAt){
      writes++;rows[row-2][5]=attempts;rows[row-2][6]=usedAt;
      if(mode==='write')held=false;
      return true;
    }
  };
  return {call:()=>ctx.otpVerifyOnceLocked_(request,adapters),
    stats:()=>({reads,writes,releases,held})};
}
test('rejects missing hasLock or false ownership before reading challenges',()=>{
  for(const mode of ['missing-hasLock','false-ownership']){
    const x=scenario(mode);
    assert.throws(()=>x.call(),/交易鎖/);
    assert.equal(x.stats().reads,0);
    assert.equal(x.stats().writes,0);
  }
});
test('lock loss in snapshot or secret callback never updates OTP state',()=>{
  for(const mode of ['initial-read','secret']){
    const x=scenario(mode);
    assert.throws(()=>x.call(),err=>{
      assert.match(String(err),/交易鎖/);
      assert.doesNotMatch(String(err),/person@example|app-1|ch-1|12345678|synthetic-only/);
      return true;
    });
    assert.equal(x.stats().writes,0);
    assert.equal(x.stats().releases,1);
  }
});
test('loss after an attempted write or readback never reports verified success',()=>{
  for(const mode of ['write','readback']){
    const x=scenario(mode);
    assert.throws(()=>x.call(),/交易鎖/);
    assert.equal(x.stats().writes,1);
    assert.equal(x.stats().releases,1);
    // A real writer might already have committed F:G; this is a
    // fail-closed acknowledgement guard, NOT a rollback guarantee.
  }
});
test('intact script lock still permits single-use offline verification',()=>{
  const x=scenario('normal');
  assert.deepEqual(JSON.parse(JSON.stringify(x.call())),
    {verified:true,reason:'VERIFIED'});
  assert.deepEqual(x.stats(),{reads:2,writes:1,releases:1,held:false});
});
test('OTP endpoints stay closed and no live Sheet or mail calls are introduced',()=>{
  const site=fs.readFileSync(path.join(root,'gas','Website.js'),'utf8');
  const mod=fs.readFileSync(path.join(root,'gas','OtpTransaction.js'),'utf8');
  assert.match(site,/function verifyOtp\(\)\{return rejectIntake_\(\);\}/);
  assert.doesNotMatch(mod,/SpreadsheetApp|MailApp|GmailApp|\.setValues\s*\(/);
});
