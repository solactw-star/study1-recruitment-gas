'use strict';
// Synthetic fail-closed ordering regression for the internal-only Sheet reader.
// Formula inspection must precede reading cached values, including historical
// Reservations cells. No live Sheets, participant data, or public endpoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = ['gas/Website.js', 'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js', 'gas/BookingReadOnlySheet.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now = '2026-11-02T00:00:00Z';
function fixture(formulaAt) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){
    throw Error('unexpected HTML access');
  }}};
  vm.createContext(ctx);
  vm.runInContext(code, ctx, {timeout:2000});
  const events = [];
  const slot = ['SLOT_A','2026-11-04T09:00:00Z',
    '2026-11-04T10:00:00Z',2,'LAB','OPEN','researcher',now];
  const cancelled = ['R_OLD','APP_PRIVATE','SLOT_A','CANCELLED','',
    'idempotency-key-0001','2026-11-01T00:00:00Z','','',''];
  function sheet(name, headers, rows) {
    let rowFormulaReads = 0;
    return {
      getLastRow(){return rows.length+1;},
      getLastColumn(){return headers.length;},
      getRange(start, column, height, width) {
        assert.equal(column,1);
        assert.equal(width,headers.length);
        return {
          getFormulas() {
            events.push(name+':'+start+':formula');
            const matrix = Array.from({length:height},
              ()=>Array(width).fill(''));
            if (start===2) rowFormulaReads++;
            const isTarget = formulaAt &&
              formulaAt.name===name && formulaAt.start===start &&
              (!formulaAt.secondPass || rowFormulaReads>=3);
            if (isTarget) matrix[0][start===1?0:width-2]='=NOW()';
            return matrix;
          },
          getValues() {
            events.push(name+':'+start+':values');
            return (start===1?[headers]:rows).map(row=>row.slice());
          }
        };
      }
    };
  }
  const tabs = {Slots:sheet('Slots',sh,[slot]),
    Reservations:sheet('Reservations',rh,[cancelled])};
  const opener = id => ({
    getId(){return id;},
    getSheetByName(name){return tabs[name];}
  });
  const read = () => JSON.parse(JSON.stringify(
    ctx.bookingReadOnlyAvailability_(opener,now)));
  return {events,read};
}
for (const scenario of [
  {name:'Slots',start:1},
  {name:'Slots',start:2},
  {name:'Reservations',start:1},
  {name:'Reservations',start:2}
]) {
  test('reject formula before reading cached values: '+
    scenario.name+' row '+scenario.start,()=>{
    const x=fixture(scenario);
    assert.throws(x.read,err=>{
      assert.match(String(err),/公式/);
      assert.doesNotMatch(String(err),/APP_PRIVATE|idempotency-key|R_OLD/);
      return true;
    });
    assert.equal(x.events.filter(e=>e===
      scenario.name+':'+scenario.start+':values').length,0);
    // A failed first pass never proceeds to read private reservation values
    // from a later pass.
    assert.equal(x.events.filter(e=>e==='Reservations:2:values').length,0);
  });
}
test('second-pass historical formula is rejected before second-pass values',()=>{
  const x=fixture({name:'Reservations',start:2,secondPass:true});
  assert.throws(x.read,/公式/);
  assert.equal(x.events.filter(e=>e==='Reservations:2:values').length,1);
  assert.equal(x.events.filter(e=>e==='Reservations:2:formula').length,3);
});
test('formula-free synthetic history remains readable and deidentified',()=>{
  const x=fixture(null);
  assert.deepEqual(x.read(),[{slotId:'SLOT_A',
    startAtUtc:'2026-11-04T09:00:00.000Z',
    endAtUtc:'2026-11-04T10:00:00.000Z',remaining:2}]);
  assert.equal(x.events.filter(e=>e==='Reservations:2:values').length,2);
  assert.doesNotMatch(JSON.stringify(x.read()),/APP_PRIVATE|R_OLD|idempotency-key/);
});
test('public booking and consent endpoints stay closed',()=>{
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});
