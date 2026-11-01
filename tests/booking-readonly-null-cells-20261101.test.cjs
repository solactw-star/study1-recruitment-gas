'use strict';
// Synthetic regression: Apps Script Range.getValues() returns '' for blank
// cells, not null. A null from an injected adapter indicates malformed data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = ['gas/Website.js', 'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js', 'gas/BookingReadOnlySheet.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const slotsHeader = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const reservationsHeader = ['reservation_id','applicant_id','slot_id',
  'status','hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-11-01T00:00:00Z';
const slot = () => ['SLOT_A','2026-11-03T09:00:00Z',
  '2026-11-03T10:00:00Z',2,'LAB','OPEN','researcher',''];
const reservation = () => ['R1','APP_A','SLOT_A','CANCELLED','',
  'idempotency-key-0001','2026-10-30T00:00:00Z','','',''];
function check(slotRow, reservationRows) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){
    throw Error('unexpected HTML call');
  }}};
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{timeout:2000});
  const table = (header,rows) => ({
    getLastRow(){return rows.length+1;},
    getLastColumn(){return header.length;},
    getRange(row,col,height,width){
      return {
        getValues(){return row===1?[header.slice()]:rows.map(r=>r.slice());},
        getFormulas(){return Array.from({length:height},
          ()=>Array(width).fill(''));}
      };
    }
  });
  const opener = id => ({
    getId(){return id;},
    getSheetByName(name){
      if(name==='Slots')return table(slotsHeader,[slotRow]);
      if(name==='Reservations')return table(reservationsHeader,reservationRows);
      throw Error('unexpected sheet');
    }
  });
  return () => ctx.bookingReadOnlyAvailability_(opener,now);
}
test('rejects null in optional slot update metadata',()=>{
  const s=slot();s[7]=null;
  assert.throws(check(s,[reservation()]),err=>{
    assert.match(String(err),/非預期資料型別/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
});
test('rejects null in cancelled history optional lifecycle cells',()=>{
  for(const index of [4,7,8,9]){
    const r=reservation();r[index]=null;
    assert.throws(check(slot(),[r]),err=>{
      assert.match(String(err),/非預期資料型別/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
});
test('accepts canonical empty-string optional cells and no reservations',()=>{
  const withHistory=JSON.parse(JSON.stringify(check(slot(),[reservation()])()));
  assert.deepEqual(withHistory,[{slotId:'SLOT_A',
    startAtUtc:'2026-11-03T09:00:00.000Z',
    endAtUtc:'2026-11-03T10:00:00.000Z',remaining:2}]);
  assert.equal(check(slot(),[])().length,1);
});
