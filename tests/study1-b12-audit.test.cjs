'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.join(__dirname,'../gas');
const source=['OtpCore.js','BookingCore.js','OtpThrottle.js','OtpTransaction.js',
 'BookingHoldTransaction.js','Study1FixtureAdapter.js','AdminSandbox.js','Study1Unified.js']
 .map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n');
const bytes=b=>[...b].map(x=>x>127?x-256:x);
const buff=b=>typeof b==='string'?Buffer.from(b,'utf8'):Buffer.from(b.map(x=>x&255));
const blob=v=>({getBytes:()=>bytes(buff(v)),getDataAsString:()=>buff(v).toString('utf8')});
function setup({active='solac.tw@gmail.com',open='false',consent='false'}={}){
 const store=new Map([['OPEN',open],['CONSENT_READY',consent]]),warnings=[];
 let writes=0,locked=false;
 const properties={
  getProperty:k=>store.has(k)?store.get(k):null,
  setProperty:(k,v)=>{
   assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1'].includes(k));
   assert.ok(Buffer.byteLength(v,'utf8')<9000);store.set(k,v);writes++;
  },
  deleteProperty:k=>{store.delete(k);writes++;}
 };
 const ctx=vm.createContext({
  Date,JSON,Math,Array,Object,Number,String,Set,Map,Error,
  console:{warn:t=>warnings.push(String(t))},
  Session:{getActiveUser:()=>({getEmail:()=>active}),
   getEffectiveUser:()=>({getEmail:()=>active})},
  PropertiesService:{getScriptProperties:()=>properties},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{assert.equal(locked,false);locked=true;return true;},
   releaseLock:()=>{assert.equal(locked,true);locked=false;},hasLock:()=>locked})},
  Utilities:{Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'SHA_256'},
   newBlob:v=>blob(v),gzip:b=>blob(zlib.gzipSync(buff(b.getBytes()))),
   ungzip:b=>blob(zlib.gunzipSync(buff(b.getBytes()))),
   base64Encode:v=>buff(v).toString('base64'),
   base64Decode:v=>bytes(Buffer.from(v,'base64')),
   computeDigest:(_alg,v)=>bytes(crypto.createHash('sha256').update(buff(v)).digest()),
   computeHmacSha256Signature:(a,k)=>bytes(crypto.createHmac('sha256',k).update(a).digest())
  }
 });
 vm.runInContext(source,ctx,{timeout:3000});
 return {ctx,store,warnings,get writes(){return writes},get locked(){return locked}};
}
function query(f,b,changes={}){
 return {after:'',expectedB06Revision:b.revision,expectedFixtureRevision:f.revision,
  limit:10,module:'ALL',result:'ALL',search:'',snapshotHash:'',...changes};
}
const fields={title:'整理虛構研究行政清單',description:'只使用合成資料',
 assignee:'',dueDate:'',experiment:'ALL',relationType:'NONE',relationId:'',
 reason:'研究人員手動建立待辦'};
