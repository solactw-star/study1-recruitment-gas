'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
function harness(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const values=new Map();let writes=0,locks=0;
 const p={getProperty:k=>values.get(k)||null,setProperty:(k,v)=>{if(k!=='STUDY1_SANDBOX_ADMIN_CONFIG_V1')throw Error('Bad property namespace');writes++;values.set(k,v);}};
 const scope={
 Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
 PropertiesService:{getScriptProperties:()=>p},
 LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true},releaseLock:()=>{locks--}})},
 JSON,Number,Object,String,Array,Set,Error
 };
 vm.createContext(scope);vm.runInContext(src,scope);
 return {scope,values,reads:()=>writes,locks:()=>locks};
}
test('Unauthenticated or impersonating callers cannot read or write even if deployer is owner',()=>{
 for(const user of ['', 'visitor@gmail.com','solac.tw@gmail.com.fake']){
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
