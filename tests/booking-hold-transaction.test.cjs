'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../gas/BookingCore.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
const sh=['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'];
const rh=['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now='2026-10-29T12:00:00Z', until='2026-10-29T12:10:00Z';
const key='request-idempotency-0001';
function slot(id='SLOT_A',capacity=1,status='OPEN'){
  return [id,'2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',capacity,'ROOM','OPEN'===status?'OPEN':status,'researcher',now];
}
function hold(id='H1',app='APPLICANT_A',idKey=key,expiry=until,status='HELD',slotId='SLOT_A'){
  return [id,app,slotId,status,expiry,idKey,now,'','',''];
}
function make(extra={}){
  const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
  let rows=(extra.rows||[]).map(r=>r.slice());
  let slots=(extra.slots||[slot()]).map(r=>r.slice());
  let heldLock=false,lockAttempts=0,releases=0,appends=0,reads=0;
  const lock={tryLock(){lockAttempts++;if(extra.denyLock||heldLock)return false;heldLock=true;return true;},
    releaseLock(){releases++;heldLock=false;}};
  const adapters={
    getLock(){return lock;},
    isVerifiedAndEligible(){return extra.verified!==false;},
    readSnapshot(){
      reads++;
      if(extra.readFailureAt===reads)throw new Error('read failed');
      const copy=arr=>arr.map(r=>r.slice());
      return {slots:{headers:sh.slice(),rows:copy(slots)},
        reservations:{headers:extra.badHeaders?['bad']:rh.slice(),rows:copy(rows)}};
    },
    appendHold(req){
      appends++;
      if(extra.appendThrows)throw new Error('append failed');
      if(extra.appendReject)return false;
      rows.push(hold('NEW_'+appends,req.applicantId,req.idempotencyKey,
        extra.badExpiry?'2026-10-29T12:30:00Z':req.holdUntilUtc,
        'HELD',req.slotId));
      if(extra.duplicateAppend)rows.push(hold('DUP_'+appends,req.applicantId,req.idempotencyKey,req.holdUntilUtc));
      if(extra.secondActiveAfterAppend) rows.push(hold('EXTRA_'+appends,
        req.applicantId,'other-idempotency-0002',req.holdUntilUtc));
      if(extra.mutateHistoricalAfterAppend) {
        const [column,value]=extra.mutateHistoricalAfterAppend;
        rows[0][column]=value;
      }
      if(extra.dropHistoricalAfterAppend) rows.shift();
      return true;
    }
  };
  const request={applicantId:'APPLICANT_A',slotId:'SLOT_A',idempotencyKey:key,nowUtc:now,holdUntilUtc:until};
  return {ctx,adapters,request,stats:()=>({rows,slots,appends,reads,lockAttempts,releases,heldLock})};
}
function call(x,req=x.request){return JSON.parse(JSON.stringify(x.ctx.bookingHoldOnceLocked_(req,x.adapters)));}
test('Fresh authorized request reserves the last seat with one append and readback',()=>{
  const x=make();
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().reads,2);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
  assert.doesNotMatch(JSON.stringify(call(x)),/APPLICANT_A|request-idempotency|NEW_1/);
});
test('Exact active idempotent replay returns success without second append',()=>{
  const x=make({rows:[hold()]});
  assert.deepEqual(call(x),{held:true,reason:'REPLAY'});
  assert.equal(x.stats().appends,0);
});
test('Expired, cancelled, confirmed or other-slot replay never claims success',()=>{
  for(const row of [
    hold('H1','APPLICANT_A',key,'2026-10-29T11:59:59Z'),
    hold('H1','APPLICANT_A',key,until,'CANCELLED'),
    hold('H1','APPLICANT_A',key,until,'CONFIRMED'),
    hold('H1','APPLICANT_A',key,until,'HELD','SLOT_B')
  ]){
    const x=make({rows:[row],slots:[slot(),slot('SLOT_B')]});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Replay of an existing hold is rejected if its slot closed or already started',()=>{
  const x=make({rows:[hold()],slots:[slot('SLOT_A',1,'CLOSED')]});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
  const y=make({rows:[hold()],slots:[['SLOT_A','2026-10-29T11:00:00Z',
    '2026-10-29T11:30:00Z',1,'ROOM','OPEN','researcher',now]]});
  assert.deepEqual(call(y),{held:false,reason:'REJECTED'});
});
test('Only one seat: other applicant confirmed/held blocks booking',()=>{
  for(const row of [hold('H2','OTHER_APP','other-idempotency-0002',until),
    hold('H2','OTHER_APP','other-idempotency-0002','','CONFIRMED')]){
    const x=make({rows:[row]});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Same applicant with another active hold is rejected even in a different slot',()=>{
  const x=make({rows:[hold('H2','APPLICANT_A','other-idempotency-0002',until,'HELD','SLOT_B')],
    slots:[slot(),slot('SLOT_B')]});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
});
test('No verified and eligible server authorization means no reservation',()=>{
  const x=make({verified:false});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
  assert.equal(x.stats().reads,0);
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Closed, missing or past slot cannot be reserved',()=>{
  for(const slots of [[slot('SLOT_A',1,'CLOSED')],[slot('SLOT_B')],[
    ['SLOT_A','2026-10-28T09:00:00Z','2026-10-28T10:00:00Z',1,'ROOM','OPEN','researcher',now]
  ]]){
    const x=make({slots});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Lock contention fails closed without any read or append',()=>{
  const x=make({denyLock:true});
  assert.throws(()=>call(x),/交易鎖/);
  assert.equal(x.stats().reads,0);
  assert.equal(x.stats().appends,0);
});
test('Write/read failures release the lock and do not return success',()=>{
  for(const extra of [{appendReject:true},{appendThrows:true},{readFailureAt:2},
    {duplicateAppend:true},{badExpiry:true}]){
    const x=make(extra);
    assert.throws(()=>call(x));
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Invalid headers, duplicate IDs, unknown statuses and orphan references fail closed',()=>{
  for(const extra of [{badHeaders:true},{rows:[hold('DUP'),hold('DUP','OTHER_APP','other-idempotency-0002')]},
    {rows:[hold('H1','OTHER_APP','other-idempotency-0002',until,'UNKNOWN')]},
    {rows:[hold('H1','OTHER_APP','other-idempotency-0002',until,'HELD','MISSING')]}]){
    const x=make(extra);
    assert.throws(()=>call(x));
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
});
test('Duplicate unrelated historical idempotency keys fail closed before any append',()=>{
  // The requested key is unique; two historical rows still corrupt replay identity.
  // CANCELLED/EXPIRED rows do not occupy seats, so capacity is not the cause.
  const oldKey='historical-request-key-0002';
  const x=make({rows:[
    hold('H1','OTHER_APP_A',oldKey,until,'CANCELLED'),
    hold('H2','OTHER_APP_B',oldKey,until,'EXPIRED')
  ]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/重複預約請求識別碼/);
    assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});
test('Distinct historical keys remain valid and allow an authorized new hold',()=>{
  const x=make({rows:[
    hold('H1','OTHER_APP_A','historical-request-key-0002',until,'CANCELLED'),
    hold('H2','OTHER_APP_B','historical-request-key-0003',until,'EXPIRED')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
test('Server time, TTL, and idempotency key are validated before locking',()=>{
  const x=make();
  for(const req of [
    {...x.request,holdUntilUtc:now},
    {...x.request,holdUntilUtc:'2026-10-29T12:16:00Z'},
    {...x.request,idempotencyKey:'short'},
    {...x.request,nowUtc:'2026-02-30T12:00:00Z'}
  ])assert.throws(()=>call(x,req));
  assert.equal(x.stats().lockAttempts,0);
});
test('No public booking endpoint or direct production Sheets write is introduced',()=>{
  const site=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
  const tx=fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.doesNotMatch(tx,/\.appendRow\s*\(|\.setValues\s*\(|SpreadsheetApp|GmailApp|MailApp/);
});

test('Corrupted duplicate active applicant blocks exact-key replay before any write',()=>{
  const x=make({slots:[slot('SLOT_A',3),slot('SLOT_B',3)],rows:[
    hold('H1','APPLICANT_A',key,until,'HELD','SLOT_A'),
    hold('H2','APPLICANT_A','other-idempotency-0002',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/同一申請者存在多筆有效預約/);
    assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Unrelated duplicate active applicant blocks new hold even with spare seats',()=>{
  const x=make({slots:[slot('SLOT_A',3),slot('SLOT_B',3)],rows:[
    hold('H1','OTHER_APP','other-idempotency-0002',until,'HELD','SLOT_A'),
    hold('H2','OTHER_APP','other-idempotency-0003',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),/同一申請者存在多筆有效預約/);
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Cancelled and expired holds do not falsely count as active duplicates',()=>{
  const x=make({rows:[
    hold('H1','APPLICANT_A','other-idempotency-0002',until,'CANCELLED'),
    hold('H2','APPLICANT_A','other-idempotency-0003','2026-10-29T11:59:00Z','HELD')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
test('Post-append readback rejects a second live booking with a distinct key',()=>{
  const x=make({slots:[slot('SLOT_A',3)],secondActiveAfterAppend:true});
  assert.throws(()=>call(x),/同一申請者存在多筆有效預約/);
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});

test('Post-append historical reservation changes fail closed even if capacity remains safe',()=>{
  const history=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  for(const extra of [
    {mutateHistoricalAfterAppend:[4,'2026-10-29T12:09:00Z']},
    {mutateHistoricalAfterAppend:[3,'EXPIRED']},
    {mutateHistoricalAfterAppend:[5,'historical-request-key-0003']},
    {dropHistoricalAfterAppend:true}
  ]) {
    const x=make({rows:[history],...extra});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/既有資料變動/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key|APPLICANT_A/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Unchanged historical reservations still allow a valid hold',()=>{
  const x=make({rows:[
    hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