function b06Events(ctx,n){
 const f=ctx.study1UnifiedInitial_();let b=ctx.study1B06Initial_();
 for(let i=0;i<n;i++){
  const action=i===0?'CREATE':i%2?'COMPLETE':'REOPEN';
  const payload=i===0?fields:{id:'SIM-TASK-000001',reason:'人工調整虛構狀態'};
  const cmd={action,payload,expectedRevision:b.revision,
   requestId:'REQ-SIM-B12PAGE'+String(i).padStart(9,'0')};
  const applied=ctx.study1B06Apply_(b,cmd,f,Date.UTC(2026,10,6,8,0,0)+i*1000);
  assert.equal(applied.deduplicated,false);
  b=applied.state;
 }
 return {f,b};
}
test('B12 P1-08 waitlist history boundary: only actual retained current-state snapshots, no invented historical action',()=>{
 const x=setup(),ctx=x.ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 const joinedAt=Date.parse('2026-11-08T08:00:00.000Z');
 f.applications.push({id:'SIM-001',experiment:'E1',phase:'VERIFIED',
  eligible:true,slotId:null});
 f.waitlist.nextSeq=1;
 f.waitlist.entries.push({id:'SIM-001',slotId:'SIM-SLOT-E1-A',experiment:'E1',
  seq:1,joinedAt,status:'WAITING',offeredAt:null,expiresAt:null,closedAt:null});
 const read=ctx.study1B12AuditPage_(f,b,query(f,b,{module:'WAITLIST',
  result:'CURRENT_SNAPSHOT',sort:'DESC'}));
 assert.equal(read.total,1);
 const entry=read.items[0];
 assert.equal(entry.module,'WAITLIST');
 assert.equal(entry.historical,false);
 assert.equal(entry.at,null);
 assert.equal(entry.before,null);
 assert.equal(entry.actor,'SYSTEM_TEST_SNAPSHOT');
 assert.equal(entry.action,'WAITING');
 assert.equal(entry.provenance,'CURRENT_TEST_WAITLIST_ONLY');
 assert.equal(entry.after.seq,1);
 assert.equal(entry.after.stage,'SINGLE_SESSION');
 assert.equal(read.coverage.waitlistSummary.byExperiment.E1.WAITING,1);
 assert.equal(read.coverage.waitlistSummary.byExperiment.E2.total,0);
 assert.equal(read.coverage.complete,false);
 assert.equal(read.coverage.sources.find(s=>s.module==='WAITLIST').retained,1);
 assert.ok(read.coverage.warnings.some(w=>w.code==='WAITLIST_CURRENT_ONLY'));
 const previousHash=read.snapshotHash;
 f.waitlist.entries[0].status='DECLINED';f.waitlist.entries[0].closedAt=joinedAt+120000;
 const update=ctx.study1B12AuditPage_(f,b,query(f,b,{module:'WAITLIST',
  result:'CURRENT_SNAPSHOT'}));
 assert.equal(update.total,1);assert.equal(update.items[0].action,'DECLINED');
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b,{module:'WAITLIST',
  result:'CURRENT_SNAPSHOT',after:entry.id,snapshotHash:previousHash,sort:'DESC'})),/快照/);
 f.waitlist.entries[0].experiment='E2';
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b,{module:'WAITLIST',
  result:'CURRENT_SNAPSHOT'})),/候補|實驗/);
 assert.equal(x.writes,0);
});
test('B12 full B06 SHA history survives archive-like state edits, is read-only and paginates 67 events exactly',()=>{
 const x=setup(),{ctx}=x,{f,b}=b06Events(ctx,67);
 const bytesBefore=JSON.stringify(b),fBefore=JSON.stringify(f);
 let cursor='',hash='',count=0,lastSeq=0,pages=0;
 do{
  const page=ctx.study1B12AuditPage_(f,b,query(f,b,{after:cursor,
   snapshotHash:hash,limit:9,module:'B06'}));
  assert.equal(page.mode,'SYNTHETIC_AUDIT_ONLY');
  assert.equal(page.formalExport,false);assert.equal(page.b06ChainVerified,true);
  assert.equal(page.completeImmutableArchive,false);
  assert.equal(page.total,67);
  if(hash)assert.equal(page.snapshotHash,hash);
  hash=page.snapshotHash;
  for(const e of page.items){
   assert.equal(e.module,'B06');assert.equal(e.result,'SUCCESS');
   assert.equal(e.historical,true);assert.equal(e.provenance,'SHA256_CHAIN_VERIFIED');
   assert.equal(e.before===null,e.action==='CREATE');
   assert.ok(Number(e.id.split('-')[1])>lastSeq);lastSeq=Number(e.id.split('-')[1]);
  }
  count+=page.items.length;pages++;
  cursor=page.nextAfter||'';
  if(!cursor)break;
 }while(pages<12);
 assert.equal(count,67);assert.equal(lastSeq,67);assert.equal(pages,8);
 assert.equal(JSON.stringify(b),bytesBefore);assert.equal(JSON.stringify(f),fBefore);
 assert.equal(x.writes,0);
});
test('B12 snapshot cursor binds original version, entire history and filters even if revision stays unchanged',()=>{
 const ctx=setup().ctx,{f,b}=b06Events(ctx,4);
 const first=ctx.study1B12AuditPage_(f,b,query(f,b,{limit:2}));
 const resume=query(f,b,{limit:2,after:first.nextAfter,snapshotHash:first.snapshotHash});
 assert.equal(ctx.study1B12AuditPage_(f,b,resume).items.length,2);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,module:'B04'}),/游標|快照/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,after:'B06-000999'}),/游標/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,expectedB06Revision:-1}),/參數/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,role:'PI'}),/參數/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,export:true}),/參數/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,limit:31}),/參數/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,{...resume,search:'<script>'}),/參數/);
 const changed=JSON.parse(JSON.stringify(f));
 changed.notifications.push({id:'SIM-001',status:'SIM_FAILED',
  lastError:'SIMULATED_FAILURE',attempts:1});
 assert.throws(()=>ctx.study1B12AuditPage_(changed,b,resume),/快照/);
});
test('B12 rejects B06 audit tampering, mismatched prior values and forged action semantics',()=>{
 const ctx=setup().ctx,{f,b}=b06Events(ctx,3);
 assert.equal(ctx.study1B12AuditBuild_(f,b).length,3);
 const forged=JSON.parse(JSON.stringify(b));
 forged.audit[1].before={...forged.audit[1].before,title:'不合法變造'};
 assert.throws(()=>ctx.study1B12AuditBuild_(f,forged),/雜湊|稽核|不連續/);
 const wrongAction=JSON.parse(JSON.stringify(b));
 wrongAction.audit[0].action='COMPLETE';
 const first={...wrongAction.audit[0]};delete first.digest;
 wrongAction.audit[0].digest=ctx.study1UnifiedStoreHash_(first);
 wrongAction.audit[1].prev=wrongAction.audit[0].digest;
 const second={...wrongAction.audit[1]};delete second.digest;
 wrongAction.audit[1].digest=ctx.study1UnifiedStoreHash_(second);
 wrongAction.audit[2].prev=wrongAction.audit[1].digest;
 const third={...wrongAction.audit[2]};delete third.digest;
 wrongAction.audit[2].digest=ctx.study1UnifiedStoreHash_(third);
 wrongAction.head=wrongAction.audit[2].digest;
 assert.throws(()=>ctx.study1B12AuditBuild_(f,wrongAction),/前後值|類型|前態/);
});
test('B12 tests recent B04/B05 before-after continuity and latest record without rewriting old bounded history',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 const at1='2026-11-06T08:00:00.000Z',at2='2026-11-06T08:01:00.000Z';
 f.b04.notes['SIM-001']='second';
 f.b04.history.push({id:'SIM-001',field:'adminNote',before:'',after:'first',
  reason:'虛構行政更正',actor:'OWNER',at:at1});
 f.b04.history.push({id:'SIM-001',field:'adminNote',before:'first',after:'second',
  reason:'虛構行政再更正',actor:'OWNER',at:at2});
 f.b05.history.push({action:'CLOSE',actor:'OWNER',at:at1,
  slotId:'SIM-SLOT-E1-A',before:'OPEN',after:'CLOSED',issues:0,
  reason:'人工完成虛構場次',handoff:''});
 f.b02.sessions['SIM-SLOT-E1-A']={title:'虛構研究場次',place:'',
  minutes:60,group:'',status:'CLOSED'};
 const out=ctx.study1B12AuditPage_(f,b,query(f,b));
 assert.equal(out.items.length,3);
 assert.equal(out.legacyHistoryBounded,true);
 assert.deepEqual(out.items.map(e=>e.provenance),[
  'BOUNDED_LEGACY_HISTORY','BOUNDED_LEGACY_HISTORY','BOUNDED_LEGACY_HISTORY']);
 let corrupt=JSON.parse(JSON.stringify(f));
 corrupt.b04.history[1].before='tampered';
 assert.throws(()=>ctx.study1B12AuditBuild_(corrupt,b),/前後值不連續/);
 corrupt=JSON.parse(JSON.stringify(f));corrupt.b04.notes['SIM-001']='not-latest';
 assert.throws(()=>ctx.study1B12AuditBuild_(corrupt,b),/目前資料不符/);
 corrupt=JSON.parse(JSON.stringify(f));corrupt.b05.history.push({
  ...corrupt.b05.history[0],action:'REOPEN',before:'OPEN',after:'OPEN'});
 assert.throws(()=>ctx.study1B12AuditBuild_(corrupt,b),/狀態不一致/);
});
test('B12 labels simulated notification failure as current snapshot, NOT retained historical event',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 f.notifications=[{id:'SIM-001',status:'SIM_FAILED',lastError:'SIMULATED_FAILURE',
  attempts:1,text:'SIM TEST',event:'CONFIRM'}];
 const p=ctx.study1B12AuditPage_(f,b,query(f,b,{result:'SIM_FAILED_SNAPSHOT'}));
 assert.equal(p.items.length,1);assert.equal(p.items[0].historical,false);
 assert.equal(p.items[0].at,null);assert.equal(p.items[0].provenance,'CURRENT_SNAPSHOT_ONLY');
 assert.equal(p.items[0].result,'SIM_FAILED_SNAPSHOT');
 assert.equal(p.items[0].after.status,'SIM_FAILED');
});
test('original B12 endpoint reads the same owner-only existing two fixture keys, without mutations',()=>{
 const x=setup(),ctx=x.ctx;
 ctx.study1UnifiedB06Command({action:'CREATE',payload:fields,expectedRevision:0,
  requestId:'REQ-SIM-B12SERVER00000001'});
 const before=x.writes,raw=x.store.get('STUDY1_B06_TASKS_V1');
 const p=ctx.study1UnifiedB12AuditPage(query({revision:0},{revision:1},{module:'B06'}));
 assert.equal(p.items.length,1);assert.equal(p.items[0].action,'CREATE');
 assert.equal(p.fixtureRevision,0);assert.equal(p.b06Revision,1);
 assert.equal(x.writes,before);assert.equal(x.store.get('STUDY1_B06_TASKS_V1'),raw);
 assert.equal(x.store.has('STUDY1_B12_AUDIT_V1'),false);
 assert.equal(x.locked,false);
 assert.equal(x.store.get('OPEN'),'false');assert.equal(x.store.get('CONSENT_READY'),'false');
 assert.throws(()=>ctx.study1UnifiedB12Export_(),/未獲授權/);
 assert.throws(()=>ctx.study1UnifiedProductionAdapter_().exportAudit(),/尚未核准/);
 assert.equal(x.writes,before);
});
test('B12 denies unauthorized users and opened consent flag without reading or writing audit sources',()=>{
 for(const options of [
  {active:'unauthorized@example.invalid'},
  {open:'true'},{consent:'true'}
 ]){
  const x=setup(options),ctx=x.ctx;
  assert.throws(()=>ctx.study1UnifiedB12AuditPage(query({revision:0},{revision:0})),
   /權限|拒絕|帳號|關閉|CONSENT_READY|OPEN|授權/);
  assert.throws(()=>ctx.study1UnifiedB12Export_(),/未獲授權/);
  assert.equal(x.writes,0);assert.equal(x.locked,false);
 }
});
test('B12 refused synthetic transaction logs redacted failure codes, no payloads or false historical commits',()=>{
 const x=setup(),ctx=x.ctx;
 ctx.study1UnifiedB06Command({action:'CREATE',payload:fields,expectedRevision:0,
  requestId:'REQ-SIM-B12REJECT0000001'});
 const before=x.store.get('STUDY1_B06_TASKS_V1'),writes=x.writes;
 assert.throws(()=>ctx.study1UnifiedB06Command({action:'CREATE',payload:{
  ...fields,title:'SENSITIVE_FAKE_NAME@example.invalid'},
  expectedRevision:0,requestId:'REQ-SIM-B12REJECT0000002'}),/版本已變更/);
 assert.equal(x.writes,writes);
 assert.equal(x.store.get('STUDY1_B06_TASKS_V1'),before);
 assert.equal(x.warnings.length,1);
 assert.match(x.warnings[0],/STUDY1_B12_REJECTION/);
 assert.match(x.warnings[0],/CONFLICT/);
 assert.doesNotMatch(x.warnings[0],/SENSITIVE_FAKE_NAME|example.invalid|人工建立|requestId/);
 const diag=ctx.study1B12FailureDiagnostic_('UNIFIED',
  new Error('SENSITIVE_FAKE_NAME@example.invalid 資料寫入狀態不明'));
 assert.equal(diag.result,'REJECTED');assert.equal(diag.persistedInB12,false);
 assert.equal(diag.code,'UNCERTAIN_WRITE');
 assert.doesNotMatch(x.warnings.at(-1),/SENSITIVE_FAKE_NAME|example.invalid/);
 assert.equal(ctx.study1UnifiedB12AuditPage(query({revision:0},{revision:1})).items.length,1);
 assert.equal(x.locked,false);
});
test('B12 contains no formal data provider or unapproved third-party export call',()=>{
 const text=fs.readFileSync(path.join(root,'Study1Unified.js'),'utf8');
 assert.doesNotMatch(text,/\b(?:SpreadsheetApp|DriveApp|GmailApp|MailApp|UrlFetchApp)\s*\./);
 assert.match(text,/study1UnifiedRoleAuthorise_\('OWNER','EXPORT_AUDIT'\)/);
 assert.match(text,/STUDY1_B12_DIAGNOSTIC_V1/);
 assert.match(text,/snapshotHash/);
});

