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
    let dataReads=0, headerReads=0, dimensionReads=0, columnReads=0;
    return {
      getLastRow(){
        dimensionReads++;
        if (opts.huge && name==='Reservations') return 10002;
        if (opts.growSecondPass===name && dimensionReads===2) return rows.length+2;
        if (opts.transientDimension===name && dimensionReads===2) return rows.length+2;
        return rows.length+1;
      },
      getLastColumn(){
        columnReads++;
        if(opts.transientColumn===name && columnReads===2) return headers.length+1;
        return opts.extraColumn && name==='Slots'?headers.length+1:headers.length;
      },
      getRange(r,c,h,w) {
        calls.push([name,r,c,h,w]);
        let valuesRead=false;
        return {getValues(){
          valuesRead=true;
          if(r===1){
            headerReads++;
            const h=headers.slice();
            if(opts.changeHeaderSecondPass===name && headerReads===2) h[0]='ALTERED';
            return [h];
          }
          dataReads++;
          const result=rows.map(x=>x.slice());
          if(opts.mutateOnSecondRead && dataReads===2)
            return opts.mutateOnSecondRead(name,result);
          return result;
        },getFormulas(){
          // Simulate a callback changing a Date object shared with a
          // previously returned getValues() matrix, only on the first read.
          if(opts.mutateDateOnPostReadFormula===name && valuesRead &&
             r===2 && !opts.dateMutated){
            opts.dateMutated=true;
            opts.dateRef.setTime(opts.dateRef.getTime()+60000);
          }
          if (opts.sparseFormulaTab===name && opts.sparseFormulaRow===r) {
            if (opts.sparseFormulaShape==='outer') return Array(h);
            if (opts.sparseFormulaShape==='inner') {
              return Array.from({length:h},(_,i)=>
                i===0?Array(w):Array(w).fill(''));
            }
          }
          if(opts.badFormulaShape===name) return [];
          const matrix=Array.from({length:h},()=>Array(w).fill(''));
          if(opts.formulaAfterValueRead===name && valuesRead && opts.formulaAfterRow===r)
            matrix[0][0]='=NOW()';
          if(opts.formulaTab===name && opts.formulaRow===r)
            matrix[0][opts.formulaColumn||0]='=NOW()';
          return matrix;
        }};
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
    [['Slots',1],['Slots',2],['Reservations',1],['Reservations',2],
     ['Slots',1],['Slots',2],['Reservations',1],['Reservations',2]]);
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
  const expired=reservation().map((value,i)=>i===4?'2026-10-29T11:59:00Z':
    i===6?'2026-10-29T11:40:00Z':value);
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

test('rejects a reservation change between separate cross-tab reads',()=>{
  const x=fake({rows:[reservation()],
    mutateOnSecondRead:(name,rows)=>{
      if(name==='Reservations') rows[0][3]='CANCELLED';
      return rows;
    }});
  assert.throws(()=>availability(x),/讀取期間資料發生變動/);
});
test('rejects changed slot capacity, header, or row count between passes',()=>{
  for(const opts of [
    {mutateOnSecondRead:(name,rows)=>{
      if(name==='Slots') rows[0][3]=99;
      return rows;
    }},
    {changeHeaderSecondPass:'Slots'},
    {growSecondPass:'Reservations'}
  ])assert.throws(()=>availability(fake(opts)));
});
test('transient in-tab row or column drift fails closed before a second pass',()=>{
  for(const opts of [
    {transientDimension:'Reservations'},
    {transientColumn:'Slots'}
  ]) {
    const x=fake({...opts,rows:[reservation()]});
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/讀取期間維度發生變動/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
    // The inconsistent first pass is rejected, even if later reads would
    // revert to the original dimensions and look identical to pass one.
    assert.equal(x.calls.filter(c=>c[0]==='Slots'&&c[1]===1).length,1);
  }
});

test('Date objects are copied before second read so in-place mutations are detected',()=>{
  const start=new Date('2026-10-31T09:00:00Z');
  const row=slot().map((value,i)=>i===1?start:value);
  const x=fake({slots:[row],mutateOnSecondRead:(name,rows)=>{
    if(name==='Slots') start.setTime(start.getTime()+60000);
    return rows;
  }});
  assert.throws(()=>availability(x),/讀取期間資料發生變動/);
});
test('copies Date cells before post-getValues formula callbacks can mutate them',()=>{
  const slotStart=new Date('2026-10-31T09:00:00Z');
  const slotRow=slot().map((v,i)=>i===1?slotStart:v);
  const slotCase=fake({slots:[slotRow],mutateDateOnPostReadFormula:'Slots',
    dateRef:slotStart});
  assert.throws(()=>availability(slotCase),err=>{
    assert.match(String(err),/讀取期間資料發生變動/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });

  const holdExpiry=new Date('2026-10-29T12:10:00Z');
  const reservationRow=reservation().map((v,i)=>i===4?holdExpiry:v);
  const reservationCase=fake({rows:[reservationRow],
    mutateDateOnPostReadFormula:'Reservations',dateRef:holdExpiry});
  assert.throws(()=>availability(reservationCase),err=>{
    assert.match(String(err),/讀取期間資料發生變動/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
});
test('unexpected object or invalid Date cell fails closed without returning PII',()=>{
  for(const bad of [new Date('invalid'),{untrusted:'object'},Infinity]){
    const row=reservation().map((value,i)=>i===8?bad:value);
    assert.throws(()=>availability(fake({rows:[row]})));
  }
});

test('all populated reservation timestamp fields fail closed even on cancelled history',()=>{
  for(const [column,bad] of [
    [4,'not-utc'],[6,'2026-02-30T12:00:00Z'],[7,true],
    [8,'2026-10-29T12:00:00+00:00'],[9,123]
  ]) {
    const row=reservation('R1','CANCELLED').map((v,i)=>i===column?bad:v);
    assert.throws(()=>availability(fake({rows:[row]})),err=>{
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001/);
      return /時間/.test(String(err));
    });
  }
});
test('confirmed history cannot hide a malformed unused hold expiry',()=>{
  const row=reservation('R1','CONFIRMED').map((v,i)=>
    i===4?'2026-10-29T12:00:00+08:00':v);
  assert.throws(()=>availability(fake({rows:[row]})),/時間/);
});
test('slot update metadata is validated, but valid Date metadata remains supported',()=>{
  const badSlot=slot().map((v,i)=>i===7?'yesterday':v);
  assert.throws(()=>availability(fake({slots:[badSlot]})),/時間/);
  const goodSlot=slot().map((v,i)=>i===7?new Date(now):v);
  const goodReservation=reservation().map((v,i)=>
    i===6||i===9?new Date(now):v);
  assert.equal(availability(fake({slots:[goodSlot],rows:[goodReservation]}))[0].remaining,1);
});

test('valid UTC timestamps with impossible lifecycle chronology fail closed',()=>{
  for (const column of [4,7,8,9]) {
    const row=reservation('R1','CANCELLED').map((v,i)=>
      i===column?'2026-10-29T11:59:00Z':v);
    assert.throws(()=>availability(fake({rows:[row]})),err=>{
      assert.match(String(err),/時間先後順序/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
});
test('last update cannot precede a populated confirmation or cancellation timestamp',()=>{
  for (const eventColumn of [7,8]) {
    const row=reservation('R1','CANCELLED').map((v,i)=>
      i===eventColumn?'2026-10-29T12:02:00Z':
      i===9?'2026-10-29T12:01:00Z':v);
    assert.throws(()=>availability(fake({rows:[row]})),/時間先後順序/);
  }
});
test('equal chronology, native Date values and empty optional timestamps stay valid',()=>{
  const equal=reservation('R1','CANCELLED').map((v,i)=>
    [4,7,8,9].includes(i)?new Date(now):v);
  assert.equal(availability(fake({rows:[equal]}))[0].remaining,2);
  const optional=reservation('R1','CANCELLED').map((v,i)=>
    [4,7,8,9].includes(i)?'':v);
  assert.equal(availability(fake({rows:[optional]}))[0].remaining,2);
});

test('noncanonical slot and reservation statuses fail closed, even on history',()=>{
  for(const status of ['open',' OPEN','OPEN ','closed','cancelled']) {
    const changed=slot().map((v,i)=>i===5?status:v);
    assert.throws(()=>availability(fake({slots:[changed]})),/狀態非標準值/);
  }
  for(const status of ['held','HELD ',' Confirmed','cancelled','expired']) {
    const changed=reservation('R1','CANCELLED').map((v,i)=>i===3?status:v);
    assert.throws(()=>availability(fake({rows:[changed]})),/狀態非標準值/);
  }
});

test('canonical CLOSED/CANCELLED slots and cancelled/expired history remain valid',()=>{
  const closed=slot().map((v,i)=>i===5?'CLOSED':v);
  const cancelled=slot().map((v,i)=>i===0?'SLOT_B':i===5?'CANCELLED':v);
  const cancelledRow=reservation('R1','CANCELLED','idempotency-key-0001');
  const expiredRow=reservation('R2','EXPIRED','idempotency-key-0002')
    .map((v,i)=>i===2?'SLOT_B':i===4?now:v);
  assert.deepEqual(availability(fake({slots:[closed,cancelled],
    rows:[cancelledRow,expiredRow]})),[]);
});


test('rejects formulas in slot headers, live reservations and cancelled history',()=>{
  for(const opts of [
    {formulaTab:'Slots',formulaRow:1},
    {formulaTab:'Slots',formulaRow:2,formulaColumn:3},
    {formulaTab:'Reservations',formulaRow:2,formulaColumn:3}
  ]) {
    const x=fake({...opts,rows:[reservation('R1','CANCELLED')]});
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/公式/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001/);
      return true;
    });
  }
});
test('rejects malformed formula matrices instead of trusting getValues alone',()=>{
  for(const name of ['Slots','Reservations']) {
    assert.throws(()=>availability(fake({badFormulaShape:name,
      rows:[reservation('R1','CANCELLED')]})),/公式/);
  }
});


test('live hold expiry after its slot start fails closed, including spare capacity',()=>{
  const late=reservation().map((v,i)=>i===4?'2026-10-31T09:01:00Z':v);
  assert.throws(()=>availability(fake({slots:[slot(3)],rows:[late]})),err=>{
    assert.match(String(err),/有效暫留到期時間晚於時段開始/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
  const exact=reservation().map((v,i)=>i===4?'2026-10-31T09:00:00Z':v);
  assert.equal(availability(fake({slots:[slot(3)],rows:[exact]}))[0].remaining,2);
  // Historical cancelled rows do not imply a live hold.
  const cancelled=reservation('R1','CANCELLED')
    .map((v,i)=>i===4?'2026-10-31T09:01:00Z':v);
  assert.equal(availability(fake({slots:[slot(3)],rows:[cancelled]}))[0].remaining,3);
});

test('active reservations on a cancelled slot fail closed; historical and closed cases remain valid',()=>{
  const cancelled=slot(3).map((v,i)=>i===5?'CANCELLED':v);
  for(const status of ['HELD','CONFIRMED']) {
    const x=fake({slots:[cancelled],rows:[reservation('R1',status)]});
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/已取消時段仍有有效預約/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
  for(const status of ['CANCELLED','EXPIRED']) {
    const historical=reservation('R1',status).map((v,i)=>
      status==='EXPIRED' && i===4?now:v);
    assert.deepEqual(availability(fake({slots:[cancelled],
      rows:[historical]})),[]);
  }
  const expiredHold=reservation().map((v,i)=>
    i===4?'2026-10-29T11:59:00Z':
    i===6?'2026-10-29T11:40:00Z':v);
  assert.deepEqual(availability(fake({slots:[cancelled],rows:[expiredHold]})),[]);
  const closed=slot(3).map((v,i)=>i===5?'CLOSED':v);
  assert.deepEqual(availability(fake({slots:[closed],rows:[reservation()]})),[]);
});

test('capacity must be a native positive integer cell, never coerced from text',()=>{
  for(const bad of ['2','02',true,null,new Date('2026-10-29T12:00:00Z'),2.5,-1,0]) {
    const changed=slot().map((v,i)=>i===3?bad:v);
    assert.throws(()=>availability(fake({slots:[changed],rows:[reservation()]})),err=>{
      assert.match(String(err),bad===null?/非預期資料型別/:/時段容量儲存格/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
  assert.equal(availability(fake({slots:[slot(2)]}))[0].remaining,2);
});

test('nontext location and creator metadata fail closed without exposing values',()=>{
  for(const column of [4,6]) {
    for(const invalid of [true, 42, new Date('2026-10-29T12:00:00Z'), null]) {
      const changed=slot().map((v,i)=>i===column?invalid:v);
      assert.throws(()=>availability(fake({slots:[changed]})),err=>{
        assert.match(String(err),invalid===null?/非預期資料型別/:/時段文字欄位資料型別不合法/);
        assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
        return true;
      });
    }
  }
  // Optional metadata remains optional: no new REC field requirement.
  const blank=slot().map((v,i)=>i===4||i===6?'':v);
  assert.equal(availability(fake({slots:[blank]}))[0].remaining,2);
  assert.equal(availability(fake({slots:[slot()]}))[0].remaining,2);
});

test('cancelled record rejects cancellation timestamp before confirmation, even with spare seats',()=>{
  const row=reservation('R1','CANCELLED').map((v,i)=>
    i===7?'2026-10-29T12:04:00Z':
    i===8?'2026-10-29T12:02:00Z':
    i===9?'2026-10-29T12:05:00Z':v);
  assert.throws(()=>availability(fake({slots:[slot(3)],rows:[row]})),err=>{
    assert.match(String(err),/取消時間早於確認時間/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
});
test('cancelled record allows chronological Date cells, equal timestamps and missing optional events',()=>{
  const row=reservation('R1','CANCELLED').map((v,i)=>
    i===7?new Date('2026-10-29T12:02:00Z'):
    i===8?new Date('2026-10-29T12:04:00Z'):
    i===9?new Date('2026-10-29T12:05:00Z'):v);
  assert.equal(availability(fake({rows:[row]}))[0].remaining,2);
  const equal=row.map((v,i)=>i===8?new Date('2026-10-29T12:02:00Z'):v);
  assert.equal(availability(fake({rows:[equal]}))[0].remaining,2);
  const missing=row.map((v,i)=>i===7||i===8?'':v);
  assert.equal(availability(fake({rows:[missing]}))[0].remaining,2);
});


test('formula introduced between getValues and getFormulas checks fails closed',()=>{
  for(const [name,row] of [['Slots',1],['Slots',2],['Reservations',2]]) {
    const x=fake({rows:[reservation('R1','CANCELLED')],
      formulaAfterValueRead:name,formulaAfterRow:row});
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/公式/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001/);
      return true;
    });
  }
});


test('contradictory lifecycle event timestamps fail closed without leaking IDs',()=>{
  const cases=[
    [ 'HELD', 7 ],
    [ 'HELD', 8 ],
    [ 'EXPIRED', 7 ],
    [ 'EXPIRED', 8 ],
    [ 'CONFIRMED', 8 ]
  ];
  for(const [status,eventColumn] of cases){
    const row=reservation('R1',status).map((v,i)=>
      i===eventColumn?'2026-10-29T12:00:00Z':v);
    assert.throws(()=>availability(fake({slots:[slot(3)],rows:[row]})),err=>{
      assert.match(String(err),/預約狀態與事件時間不一致/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
});
test('consistent lifecycle event timestamps remain accepted',()=>{
  const confirmed=reservation('R1','CONFIRMED').map((v,i)=>
    i===7?'2026-10-29T12:00:00Z':v);
  assert.equal(availability(fake({rows:[confirmed]}))[0].remaining,1);
  const cancelled=reservation('R1','CANCELLED').map((v,i)=>
    i===7||i===8?'2026-10-29T12:00:00Z':v);
  assert.equal(availability(fake({rows:[cancelled]}))[0].remaining,2);
  const elapsed=reservation('R1','EXPIRED').map((v,i)=>i===4?now:v);
  assert.equal(availability(fake({rows:[elapsed]}))[0].remaining,2);
});

test('rejects fully blank interior rows instead of silently ignoring missing records',()=>{
  const emptySlot=Array(sh.length).fill('');
  const emptyReservation=Array(rh.length).fill('');
  const otherSlot=slot().map((value,i)=>i===0?'SLOT_B':value);
  const otherReservation=reservation('R2','CANCELLED','idempotency-key-0002')
    .map((value,i)=>i===1?'APP_B':value);
  for(const opts of [
    {slots:[slot(),emptySlot,otherSlot],rows:[reservation()]},
    {slots:[slot()],rows:[reservation(),emptyReservation,otherReservation]}
  ]) {
    assert.throws(()=>availability(fake(opts)),err=>{
      assert.match(String(err),/內部空白資料列/);
      assert.doesNotMatch(String(err),/APP_A|APP_B|idempotency-key|R1|R2/);
      return true;
    });
  }
  // Truly empty tabs (headers only) are not interior gaps.
  assert.deepEqual(availability(fake({slots:[],rows:[]})),[]);
});

test('expired historical HELD still rejects expiry after slot start',()=>{
  const late=reservation('R1','HELD').map((v,i)=>
    i===4?'2026-10-31T09:01:00Z':v);
  const x=fake({slots:[slot(3)],rows:[late]});
  assert.throws(
    ()=>x.ctx.bookingReadOnlyAvailability_(x.opener,'2026-11-01T12:00:00Z'),
    err=>{
      assert.match(String(err),/暫留到期時間晚於時段開始/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  // A genuinely expired historical hold before slot start remains harmless.
  const valid=reservation('R1','HELD').map((v,i)=>
    i===4?'2026-10-29T12:10:00Z':v);
  const y=fake({slots:[slot(3)],rows:[valid]});
  const available=y.ctx.bookingReadOnlyAvailability_(
    y.opener,'2026-10-30T12:00:00Z');
  assert.equal(available[0].remaining,3);
});

test('sparse formula matrices fail closed rather than bypassing inspection',()=>{
  for (const [name,row,shape] of [
    ['Slots',1,'outer'],
    ['Slots',2,'inner'],
    ['Reservations',2,'outer'],
    ['Reservations',2,'inner']
  ]) {
    const x=fake({rows:[reservation('R1','CANCELLED')],
      sparseFormulaTab:name,sparseFormulaRow:row,sparseFormulaShape:shape});
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/公式檢查格式異常/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
});

test('sparse value matrices fail closed, including optional timestamp holes',()=>{
  const missingSlotMetadata=slot();
  delete missingSlotMetadata[7]; // optional updated_at_utc
  const missingCancelledAt=reservation('R1','CANCELLED');
  delete missingCancelledAt[8]; // optional cancelled_at_utc
  const sparseOuter=[reservation('R1','CANCELLED'),,
    reservation('R2','CANCELLED','idempotency-key-0002')];
  for (const opts of [
    {slots:[missingSlotMetadata]},
    {rows:[missingCancelledAt]},
    {rows:sparseOuter}
  ]) {
    const x=fake(opts);
    assert.throws(()=>availability(x),err=>{
      assert.match(String(err),/預約工作表資料列格式不合法/);
      assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
      return true;
    });
  }
});


test('premature EXPIRED state cannot free a hold whose deadline is still in the future',()=>{
  const premature=reservation('R1','EXPIRED');
  const x=fake({slots:[slot(3)],rows:[premature]});
  assert.throws(()=>availability(x),err=>{
    assert.match(String(err),/標記過期但暫留期限尚未到達/);
    assert.doesNotMatch(String(err),/APP_A|idempotency-key-0001|R1/);
    return true;
  });
});

test('elapsed or exact EXPIRED deadlines remain history; cancellation is not misclassified',()=>{
  const past=reservation('R1','EXPIRED').map((v,i)=>
    i===4?'2026-10-29T11:50:00Z':
    i===6?'2026-10-29T11:40:00Z':v);
  assert.equal(availability(fake({rows:[past]}))[0].remaining,2);
  const exact=reservation('R1','EXPIRED').map((v,i)=>i===4?now:v);
  assert.equal(availability(fake({rows:[exact]}))[0].remaining,2);
  const cancelled=reservation('R1','CANCELLED');
  assert.equal(availability(fake({rows:[cancelled]}))[0].remaining,2);
  // An unrecorded historical expiry remains optional until approved.
  const noDeadline=reservation('R1','EXPIRED').map((v,i)=>i===4?'':v);
  assert.equal(availability(fake({rows:[noDeadline]}))[0].remaining,2);
});

test('freezes mutable Date clock before injected spreadsheet opener runs',()=>{
  const x=fake({rows:[reservation()]});
  const trustedClock=new Date(now);
  const opener=id=>{
    // A callback can mutate a Date passed by reference, but cannot
    // retroactively alter the validated hold-expiry boundary.
    trustedClock.setTime(Date.parse('2026-10-29T12:20:00Z'));
    return x.opener(id);
  };
  const result=JSON.parse(JSON.stringify(
    x.ctx.bookingReadOnlyAvailability_(opener,trustedClock)));
  assert.equal(result.length,1);
  assert.equal(result[0].remaining,1); // original 12:00 UTC: hold still live
  assert.equal(trustedClock.toISOString(),'2026-10-29T12:20:00.000Z');
  assert.doesNotMatch(JSON.stringify(result),/APP_A|idempotency-key-0001/);
});
test('invalid caller clock is rejected before opening any spreadsheet',()=>{
  const x=fake({rows:[reservation()]});
  assert.throws(()=>x.ctx.bookingReadOnlyAvailability_(x.opener,
    new Date('invalid')),/時間日期不合法/);
  assert.equal(x.calls.length,0);
});
