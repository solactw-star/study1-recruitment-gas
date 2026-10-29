'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','gas','BookingCore.js'),'utf8');
const baseSlots=['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'];
const baseReservations=['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
function kernel() {const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx);return ctx;}
function slot(id,start,end,capacity,status='OPEN') {
  return [id,start,end,capacity,'ROOM828',status,'researcher','2026-10-29T00:00:00Z'];
}
function reservation(id,slotId,status,expiry='') {
  return [id,'private-applicant',slotId,status,expiry,'unique-key','2026-10-29T00:00:00Z','','',''];
}
const now='2026-10-29T12:00:00Z',later='2026-10-31T09:00:00Z',end='2026-10-31T11:00:00Z';
function compute(ctx,s,r,t=now){return JSON.parse(JSON.stringify(ctx.bookingComputeAvailability_(s,r,t)));}
test('Schema headings match existing 828 sheet structure',()=>{
  const k=kernel();
  assert.equal(k.bookingAssertSchema_(baseSlots,k.BOOKING_SLOT_HEADERS_),true);
  assert.equal(k.bookingAssertSchema_(baseReservations,k.BOOKING_RESERVATION_HEADERS_),true);
  assert.throws(()=>k.bookingAssertSchema_(['bad'],k.BOOKING_SLOT_HEADERS_),/欄位/);
  assert.throws(()=>k.bookingAssertSchema_([...baseSlots].reverse(),k.BOOKING_SLOT_HEADERS_),/欄位/);
});
test('Availability counts confirmed reservations and nonexpired holds conservatively',()=>{
  const k=kernel(),rows=[slot('B',later,end,4),slot('A','2026-10-30T09:00:00Z','2026-10-30T11:00:00Z',1)];
  const reservations=[
    reservation('R1','B','CONFIRMED'),
    reservation('R2','B','HELD','2026-10-30T00:00:00Z'),
    reservation('R3','B','HELD','2026-10-29T11:59:59Z'),
    reservation('R4','B','CANCELLED'),
    reservation('R5','A','CONFIRMED')
  ];
  assert.deepEqual(compute(k,rows,reservations),[{slotId:'B',startAtUtc:'2026-10-31T09:00:00.000Z',endAtUtc:'2026-10-31T11:00:00.000Z',remaining:2}]);
});
test('Date edge cases: hold expires exactly at now, past slots excluded, sorted chronologically',()=>{
  const k=kernel();
  const result=compute(k,[slot('A',later,end,1),slot('Z','2026-10-28T08:00:00Z','2026-10-28T10:00:00Z',1),slot('B','2026-10-30T10:00:00Z','2026-10-30T11:00:00Z',1)],[reservation('R1','A','HELD',now)]);
  assert.deepEqual(result.map(x=>x.slotId),['B','A']);
});
test('Closed slots and full-capacity slots never appear',()=>{
  const k=kernel();
  assert.deepEqual(compute(k,[slot('C',later,end,1,'CLOSED'),slot('D',later,end,1)],[reservation('R1','D','CONFIRMED')]),[]);
});
test('Unknown state, malformed time and missing references block the entire calculation',()=>{
  const k=kernel(),s=[slot('A',later,end,1)];
  assert.throws(()=>k.bookingComputeAvailability_(s,[reservation('R1','A','UNRECOGNIZED')],now),/未知預約狀態/);
  assert.throws(()=>k.bookingComputeAvailability_(s,[reservation('R1','B','CONFIRMED')],now),/不存在的時段/);
  assert.throws(()=>k.bookingComputeAvailability_(s,[reservation('R1','A','HELD','NOT_A_DATE')],now),/時間/);
  assert.throws(()=>k.bookingComputeAvailability_([slot('A','2026-02-30T09:00:00Z',end,1)],[],now),/時間日期/);
  assert.throws(()=>k.bookingComputeAvailability_([slot('A',end,later,1)],[],now),/起訖/);
  assert.throws(()=>k.bookingComputeAvailability_([slot('A',later,end,0)],[],now),/容量/);
  assert.throws(()=>k.bookingComputeAvailability_([slot('A',later,end,1),slot('A',later,end,1)],[],now),/重複/);
});
test('Dates from native Sheets Date cells supported',()=>{
  const k=kernel();const date=new Date(later), stop=new Date(end);
  assert.deepEqual(compute(k,[slot('A',date,stop,2)],[]).map(x=>x.slotId),['A']);
});
test('Fully blank rows ignored, private identifiers never returned',()=>{
  const k=kernel(),res=compute(k,[[],slot('A',later,end,3)],[[],reservation('R1','A','CONFIRMED')]);
  assert.equal(res.length,1);
  assert.deepEqual(Object.keys(res[0]).sort(),['endAtUtc','remaining','slotId','startAtUtc'].sort());
  assert.doesNotMatch(JSON.stringify(res),/private-applicant|unique-key|ROOM828/);
});
test('Manual schema preflight reads headings and performs no writes',()=>{
  const ctx=kernel();
  let writes=0,reads=0;
  ctx.SITE_RESOURCES_={operations:'operations-id'};
  ctx.SpreadsheetApp={openById(id){assert.equal(id,'operations-id');return {
    getSheetByName(name){return {getRange(row,col,rows,width) {
      assert.deepEqual([row,col,rows],[1,1,1]);
      const expected=name==='Slots'?baseSlots:baseReservations;
      assert.equal(width,expected.length);
      return {getValues(){reads++;return [expected];},setValues(){writes++;}};
    }};}
  };}};
  assert.equal(ctx.bookingVerifySheetHeaders_().ok,true);
  assert.equal(reads,2); assert.equal(writes,0);
});
test('Public GAS endpoints stay closed and do not call booking module',()=>{
  const site=fs.readFileSync(path.join(__dirname,'..','gas','Website.js'),'utf8');
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function cancelHold\(\)\{return rejectIntake_\(\);\}/);
  assert.doesNotMatch(src,/google\.script\.run|MailApp|GmailApp|\.appendRow\s*\(|\.setValues\s*\(/);
});
