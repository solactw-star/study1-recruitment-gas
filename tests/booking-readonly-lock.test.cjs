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
  'gas/BookingReadOnlyLock.js'
].map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
const now = '2026-10-29T12:00:00Z';
const slotHeaders = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const reservationHeaders = ['reservation_id','applicant_id','slot_id',
  'status','hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];

function harness(options={}) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){throw Error('unused');}}};
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const calls = [];
  let reservationHeaderReads=0;
  function sheet(headers, rows) {
    return {
      getLastRow(){return rows.length+1;},
      getLastColumn(){return headers.length;},
      getRange(r,c,h,w) {
        return {getValues(){
          if (r===1) {
            if (options.loseLockDuringRead && headers[0]==='reservation_id' &&
                ++reservationHeaderReads===2) held=false;
            return [headers.slice()];
          }
          return rows.map(row=>row.slice());
        },getFormulas(){
          const grid=Array.from({length:h},()=>Array(w).fill(''));
          if(options.formulaInSlots && headers[0]==='slot_id' && r===2)
            grid[0][3]='=1+1';
          return grid;
        }};
      }
    };
  }
  const slots = sheet(options.badHeader?['INVALID',...slotHeaders.slice(1)]:slotHeaders, [
    ['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
      1,'ROOM','OPEN','researcher',now]
  ]);
  const reservations = sheet(reservationHeaders, options.rows || []);
  const opener = id => {
    calls.push('open');
    return {getId(){return id;},getSheetByName(name){
      return name==='Slots'?slots:name==='Reservations'?reservations:null;
    }};
  };
  let held = false;
  const lock = {
    tryLock(timeout) {
      calls.push('tryLock:'+timeout);
      if (options.mutateTryLock) options.mutateTryLock();
      if (options.lockThrows) throw Error('lock failed');
      held = options.granted!==false;
      return held;
    },
    hasLock(){return held && !options.inconsistentLock;},
    releaseLock(){held=false;calls.push('releaseLock');}
  };
  const getLock=()=>{
    calls.push('getLock');
    if (options.mutateGetLock) options.mutateGetLock();
    return lock;
  };
  const run=()=>JSON.parse(JSON.stringify(
    ctx.bookingReadOnlyAvailabilityWithLock_(opener,options.clock || now,getLock)));
  return {ctx,calls,opener,getLock,run};
}

test('lock is acquired before either tab is opened and released after sanitized result',()=>{
  const h=harness();
  assert.deepEqual(h.run(),[{
    slotId:'SLOT_A',startAtUtc:'2026-10-31T09:00:00.000Z',
    endAtUtc:'2026-10-31T10:00:00.000Z',remaining:1
  }]);
  assert.deepEqual(h.calls,['getLock','tryLock:5000','open','releaseLock']);
  assert.doesNotMatch(JSON.stringify(h.run()),/applicant_id|idempotency_key/);
});

test('contention fails closed before opening workbook and never releases unowned lock',()=>{
  const h=harness({granted:false});
  assert.throws(h.run,/無法取得預約讀取鎖/);
  assert.deepEqual(h.calls,['getLock','tryLock:5000']);
});

test('missing or malformed lock dependency fails before workbook access',()=>{
  const h=harness();
  assert.throws(()=>h.ctx.bookingReadOnlyAvailabilityWithLock_(
    h.opener,now,undefined),/鎖介面/);
  assert.throws(()=>h.ctx.bookingReadOnlyAvailabilityWithLock_(
    h.opener,now,()=>({tryLock(){return true;}})),/鎖介面/);
  assert.throws(()=>h.ctx.bookingReadOnlyAvailabilityWithLock_(
    h.opener,now,()=>({tryLock(){return true;},releaseLock(){}})),/鎖介面/);
  assert.deepEqual(h.calls,[]);
});

test('lock acquisition exception never opens workbook or releases unowned lock',()=>{
  const h=harness({lockThrows:true});
  assert.throws(h.run,/lock failed/);
  assert.deepEqual(h.calls,['getLock','tryLock:5000']);
});

test('sheet schema failure releases acquired lock in finally',()=>{
  const h=harness({badHeader:true});
  assert.throws(h.run,/欄位/);
  assert.deepEqual(h.calls,['getLock','tryLock:5000','open','releaseLock']);
});

test('read-only lock wrapper cannot open public intake or write to Sheets',()=>{
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  const wrapper=fs.readFileSync(path.join(root,'gas/BookingReadOnlyLock.js'),'utf8');
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.doesNotMatch(wrapper,/SpreadsheetApp\.|\.setValues\s*\(|\.setValue\s*\(|\.appendRow\s*\(|MailApp|GmailApp/);
});


test('formula corruption fails closed and still releases the acquired lock',()=>{
  const h=harness({formulaInSlots:true});
  assert.throws(h.run,/公式/);
  assert.deepEqual(h.calls,['getLock','tryLock:5000','open','releaseLock']);
});

// Regression: the wrapper itself must pin a mutable Date before acquiring the
// lock, not merely rely on the downstream read-only Sheet adapter.
test('read-only lock freezes Date clock before getLock and tryLock callbacks',()=>{
  for (const hook of ['mutateGetLock','mutateTryLock']) {
    const clock=new Date(now);
    const rows=[['R1','APP_A','SLOT_A','HELD',
      '2026-10-29T12:05:00Z','idempotency-key-0001',
      now,'','','']];
    const options={clock,rows};
    options[hook]=()=>clock.setTime(Date.parse('2026-10-29T12:10:00Z'));
    const h=harness(options);
    // Capacity is one. At the original time the hold is active, so no
    // availability can be offered. A callback-mutated clock would free it.
    assert.deepEqual(h.run(),[],hook);
    assert.deepEqual(h.calls,['getLock','tryLock:5000','open','releaseLock']);
  }
});

test('invalid clock fails before lock acquisition or workbook reads',()=>{
  const h=harness({clock:new Date('invalid')});
  assert.throws(h.run,/時間日期不合法/);
  assert.deepEqual(h.calls,[]);
});

// A fake lock may claim tryLock success but deny actual ownership.
// Never read private reservation data unless hasLock() explicitly confirms it.
test('inconsistent lock ownership fails closed before opening workbook',()=>{
  const h=harness({inconsistentLock:true});
  assert.throws(h.run,/鎖狀態不一致/);
  assert.deepEqual(h.calls,['getLock','tryLock:5000','releaseLock']);
});

// Regression: a cooperating reader must not acknowledge a snapshot after
// its script lock is lost during the second Slots/Reservations pass.
test('read-only wrapper rejects lock loss during snapshot and releases in finally',()=>{
  const h=harness({loseLockDuringRead:true});
  assert.throws(h.run,err=>{
    assert.match(String(err),/讀取鎖於讀取期間失效/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001/);
    return true;
  });
  assert.deepEqual(h.calls,['getLock','tryLock:5000','open','releaseLock']);
});
