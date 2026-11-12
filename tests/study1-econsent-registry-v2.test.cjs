'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const sha=value=>crypto.createHash('sha256').update(
 Buffer.isBuffer(value)?value:Array.isArray(value)?Buffer.from(value.map(n=>n&255)):
 Buffer.from(String(value),'utf8')).digest('hex');
function build(){
 const values=new Map(),files=new Map(),folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 let counter=0,onCreate=null,onPointerWrite=null;
 const prop={getProperty:key=>values.has(key)?values.get(key):null,
  setProperty:(key,value)=>{
   values.set(key,value);
   if(key==='STUDY1_ECONSENT_POINTER_V2'&&onPointerWrite)onPointerWrite();
  }};
 const proxy=data=>({
  getId:()=>data.id,getSize:()=>data.bytes.length,
  getMimeType:()=>data.mime,getSharingAccess:()=>data.access,
  setSharing:access=>{data.access=access;},
  getParents:()=>{let done=false;return {hasNext:()=>!done,
   next:()=>{done=true;return {getId:()=>data.parentId};}};},
  getBlob:()=>({getBytes:()=>[...data.bytes],
   getDataAsString:()=>data.bytes.toString('utf8')})
 });
 const folder={getSharingAccess:()=> 'PRIVATE',
  createFile:blob=>{
   const data={id:'V2_PRIVATE_FILE_'+(++counter).toString().padStart(10,'0'),
    bytes:Buffer.from(blob.bytes),mime:blob.mime,access:'PRIVATE',parentId:folderId};
   files.set(data.id,data);
   if(onCreate)onCreate();
   return proxy(data);
  }};
 const scope=vm.createContext({
  PropertiesService:{getScriptProperties:()=>prop},
  LockService:{getScriptLock:()=>({hasLock:()=>true,tryLock:()=>true,releaseLock:()=>{}})},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},
   getFolderById:id=>{assert.equal(id,folderId);return folder;},
   getFileById:id=>{if(!files.has(id))throw Error('missing file '+id);return proxy(files.get(id));}},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(_,v)=>[...Buffer.from(sha(v),'hex')],
   newBlob:(v,mime='application/json',name='')=>{
    const bytes=Buffer.from(String(v),'utf8');
    return {bytes,mime,name,getBytes:()=>[...bytes]};
   }},
  STUDY1_CONSENT_DOC_FOLDER_:folderId,
  study1BindingHmac_:items=>crypto.createHmac('sha256','only-synthetic-strong-test-key')
   .update(JSON.stringify(items)).digest('hex'),
  Date,JSON,Math,Number,String,Array,Object,Set,Error
 });
 vm.runInContext(source,scope,{timeout:5000});
 const entry=(n)=>({
  id:'aaaaaaaa-bbbb-4ccc-8ddd-'+n.toString(16).padStart(12,'0'),
  tokenHash:sha('TOKEN'+n),experiment:'E1',documentSha:sha('PRESIGNED_PDF_V1'),
  documentVersion:'Version02',expires:1799999999999,state:'ISSUED',
  explanation:null,signature:null,confirmation:null,withdrawal:null
 });
 const legacy={schemaVersion:1,revision:1,records:[entry(1)]};
 const legacyBytes=JSON.stringify(legacy);
 values.set('STUDY1_ECONSENT_PRIVATE_V1',legacyBytes);
 return {scope,values,files,legacy,legacyBytes,entry,
  enable:()=>values.set('STUDY1_ECONSENT_MIGRATION_V2_APPROVED','true'),
  onCreate:fn=>{onCreate=fn;},onPointerWrite:fn=>{onPointerWrite=fn;}};
}
function grow(f,start,end){
 let prior=f.scope.study1EConsentRegistry_();
 for(let i=start;i<=end;i++){
  const next={...prior,revision:prior.revision+1,records:prior.records.concat([f.entry(i)])};
  f.scope.study1EConsentWrite_(prior,next);prior=next;
 }
 return prior;
}
test('legacy mode is unchanged and retains old 12-record/7500-byte gate',()=>{
 const f=build();
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 f.scope.study1EConsentWrite_(f.legacy,next);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),JSON.stringify(next));
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
 assert.equal(f.files.size,0);
 const tooMany={...next,revision:3,
  records:Array.from({length:13},(_,i)=>f.entry(i+1))};
 assert.throws(()=>f.scope.study1EConsentWrite_(next,tooMany),/容量不足/);
});
test('explicit V2 migration preserves original V1 bytes and grows beyond 12',()=>{
 const f=build();f.enable();
 const result=grow(f,2,17);
 assert.equal(result.records.length,17);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 const pointer=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 assert.equal(pointer.schemaVersion,2);assert.equal(pointer.revision,result.revision);
 assert.equal(pointer.legacySha256,sha(f.legacyBytes));
 assert.equal(f.files.get(pointer.fileId).access,'PRIVATE');
 assert.equal(f.files.get(pointer.fileId).parentId,'1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU');
 assert.equal(pointer.sha256,sha(f.files.get(pointer.fileId).bytes));
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(result));
 assert.equal(f.scope.study1EConsentRegistry_().records[0].id,f.legacy.records[0].id);
});
test('migration retains completed signed PDF and independent event references byte-for-byte',()=>{
 const f=build();f.enable();
 const completed={...f.entry(1),state:'CONFIRMED',
  signedPdf:{id:'PRIVATE_SIGNED_PDF_12345',sha:sha('signed pdf bytes')},
  signature:{id:'PRIVATE_SIGN_EVENT_12345',sha:sha('signature event')},
  confirmation:{id:'PRIVATE_CONFIRM_12345',sha:sha('confirmation event')}};
 const legacy={schemaVersion:1,revision:1,records:[completed]};
 const original=JSON.stringify(legacy);
 f.values.set('STUDY1_ECONSENT_PRIVATE_V1',original);
 const next={...legacy,revision:2,records:[completed,f.entry(2)]};
 f.scope.study1EConsentWrite_(legacy,next);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),original);
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
});
test('invalid new records reject before any Drive version or pointer is written',()=>{
 const f=build();f.enable();
 const invalid={...f.legacy,revision:2,records:[
  {...f.entry(1),state:'FORGED'},f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,invalid),/來源不合法/);
 assert.equal(f.files.size,0);
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
});
test('V2 pointer remains authoritative even after migration switch is off',()=>{
 const f=build();f.enable();grow(f,2,2);
 f.values.delete('STUDY1_ECONSENT_MIGRATION_V2_APPROVED');
 const result=grow(f,3,3);
 assert.equal(result.records.length,3);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
});
test('tampered pointer and altered historic V1 bytes never fall back silently',()=>{
 const f=build();f.enable();grow(f,2,2);
 const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 f.values.set('STUDY1_ECONSENT_POINTER_V2',JSON.stringify({...ptr,sha256:'f'.repeat(64)}));
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/HMAC_INVALID/);
 f.values.set('STUDY1_ECONSENT_POINTER_V2',JSON.stringify(ptr));
 f.values.set('STUDY1_ECONSENT_PRIVATE_V1',f.legacyBytes+' ');
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/LEGACY_CHANGED/);
});
test('private ACL, original folder parent and SHA are checked every read',()=>{
 const f=build();f.enable();grow(f,2,2);
 const ptr=JSON.parse(f.values.get('STUDY1_ECONSENT_POINTER_V2'));
 const file=f.files.get(ptr.fileId);
 file.access='ANYONE';
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/PRIVATE_FILE_INVALID/);
 file.access='PRIVATE';file.parentId='DIFFERENT_FOLDER';
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/OUTSIDE_PRIVATE_FOLDER/);
 file.parentId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
 file.bytes=Buffer.from(file.bytes);file.bytes[20]^=1;
 assert.throws(()=>f.scope.study1EConsentRegistry_(),/SHA_CHANGED/);
});
test('a storage error before pointer commit preserves original registry',()=>{
 const f=build();f.enable();
 f.onCreate(()=>{throw Error('synthetic staging write failure');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/staging write failure/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 assert.equal(f.values.has('STUDY1_ECONSENT_POINTER_V2'),false);
 assert.equal(f.scope.study1EConsentRegistry_().records.length,1);
});
test('pointer commit followed by ambiguous RPC error remains recoverable',()=>{
 const f=build();f.enable();
 f.onPointerWrite(()=>{throw Error('synthetic response lost after commit');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/response lost/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
 assert.equal(JSON.stringify(f.scope.study1EConsentRegistry_()),JSON.stringify(next));
});
test('competing pointer change between staged file and commit is refused',()=>{
 const f=build();f.enable();
 f.onCreate(()=>{f.values.set('STUDY1_ECONSENT_POINTER_V2','STALE_FOREIGN_WRITER');});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/CONCURRENT_POINTER_WRITE/);
 assert.equal(f.values.get('STUDY1_ECONSENT_PRIVATE_V1'),f.legacyBytes);
});
test('no authorized shared ScriptLock rejects migration before any Drive write',()=>{
 const f=build();f.enable();
 f.scope.LockService.getScriptLock=()=>({hasLock:()=>false});
 const next={...f.legacy,revision:2,records:[...f.legacy.records,f.entry(2)]};
 assert.throws(()=>f.scope.study1EConsentWrite_(f.legacy,next),/SHARED_LOCK_REQUIRED/);
 assert.equal(f.files.size,0);
});
