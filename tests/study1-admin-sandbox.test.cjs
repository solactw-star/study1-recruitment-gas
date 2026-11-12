'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
function harness(active='solac.tw@gmail.com',effective='solac.tw@gmail.com',onDelete=null,defaultClosed=true){
 const values=new Map();let writes=0,locks=0;
 const p={getProperty:k=>values.has(k)?values.get(k):(defaultClosed&&['OPEN','CONSENT_READY'].includes(k)?'false':null),setProperty:(k,v)=>{if(!['STUDY1_SANDBOX_ADMIN_CONFIG_V1','STUDY1_SANDBOX_SELFTEST_V1','STUDY1_CONSENT_DOCUMENT_INDEX_V1','STUDY1_ECONSENT_PRIVATE_V1'].includes(k))throw Error('Bad property namespace');writes++;values.set(k,v);},deleteProperty:k=>{if(k!=='STUDY1_SANDBOX_SELFTEST_V1')throw Error('Cannot delete real sandbox config');values.delete(k);if(onDelete)onDelete(values);}};
 const scope={
 Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
 PropertiesService:{getScriptProperties:()=>p},
 LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true},hasLock:()=>locks>0,releaseLock:()=>{locks--}})},
 JSON,Number,Object,String,Array,Set,Error
 };
 vm.createContext(scope);vm.runInContext(src,scope);
 return {scope,values,reads:()=>writes,locks:()=>locks};
}
test('Mismatched active identities cannot read or write even if deployer is owner',()=>{
 for(const user of ['visitor@gmail.com','solac.tw@gmail.com.fake']){
  const h=harness(user);
  assert.throws(()=>h.scope.adminGetSandboxConfig(),/拒絕存取/);
  assert.throws(()=>h.scope.adminSaveSandboxConfig({},0),/拒絕存取/);
  assert.equal(h.values.size,0);
 }
});
test('Wrong effective deployment principal is rejected',()=>{
 const h=harness('solac.tw@gmail.com','someone@gmail.com');
 assert.throws(()=>h.scope.adminGetSandboxConfig(),/拒絕存取/);
});
test('Owner can read synthetic defaults without writing any live research data',()=>{
 const h=harness();const r=h.scope.adminGetSandboxConfig();
 assert.equal(r.open,false);assert.equal(r.consentReady,false);assert.equal(r.config.revision,0);
 assert.equal(r.config.testSlots[0].location.includes('測試'),true);assert.equal(h.reads(),0);
});
test('Authorized save persists one isolated property, increments revision and protects from stale writes',()=>{
 const h=harness(),before=h.scope.adminGetSandboxConfig();
 const c=JSON.parse(JSON.stringify(before.config));delete c.schemaVersion;delete c.revision;
 c.studyTitle='〔測試〕新版研究介紹';
 const saved=h.scope.adminSaveSandboxConfig(c,0);
 assert.equal(saved.config.revision,1);
 assert.equal(saved.config.studyTitle,c.studyTitle);
 assert.equal(h.values.size,1);
 assert.equal(h.values.has('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),true);
 assert.equal(h.locks(),0);
 assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/其他工作更新/);
});
test('Reject live data fields, raw HTML and oversize fixtures',()=>{
 const h=harness(),c=JSON.parse(JSON.stringify(h.scope.adminGetSandboxConfig().config));
 delete c.schemaVersion;delete c.revision;
 c.OPEN=true;assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/未核准/);delete c.OPEN;
 c.researchIntro='<iframe>';assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/HTML/);
 c.researchIntro='合法測試';c.screeningQuestions=[{id:'test_q1',text:'測試',required:true},{id:'test_q1',text:'重複',required:true}];
 assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/重複/);
 assert.equal(h.values.size,0);
});

test('Redacted active email denies every admin RPC even when effective user is the owner',()=>{
 const h=harness('', 'solac.tw@gmail.com');
 assert.throws(()=>h.scope.adminGetSandboxConfig(),/拒絕存取/);
 assert.throws(()=>h.scope.adminValidateSandboxConfig({}),/拒絕存取/);
 assert.throws(()=>h.scope.adminSaveSandboxConfig({},0),/拒絕存取/);
 assert.equal(h.reads(),0);assert.equal(h.values.size,0);
});
test('No active email plus a non-owner effective identity always fails closed',()=>{
 for(const user of ['', 'other@example.com']){
   const h=harness('',user);
   assert.throws(()=>h.scope.adminGetSandboxConfig(),/拒絕存取/);
   assert.throws(()=>h.scope.adminSaveSandboxConfig({},0),/拒絕存取/);
   assert.equal(h.values.size,0);
 }
});


