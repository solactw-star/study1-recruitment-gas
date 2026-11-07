'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'../gas');
const server=fs.readFileSync(path.join(base,'Study1Unified.js'),'utf8');
const html=fs.readFileSync(path.join(base,'Study1Team.html'),'utf8');
const website=fs.readFileSync(path.join(base,'Website.js'),'utf8');
function env(){
 const ctx=vm.createContext({Date,Math,JSON,Set,Map,Object,Array,Number,String,Error});
 vm.runInContext(server,ctx,{timeout:1000});
 const state=ctx.study1UnifiedInitial_();
 const now=Date.parse('2026-11-05T00:00:00Z');
 const run=(action,payload)=>ctx.study1UnifiedTransition_(state,{action,payload,requestId:'REQ-SIM-TEST-000000001'},now,null);
 const shape={operation:'CREATE',slotId:'',experiment:'E1',title:'隔離測試記憶場次',
  when:'2028-02-07 10:00',capacity:2,minutes:90,place:'虛構教室',
  repeatCount:2,scope:'ONE'};
 return {ctx,state,now,run,shape};
}
test('B02 calendar module is part of existing owner-only team GUI and one inline script',()=>{
 assert.match(website,/view==='team'.*study1AdminOwnerRequired_/);
 for(const id of ['calendarModule','calBoard','calAside','calSessionDetail','calPersonDetail',
  'calForm','calDate','calView','calExperiment','calStatus','calNew','calSaveSession','calSavePerson'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/calendarRender\(\)/);
 assert.match(html,/ADMIN_B02_SLOT/);
 assert.match(html,/ADMIN_B02_ATTEND/);
 assert.equal([...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].length,1);
 const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0][1];
 assert.doesNotThrow(()=>new vm.Script(inline));
 assert.doesNotMatch(html,/<iframe|<script[^>]+src=|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i);
});
test('B02 creates two recurring sessions in the shared TEST slot state with audit and no other research writes',()=>{
 const {ctx,state,run,shape}=env();
 const before=state.slots.length;
 run('ADMIN_B02_SLOT',shape);
 assert.equal(state.slots.length,before+2);
 const a=state.slots.at(-2),b=state.slots.at(-1);
 assert.equal(a.experiment,'E1');
 assert.equal(a.when,'2028-02-07 10:00');
 assert.equal(b.when,'2028-02-14 10:00');
 assert.equal(state.b02.sessions[a.id].title,shape.title);
 assert.equal(state.b02.sessions[b.id].group,state.b02.sessions[a.id].group);
 assert.equal(state.b02.history.at(-1).action,'CREATE');
 assert.equal(state.recruitment.E2.mode,'COMING_SOON');
 assert.equal(state.policy.notification.status,'DISABLED');
 assert.doesNotThrow(()=>ctx.study1UnifiedValidateSlots_(state.slots));
});
test('B02 blocks decreasing capacity below reservations and moving an existing booked time',()=>{
 const {state,run,shape}=env();
 run('ADMIN_B02_SLOT',shape);
 const id=state.slots.at(-2).id;
 state.applications.push({id:'SIM-001',slotId:id,phase:'CONFIRMED'});
 const edit={...shape,operation:'UPDATE',slotId:id,repeatCount:1,capacity:1};
 assert.doesNotThrow(()=>run('ADMIN_B02_SLOT',edit));
 assert.equal(state.slots.find(s=>s.id===id).capacity,1);
 assert.throws(()=>run('ADMIN_B02_SLOT',{...edit,when:'2028-02-07 11:00'}),/已有預約歷史/);
 assert.throws(()=>run('ADMIN_B02_SLOT',{...edit,capacity:0}),/不合法/);
 assert.equal(state.slots.find(s=>s.id===id).when,'2028-02-07 10:00');
});
test('B02 attendance and testing are independently persisted for synthetic participant codes',()=>{
 const {state,run,shape}=env();
 run('ADMIN_B02_SLOT',shape);
 const id=state.slots.at(-2).id;
 state.applications.push({id:'SIM-001',slotId:id,phase:'CONFIRMED'});
 run('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'ABSENT',progress:'PARTIAL',note:'僅虛構測試'});
 assert.equal(state.b02.attendance['SIM-001'].attendance,'ABSENT');
 assert.equal(state.b02.attendance['SIM-001'].progress,'PARTIAL');
 assert.equal(state.b02.history.at(-1).action,'ATTEND');
 assert.throws(()=>run('ADMIN_B02_ATTEND',{id:'REAL-001',attendance:'PRESENT',progress:'COMPLETE',note:''}),/虛構/);
});
test('B02 cancellation retains slot and booking history while rejecting a re-open update',()=>{
 const {state,run,shape}=env();
 run('ADMIN_B02_SLOT',shape);
 const id=state.slots.at(-2).id;
 state.applications.push({id:'SIM-001',slotId:id,phase:'CONFIRMED'});
 const cancel={...shape,operation:'CANCEL',slotId:id,repeatCount:1};
 const length=state.slots.length;
 run('ADMIN_B02_SLOT',cancel);
 assert.equal(state.slots.length,length);
 assert.equal(state.applications[0].slotId,id);
 assert.equal(state.b02.sessions[id].status,'CANCELLED');
 assert.throws(()=>run('ADMIN_B02_SLOT',{...cancel,operation:'UPDATE'}),/已取消場次/);
 assert.match(server,/CANCELLED','CLOSED'.*s\.b02\.sessions/);
});

test('B02 rejects same-experiment overlapping sessions and preserves closed TEST flags',()=>{
 const {state,run,shape}=env();
 run('ADMIN_B02_SLOT',{...shape,repeatCount:1});
 assert.throws(()=>run('ADMIN_B02_SLOT',{...shape,repeatCount:1,title:'重疊測試時段'}),/重疊場次/);
 assert.equal(state.recruitment.E2.year,2027);
 assert.equal(state.recruitment.E2.mode,'COMING_SOON');
 assert.equal(state.policy.consent.E1.approval,'PENDING');
 assert.equal(state.policy.consent.E2.approval,'PENDING');
});

test('B02-A cancellation impact contract is two-stage, source-bound and does not add public writers',()=>{
 for(const id of ['calCancelReview','calCancelSummary','calCancelRows','calCancelAck',
  'calCancelCommit','calCancelBack','calCancelStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/function calCancelImpact_\(requested\)/);
 assert.match(html,/function calCancelSync_\(\)/);
 assert.match(html,/function calCancelCommit_\(\)/);
 assert.match(html,/calCancelReviewState\.impact=impact/);
 assert.match(html,/current\.signature!==prior\.signature/);
 assert.match(html,/current\.revision!==prior\.revision/);
 assert.match(html,/calCancelAck'\)\.checked/);
 assert.match(html,/calCancelReset_\('取消請求已送至原GAS/);
 assert.match(html,/operation:'CANCEL'/);
 assert.match(html,/scope:'ONE'/);
 assert.match(html,/可能已寫入，請重新載入原GAS/);
 assert.match(html,/不取消個別預約、不寄信/);
 assert.doesNotMatch(html,/<iframe|<script[^>]+src=|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i);
 assert.doesNotMatch(server,/function study1UnifiedB02CancelDirect\(/);
});

test('B02-A edit is staged by a source-bound second confirmation in the original owner TEST GUI',()=>{
 for(const id of ['calEditReview','calEditSummary','calEditRows','calEditAck',
  'calEditCommit','calEditBack','calEditStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const fn of ['calEditReset_','calEditPlan_','calEditSync_','calEditStage_','calEditCommit_'])
  assert.match(html,new RegExp('function '+fn+'\\('));
 assert.match(html,/if\(editing\)\{calEditStage_\(payload\);return;\}/);
 assert.match(html,/calEditReviewState\.plan=plan/);
 assert.match(html,/calEditAck'\)\.checked/);
 assert.match(html,/current\.signature!==draft\.signature/);
 assert.match(html,/adminScopeEffective_\('B02'\)/);
 assert.match(html,/\['CANCEL','UPDATE'\]\.includes\(payload\.operation\)/);
 assert.match(html,/\.study1UnifiedPreviewCommand\(\{action,payload,requestId:id,expectedRevision:model\.revision\}\)/);
 assert.doesNotMatch(html,/MailApp|GmailApp|fetch\s*\(|localStorage|sessionStorage/);
});
