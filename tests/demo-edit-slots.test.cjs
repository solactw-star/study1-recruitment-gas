'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('demo/Study1-Functional-Demo.html','utf8');
const match=html.match(/<script id="demo-core">([\s\S]*?)<\/script>/);
assert.ok(match);
const context={window:{}};
vm.runInNewContext(match[1],context,{timeout:1000});
const core=context.window.Study1DemoCore;
const now=Date.parse('2029-01-01T00:00:00Z');
function config(){
 return core.validateConfig({title:'Fictional',intro:'Offline demo only',consent:'Not approved',
 questions:[{id:'Q1',label:'Read warning?',answer:'yes'}],
 slots:[{id:'S1',start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:00:00Z',capacity:2,location:'DEMO-LAB'},
 {id:'S2',start:'2030-01-02T10:00:00Z',end:'2030-01-02T11:00:00Z',capacity:2,location:'DEMO-LAB'}]});
}
function edit(c,overrides){
 return {...c.slots[0],...overrides};
}
function booked(){
 const c=config();
 const b=core.book(c,[],{applicant:'DEMO-AA',slotId:'S1',eligible:true,verified:true,consentRead:true,signed:true},now);
 return {config:c,bookings:[b]};
}
test('existing unbooked demo slot can edit dates, location and capacity',()=>{
 const state={config:config(),bookings:[]};
 const result=core.editSlot(state,'S1',edit(state.config,{start:'2030-01-03T10:00:00Z',
 end:'2030-01-03T11:00:00Z',location:'DEMO-ROOM',capacity:3}));
 assert.equal(result.config.slots[0].location,'DEMO-ROOM');
 assert.equal(result.config.slots[0].capacity,3);
 assert.equal(result.config.slots[0].start,'2030-01-03T10:00:00.000Z');
 assert.equal(state.config.slots[0].location,'DEMO-LAB');
});
test('existing booked slot allows safe capacity update but rejects relocation or overbooking',()=>{
 const state=booked(),s=state.config.slots[0];
 assert.equal(core.editSlot(state,'S1',edit(state.config,{capacity:1})).config.slots[0].capacity,1);
 assert.throws(()=>core.editSlot(state,'S1',edit(state.config,{capacity:0})),/容量/);
 assert.throws(()=>core.editSlot(state,'S1',edit(state.config,{start:'2030-01-03T10:00:00Z',end:'2030-01-03T11:00:00Z'})),/時間或地點/);
 assert.throws(()=>core.editSlot(state,'S1',edit(state.config,{location:'OTHER'})),/時間或地點/);
 assert.equal(s.location,'DEMO-LAB');
});
test('slot editor rejects missing IDs and malformed values and never mutates original',()=>{
 const state=booked(),before=JSON.stringify(state);
 assert.throws(()=>core.editSlot(state,'S999',state.config.slots[0]),/找不到/);
 assert.throws(()=>core.editSlot(state,'S1',null),/不合法/);
 assert.throws(()=>core.editSlot(state,'S1',edit(state.config,{capacity:'2'})),/容量/);
 assert.throws(()=>core.editSlot(state,'S1',edit(state.config,{end:'not-a-date'})),/時間/);
 assert.equal(JSON.stringify(state),before);
});
test('slot editor is available in offline admin and does not access live systems',()=>{
 assert.match(html,/編輯 '\+s\.id\+'（時間、地點、容量）'/);
 assert.match(html,/core\.editSlot\(state,s\.id/);
 assert.match(html,/function toLocalInput\(iso\)/);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|google\.script\.run|SpreadsheetApp|MailApp|GmailApp)\s*\(/);
});
