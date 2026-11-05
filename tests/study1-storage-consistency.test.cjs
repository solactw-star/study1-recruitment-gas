'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const gas=path.join(__dirname,'../gas');
const code=['OtpCore.js','BookingCore.js','OtpThrottle.js','OtpTransaction.js',
 'BookingHoldTransaction.js','Study1FixtureAdapter.js','AdminSandbox.js','Study1Unified.js']
 .map(n=>fs.readFileSync(path.join(gas,n),'utf8')).join('\n');
const shaBytes=bytes=>[...crypto.createHash('sha256')
 .update(Buffer.from(bytes.map(x=>x<0?x+256:x))).digest()]
 .map(x=>x>127?x-256:x);
function setup(){
 const store=new Map([['OPEN','false'],['CONSENT_READY','false']]);
 let writeCount=0,held=false,damageOneReadback=false,injectFault=false,
  injectForeign=false,foreignReadback=false,throwAfterWrite=false,throwBeforeWrite=false;
 const props={
  getProperty:k=>{
   if(k==='STUDY1_UNIFIED_FIXTURE_V1'&&damageOneReadback){
    damageOneReadback=false;return 'UNVERIFIED_DATA';
   }
   if(k==='STUDY1_UNIFIED_FIXTURE_V1'&&foreignReadback){
    foreignReadback=false;store.set(k,'OTHER_WRITER_BYTES');return 'OTHER_WRITER_BYTES';
   }
   return store.has(k)?store.get(k):null;
  },
  setProperty:(k,v)=>{
   assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1','unapproved property key write');
   if(throwBeforeWrite){throwBeforeWrite=false;throw Error('SIM_WRITE_BEFORE');}
   store.set(k,v);writeCount++;
   if(injectFault){injectFault=false;damageOneReadback=true;}
   if(injectForeign){injectForeign=false;foreignReadback=true;}
   if(throwAfterWrite){throwAfterWrite=false;throw Error('SIM_WRITE_AFTER');}
  },
  deleteProperty:k=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');store.delete(k);}
 };
 const ctx=vm.createContext({
  Date,Math,JSON,Array,Object,String,Number,Map,Set,Error,
  Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),
   getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})},
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>({tryLock:()=>{assert.equal(held,false);held=true;return true;},
   releaseLock:()=>{assert.equal(held,true);held=false;},hasLock:()=>held})},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF-8'},
   newBlob:s=>({getBytes:()=>[...Buffer.from(s,'utf8')].map(x=>x>127?x-256:x)}),
   computeDigest:(alg,bytes)=>{assert.equal(alg,'SHA_256');return shaBytes(bytes);},
   base64Decode:s=>[...Buffer.from(s,'base64')].map(x=>x>127?x-256:x),
   computeHmacSha256Signature:(data,secret)=>shaBytes([...Buffer.from(data+secret)])}
 });
 vm.runInContext(code,ctx,{timeout:3000});
 return {ctx,store,armFault(){injectFault=true;},
  armDrift(){injectForeign=true;},
  armThrowAfter(){throwAfterWrite=true;},
  armThrowBefore(){throwBeforeWrite=true;},
  get held(){return held},get writes(){return writeCount}};
}
test('current original site uses revision lock; a corrupted post-write readback restores prior bytes and revision',()=>{
 const x=setup(),{ctx,store}=x;
 const first=ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:0,requestId:'REQ-SIM-INTEGRITY00001'});
 assert.equal(first.revision,1);
 const oldBytes=store.get('STUDY1_UNIFIED_FIXTURE_V1'),oldWrites=x.writes;
 x.armFault();
 assert.throws(()=>ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:1,requestId:'REQ-SIM-INTEGRITY00002'}),/已回復寫入前版本/);
 assert.equal(store.get('STUDY1_UNIFIED_FIXTURE_V1'),oldBytes,'failed write rolled back to pre-commit bytes');
 const read=ctx.study1UnifiedPreviewGet();
 assert.equal(read.revision,1);assert.equal(read.applications.length,1);
 assert.equal(x.writes,oldWrites+2,'one uncertain write and one under-lock restoration');
 assert.equal(store.get('OPEN'),'false');assert.equal(store.get('CONSENT_READY'),'false');
 assert.equal(x.held,false,'global lock released after rollback');
 assert.throws(()=>ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E2'},
  expectedRevision:0,requestId:'REQ-SIM-INTEGRITY00003'}),/版本已變更/);
});
test('provider-neutral storage contract keeps monotonic revisions, idempotency and an immutable hash-only audit chain',()=>{
 const {ctx}=setup(),init=ctx.study1UnifiedStoreInitial_(),base={
  action:'UPSERT',actor:'PI',expectedRevision:0,id:'SIM-PARTICIPANT-0001',
  reason:'人工修正欄位',requestId:'REQ-SIM-STORETEST00001',
  value:{id:'SIM-PARTICIPANT-0001',source:'SYNTHETIC_ONLY',status:'PENDING'}
 };
 const first=ctx.study1UnifiedStoreApply_(init,base);
 assert.equal(init.revision,0,'pure transaction cannot mutate input');
 assert.equal(first.state.revision,1);assert.equal(first.state.audit.length,1);
 assert.equal(first.state.audit[0].actor,'PI');
 assert.equal(first.state.audit[0].reason,'人工修正欄位');
 assert.equal(first.state.audit[0].beforeHash,null);
 assert.ok(/^[0-9a-f]{64}$/.test(first.state.audit[0].afterHash));
 assert.doesNotMatch(JSON.stringify(first.state.audit),/"status":"PENDING"/,'audit must not copy record values');
 assert.equal(ctx.study1UnifiedStoreVerify_(first.state),true);
 const replay=ctx.study1UnifiedStoreApply_(first.state,base);
 assert.equal(replay.deduplicated,true);assert.equal(replay.state.revision,1);
 assert.throws(()=>ctx.study1UnifiedStoreApply_(first.state,{...base,requestId:'REQ-SIM-STORETEST00002'}),/版本衝突/);
 assert.throws(()=>ctx.study1UnifiedStoreApply_(first.state,{...base,reason:'未經同意改動'}),/不同內容/);
 const second=ctx.study1UnifiedStoreApply_(first.state,{...base,actor:'RA',expectedRevision:1,
  requestId:'REQ-SIM-STORETEST00002',reason:'更正行政進度',
  value:{id:base.id,source:'SYNTHETIC_ONLY',status:'COMPLETE'}});
 assert.equal(second.state.revision,2);
 assert.equal(second.state.audit[1].previousHash,second.state.audit[0].digest);
 assert.equal(ctx.study1UnifiedStoreVerify_(second.state),true);
 const broken=JSON.parse(JSON.stringify(second.state));
 broken.audit[0].reason='篡改稽核';
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(broken),/稽核雜湊鏈/);
 const altered=JSON.parse(JSON.stringify(second.state));
 altered.head='bad';
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(altered),/稽核事件數量/);
 const alteredRow=JSON.parse(JSON.stringify(second.state));
 alteredRow.records[base.id].status='FORGED';
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(alteredRow),/雜湊不一致/);
 assert.throws(()=>ctx.study1UnifiedStoreApply_(alteredRow,{...base,expectedRevision:2,
  requestId:'REQ-SIM-STORETEST00003'}),/雜湊不一致/);
});
test('stable snapshot pagination handles thousands of synthetic records without hard-coded 8 or 40 record limits',()=>{
 const {ctx}=setup(),state=ctx.study1UnifiedStoreInitial_();
 for(let i=0;i<1275;i++){
  const id='SIM-ROW-'+String(i).padStart(5,'0');
  state.records[id]={id,source:'SYNTHETIC_ONLY',status:'STAGED'};
 }
 let after='',count=0,pages=0,snapshotHash=null;
 do{
  const q={expectedRevision:0,limit:75,after};
  if(after)q.snapshotHash=snapshotHash;
  const page=ctx.study1UnifiedStorePage_(state,q);
  assert.ok(/^[a-f0-9]{64}$/.test(page.snapshotHash));
  if(snapshotHash)assert.equal(page.snapshotHash,snapshotHash);
  snapshotHash=page.snapshotHash;
  count+=page.items.length;pages++;after=page.nextAfter||'';
  if(!page.nextAfter)break;
 }while(pages<30);
 assert.equal(count,1275);
 assert.equal(pages,17);
 assert.throws(()=>ctx.study1UnifiedStorePage_(state,{expectedRevision:1,limit:75,after:''}),/版本/);
 assert.throws(()=>ctx.study1UnifiedStorePage_(state,{expectedRevision:0,limit:101,after:''}),/游標/);
 const gate=ctx.study1UnifiedStoreReadiness_();
 assert.equal(gate.persistent,false);
 assert.equal(gate.formalWrites,false);
 assert.equal(gate.providerConnected,false);
 assert.equal(gate.authorization,'REC_AND_DATA_APPROVAL_REQUIRED');
});
test('storage contract refuses non-synthetic records, role anomalies, tampered revision and missing reason',()=>{
 const {ctx}=setup(),s=ctx.study1UnifiedStoreInitial_();
 const good={action:'UPSERT',actor:'PI',expectedRevision:0,id:'SIM-ROW-1234',
  reason:'研究行政更正',requestId:'REQ-SIM-STORAGE00000001',
  value:{id:'SIM-ROW-1234',source:'SYNTHETIC_ONLY',status:'PENDING'}};
 for(const bad of [
  {...good,value:{...good.value,source:'REAL_DATA'}},
  {...good,actor:'PUBLIC'},
  {...good,reason:'短'},
  {...good,id:'REAL-ROW-1234',value:{...good.value,id:'REAL-ROW-1234'}},
  {...good,expectedRevision:-1}
 ])assert.throws(()=>ctx.study1UnifiedStoreApply_(s,bad));
 assert.equal(s.revision,0);assert.equal(s.audit.length,0);
});


