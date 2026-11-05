'use strict';
/** Regression for B02 owner UAT: TEST fixture filled ScriptProperties before editing,
 * participant progress or cancellation could save. Never reset existing SIM data. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const source=['OtpCore.js','BookingCore.js','OtpThrottle.js','OtpTransaction.js',
 'BookingHoldTransaction.js','Study1FixtureAdapter.js','AdminSandbox.js','Study1Unified.js']
 .map(name=>fs.readFileSync(path.join(__dirname,'../gas',name),'utf8')).join('\n');
function makeBlob(x){
 const data=typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x.map(n=>n&255));
 return {getBytes:()=>[...data].map(n=>n>127?n-256:n),
  getDataAsString:()=>data.toString('utf8')};
}
function mockUtilities(){
 return {
  Charset:{UTF_8:'UTF-8'}, DigestAlgorithm:{SHA_256:'SHA_256'},
  newBlob:(bytes)=>makeBlob(bytes),
  gzip:b=>makeBlob([...zlib.gzipSync(Buffer.from(b.getBytes().map(n=>n&255)))]),
  ungzip:b=>makeBlob([...zlib.gunzipSync(Buffer.from(b.getBytes().map(n=>n&255)))]),
  base64Encode:bytes=>Buffer.from(bytes.map(n=>n&255)).toString('base64'),
  base64Decode:input=>[...Buffer.from(input,'base64')].map(n=>n>127?n-256:n),
  computeDigest:(algorithm,bytes)=>{
   assert.equal(algorithm,'SHA_256');
   return [...crypto.createHash('sha256').update(Buffer.from(bytes.map(n=>n&255))).digest()]
    .map(n=>n>127?n-256:n);
  }
 };
}
function setup(){
 const properties=new Map([['OPEN','false'],['CONSENT_READY','false']]);
 let writes=0;let locked=false;
 const api={
  getProperty:k=>properties.has(k)?properties.get(k):null,
  setProperty:(k,v)=>{
   assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');
   assert.ok(Buffer.byteLength(v,'utf8')<=9000,'GAS ScriptProperties 9 KB single-value limit');
   properties.set(k,v);writes++;
  },
  deleteProperty:k=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');properties.delete(k);}
 };
 const lock={tryLock:()=>{assert.equal(locked,false);locked=true;return true},
  releaseLock:()=>{assert.equal(locked,true);locked=false;}};
 const ctx=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),
   getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})},
  PropertiesService:{getScriptProperties:()=>api},
  LockService:{getScriptLock:()=>lock},
  study1AdminOwnerRequired_:()=>{},
  study1SandboxBookingFlags_:()=>{
   if(properties.get('OPEN')!=='false'||properties.get('CONSENT_READY')!=='false')
    throw Error('招募及電子同意未關閉');
  },
  Utilities:mockUtilities(), Date,Math,JSON,Array,Object,String,Number,Set,Map,Error
 });
 vm.runInContext(source,ctx,{timeout:2500});
 let n=0;
 const read=()=>JSON.parse(JSON.stringify(ctx.study1UnifiedPreviewGet()));
 const cmd=(action,payload,rev,id)=>JSON.parse(JSON.stringify(ctx.study1UnifiedPreviewCommand({
  action,payload,expectedRevision:rev??read().revision,
  requestId:id||'REQ-SIM-CAPACITY'+String(++n).padStart(8,'0')
 })));
 return {ctx,properties,read,cmd,get writes(){return writes},get locked(){return locked}};
}
const slot={operation:'UPDATE',slotId:'SIM-SLOT-E1-A',experiment:'E1',
 title:'B02虛構場次修改驗收',when:'2027-01-05 10:00',
 capacity:3,minutes:120,place:'虛構研究室',
 repeatCount:1,scope:'ONE'};
function seedExistingLegacyFixture(env){
 const state=JSON.parse(JSON.stringify(env.ctx.study1UnifiedInitial_()));
 state.applications.push({id:'SIM-001',experiment:'E1',phase:'CONFIRMED',eligible:true,
  otpAttempts:0,otpRequestedAt:null,otpHistory:[],slotId:'SIM-SLOT-E1-A',
  holdUntil:null,consentVersion:null,consentSha256:null,consentReviewedAt:null,
  consentReviewedVersion:null,consentReviewedSha256:null,
  pdfDemoReviewedAt:null,pdfDemoSha256:null,signatureDemo:false});
 for(let i=0;i<30&&Buffer.byteLength(JSON.stringify(state),'utf8')<7650;i++){
  state.requests.push({id:'REQ-SIM-LEGACY'+String(i).padStart(8,'0'),
   fingerprint:JSON.stringify(['ADMIN_EDIT',{title:'SIM-LEGACY-'+String(i)+'X'.repeat(135)}])});
  state.revision=state.requests.length;
 }
 const raw=JSON.stringify(state);
 assert.ok(Buffer.byteLength(raw,'utf8')>6900,'must reproduce a nearly full existing TEST fixture');
 assert.ok(Buffer.byteLength(raw,'utf8')<7900,'existing uncompressed fixture fits the previous key');
 env.properties.set('STUDY1_UNIFIED_FIXTURE_V1',raw);
 return state;
}
test('B02 UAT reported issue: edit → attendance → cancel succeeds near original property boundary, no reset',()=>{
 const s=setup(),seed=seedExistingLegacyFixture(s);
 const priorIds=seed.requests.map(x=>x.id);
 const existing=s.read();
 assert.equal(existing.revision,seed.revision);
 const edited=s.cmd('ADMIN_B02_SLOT',slot);
 assert.equal(edited.slots.find(x=>x.id===slot.slotId).capacity,3);
 const attended=s.cmd('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',
  progress:'PARTIAL',note:'虛構驗收資料'},undefined,'REQ-SIM-CAPACITY_ATTEND_0001');
 assert.equal(attended.b02.attendance['SIM-001'].attendance,'PRESENT');
 assert.equal(attended.b02.attendance['SIM-001'].progress,'PARTIAL');
 const canceled=s.cmd('ADMIN_B02_SLOT',{...slot,operation:'CANCEL'},undefined,
  'REQ-SIM-CAPACITY_CANCEL_0001');
 assert.equal(canceled.b02.sessions[slot.slotId].status,'CANCELLED');
 assert.equal(canceled.applications[0].slotId,slot.slotId);
 assert.equal(canceled.b02.history.at(-1).action,'CANCEL');
 const saved=s.properties.get('STUDY1_UNIFIED_FIXTURE_V1');
 assert.ok(saved.startsWith('GZIP1:'),'large state must be transparently compressed');
 assert.ok(Buffer.byteLength(saved,'utf8')<7900);
 assert.deepEqual(s.read().audit.slice(0,15).map(a=>a.action).includes('ADMIN_EDIT'),true);
 const stored=JSON.parse(s.ctx.study1UnifiedStoredDecode_(saved));
 assert.deepEqual(stored.requests.slice(0,priorIds.length).map(x=>x.id),priorIds);
 assert.equal(stored.revision,seed.revision+3);
 assert.equal(stored.b02.attendance['SIM-001'].note,'虛構驗收資料');
 assert.equal(s.properties.size,3,'no new property key or data partition');
 assert.equal(s.properties.get('OPEN'),'false');
 assert.equal(s.properties.get('CONSENT_READY'),'false');
 assert.equal(s.locked,false);
 const writes=s.writes;
 const duplicate=s.cmd('ADMIN_B02_SLOT',{...slot,operation:'CANCEL'},seed.revision+2,
   'REQ-SIM-CAPACITY_CANCEL_0001');
 assert.equal(duplicate.deduplicated,true);
 assert.equal(s.writes,writes);
});
test('new compact TEST state keeps plain JSON compatible, refuses bad gzip and refuses incompressible oversize writes',()=>{
 const s=setup();
 const before=s.ctx.study1UnifiedInitial_();
 const plain=JSON.stringify(before);
 assert.equal(s.ctx.study1UnifiedStoredEncode_(plain),plain);
 assert.deepEqual(JSON.parse(s.ctx.study1UnifiedStoredDecode_(plain)),JSON.parse(plain));
 const noisy=crypto.randomBytes(7500).toString('hex');
 assert.throws(()=>s.ctx.study1UnifiedStoredEncode_(noisy),/壓縮後仍超出安全容量/);
 assert.equal(s.properties.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
 s.properties.set('STUDY1_UNIFIED_FIXTURE_V1','GZIP1:invalid+payload');
 assert.throws(()=>s.read());
 assert.equal(s.writes,0,'failure does not overwrite or delete storage');
});
