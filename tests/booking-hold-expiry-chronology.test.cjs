'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = ['gas/BookingCore.js', 'gas/BookingHoldTransaction.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc',
  'cancelled_at_utc','updated_at_utc'];
const now = '2026-10-29T12:00:00Z';
function make(status='CANCELLED', expiry='2026-10-29T11:59:59Z') {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const slots = [['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
    2,'ROOM','OPEN','researcher',now]];
  const reservations = [['HISTORY_1','OTHER_APPLICANT','SLOT_A',status,expiry,
    'historical-key-0001',now,'','','']];
  let appends=0, releases=0, locks=0;
  const adapters = {
    readSnapshot() {
      return {slots:{headers:sh.slice(),rows:slots.map(row=>row.slice())},
        reservations:{headers:rh.slice(),rows:reservations.map(row=>row.slice())}};
    },
    isVerifiedAndEligible(){return true;},
    getLock(){return {tryLock(){locks++;return true;},
      hasLock(){return true;},releaseLock(){releases++;}};},
    appendHold(){appends++;return true;}
  };
  return {ctx,adapters,reservations,
    stats(){return {appends,releases,locks};}};
}
test('locked snapshot rejects hold expiry before creation even on ignored history',()=>{
  for(const status of ['CANCELLED','EXPIRED','HELD','CONFIRMED']) {
    const x=make(status);
    assert.throws(()=>x.ctx.bookingHoldSnapshot_(x.adapters),err=>{
      assert.match(String(err),/暫留期限早於建立時間/);
      assert.doesNotMatch(String(err),/OTHER_APPLICANT|historical-key|HISTORY_1/);
      return true;
    });
  }
});
test('invalid historical expiry blocks a locked append and releases lock',()=>{
  const x=make('CANCELLED');
  const request={applicantId:'NEW_APPLICANT',slotId:'SLOT_A',
    idempotencyKey:'new-request-key-0001',
    nowUtc:now,holdUntilUtc:'2026-10-29T12:10:00Z'};
  assert.throws(()=>x.ctx.bookingHoldOnceLocked_(request,x.adapters),
    /暫留期限早於建立時間/);
  assert.deepEqual(x.stats(),{appends:0,releases:1,locks:1});
});
test('equal, later, blank and Date hold expiry preserve optional history',()=>{
  for(const expiry of [now,'2026-10-29T12:01:00Z','',
    new Date('2026-10-29T12:01:00Z')]) {
    const x=make('CANCELLED',expiry);
    assert.doesNotThrow(()=>x.ctx.bookingHoldSnapshot_(x.adapters));
  }
});
