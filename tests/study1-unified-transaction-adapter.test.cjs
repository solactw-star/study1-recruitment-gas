'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const dir=path.join(__dirname,'../gas');
const names=['OtpCore','BookingCore','OtpThrottle','OtpTransaction',
 'BookingHoldTransaction','Study1FixtureAdapter','Study1Unified'];
const src=names.map(n=>fs.readFileSync(path.join(dir,n+'.js'),'utf8')).join('\n');
function context(){
 const ctx=vm.createContext({Date,JSON,Map,Set,Error,Number,String,Object,Array,
  Utilities:{Charset:{UTF_8:'UTF-8'},
   computeHmacSha256Signature:(payload,key)=>[...crypto.createHmac('sha256',key).update(payload).digest()].map(x=>x>127?x-256:x)}
 });
 vm.runInContext(src,ctx,{timeout:2000});
 return ctx;
}
test('OTP fixture adapter uses real throttle and once-only kernel without storing plaintext code',()=>{
 const c=context(),now=Date.now();
 const a={id:'SIM-001',otpHistory:[],otpRequestedAt:null,otpAttempts:0,phase:'SCREENED'};
 const s={applications:[a]};
 c.study1FixtureIssue_(s,a,now);a.phase='OTP_SENT';
 const outer={hasLock:()=>true};
 assert.equal(c.study1FixtureVerify_(s,a,'12345678',now+1000,outer).verified,false);
 assert.equal(c.study1FixtureVerify_(s,a,'00000000',now+2000,outer).verified,true);
 assert.equal(a.phase,'VERIFIED');assert.equal(a.otpAttempts,2);
 assert.ok(a.otpHistory[0].usedAt);
 assert.doesNotMatch(JSON.stringify(a),/00000000|example.invalid/);
 assert.equal(c.study1FixtureOtpSnapshot_(s).rows[0][5],2);
 assert.throws(()=>c.study1FixtureVerify_(s,a,'00000000',now+3000,{hasLock:()=>false}),/全域鎖/);
});
test('OTP synthetic issue history cannot reset rolling account throttle',()=>{
 const c=context(),now=Date.now();
 const a={id:'SIM-001',otpHistory:[],otpRequestedAt:null,otpAttempts:0};
 const s={applications:[a]};
 c.study1FixtureIssue_(s,a,now-130000);
 c.study1FixtureIssue_(s,a,now-65000);
 c.study1FixtureIssue_(s,a,now);
 const gate=c.otpThrottleIssuePreflight_(c.study1FixtureOtpSnapshot_(s),
  {applicantId:a.id,email:c.study1FixtureEmail_(a)},new Date(now+65000).toISOString());
 assert.equal(gate.allowed,false);
 assert.throws(()=>c.study1FixtureIssue_(s,a,now+65000),/限制/);
});
test('Booking hold kernel runs only on shadow rows while the external lock is held',()=>{
 const c=context(),now=Date.now();
 const a={id:'SIM-001',experiment:'E1',phase:'VERIFIED',eligible:true,slotId:null,holdUntil:null};
 const slot={id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',capacity:2};
 const s={applications:[a],slots:[slot]};
 const held=c.study1FixtureHold_(s,a,slot,'REQ-SIM-ADAPTER00001',now,{hasLock:()=>true});
 assert.equal(held.held,true);assert.equal(held.reason,'CREATED');
 assert.equal(a.slotId,null,'shadow append must not mutate persistent application');
 assert.throws(()=>c.study1FixtureHold_(s,a,slot,'REQ-SIM-ADAPTER00002',now,{hasLock:()=>false}),/全域鎖/);
 assert.doesNotMatch(fs.readFileSync(path.join(dir,'Study1FixtureAdapter.js'),'utf8'),/\bSpreadsheetApp\s*\.|\bMailApp\s*\.|\bGmailApp\s*\./);
});
