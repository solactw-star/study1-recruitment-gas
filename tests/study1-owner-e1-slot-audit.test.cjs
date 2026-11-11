'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../gas/Study1WizardP0Bridge.js'),'utf8');
const OPS='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
function setup(){
 const props=new Map(),secret='real-provisioned-random-secret-0123456789abcdefgh';
 props.set('STUDY1_ECONSENT_BINDING_HMAC_KEY',secret);
 const rows=[
  ['SLOT_E1_REVIEW_001','2027-03-01T02:00:00.000Z','2027-03-01T04:00:00.000Z',2,'R101','OPEN','OWNER',''],
  ['SLOT_E2_REVIEW_002','2027-03-02T02:00:00.000Z','2027-03-02T04:00:00.000Z',2,'R102','OPEN','OWNER','']];
 let owner=true,hasLock=false,reads=0,writeCount=0,slotsOnly=true,sourceChanged=false;
 const hmac=items=>crypto.createHmac('sha256',secret).update(JSON.stringify(items)).digest('hex');
 const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null})},
  study1AdminOwnerRequired_:()=>{if(!owner)throw Error('OWNER_REQUIRED');},
  LockService:{getScriptLock:()=>({tryLock:()=>{hasLock=true;return true;},
    hasLock:()=>hasLock,releaseLock:()=>{hasLock=false;}})},
  SpreadsheetApp:{openById:id=>{
   if(id!==OPS)throw Error('WRONG_WORKBOOK');
   return {getId:()=>OPS};
  }},
  study1BindingSheetId_:kind=>kind==='slots'?OPS:'ILLEGAL',
  BOOKING_SLOT_HEADERS_:['slot_id','start_at_utc','end_at_utc','capacity',
   'location_code','status','created_by','updated_at_utc'],
  bookingReadOnlyTab_:(_book,name)=>{
   reads++;
   if(name!=='Slots')slotsOnly=false;
   const cloned=rows.map(r=>r.slice());
   if(sourceChanged&&reads%2===0)cloned[0][3]=99;
   return {headers:ctx.BOOKING_SLOT_HEADERS_.slice(),rows:cloned};
  },
  bookingReadOnlySameTab_:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  study1BindingId_:id=>{if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw Error('BAD_ID');return id;},
  study1BindingHmac_:hmac,
  study1BindingUtc_:value=>{
   const t=Date.parse(value);if(!Number.isFinite(t))throw Error('BAD_UTC');
   return t;
  },
 };
 vm.runInNewContext(source,ctx);
 const approve=(entries)=>{
  const raw=JSON.stringify(entries.map(x=>({experiment:x.experiment,slotId:x.slotId,
   slotRowSha256:hmac(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...rows.find(r=>r[0]===x.slotId)])})));
  props.set('STUDY1_E1_SLOT_REGISTRY_V1',raw);
  props.set('STUDY1_E1_SLOT_REGISTRY_HMAC',hmac(['STUDY1_E1_SLOT_REGISTRY_V1',raw]));
  props.set('STUDY1_E1_SLOT_REGISTRY_APPROVED','true');
 };
 return {ctx,props,rows,approve,secret,
  setOwner:v=>{owner=v;},setChanged:v=>{sourceChanged=v;},
  getAudit:()=>({reads,slotsOnly,hasLock,writeCount})};
}
test('OWNER preflight reads only original Slots twice; no registry never implies E1',()=>{
 const h=setup();
 const result=h.ctx.study1OwnerE1SlotAudit();
 assert.equal(result.mode,'OWNER_ONLY_READ_ONLY');
 assert.equal(result.mappingVerified,false);
 assert.equal(result.formalReady,false);
 assert.equal(result.rows.length,2);
 assert.ok(result.rows.every(x=>x.registryExperiment==='UNCLASSIFIED'&&x.pinStatus==='NOT_REVIEWED'));
 assert.deepEqual(h.getAudit(),{reads:2,slotsOnly:true,hasLock:false,writeCount:0});
});
test('OWNER identity is mandatory before any original Sheet read',()=>{
 const h=setup();h.setOwner(false);
 assert.throws(()=>h.ctx.study1OwnerE1SlotAudit(),/OWNER_REQUIRED/);
 assert.equal(h.getAudit().reads,0);
});
test('pre-provisioned authentic PI E1 pin is read back, never equated with formal readiness',()=>{
 const h=setup();
 h.approve([{experiment:'E1',slotId:h.rows[0][0]},{experiment:'E2',slotId:h.rows[1][0]}]);
 const out=h.ctx.study1OwnerE1SlotAudit();
 assert.equal(out.mappingVerified,true);
 assert.equal(out.formalReady,false);
 assert.equal(out.recRemoteConsentScopeVerified,false);
 assert.equal(out.matchedE1Count,1);
 assert.equal(out.rows[1].registryExperiment,'E2');
 assert.equal(out.rows[0].pinnedRowMatches,true);
 assert.equal(h.getAudit().writeCount,0);
});
test('a changed original slot row invalidates the approved registry without changing it',()=>{
 const h=setup();h.approve([{experiment:'E1',slotId:h.rows[0][0]}]);
 h.rows[0][3]=4;
 const out=h.ctx.study1OwnerE1SlotAudit();
 assert.equal(out.mappingVerified,false);
 assert.equal(out.rows[0].pinStatus,'STALE');
});
test('invalid registry HMAC always fails closed',()=>{
 const h=setup();h.approve([{experiment:'E1',slotId:h.rows[0][0]}]);
 h.props.set('STUDY1_E1_SLOT_REGISTRY_HMAC','0'.repeat(64));
 assert.throws(()=>h.ctx.study1OwnerE1SlotAudit(),/E1_AUDIT_REGISTRY_TAMPERED/);
});
test('a missing original pinned slot stops registry verification',()=>{
 const h=setup();h.approve([{experiment:'E1',slotId:h.rows[0][0]}]);
 h.rows.shift();
 const out=h.ctx.study1OwnerE1SlotAudit();
 assert.equal(out.mappingVerified,false);
 assert.deepEqual(Array.from(out.missingPinnedIds),['SLOT_E1_REVIEW_001']);
});
test('concurrent original Slot mutation across read passes must not pass',()=>{
 const h=setup();h.setChanged(true);
 assert.throws(()=>h.ctx.study1OwnerE1SlotAudit(),/E1_AUDIT_SLOTS_CHANGED_DURING_READ/);
 assert.equal(h.getAudit().hasLock,false);
});

