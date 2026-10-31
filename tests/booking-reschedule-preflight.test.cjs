'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = [
  'gas/Website.js',
  'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js',
  'gas/BookingReadOnlySheet.js',
  'gas/BookingReschedulePreflight.js'
].map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-10-30T14:00:00Z';
function slot(id,capacity=2,start='2026-11-01T09:00:00Z',status='OPEN') {
  return [id,start,'2026-11-01T10:00:00Z',capacity,'ROOM',status,'researcher',now];
}
function reservation(id='R1',applicant='APP_A',slotId='SLOT_A',status='HELD',key='idempotency-key-0001') {
  return [id,applicant,slotId,status,'2026-10-30T14:10:00Z',
    key,'2026-10-30T13:55:00Z','','',''];
}
function run(opts={}) {
  const context={HtmlService:{createHtmlOutputFromFile(){throw Error('unused');}}};
  vm.createContext(context);vm.runInContext(source,context);
  const slots=opts.slots||[slot('SLOT_A'),slot('SLOT_B')];
  const rows=opts.rows||[reservation()];
  let reads=0, verifies=0;
  const adapters={
    readSnapshot(){reads++;return {slots:{headers:opts.slotHeaders||sh,rows:slots},
      reservations:{headers:opts.resHeaders||rh,rows}};},
    isVerifiedAndEligible(id){verifies++;return opts.verified!==false&&id==='APP_A';}
  };
  const request={applicantId:'APP_A',reservationId:'R1',newSlotId:'SLOT_B',nowUtc:now,
    ...opts.request};
  const result=()=>JSON.parse(JSON.stringify(context.bookingReschedulePreflight_(request,adapters)));
  return {result,context,stats:()=>({reads,verifies})};
}
test('eligible active hold with available target only permits a later locked recheck',()=>{
  const x=run();
  assert.deepEqual(x.result(),{allowed:true,reason:'LOCKED_RECHECK_REQUIRED'});
  assert.deepEqual(x.stats(),{reads:1,verifies:1});
});
test('same open slot is an unchanged no-op even when its capacity is fully occupied',()=>{
  const x=run({slots:[slot('SLOT_A',1),slot('SLOT_B')],
    request:{newSlotId:'SLOT_A'}});
  assert.deepEqual(x.result(),{allowed:true,reason:'UNCHANGED'});
});
test('unverified applicant is rejected without any snapshot read',()=>{
  const x=run({verified:false});
  assert.deepEqual(x.result(),{allowed:false,reason:'REJECTED'});
  assert.deepEqual(x.stats(),{reads:0,verifies:1});
});
test('other applicant, unknown reservation, and expired/confirmed/cancelled hold are rejected',()=>{
  for(const opts of [
    {request:{applicantId:'APP_B'}},
    {request:{reservationId:'R_UNKNOWN'}},
    {rows:[reservation('R1','APP_A','SLOT_A','CONFIRMED')]},
    {rows:[reservation('R1','APP_A','SLOT_A','CANCELLED')]},
    {rows:[reservation().map((v,i)=>i===4?'2026-10-30T13:59:00Z':v)]}
  ]) assert.deepEqual(run(opts).result(),{allowed:false,reason:'REJECTED'});
});
test('full, closed, cancelled, past, and missing target all reject without mutation',()=>{
  for(const opts of [
    {rows:[reservation(),reservation('R2','APP_B','SLOT_B','CONFIRMED','idempotency-key-0002')],
      slots:[slot('SLOT_A'),slot('SLOT_B',1)]},
    {slots:[slot('SLOT_A'),slot('SLOT_B',2,undefined,'CLOSED')]},
    {slots:[slot('SLOT_A'),slot('SLOT_B',2,undefined,'CANCELLED')]},
    {slots:[slot('SLOT_A'),slot('SLOT_B',2,'2026-10-30T13:00:00Z')]},
    {request:{newSlotId:'SLOT_MISSING'}}
  ]) assert.deepEqual(run(opts).result(),{allowed:false,reason:'REJECTED'});
});
test('never extends hold: target starting before original expiry is rejected',()=>{
  const x=run({slots:[slot('SLOT_A'),slot('SLOT_B',2,'2026-10-30T14:05:00Z')]});
  assert.deepEqual(x.result(),{allowed:false,reason:'REJECTED'});
});
test('duplicate live applicant, overcapacity and orphan history fail closed globally',()=>{
  for(const opts of [
    {rows:[reservation(),reservation('R2','APP_A','SLOT_B','CONFIRMED','idempotency-key-0002')]},
    {slots:[slot('SLOT_A',1),slot('SLOT_B')],rows:[
      reservation(),reservation('R2','APP_B','SLOT_A','CONFIRMED','idempotency-key-0002')]},
    {rows:[reservation(),reservation('R2','APP_B','SLOT_MISSING','CANCELLED','idempotency-key-0002')]}
  ]) assert.throws(()=>run(opts).result());
});
test('current verified *_utc schema is mandatory; old staging headers fail closed',()=>{
  assert.throws(()=>run({resHeaders:rh.map(x=>x==='hold_until_utc'?'hold_until':x)}).result());
  assert.throws(()=>run({slotHeaders:sh.map(x=>x==='start_at_utc'?'start_at':x)}).result());
});
test('noncanonical status and contradictory timestamps reject even historical rows',()=>{
  for(const rows of [
    [reservation(),reservation('R2','APP_B','SLOT_B','cancelled','idempotency-key-0002')],
    [reservation(),reservation('R2','APP_B','SLOT_B','EXPIRED','idempotency-key-0002')
      .map((v,i)=>i===7?now:v)]
  ])assert.throws(()=>run({rows}).result());
});
test('no staging mutation or public endpoint is introduced',()=>{
  const file=fs.readFileSync(path.join(root,'gas/BookingReschedulePreflight.js'),'utf8');
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.doesNotMatch(file,/\.setValues\s*\(|\.appendRow\s*\(|\.setValue\s*\(|SpreadsheetApp|MailApp|GmailApp|LockService/);
  assert.doesNotMatch(site,/function rescheduleHold\s*\(/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
});

test('live hold after original slot start fails closed on reschedule preflight',()=>{
  // Either the shared locked-hold guard or the reschedule guard may reject.
  // Original starts at 09:00; expiry 09:05 is invalid even though
  // the requested destination starts later at 09:30 and has spare seats.
  const late=reservation().map((v,i)=>i===4?'2026-11-01T09:05:00Z':v);
  const x=run({slots:[slot('SLOT_A'),slot('SLOT_B',2,'2026-11-01T09:30:00Z')],
    rows:[late]});
  assert.throws(()=>x.result(),err=>{
    assert.match(String(err),/有效暫留期限(?:晚於|超過)原時段開始/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
});

test('unrelated invalid live hold blocks reschedule, expired history is ignored',()=>{
  const slots=[slot('SLOT_A'),slot('SLOT_B'),slot('SLOT_C')];
  const invalid=reservation('R2','APP_B','SLOT_C','HELD','idempotency-key-0002')
    .map((v,i)=>i===4?'2026-11-01T09:05:00Z':v);
  assert.throws(()=>run({slots,rows:[reservation(),invalid]}).result(),
    /有效暫留期限(?:晚於|超過)原時段開始/);
  const expired=invalid.map((v,i)=>i===4?'2026-10-30T13:59:00Z':v);
  assert.deepEqual(run({slots,rows:[reservation(),expired]}).result(),
    {allowed:true,reason:'LOCKED_RECHECK_REQUIRED'});
});