test('B12 UI newest/oldest ordering uses independent snapshot-bound cursors and legacy ASC remains valid',()=>{
 const ctx=setup().ctx,{f,b}=b06Events(ctx,12);
 const old=ctx.study1B12AuditPage_(f,b,query(f,b,{limit:5,module:'B06'}));
 assert.deepEqual(old.items.map(x=>x.action),['CREATE','COMPLETE','REOPEN','COMPLETE','REOPEN']);
 const oldest=ctx.study1B12AuditPage_(f,b,query(f,b,{
  sort:'ASC',limit:5,module:'B06'}));
 assert.deepEqual(oldest.items.map(x=>x.id),old.items.map(x=>x.id));
 const newest=ctx.study1B12AuditPage_(f,b,query(f,b,{
  sort:'DESC',limit:5,module:'B06'}));
 assert.deepEqual(newest.items.map(x=>x.id),[
  'B06-000012','B06-000011','B06-000010','B06-000009','B06-000008']);
 assert.notEqual(oldest.snapshotHash,newest.snapshotHash);
 const next=ctx.study1B12AuditPage_(f,b,query(f,b,{
  sort:'DESC',limit:5,module:'B06',
  after:newest.nextAfter,snapshotHash:newest.snapshotHash}));
 assert.deepEqual(next.items.map(x=>x.id),[
  'B06-000007','B06-000006','B06-000005','B06-000004','B06-000003']);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b,{
  sort:'ASC',limit:5,module:'B06',after:newest.nextAfter,
  snapshotHash:newest.snapshotHash})),/快照/);
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b,{
  sort:'REVERSE',module:'B06'})),/參數/);
 const ui=fs.readFileSync(require('node:path').join(root,'Study1Team.html'),'utf8');
 assert.match(ui,/id="b12Sort"/);
 assert.match(ui,/sort:\$\('b12Sort'\)\.value/);
 assert.match(ui,/\['b12ModuleFilter','b12Result','b12Limit','b12Sort'\]/);
});

