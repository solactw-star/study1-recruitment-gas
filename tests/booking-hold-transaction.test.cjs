'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../gas/BookingCore.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
const sh=['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'];
const rh=['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'];
const now='2026-10-29T12:00:00Z', until='2026-10-29T12:10:00Z';
const key='request-idempotency-0001';
function slot(id='SLOT_A',capacity=1,status='OPEN'){
  return [id,'2026-10-31T09:00:00Z','2026-10-31T10:00:00Z',capacity,'ROOM','OPEN'===status?'OPEN':status,'researcher',now];
}
function hold(id='H1',app='APPLICANT_A',idKey=key,expiry=until,status='HELD',slotId='SLOT_A'){
  return [id,app,slotId,status,expiry,idKey,now,'','',''];
}
function make(extra={}){
  const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
  let rows=(extra.rows||[]).map(r=>r.slice());
  let slots=(extra.slots||[slot()]).map(r=>r.slice());
  let heldLock=false,lockAttempts=0,releases=0,appends=0,reads=0;
  const lock={tryLock(){lockAttempts++;if(extra.denyLock||heldLock)return false;heldLock=true;return true;},
    hasLock(){return heldLock;},releaseLock(){releases++;heldLock=false;}};
  const adapters={
    getLock(){return lock;},
    isVerifiedAndEligible(){return extra.verified!==false;},
    readSnapshot(){
      reads++;
      if(extra.readFailureAt===reads)throw new Error('read failed');
      const copy=arr=>arr.map(r=>r.slice());
      return {slots:{headers:sh.slice(),rows:copy(slots)},
        reservations:{headers:extra.badHeaders?['bad']:rh.slice(),rows:copy(rows)}};
    },
    appendHold(req){
      appends++;
      if(extra.appendThrows)throw new Error('append failed');
      if(extra.appendReject)return false;
      const appended=hold('NEW_'+appends,req.applicantId,req.idempotencyKey,
        extra.badExpiry?'2026-10-29T12:30:00Z':req.holdUntilUtc,
        'HELD',req.slotId);
      if(Object.hasOwn(extra,'createdAtAfterAppend')) appended[6]=extra.createdAtAfterAppend;
      if(Object.hasOwn(extra,'confirmedAtAfterAppend')) appended[7]=extra.confirmedAtAfterAppend;
      if(Object.hasOwn(extra,'cancelledAtAfterAppend')) appended[8]=extra.cancelledAtAfterAppend;
      if(Object.hasOwn(extra,'updatedAtAfterAppend')) appended[9]=extra.updatedAtAfterAppend;
      rows.push(appended);
      if(extra.duplicateAppend)rows.push(hold('DUP_'+appends,req.applicantId,req.idempotencyKey,req.holdUntilUtc));
      if(extra.secondActiveAfterAppend) rows.push(hold('EXTRA_'+appends,
        req.applicantId,'other-idempotency-0002',req.holdUntilUtc));
      if(extra.mutateSlotAfterAppend) {
        const [column,value]=extra.mutateSlotAfterAppend;
        slots[0][column]=value;
      }
      if(extra.addSlotAfterAppend) slots.push(slot('SLOT_B',2));
      if(extra.dropSlotAfterAppend) slots.shift();
      if(extra.mutateSlotDateAfterAppend)
        slots[0][1].setTime(Date.parse('2026-10-31T09:01:00Z'));
      if(extra.mutateHistoricalAfterAppend) {
        const [column,value]=extra.mutateHistoricalAfterAppend;
        rows[0][column]=value;
      }
      if(extra.dropHistoricalAfterAppend) rows.shift();
      if(extra.mutateHistoricalDateAfterAppend) rows[0][6].setTime(Date.parse('2026-10-29T12:01:00Z'));
      return true;
    }
  };
  const request={applicantId:'APPLICANT_A',slotId:'SLOT_A',idempotencyKey:key,nowUtc:now,holdUntilUtc:until};
  return {ctx,adapters,request,stats:()=>({rows,slots,appends,reads,lockAttempts,releases,heldLock})};
}
function call(x,req=x.request){return JSON.parse(JSON.stringify(x.ctx.bookingHoldOnceLocked_(req,x.adapters)));}
test('Fresh authorized request reserves the last seat with one append and readback',()=>{
  const x=make();
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().reads,2);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
  assert.doesNotMatch(JSON.stringify(call(x)),/APPLICANT_A|request-idempotency|NEW_1/);
});
test('Exact active idempotent replay returns success without second append',()=>{
  const x=make({rows:[hold()]});
  assert.deepEqual(call(x),{held:true,reason:'REPLAY'});
  assert.equal(x.stats().appends,0);
});
test('Expired, cancelled, confirmed or other-slot replay never claims success',()=>{
  for(const row of [
    hold('H1','APPLICANT_A',key,'2026-10-29T11:59:59Z')
      .map((v,i)=>i===6?'2026-10-29T11:50:00Z':v),
    hold('H1','APPLICANT_A',key,until,'CANCELLED'),
    hold('H1','APPLICANT_A',key,until,'CONFIRMED'),
    hold('H1','APPLICANT_A',key,until,'HELD','SLOT_B')
  ]){
    const x=make({rows:[row],slots:[slot(),slot('SLOT_B')]});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Replay of an existing hold is rejected if its slot closed or already started',()=>{
  const x=make({rows:[hold()],slots:[slot('SLOT_A',1,'CLOSED')]});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
  const y=make({rows:[hold()],slots:[['SLOT_A','2026-10-29T11:00:00Z',
    '2026-10-29T11:30:00Z',1,'ROOM','OPEN','researcher',now]]});
  // The old fixture was itself inconsistent: an active hold outlasted
  // a slot that had already started. Reject the corrupt snapshot outright.
  assert.throws(()=>call(y),/有效暫留期限晚於原時段開始/);
  assert.equal(y.stats().appends,0);
  assert.equal(y.stats().releases,1);
});
test('Only one seat: other applicant confirmed/held blocks booking',()=>{
  for(const row of [hold('H2','OTHER_APP','other-idempotency-0002',until),
    hold('H2','OTHER_APP','other-idempotency-0002','','CONFIRMED')]){
    const x=make({rows:[row]});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Same applicant with another active hold is rejected even in a different slot',()=>{
  const x=make({rows:[hold('H2','APPLICANT_A','other-idempotency-0002',until,'HELD','SLOT_B')],
    slots:[slot(),slot('SLOT_B')]});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
});
test('No verified and eligible server authorization means no reservation',()=>{
  const x=make({verified:false});
  assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
  assert.equal(x.stats().reads,0);
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Closed, missing or past slot cannot be reserved',()=>{
  for(const slots of [[slot('SLOT_A',1,'CLOSED')],[slot('SLOT_B')],[
    ['SLOT_A','2026-10-28T09:00:00Z','2026-10-28T10:00:00Z',1,'ROOM','OPEN','researcher',now]
  ]]){
    const x=make({slots});
    assert.deepEqual(call(x),{held:false,reason:'REJECTED'});
    assert.equal(x.stats().appends,0);
  }
});
test('Lock contention fails closed without any read or append',()=>{
  const x=make({denyLock:true});
  assert.throws(()=>call(x),/交易鎖/);
  assert.equal(x.stats().reads,0);
  assert.equal(x.stats().appends,0);
});
test('Write/read failures release the lock and do not return success',()=>{
  for(const extra of [{appendReject:true},{appendThrows:true},{readFailureAt:2},
    {duplicateAppend:true},{badExpiry:true}]){
    const x=make(extra);
    assert.throws(()=>call(x));
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Invalid headers, duplicate IDs, unknown statuses and orphan references fail closed',()=>{
  for(const extra of [{badHeaders:true},{rows:[hold('DUP'),hold('DUP','OTHER_APP','other-idempotency-0002')]},
    {rows:[hold('H1','OTHER_APP','other-idempotency-0002',until,'UNKNOWN')]},
    {rows:[hold('H1','OTHER_APP','other-idempotency-0002',until,'HELD','MISSING')]}]){
    const x=make(extra);
    assert.throws(()=>call(x));
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
});
test('Duplicate unrelated historical idempotency keys fail closed before any append',()=>{
  // The requested key is unique; two historical rows still corrupt replay identity.
  // CANCELLED/EXPIRED rows do not occupy seats, so capacity is not the cause.
  const oldKey='historical-request-key-0002';
  const x=make({rows:[
    hold('H1','OTHER_APP_A',oldKey,until,'CANCELLED'),
    hold('H2','OTHER_APP_B',oldKey,until,'EXPIRED')
  ]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/重複預約請求識別碼/);
    assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});
test('Distinct historical keys remain valid and allow an authorized new hold',()=>{
  const x=make({rows:[
    hold('H1','OTHER_APP_A','historical-request-key-0002',until,'CANCELLED'),
    hold('H2','OTHER_APP_B','historical-request-key-0003',now,'EXPIRED')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
test('Server time, TTL, and idempotency key are validated before locking',()=>{
  const x=make();
  for(const req of [
    {...x.request,holdUntilUtc:now},
    {...x.request,holdUntilUtc:'2026-10-29T12:16:00Z'},
    {...x.request,idempotencyKey:'short'},
    {...x.request,nowUtc:'2026-02-30T12:00:00Z'}
  ])assert.throws(()=>call(x,req));
  assert.equal(x.stats().lockAttempts,0);
});
test('No public booking endpoint or direct production Sheets write is introduced',()=>{
  const site=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
  const tx=fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
  assert.match(site,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
  assert.match(site,/function listSlots\(\)\{return \[\];\}/);
  assert.doesNotMatch(tx,/\.appendRow\s*\(|\.setValues\s*\(|SpreadsheetApp|GmailApp|MailApp/);
});

test('Corrupted duplicate active applicant blocks exact-key replay before any write',()=>{
  const x=make({slots:[slot('SLOT_A',3),slot('SLOT_B',3)],rows:[
    hold('H1','APPLICANT_A',key,until,'HELD','SLOT_A'),
    hold('H2','APPLICANT_A','other-idempotency-0002',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/同一申請者存在多筆有效預約/);
    assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Unrelated duplicate active applicant blocks new hold even with spare seats',()=>{
  const x=make({slots:[slot('SLOT_A',3),slot('SLOT_B',3)],rows:[
    hold('H1','OTHER_APP','other-idempotency-0002',until,'HELD','SLOT_A'),
    hold('H2','OTHER_APP','other-idempotency-0003',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),/同一申請者存在多筆有效預約/);
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('Cancelled and expired holds do not falsely count as active duplicates',()=>{
  const x=make({rows:[
    hold('H1','APPLICANT_A','other-idempotency-0002',until,'CANCELLED'),
    hold('H2','APPLICANT_A','other-idempotency-0003','2026-10-29T11:59:00Z','HELD')
      .map((v,i)=>i===6?'2026-10-29T11:50:00Z':v)
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
test('Post-append readback rejects a second live booking with a distinct key',()=>{
  const x=make({slots:[slot('SLOT_A',3)],secondActiveAfterAppend:true});
  assert.throws(()=>call(x),/同一申請者存在多筆有效預約/);
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});

test('Post-append historical reservation changes fail closed even if capacity remains safe',()=>{
  const history=hold('H1','OTHER_APP','historical-request-key-0002',
    '2026-10-29T11:59:59Z','CANCELLED');
  history[6]='2026-10-29T11:50:00Z';
  for(const extra of [
    {mutateHistoricalAfterAppend:[4,'2026-10-29T12:09:00Z']},
    {mutateHistoricalAfterAppend:[3,'EXPIRED']},
    {mutateHistoricalAfterAppend:[5,'historical-request-key-0003']},
    {dropHistoricalAfterAppend:true}
  ]) {
    const x=make({rows:[history],...extra});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/既有資料變動/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key|APPLICANT_A/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Unchanged historical reservations still allow a valid hold',()=>{
  const x=make({rows:[
    hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});

test('Shared Date objects cannot conceal in-place historical timestamp drift',()=>{
  const history=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  history[6]=new Date(now);
  const x=make({rows:[history],mutateHistoricalDateAfterAppend:true});
  assert.throws(()=>call(x),/既有資料變動/);
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().releases,1);
});

test('Post-append slot capacity, status, and metadata drift cannot claim a successful hold',()=>{
  for(const change of [[3,4],[5,'CLOSED'],[7,'2026-10-29T12:01:00Z']]) {
    const x=make({slots:[slot('SLOT_A',3)],mutateSlotAfterAppend:change});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/既有資料變動|時段資料變動/);
      assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Post-append newly inserted slot fails closed, without altering original reservations',()=>{
  const x=make({slots:[slot('SLOT_A',3)],addSlotAfterAppend:true});
  assert.throws(()=>call(x),/時段資料變動/);
  assert.equal(x.stats().releases,1);
});
test('In-place mutation of shared slot Date is detected after defensive copy',()=>{
  const row=slot('SLOT_A',3);
  row[1]=new Date('2026-10-31T09:00:00Z');
  const x=make({slots:[row],mutateSlotDateAfterAppend:true});
  assert.throws(()=>call(x),/既有資料變動/);
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().heldLock,false);
});
test('Unchanged slot Date and metadata still permit a valid hold',()=>{
  const row=slot('SLOT_A',3);
  row[1]=new Date('2026-10-31T09:00:00Z');
  const x=make({slots:[row]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().releases,1);
});

test('Unrelated overcapacity blocks an otherwise valid hold before any append',()=>{
  const x=make({slots:[slot('SLOT_A',1),slot('SLOT_B',1)],rows:[
    hold('H1','OTHER_APP_A','historical-request-key-0002',until,'HELD','SLOT_B'),
    hold('H2','OTHER_APP_B','historical-request-key-0003',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/超出容量/);
    assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});
test('Live booking on unrelated CANCELLED slot blocks new hold',()=>{
  const x=make({slots:[slot('SLOT_A',1),slot('SLOT_B',1,'CANCELLED')],rows:[
    hold('H1','OTHER_APP','historical-request-key-0002',until,'CONFIRMED','SLOT_B')
  ]});
  assert.throws(()=>call(x),/已取消時段仍有有效預約/);
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().releases,1);
});
test('CLOSED slot may retain a booking and does not block another open slot',()=>{
  const x=make({slots:[slot('SLOT_A',1),slot('SLOT_B',1,'CLOSED')],rows:[
    hold('H1','OTHER_APP','historical-request-key-0002',until,'CONFIRMED','SLOT_B')
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});
test('Expired HELD on CANCELLED slot does not count as live occupancy',()=>{
  const x=make({slots:[slot('SLOT_A',1),slot('SLOT_B',1,'CANCELLED')],rows:[
    hold('H1','OTHER_APP','historical-request-key-0002',
      '2026-10-29T11:59:00Z','HELD','SLOT_B')
       .map((v,i)=>i===6?'2026-10-29T11:50:00Z':v)
  ]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
});


test('New HELD row must preserve server creation time and have no confirmation or cancellation event',()=>{
  for(const extra of [
    {createdAtAfterAppend:''},
    {createdAtAfterAppend:'2026-10-29T12:00:01Z'},
    {createdAtAfterAppend:'not-a-timestamp'},
    {confirmedAtAfterAppend:now},
    {cancelledAtAfterAppend:now}
  ]){
    const x=make(extra);
    assert.throws(()=>call(x),err=>{
      assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency-0001|NEW_1/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('New HELD row accepts an equivalent native Date creation timestamp',()=>{
  const x=make({createdAtAfterAppend:new Date(now)});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().releases,1);
});


test('Locked hold rejects surplus and truncated Sheet columns before append',()=>{
  for(const [table,part] of [
    ['slots','headers'],['reservations','headers'],
    ['slots','rows'],['reservations','rows']
  ]) {
    for(const change of ['extra','missing']) {
      const x=make({rows:[hold('OLD','OTHER_APP','other-idempotency-0002',
        '2026-10-29T11:00:00Z','EXPIRED')]});
      const read=x.adapters.readSnapshot;
      x.adapters.readSnapshot=()=>{
        const s=read();
        if(part==='headers') {
          if(change==='extra')s[table].headers.push('unexpected_column');
          else s[table].headers.pop();
        } else {
          if(change==='extra')s[table].rows[0].push('unexpected_value');
          else s[table].rows[0].pop();
        }
        return s;
      };
      assert.throws(()=>call(x),/欄位/);
      assert.equal(x.stats().appends,0);
      assert.equal(x.stats().releases,1);
      assert.equal(x.stats().heldLock,false);
    }
  }
});
test('Locked hold rejects an added column appearing only after append',()=>{
  for(const table of ['slots','reservations']) {
    const x=make();
    const read=x.adapters.readSnapshot;
    let reads=0;
    x.adapters.readSnapshot=()=>{
      const s=read();reads++;
      if(reads===2)s[table].rows[0].push('late_column');
      return s;
    };
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/欄位/);
      assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency-0001/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});

test('Locked readback rejects malformed or pre-creation update timestamp on new hold',()=>{
  for(const updated of ['not-utc','2026-10-29T11:59:59Z',false,
    new Date('2026-10-29T11:59:59Z')]) {
    const x=make({updatedAtAfterAppend:updated});
    assert.throws(()=>call(x),err=>{
      assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency-0001|NEW_1/);
      return true;
    });
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Locked readback permits blank, equal or later valid new hold update timestamp',()=>{
  for(const updated of ['',now,new Date(now),'2026-10-29T12:00:01Z']) {
    const x=make({updatedAtAfterAppend:updated});
    assert.deepEqual(call(x),{held:true,reason:'CREATED'});
    assert.equal(x.stats().appends,1);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});


test('Locked hold fails closed on blank interior slot or reservation rows',()=>{
  const emptySlot=Array(sh.length).fill('');
  const emptyReservation=Array(rh.length).fill('');
  const cases=[
    {slots:[slot('SLOT_A',2),emptySlot,slot('SLOT_B',2)]},
    {rows:[
      hold('H1','OTHER_APP_A','historical-request-key-0002',until,'CANCELLED'),
      emptyReservation,
      hold('H2','OTHER_APP_B','historical-request-key-0003',until,'EXPIRED')
    ]}
  ];
  for(const extra of cases){
    const x=make(extra);
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/內部空白資料列/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key|APPLICANT_A/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});


test('Locked hold refuses contradictory lifecycle events on unrelated history',()=>{
  const scenarios=[
    [7,'HELD'],[8,'HELD'],[7,'EXPIRED'],[8,'EXPIRED'],[8,'CONFIRMED']
  ];
  for(const [eventColumn,status] of scenarios) {
    const row=hold('H1','OTHER_APP','historical-request-key-0002',
      status==='EXPIRED'?'2026-10-29T11:59:00Z':until,status);
    row[eventColumn]=now;
    const x=make({rows:[row],slots:[slot('SLOT_A',3)]});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/預約狀態與事件時間不一致/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key-0002/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Malformed optional event timestamp in cancelled history blocks new hold',()=>{
  for(const [col,bad] of [[7,'not-utc'],[8,true]]) {
    const row=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
    row[col]=bad;
    const x=make({rows:[row]});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/時間/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key-0002/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
});
test('Consistent cancelled history may contain both valid event timestamps',()=>{
  const row=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  row[7]=now;row[8]=now;
  const x=make({rows:[row]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
  assert.equal(x.stats().releases,1);
});


test('Locked hold rejects malformed historical non-event timestamps before any append',()=>{
  for(const [col,bad] of [
    [4,'2026-10-29T12:10:00+08:00'],
    [6,'not-a-timestamp'],
    [9,true],
    [9,new Date('invalid')]
  ]) {
    const row=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
    row[col]=bad;
    const x=make({rows:[row]});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/時間/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key-0002/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Locked hold permits native Date historical timestamps and blank optional metadata',()=>{
  const row=hold('H1','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  row[4]=new Date(until);
  row[6]=new Date(now);
  row[9]=new Date(now);
  const x=make({rows:[row]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
  const blank=hold('H2','OTHER_APP','historical-request-key-0003','','EXPIRED');
  blank[6]='';blank[9]='';
  const y=make({rows:[blank]});
  assert.deepEqual(call(y),{held:true,reason:'CREATED'});
  assert.equal(y.stats().appends,1);
});


test('Locked hold rejects noncanonical Sheet statuses before any append',()=>{
  const badSlots=['open',' OPEN','OPEN ','closed','cancelled'];
  for(const status of badSlots) {
    const changed=slot('SLOT_B',2,status);
    const x=make({slots:[slot('SLOT_A',2),changed]});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/時段狀態非標準值/);
      assert.doesNotMatch(String(err),/APPLICANT_A|request-idempotency/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
  for(const status of ['held','HELD ',' confirmed','cancelled','expired']) {
    const changed=hold('OLD','OTHER_APP','other-idempotency-0002',
      until,status,'SLOT_B');
    const x=make({slots:[slot('SLOT_A',2),slot('SLOT_B',2)],rows:[changed]});
    assert.throws(()=>call(x),/預約狀態非標準值/);
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
});
test('Locked hold refuses text/checkbox capacity and nontext slot metadata',()=>{
  for(const value of ['2','02',true,null,0,1.5]) {
    const changed=slot('SLOT_B',2);
    changed[3]=value;
    const x=make({slots:[slot('SLOT_A',2),changed]});
    assert.throws(()=>call(x),/時段容量儲存格型別不合法/);
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
  }
  for(const column of [4,6]) {
    for(const value of [true,42,null,new Date(now)]) {
      const changed=slot('SLOT_B',2);
      changed[column]=value;
      const x=make({slots:[slot('SLOT_A',2),changed]});
      assert.throws(()=>call(x),/時段文字欄位型別不合法/);
      assert.equal(x.stats().appends,0);
      assert.equal(x.stats().releases,1);
    }
  }
  const valid=slot('SLOT_B',2);
  valid[4]='';valid[6]='';
  const x=make({slots:[slot('SLOT_A',2),valid]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
});

test('Locked hold rejects impossible historical event chronology before append',()=>{
  const cases=[
    {column:7,value:'2026-10-29T11:59:59Z'},
    {column:9,value:'2026-10-29T11:59:59Z'},
    {column:8,value:'2026-10-29T12:02:00Z',confirmed:'2026-10-29T12:04:00Z'},
    {column:9,value:'2026-10-29T12:01:00Z',confirmed:'2026-10-29T12:02:00Z'},
    {column:9,value:'2026-10-29T12:01:00Z',cancelled:'2026-10-29T12:02:00Z'}
  ];
  for(const item of cases){
    const row=hold('OLD','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
    row[item.column]=item.value;
    if(item.confirmed)row[7]=item.confirmed;
    if(item.cancelled)row[8]=item.cancelled;
    const x=make({rows:[row]});
    assert.throws(()=>call(x),err=>{
      assert.match(String(err),/預約歷程時間先後順序不一致/);
      assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key-0002|OLD/);
      return true;
    });
    assert.equal(x.stats().appends,0);
    assert.equal(x.stats().releases,1);
    assert.equal(x.stats().heldLock,false);
  }
});
test('Locked hold allows ordered native Date events and optional blank history',()=>{
  const row=hold('OLD','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  row[7]=new Date(now);
  row[8]=new Date('2026-10-29T12:02:00Z');
  row[9]=new Date('2026-10-29T12:02:00Z');
  const x=make({rows:[row]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  const blank=hold('OLD','OTHER_APP','historical-request-key-0002',until,'CANCELLED');
  blank[6]='';blank[7]='';blank[8]='';blank[9]='';
  const y=make({rows:[blank]});
  assert.deepEqual(call(y),{held:true,reason:'CREATED'});
});

test('Unrelated active hold beyond original slot start blocks locked append',()=>{
  const stale=hold('OLD','OTHER_APP','historical-request-key-0002',
    '2026-10-31T09:01:00Z','HELD','SLOT_B');
  const x=make({slots:[slot('SLOT_A',2),slot('SLOT_B',2,'CLOSED')],
    rows:[stale]});
  assert.throws(()=>call(x),err=>{
    assert.match(String(err),/有效暫留期限晚於原時段開始/);
    assert.doesNotMatch(String(err),/OTHER_APP|historical-request-key-0002|OLD/);
    return true;
  });
  assert.equal(x.stats().appends,0);
  assert.equal(x.stats().reads,1);
  assert.equal(x.stats().releases,1);
  assert.equal(x.stats().heldLock,false);
});
test('Hold expiring exactly at original slot start remains valid; cancelled history does not block',()=>{
  const atStart=hold('OLD','OTHER_APP','historical-request-key-0002',
    '2026-10-31T09:00:00Z','HELD','SLOT_B');
  const x=make({slots:[slot('SLOT_A',2),slot('SLOT_B',2,'CLOSED')],
    rows:[atStart]});
  assert.deepEqual(call(x),{held:true,reason:'CREATED'});
  assert.equal(x.stats().appends,1);
  const historical=hold('OLD','OTHER_APP','historical-request-key-0002',
    '2026-10-31T09:01:00Z','CANCELLED','SLOT_B');
  const y=make({slots:[slot('SLOT_A',2),slot('SLOT_B',2,'CLOSED')],
    rows:[historical]});
  assert.deepEqual(call(y),{held:true,reason:'CREATED'});
  assert.equal(y.stats().appends,1);
});
