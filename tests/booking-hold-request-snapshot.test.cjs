'use strict';
// Closed-only regression: injected adapters cannot change a previously
// validated booking request. Synthetic data; no real Sheets or participants.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = ['gas/BookingCore.js','gas/BookingHoldTransaction.js']
  .map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
function run(mutateAt) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(source,context,{timeout:2000});
  const now = new Date('2026-10-31T20:00:00Z');
  const until = new Date('2026-10-31T20:10:00Z');
  const request = {
    applicantId:'APP_A',slotId:'SLOT_A',
    idempotencyKey:'request-key-0000001',nowUtc:now,holdUntilUtc:until
  };
  const slot = ['SLOT_A','2026-11-01T09:00:00Z','2026-11-01T10:00:00Z',
    2,'LAB','OPEN','researcher','2026-10-31T19:00:00Z'];
  const rows = [];
  let released=0,appended=0,verifiedId=null,seen=null,reads=0;
  function mutate() {
    request.applicantId='APP_MUTATED';
    request.slotId='SLOT_MUTATED';
    request.idempotencyKey='mutated-request-key-0002';
    now.setTime(Date.parse('2026-12-01T20:00:00Z'));
    until.setTime(Date.parse('2026-12-01T20:10:00Z'));
    request.nowUtc='2026-12-01T20:00:00Z';
    request.holdUntilUtc='2026-12-01T20:10:00Z';
  }
  const adapters={
    getLock(){
      if(mutateAt==='getLock') mutate();
      return {tryLock(){return true;},hasLock(){return true;},releaseLock(){released++;}};
    },
    isVerifiedAndEligible(id){
      verifiedId=id;
      if(mutateAt==='eligibility') mutate();
      return id==='APP_A';
    },
    readSnapshot(){
      reads++;
      if(mutateAt==='readSnapshot' && reads===1) mutate();
      return {slots:{headers:sh.slice(),rows:[slot.slice()]},
        reservations:{headers:rh.slice(),rows:rows.map(row=>row.slice())}};
    },
    appendHold(payload){
      appended++;
      seen={...payload};
      if(mutateAt==='appendHold') mutate();
      rows.push(['R_NEW',payload.applicantId,payload.slotId,'HELD',
        payload.holdUntilUtc,payload.idempotencyKey,payload.nowUtc,'','',
        payload.nowUtc]);
      return true;
    }
  };
  const outcome=JSON.parse(JSON.stringify(
    context.bookingHoldOnceLocked_(request,adapters)));
  return {outcome,appended,released,verifiedId,seen,rows,reads};
}
for(const stage of ['getLock','eligibility','readSnapshot','appendHold']) {
  test('freezes booking request before '+stage+' mutates caller data',()=>{
    const x=run(stage);
    assert.deepEqual(x.outcome,{held:true,reason:'CREATED'});
    assert.equal(x.verifiedId,'APP_A');
    assert.equal(x.appended,1);
    assert.equal(x.released,1);
    assert.equal(x.reads,2);
    assert.deepEqual(x.seen,{
      applicantId:'APP_A',slotId:'SLOT_A',
      idempotencyKey:'request-key-0000001',
      nowUtc:'2026-10-31T20:00:00.000Z',
      holdUntilUtc:'2026-10-31T20:10:00.000Z'
    });
    assert.equal(x.rows[0][1],'APP_A');
    assert.equal(x.rows[0][2],'SLOT_A');
  });
}
