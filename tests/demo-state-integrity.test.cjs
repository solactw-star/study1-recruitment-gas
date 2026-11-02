'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('demo/Study1-Functional-Demo.html','utf8');
const source=html.match(/<script id="demo-core">([\s\S]*?)<\/script>/);
assert.ok(source,'demo core exists');
const context={window:{}};
vm.runInNewContext(source[1],context,{timeout:1000});
const core=context.window.Study1DemoCore;
const now=Date.parse('2029-01-01T00:00:00Z');
function config(){
 return core.validateConfig({title:'Demo',intro:'Fictional only',consent:'Test placeholder',
  questions:[{id:'Q1',label:'Read demo warning?',answer:'yes'}],
  slots:[{id:'S1',start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:00:00Z',capacity:1,location:'DEMO-LAB'},
   {id:'S2',start:'2030-01-02T10:00:00Z',end:'2030-01-02T11:00:00Z',capacity:2,location:'DEMO-LAB'}]});
}
function booking(applicant,slotId){
 return core.book(config(),[],{applicant,slotId,eligible:true,verified:true,consentRead:true,signed:true},now);
}
test('browser-restored demo state is checked before seat counts and strips unexpected fields',()=>{
 const c=config(),b=booking('DEMO-AA','S1');
 const clean=core.validateState({config:c,bookings:[{...b,untrusted:'ignored'}]});
 assert.equal(clean.bookings.length,1);
 assert.equal(clean.bookings[0].untrusted,undefined);
 assert.equal(clean.bookings[0].status,'CONFIRMED');
 assert.match(html,/return core\.validateState\(JSON\.parse\(raw\)\)/);
});
test('reject forged, orphaned, duplicated and over-capacity active browser bookings',()=>{
 const c=config(),a=booking('DEMO-AA','S1'),b=booking('DEMO-BB','S1');
 assert.throws(()=>core.validateState({config:c,bookings:[{...a,slotId:'S999'}]}),/不一致/);
 assert.throws(()=>core.validateState({config:c,bookings:[a,{...a,slotId:'S2'}]}),/不一致/);
 assert.throws(()=>core.validateState({config:c,bookings:[a,b]}),/容量/);
 assert.throws(()=>core.validateState({config:c,bookings:[{...a,demo:false}]}),/不合法/);
 assert.throws(()=>core.validateState({config:c,bookings:[{...a,createdAt:'2029-02-30T00:00:00.000Z'}]}),/不合法/);
 assert.throws(()=>core.validateState({config:c,bookings:[{...a,cancelledAt:'2030-01-01T00:00:00.000Z'}]}),/不一致/);
});
test('cancelled mock history can reference deleted slot but must have valid chronology',()=>{
 const c=config(),a=booking('DEMO-AA','S1');
 const cancelled=core.cancel([a],'DEMO-AA',now+1000);
 const cWithoutSlot={...c,slots:c.slots.filter(s=>s.id!=='S1')};
 assert.equal(core.validateState({config:cWithoutSlot,bookings:[cancelled]}).bookings[0].status,'CANCELLED');
 assert.throws(()=>core.validateState({config:cWithoutSlot,bookings:[{...cancelled,cancelledAt:'2028-01-01T00:00:00.000Z'}]}),/時間/);
});
test('admin JSON import rejects capacity reductions and silent relocation of confirmed bookings',()=>{
 const c=config(),a=booking('DEMO-AA','S1'),state={config:c,bookings:[a]};
 const reduced={...c,slots:c.slots.map(s=>s.id==='S1'?{...s,capacity:0}:s)};
 assert.throws(()=>core.replaceConfig(state,reduced),/容量/);
 const changedTime={...c,slots:c.slots.map(s=>s.id==='S1'?{...s,start:'2030-01-01T09:00:00Z'}:s)};
 assert.throws(()=>core.replaceConfig(state,changedTime),/時間或地點/);
 const changedPlace={...c,slots:c.slots.map(s=>s.id==='S1'?{...s,location:'DIFFERENT'}:s)};
 assert.throws(()=>core.replaceConfig(state,changedPlace),/時間或地點/);
 const removed={...c,slots:c.slots.filter(s=>s.id!=='S1')};
 assert.throws(()=>core.replaceConfig(state,removed),/不一致/);
 const safe={...c,slots:c.slots.map(s=>s.id==='S1'?{...s,capacity:2}:s)};
 assert.equal(core.replaceConfig(state,safe).config.slots[0].capacity,2);
 assert.match(html,/core\.replaceConfig\(state,JSON\.parse\(t\)\)/);
});
