'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {transition,validateState,publicSlots}=require('../gas/Study1IntakeCore.js');
const base=()=>({revision:0,slots:[{id:'S1',capacity:1,enabled:true},{id:'S2',capacity:2,enabled:false}],applications:[],receipts:[]});
const gate={open:true,consentReady:true,identityAuthorized:true,policyApproved:true,storageApproved:true};
const submit=(requestId='R1',subjectKey='HASH-A',applicationId='A1',slotId='S1')=>({action:'SUBMIT',requestId,subjectKey,applicationId,slotId});
test('default closed and every approval gate fails without mutation',()=>{
 for(const key of Object.keys(gate)){
  const s=base(),snapshot=JSON.stringify(s);
  assert.throws(()=>transition(s,submit(),{...gate,[key]:false}),{code:'INTAKE_CLOSED'});
  assert.equal(JSON.stringify(s),snapshot);
 }
 assert.throws(()=>transition(base(),submit()),{code:'INTAKE_CLOSED'});
});
test('submit, reload, deduplicate, cancel, and reopen capacity',()=>{
 const a=transition(base(),submit(),gate);
 assert.equal(a.state.revision,1);
 assert.deepEqual(publicSlots(a.state),[{id:'S1',available:0}]);
 const replay=transition(JSON.parse(JSON.stringify(a.state)),submit(),gate);
 assert.equal(replay.changed,false);assert.equal(replay.state.revision,1);
 assert.throws(()=>transition(a.state,submit('R2','HASH-B','A2'),gate),{code:'SLOT_FULL'});
 assert.throws(()=>transition(a.state,submit('R3','HASH-A','A3'),gate),{code:'ALREADY_REGISTERED'});
 assert.throws(()=>transition(a.state,submit('R1','HASH-B','A2'),gate),{code:'REQUEST_ID_CONFLICT'});
 const b=transition(a.state,{action:'CANCEL',requestId:'R4',subjectKey:'HASH-A',applicationId:'A1'},gate);
 assert.equal(b.state.revision,2);assert.equal(publicSlots(b.state)[0].available,1);
 assert.throws(()=>transition(b.state,{action:'CANCEL',requestId:'R5',subjectKey:'HASH-A',applicationId:'A1'},gate),{code:'NOT_ACTIVE'});
 assert.equal(transition(b.state,submit('R6','HASH-B','A2'),gate).state.revision,3);
});
test('disabled slot, ownership, malformed commands and corrupt snapshots fail closed',()=>{
 assert.throws(()=>transition(base(),submit('R','H','A','S2'),gate),{code:'SLOT_UNAVAILABLE'});
 assert.throws(()=>transition(base(),{...submit(),subjectKey:'<script>'},gate),{code:'INVALID_COMMAND'});
 const a=transition(base(),submit(),gate);
 assert.throws(()=>transition(a.state,{action:'CANCEL',requestId:'R2',subjectKey:'OTHER',applicationId:'A1'},gate),{code:'APPLICATION_NOT_FOUND'});
 const corrupt=JSON.parse(JSON.stringify(a.state));corrupt.slots[0].capacity=0;
 assert.throws(()=>validateState(corrupt),{code:'OVER_CAPACITY'});
 const bad=base();bad.slots.push({...bad.slots[0]});
 assert.throws(()=>validateState(bad),{code:'INVALID_SLOT'});
});
test('state copies cannot mutate caller data and receipts do not leak into public slots',()=>{
 const s=base(),before=JSON.stringify(s);
 const a=transition(s,submit(),gate);
 assert.equal(JSON.stringify(s),before);
 assert.equal(publicSlots(a.state)[0].available,0);
 assert.equal('subjectKey' in publicSlots(a.state)[0],false);
});

test('previous successful request cannot be replayed after any intake gate closes',()=>{
 const committed=transition(base(),submit(),gate);
 for(const key of Object.keys(gate)){
  const snapshot=JSON.stringify(committed.state);
  assert.throws(()=>transition(committed.state,submit(),{...gate,[key]:false}),{code:'INTAKE_CLOSED'});
  assert.equal(JSON.stringify(committed.state),snapshot);
 }
 assert.throws(()=>transition(committed.state,submit()),{code:'INTAKE_CLOSED'});
 const replay=transition(committed.state,submit(),gate);
 assert.equal(replay.changed,false);
 assert.equal(replay.state.revision,1);
});
