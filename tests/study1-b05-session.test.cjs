'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const backend=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.js'),'utf8');
const team=fs.readFileSync(path.join(__dirname,'../gas/Study1Team.html'),'utf8');
function setup(){
 const ctx=vm.createContext({Date,Math,JSON,Object,Array,String,Number,Set,Map,Error});
 vm.runInContext(backend,ctx,{timeout:1500});
 const state=ctx.study1UnifiedInitial_();
 return {ctx,state,slot:state.slots[0]};
}
const close=(ctx,s,slotId,action,reason='研究人員確認完成',handoff='')=>
 ctx.study1UnifiedTransition_(s,{action:'ADMIN_B05_CLOSURE',
  payload:{action,slotId,reason,handoff}},Date.parse('2027-01-06T07:00:00Z'),null);
test('B05 closure needs manual reason and unresolved handoff; it never implies study completion',()=>{
 const {ctx,state,slot}=setup();
 ctx.study1UnifiedTransition_(state,{action:'START',payload:{experiment:'E1'}},Date.now(),null);
 state.applications[0].slotId=slot.id;
 assert.throws(()=>close(ctx,state,slot.id,'CLOSE'),/後續交接/);
 assert.equal(state.b02.sessions[slot.id],undefined,'rejected action cannot mutate existing slot');
 close(ctx,state,slot.id,'CLOSE','本次行政已交接','待補出席並完成施測紀錄');
 assert.equal(state.b02.sessions[slot.id].status,'CLOSED');
 assert.equal(state.b05.closures[slot.id].issues,1);
 assert.equal(state.b05.closures[slot.id].handoff,'待補出席並完成施測紀錄');
 assert.equal(state.b05.history.length,1);
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B02_ATTEND',
  payload:{id:state.applications[0].id,attendance:'PRESENT',progress:'COMPLETE',note:''}},
  Date.parse('2027-01-06T08:00:00Z'),null),/已行政結案/);
 assert.equal(state.b05.history[0].before,'OPEN');
 assert.equal(state.b05.history[0].after,'CLOSED');
 assert.equal(state.b05.history[0].actor,'OWNER');
 assert.equal(state.b02.history.at(-1).action,'ADMIN_CLOSE');
 assert.equal(state.applications[0].phase,'STARTED','no implicit research completion');
 assert.equal(state.policy.consent.E1.approval,'PENDING');
 assert.equal(state.policy.consent.E2.approval,'PENDING');
 assert.throws(()=>close(ctx,state,slot.id,'CLOSE','不重複確認','已交接'),/已結案/);
 close(ctx,state,slot.id,'REOPEN','研究人員重新核對','補正原行政結案說明');
 assert.equal(state.b02.sessions[slot.id].status,'OPEN');
 assert.equal(state.b05.closures[slot.id],undefined);
 assert.deepEqual(Array.from(state.b05.history,x=>x.action),['CLOSE','REOPEN']);
 assert.equal(state.b05.history[1].before,'CLOSED');
 assert.equal(state.b02.history.at(-1).action,'ADMIN_REOPEN');
 assert.equal(state.recruitment.E2.mode,'COMING_SOON');
});
test('B05 refuses premature closure, cancelled sessions and invalid human reasons',()=>{
 const {ctx,state,slot}=setup();
 assert.throws(()=>ctx.study1UnifiedTransition_(state,{action:'ADMIN_B05_CLOSURE',
  payload:{action:'CLOSE',slotId:slot.id,reason:'已確認行政作業',handoff:''}},
  Date.parse('2026-11-05T09:00:00Z'),null),/尚未開始/);
 assert.throws(()=>close(ctx,state,slot.id,'CLOSE','短',''),/至少四字/);
 assert.throws(()=>close(ctx,state,slot.id,'CLOSE','含<script>危險',''),/至少四字/);
 state.b02.sessions[slot.id]={title:'研究場次',place:'',minutes:120,group:'',status:'CANCELLED'};
 assert.throws(()=>close(ctx,state,slot.id,'CLOSE','取消後不可結案',''),/已取消/);
 assert.equal(state.b05.history.length,0);
});
test('B05 non-writing migration preserves old B02/B04 data and unchanged recruitment flags',()=>{
 const {ctx,state,slot}=setup();
 ctx.study1UnifiedTransition_(state,{action:'START',payload:{experiment:'E1'}},Date.now(),null);
 const id=state.applications[0].id;
 const original=JSON.stringify(state);
 delete state.b05;
 state.revision=1;state.requests=[{id:'REQ-SIM-LEGACY00001',fingerprint:JSON.stringify(['START',{experiment:'E1'}])}];
 const serialized=JSON.stringify(state);
 ctx.PropertiesService={getScriptProperties:()=>({getProperty:key=>key==='STUDY1_UNIFIED_FIXTURE_V1'?serialized:null})};
 const loaded=ctx.study1UnifiedRead_();
 assert.equal(loaded.applications[0].id,id);
 assert.equal(loaded.slots[0].id,slot.id);
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.b05)),{closures:{},history:[]});
 assert.equal(state.b05,undefined,'migration is read-only, no synthetic writes');
 assert.equal(loaded.policy.consent.E1.approval,'PENDING');
 assert.equal(loaded.policy.consent.E2.approval,'PENDING');
 assert.match(original,/"b05":/);
});
test('B05 original team page has reachable session execution, status controls and safe REC placeholder',()=>{
 assert.match(team,/id="b05Module"/);
 for(const id of ['b05Back','b05Heading','b05Summary','b05Participants',
  'b05Checks','b05Reason','b05Handoff','b05Close','b05Reopen','b05History'])
  assert.match(team,new RegExp('id="'+id+'"'));
 assert.match(team,/b05Open\(slot\.id,'calendar'\)/);
 assert.match(team,/b05Open\(slot\.id,'profile'\)/);
 assert.match(team,/b05Send\('ADMIN_B02_ATTEND'/);
 assert.match(team,/b05Send\('ADMIN_B05_CLOSURE'/);
 assert.match(team,/不自動建立待辦/);
 assert.doesNotMatch(team,/\.innerHTML\s*=|<iframe|<script[^>]+src=|\blocalStorage\b|\bfetch\s*\(/i);
 const script=[...team.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(script.length,1);
 assert.doesNotThrow(()=>new vm.Script(script[0][1]));
});