test('server role gate keeps synthetic owner access and rejects unapproved PI/RA/formal operations',()=>{
 const x=setup(),ctx=x.ctx;
 assert.equal(ctx.study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_READ'),true);
 for(const [role,operation] of [
  ['PI','SYNTHETIC_READ'],['RA','SYNTHETIC_WRITE'],
  ['OWNER','FORMAL_READ'],['OWNER','FORMAL_WRITE'],
  ['AUDITOR','SYNTHETIC_READ'],['OWNER','EXPORT_AUDIT']
 ])assert.throws(()=>ctx.study1UnifiedRoleAuthorise_(role,operation),/未獲授權/);
 assert.equal(x.writes,0);
 assert.equal(x.store.get('OPEN'),'false');
 assert.equal(x.store.get('CONSENT_READY'),'false');
});

test('synthetic audit verifies replay fingerprint and prior row digest even after a forged rehash',()=>{
 const ctx=setup().ctx;
 const base={action:'UPSERT',actor:'PI',expectedRevision:0,id:'SIM-ROW-9001',
  reason:'建立虛構紀錄',requestId:'REQ-SIM-STRONGAUDIT0001',
  value:{id:'SIM-ROW-9001',source:'SYNTHETIC_ONLY',status:'NEW'}};
 const first=ctx.study1UnifiedStoreApply_(ctx.study1UnifiedStoreInitial_(),base).state;
 const second=ctx.study1UnifiedStoreApply_(first,{...base,actor:'RA',expectedRevision:1,
  reason:'人工更正紀錄',requestId:'REQ-SIM-STRONGAUDIT0002',
  value:{...base.value,status:'REVIEW'}}).state;
 assert.equal(ctx.study1UnifiedStoreVerify_(second),true);
 assert.ok(/^[a-f0-9]{64}$/.test(second.audit[1].requestFingerprint));
 const wrongPrior=JSON.parse(JSON.stringify(second));
 wrongPrior.audit[1].beforeHash='f'.repeat(64);
 const priorCopy={...wrongPrior.audit[1]};delete priorCopy.digest;
 wrongPrior.audit[1].digest=ctx.study1UnifiedStoreHash_(priorCopy);
 wrongPrior.head=wrongPrior.audit[1].digest;
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(wrongPrior),/前態/);
 const wrongReplay=JSON.parse(JSON.stringify(second));
 wrongReplay.requestIndex['REQ-SIM-STRONGAUDIT0002'].fingerprint='a'.repeat(64);
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(wrongReplay),/指紋/);
 const corruptPage=ctx.study1UnifiedStoreInitial_();
 corruptPage.records['SIM-ROW-9001']={...base.value,source:'UNAPPROVED'};
 assert.throws(()=>ctx.study1UnifiedStorePage_(corruptPage,{
  expectedRevision:0,limit:10,after:''}),/虛構資料/);
});

