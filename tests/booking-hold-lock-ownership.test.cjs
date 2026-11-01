'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=['gas/Website.js','gas/BookingCore.js','gas/BookingHoldTransaction.js']
  .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const req={applicantId:'APP_A',slotId:'SLOT_A',idempotencyKey:'idempotency-key-0001',
  nowUtc:'2026-10-29T12:00:00Z',holdUntilUtc:'2026-10-29T12:10:00Z'};
function fixture(lock) {
  const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
  const calls=[];
  const adapter={getLock(){calls.push('getLock');return lock;},
    isVerifiedAndEligible(){calls.push('eligible');return false;},
    readSnapshot(){calls.push('read');throw Error('unexpected read');},
    appendHold(){calls.push('append');throw Error('unexpected write');}};
  return {calls,run:()=>ctx.bookingHoldOnceLocked_(req,adapter)};
}
test('missing ownership API rejects before trying lock',()=>{
  const events=[],x=fixture({tryLock(){events.push('try');return true;},
    releaseLock(){events.push('release');}});
  assert.throws(x.run,/鎖介面不合法/);
  assert.deepEqual(x.calls,['getLock']);assert.deepEqual(events,[]);
});
test('false ownership releases lock and never accesses data',()=>{
  const events=[],x=fixture({tryLock(){events.push('try');return true;},
    hasLock(){events.push('has');return false;},
    releaseLock(){events.push('release');}});
  assert.throws(x.run,/鎖狀態不一致/);
  assert.deepEqual(x.calls,['getLock']);
  assert.deepEqual(events,['try','has','release']);
});
test('ownership callback error still releases acquired lock',()=>{
  const events=[],x=fixture({tryLock(){events.push('try');return true;},
    hasLock(){events.push('has');throw Error('lost lock');},
    releaseLock(){events.push('release');}});
  assert.throws(x.run,/lost lock/);
  assert.deepEqual(x.calls,['getLock']);
  assert.deepEqual(events,['try','has','release']);
});
test('verified lock retains eligibility rejection and releases',()=>{
  const events=[],x=fixture({tryLock(){events.push('try');return true;},
    hasLock(){events.push('has');return true;},
    releaseLock(){events.push('release');}});
  assert.equal(x.run().held,false);
  assert.deepEqual(x.calls,['getLock','eligible']);
  assert.deepEqual(events,['try','has','has','release']);
});
test('contended lock is never released when not acquired',()=>{
  const events=[],x=fixture({tryLock(){events.push('try');return false;},
    hasLock(){events.push('has');return false;},
    releaseLock(){events.push('release');}});
  assert.throws(x.run,/無法取得預約全域交易鎖/);
  assert.deepEqual(x.calls,['getLock']);assert.deepEqual(events,['try']);
});
test('website intake and consent remain disabled',()=>{
  const site=fs.readFileSync(path.join(root,'gas/Website.js'),'utf8');
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});
