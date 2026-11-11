'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../gas/Study1FormalBooking.js'),'utf8');
const ownerUi=fs.readFileSync(path.join(__dirname,'../gas/Study1Team.html'),'utf8');
function setup(){
 let owner=true,locked=false,reads=0,writes=0,invalid=false;
 const now=Date.now(),iso=n=>new Date(now+n).toISOString();
 const entry=(id,resId,appId,slotId)=>({
  id,channel:'FORMAL_E1',experiment:'E1',state:'CONFIRMED',
  researcherPresigned:true,signedPdf:{sha:'a'.repeat(64)},
  binding:{experiment:'E1',reservationId:resId,applicantId:appId,slotId}
 });
 const registry={schemaVersion:1,revision:12,records:[
  entry('CONSENT_01','R_01','APP_01','SLOT_01'),
  entry('CONSENT_02','R_02','APP_02','SLOT_02'),
  entry('CONSENT_03','R_03','APP_03','SLOT_03'),
  entry('CONSENT_04','R_04','APP_04','SLOT_04'),
  entry('CONSENT_05','R_05','APP_05','SLOT_05'),
  entry('CONSENT_06','R_06','APP_06','SLOT_06'),
  entry('CONSENT_07','R_07','APP_07','SLOT_07')]};
 const row=(id,app,slot,status,expiry,confirmed='',cancelled='')=>
  [id,app,slot,status,expiry,'key',iso(-3600000),confirmed,cancelled,iso(-120000)];
 const rows=[
  row('R_01','APP_01','SLOT_01','CONFIRMED',iso(-300000),iso(-200000)),
  row('R_02','APP_02','SLOT_02','HELD',iso(300000)),
  row('R_03','APP_03','SLOT_03','HELD',iso(-300000)),
  row('R_04','APP_04','SLOT_04','CANCELLED',iso(-300000),'',iso(-200000)),
  row('R_05','WRONG_APP','SLOT_05','CONFIRMED',iso(-300000),iso(-200000)),
  row('R_06','APP_06','SLOT_06','CONFIRMED',iso(-300000),''),
  row('R_07','APP_07','SLOT_07','CONFIRMED',iso(-300000),iso(-200000))
 ];
 const scope=vm.createContext({
  LockService:{getScriptLock:()=>({
   tryLock:()=>{locked=true;return true;},
   hasLock:()=>locked,releaseLock:()=>{locked=false;}
  })},
  study1AdminOwnerRequired_:()=>{if(!owner)throw Error('OWNER_REQUIRED');},
  study1BindingUtc_:x=>Date.parse(x),
  Date,Array,Object,Map,JSON,String,Number,Error
 });
 vm.runInContext(source,scope);
 scope.study1EConsentRegistry_=()=>registry;
 scope.study1FormalSnapshot_=()=>{reads++;return {reservations:{rows}};};
 scope.study1FormalValidateSnapshot_=()=>{
  if(invalid)throw Error('ORIGINAL_SOURCE_INVALID');
  return true;
 };
 return {scope,registry,rows,reads:()=>reads,writes:()=>writes,
  setOwner:x=>{owner=x;},setInvalid:x=>{invalid=x;},
  setBooking:(id,value)=>{let r=rows.find(x=>x[0]===id);r[3]=value;}
 };
}
test('OWNER audit checks original reservation status and never promotes a HELD booking',()=>{
 const h=setup(),result=h.scope.study1OwnerE1ConsentBookingAudit();
 assert.equal(result.readOnly,true);
 assert.equal(result.source,'ORIGINAL_RESERVATIONS');
 assert.equal(result.consentRevision,12);
 assert.deepEqual(JSON.parse(JSON.stringify(result.records.map(x=>x.bookingStatus))),
  ['CONFIRMED','HELD','EXPIRED','CANCELLED','UNKNOWN','UNKNOWN','CONFIRMED']);
 assert.equal(result.records[0].bookingConfirmed,true);
 for(const x of result.records.slice(1,6))assert.equal(x.bookingConfirmed,false);
 assert.equal(h.reads(),1);assert.equal(h.writes(),0);
});
test('OWNER authentication occurs before any original Sheet or consent index read',()=>{
 const h=setup();h.setOwner(false);
 assert.throws(()=>h.scope.study1OwnerE1ConsentBookingAudit(),/OWNER_REQUIRED/);
 assert.equal(h.reads(),0);assert.equal(h.writes(),0);
});
test('source errors, duplicate IDs and unlocked state reject confirmation',()=>{
 const h=setup();h.setInvalid(true);
 assert.throws(()=>h.scope.study1OwnerE1ConsentBookingAudit(),/ORIGINAL_SOURCE_INVALID/);
 h.setInvalid(false);h.rows.push([...h.rows[0]]);
 const result=h.scope.study1OwnerE1ConsentBookingAudit();
 assert.equal(result.records[0].bookingStatus,'UNKNOWN');
 assert.equal(result.records[0].bookingConfirmed,false);
 assert.equal(h.writes(),0);
});
test('audit excludes E2 and nonformal historical records and never creates a booking',()=>{
 const h=setup();
 h.registry.records.push({id:'E2_DUMMY',channel:'FORMAL_E2',experiment:'E2'});
 h.registry.records.push({id:'OLD_E1',experiment:'E1'});
 const result=h.scope.study1OwnerE1ConsentBookingAudit();
 assert.equal(result.records.length,7);
 assert.equal(h.writes(),0);
});
test('owner UI must show booking as independently unverified until audit returns a matching revision',()=>{
 assert.match(ownerUi,/id="eConsentBookingAudit"/);
 assert.match(ownerUi,/study1OwnerE1ConsentBookingAudit\(\)/);
 assert.match(ownerUi,/source!=='ORIGINAL_RESERVATIONS'/);
 assert.match(ownerUi,/bookingStatus==='CONFIRMED'/);
 assert.match(ownerUi,/預約尚未獨立核對/);
 assert.match(ownerUi,/id="eConsentLegacyStaffControls" hidden/);
});