test('Server rejects impossible calendar dates, invalid clock time and empty sandbox labels',()=>{
 const h=harness();const c=JSON.parse(JSON.stringify(h.scope.adminGetSandboxConfig().config));
 delete c.schemaVersion;delete c.revision;
 for(const invalid of ['2027-02-29T10:00','2028-02-30T10:00','2027-13-01T10:00',
                       '2027-00-01T10:00','2027-01-00T10:00','2027-01-01T24:00',
                       '2027-01-01T10:60','1999-12-31T23:59','2101-01-01T00:00']){
   c.testSlots[0].start=invalid;
   assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/時段格式錯誤/,invalid);
 }
 c.testSlots[0].start='2028-02-29T23:59';
 c.testSlots[0].location='   ';
 assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/時段格式錯誤/);
 c.testSlots[0].location='〔測試〕研究室 A';
 c.screeningQuestions[0].text='   ';
 assert.throws(()=>h.scope.adminSaveSandboxConfig(c,0),/資格問題格式錯誤/);
 assert.equal(h.values.size,0);
 c.screeningQuestions[0].text='〔測試〕閱讀研究說明';
 const result=h.scope.adminSaveSandboxConfig(c,0);
 assert.equal(result.config.testSlots[0].start,'2028-02-29T23:59');
 assert.equal(result.config.revision,1);
 assert.equal(h.values.size,1);
});

test('Owner may validate an unsaved draft without writing or incrementing revision',()=>{
 const h=harness(),draft=JSON.parse(JSON.stringify(h.scope.adminGetSandboxConfig().config));
 delete draft.schemaVersion;delete draft.revision;
 draft.studyTitle='〔測試〕僅驗證';
 const result=h.scope.adminValidateSandboxConfig(draft);
 assert.equal(result.mode,'SANDBOX_ONLY');
 assert.equal(result.open,false);assert.equal(result.consentReady,false);
 assert.equal(result.config.studyTitle,draft.studyTitle);
 assert.equal(h.values.size,0);assert.equal(h.reads(),0);assert.equal(h.locks(),0);
 draft.testSlots[0].start='2027-02-30T10:00';
 assert.throws(()=>h.scope.adminValidateSandboxConfig(draft),/時段格式錯誤/);
 assert.equal(h.values.size,0);
});
test('Unsaved validation rejects non-owner sessions before reading data',()=>{
 const h=harness('visitor@example.com','solac.tw@gmail.com');
 assert.throws(()=>h.scope.adminValidateSandboxConfig({}),/拒絕存取/);
 assert.equal(h.values.size,0);
});

test('Admin config read, draft validation and save fail closed if runtime flags are missing or enabled',()=>{
 for(const mode of ['missing','open','consent']){
  const h=harness('solac.tw@gmail.com','solac.tw@gmail.com',null,mode!=='missing');
  if(mode==='open')h.values.set('OPEN','true');
  if(mode==='consent')h.values.set('CONSENT_READY','true');
  const before=JSON.stringify([...h.values]);
  assert.throws(()=>h.scope.adminGetSandboxConfig(),/關閉旗標/,mode);
  assert.throws(()=>h.scope.adminValidateSandboxConfig({}),/關閉旗標/,mode);
  assert.throws(()=>h.scope.adminSaveSandboxConfig({},0),/關閉旗標/,mode);
  assert.equal(JSON.stringify([...h.values]),before,mode);
  assert.equal(h.reads(),0,mode);assert.equal(h.locks(),0,mode);
 }
});

