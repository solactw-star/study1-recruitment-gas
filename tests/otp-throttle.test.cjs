'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'../gas');
const source=['OtpCore.js','OtpTransaction.js','OtpThrottle.js'].map(f=>
 fs.readFileSync(path.join(root,f),'utf8')).join('\n');
const headers=['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc',
 'attempts','used_at_utc','email','created_at_utc'];
const now='2026-10-29T08:30:00Z';
const identity={applicantId:'app-1',email:'fake@example.invalid'};
function ctx(){
 const c={Utilities:{Charset:{UTF_8:'UTF-8'},
  computeHmacSha256Signature(value,key){
   return Array.from(crypto.createHmac('sha256',key).update(value).digest())
    .map(b=>b>127?b-256:b);
  }}};
 vm.createContext(c);vm.runInContext(source,c);return c;
}
function row(id,app='app-1',email='fake@example.invalid',
 created='2026-10-29T08:00:00Z',attempts=0){
 return [id,app,'EMAIL_VERIFICATION','a'.repeat(64),
  '2026-10-29T08:10:00Z',attempts,'',email,created];
}
function record(id,app,email,created,attempts){
 const r=row(id,app,email,created,attempts);
 r[4]=new Date(Date.parse(created)+600000).toISOString();
 return r;
}
function snap(rows){return {headers,rows};}
function issue(c,rows,when=now,who=identity){
 return JSON.parse(JSON.stringify(c.otpThrottleIssuePreflight_(snap(rows),who,when)));
}
function verify(c,rows,when=now,who=identity){
 return JSON.parse(JSON.stringify(c.otpThrottleVerifyGate_(snap(rows),who,when)));
}
test('First issuance is eligible only for locked issuance, not an actual grant',()=>{
 const c=ctx();
 assert.deepEqual(issue(c,[]),{allowed:true,reason:'ELIGIBLE_FOR_LOCKED_ISSUANCE_ONLY'});
 assert.doesNotMatch(JSON.stringify(issue(c,[])),/fake@example|app-1/);
});
test('Resend cooldown blocks at 59 seconds, permits exactly 60 seconds',()=>{
 const c=ctx(),rows=[record('ch-1','app-1','fake@example.invalid','2026-10-29T08:00:00Z',0)];
 assert.equal(issue(c,rows,'2026-10-29T08:00:59Z').allowed,false);
 assert.equal(issue(c,rows,'2026-10-29T08:01:00Z').allowed,true);
});
test('Three issues in one hour block another issue, including new applicant ID for same email',()=>{
 const c=ctx();
 const rows=[record('ch-1','app-1','fake@example.invalid','2026-10-29T07:31:00Z',0),
  record('ch-2','app-2','FAKE@example.invalid','2026-10-29T07:45:00Z',0),
  record('ch-3','app-3','fake@example.invalid','2026-10-29T08:01:00Z',0)];
 assert.equal(issue(c,rows).allowed,false);
 assert.equal(issue(c,rows,now,{applicantId:'app-new',email:'fake@example.invalid'}).allowed,false);
});
test('Attempts accumulate across challenges and block verification and reissuance',()=>{
 const c=ctx(),rows=[record('ch-1','app-1','fake@example.invalid','2026-10-29T07:50:00Z',5),
 record('ch-2','app-1','fake@example.invalid','2026-10-29T08:01:00Z',5)];
 assert.equal(verify(c,rows).allowed,false);
 assert.equal(issue(c,rows).allowed,false);
});
test('Same applicant with changed mailbox cannot reset account budget',()=>{
 const c=ctx(),rows=[record('ch-1','app-1','old@example.invalid','2026-10-29T07:50:00Z',10)];
 assert.equal(issue(c,rows,now,{applicantId:'app-1',email:'new@example.invalid'}).allowed,false);
 assert.equal(verify(c,rows,now,{applicantId:'app-1',email:'new@example.invalid'}).allowed,false);
});
test('Unrelated accounts do not count against each other',()=>{
 const c=ctx(),rows=[record('ch-1','app-other','other@example.invalid','2026-10-29T08:00:00Z',5)];
 assert.equal(issue(c,rows).allowed,true);
 assert.equal(verify(c,rows).allowed,true);
});
test('Rolling window excludes records older than one hour',()=>{
 const c=ctx(),rows=[record('ch-1','app-1','fake@example.invalid','2026-10-29T07:29:59Z',10)];
 assert.equal(issue(c,rows).allowed,true);
 assert.equal(verify(c,rows).allowed,true);
});
test('Window boundary includes a challenge exactly one hour old',()=>{
 const c=ctx(),rows=[record('ch-1','app-1','fake@example.invalid','2026-10-29T07:30:00Z',10)];
 assert.equal(issue(c,rows).allowed,false);
});
test('Malformed relevant state, duplicate IDs and future timestamps fail closed',()=>{
 const c=ctx();
 assert.throws(()=>issue(c,[record('ch-1','app-1','fake@example.invalid','2026-10-29T08:00:00Z',-1)]),/次數/);
 const r=record('ch-1','app-1','fake@example.invalid','2026-10-29T08:00:00Z',0);
 assert.throws(()=>issue(c,[r,r.slice()]),/重複/);
 assert.throws(()=>issue(c,[record('ch-1','app-1','fake@example.invalid','2026-10-29T08:31:00Z',0)]),/日期/);
 assert.throws(()=>issue(c,[['partial']]),/欄位/);
 assert.throws(()=>issue(c,[record('ch-1','app-1','fake@example.invalid','2026-02-30T08:00:00Z',0)]),/時間/);
});
test('Blank rows ignored, no direct writes or sending',()=>{
 const c=ctx();
 assert.equal(issue(c,[[],record('ch-1','app-other','other@example.invalid','2026-10-29T08:00:00Z',0)]).allowed,true);
 const src=fs.readFileSync(path.join(root,'OtpThrottle.js'),'utf8');
 assert.doesNotMatch(src,/SpreadsheetApp|GmailApp|MailApp|\.appendRow\s*\(|\.setValues\s*\(/);
 const site=fs.readFileSync(path.join(root,'Website.js'),'utf8');
 assert.match(site,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
});
test('Verification transaction rejects an otherwise valid OTP after other challenges exhaust account budget',()=>{
 const c=ctx(),secret='unit-only-not-a-real-secret-0123456789';
 const correct='00001234';
 const digest=c.otpHmacHex_('ch-current','app-1','EMAIL_VERIFICATION',correct,secret);
 const current=record('ch-current','app-1','fake@example.invalid','2026-10-29T08:25:00Z',0);
 current[3]=digest;
 const past1=record('ch-old1','app-1','fake@example.invalid','2026-10-29T07:50:00Z',5);
 const past2=record('ch-old2','app-1','fake@example.invalid','2026-10-29T08:10:00Z',5);
 let locked=false,writes=0;
 const lock={tryLock(){locked=true;return true;},hasLock(){return locked;},releaseLock(){locked=false;}};
 const adapters={getLock(){return lock;},getSecret(){return secret;},
 readSnapshot(){assert.equal(locked,true);return snap([past1,past2,current]);},
 writeAttemptAndUse(){writes++;return true;}};
 const result=c.otpVerifyOnceLocked_({
 challengeId:'ch-current',applicantId:'app-1',email:'fake@example.invalid',
 code:correct,nowUtc:now},adapters);
 assert.equal(result.verified,false);
 assert.equal(result.reason,'REJECTED');
 assert.equal(writes,0);
 assert.equal(locked,false);
});
