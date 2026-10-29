'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = ['gas/Website.js','gas/BookingCore.js',
  'gas/BookingHoldTransaction.js','gas/BookingReadOnlySheet.js']
  .map(p => fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-10-29T12:00:00Z';
function slot(cap=2) {
  return ['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
    cap,'ROOM','OPEN','researcher',now];
}
function reservation(id='R1', status='HELD', key='idempotency-key-0001') {
  return [id,'APP_A','SLOT_A',status,'2026-10-29T12:10:00Z',
    key,now,'','',''];
}
function fake(opts={}) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){throw Error('unused');}}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const calls=[];
  function sheet(name,headers,rows) {
    return {
      getLastRow(){return opts.huge && name==='Reservations'?10002:rows.length+1;},
      getLastColumn(){return opts.extraColumn && name==='Slots'?headers.length+1:headers.length;},
      getRange(r,c,h,w) {
        calls.push([name,r,c,h,w]);
        return {getValues(){return r===1?[headers.slice()]:rows.map(x=>x.slice());}};
      }
    };
  }
  const sheets = {
    Slots:sheet('Slots',opts.badHeader?['WRONG',...sh.slice(1)]:sh,
      opts.slots===undefined?[slot()]:opts.slots),
    Reservations:sheet('Reservations',rh,opts.rows||[])
  };
  const opener = id=>{
    calls.push(['open',id]);
    return {getId(){return opts.wrongId?'WRONG':id;},
      getSheetByName(name){return opts.missing===name?null:sheets[name];}};
  };
  return {ctx,calls,opener};
}
function availability(x) {
  return JSON.parse(JSON.stringify(x.ctx.bookingReadOnlyAvailability_(x.opener,now)));
}
test('reads only 828 workbook and returns sanitized availability',()=>{
  const x=fake({rows:[reservation()]});
  assert.deepEqual(availability(x),[{slotId:'SLOT_A',
    startAtUtc:'2026-10-31T09:00:00.000Z',
    endAtUtc:'2026-10-31T10:00:00.000Z',remaining:1}]);
  assert.equal(x.calls[0][1],'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ');
  assert.deepEqual(x.calls.slice(1).map(c=>c.slice(0,2)),
    [['Slots',1],['Slots',2],['Reservations',1],['Reservations',2]]);
  assert.doesNotMatch(JSON.stringify(availability(x)),/APP_A|idempotency-key|R1/);
});
test('header-only tabs return no availability and never read a zero-row range',()=>{
  const x=fake({slots:[],rows:[]});
  assert.deepEqual(availability(x),[]);
  assert.equal(x.calls.filter(c=>c[1]===2).length,0);
});
test('unknown workbook, missing tab, extra column, wrong header all fail closed',()=>{
  for(const o of [{wrongId:true},{missing:'Slots'},{missing:'Reservations'},
    {extraColumn:true},{badHeader:true}]) {
    const x=fake(o);
    assert.throws(()=>availability(x));
  }
});
test('read limit rejects oversized sheet before reading reservation rows',()=>{
  const x=fake({huge:true});
  assert.throws(()=>availability(x),/維度/);
  assert.equal(x.calls.filter(c=>c[0]==='Reservations'&&c[1]===2).length,0);
});
test('duplicate reservation IDs or idempotency keys reject entire availability',()=>{
  for(const rows of [
    [reservation(),reservation('R1','CANCELLED','idempotency-key-0002')],
    [reservation(),reservation('R2','CANCELLED','idempotency-key-0001')]
  ])assert.throws(()=>availability(fake({rows})),/重複/);
});
test('overbooked slot is rejected even when no seats are offered',()=>{
  const x=fake({slots:[slot(1)],rows:[
    reservation(),reservation('R2','CONFIRMED','idempotency-key-0002')
      .map((value,i)=>i===1?'APP_B':value)]});
  assert.throws(()=>availability(x),/超出/);
});
test('malformed reservation, unknown status, orphan reference reject',()=>{
  for(const rows of [
    [reservation('BAD ID')],
    [[...reservation()].map((x,i)=>i===3?'UNKNOWN':x)],
    [[...reservation()].map((x,i)=>i===2?'MISSING':x)]
  ])assert.throws(()=>availability(fake({rows})));
});
test('two active reservations for one applicant fail closed even with spare capacity',()=>{
  const sameSlot=fake({slots:[slot(3)],rows:[
    reservation(),reservation('R2','CONFIRMED','idempotency-key-0002')]});
  assert.throws(()=>availability(sameSlot),/同一申請者存在多筆有效預約/);
  const otherSlot=slot(3).map((value,i)=>i===0?'SLOT_B':value);
  const second=reservation('R2','CONFIRMED','idempotency-key-0002')
    .map((value,i)=>i===2?'SLOT_B':value);
  const acrossSlots=fake({slots:[slot(3),otherSlot],rows:[reservation(),second]});
  assert.throws(()=>availability(acrossSlots),/同一申請者存在多筆有效預約/);
});
test('expired or cancelled reservation does not falsely duplicate an active applicant',()=>{
  const expired=reservation().map((value,i)=>i===4?'2026-10-29T11:59:00Z':value);
  const confirmed=reservation('R2','CONFIRMED','idempotency-key-0002');
  const x=fake({slots:[slot(3)],rows:[expired,confirmed]});
  assert.deepEqual(availability(x),[{slotId:'SLOT_A',
    startAtUtc:'2026-10-31T09:00:00.000Z',
    endAtUtc:'2026-10-31T10:00:00.000Z',remaining:2}]);
  const y=fake({slots:[slot(3)],rows:[
    reservation('R1','CANCELLED','idempotency-key-0001'),confirmed]});
  assert.equal(availability(y)[0].remaining,2);
});
test('no public endpoint is opened and module has no write or email calls',()=>{
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  const mod=fs.readFileSync(path.join(root,'gas/BookingReadOnlySheet.js'),'utf8');
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.doesNotMatch(mod,/\.appendRow\s*\(|\.setValues\s*\(|\.setValue\s*\(|MailApp|GmailApp|SpreadsheetApp\.openById/);
});