test('Owner self-test verifies disposable property, stale revision and full cleanup',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 const original=h.values.size;
 const r=h.scope.adminRunSandboxSelfTest();
 assert.equal(r.ok,true);assert.equal(r.cleanupVerified,true);
 assert.equal(r.postCleanupVerified,true);
 assert.equal(r.open,false);assert.equal(r.consentReady,false);
 assert.equal(r.checks.length,8);assert.equal(h.values.size,original);assert.equal(h.locks(),0);
 assert.equal(h.values.get('OPEN'),'false');assert.equal(h.values.get('CONSENT_READY'),'false');
});
test('Preexisting test key is never overwritten or deleted',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 h.values.set('STUDY1_SANDBOX_SELFTEST_V1','KEEP');
 assert.throws(()=>h.scope.adminRunSandboxSelfTest(),/已存在/);
 assert.equal(h.values.get('STUDY1_SANDBOX_SELFTEST_V1'),'KEEP');
 assert.equal(h.locks(),0);
});
test('Non-owner session cannot run the self-test or write any property',()=>{
 const h=harness('','solac.tw@gmail.com');
 assert.throws(()=>h.scope.adminRunSandboxSelfTest(),/拒絕存取/);
 assert.equal(h.values.size,0);
});
test('Self-test does not mutate a previously saved real sandbox configuration',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 const orig=h.scope.adminGetSandboxConfig();
 const input=JSON.parse(JSON.stringify(orig.config));delete input.schemaVersion;delete input.revision;
 h.scope.adminSaveSandboxConfig(input,0);
 const before=h.values.get('STUDY1_SANDBOX_ADMIN_CONFIG_V1');
 const r=h.scope.adminRunSandboxSelfTest();
 assert.equal(r.mainRevision,1);
 assert.equal(h.values.get('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),before);
 assert.equal(h.values.size,3);
});

test('Self-test refuses missing or enabled OPEN/CONSENT_READY without creating disposable data',()=>{
 for(const [open,consent] of [[null,null],['true','false'],['false','true'],['false',null]]){
  const h=harness('solac.tw@gmail.com','solac.tw@gmail.com',null,false);
  if(open!==null)h.values.set('OPEN',open);
  if(consent!==null)h.values.set('CONSENT_READY',consent);
  const before=new Map(h.values);
  assert.throws(()=>h.scope.adminRunSandboxSelfTest(),/關閉旗標未確認/);
  assert.deepEqual([...h.values],[...before]);
  assert.equal(h.locks(),0);
  assert.equal(h.values.has('STUDY1_SANDBOX_SELFTEST_V1'),false);
 }
});

test('Owner live-shaped self-test runs isolated booking lifecycle, idempotency and cap checks',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 const real={schemaVersion:1,revision:1,bookings:[{code:'TST-009',slotId:'test_slot_1',status:'ACTIVE'}],
  requests:[{requestId:'REQ-existing01',fingerprint:JSON.stringify(['CREATE','TST-009','test_slot_1'])}]};
 h.values.set('STUDY1_SANDBOX_BOOKINGS_V1',JSON.stringify(real));
 const before=JSON.stringify([...h.values]);
 const r=h.scope.adminRunSandboxSelfTest();
 assert.equal(r.ok,true);assert.equal(r.bookingE2eVerified,true);
 assert.equal(r.bookingsUnchanged,true);
 assert.equal(r.bookingChecks.length,6);
 assert.match(r.bookingChecks.join(' | '),/建立虛構預約/);
 assert.match(r.bookingChecks.join(' | '),/冪等/);
 assert.match(r.bookingChecks.join(' | '),/額滿/);
 assert.match(r.bookingChecks.join(' | '),/改期/);
 assert.match(r.bookingChecks.join(' | '),/取消/);
 assert.equal(r.cleanupVerified,true);
 assert.equal(JSON.stringify([...h.values]),before,'Real sandbox booking property must be untouched');
 assert.equal(h.values.has('STUDY1_SANDBOX_SELFTEST_V1'),false);
 assert.equal(h.locks(),0);
});

test('Owner self-test fails closed on a corrupt existing sandbox booking ledger before writing a disposable key',()=>{
 const booking=(code,slotId)=>({code,slotId,status:'ACTIVE'});
 const request=(id,code,slotId)=>({requestId:id,fingerprint:JSON.stringify(['CREATE',code,slotId])});
 const cases=[
  {name:'orphan ACTIVE reservation',state:{schemaVersion:1,revision:1,
    bookings:[booking('TST-101','test_slot_8')],
    requests:[request('REQ-orphan001','TST-101','test_slot_8')]},error:/對應時段不存在/},
  {name:'preexisting over-capacity reservations',state:{schemaVersion:1,revision:3,
    bookings:[booking('TST-101','test_slot_1'),booking('TST-102','test_slot_1'),booking('TST-103','test_slot_1')],
    requests:[request('REQ-overcap01','TST-101','test_slot_1'),
      request('REQ-overcap02','TST-102','test_slot_1'),
      request('REQ-overcap03','TST-103','test_slot_1')]},error:/超過時段容量/},
  {name:'revision/request drift',state:{schemaVersion:1,revision:2,
    bookings:[booking('TST-101','test_slot_1')],
    requests:[request('REQ-revdrift1','TST-101','test_slot_1')]},error:/版本與請求歷史不一致/}
 ];
 for(const scenario of cases){
  const h=harness();
  h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
  h.values.set('STUDY1_SANDBOX_BOOKINGS_V1',JSON.stringify(scenario.state));
  const before=JSON.stringify([...h.values]);
  assert.throws(()=>h.scope.adminRunSandboxSelfTest(),scenario.error,scenario.name);
  assert.equal(JSON.stringify([...h.values]),before,scenario.name);
  assert.equal(h.values.has('STUDY1_SANDBOX_SELFTEST_V1'),false,scenario.name);
  assert.equal(h.reads(),0,scenario.name);
  assert.equal(h.locks(),0,scenario.name);
 }
});

