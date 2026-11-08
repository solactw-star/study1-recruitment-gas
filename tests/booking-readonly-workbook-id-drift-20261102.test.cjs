'use strict';
// Synthetic fail-closed regression for an injected workbook identity that
// changes after the initial approved-ID check. No real Sheets or participant
// records are accessed, and no production booking endpoint is opened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = ['gas/Website.js', 'gas/BookingCore.js',
  'gas/BookingHoldTransaction.js', 'gas/BookingReadOnlySheet.js']
  .map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
const bookId = '1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const now = '2026-11-02T02:00:00Z';
const slotHeaders = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const reservationHeaders = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];

function fixture(drift) {
  const ctx = {HtmlService:{createHtmlOutputFromFile(){
    throw Error('unexpected HTML access');
  }}};
  vm.createContext(ctx);
  vm.runInContext(source, ctx, {timeout:2000});
  let currentId = bookId;
  let idChecks = 0;
  let reservationReads = 0;
  const slot = ['SLOT_A','2026-11-04T09:00:00Z',
    '2026-11-04T10:00:00Z',2,'LAB','OPEN','researcher',now];
  const cancelled = ['R_OLD','APP_PRIVATE','SLOT_A','CANCELLED','',
    'idempotency-key-0001','2026-11-01T00:00:00Z','','',''];
  function sheet(name, headers, rows) {
    return {
      getLastRow(){return rows.length+1;},
      getLastColumn(){return headers.length;},
      getRange(start, col, height, width) {
        assert.equal(col,1);
        assert.equal(width,headers.length);
        return {
          getFormulas(){return Array.from({length:height},
            ()=>Array(width).fill(''));},
          getValues(){
            const result = (start===1?[headers]:rows).map(row=>row.slice());
            if (name==='Reservations' && start===2) {
              reservationReads++;
              if (drift && reservationReads===2) currentId='OTHER_BOOK';
            }
            return result;
          }
        };
      }
    };
  }
  const tabs = {
    Slots:sheet('Slots',slotHeaders,[slot]),
    Reservations:sheet('Reservations',reservationHeaders,[cancelled])
  };
  const opener = requested => {
    assert.equal(requested,bookId);
    return {
      getId(){idChecks++;return currentId;},
      getSheetByName(name){return tabs[name];}
    };
  };
  return {
    read:()=>JSON.parse(JSON.stringify(
      ctx.bookingReadOnlyAvailability_(opener,now))),
    counts:()=>({idChecks,reservationReads})
  };
}

test('rejects workbook identity drift after two consistent table passes',()=>{
  const x=fixture(true);
  assert.throws(x.read,err=>{
    assert.match(String(err),/工作簿識別碼於讀取期間變動/);
    assert.doesNotMatch(String(err),/APP_PRIVATE|R_OLD|idempotency-key/);
    return true;
  });
  assert.deepEqual(x.counts(),{idChecks:2,reservationReads:2});
});

test('stable approved workbook identity still returns sanitized seats',()=>{
  const x=fixture(false);
  assert.deepEqual(x.read(),[{
    slotId:'SLOT_A',startAtUtc:'2026-11-04T09:00:00.000Z',
    endAtUtc:'2026-11-04T10:00:00.000Z',remaining:2
  }]);
  assert.deepEqual(x.counts(),{idChecks:2,reservationReads:2});
});

test('the public reservation endpoint remains closed',()=>{
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
});
