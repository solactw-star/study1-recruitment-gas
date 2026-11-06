'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'../gas');
const source=['OtpCore.js','BookingCore.js','OtpThrottle.js','OtpTransaction.js',
 'BookingHoldTransaction.js','Study1FixtureAdapter.js','AdminSandbox.js','Study1Unified.js']
 .map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');
const byteArray=v=>[...v].map(x=>x>127?x-256:x);
const buff=v=>typeof v==='string'?Buffer.from(v,'utf8'):Buffer.from(v.map(x=>x&255));
const blob=v=>({getBytes:()=>byteArray(buff(v)),getDataAsString:()=>buff(v).toString('utf8')});
function setup({active='solac.tw@gmail.com',consent='false'}={}){
 const data=new Map([['OPEN','false'],['CONSENT_READY',consent]]);let writes=0,locked=false,inject=false,corrupt=false,
 foreign=false,foreignReadback=false,throwAfter=false;
 const props={
  getProperty:k=>{
   if(k==='STUDY1_B06_TASKS_V1'&&corrupt){corrupt=false;return 'CORRUPTED_ONCE';}
   if(k==='STUDY1_B06_TASKS_V1'&&foreignReadback){
    foreignReadback=false;data.set(k,'OTHER_WRITER_B06_BYTES');return 'OTHER_WRITER_B06_BYTES';
   }
   return data.has(k)?data.get(k):null;
  },
  setProperty:(k,v)=>{
   assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1'].includes(k));
   assert.ok(Buffer.byteLength(v,'utf8')<9000);
   data.set(k,v);writes++;
   if(inject){inject=false;corrupt=true;}
   if(foreign){foreign=false;foreignReadback=true;}
   if(throwAfter){throwAfter=false;throw Error('SIM_B06_POST_WRITE');}
  },
  deleteProperty:k=>data.delete(k)
 };
 const ctx=vm.createContext({
  Date,JSON,Math,Array,Object,Number,String,Set,Map,Error,
  Session:{getActiveUser:()=>({getEmail:()=>active}),
    getEffectiveUser:()=>({getEmail:()=>active})},
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{assert.equal(locked,false);locked=true;return true;},
   releaseLock:()=>{assert.equal(locked,true);locked=false;},hasLock:()=>locked
  })},
  Utilities:{Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'SHA_256'},
   newBlob:(value)=>blob(value),gzip:b=>blob(zlib.gzipSync(buff(b.getBytes()))),
   ungzip:b=>blob(zlib.gunzipSync(buff(b.getBytes()))),
   base64Encode:bytes=>buff(bytes).toString('base64'),
   base64Decode:encoded=>byteArray(Buffer.from(encoded,'base64')),
   computeDigest:(alg,bytes)=>{assert.equal(alg,'SHA_256');
    return byteArray(crypto.createHash('sha256').update(buff(bytes)).digest());},
   computeHmacSha256Signature:(txt,key)=>byteArray(crypto.createHmac('sha256',key).update(txt).digest())
  }
 });
 vm.runInContext(source,ctx,{timeout:3000});
 let n=0;const clone=x=>JSON.parse(JSON.stringify(x));
 const get=()=>clone(ctx.study1UnifiedPreviewGet());
 const cmd=(action,payload,revision=get().b06.revision,id)=>clone(ctx.study1UnifiedB06Command({
  action,payload,expectedRevision:revision,requestId:id||'REQ-SIM-B06UNIT'+String(++n).padStart(9,'0')
 }));
 const fields={title:'整理虛構場次行政文件',description:'只使用虛構資料',assignee:'',
  dueDate:'',experiment:'ALL',relationType:'NONE',relationId:'',reason:'人工建立行政事項'};
 return {ctx,data,get,cmd,fields,inject:()=>{inject=true;},
  injectForeign:()=>{foreign=true;},injectPostWrite:()=>{throwAfter=true;},
  get writes(){return writes},get locked(){return locked}};
}
test('B06 manual creation, completion, reopening, editing and archive restore share one owner site and retain audit',()=>{
 const s=setup(),before=s.get();assert.equal(before.b06.tasks.length,0);
 const first=s.cmd('CREATE',s.fields);
 const id=first.b06.tasks[0].id;
 assert.equal(id,'SIM-TASK-000001');assert.equal(first.b06.tasks[0].status,'OPEN');
 assert.equal(first.b06.tasks[0].assignee,'');
 assert.equal(first.b06.tasks[0].dueDate,'');
 assert.equal(first.b06.revision,1);
 assert.equal(first.revision,before.revision,'B06 independent revision never consumes B02 transaction cap');
 assert.equal(first.b06.audit[0].actor,'OWNER');
 assert.equal(first.b06.audit[0].action,'CREATE');
 assert.equal(first.b06.audit[0].before,null);
 assert.equal(first.b06.audit[0].after.id,id);
 s.cmd('COMPLETE',{id,reason:'研究人員人工完成'});
 assert.equal(s.get().b06.tasks[0].status,'DONE');
 s.cmd('REOPEN',{id,reason:'研究人員人工重新開啟'});
 assert.equal(s.get().b06.tasks[0].status,'OPEN');
 s.cmd('EDIT',{id,data:{...s.fields,title:'更新虛構行政文件',assignee:'RA',
  dueDate:'2027-03-01',reason:'研究助理人工修正'}});
 assert.equal(s.get().b06.tasks[0].assignee,'RA');
 s.cmd('ARCHIVE',{id,reason:'研究人員人工封存'});
 assert.equal(s.get().b06.tasks[0].archived,true);
 assert.throws(()=>s.cmd('COMPLETE',{id,reason:'封存後不能完成'}),/封存/);
 s.cmd('RESTORE',{id,reason:'研究人員恢復封存'});
 const final=s.get();
 assert.equal(final.b06.tasks[0].archived,false);
 assert.deepEqual(final.b06.audit.map(h=>h.action),['CREATE','COMPLETE','REOPEN','EDIT','ARCHIVE','RESTORE']);
 assert.equal(s.ctx.study1B06Verify_(s.ctx.study1B06Read_()),true);
 assert.equal(final.b06.requests.length,6);
 assert.equal(final.b06.formalPersistence,false);
 assert.equal(s.data.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
 assert.ok(s.data.has('STUDY1_B06_TASKS_V1'));
 assert.equal(s.data.get('OPEN'),'false');
 assert.equal(s.data.get('CONSENT_READY'),'false');
 assert.equal(s.locked,false);
});
test('B06 scoped references must exist and match experiment, and never auto-create from B05',()=>{
 const s=setup();
 const before=s.get().b06.revision;
 assert.throws(()=>s.cmd('CREATE',{...s.fields,relationType:'PARTICIPANT',
  relationId:'SIM-001'}),/不存在/);
 assert.equal(s.get().b06.revision,before);
 s.ctx.study1UnifiedPreviewCommand({action:'START',payload:{experiment:'E1'},
  expectedRevision:0,requestId:'REQ-SIM-B06APPSTART00001'});
 const a=s.cmd('CREATE',{...s.fields,experiment:'E1',
  relationType:'PARTICIPANT',relationId:'SIM-001'});
 assert.equal(a.b06.tasks[0].relationId,'SIM-001');
 assert.throws(()=>s.cmd('CREATE',{...s.fields,experiment:'E2',
  relationType:'PARTICIPANT',relationId:'SIM-001'}),/實驗別/);
 const slot=s.cmd('CREATE',{...s.fields,experiment:'E1',
  relationType:'SESSION',relationId:'SIM-SLOT-E1-A'});
 assert.equal(slot.b06.tasks[1].relationType,'SESSION');
 assert.equal(s.get().b06.tasks.length,2);
 assert.equal(s.get().b05.history.length,0);
});
test('B06 stale version, duplicate request, collision and corrupt audit fail closed',()=>{
 const s=setup(),rid='REQ-SIM-B06REPLAY00001';
 const first=s.cmd('CREATE',s.fields,0,rid),count=s.writes;
 const replay=s.cmd('CREATE',s.fields,0,rid);
 assert.equal(replay.deduplicated,true);assert.equal(s.writes,count);
 assert.throws(()=>s.cmd('CREATE',{...s.fields,title:'不同待辦'},0,rid),/不同操作/);
 assert.throws(()=>s.cmd('CREATE',s.fields,0,'REQ-SIM-B06REPLAY00002'),/版本已變更/);
 assert.equal(s.get().b06.tasks.length,1);
 const damaged=JSON.parse(JSON.stringify(s.ctx.study1B06Read_()));
 damaged.tasks[0].title='遭竄改';
 assert.throws(()=>s.ctx.study1B06Verify_(damaged),/雜湊|不一致/);
 assert.equal(s.locked,false);
});
test('B06 uncertain write is rolled back under lock with no corrupt stored state',()=>{
 const s=setup();s.cmd('CREATE',s.fields);
 const before=s.data.get('STUDY1_B06_TASKS_V1'),version=s.get().b06.revision;
 s.inject();
 assert.throws(()=>s.cmd('CREATE',{...s.fields,title:'另一筆待辦'}),/已恢復原資料/);
 assert.equal(s.data.get('STUDY1_B06_TASKS_V1'),before);
 assert.equal(s.get().b06.revision,version);
 assert.equal(s.get().b06.tasks.length,1);
 assert.equal(s.locked,false);
});
test('B06 permission and consent gate remain fail closed, no formal sources used',()=>{
 const deny=setup({active:'unauthorized@example.invalid'});
 assert.throws(()=>deny.get(),/授權|帳號|研究室|管理|拒絕/);
 assert.equal(deny.writes,0);
 const opened=setup({consent:'true'});
 assert.throws(()=>opened.cmd('CREATE',opened.fields),/關閉|CONSENT_READY/);
 assert.equal(opened.writes,0);
 const text=fs.readFileSync(path.join(root,'Study1Unified.js'),'utf8');
 assert.doesNotMatch(text,/\b(?:MailApp|GmailApp|SpreadsheetApp|DriveApp)\s*\./);
});


test('B06 audit requires contiguous before/after values and new request-fingerprint binding',()=>{
 const s=setup(),first=s.cmd('CREATE',s.fields);
 const id=first.b06.tasks[0].id;
 s.cmd('COMPLETE',{id,reason:'研究人員人工完成'});
 const verified=s.ctx.study1B06Read_();
 assert.equal(s.ctx.study1B06Verify_(verified),true);
 assert.ok(/^[a-f0-9]{64}$/.test(verified.audit[1].requestFingerprint));
 const forged=JSON.parse(JSON.stringify(verified));
 forged.audit[1].before=forged.audit[1].after;
 const copy={...forged.audit[1]};delete copy.digest;
 forged.audit[1].digest=s.ctx.study1UnifiedStoreHash_(copy);
 forged.head=forged.audit[1].digest;
 assert.throws(()=>s.ctx.study1B06Verify_(forged),/前後態/);
 const replay=JSON.parse(JSON.stringify(verified));
 replay.requests[1].fingerprint='f'.repeat(64);
 assert.throws(()=>s.ctx.study1B06Verify_(replay),/稽核鏈/);
 assert.equal(s.data.get('OPEN'),'false');
 assert.equal(s.data.get('CONSENT_READY'),'false');
});


test('B06 recoverable failure after committed write restores exact old bytes and revision',()=>{
 const s=setup();
 s.cmd('CREATE',s.fields);
 const before=s.data.get('STUDY1_B06_TASKS_V1'),writes=s.writes;
 s.injectPostWrite();
 assert.throws(()=>s.cmd('CREATE',{...s.fields,title:'虛構例外寫入'}),/已恢復原資料/);
 assert.equal(s.data.get('STUDY1_B06_TASKS_V1'),before);
 assert.equal(s.writes,writes+2);
 assert.equal(s.get().b06.revision,1);
 assert.equal(s.locked,false);
});

test('B06 failed readback with external competing bytes preserves the foreign update and fails closed',()=>{
 const s=setup();
 s.cmd('CREATE',s.fields);
 const writes=s.writes;
 s.injectForeign();
 assert.throws(()=>s.cmd('CREATE',{...s.fields,title:'虛構外部競寫'}),/狀態不明|競寫/);
 assert.equal(s.data.get('STUDY1_B06_TASKS_V1'),'OTHER_WRITER_B06_BYTES');
 assert.equal(s.writes,writes+1,'no rollback may clobber external bytes');
 assert.equal(s.locked,false);
 assert.equal(s.data.get('OPEN'),'false');
 assert.equal(s.data.get('CONSENT_READY'),'false');
});

test('per-property safe capacity rejects oversized incompressible synthetic data before any write',()=>{
 const s=setup(),beforeWrites=s.writes;
 const synthetic=Array.from({length:600},(_,i)=>
  crypto.createHash('sha256').update('SIM-CAPACITY-'+i).digest('hex')).join('');
 const full=JSON.stringify({source:'SYNTHETIC_ONLY',payload:synthetic});
 assert.ok(Buffer.byteLength(full,'utf8')>7900);
 assert.throws(()=>s.ctx.study1UnifiedStoredEncode_(full),/容量/);
 assert.equal(s.writes,beforeWrites);
 assert.equal(s.data.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
 assert.equal(s.data.has('STUDY1_B06_TASKS_V1'),false);
 assert.equal(s.data.get('OPEN'),'false');
 assert.equal(s.data.get('CONSENT_READY'),'false');
});

test('B06 detects corrupt next-ID allocation and history schema without changing stored bytes',()=>{
 const s=setup(),first=s.cmd('CREATE',s.fields);
 const id=first.b06.tasks[0].id;
 s.cmd('COMPLETE',{id,reason:'人工完成虛構事項'});
 const before=s.data.get('STUDY1_B06_TASKS_V1');
 const drift=JSON.parse(JSON.stringify(s.ctx.study1B06Read_()));
 drift.next++;
 assert.throws(()=>s.ctx.study1B06Verify_(drift),/不一致/);
 const extra=JSON.parse(JSON.stringify(s.ctx.study1B06Read_()));
 extra.audit[0].after.contact='sim-only-invalid-field';
 const copy={...extra.audit[0]};delete copy.digest;
 extra.audit[0].digest=s.ctx.study1UnifiedStoreHash_(copy);
 extra.audit[1].prev=extra.audit[0].digest;
 const after={...extra.audit[1]};delete after.digest;
 extra.audit[1].digest=s.ctx.study1UnifiedStoreHash_(after);
 extra.head=extra.audit[1].digest;
 assert.throws(()=>s.ctx.study1B06Verify_(extra),/未核准欄位/);
 assert.equal(s.data.get('STUDY1_B06_TASKS_V1'),before);
 assert.equal(s.locked,false);
});

test('B06 audit rejects forged state transitions and backdated events with recomputed hashes',()=>{
 const s=setup(),first=s.cmd('CREATE',s.fields);
 const id=first.b06.tasks[0].id;
 s.cmd('COMPLETE',{id,reason:'人工完成虛構事項'});
 const source=s.ctx.study1B06Read_();
 const forged=JSON.parse(JSON.stringify(source));
 forged.audit[1].after.status='OPEN';
 forged.tasks[0].status='OPEN';
 const event={...forged.audit[1]};delete event.digest;
 forged.audit[1].digest=s.ctx.study1UnifiedStoreHash_(event);
 forged.head=forged.audit[1].digest;
 assert.throws(()=>s.ctx.study1B06Verify_(forged),/狀態轉移/);
 const backdated=JSON.parse(JSON.stringify(source));
 backdated.audit[1].at=new Date(Date.parse(backdated.audit[0].at)-1000).toISOString();
 const evt={...backdated.audit[1]};delete evt.digest;
 backdated.audit[1].digest=s.ctx.study1UnifiedStoreHash_(evt);
 backdated.head=backdated.audit[1].digest;
 assert.throws(()=>s.ctx.study1B06Verify_(backdated),/時間順序倒退/);
 assert.equal(s.ctx.study1B06Verify_(source),true);
});

test('B06 transaction pins audit chronology when synthetic clock moves backwards',()=>{
 const s=setup(),first=s.cmd('CREATE',s.fields);
 const taskId=first.b06.tasks[0].id,state=s.ctx.study1B06Read_();
 const earlier=Date.parse(state.audit[0].at)-10000;
 const result=s.ctx.study1B06Apply_(state,{
  action:'COMPLETE',payload:{id:taskId,reason:'人工完成虛構事項'},
  expectedRevision:state.revision,requestId:'REQ-SIM-B06CLOCKBACK0001'
 },s.ctx.study1UnifiedInitial_(),earlier);
 assert.equal(result.state.audit[1].at,state.audit[0].at);
 assert.equal(result.state.tasks[0].updatedAt,state.audit[0].at);
 assert.equal(s.ctx.study1B06Verify_(result.state),true);
 assert.equal(s.data.get('STUDY1_B06_TASKS_V1')!==null,true);
});

test('B12 owner-only read-only query sorts B06 audit, shows verified diffs and never writes',()=>{
 const s=setup(),created=s.cmd('CREATE',s.fields);
 const id=created.b06.tasks[0].id;
 s.cmd('COMPLETE',{id,reason:'研究人員人工完成'});
 s.cmd('REOPEN',{id,reason:'研究人員人工重開'});
 const before=s.writes;
 const base={module:'B06',sort:'DESC',term:'',after:'',snapshotHash:'',limit:2};
 const first=JSON.parse(JSON.stringify(s.ctx.study1UnifiedB12Query(base)));
 assert.equal(first.schema,'STUDY1_B12_READONLY_V1');
 assert.equal(first.mode,'SYNTHETIC_ONLY');
 assert.equal(first.integrity,'B06_CHAIN_VERIFIED');
 assert.equal(first.exportAllowed,false);assert.equal(first.formalData,false);
 assert.equal(first.total,3);assert.equal(first.items.length,2);
 assert.deepEqual(first.items.map(x=>x.action),['REOPEN','COMPLETE']);
 assert.ok(first.items[0].diff.some(d=>d.field==='status'&&d.before==='DONE'&&d.after==='OPEN'));
 assert.equal(first.items[0].quality,'CHAIN_VERIFIED');
 assert.ok(first.nextAfter);
 const second=JSON.parse(JSON.stringify(s.ctx.study1UnifiedB12Query({
  ...base,after:first.nextAfter,snapshotHash:first.snapshotHash
 })));
 assert.equal(second.items.length,1);
 assert.equal(second.items[0].action,'CREATE');assert.equal(second.nextAfter,null);
 assert.equal(new Set(first.items.concat(second.items).map(x=>x.id)).size,3);
 assert.equal(s.writes,before);
 assert.equal(s.data.get('OPEN'),'false');assert.equal(s.data.get('CONSENT_READY'),'false');
 assert.equal(s.locked,false);
});

test('B12 paging pins exact source bytes and filters, fails closed on stale or fake cursor',()=>{
 const s=setup();s.cmd('CREATE',s.fields);s.cmd('CREATE',{...s.fields,title:'第二項虛構待辦'});
 const base={module:'ALL',sort:'ASC',term:'',after:'',snapshotHash:'',limit:1};
 const first=s.ctx.study1UnifiedB12Query(base);
 assert.ok(first.nextAfter);
 assert.throws(()=>s.ctx.study1UnifiedB12Query({...base,after:first.nextAfter,
  snapshotHash:first.snapshotHash,sort:'DESC'}),/快照|篩選/);
 assert.throws(()=>s.ctx.study1UnifiedB12Query({...base,after:'B06:999999',
  snapshotHash:first.snapshotHash}),/游標/);
 s.cmd('CREATE',{...s.fields,title:'第三項虛構待辦'});
 assert.throws(()=>s.ctx.study1UnifiedB12Query({...base,after:first.nextAfter,
  snapshotHash:first.snapshotHash}),/快照|篩選/);
 assert.throws(()=>s.ctx.study1UnifiedB12Query({...base,after:'',
  snapshotHash:first.snapshotHash}),/首頁不可沿用/);
 assert.equal(s.locked,false);
});

test('B12 rejects unapproved query, formal export, unauthorized role and broken audit chain',()=>{
 const s=setup(),before=s.writes;
 const base={module:'ALL',sort:'DESC',term:'',after:'',snapshotHash:'',limit:10};
 for(const bad of [
  {...base,module:'REAL'}, {...base,limit:101},
  {...base,export:true}, {...base,term:'<img src=x>'},
  {...base,snapshotHash:'bad'}, {...base,sort:'UNKNOWN'}
 ])assert.throws(()=>s.ctx.study1UnifiedB12Query(bad));
 assert.throws(()=>s.ctx.study1UnifiedRoleAuthorise_('OWNER','EXPORT_AUDIT'),/未獲授權/);
 const denied=setup({active:'unauthorized@example.invalid'});
 assert.throws(()=>denied.ctx.study1UnifiedB12Query(base),/拒絕|授權|管理|帳號/);
 const consent=setup({consent:'true'});
 assert.throws(()=>consent.ctx.study1UnifiedB12Query(base),/關閉|CONSENT_READY/);
 s.cmd('CREATE',s.fields);
 const original=s.data.get('STUDY1_B06_TASKS_V1');
 const mutated=JSON.parse(s.ctx.study1UnifiedStoredDecode_(original));
 mutated.audit[0].reason='竄改的操作原因';
 s.data.set('STUDY1_B06_TASKS_V1',JSON.stringify(mutated));
 assert.throws(()=>s.ctx.study1UnifiedB12Query(base),/B06.*稽核|雜湊|不一致/);
 assert.equal(s.writes,before+1,'read-only B12 cannot rewrite invalid stored audit');
 assert.equal(s.locked,false);
});

test('B12 legacy B02/B04/B05 events are clearly limited and redact free text',()=>{
 const s=setup(),state=s.ctx.study1UnifiedInitial_(),tasks=s.ctx.study1B06Initial_();
 const at='2026-11-06T06:30:00.000Z';
 state.b02.history.push({at,action:'ADD',ids:['SIM-SLOT-E1-A']});
 state.b04.history.push({at,id:'SIM-001',field:'adminNote',before:'hidden before note',
  after:'hidden after note',reason:'private note reason',actor:'OWNER'});
 state.b05.history.push({at,slotId:'SIM-SLOT-E1-A',action:'CLOSE',actor:'OWNER',
  before:'OPEN',after:'CLOSED',issues:0,reason:'private closure reason',handoff:'private'});
 const query={module:'ALL',sort:'ASC',term:'SIM',after:'',snapshotHash:'',limit:10};
 const page=s.ctx.study1UnifiedB12Page_(state,tasks,query,'sim-raw-main','sim-raw-tasks');
 assert.equal(page.total,3);
 assert.deepEqual(JSON.parse(JSON.stringify(page.items.map(x=>x.module))),['B02','B04','B05']);
 assert.match(page.warnings.join(' '),/有限舊歷程/);
 assert.ok(page.items.every(x=>x.quality.startsWith('LIMITED')));
 assert.doesNotMatch(JSON.stringify(page),/hidden before note|hidden after note|private note reason|private closure reason|private"/);
 assert.equal(page.items.find(x=>x.module==='B05').diff[0].before,'OPEN');
 assert.equal(page.items.find(x=>x.module==='B04').diff[0].after,'〔內容未於B12顯示〕');
 assert.equal(s.locked,false);
});
