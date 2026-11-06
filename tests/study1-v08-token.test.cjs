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
const equalDigest=(a,b)=>crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const rec={status:'ISSUED',expiresAt:2000,revision:1,applicationId:'SIM-123',experiment:'E1',actions:['MOVE','CANCEL'],tokenSha256:hash(token)};
const input={token,applicationId:'SIM-123',experiment:'E1',action:'MOVE',expectedRevision:1};
const check=(r=rec,i=input,now=1999,eq=equalDigest)=>guard(r,i,now,hash,eq);
test('synthetic capability creates immutable plan without storage side effects',()=>{
 const r=plan(rec,input,1999,hash,equalDigest);
 assert.equal(r.ok,true);assert.equal(r.next.status,'CONSUMED');assert.equal(rec.status,'ISSUED');assert.equal(r.next.revision,2);
});
test('expires at exact boundary',()=>assert.equal(check(rec,input,2000).ok,false));
test('rejects token substitution, application, experiment and action',()=>{
 for(const change of [{token:'b'.repeat(43)},{applicationId:'SIM-124'},{experiment:'E2'},{action:'DELETE'}])
 assert.equal(check(rec,{...input,...change}).ok,false);
});
test('rejects consumed, revoked, invalid revision and malformed hash',()=>{
 for(const change of [{status:'CONSUMED'},{status:'REVOKED'},{revision:0},{tokenSha256:'bad'}])
 assert.equal(check({...rec,...change}).ok,false);
});
test('rejects stale revision to prevent stale plans from being accepted',()=>{
 assert.equal(check(rec,{...input,expectedRevision:2}).ok,false);
 assert.equal(check({...rec,revision:2}).ok,false);
});
test('rejects unsafe revision overflow',()=>{
 const r={...rec,revision:Number.MAX_SAFE_INTEGER};
 assert.equal(plan(r,{...input,expectedRevision:r.revision},1999,hash,equalDigest).ok,false);
});
test('rejects missing constant-time comparator or dishonest comparator return',()=>{
 assert.equal(check(rec,input,1999,null).ok,false);
 assert.equal(check(rec,input,1999,()=>1).ok,false);
});
test('digest mismatch uses injected constant-time comparator',()=>{
 let called=false;
 const result=check(rec,{...input,token:'b'.repeat(43)},1999,(a,b)=>{called=true;return equalDigest(a,b)});
 assert.equal(called,true);assert.equal(result.ok,false);
});
test('no public activation or runtime routes',()=>{
 assert.match(source,/STUDY1_V08_ENABLED_ = false/);
 assert.doesNotMatch(source,/function\s+(?:doGet|doPost|study1UnifiedPreviewCommand)\s*\(/);
});