test('Owner self-test never reports PASS when disposal changes protected state',()=>{
 const scenarios=[
  {name:'OPEN flag',mutate:values=>values.set('OPEN','true'),expected:/清理後正式收件旗標/},
  {name:'admin config',mutate:values=>values.set('STUDY1_SANDBOX_ADMIN_CONFIG_V1','CORRUPT'),expected:/清理後原設定/},
  {name:'real test bookings',mutate:values=>values.set('STUDY1_SANDBOX_BOOKINGS_V1','CORRUPT'),expected:/清理後原預約資料/}
 ];
 for(const scenario of scenarios){
  const h=harness('solac.tw@gmail.com','solac.tw@gmail.com',scenario.mutate);
  h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
  assert.throws(()=>h.scope.adminRunSandboxSelfTest(),scenario.expected,scenario.name);
  assert.equal(h.values.has('STUDY1_SANDBOX_SELFTEST_V1'),false,scenario.name);
  assert.equal(h.locks(),0,scenario.name);
 }
});
test('Owner self-test refuses same-length but mismatched synthetic booking history before any writes',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 const record={schemaVersion:1,revision:1,
  bookings:[{code:'TST-001',slotId:'test_slot_1',status:'ACTIVE'}],
  requests:[{requestId:'REQ-mismatch01',fingerprint:JSON.stringify(['CREATE','TST-002','test_slot_1'])}]};
 h.values.set('STUDY1_SANDBOX_BOOKINGS_V1',JSON.stringify(record));
 const before=JSON.stringify([...h.values]);
 assert.throws(()=>h.scope.adminRunSandboxSelfTest(),/狀態與請求歷史不一致/);
 assert.equal(JSON.stringify([...h.values]),before);
 assert.equal(h.values.has('STUDY1_SANDBOX_SELFTEST_V1'),false);
 assert.equal(h.locks(),0);
});