test('B12 B02 event-only audit is visible with honest metadata and matching B04/B05 mirrors',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 const at1='2026-11-06T08:00:00.000Z',at2='2026-11-06T08:01:00.000Z';
 f.b02.history.push({at:at1,action:'ATTEND',ids:['SIM-001']});
 f.b04.history.push({at:at1,id:'SIM-001',field:'attendanceAndProgress',
  actor:'OWNER',before:'PENDING / NOT_STARTED',after:'PRESENT / COMPLETE',
  reason:'B02場次面板更新（未另填更正原因）'});
 f.b02.attendance['SIM-001']={attendance:'PRESENT',progress:'COMPLETE',note:''};
 f.b02.history.push({at:at2,action:'ADMIN_CLOSE',ids:['SIM-SLOT-E1-A']});
 f.b05.history.push({at:at2,action:'CLOSE',actor:'OWNER',
  slotId:'SIM-SLOT-E1-A',before:'OPEN',after:'CLOSED',issues:0,
  reason:'人工完成虛構場次',handoff:''});
 f.b02.sessions['SIM-SLOT-E1-A']={title:'虛構研究場次',place:'',
  minutes:60,group:'',status:'CLOSED'};
 const raw=JSON.stringify(f),page=ctx.study1B12AuditPage_(f,b,query(f,b));
 assert.equal(page.total,4);
 assert.equal(page.coverage.scope,'BOUNDED_SYNTHETIC_SNAPSHOT');
 assert.equal(page.coverage.complete,false);
 assert.equal(page.coverage.sources.find(s=>s.module==='B02').retained,2);
 assert.equal(page.coverage.crossChecks.b02B05Matched,1);
 assert.equal(page.coverage.crossChecks.b02B05NoMirror,0);
 assert.equal(page.coverage.crossChecks.b05B02NoMirror,0);
 assert.equal(page.coverage.crossChecks.b04AttendanceB02NoMirror,0);
 assert.equal(page.coverage.crossChecks.b02AttendanceNotProvable,0);
 assert.equal(page.coverage.warnings.some(w=>w.code==='MIRROR_NOT_FOUND'),false);
 const b02=page.items.filter(e=>e.module==='B02');
 assert.equal(b02.length,2);
 assert.ok(b02.every(e=>e.provenance==='BOUNDED_EVENT_ONLY'&&e.before===null));
 assert.deepEqual(JSON.parse(JSON.stringify(b02[0].after)),{affectedIds:['SIM-001']});
 assert.match(b02[0].reason,/無前後值可供重建/);
 assert.equal(JSON.stringify(f),raw,'B12 cross-module query cannot mutate sources');
});