test('synthetic storage refuses arbitrary identity fields and malformed rows',()=>{
 const {ctx}=setup(),initial=ctx.study1UnifiedStoreInitial_();
 const base={action:'UPSERT',actor:'RA',expectedRevision:0,id:'SIM-ROW-FIELDS',
  reason:'虛構資料測試',requestId:'REQ-SIM-FIELDS00000001',
  value:{id:'SIM-ROW-FIELDS',source:'SYNTHETIC_ONLY',status:'PENDING'}};
 for(const value of [
  {...base.value,email:'participant@example.invalid'},
  {...base.value,phone:'0999999999'},
  {...base.value,status:{text:'PENDING'}},
  {...base.value,contact:{email:'participant@example.invalid'}}
 ])assert.throws(()=>ctx.study1UnifiedStoreApply_(initial,{...base,value}),/虛構版本化更新/);
 const good=ctx.study1UnifiedStoreApply_(initial,base).state;
 assert.equal(ctx.study1UnifiedStoreVerify_(good),true);
 good.records[base.id].email='participant@example.invalid';
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(good),/雜湊不一致/);
 const page=ctx.study1UnifiedStoreInitial_();
 page.records[base.id]={...base.value,email:'participant@example.invalid'};
 assert.throws(()=>ctx.study1UnifiedStorePage_(page,{expectedRevision:0,limit:10,after:''}),/已核准欄位/);
});
test('synthetic audit rejects backdated entries despite recomputed SHA chain',()=>{
 const {ctx}=setup(),base={action:'UPSERT',actor:'PI',expectedRevision:0,id:'SIM-ROW-TIME',
  reason:'首次虛構登錄',requestId:'REQ-SIM-TIME00000001',
  value:{id:'SIM-ROW-TIME',source:'SYNTHETIC_ONLY',status:'NEW'}};
 const one=ctx.study1UnifiedStoreApply_(ctx.study1UnifiedStoreInitial_(),base).state;
 const two=ctx.study1UnifiedStoreApply_(one,{...base,actor:'RA',expectedRevision:1,
  reason:'後續虛構更正',requestId:'REQ-SIM-TIME00000002',
  value:{...base.value,status:'REVIEW'}}).state;
 assert.equal(ctx.study1UnifiedStoreVerify_(two),true);
 two.audit[1].at=new Date(Date.parse(two.audit[0].at)-1000).toISOString();
 const payload={...two.audit[1]};delete payload.digest;
 two.audit[1].digest=ctx.study1UnifiedStoreHash_(payload);two.head=two.audit[1].digest;
 assert.throws(()=>ctx.study1UnifiedStoreVerify_(two),/時間順序倒退/);
});

