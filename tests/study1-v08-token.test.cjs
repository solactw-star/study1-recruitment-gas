const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../gas/Study1V08Token.js'),'utf8');
const ctx=vm.createContext({});vm.runInContext(source,ctx);
const guard=vm.runInContext('study1V08Guard_',ctx);
const plan=vm.runInContext('study1V08ConsumePlan_',ctx);
const token='a'.repeat(43);
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const rec={status:'ISSUED',expiresAt:2000,revision:1,applicationId:'SIM-123',experiment:'E1',actions:['MOVE','CANCEL'],tokenSha256:hash(token)};
const input={token,applicationId:'SIM-123',experiment:'E1',action:'MOVE'};
test('valid synthetic capability produces a plan but no storage side effect',()=>{
 const r=plan(rec,input,1999,hash);assert.equal(r.ok,true);assert.equal(r.next.status,'CONSUMED');assert.equal(rec.status,'ISSUED');assert.equal(r.next.revision,2);
});
test('expires at exact boundary',()=>assert.equal(guard(rec,input,2000,hash).ok,false));
test('rejects substitution, wrong application, experiment and action',()=>{
 for(const change of [{token:'b'.repeat(43)},{applicationId:'SIM-124'},{experiment:'E2'},{action:'DELETE'}])
 assert.equal(guard(rec,{...input,...change},1999,hash).ok,false);
});
test('rejects consumed, revoked, invalid revision and malformed hash',()=>{
 for(const change of [{status:'CONSUMED'},{status:'REVOKED'},{revision:0},{tokenSha256:'bad'}])
 assert.equal(guard({...rec,...change},input,1999,hash).ok,false);
});
test('no public activation or runtime routes',()=>{
 assert.match(source,/STUDY1_V08_ENABLED_ = false/);
 assert.doesNotMatch(source,/function\s+(?:doGet|doPost|study1UnifiedPreviewCommand)\s*\(/);
});