test('B12 blocks contradictory B02/B05 mirrored action even when both source histories look valid alone',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 const at='2026-11-06T08:00:00.000Z';
 f.b02.history.push({at,action:'ADMIN_REOPEN',ids:['SIM-SLOT-E1-A']});
 f.b05.history.push({at,action:'CLOSE',actor:'OWNER',
  slotId:'SIM-SLOT-E1-A',before:'OPEN',after:'CLOSED',issues:0,
  reason:'人工確認虛構結案',handoff:''});
 f.b02.sessions['SIM-SLOT-E1-A']={title:'虛構場次',place:'',
  minutes:60,group:'',status:'CLOSED'};
 assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b)),/互相矛盾/);
});

test('B12 warns but does not invent missing mirror when bounded B02 history is at cap',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 for(let i=0;i<12;i++)f.b02.history.push({
  at:new Date(Date.UTC(2026,10,6,8,i,0)).toISOString(),
  action:'UPDATE',ids:['SIM-SLOT-E1-A']});
 f.b05.history.push({action:'CLOSE',actor:'OWNER',at:'2026-11-06T07:00:00.000Z',
  slotId:'SIM-SLOT-E1-A',before:'OPEN',after:'CLOSED',issues:0,
  reason:'人工確認虛構結案',handoff:''});
 f.b02.sessions['SIM-SLOT-E1-A']={title:'虛構場次',place:'',
  minutes:60,group:'',status:'CLOSED'};
 const first=ctx.study1B12AuditPage_(f,b,query(f,b,{limit:4,module:'B02'}));
 assert.equal(first.total,12);
 assert.equal(first.coverage.crossChecks.b05B02NoMirror,1);
 assert.ok(first.coverage.warnings.some(w=>w.code==='B02_CAP'));
 assert.ok(first.coverage.warnings.some(w=>w.code==='MIRROR_NOT_FOUND'));
 assert.match(first.coverage.warnings.find(w=>w.code==='MIRROR_NOT_FOUND').text,/不能直接認定遺失/);
 const newer=JSON.parse(JSON.stringify(f));
 newer.b02.history[11].action='CANCEL'; // no revision change; same number of events
 assert.throws(()=>ctx.study1B12AuditPage_(newer,b,query(newer,b,{
  limit:4,module:'B02',after:first.nextAfter,snapshotHash:first.snapshotHash})),/快照/);
});