test('zero-row original Slots cannot produce any E1/E2 HMAC candidate or auto-approval',()=>{
 const h=setup();h.rows.splice(0);
 const out=h.ctx.study1OwnerE1SlotRegistryProposal({decisions:[]});
 assert.equal(out.status,'BLOCKED_NO_OFFICIAL_SLOTS');
 assert.equal(out.sourceRows,0);assert.equal(out.registryJson,null);
 assert.equal(out.registryHmac,null);assert.equal(out.approved,false);
 assert.deepEqual(Array.from(out.proposalEntries),[]);
 assert.equal(h.getAudit().writeCount,0);
 assert.throws(()=>h.ctx.study1OwnerE1SlotRegistryProposal({
  decisions:[{slotId:'SLOT_FABRICATED_0001',experiment:'E1'}]}),
 /SLOT_PROPOSAL_NO_ORIGINAL_ROWS/);
});
test('explicit PI-review CANDIDATES hash exact original rows but never activate them',()=>{
 const h=setup(),before=JSON.stringify([...h.props]);
 const out=h.ctx.study1OwnerE1SlotRegistryProposal({decisions:[
  {slotId:h.rows[0][0],experiment:'E1'},{slotId:h.rows[1][0],experiment:'E2'}]});
 assert.equal(out.status,'PI_REVIEW_CANDIDATE_ONLY');
 assert.equal(out.approved,false);assert.equal(out.scriptPropertiesChanged,false);
 assert.equal(JSON.stringify([...h.props]),before);
 assert.equal(out.proposalEntries.length,2);
 const parsed=JSON.parse(out.registryJson);
 assert.equal(parsed[0].experiment,'E1');assert.equal(parsed[1].experiment,'E2');
 assert.match(out.registryHmac,/^[a-f0-9]{64}$/);
 assert.equal(h.getAudit().reads,2);
 assert.equal(h.getAudit().slotsOnly,true);
 assert.equal(h.getAudit().writeCount,0);
});
test('proposal refuses forged/duplicated slot decisions, tampered source and nonowner',()=>{
 const h=setup();
 assert.throws(()=>h.ctx.study1OwnerE1SlotRegistryProposal({
  decisions:[{slotId:'SLOT_UNTRUSTED_0001',experiment:'E1'}]}),/UNMAPPED_DECISION/);
 assert.throws(()=>h.ctx.study1OwnerE1SlotRegistryProposal({
  decisions:[{slotId:h.rows[0][0],experiment:'E1'},
   {slotId:h.rows[0][0],experiment:'E2'}]}),/DUPLICATE_DECISION/);
 h.setChanged(true);
 assert.throws(()=>h.ctx.study1OwnerE1SlotRegistryProposal({
  decisions:[{slotId:h.rows[0][0],experiment:'E1'}]}),/READ_DRIFT/);
 h.setOwner(false);
 assert.throws(()=>h.ctx.study1OwnerE1SlotRegistryProposal({decisions:[]}),/OWNER_REQUIRED/);
 assert.equal(h.getAudit().writeCount,0);
});

