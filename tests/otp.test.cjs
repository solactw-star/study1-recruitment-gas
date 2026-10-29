'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/OtpCore.js'),'utf8');
const secret='unit-test-only-not-an-actual-credential-0123456789';
const headers=['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc',
  'attempts','used_at_utc','email','created_at_utc'];
const start='2026-10-29T08:00:00Z', expiry='2026-10-29T08:10:00Z', now='2026-10-29T08:05:00Z';
function env(){
  const ctx={
    Utilities:{
      Charset:{UTF_8:'UTF-8'},
      computeHmacSha256Signature(value,key,charset){
        assert.equal(charset,'UTF-8');
        return Array.from(crypto.createHmac('sha256',key).update(value,'utf8').digest())
          .map(v=>v>127?v-256:v);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src,ctx);
  return ctx;
}
function verification(ctx,code='00001234',extra={}){
  const digest=ctx.otpHmacHex_('challenge-1','applicant-1','EMAIL_VERIFICATION',code,secret);
  const vals=['challenge-1','applicant-1','EMAIL_VERIFICATION',digest,expiry,0,'',
    'sample@example.invalid',start];
  for (const [k,v] of Object.entries(extra)) vals[Number(k)]=v;
  return vals;
}
function evaluate(ctx,row,code,when=now){
  return JSON.parse(JSON.stringify(ctx.otpEvaluateVerification_(row,code,when,secret)));
}
test('Verification headings are checked exactly against 828 schema',()=>{
  const ctx=env();
  assert.equal(ctx.otpVerifyHeaders_(headers),true);
  assert.throws(()=>ctx.otpVerifyHeaders_(['challenge_id']),/欄位/);
  assert.throws(()=>ctx.otpVerifyHeaders_([...headers].reverse()),/欄位/);
});
test('HMAC digests are bound to challenge, applicant, purpose and code',()=>{
  const ctx=env(),digest=ctx.otpHmacHex_('challenge-1','applicant-1','EMAIL_VERIFICATION','00001234',secret);
  assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal(digest,crypto.createHmac('sha256',secret)
    .update(JSON.stringify(['challenge-1','applicant-1','EMAIL_VERIFICATION','00001234'])).digest('hex'));
  for(const [id,app,code] of [['challenge-2','applicant-1','00001234'],
    ['challenge-1','applicant-2','00001234'],['challenge-1','applicant-1','00001235']]){
    assert.notEqual(digest,ctx.otpHmacHex_(id,app,'EMAIL_VERIFICATION',code,secret));
  }
  assert.throws(()=>ctx.otpHmacHex_('challenge-1','applicant-1','EMAIL_VERIFICATION',1234,secret),/八位/);
  assert.throws(()=>ctx.otpHmacHex_('challenge-1','applicant-1','WRONG_PURPOSE','00001234',secret),/用途/);
  assert.throws(()=>ctx.otpHmacHex_('challenge-1','applicant-1','EMAIL_VERIFICATION','00001234','short'),/金鑰/);
});
test('Correct code is accepted only as a proposed atomic single-use transition',()=>{
  const ctx=env(), row=verification(ctx);
  const r=evaluate(ctx,row,'00001234');
  assert.deepEqual(r,{verified:true,reason:'MATCH',attemptsAfter:1,usedAtUtc:'2026-10-29T08:05:00.000Z'});
  assert.equal(row[5],0);
  assert.equal(row[6],'');
  assert.doesNotMatch(JSON.stringify(r),/sample@example|applicant-1|challenge-1|00001234|unit-test-only/);
});
test('Wrong and malformed codes increment attempted count',()=>{
  const ctx=env();
  assert.deepEqual(evaluate(ctx,verification(ctx),'00001235'),{verified:false,reason:'INVALID',attemptsAfter:1,usedAtUtc:null});
  assert.equal(evaluate(ctx,verification(ctx),'12').attemptsAfter,1);
  assert.equal(evaluate(ctx,verification(ctx),12345678).verified,false);
});
test('Expired, before-created, used, and limited challenges are rejected without attempts',()=>{
  const ctx=env();
  assert.equal(evaluate(ctx,verification(ctx),'00001234',expiry).reason,'EXPIRED');
  assert.equal(evaluate(ctx,verification(ctx),'00001234','2026-10-29T07:59:59Z').reason,'EXPIRED');
  const used=verification(ctx,'00001234',{6:'2026-10-29T08:02:00Z'});
  assert.equal(evaluate(ctx,used,'00001234').reason,'USED');
  const limit=verification(ctx,'00001234',{5:5});
  assert.deepEqual(evaluate(ctx,limit,'00001234'),{verified:false,reason:'ATTEMPT_LIMIT',attemptsAfter:5,usedAtUtc:null});
  assert.equal(evaluate(ctx,verification(ctx,'00001234',{5:4}),'99999999').attemptsAfter,5);
});
test('Incorrect row structure and impossible dates fail closed',()=>{
  const ctx=env();
  assert.throws(()=>evaluate(ctx,['bad'],'00001234'),/欄位/);
  assert.throws(()=>evaluate(ctx,verification(ctx,'00001234',{3:'bad'}),'00001234'),/簽章/);
  assert.throws(()=>evaluate(ctx,verification(ctx,'00001234',{5:-1}),'00001234'),/次數/);
  assert.throws(()=>evaluate(ctx,verification(ctx,'00001234',{4:'2026-02-30T08:00:00Z'}),'00001234'),/時間/);
  assert.throws(()=>evaluate(ctx,verification(ctx,'00001234',{4:'2026-10-29T08:30:00Z'}),'00001234'),/期限/);
  assert.throws(()=>evaluate(ctx,verification(ctx,'00001234',{6:'2026-10-29T07:59:00Z'}),'00001234'),/使用時間/);
});
test('Timing helper only compares fixed hash values, never exposes secrets',()=>{
  const ctx=env();
  assert.equal(ctx.otpConstantTimeHexEquals_('abc','abc'),true);
  assert.equal(ctx.otpConstantTimeHexEquals_('abc','abd'),false);
  assert.equal(ctx.otpConstantTimeHexEquals_('abc','abcd'),false);
  assert.doesNotMatch(src,/\.appendRow\s*\(|\.setValues\s*\(|GmailApp|MailApp|\.sendEmail\s*\(/);
});
test('Public OTP endpoints remain disabled',()=>{
  const site=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
  assert.match(site,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function verifyOtp\(\)\{return rejectIntake_\(\);\}/);
});
