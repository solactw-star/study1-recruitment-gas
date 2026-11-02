'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('demo/Study1-Functional-Demo.html','utf8');
const match=html.match(/<script id="demo-core">([\s\S]*?)<\/script>/);
assert.ok(match,'demo core script exists');
const context={window:{}};
vm.runInNewContext(match[1],context,{timeout:1000});
const core=context.window.Study1DemoCore;
function setup(){
 const config=core.validateConfig({title:'Test',intro:'Fictional',consent:'Demo only',
 questions:[{id:'Q1',label:'Read warning?',answer:'yes'}],
 slots:[{id:'S1',start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:00:00Z',capacity:1,location:'DEMO-LAB'},
 {id:'S2',start:'2030-01-02T10:00:00Z',end:'2030-01-02T11:00:00Z',capacity:2,location:'DEMO-LAB'}]});
 return {config,bookings:[],now:Date.parse('2029-01-01T00:00:00Z')};
}
function req(id,slot){return {applicant:id,slotId:slot,eligible:true,verified:true,consentRead:true,signed:true};}
test('offline demo is visibly separated from production and does not call network or real GAS',()=>{
 assert.match(html,/僅供研究團隊離線測試/);
 assert.match(html,/不是正式研究人員後台/);
 assert.match(html,/不會寄信/);
 assert.doesNotMatch(html,/<script[^>]+src=/i);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|google\.script\.run|SpreadsheetApp|MailApp|GmailApp)\s*\(/);
 assert.doesNotMatch(html,/1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ/);
 assert.match(html,/id="import-config"/);
 assert.match(html,/id="export-config"/);
 assert.match(html,/id="pdf-file"/);
 assert.match(html,/id="reschedule"/);
 assert.match(html,/id="cancel"/);
});
test('mock eligibility must match every configured question',()=>{
 const {config}=setup();
 assert.equal(core.qualify(config,{Q1:'yes'}),true);
 assert.equal(core.qualify(config,{Q1:'no'}),false);
 assert.equal(core.qualify(config,{}),false);
});
test('booking requires fake applicant and all mock gates',()=>{
 const {config,bookings,now}=setup();
 assert.throws(()=>core.book(config,bookings,{...req('DEMO-AA','S1'),verified:false},now),/必須完成/);
 assert.throws(()=>core.book(config,bookings,req('REAL-NAME','S1'),now),/DEMO/);
 assert.throws(()=>core.book(config,bookings,{...req('DEMO-AA','S1'),signed:false},now),/必須完成/);
 const result=core.book(config,bookings,req('DEMO-AA','S1'),now);
 assert.equal(result.status,'CONFIRMED');
 assert.equal(result.demo,true);
});
test('capacity and single active booking enforced',()=>{
 const {config,bookings,now}=setup();
 bookings.push(core.book(config,bookings,req('DEMO-AA','S1'),now));
 assert.equal(core.remaining(config,bookings,'S1',null,now),0);
 assert.throws(()=>core.book(config,bookings,req('DEMO-BB','S1'),now),/額滿/);
 assert.throws(()=>core.book(config,bookings,req('DEMO-AA','S2'),now),/已有有效預約/);
});
test('reschedule moves seat and cancellation releases capacity',()=>{
 const {config,bookings,now}=setup();
 bookings.push(core.book(config,bookings,req('DEMO-AA','S1'),now));
 core.reschedule(config,bookings,'DEMO-AA','S2',now);
 assert.equal(core.remaining(config,bookings,'S1',null,now),1);
 assert.equal(core.remaining(config,bookings,'S2',null,now),1);
 core.cancel(bookings,'DEMO-AA',now);
 assert.equal(core.remaining(config,bookings,'S2',null,now),2);
 assert.throws(()=>core.cancel(bookings,'DEMO-AA',now),/找不到有效預約/);
});
test('past slots, bad configuration and invalid capacity fail closed',()=>{
 const {config,bookings,now}=setup();
 assert.throws(()=>core.book(config,bookings,req('DEMO-AA','S1'),Date.parse('2031-01-01')),/已開始/);
 assert.throws(()=>core.validateConfig({...config,slots:[{...config.slots[0],capacity:0}]}),/容量/);
 assert.throws(()=>core.validateConfig({...config,questions:[{id:'Q1',label:'Q',answer:'maybe'}]}),/答案/);
 assert.throws(()=>core.validateConfig({...config,slots:[config.slots[0],config.slots[0]]}),/識別碼/);
});