test('B12 distinguishes unpaired B04 attendance and unchanged B02 attendance from proven loss',()=>{
 const ctx=setup().ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 f.b04.history.push({id:'SIM-001',field:'attendanceAndProgress',
  before:'PENDING / NOT_STARTED',after:'PRESENT / COMPLETE',
  actor:'OWNER',at:'2026-11-06T08:00:00.000Z',reason:'人工更正虛構出席'});
 f.b02.attendance['SIM-001']={attendance:'PRESENT',progress:'COMPLETE',note:''};
 f.b02.history.push({at:'2026-11-06T08:10:00.000Z',
  action:'ATTEND',ids:['SIM-002']});
 const page=ctx.study1B12AuditPage_(f,b,query(f,b));
 assert.equal(page.coverage.crossChecks.b04AttendanceB02NoMirror,1);
 assert.equal(page.coverage.crossChecks.b02AttendanceNotProvable,1);
 assert.ok(page.coverage.warnings.some(w=>w.code==='ATTEND_NO_CHANGE_UNPROVABLE'));
 assert.ok(page.coverage.warnings.some(w=>w.code==='MIRROR_NOT_FOUND'));
 assert.ok(page.items.every(e=>e.result==='SUCCESS'));
});

test('B12 fails closed on forged B02 codes/dates and never enables a formal export',()=>{
 const x=setup(),ctx=x.ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 for(const record of [
  {at:'2026-11-06T08:00:00.000Z',action:'CREATE',ids:['NOT_SIM']},
  {at:'invalid',action:'ATTEND',ids:['SIM-001']},
  {at:'2026-11-06T08:00:00.000Z',action:'FAKE_COMMIT',ids:['SIM-001']}
 ]){
  f.b02.history=[record];
  assert.throws(()=>ctx.study1B12AuditPage_(f,b,query(f,b)),/B12行事曆/);
 }
 assert.equal(x.writes,0);
 assert.throws(()=>ctx.study1UnifiedB12Export_(),/未獲授權/);
 const html=fs.readFileSync(path.join(root,'Study1Team.html'),'utf8');
 assert.match(html,/<option value="B02">B02 行事曆<\/option>/);
 assert.match(html,/id="b12Coverage"/);
 assert.match(html,/coverage\.warnings\.map/);
 assert.doesNotMatch(html,/id="b12Export"/);
});

