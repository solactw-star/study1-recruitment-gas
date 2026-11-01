'use strict';
// CLOSED regression: injected callbacks must not change the validated clock
// used by the availability kernel. All data below are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const base = ['gas/Website.js', 'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js', 'gas/BookingReadOnlySheet.js'];
const sh = ['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc',
  'cancelled_at_utc','updated_at_utc'];
const initial = '2026-10-30T14:00:00.000Z';
function slot(id,capacity=2) {
  return [id,'2026-11-01T09:00:00Z','2026-11-01T10:00:00Z',
    capacity,'ROOM','OPEN','researcher',initial];
}
function hold(id,applicant,slotId,key) {
  return [id,applicant,slotId,'HELD','2026-10-30T14:10:00Z',
    key,'2026-10-30T13:55:00Z','','',''];
}
function scenario(moduleName, mutate) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){
    throw Error('unexpected HTML call');
  }}};
  vm.createContext(ctx);
  const source = [...base,'gas/'+moduleName+'.js']
    .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
  vm.runInContext(source,ctx,{timeout:2000});
  const clock = new Date(initial);
  const request = {applicantId:'APP_A',reservationId:'R1',
    newSlotId:'SLOT_B',nowUtc:clock};
  const snapshot = {slots:{headers:sh,rows:[slot('SLOT_A'),slot('SLOT_B',1)]},
    reservations:{headers:rh,rows:[
      hold('R1','APP_A','SLOT_A','idempotency-key-0001'),
      hold('R2','APP_B','SLOT_B','idempotency-key-0002')]}};
  const observed=[];
  const compute=ctx.bookingComputeAvailability_;
  ctx.bookingComputeAvailability_ = function(slots, reservations, nowUtc) {
    observed.push(nowUtc);
    return compute(slots,reservations,nowUtc);
  };
  const adapters = {
    isVerifiedAndEligible(id) {
      assert.equal(id,'APP_A');
      if(mutate==='verify') clock.setTime(Date.parse('2026-10-30T14:20:00Z'));
      return true;
    },
    readSnapshot() {
      if(mutate==='snapshot') request.nowUtc='not-a-date';
      return snapshot;
    }
  };
  const call = moduleName==='BookingReschedulePreflight'
    ? ctx.bookingReschedulePreflight_ : ctx.bookingCancelHoldPreflight_;
  return {result:JSON.parse(JSON.stringify(call(request,adapters))),
    observed,clock,request};
}
test('reschedule: mutable Date clock cannot free another applicant hold',()=>{
  const x=scenario('BookingReschedulePreflight','verify');
  assert.deepEqual(x.result,{allowed:false,reason:'REJECTED'});
  assert.deepEqual(x.observed,[initial]);
  assert.equal(x.clock.toISOString(),'2026-10-30T14:20:00.000Z');
});
test('reschedule: replacing request.nowUtc during snapshot read is ignored',()=>{
  const x=scenario('BookingReschedulePreflight','snapshot');
  assert.deepEqual(x.result,{allowed:false,reason:'REJECTED'});
  assert.deepEqual(x.observed,[initial]);
  assert.equal(x.request.nowUtc,'not-a-date');
});
test('cancel: mutable Date clock cannot change the internal availability clock',()=>{
  const x=scenario('BookingCancelHoldPreflight','verify');
  assert.deepEqual(x.result,{allowed:true,reason:'LOCKED_RECHECK_REQUIRED'});
  assert.deepEqual(x.observed,[initial]);
});
test('cancel: replacing request.nowUtc during snapshot read is ignored',()=>{
  const x=scenario('BookingCancelHoldPreflight','snapshot');
  assert.deepEqual(x.result,{allowed:true,reason:'LOCKED_RECHECK_REQUIRED'});
  assert.deepEqual(x.observed,[initial]);
});
test('both preflight modules remain internal and contain no real Sheet writes',()=>{
  for(const name of ['BookingReschedulePreflight','BookingCancelHoldPreflight']){
    const code=fs.readFileSync(path.join(root,'gas',name+'.js'),'utf8');
    assert.doesNotMatch(code,/SpreadsheetApp|\.setValues\s*\(|\.appendRow\s*\(|MailApp|GmailApp/);
  }
});
