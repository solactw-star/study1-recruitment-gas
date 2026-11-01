'use strict';
// Cross-kernel regression: the CLOSED read-only availability path and the
// CLOSED locked booking writer must agree that corrupted historical data
// cannot be used to offer a seat or authorize an append.
// Synthetic fixtures only. No SpreadsheetApp, Gmail, or participant records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const workbookId = '1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const now = '2026-10-30T12:00:00Z';
const until = '2026-10-30T12:10:00Z';
const sh = ['slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'];
const rh = ['reservation_id','applicant_id','slot_id','status',
  'hold_until_utc','idempotency_key','created_at_utc',
  'confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const source = ['gas/BookingCore.js','gas/BookingHoldTransaction.js',
  'gas/BookingReadOnlySheet.js']
  .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
function slots() {
  return [
    ['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
      2,'LAB','OPEN','researcher','2026-10-29T12:00:00Z'],
    ['SLOT_B','2026-10-29T13:00:00Z','2026-10-29T14:00:00Z',
      2,'LAB','CLOSED','researcher','2026-10-29T12:00:00Z']
  ];
}
function reservation(id='R_OLD', applicant='APP_OLD', status='CONFIRMED',
  key='historical-key-0001') {
  return [id,applicant,'SLOT_B',status,'2026-10-29T11:30:00Z',key,
    '2026-10-29T11:00:00Z','2026-10-29T11:15:00Z','',
    '2026-10-29T11:20:00Z'];
}
function fresh(input) {
  return {slots:{headers:sh.slice(),rows:input.slots.map(row=>row.slice())},
    reservations:{headers:rh.slice(),rows:input.rows.map(row=>row.slice())}};
}
function run(input) {
  const ctx={SITE_RESOURCES_:{operations:workbookId}};
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{timeout:2000});
  const sheet=(headers,rows)=>({
    getLastRow(){return rows.length+1;},
    getLastColumn(){return headers.length;},
    getRange(r,c,h,w) {
      return {
        getValues(){return r===1?[headers.slice()]:rows.map(row=>row.slice());},
        getFormulas(){return Array.from({length:h},()=>Array(w).fill(''));}
      };
    }
  });
  const opener=id=>({
    getId(){return id;},
    getSheetByName(name){
      const s=fresh(input);
      if(name==='Slots')return sheet(s.slots.headers,s.slots.rows);
      if(name==='Reservations')return sheet(s.reservations.headers,s.reservations.rows);
      return null;
    }
  });
  let appended=0,released=0;
  const adapters={
    getLock(){return {tryLock(){return true;},hasLock(){return true;},releaseLock(){released++;}};},
    isVerifiedAndEligible(){return true;},
    readSnapshot(){return fresh(input);},
    appendHold(req){
      appended++;
      input.rows.push(['R_NEW',req.applicantId,req.slotId,'HELD',
        req.holdUntilUtc,req.idempotencyKey,req.nowUtc,'','',req.nowUtc]);
      return true;
    }
  };
  const availability=()=>ctx.bookingReadOnlyAvailability_(opener,now);
  const hold=()=>ctx.bookingHoldOnceLocked_({
    applicantId:'APP_NEW',slotId:'SLOT_A',
    idempotencyKey:'new-idempotency-key-0001',
    nowUtc:now,holdUntilUtc:until
  },adapters);
  return {availability,hold,get appended(){return appended;},
    get released(){return released;}};
}
test('valid unrelated CLOSED-slot history does not prevent a new OPEN-slot hold',()=>{
  const h=run({slots:slots(),rows:[reservation()]});
  const available=JSON.parse(JSON.stringify(h.availability()));
  assert.equal(available.length,1);
  assert.equal(available[0].slotId,'SLOT_A');
  assert.equal(available[0].remaining,2);
  assert.equal(h.hold().reason,'CREATED');
  assert.equal(h.appended,1);
  assert.equal(h.released,1);
});
const badCases=[
  ['text-typed capacity',s=>{s.slots[1][3]='2';}],
  ['active reservation on cancelled slot',s=>{s.slots[1][5]='CANCELLED';}],
  ['two live bookings for one applicant',s=>{
    s.rows.push(reservation('R_OLD2','APP_OLD','CONFIRMED',
      'historical-key-0002'));
  }],
  ['overcapacity on unrelated slot',s=>{
    s.slots[1][3]=1;
    s.rows.push(reservation('R_OLD2','APP_OTHER','CONFIRMED',
      'historical-key-0002'));
  }],
  ['orphan reservation reference',s=>{s.rows[0][2]='MISSING';}],
  ['noncanonical stored reservation status',s=>{s.rows[0][3]='confirmed ';}],
  ['invalid slot update metadata',s=>{s.slots[1][7]='yesterday';}],
  ['null optional slot update cell',s=>{s.slots[1][7]=null;}],
  ['null optional reservation history cell',s=>{s.rows[0][8]=null;}],
  ['nonfinite historical timestamp cell',s=>{s.rows[0][9]=Infinity;}],
  ['invalid Date slot metadata',s=>{s.slots[1][7]=new Date('invalid');}],
  ['arbitrary object in cancelled history',s=>{
    s.rows[0][3]='CANCELLED';s.rows[0][8]={unexpected:'object'};
  }],
  ['malformed cancelled history timestamp',s=>{
    s.rows[0][3]='CANCELLED';s.rows[0][7]='not-utc';
  }],
  ['contradictory confirmation and cancellation',s=>{
    s.rows[0][8]='2026-10-29T11:18:00Z';
  }],
  ['historical expired hold beyond original slot start',s=>{
    s.rows[0][3]='HELD';
    s.rows[0][4]='2026-10-29T13:01:00Z';
    s.rows[0][7]='';
  }],
  ['hold expiry earlier than creation',s=>{
    s.rows[0][4]='2026-10-29T10:59:59Z';
  }],
  ['premature EXPIRED before deadline',s=>{
    s.rows[0][3]='EXPIRED';
    s.rows[0][4]='2026-10-30T12:10:00Z';
    s.rows[0][7]='';
  }]
];
for(const [name,mutate] of badCases){
  test('read-only and locked writer both reject '+name+' without appending',()=>{
    const input={slots:slots(),rows:[reservation()]};
    mutate(input);
    const h=run(input);
    const noPrivateDetails=err=>{
      assert.doesNotMatch(String(err),/APP_OLD|historical-key|R_OLD/);
      return true;
    };
    assert.throws(h.availability,noPrivateDetails);
    assert.throws(h.hold,noPrivateDetails);
    assert.equal(h.appended,0);
    assert.equal(h.released,1);
  });
}

// A deadline exactly at the server time is elapsed, not a live hold.
// Preserve the read-only and locked-writer behavior for genuine history.
for (const deadline of ['2026-10-30T12:00:00Z','2026-10-29T11:30:00Z','']) {
  test('elapsed EXPIRED history remains harmless in both kernels: '+(deadline||'blank'),()=>{
    const old=reservation();
    old[3]='EXPIRED';old[4]=deadline;old[7]='';
    const h=run({slots:slots(),rows:[old]});
    assert.equal(h.availability()[0].remaining,2);
    assert.equal(h.hold().reason,'CREATED');
    assert.equal(h.appended,1);
    assert.equal(h.released,1);
  });
}
