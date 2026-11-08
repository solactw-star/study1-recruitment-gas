/* Study1 P0 intake domain. CLOSED, unconnected integration candidate.
 * No GAS global endpoints, no storage keys, no consent, no notifications.
 * The caller MUST provide a trusted server-side transaction adapter; no
 * client-provided "open" flag can authorize a write.
 */
(function(root){
'use strict';
const STATUSES=Object.freeze(['SUBMITTED','CANCELLED']);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function string(v,max){return typeof v==='string'&&v.trim()&&v.trim().length<=max&&v===v.trim()&&!/[<>\u0000-\u001f]/.test(v);}
function copy(v){return JSON.parse(JSON.stringify(v));}
function validateState(s){
 if(!s||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.slots)||!Array.isArray(s.applications)||!Array.isArray(s.receipts))fail('INVALID_STATE');
 const ids=new Set();
 for(const slot of s.slots){
  if(!slot||!string(slot.id,80)||ids.has(slot.id)||!Number.isSafeInteger(slot.capacity)||slot.capacity<0||typeof slot.enabled!=='boolean')fail('INVALID_SLOT');
  ids.add(slot.id);
 }
 const apps=new Set(),active=new Set();
 for(const a of s.applications){
  if(!a||!string(a.id,80)||apps.has(a.id)||!ids.has(a.slotId)||!string(a.subjectKey,128)||!STATUSES.includes(a.status))fail('INVALID_APPLICATION');
  apps.add(a.id);
  if(a.status==='SUBMITTED'){
   if(active.has(a.subjectKey))fail('DUPLICATE_SUBJECT');active.add(a.subjectKey);
  }
 }
 for(const slot of s.slots)if(s.applications.filter(a=>a.slotId===slot.id&&a.status==='SUBMITTED').length>slot.capacity)fail('OVER_CAPACITY');
 const requests=new Set();
 for(const r of s.receipts){
  if(!r||!string(r.requestId,128)||requests.has(r.requestId)||!string(r.fingerprint,256)||!r.result)fail('INVALID_RECEIPT');
  requests.add(r.requestId);
 }
 return s;
}
function normalizedCommand(c){
 if(!c||!['SUBMIT','CANCEL'].includes(c.action)||!string(c.requestId,128)||!string(c.subjectKey,128))fail('INVALID_COMMAND');
 if(c.action==='SUBMIT'&&(!string(c.slotId,80)||!string(c.applicationId,80)))fail('INVALID_COMMAND');
 if(c.action==='CANCEL'&&!string(c.applicationId,80))fail('INVALID_COMMAND');
 return {action:c.action,requestId:c.requestId,subjectKey:c.subjectKey,applicationId:c.applicationId,slotId:c.action==='SUBMIT'?c.slotId:null};
}
function fingerprint(c){return JSON.stringify([c.action,c.subjectKey,c.applicationId,c.slotId]);}
/* A pure transition. The adapter's single atomic transaction must load the
 * latest state, run this function, and CAS commit exactly one revision.
 * No success is reported if the commit is unknown or the readback differs.
 */
function transition(state,command,gate){
 const c=normalizedCommand(command);
 const s=copy(validateState(copy(state)));
 // Replays are authorization-sensitive: a closed gate must not return a prior
 // successful intake receipt, even when the requestId matches exactly.
 if(!gate||gate.open!==true||gate.consentReady!==true||gate.identityAuthorized!==true||gate.policyApproved!==true||gate.storageApproved!==true)fail('INTAKE_CLOSED');
 const fp=fingerprint(c),old=s.receipts.find(r=>r.requestId===c.requestId);
 if(old){if(old.fingerprint!==fp)fail('REQUEST_ID_CONFLICT');return {state:s,result:copy(old.result),changed:false};}
 let result;
 if(c.action==='SUBMIT'){
  const slot=s.slots.find(x=>x.id===c.slotId);
  if(!slot||!slot.enabled)fail('SLOT_UNAVAILABLE');
  if(s.applications.some(a=>a.id===c.applicationId))fail('APPLICATION_ID_CONFLICT');
  if(s.applications.some(a=>a.subjectKey===c.subjectKey&&a.status==='SUBMITTED'))fail('ALREADY_REGISTERED');
  const used=s.applications.filter(a=>a.slotId===slot.id&&a.status==='SUBMITTED').length;
  if(used>=slot.capacity)fail('SLOT_FULL');
  s.applications.push({id:c.applicationId,subjectKey:c.subjectKey,slotId:slot.id,status:'SUBMITTED'});
  result={applicationId:c.applicationId,status:'SUBMITTED',slotId:slot.id};
 }else{
  const a=s.applications.find(x=>x.id===c.applicationId);
  if(!a||a.subjectKey!==c.subjectKey)fail('APPLICATION_NOT_FOUND');
  if(a.status!=='SUBMITTED')fail('NOT_ACTIVE');
  a.status='CANCELLED';result={applicationId:a.id,status:'CANCELLED',slotId:a.slotId};
 }
 s.revision++;
 s.receipts.push({requestId:c.requestId,fingerprint:fp,result:copy(result)});
 validateState(s);
 return {state:s,result,changed:true};
}
function publicSlots(state){
 const s=validateState(copy(state));
 return s.slots.filter(x=>x.enabled).map(x=>({id:x.id,available:x.capacity-s.applications.filter(a=>a.slotId===x.id&&a.status==='SUBMITTED').length}));
}
const api=Object.freeze({transition,validateState,publicSlots});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.Study1IntakeCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
