'use strict';
// Synthetic-only regression: never open a real 828 spreadsheet.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=['BookingCore.js','BookingHoldTransaction.js']
  .map(name=>fs.readFileSync(path.join(__dirname,'../gas',name),'utf8')).join('\n');
const sh=['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh=['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now='2026-10-29T12:00:00Z';
const until='2026-10-29T12:10:00Z';
function make(metadata) {
  const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
  const slots=[
    ['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
      1,'ROOM','OPEN','researcher',now],
    ['SLOT_B','2026-10-31T11:00:00Z','2026-10-31T12:00:00Z',
      1,'ROOM','CLOSED','researcher',metadata]
  ];
  const rows=[];
  let appends=0,reads=0,releases=0,locked=false;
  const adapters={
    getLock(){return {
      tryLock(){if(locked)return false;locked=true;return true;},
      hasLock(){return locked;},releaseLock(){locked=false;releases++;}
    };},
    isVerifiedAndEligible(){return true;},
    readSnapshot(){
      reads++;
      return {slots:{headers:sh.slice(),rows:slots.map(r=>r.slice())},
        reservations:{headers:rh.slice(),rows:rows.map(r=>r.slice())}};
    },
    appendHold(request){
      appends++;
      rows.push(['R_NEW','APP_A',request.slotId,'HELD',request.holdUntilUtc,
        request.idempotencyKey,request.nowUtc,'','','']);
      return true;
    }
  };
  const request={applicantId:'APP_A',slotId:'SLOT_A',
    idempotencyKey:'test-idempotency-key-0001',nowUtc:now,holdUntilUtc:until};
  return {run:()=>ctx.bookingHoldOnceLocked_(request,adapters),
    stats:()=>({appends,reads,releases,locked})};
}
test('locked hold rejects malformed unrelated slot update timestamps before append',()=>{
  for(const bad of ['yesterday','2026-02-30T12:00:00Z',
    '2026-10-29T12:00:00+08:00',true,123,new Date('invalid')]){
    const x=make(bad);
    assert.throws(()=>x.run(),err=>{
      assert.match(String(err),/時間/);
      assert.doesNotMatch(String(err),/APP_A|test-idempotency-key|R_NEW/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().reads,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().locked,false);
  }
});
test('locked hold preserves optional blank and valid Date/string slot update metadata',()=>{
  for(const valid of ['',now,new Date(now)]){
    const x=make(valid);
    assert.deepEqual(JSON.parse(JSON.stringify(x.run())),
      {held:true,reason:'CREATED'});
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().reads,2);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().locked,false);
  }
});
test('closed booking endpoints remain closed and no live Sheet writer is added',()=>{
  const site=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
  const tx=fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.doesNotMatch(tx,/\.appendRow\s*\(|\.setValues\s*\(|SpreadsheetApp\.openById|MailApp|GmailApp/);
});
