'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=['gas/BookingCore.js','gas/BookingHoldTransaction.js']
  .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const sh=['slot_id','start_at_utc','end_at_utc','capacity','location_code',
  'status','created_by','updated_at_utc'];
const rh=['reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now='2026-10-29T12:00:00Z',until='2026-10-29T12:10:00Z';
function fixture(dropAt) {
  const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
  const slots=[['SLOT_A','2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',
    2,'ROOM','OPEN','researcher',now]];
  const rows=[];
  let owned=false,releases=0,reads=0,appends=0,eligibility=0;
  const lock={tryLock(){owned=true;return true;},
    hasLock(){return owned;},releaseLock(){releases++;owned=false;}};
  const adapter={
    getLock(){return lock;},
    isVerifiedAndEligible(){
      eligibility++;
      if(dropAt==='eligibility')owned=false;
      return true;
    },
    readSnapshot(){
      reads++;
      if(dropAt==='before-readback' && reads===2)owned=false;
      if(dropAt==='before-append' && reads===1)owned=false;
      return {slots:{headers:sh.slice(),rows:slots.map(r=>r.slice())},
        reservations:{headers:rh.slice(),rows:rows.map(r=>r.slice())}};
    },
    appendHold(req){
      appends++;
      rows.push(['NEW_1',req.applicantId,req.slotId,'HELD',
        req.holdUntilUtc,req.idempotencyKey,req.nowUtc,'','','']);
      if(dropAt==='during-append')owned=false;
      return true;
    }
  };
  const request={applicantId:'APP_A',slotId:'SLOT_A',
    idempotencyKey:'idempotency-key-0001',nowUtc:now,holdUntilUtc:until};
  return {run:()=>ctx.bookingHoldOnceLocked_(request,adapter),
    stats:()=>({owned,releases,reads,appends,eligibility,rows:rows.length})};
}
test('ordinary synthetic hold retains lock until verified write and readback',()=>{
  const x=fixture('never');
  assert.equal(x.run().reason,'CREATED');
  assert.deepEqual(x.stats(),{owned:false,releases:1,reads:2,
    appends:1,eligibility:1,rows:1});
});
for(const [phase,expectedAppends,expectedReads] of [
  ['eligibility',0,0],['before-append',0,1],
  ['during-append',1,1],['before-readback',1,2]
]){
  test('loss of script-lock ownership at '+phase+' fails closed',()=>{
    const x=fixture(phase);
    assert.throws(x.run,err=>{
      assert.match(String(err),/交易鎖在執行期間失效/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|NEW_1/);
      return true;
    });
    assert.equal(x.stats().appends,expectedAppends);
    assert.equal(x.stats().reads,expectedReads);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().owned,false);
  });
}
test('closed public hold endpoint is unchanged',()=>{
  const website=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.match(website,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
});