test('P0 consent originals: only owner may upload PDF, versions are immutable, explicit selection has revision CAS',()=>{
 const crypto=require('node:crypto'),h=harness(),files=[],privateAccess='PRIVATE';
 const pdf=Buffer.from('%PDF-1.7\n'+'a'.repeat(220)+'\n%%EOF','utf8');
 let serial=0,access=privateAccess;
 h.scope.Utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},
  base64Decode:s=>Array.from(Buffer.from(s,'base64')),
  newBlob:(bytes,mime,name)=>({bytes,mime,name}),
  computeDigest:(_,bytes)=>Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest())
 };
 h.scope.DriveApp={
  Access:{PRIVATE:privateAccess},Permission:{VIEW:'VIEW'},
  getFolderById:id=>{
   assert.equal(id,'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU');
   return {getSharingAccess:()=>access,createFile:blob=>{
    const entry={blob,trashed:false,sharing:'SHARED',id:'pdfstoredowner'+String(++serial).padStart(20,'0')};
    const file={
     setSharing:(a,p)=>{assert.equal(p,'VIEW');entry.sharing=a},
     getSharingAccess:()=>entry.sharing,getSize:()=>blob.bytes.length,
     getMimeType:()=>blob.mime,
     getParents:()=>{let used=false;return {hasNext:()=>!used,
      next:()=>{used=true;return {getId:()=> '1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU'};}};},
     getBlob:()=>({getBytes:()=>[...blob.bytes]}),
     getUrl:()=> 'https://drive.google.com/file/d/'+entry.id+'/view',
     getId:()=>entry.id,setTrashed:v=>{entry.trashed=v}
    };
    entry.file=file;files.push(entry);return file;
   }};
  },
  getFileById:id=>{
   const match=files.find(x=>x.id===id);
   if(!match)throw Error('Synthetic PDF not found');
   return match.file;
  }
 };
 const make=(version,expectedRevision)=>({base64:pdf.toString('base64'),
  expectedRevision,experiment:'E1',researcherPresigned:true,
  title:'空白研究知情同意書',version});
 assert.equal(h.scope.study1ConsentVersionList().documents.length,0);
 const first=h.scope.study1ConsentVersionUpload(make('v1',0));
 assert.equal(first.revision,1);assert.equal(first.documents.length,1);
 assert.equal(first.current.E1,null);
 assert.equal(files.length,1);assert.equal(files[0].trashed,false);
 assert.equal(first.documents[0].sha256,crypto.createHash('sha256').update(pdf).digest('hex'));
 assert.throws(()=>h.scope.study1ConsentVersionUpload(make('v1',1)),/已存在/);
 assert.throws(()=>h.scope.study1ConsentVersionUpload(make('v2',0)),/其他分頁變更/);
 assert.equal(files.length,1,'duplicate/stale version cannot create Drive files');
 const selected=h.scope.study1ConsentVersionSelect({id:first.documents[0].id,expectedRevision:1});
 assert.equal(selected.revision,2);assert.equal(selected.current.E1,first.documents[0].id);
 const second=h.scope.study1ConsentVersionUpload(make('v2',2));
 assert.equal(second.documents.length,2);assert.equal(second.current.E1,first.documents[0].id);
 assert.equal(files.length,2);assert.equal(files[0].trashed,false,'original PDF preserved');
 assert.throws(()=>h.scope.study1ConsentVersionSelect({id:second.documents[1].id,expectedRevision:2}),/衝突/);
 const switched=h.scope.study1ConsentVersionSelect({id:second.documents[1].id,expectedRevision:3});
 assert.equal(switched.current.E1,second.documents[1].id);
 assert.equal(switched.documents[0].sha256,first.documents[0].sha256);
 // A legacy E1 PDF without researcher pre-sign attestation cannot be selected.
 const unsigned={...switched,documents:switched.documents.map((d,i)=>
  i===1?{...d,researcherPresigned:false}:d)};
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(unsigned));
 assert.throws(()=>h.scope.study1ConsentVersionSelect({id:second.documents[1].id,
  expectedRevision:4}),/E1_RESEARCHER_PRESIGNED_PDF_REQUIRED/);
 access='PUBLIC';
 assert.throws(()=>h.scope.study1ConsentVersionUpload(make('v3',4)),/不是私人權限/);
 assert.equal(files.length,2,'unsafe folder must never receive a PDF');
 assert.equal(h.locks(),0);
});
test('P0 consent registry refuses spoofed owner, malicious HTML and non-PDF bytes without any Drive write',()=>{
 const h=harness('', 'solac.tw@gmail.com');
 assert.throws(()=>h.scope.study1ConsentVersionList(),/拒絕存取/);
 assert.throws(()=>h.scope.study1ConsentVersionUpload({}),/拒絕存取/);
 assert.throws(()=>h.scope.study1ConsentVersionSelect({}),/拒絕存取/);
 assert.equal(h.values.size,0);
 const owner=harness();
 owner.scope.Utilities={base64Decode:v=>Array.from(Buffer.from(v,'base64'))};
 const base={experiment:'E1',title:'合法空白同意書',version:'v1',expectedRevision:0,
  base64:Buffer.from('NOT_PDF'+'x'.repeat(180)).toString('base64')};
 assert.throws(()=>owner.scope.study1ConsentVersionUpload(base),/只能上傳/);
 assert.throws(()=>owner.scope.study1ConsentVersionUpload({...base,title:'<script>'}),/符合規格/);
 assert.equal(owner.values.size,0);
});


