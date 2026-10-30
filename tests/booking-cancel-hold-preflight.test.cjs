'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = [
  'gas/Website.js','gas/BookingCore.js','gas/BookingHoldTransaction.js',
  'gas/BookingReadOnlySheet.js','gas/BookingCancelHoldPreflight.js'
].map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now='2026-10-30T14:00:00Z';
function slot(id='SLOT_A',capacity=2,status='OPEN') {
  return [id,'2026-11-01T09:00:00Z','2026-11-01T10:00:00Z',
    capacity,'ROOM',status,'researcher',now];
}
function reservation(id='R1',applicant='APP_A',status='HELD',slotId='SLOT_A',key='idempotency-key-0001') {
  return [id,applicant,slotId,status,'2026-10-30T14:10:00Z',
    key,'2026-10-30T13:55:00Z','','',''];
}
function run(opts={}) {
  const ctx={HtmlService:{createHtmlOutputFromFile(){throw Error('unused');}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  let reads=0,verifies=0;
  const adapters={
    readSnapshot(){reads++;return {
      slots:{headers:opts.sh||sh,rows:opts.slots||[slot()]},
      reservations:{headers:opts.rh||rh,rows:opts.rows||[reservation()]}
    };},
    isVerifiedAndEligible(id){verifies++;return opts.verified!==false&&id==='APP_A';}
  };
  const request={applicantId:'APP_A',reservationId:'R1',nowUtc:now,...opts.request};
  return {call:()=>JSON.parse(JSON.stringify(ctx.bookingCancelHoldPreflight_(request,adapters))),
    stats:()=>({reads,verifies})};
}
test('valid active hold only yields a locked recheck decision, not a cancellation',()=>{
  const x=run();
  assert.deepEqual(x.call(),{allowed:true,reason:'LOCKED_RECHECK_REQUIRED'});
  assert.deepEqual(x.stats(),{reads:1,verifies:1});
  assert.doesNotMatch(JSON.stringify(x.call()),/APP_A|R1|idempotency/);
});
test('unverified applicant is rejected before snapshot access',()=>{
  const x=run({verified:false});
  assert.deepEqual(x.call(),{allowed:false,reason:'REJECTED'});
  assert.deepEqual(x.stats(),{reads:0,verifies:1});
});
test('unknown, wrong-owner, expired, confirmed and cancelled holds fail closed',()=>{
  for(const opts of [
    {request:{reservationId:'R_UNKNOWN'}},
    {request:{applicantId:'APP_B'}},
    {rows:[reservation('R1','APP_A','CONFIRMED')]},
    {rows:[reservation('R1','APP_A','CANCELLED')]},
    {rows:[reservation().map((v,i)=>i===4?'2026-10-30T13:59:00Z':v)]}
  ]) assert.deepEqual(run(opts).call(),{allowed:false,reason:'REJECTED'});
});
test('closed original slot may be released; cancelled slot with active hold is corrupt',()=>{
  assert.equal(run({slots:[slot('SLOT_A',2,'CLOSED')]}).call().allowed,true);
  assert.throws(()=>run({slots:[slot('SLOT_A',2,'CANCELLED')]}).call(),/已取消時段/);
});
test('unrelated duplicate key, active applicant and overcapacity reject globally',()=>{
  for(const opts of [
    {rows:[reservation(),reservation('R2','APP_B','CANCELLED','SLOT_A','idempotency-key-0001')]},
    {rows:[reservation(),reservation('R2','APP_A','CONFIRMED','SLOT_A','idempotency-key-0002')]},
    {slots:[slot('SLOT_A',1)],rows:[reservation(),reservation('R2','APP_B','CONFIRMED','SLOT_A','idempotency-key-0002')]}
  ]) assert.throws(()=>run(opts).call());
});
test('orphan, malformed history, old schema and contradictory lifecycle fail closed',()=>{
  for(const opts of [
    {rows:[reservation(),reservation('R2','APP_B','CANCELLED','MISSING','idempotency-key-0002')]},
    {rh:rh.map(x=>x==='hold_until_utc'?'hold_until':x)},
    {rows:[reservation().map((v,i)=>i===7?now:v)]},
    {rows:[reservation().map((v,i)=>i===4?'2026-11-01T09:01:00Z':v)]}
  ]) assert.throws(()=>run(opts).call());
});
test('closed cancellation code never writes or exposes a public cancellation endpoint',()=>{
  const file=fs.readFileSync(path.join(root,'gas/BookingCancelHoldPreflight.js'),'utf8');
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.doesNotMatch(file,/\.setValues\s*\(|\.appendRow\s*\(|\.setValue\s*\(|SpreadsheetApp|MailApp|GmailApp|LockService/);
  assert.match(site,/function cancelHold\(\)\{return rejectIntake_\(\);\}/);
});
