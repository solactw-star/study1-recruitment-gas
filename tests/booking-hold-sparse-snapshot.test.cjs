'use strict';
// Synthetic-only regression for sparse injected Sheet snapshots.
// The CLOSED locked writer must reject holes before append and on readback.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = ['gas/BookingCore.js','gas/BookingHoldTransaction.js']
  .map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-10-29T12:00:00Z';
const until = '2026-10-29T12:10:00Z';
function slot(id='SLOT_A') {
  return [id,'2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
    3,'ROOM','OPEN','researcher',now];
}
function historical(id='HIST_1',key='historical-request-key-0001') {
  return [id,'PRIVATE_APP','SLOT_A','CANCELLED',until,key,
    now,'','',''];
}
function run(input, corruptReadback) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  let reads=0, appends=0, releases=0;
  const clone = rows => rows.map(row => row.slice()); // preserve holes
  const adapters = {
    getLock(){return {tryLock(){return true;},hasLock(){return true;},releaseLock(){releases++;}};},
    isVerifiedAndEligible(){return true;},
    readSnapshot(){
      reads++;
      const result = {
        slots:{headers:sh.slice(),rows:clone(input.slots)},
        reservations:{headers:rh.slice(),rows:clone(input.rows)}
      };
      if (reads===2 && corruptReadback) corruptReadback(result);
      return result;
    },
    appendHold(req){
      appends++;
      input.rows.push(['NEW_HOLD',req.applicantId,req.slotId,'HELD',
        req.holdUntilUtc,req.idempotencyKey,req.nowUtc,'','',req.nowUtc]);
      return true;
    }
  };
  const request={applicantId:'APP_NEW',slotId:'SLOT_A',
    idempotencyKey:'new-idempotency-key-0001',
    nowUtc:now,holdUntilUtc:until};
  return {
    call:()=>ctx.bookingHoldOnceLocked_(request,adapters),
    stats:()=>({reads,appends,releases})
  };
}
test('dense snapshots and optional blank historical cells remain accepted',()=>{
  const x=run({slots:[slot()],rows:[historical()]});
  assert.equal(x.call().reason,'CREATED');
  assert.deepEqual(x.stats(),{reads:2,appends:1,releases:1});
});
test('sparse outer rows and optional inner cell holes block locked append',()=>{
  const missingSlotMetadata=slot(); delete missingSlotMetadata[7];
  const missingHistoricalEvent=historical(); delete missingHistoricalEvent[8];
  const cases=[
    {slots:[slot(),,slot('SLOT_B')],rows:[historical()]},
    {slots:[slot()],rows:[historical(),,
      historical('HIST_2','historical-request-key-0002')]},
    {slots:[missingSlotMetadata],rows:[historical()]},
    {slots:[slot()],rows:[missingHistoricalEvent]}
  ];
  for(const input of cases) {
    const x=run(input);
    assert.throws(x.call,err=>{
      assert.match(String(err),/資料列格式|欄位寬度/);
      assert.doesNotMatch(String(err),/PRIVATE_APP|historical-request-key|HIST_/);
      return true;
    });
    assert.deepEqual(x.stats(),{reads:1,appends:0,releases:1});
  }
});
test('sparse readback after append cannot be acknowledged as success',()=>{
  const x=run({slots:[slot()],rows:[historical()]},snapshot=>{
    delete snapshot.reservations.rows[0][8];
  });
  assert.throws(x.call,/資料列格式|欄位寬度/);
  assert.deepEqual(x.stats(),{reads:2,appends:1,releases:1});
});
