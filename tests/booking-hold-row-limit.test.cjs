'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = ['gas/BookingCore.js','gas/BookingHoldTransaction.js']
  .map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
function harness() {
  const ctx = vm.createContext({});
  vm.runInContext(code,ctx);
  const headers = {
    slots: Array.from(ctx.BOOKING_SLOT_HEADERS_),
    reservations: Array.from(ctx.BOOKING_RESERVATION_HEADERS_)
  };
  const snapshot = (slots=[],reservations=[]) => ({
    slots:{headers:headers.slots,rows:slots},
    reservations:{headers:headers.reservations,rows:reservations}
  });
  return {ctx,snapshot};
}
const slot = i => [
  'SLOT_'+i,'2026-11-10T09:00:00Z','2026-11-10T10:00:00Z',
  2,'ROOM','OPEN','researcher','2026-11-01T00:00:00Z'
];
const reservation = i => [
  'R'+i,'APP'+i,'SLOT_0','CANCELLED','',
  'key-000000000000-'+i,'2026-11-01T00:00:00Z','','',''
];
test('locked snapshot rejects >10,000 Slots or Reservations before scanning',()=>{
  const {ctx,snapshot}=harness();
  for (const oversized of [
    snapshot(Array.from({length:10001},(_,i)=>slot(i))),
    snapshot([slot(0)],Array.from({length:10001},(_,i)=>reservation(i)))
  ]) {
    assert.throws(()=>ctx.bookingHoldSnapshot_({readSnapshot:()=>oversized}),
      /安全上限/);
  }
});
test('10,000-slot boundary remains accepted as a snapshot',()=>{
  const {ctx,snapshot}=harness();
  const atLimit=snapshot(Array.from({length:10000},(_,i)=>slot(i)));
  assert.doesNotThrow(()=>ctx.bookingHoldSnapshot_({readSnapshot:()=>atLimit}));
});
test('oversized locked snapshot cannot append and always releases script lock',()=>{
  const {ctx,snapshot}=harness();
  let appended=0, released=0, locked=0;
  const adapters={
    getLock:()=>({tryLock:()=>{locked++;return true;},hasLock:()=>true,releaseLock:()=>{released++;}}),
    isVerifiedAndEligible:()=>true,
    readSnapshot:()=>snapshot(Array.from({length:10001},(_,i)=>slot(i))),
    appendHold:()=>{appended++;return true;}
  };
  const request={applicantId:'APP_A',slotId:'SLOT_0',
    idempotencyKey:'idempotency-key-0001',
    nowUtc:'2026-11-01T00:00:00Z',holdUntilUtc:'2026-11-01T00:10:00Z'};
  assert.throws(()=>ctx.bookingHoldOnceLocked_(request,adapters),/安全上限/);
  assert.equal(locked,1);
  assert.equal(released,1);
  assert.equal(appended,0);
});