test('P0 official consent PDF: OWNER publication is explicit, SHA-verified, independent from selection, original remains private, and public read is bounded',()=>{
 const crypto=require('node:crypto'),h=harness(),docs=new Map(),privateAccess='PRIVATE';
 const content=Buffer.from('%PDF-1.7\n% Study1 blank official consent document\n'+ 'x'.repeat(320)+'\n%%EOF','utf8');
 let serial=0,folderAccess=privateAccess;
 const folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 const signedBytes=bytes=>Array.from(bytes).map(x=>x>127?x-256:x);
 h.scope.Utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},
  base64Decode:x=>signedBytes(Buffer.from(x,'base64')),
  base64Encode:bytes=>Buffer.from(bytes.map(x=>x&255)).toString('base64'),
  newBlob:(bytes,mime,name)=>({bytes,mime,name}),
  computeDigest:(_,bytes)=>signedBytes(crypto.createHash('sha256').update(Buffer.from(bytes.map(x=>x&255))).digest())
 };
 const folder={getId:()=>folderId,getSharingAccess:()=>folderAccess,createFile:blob=>{
  const id='consentOwnerPdfStoredFile'+String(++serial).padStart(20,'0');
  const record={id,bytes:[...blob.bytes],sharing:privateAccess,parent:folderId,mime:'application/pdf'};
  docs.set(id,record);
  return makeFile(record);
 }};
 function makeFile(record){return {
  setSharing:(access,perm)=>{assert.equal(perm,'VIEW');record.sharing=access},
  getSharingAccess:()=>record.sharing,
  getMimeType:()=>record.mime,
  getSize:()=>record.bytes.length,
  getId:()=>record.id,
  getUrl:()=> 'https://drive.google.com/file/d/'+record.id+'/view',
  getParents:()=>{let used=false;return {hasNext:()=>!used,next:()=>{used=true;return {getId:()=>record.parent}}}},
  getBlob:()=>({getBytes:()=>[...record.bytes]})
 }};
 h.scope.DriveApp={
  Access:{PRIVATE:privateAccess},Permission:{VIEW:'VIEW'},
  getFolderById:id=>{assert.equal(id,folderId);return folder},
  getFileById:id=>{assert.ok(docs.has(id),'unreviewed Drive file');return makeFile(docs.get(id))}
 };
 const submit=(version,expectedRevision)=>({base64:content.toString('base64'),
  expectedRevision,experiment:'E1',researcherPresigned:true,
  title:'研究參與者知情同意書',version});
 assert.equal(h.scope.study1ConsentPublicRead_('E1').available,false);
 const uploaded=h.scope.study1ConsentVersionUpload(submit('v1',0));
 assert.deepEqual(JSON.parse(JSON.stringify(uploaded.published)),{E1:null,E2:null});
 const id=uploaded.documents[0].id,sha=uploaded.documents[0].sha256;
 assert.equal(h.scope.study1ConsentPublicRead_('E1').available,false,'upload never auto-publishes');
 const selected=h.scope.study1ConsentVersionSelect({id,expectedRevision:1});
 assert.equal(selected.current.E1,id);
 assert.equal(h.scope.study1ConsentPublicRead_('E1').available,false,'selection never auto-publishes');
 const pub={experiment:'E1',id,confirmSha256:sha,expectedRevision:2};
 assert.throws(()=>h.scope.study1ConsentVersionPublication({...pub,confirmSha256:'0'.repeat(64)}),/SHA/);
 assert.throws(()=>h.scope.study1ConsentVersionPublication({...pub,expectedRevision:1}),/已更新/);
 const publicIndex=h.scope.study1ConsentVersionPublication(pub);
 assert.equal(publicIndex.revision,3);assert.equal(publicIndex.published.E1,id);
 const document=h.scope.study1ConsentPublicRead_('E1');
 assert.equal(document.available,true);
 assert.deepEqual(Object.keys(document).sort(),['available','base64','bytes','experiment','mime','sha256','title','version'].sort());
 assert.equal(Buffer.from(document.base64,'base64').toString('hex'),content.toString('hex'));
 assert.equal(document.sha256,sha);assert.equal(document.version,'v1');
 assert.equal(docs.get(id).sharing,privateAccess);
 const v2=h.scope.study1ConsentVersionUpload(submit('v2',3));
 assert.equal(v2.published.E1,id,'upload must not replace public document');
 const changed=h.scope.study1ConsentVersionSelect({id:v2.documents[1].id,expectedRevision:4});
 assert.equal(changed.published.E1,id,'staff selection remains separate from public document');
 assert.equal(h.scope.study1ConsentPublicRead_('E1').version,'v1');
 assert.throws(()=>h.scope.study1ConsentVersionPublication({
  experiment:'E1',id:v2.documents[1].id,confirmSha256:v2.documents[1].sha256,expectedRevision:4
 }),/已更新/);
 const revoked=h.scope.study1ConsentVersionPublication({experiment:'E1',id:null,
  confirmSha256:'',expectedRevision:5});
 assert.equal(revoked.published.E1,null);
 assert.equal(h.scope.study1ConsentPublicRead_('E1').available,false);
 assert.equal(docs.get(id).sharing,privateAccess);
 // A same-version selection must reverify the private source bytes and SHA.
 const currentlySelected=changed.current.E1;
 docs.get(currentlySelected).bytes[32]^=1;
 assert.throws(()=>h.scope.study1ConsentVersionSelect({id:currentlySelected,
  expectedRevision:6}),/雜湊已改變/);
 assert.equal(h.scope.study1ConsentVersionRead_().revision,6);
 assert.throws(()=>h.scope.study1ConsentPublicRead_('X1'),/不合法/);
 assert.equal(h.locks(),0);
});
test('P0 full-consent source fails closed if private PDF bytes, path or sharing changed; anonymous visitor cannot publish',()=>{
 const h=harness(),pdf=Buffer.from('%PDF-1.7\n'+'a'.repeat(260)+'\n%%EOF');
 const crypto=require('node:crypto');
 const sha=crypto.createHash('sha256').update(pdf).digest('hex');
 const id='blankConsentSourceFile01234567890';
 const entry={experiment:'E1',id,title:'同意書完整原版',version:'v1',sha256:sha,bytes:pdf.length,
  url:'https://drive.google.com/file/d/'+id+'/view',at:new Date().toISOString()};
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({
  schemaVersion:1,revision:2,documents:[entry],current:{E1:id,E2:null},published:{E1:id,E2:null}
 }));
 let access='PRIVATE',parent='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU',raw=[...pdf];
 h.scope.DriveApp={Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},
  getFolderById:()=>({getSharingAccess:()=>access}),
  getFileById:key=>{assert.equal(key,id);return {
   getSharingAccess:()=>access,getMimeType:()=> 'application/pdf',getSize:()=>pdf.length,
   getParents:()=>{let next=true;return {hasNext:()=>next,next:()=>{next=false;return {getId:()=>parent}}}},
   getBlob:()=>({getBytes:()=>raw})
  }}
 };
 h.scope.Utilities={DigestAlgorithm:{SHA_256:'SHA_256'},
  computeDigest:(_,bytes)=>[...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()],
  base64Encode:bytes=>Buffer.from(bytes).toString('base64')};
 assert.equal(h.scope.study1ConsentPublicRead_('E1').available,true);
 raw=[...pdf];raw[44]=raw[44]^1;
 assert.throws(()=>h.scope.study1ConsentPublicRead_('E1'),/雜湊/);
 raw=[...pdf];parent='another-private-folder';
 assert.throws(()=>h.scope.study1ConsentPublicRead_('E1'),/指定私人資料夾/);
 parent='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';access='PUBLIC';
 assert.throws(()=>h.scope.study1ConsentPublicRead_('E1'),/權限/);
 const anon=harness('visitor@gmail.com','solac.tw@gmail.com');
 assert.throws(()=>anon.scope.study1ConsentVersionPublication({}),/拒絕存取/);
 assert.throws(()=>anon.scope.study1ConsentVersionUpload({}),/拒絕存取/);
 assert.throws(()=>anon.scope.study1ConsentVersionSelect({}),/拒絕存取/);
 assert.equal(anon.values.size,0);
});


