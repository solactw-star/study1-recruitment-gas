'use strict';
// Closed, synthetic regression for idempotent hold replay payload binding.
// No SpreadsheetApp, real participants, public endpoint or production write.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = ['gas/BookingCore.js', 'gas/BookingHoldTransaction.js']
  .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
  .join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const initialNow = '2026-10-30T12:00:00Z';
const expiry = '2026-10-30T12:10:00Z';
function fixture() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const slots = [['SLOT_A','2026-11-01T09:00:00Z',
    '2026-11-01T10:00:00Z',2,'LAB','OPEN','researcher',initialNow]];
  const rows = [['R1','APPLICANT_A','SLOT_A','HELD',expiry,
    'request-idempotency-0001','2026-10-30T11:59:00Z','','','']];
  let appended = 0, released = 0;
  const adapters = {
    getLock() { return {tryLock() { return true; },
      hasLock() { return true; },releaseLock() { released++; }}; },
    isVerifiedAndEligible() { return true; },
    readSnapshot() { return {
      slots:{headers:sh.slice(),rows:slots.map(row=>row.slice())},
      reservations:{headers:rh.slice(),rows:rows.map(row=>row.slice())}
    }; },
    appendHold() { appended++; throw Error('replay must not append'); }
  };
  const request = {applicantId:'APPLICANT_A',slotId:'SLOT_A',
    idempotencyKey:'request-idempotency-0001',
    nowUtc:initialNow,holdUntilUtc:expiry};
  return {run:req=>JSON.parse(JSON.stringify(
    ctx.bookingHoldOnceLocked_(req,adapters))),
    request,stats:()=>({appended,released})};
}

test('same idempotency key with different hold expiry never claims REPLAY',()=>{
  for (const differentExpiry of [
    '2026-10-30T12:09:00Z','2026-10-30T12:11:00Z'
  ]) {
    const x = fixture();
    assert.deepEqual(x.run({...x.request,holdUntilUtc:differentExpiry}),
      {held:false,reason:'REJECTED'});
    assert.deepEqual(x.stats(),{appended:0,released:1});
  }
});

test('exact expiry remains idempotent when retry time advances',()=>{
  const x = fixture();
  assert.deepEqual(x.run({...x.request,nowUtc:'2026-10-30T12:01:00Z'}),
    {held:true,reason:'REPLAY'});
  assert.deepEqual(x.stats(),{appended:0,released:1});
});

test('equivalent UTC millisecond representation is the same expiry',()=>{
  const x = fixture();
  assert.deepEqual(x.run({...x.request,
    holdUntilUtc:'2026-10-30T12:10:00.000Z'}),
    {held:true,reason:'REPLAY'});
  assert.deepEqual(x.stats(),{appended:0,released:1});
});
