'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
function harness(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const values=new Map();let writes=0,locks=0;
 const p={getProperty:k=>values.has(k)?values.get(k):null,setProperty:(k,v)=>{if(!['STUDY1_SANDBOX_ADMIN_CONFIG_V1','STUDY1_SANDBOX_SELFTEST_V1'].includes(k))throw Error('Bad property namespace');writes++;values.set(k,v);},deleteProperty:k=>{if(k!=='STUDY1_SANDBOX_SELFTEST_V1')throw Error('Cannot delete real sandbox config');values.delete(k);}};
 const scope={
 Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
 PropertiesService:{getScriptProperties:()=>p},
 LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true},releaseLock:()=>{locks--}})},
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

test('Owner self-test verifies disposable property, stale revision and full cleanup',()=>{
 const h=harness();h.values.set('OPEN','false');h.values.set('CONSENT_READY','false');
 const original=h.values.size;
 const r=h.scope.adminRunSandboxSelfTest();
 assert.equal(r.ok,true);assert.equal(r.cleanupVerified,true);
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
  const h=harness();if(open!==null)h.values.set('OPEN',open);
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
