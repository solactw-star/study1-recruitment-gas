'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('demo/Study1-Functional-Demo.html','utf8');
const match=html.match(/<script id="demo-core">([\s\S]*?)<\/script>/);
assert.ok(match,'offline demo exposes testable pure core');
const context={window:{}};
vm.runInNewContext(match[1],context,{timeout:1000});
const core=context.window.Study1DemoCore;
const now=Date.parse('2029-01-01T00:00:00Z');
function state(){
 const config=core.validateConfig({
  title:'Fictional',intro:'Offline demo only',consent:'Not an approved PDF',
  questions:[{id:'Q1',label:'Demo only?',answer:'yes'}],
  slots:[
   {id:'S1',start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:00:00Z',capacity:2,location:'DEMO-LAB'},
   {id:'S2',start:'2030-01-02T10:00:00Z',end:'2030-01-02T11:00:00Z',capacity:1,location:'DEMO-LAB'}
  ]
 });
 const booking=core.book(config,[],{applicant:'DEMO-AA',slotId:'S1',
  eligible:true,verified:true,consentRead:true,signed:true},now);
 return {config,bookings:[booking]};
}
test('admin can move an existing fictional booking without mutating source',()=>{
 const before=state(),original=JSON.stringify(before);
 const after=core.adminMoveBooking(before,'DEMO-AA','S2',now);
 assert.equal(after.bookings[0].slotId,'S2');
 assert.equal(after.bookings[0].status,'CONFIRMED');
 assert.equal(JSON.stringify(before),original);
 assert.equal(core.remaining(after.config,after.bookings,'S2',null,now),0);
});
test('admin cannot overbook, move to same slot, or move past original start',()=>{
 const before=state();
 before.bookings.push(core.book(before.config,before.bookings,{
  applicant:'DEMO-BB',slotId:'S2',eligible:true,verified:true,consentRead:true,signed:true},now));
 const original=JSON.stringify(before);
 assert.throws(()=>core.adminMoveBooking(before,'DEMO-AA','S2',now),/額滿/);
 assert.throws(()=>core.adminMoveBooking(before,'DEMO-AA','S1',now),/相同/);
 assert.throws(()=>core.adminMoveBooking(before,'DEMO-AA','S2',Date.parse('2030-01-01T10:00:00Z')),/已開始/);
 assert.equal(JSON.stringify(before),original);
});
test('admin cancellation preserves a history row and frees a mock seat',()=>{
 const before=state(),original=JSON.stringify(before);
 const after=core.adminCancelBooking(before,'DEMO-AA',now);
 assert.equal(after.bookings[0].status,'CANCELLED');
 assert.equal(after.bookings[0].cancelledAt,new Date(now).toISOString());
 assert.equal(core.remaining(after.config,after.bookings,'S1',null,now),2);
 assert.equal(JSON.stringify(before),original);
 assert.throws(()=>core.adminCancelBooking(after,'DEMO-AA',now),/找不到/);
 assert.throws(()=>core.adminMoveBooking(after,'DEMO-AA','S2',now),/找不到/);
});
test('admin rejects invalid identity, invalid time and already-started cancellation',()=>{
 const before=state(),original=JSON.stringify(before);
 assert.throws(()=>core.adminCancelBooking(before,'REAL-123',now),/識別碼/);
 assert.throws(()=>core.adminMoveBooking(before,'DEMO-AA','S2','2029'),/時間/);
 assert.throws(()=>core.adminCancelBooking(before,'DEMO-AA',NaN),/時間/);
 assert.throws(()=>core.adminCancelBooking(before,'DEMO-AA',Date.parse('2030-01-01T10:00:00Z')),/已開始/);
 assert.equal(JSON.stringify(before),original);
});
test('corrupt restored mock state is refused before admin edits',()=>{
 const before=state();
 before.bookings[0].status='HELD';
 assert.throws(()=>core.adminCancelBooking(before,'DEMO-AA',now),/不合法/);
 assert.throws(()=>core.adminMoveBooking(before,'DEMO-AA','S2',now),/不合法/);
});
test('offline admin has reservation controls, safe DOM text and no live calls',()=>{
 assert.match(html,/id="admin-bookings"/);
 assert.match(html,/function renderAdminBookings\(\)/);
 assert.match(html,/core\.adminMoveBooking\(state,b\.applicant/);
 assert.match(html,/core\.adminCancelBooking\(state,b\.applicant/);
 assert.match(html,/panel\.appendChild\(text\('p'/);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|google\.script\.run|SpreadsheetApp|MailApp|GmailApp)\s*\(/);
});
