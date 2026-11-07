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

const atomic=vm.runInContext('study1V08ConsumeAtomic_',ctx);
function storeAdapter(options={}) {
 let current={...rec};
 let writes=0,clockReads=0;
 const adapter={
  hash,equalDigest,
  trustedNow:()=>{
   clockReads++;
   if(options.clockThrows)throw Error('clock unavailable');
   return typeof options.clock==='function'?options.clock(clockReads):
    Object.hasOwn(options,'clock')?options.clock:1999;
  },
  withExclusiveLock:fn=>fn(),
  read:()=>options.badReadback && writes ? null : {...current},
  compareAndSwap:(_id,expected,next)=>{
   if(options.conflict || current.revision!==expected) return false;
   current={...next};writes++;
   if(options.mutateWriteActions)next.actions[0]='DELETE';
   if(options.throwAfterWrite) throw Error('transport lost');
   if(options.falseAfterWrite) return false;
   return true;
  }
 };
 return {adapter,get:()=>({...current}),writes:()=>writes,clockReads:()=>clockReads};
}
test('atomic synthetic consumption commits once and readback confirms',()=>{
 const s=storeAdapter();
 assert.equal(atomic(input,1999,s.adapter).ok,true);
 assert.equal(s.get().status,'CONSUMED');
 assert.equal(atomic(input,1999,s.adapter).ok,false);
 assert.equal(s.writes(),1);
});
test('atomic adapter rejects missing lock and CAS without writes',()=>{
 const s=storeAdapter();
 delete s.adapter.withExclusiveLock;
 assert.equal(atomic(input,1999,s.adapter).reason,'ADAPTER_UNAVAILABLE');
 assert.equal(s.writes(),0);
});
test('atomic CAS conflict does not consume or retry',()=>{
 const s=storeAdapter({conflict:true});
 assert.equal(atomic(input,1999,s.adapter).reason,'CONFLICT_OR_UNKNOWN');
 assert.equal(s.get().status,'ISSUED');
 assert.equal(s.writes(),0);
});
test('atomic ambiguous after-write failure is UNKNOWN and never retries',()=>{
 const s=storeAdapter({throwAfterWrite:true});
 assert.equal(atomic(input,1999,s.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(s.get().status,'CONSUMED');
 assert.equal(s.writes(),1);
});
test('atomic missing readback never acknowledges success',()=>{
 const s=storeAdapter({badReadback:true});
 assert.equal(atomic(input,1999,s.adapter).reason,'UNKNOWN_READBACK');
 assert.equal(s.writes(),1);
});
test('atomic expired capability fails before CAS',()=>{
 const s=storeAdapter();
 assert.equal(atomic(input,2000,s.adapter).ok,false);
 assert.equal(s.writes(),0);
});

test('atomic lock provider failure is fail-closed and never writes',()=>{
 const s=storeAdapter();
 s.adapter.withExclusiveLock=()=>{throw Error('lock unavailable')};
 assert.equal(atomic(input,1999,s.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(s.writes(),0);
});
test('atomic CAS false after uncertain commit is not retried or acknowledged',()=>{
 const s=storeAdapter();
 s.adapter.compareAndSwap=(_id,_expected,next)=>{s.adapter._committed=next;return false};
 const result=atomic(input,1999,s.adapter);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'CONFLICT_OR_UNKNOWN');
});
test('atomic storage read failure before write is fail-closed',()=>{
 const s=storeAdapter();
 s.adapter.read=()=>{throw Error('storage unavailable')};
 assert.equal(atomic(input,1999,s.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(s.writes(),0);
});

test('atomic lock provider silently skips callback: fail closed',()=>{
 const st=storeAdapter();
 st.adapter.withExclusiveLock=()=>undefined;
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(st.writes(),0);
});
test('atomic readback detects altered authorization actions and expiry',()=>{
 for(const change of [{actions:['CANCEL']},{expiresAt:9999}]){
  const st=storeAdapter();
  const original=st.adapter.read;
  st.adapter.read=()=>{const value=original();return st.writes()?{...value,...change}:value};
  assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_READBACK');
  assert.equal(st.writes(),1);
 }
});

test('atomic rejects forged lock success without invoking callback or trusted clock',()=>{
 const st=storeAdapter();
 st.adapter.withExclusiveLock=()=>({ok:true,status:'CONSUMED',revision:2});
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(st.clockReads(),0,'trusted clock may be sampled only inside a real invoked callback');
 assert.equal(st.writes(),0);
});
test('atomic rejects a lock provider invoking callback twice',()=>{
 const st=storeAdapter();
 st.adapter.withExclusiveLock=fn=>{const first=fn();fn();return first};
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(st.writes(),1);
});
test('atomic rejects lock provider substituting a fabricated success',()=>{
 const st=storeAdapter();
 st.adapter.withExclusiveLock=fn=>{fn();return {ok:true,status:'CONSUMED',revision:2}};
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(st.writes(),1);
});

test('rejects malformed duplicate or privilege-expanded capability scopes before CAS',()=>{
 for(const actions of [['MOVE','MOVE'],['MOVE','DELETE'],['MOVE','CANCEL','MOVE'],[]]){
  const r={...rec,actions};
  assert.equal(guard(r,input,1999,hash,equalDigest).ok,false);
  const st=storeAdapter();
  st.adapter.read=()=>({...r});
  assert.equal(atomic(input,1999,st.adapter).ok,false);
  assert.equal(st.writes(),0);
 }
});

test('atomic rejects deferred callback after lock scope exits without storage writes',()=>{
 const st=storeAdapter();
 let deferred;
 st.adapter.withExclusiveLock=fn=>{deferred=fn;return undefined};
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(deferred().reason,'UNKNOWN_NO_RETRY');
 assert.equal(st.clockReads(),0,'deferred callback cannot sample time outside lock scope');
 assert.equal(st.writes(),0);
});

test('atomic disabled TEST contract requires a trusted clock adapter, not just caller supplied time',()=>{
 const st=storeAdapter();
 delete st.adapter.trustedNow;
 assert.equal(atomic(input,1999,st.adapter).reason,'ADAPTER_UNAVAILABLE');
 assert.equal(st.writes(),0);
 const st2=storeAdapter();
 assert.equal(atomic(input,NaN,st2.adapter).reason,'INVALID');
 assert.equal(st2.writes(),0);
});
test('stale caller time cannot extend a token beyond trusted under-lock expiry boundary',()=>{
 const st=storeAdapter({clock:2000});
 assert.equal(atomic(input,1999,st.adapter).reason,'UNAVAILABLE');
 assert.equal(st.writes(),0);
 assert.equal(st.get().status,'ISSUED');
 assert.equal(st.clockReads(),1,'no CAS or retry after under-lock expiry');
});
test('token expiring between two trusted clock samples never reaches CAS',()=>{
 const st=storeAdapter({clock:n=>n===1?1999:2000});
 assert.equal(atomic(input,1999,st.adapter).reason,'UNAVAILABLE');
 assert.equal(st.clockReads(),2);
 assert.equal(st.writes(),0);
});
test('invalid, regressed and throwing trusted clocks are fail-closed',()=>{
 for(const clock of [NaN,-1,1998,1999.5,Number.MAX_SAFE_INTEGER+1]){
  const st=storeAdapter({clock});
  assert.equal(atomic(input,1999,st.adapter).ok,false);
  assert.equal(st.writes(),0);
 }
 const backwards=storeAdapter({clock:n=>n===1?1999:1998});
 assert.equal(atomic(input,1999,backwards.adapter).reason,'UNAVAILABLE');
 assert.equal(backwards.writes(),0);
 const throws=storeAdapter({clockThrows:true});
 assert.equal(atomic(input,1999,throws.adapter).reason,'UNKNOWN_NO_RETRY');
 assert.equal(throws.writes(),0);
});
test('consumption records trusted commit time and refuses replay after one confirmed write',()=>{
 const st=storeAdapter({clock:n=>n===1?1999:1999});
 assert.equal(atomic(input,1999,st.adapter).ok,true);
 assert.equal(st.clockReads(),2);
 assert.equal(st.get().consumedAt,1999);
 assert.equal(atomic(input,1999,st.adapter).ok,false);
 assert.equal(st.writes(),1);
});
test('CAS mutating its write payload cannot rewrite readback authorization baseline',()=>{
 const st=storeAdapter({mutateWriteActions:true});
 assert.equal(atomic(input,1999,st.adapter).reason,'UNKNOWN_READBACK');
 assert.equal(st.writes(),1,'unknown committed state must never auto retry');
 assert.equal(st.get().actions[0],'DELETE');
 assert.equal(atomic(input,1999,st.adapter).ok,false,'committed token rejects replay');
 assert.equal(st.writes(),1);
});
test('CAS returns false after a real write: UNKNOWN, no success and no replay',()=>{
 const st=storeAdapter({falseAfterWrite:true});
 assert.equal(atomic(input,1999,st.adapter).reason,'CONFLICT_OR_UNKNOWN');
 assert.equal(st.writes(),1);
 assert.equal(st.get().status,'CONSUMED');
 assert.equal(atomic(input,1999,st.adapter).ok,false);
 assert.equal(st.writes(),1);
});
test('server-only disabled token contract remains unwired and never introduces a mail or public endpoint',()=>{
 assert.match(source,/STUDY1_V08_ENABLED_ = false/);
 assert.match(source,/adapter\.trustedNow\(\)/);
 assert.match(source,/const original=record/);
 assert.match(source,/actions:original\.actions\.slice\(\)/);
 assert.doesNotMatch(source,/MailApp|GmailApp|SpreadsheetApp|UrlFetchApp|function\s+(?:doGet|doPost)\s*\(/);
});