test('B12 B07 exposes bounded TEST stage corrections and independently reconciles four E1 E2 stages',()=>{
 const x=setup(),ctx=x.ctx,f=ctx.study1UnifiedInitial_(),b=ctx.study1B06Initial_();
 f.applications=[{id:'SIM-001',experiment:'E1'},{id:'SIM-002',experiment:'E2'}];
 const at='2026-11-06T08:00:00.000Z';
 f.b07.itemReviews['SIM-001:SINGLE_SESSION']={actor:'OWNER',at,status:'SOURCE_PENDING'};
 f.b07.itemReviews['SIM-002:PRETEST']={actor:'OWNER',at,status:'DOCUMENTS_PENDING'};
 f.b07.itemHistory.push({id:'SIM-001',stage:'SINGLE_SESSION',from:'UNRECORDED',
  to:'SOURCE_PENDING',reason:'SOURCE_CHECK',actor:'OWNER',at});
 f.b07.itemHistory.push({id:'SIM-002',stage:'PRETEST',from:'UNRECORDED',
  to:'DOCUMENTS_PENDING',reason:'DOCUMENT_CHECK',actor:'OWNER',at});
 const old=JSON.stringify(f),before=x.writes;
 const page=ctx.study1B12AuditPage_(f,b,query(f,b,{module:'B07'}));
 assert.equal(page.total,2);
 assert.equal(page.items[0].module,'B07');
 assert.equal(page.items[0].provenance,'BOUNDED_PENDING_HISTORY');
 assert.equal(page.items[0].before.status,'UNRECORDED');
 assert.equal(page.items[0].after.status,'SOURCE_PENDING');
 assert.equal(page.coverage.b07Summary.total.total,4);
 assert.equal(page.coverage.b07Summary.total.unrecorded,2);
 assert.equal(page.coverage.b07Summary.total.sourcePending,1);
 assert.equal(page.coverage.b07Summary.total.documentsPending,1);
 assert.equal(page.coverage.sources.find(s=>s.module==='B07').retained,2);
 assert.equal(page.coverage.b07Summary.payment,false);
 assert.equal(JSON.stringify(f),old);assert.equal(x.writes,before);
 assert.equal(x.store.has('STUDY1_B07_PAYMENTS_V1'),false);
 const forged=JSON.parse(old);
 forged.b07.itemReviews['SIM-001:SINGLE_SESSION'].status='APPROVED';
 assert.throws(()=>ctx.study1B12AuditPage_(forged,b,query(forged,b,{module:'B07'})),/B07/);
 const mismatch=JSON.parse(old);
 mismatch.b07.itemHistory[0].to='PI_REVIEW_PENDING';
 assert.throws(()=>ctx.study1B12AuditPage_(mismatch,b,query(mismatch,b,{module:'B07'})),/B07/);
 const drift=JSON.parse(old);
 drift.b07.itemHistory[0].reason='PI_REVIEW_REQUEST';
 assert.throws(()=>ctx.study1B12AuditPage_(drift,b,query(drift,b,{module:'B07',
  after:page.items[0].id,snapshotHash:page.snapshotHash})),/快照/);
});