test('snapshot pagination rejects silent same-revision drift, invented cursors and late unapproved records',()=>{
 const ctx=setup().ctx,state=ctx.study1UnifiedStoreInitial_();
 for(let i=0;i<5000;i++){
  const id='SIM-SCALE-'+String(i).padStart(5,'0');
  state.records[id]={id,source:'SYNTHETIC_ONLY',status:'PENDING'};
 }
 let after='',hash=null,count=0,pages=0,previous='';
 do{
  const q={expectedRevision:0,limit:100,after};
  if(after)q.snapshotHash=hash;
  const page=ctx.study1UnifiedStorePage_(state,q);
  if(hash)assert.equal(page.snapshotHash,hash);
  hash=page.snapshotHash;
  for(const item of page.items){
   assert.ok(item.id>previous,'page order must be strictly increasing');
   previous=item.id;
  }
  count+=page.items.length;pages++;after=page.nextAfter||'';
  if(!page.nextAfter)break;
 }while(pages<55);
 assert.equal(count,5000);assert.equal(pages,50);
 assert.throws(()=>ctx.study1UnifiedStorePage_(state,{
  expectedRevision:0,limit:100,after:'SIM-SCALE-DOES-NOT-EXIST',snapshotHash:hash}),/游標/);
 const first=ctx.study1UnifiedStorePage_(state,{expectedRevision:0,limit:100,after:''});
 const cursor=first.nextAfter;
 state.records['SIM-SCALE-04999'].status='CHANGED_WITHOUT_REVISION';
 assert.throws(()=>ctx.study1UnifiedStorePage_(state,{
  expectedRevision:0,limit:100,after:cursor,snapshotHash:first.snapshotHash}),/漂移/);
 state.records['SIM-SCALE-04999'].status='PENDING';
 state.records['SIM-SCALE-04999'].source='UNAPPROVED';
 assert.throws(()=>ctx.study1UnifiedStorePage_(state,{
  expectedRevision:0,limit:100,after:''}),/虛構資料/);
});

