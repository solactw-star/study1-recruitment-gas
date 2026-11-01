'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const files = [
  'gas/Website.js', 'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js', 'gas/BookingReadOnlySheet.js',
  'gas/BookingReadOnlyLocked.js'
];
const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-10-29T12:00:00Z';
function fixture(options = {}) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){throw Error('unused');}}};
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  const events=[];
  let held=false;
  const slots = [['SLOT_A','2026-10-31T09:00:00Z',
    '2026-10-31T10:00:00Z',2,'ROOM','OPEN','researcher',now]];
  const rows = [['R1','APP_PRIVATE','SLOT_A','HELD',
    '2026-10-29T12:10:00Z','idempotency-key-0001',now,'','','']];
  function tab(name, headers, values) {
    return {
      getLastRow(){assert.equal(held,true);return values.length+1;},
      getLastColumn(){assert.equal(held,true);return headers.length;},
      getRange(start, column, height, width){
        assert.equal(held,true);
        assert.equal(column,1);
        assert.equal(width,headers.length);
        const data = start===1?[headers]:values;
        assert.equal(height,data.length);
        return {
          getFormulas(){assert.equal(held,true);
            return Array.from({length:height},()=>Array(width).fill(''));},
          getValues(){assert.equal(held,true);events.push(name+':read');
            return data.map(row=>row.slice());}
        };
      }
    };
  }
  const tabs={
    Slots:tab('Slots',options.badHeader?['WRONG',...sh.slice(1)]:sh,slots),
    Reservations:tab('Reservations',rh,rows)
  };
  const opener=id=>{
    assert.equal(held,true);
    events.push('open');
    return {getId(){return id;},
      getSheetByName(name){assert.equal(held,true);return tabs[name];}};
  };
  const lock={
    tryLock(timeout){events.push('tryLock');assert.equal(timeout,5000);
      if(options.deny) return false;
      held=true;return true;},
    hasLock(){events.push('hasLock');
      return options.inconsistentLock ||
        (options.loseAfterRead && events.filter(e=>e==='Reservations:read').length===4)
        ? false : held;},
    releaseLock(){events.push('releaseLock');held=false;
      if(options.releaseError) throw Error('release failed');}
  };
  const getScriptLock=()=>{events.push('getScriptLock');
    if(options.onGetLock) options.onGetLock();
    return options.invalidLock?{}:lock;};
  return {ctx,events,getScriptLock,opener,isHeld:()=>held};
}
function read(x,clock=now) {
  return JSON.parse(JSON.stringify(x.ctx.bookingReadOnlyAvailabilityWithScriptLock_(
    x.getScriptLock,x.opener,clock)));
}
test('holds one script-wide lock across both table passes and returns only safe fields',()=>{
  const x=fixture();
  assert.deepEqual(read(x),[{slotId:'SLOT_A',
    startAtUtc:'2026-10-31T09:00:00.000Z',
    endAtUtc:'2026-10-31T10:00:00.000Z',remaining:1}]);
  assert.equal(x.events[0],'getScriptLock');
  assert.deepEqual(x.events.slice(1,4),['tryLock','hasLock','open']);
  assert.equal(x.events.filter(e=>e==='Slots:read').length,4);
  assert.equal(x.events.filter(e=>e==='Reservations:read').length,4);
  assert.equal(x.events.at(-1),'releaseLock');
  assert.equal(x.isHeld(),false);
  assert.doesNotMatch(JSON.stringify(read(fixture())),
    /APP_PRIVATE|idempotency-key-0001|R1/);
});
test('lock contention fails closed before opening workbook and never releases unowned lock',()=>{
  const x=fixture({deny:true});
  assert.throws(()=>read(x),/無法取得預約全域只讀鎖/);
  assert.deepEqual(x.events,['getScriptLock','tryLock']);
  assert.equal(x.isHeld(),false);
});
test('malformed lock interface fails closed without reading',()=>{
  const x=fixture({invalidLock:true});
  assert.throws(()=>read(x),/鎖介面不合法/);
  assert.deepEqual(x.events,['getScriptLock']);
});
test('inconsistent acquired lock status rejects and releases without opening workbook',()=>{
  const x=fixture({inconsistentLock:true});
  assert.throws(()=>read(x),/鎖狀態不一致/);
  assert.deepEqual(x.events,['getScriptLock','tryLock','hasLock','releaseLock']);
  assert.equal(x.isHeld(),false);
});
test('lock lost after the final read rejects sanitized availability and releases',()=>{
  const x=fixture({loseAfterRead:true});
  assert.throws(()=>read(x),err=>{
    assert.match(String(err),/只讀鎖於讀取期間失效/);
    assert.doesNotMatch(String(err),/APP_PRIVATE|idempotency-key-0001|R1/);
    return true;
  });
  assert.equal(x.events.filter(e=>e==='Reservations:read').length,4);
  assert.equal(x.events.filter(e=>e==='hasLock').length,2);
  assert.equal(x.events.at(-1),'releaseLock');
  assert.equal(x.isHeld(),false);
});
test('schema failure releases lock and does not leak private applicant fields',()=>{
  const x=fixture({badHeader:true});
  assert.throws(()=>read(x),err=>{
    assert.match(String(err),/欄位/);
    assert.doesNotMatch(String(err),/APP_PRIVATE|idempotency-key-0001|R1/);
    return true;
  });
  assert.equal(x.events.at(-1),'releaseLock');
  assert.equal(x.isHeld(),false);
});
test('invalid caller clock fails before acquiring a lock or opening workbook',()=>{
  const x=fixture();
  assert.throws(()=>read(x,new Date('invalid')),/時間日期不合法/);
  assert.deepEqual(x.events,[]);
});
test('mutable caller Date is frozen before injected lock callback runs',()=>{
  const clock=new Date(now);
  const x=fixture({onGetLock(){clock.setTime(Date.parse('2026-10-29T12:20:00Z'));}});
  assert.equal(read(x,clock)[0].remaining,1);
  assert.equal(clock.toISOString(),'2026-10-29T12:20:00.000Z');
  assert.equal(x.events.at(-1),'releaseLock');
});
test('release failure cannot be mistaken for a successful availability result',()=>{
  const x=fixture({releaseError:true});
  assert.throws(()=>read(x),/release failed/);
  assert.equal(x.isHeld(),false);
});
test('module is closed, does not directly access Sheets, write, send email or deploy',()=>{
  const code=fs.readFileSync(path.join(root,'gas/BookingReadOnlyLocked.js'),'utf8');
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  const executable = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  assert.doesNotMatch(executable,/SpreadsheetApp\.|LockService\.|\.setValues\s*\(|\.appendRow\s*\(|MailApp|GmailApp|doPost\s*\(/);
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
});