test('public preflight requires approved real E1 rows; never uses owner-only data or writes',()=>{
 const h=setup();
 h.setOwner(false);
 assert.equal(h.ctx.study1FormalPublicSlotReady_(),false,'no owner-pinned registry');
 assert.equal(h.getAudit().reads,0,'unapproved source must not be opened');
 h.approve([{experiment:'E1',slotId:h.rows[0][0]},{experiment:'E2',slotId:h.rows[1][0]}]);
 assert.equal(h.ctx.study1FormalPublicSlotReady_(),true);
 assert.deepEqual(h.getAudit(),{reads:2,slotsOnly:true,hasLock:false,writeCount:0});
});
test('public preflight rejects E2-only, missing Slots, changed pins and inconsistent reads',()=>{
 const e2=setup();
 e2.approve([{experiment:'E2',slotId:e2.rows[0][0]}]);
 assert.equal(e2.ctx.study1FormalPublicSlotReady_(),false);
 const noRows=setup();noRows.rows.splice(0);
 noRows.approve([{experiment:'E1',slotId:'SLOT_UNRELATED_0123'}].filter(()=>false));
 // An empty sheet is not a reason to accept PII, even with a malformed registry.
 noRows.props.set('STUDY1_E1_SLOT_REGISTRY_APPROVED','true');
 assert.equal(noRows.ctx.study1FormalPublicSlotReady_(),false);
 const stale=setup();stale.approve([{experiment:'E1',slotId:stale.rows[0][0]}]);
 stale.rows[0][3]=99;
 assert.throws(()=>stale.ctx.study1FormalPublicSlotReady_(),/SLOT_REGISTRY_STALE/);
 const drift=setup();drift.approve([{experiment:'E1',slotId:drift.rows[0][0]}]);
 drift.setChanged(true);
 assert.throws(()=>drift.ctx.study1FormalPublicSlotReady_(),/E1_PREFLIGHT_SOURCE_CHANGED/);
 assert.equal(drift.getAudit().hasLock,false);
});
test('public preflight cannot use an unlocked supplied lock',()=>{
 const h=setup();h.approve([{experiment:'E1',slotId:h.rows[0][0]}]);
 assert.throws(()=>h.ctx.study1FormalPublicSlotReady_({hasLock:()=>false}),/E1_PREFLIGHT_SLOT_LOCK_LOST/);
 assert.equal(h.getAudit().reads,0);
});