test('P0 formal e-consent: closed owner/public refuses any invitation or signature and never touches PII',()=>{
 const h=harness(),fake='01234567-89ab-cdef-0123-456789abcdef';
 h.scope.Utilities={DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(alg,value)=>[...require('node:crypto').createHash('sha256').update(value).digest()]};
 assert.deepEqual(JSON.parse(JSON.stringify(h.scope.study1EConsentAvailability())),{enabled:false});
 assert.throws(()=>h.scope.study1EConsentIssue({experiment:'E1'}),/尚未開放/);
 assert.throws(()=>h.scope.study1EConsentSign({}),/尚未開放/);
 assert.throws(()=>h.scope.study1EConsentSession(fake+'-'+fake),/邀請|尚未開放|無效/);
 const anon=harness('another@gmail.com','solac.tw@gmail.com');
 assert.throws(()=>anon.scope.study1EConsentIssue({experiment:'E1'}),/拒絕存取/);
 assert.throws(()=>anon.scope.study1EConsentConfirm({}),/拒絕存取/);
 assert.throws(()=>anon.scope.study1EConsentOwnerList(),/拒絕存取/);
 assert.throws(()=>anon.scope.study1EConsentOwnerWithdraw({}),/拒絕存取/);
 assert.equal(h.values.size,0);
 assert.equal(anon.values.size,0);
});
test('P0 formal e-consent owner-verified one-time private invitation, Q&A, signature, countersign, copy, withdrawal and evidence SHA',()=>{
 const crypto=require('node:crypto');
 const h=harness(),pdf=Buffer.from('%PDF-1.7\n'+'a'.repeat(240)+'\n%%EOF'),privateAccess='PRIVATE';
 const docId='sourceBlankPdfOwnerDocumentId001',files=new Map();
 const pdfSha=crypto.createHash('sha256').update(pdf).digest('hex');
 const bin=x=>typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x.map(v=>v&255));
 let serial=0;
 const uuid=()=>String(++serial).padStart(8,'0')+'-0000-0000-0000-000000000000';
 function file(id,bytes,mime){
  const item={id,bytes:bin(bytes),mime,access:privateAccess,trashed:false};
  files.set(id,item);
  return {
   getId:()=>id,getMimeType:()=>item.mime,getSize:()=>item.bytes.length,
   getSharingAccess:()=>item.access,
   setSharing:(a,p)=>{assert.equal(p,'VIEW');item.access=a},
   setTrashed:v=>{item.trashed=v},
   getParents:()=>{let first=true;return {hasNext:()=>first,next:()=>{first=false;
    return {getId:()=> '1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU'}}}},
   getBlob:()=>({getBytes:()=>[...item.bytes],getDataAsString:()=>item.bytes.toString('utf8')})
  };
 }
 file(docId,pdf,'application/pdf');
 h.scope.DriveApp={
  Access:{PRIVATE:privateAccess},Permission:{VIEW:'VIEW'},
  getFolderById:id=>{
   assert.equal(id,'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU');
   return {getSharingAccess:()=>privateAccess,
    createFile:blob=>file('privateEvidenceFileId'+String(++serial).padStart(20,'0'),blob.bytes,blob.mime)};
  },
  getFileById:id=>{
   assert.ok(files.has(id),'unknown evidence file');
   const x=files.get(id);
   return {
    getId:()=>id,getMimeType:()=>x.mime,getSize:()=>x.bytes.length,
    getSharingAccess:()=>x.access,
    getBlob:()=>({getBytes:()=>[...x.bytes],getDataAsString:()=>x.bytes.toString('utf8')}),
    getParents:()=>{let first=true;return {hasNext:()=>first,next:()=>{
     first=false;return {getId:()=> '1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU'}}}}
   };
  }
 };
 h.scope.Utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},getUuid:uuid,
  computeDigest:(alg,value)=>{
   assert.equal(alg,'SHA_256');
   return [...crypto.createHash('sha256').update(bin(value)).digest()];
  },
  base64Decode:text=>[...Buffer.from(text,'base64')],
  newBlob:(value,mime='application/octet-stream',name='')=>({
   bytes:bin(value),mime,name,getBytes(){return [...this.bytes]}
  })
 };
 const doc={experiment:'E1',id:docId,title:'空白研究同意書',
  version:'E1-v1',sha256:pdfSha,bytes:pdf.length,
  url:'https://drive.google.com/file/d/'+docId+'/view',at:new Date().toISOString()};
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({
  schemaVersion:1,revision:2,documents:[doc],
  current:{E1:docId,E2:null},published:{E1:docId,E2:null}
 }));
 h.values.set('OPEN','true');h.values.set('CONSENT_READY','true');
 h.values.set('STUDY1_ECONSENT_PROVIDER_VERIFIED','true');
 // Synthetic-only compatibility path; never available to production participants.
 h.values.set('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY','true');
 assert.equal(h.scope.study1EConsentAvailability().enabled,true);
 assert.throws(()=>h.scope.study1EConsentIssue({experiment:'E2'}),/實驗二尚未/);
 const issued=h.scope.study1EConsentIssue({experiment:'E1'});
 assert.equal(issued.version,'E1-v1');assert.equal(issued.sha256,pdfSha);
 assert.equal(h.scope.study1EConsentSession(issued.token).state,'ISSUED');
 const explained=h.scope.study1EConsentExplain({
  id:issued.id,question:'研究資料將保存多久？',
  answer:'已按原版全文說明保存政策與退出管道。',resolved:true
 });
 assert.equal(explained.state,'EXPLAINED');
 const session=h.scope.study1EConsentSession(issued.token);
 assert.equal(session.explanation.answer,'已按原版全文說明保存政策與退出管道。');
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(180,17)]);
 const signature={token:issued.token,name:'合成參與者',signature:png.toString('base64'),
  documentSha:pdfSha,read:true,answerAcknowledged:true,agree:true};
 assert.throws(()=>h.scope.study1EConsentSign({...signature,documentSha:'0'.repeat(64)}),/版本/);
 assert.equal(h.scope.study1EConsentSign(signature).state,'SIGNED');
 assert.throws(()=>h.scope.study1EConsentSign(signature),/失效/);
 assert.throws(()=>h.scope.study1EConsentCopy(issued.token),/尚未完成/);
 const confirmed=h.scope.study1EConsentConfirm({id:issued.id,
  identityVerified:true,notes:'已當面核對本人與原簽名'});
 assert.equal(confirmed.state,'CONFIRMED');
 const copy=h.scope.study1EConsentCopy(issued.token);
 assert.equal(copy.participant,'合成參與者');assert.equal(copy.documentSha256,pdfSha);
 assert.equal(copy.signaturePngBase64,signature.signature);
 assert.equal(copy.state,'CONFIRMED');
 const privateFiles=[...files.values()].filter(x=>x.mime==='application/json');
 assert.equal(privateFiles.length,3);
 assert.ok(privateFiles.every(x=>x.access===privateAccess&&!x.trashed));
 assert.equal(h.scope.study1EConsentWithdraw({token:issued.token,reason:'本人要求退出研究'}).state,'WITHDRAWN');
 assert.equal(h.scope.study1EConsentCopy(issued.token).state,'WITHDRAWN');
 assert.throws(()=>h.scope.study1EConsentWithdraw({token:issued.token,reason:'本人要求退出研究'}),/重複撤回/);
 assert.equal(files.size,5,'original PDF plus four independently sealed events');
 assert.equal(h.scope.study1EConsentOwnerList().records[0].state,'WITHDRAWN');
 assert.equal(h.locks(),0);
});
