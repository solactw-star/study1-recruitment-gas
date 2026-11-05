'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const server=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../gas/Study1Team.html'),'utf8');
const website=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
function setup(){
 const ctx=vm.createContext({Date,Math,JSON,Array,Object,String,Number,Set,Map,Error});
 vm.runInContext(server,ctx,{timeout:1500});
 const state=ctx.study1UnifiedInitial_();
 ctx.study1UnifiedTransition_(state,{action:'START',payload:{experiment:'E1'}},Date.now(),null);
 return {ctx,state,id:state.applications[0].id};
}
test('B04 eight profile tabs are hosted in the same owner-only team site, accessible from B02 and list',()=>{
 assert.match(website,/view==='team'.*study1AdminOwnerRequired_/);
 assert.match(page,/id="profileModule"[\s\S]*?id="profileSummary"/);
 assert.match(page,/id="profileTimeline"/);
 assert.match(page,/id="profileBack"/);
 assert.match(page,/id="calFullProfile"/);
 assert.match(page,/profileOpen\(cal\.person,'calendar'\)/);
 assert.match(page,/profileOpen\(a\.id,'list'\)/);
 for(const id of ['basic','eligibility','booking','research','consent','notification','admin','audit'])
  assert.match(page,new RegExp('data-b04-tab="'+id+'"'));
 const script=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(script.length,1,'existing study1 team has a single local script');
 assert.doesNotThrow(()=>new vm.Script(script[0][1]));
 assert.doesNotMatch(page,/<iframe|<script[^>]+src=|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i);
});
test('B04 only saves changed administrative note with a reason; audit retains before, after, owner and time',()=>{
 const {ctx,state,id}=setup();
 const now=Date.parse('2026-11-05T10:00:00Z');
 ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id,note:'模擬預約行政備註',reason:'修正欄位內容'}},now,null);
 assert.equal(state.b04.notes[id],'模擬預約行政備註');
 const first=state.b04.history[0];
 assert.equal(first.id,id);assert.equal(first.field,'adminNote');
 assert.equal(first.actor,'OWNER');assert.equal(first.at,new Date(now).toISOString());
 assert.equal(first.before,'');assert.equal(first.after,'模擬預約行政備註');
 assert.equal(first.reason,'修正欄位內容');
 ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id,note:'已更正的虛構備註',reason:'修正日期錯誤'}},now+5000,null);
 assert.equal(state.b04.history.length,2);
 assert.equal(state.b04.history[1].before,'模擬預約行政備註');
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id,note:'已更正的虛構備註',reason:'內容未變更'}},now,null),/未變更/);
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id,note:'X',reason:'短'}},now,null),/更正/);
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id:'SIM-999',note:'X',reason:'此人不存在'}},now,null),/更正/);
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B04_NOTE',payload:{id,note:'<script>',reason:'原因有效'}},now,null),/更正/);
});
test('B04 shares B02 attendance and testing status while keeping correction audit distinct',()=>{
 const {ctx,state,id}=setup();
 state.applications[0].slotId='SIM-SLOT-E1-A';
 const before=state.b04.history.length;
 ctx.study1UnifiedTransition_(state,{action:'ADMIN_B02_ATTEND',
  payload:{id,attendance:'LATE',progress:'PARTIAL',note:'虛構測試'}},
  Date.parse('2026-11-05T12:00:00Z'),null);
 assert.equal(state.b02.attendance[id].attendance,'LATE');
 assert.equal(state.b02.attendance[id].progress,'PARTIAL');
 assert.equal(state.b04.history.length,before+1);
 const h=state.b04.history.at(-1);
 assert.equal(h.field,'attendanceAndProgress');
 assert.match(h.before,/PENDING/);assert.match(h.after,/LATE/);
 assert.match(h.after,/PARTIAL/);assert.ok(h.reason.length>4);
 assert.equal(state.policy.consent.E1.approval,'PENDING');
 assert.equal(state.policy.consent.E2.approval,'PENDING');
 assert.equal(state.recruitment.E2.mode,'COMING_SOON');
});
test('B04 legacy in-place read migrates missing optional notes without resetting applications',()=>{
 const {ctx,state,id}=setup();delete state.b04;
 state.revision=1;
 state.requests=[{id:'REQ-SIM-PROFILELEGACY001',fingerprint:JSON.stringify(['START',{experiment:'E1'}])}];
 const serialized=JSON.stringify(state);
 ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k==='STUDY1_UNIFIED_FIXTURE_V1'?serialized:null})};
 const loaded=ctx.study1UnifiedRead_();
 assert.equal(loaded.applications.length,1);
 assert.equal(loaded.applications[0].id,id);
 assert.equal(loaded.revision,1);
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.b04)),{notes:{},history:[]});
 assert.equal(state.b04,undefined,'read does not write or modify existing source');
});