test('original fixture rollback never overwrites an uncoordinated writer after failed readback',()=>{
 const x=setup(),{ctx,store}=x;
 ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:0,requestId:'REQ-SIM-DIRTYBASE000001'});
 const before=x.writes;
 x.armDrift();
 assert.throws(()=>ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:1,requestId:'REQ-SIM-DIRTYRACE000001'}),/狀態不明|競寫/);
 assert.equal(store.get('STUDY1_UNIFIED_FIXTURE_V1'),'OTHER_WRITER_BYTES');
 assert.equal(x.writes,before+1,'cannot restore over foreign writer');
 assert.equal(x.held,false);
 assert.equal(store.get('OPEN'),'false');
 assert.equal(store.get('CONSENT_READY'),'false');
});

test('original fixture failures before/after a property write never invent success or lose prior bytes',()=>{
 const x=setup(),ctx=x.ctx;
 ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:0,requestId:'REQ-SIM-RESTOREBASE0001'});
 const before=x.store.get('STUDY1_UNIFIED_FIXTURE_V1'),writes=x.writes;
 x.armThrowBefore();
 assert.throws(()=>ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:1,requestId:'REQ-SIM-RESTOREBEFORE01'}),/已回復寫入前版本/);
 assert.equal(x.store.get('STUDY1_UNIFIED_FIXTURE_V1'),before);
 assert.equal(x.writes,writes,'pre-write exception must not create a restoration write');
 x.armThrowAfter();
 assert.throws(()=>ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:1,requestId:'REQ-SIM-RESTOREAFTER001'}),/已回復寫入前版本/);
 assert.equal(x.store.get('STUDY1_UNIFIED_FIXTURE_V1'),before);
 assert.equal(x.writes,writes+2,'post-write exception must restore exactly once');
 assert.equal(ctx.study1UnifiedPreviewGet().revision,1);
 assert.equal(x.held,false);
});
