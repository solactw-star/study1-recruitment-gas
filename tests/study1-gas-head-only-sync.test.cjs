'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sync=require('../scripts/study1-gas-head-only-sync.cjs');
const drive=require('../scripts/study1-gas-drive-backup.cjs');
const SID=sync.SID;
const PRIVATE='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
const PUBLIC='AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s';
const manifest=()=>JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',
 webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}});
function fixture(){
 const f=[{name:'appsscript',type:'JSON',source:manifest()}];
 for(const name of sync.APPROVED.filter(n=>n!=='appsscript'))f.push({
  name,type:['Index','AdminConsole','Study1Unified','Study1Visitor','Study1Team'].includes(name)?'HTML':'SERVER_JS',
  source:'old code '+name});
 return {scriptId:SID,files:f};
}
function snapshot(){
 return {headSha:'old',manifest:manifest(),
  dep:[{id:PUBLIC,version:124,scriptId:SID},{id:PRIVATE,version:128,scriptId:SID}],
  privateDeployment:{id:PRIVATE,config:{versionNumber:128}},
  publicDeployment:{id:PUBLIC,config:{versionNumber:124}},
  pSha:'privateSha',uSha:'publicSha'};
}
function deployments(){
 return [{deploymentId:PUBLIC,deploymentConfig:{scriptId:SID,versionNumber:124}},
  {deploymentId:PRIVATE,deploymentConfig:{scriptId:SID,versionNumber:128}},
  {deploymentId:'OTHER_A',deploymentConfig:{scriptId:SID,versionNumber:1}},
  {deploymentId:'OTHER_B',deploymentConfig:{scriptId:SID}}];
}
test('exact 27 source names and original manifest retained',()=>{
 const a=fixture();assert.equal(sync.inventory_(a.files).length,27);
 assert.equal(sync.manifest_(a.files),a.files[0].source);
 assert.equal(sync.APPROVED.length,27);assert.equal(sync.CHANGED.length,8);
});
test('unexpected missing, additional, duplicate, or altered file type is rejected',()=>{
 const a=fixture();a.files.pop();
 assert.throws(()=>sync.inventory_(a.files),/full 27/);
 const b=fixture();b.files.push({name:'Unknown',type:'SERVER_JS',source:'x'});
 assert.throws(()=>sync.inventory_(b.files),/full 27/);
 const c=fixture();c.files[2]={...c.files[1]};
 assert.throws(()=>sync.inventory_(c.files),/duplicate/);
 const d=fixture();d.files.find(f=>f.name==='Study1Team').type='JSON';
 assert.throws(()=>sync.inventory_(d.files),/JSON manifest count/);
});
test('cannot silently change HEAD access, execute-as or raw JSON manifest',()=>{
 const a=fixture();a.files[0].source=a.files[0].source.replace('ANYONE_ANONYMOUS','MYSELF');
 assert.throws(()=>sync.manifest_(a.files),/manifest access/);
 const b=fixture();b.files[0].source='{';
 assert.throws(()=>sync.manifest_(b.files),/invalid JSON/);
 const c=fixture();c.files[0].source=c.files[0].source.replace('USER_DEPLOYING','USER_ACCESSING');
 assert.throws(()=>sync.manifest_(c.files),/manifest access/);
});
test('wrong Script ID or unknown reviewed baseline fails before candidate generation',()=>{
 const a=fixture();a.scriptId='wrong';
 assert.throws(()=>sync.patch_(a,[]),/wrong GAS Script ID/);
 const b=fixture();
 assert.throws(()=>sync.patch_(b,[]),/original HEAD SHA changed/);
});
test('manual run must have exact isolated PR SHA, closed private repo and separate approval',()=>{
 const good={GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas',
  GITHUB_REF:'refs/heads/fix/consent-last-preserve-wizard-20261110',
  GITHUB_REPOSITORY_PRIVATE:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_SHA:'a'.repeat(40),REVIEWED_PR_SHA:'a'.repeat(40),
  HEAD_ONLY_CONFIRMATION:'I_AUTHORIZE_PR133_HEAD_ONLY_SYNC',
  EXPECTED_REMOTE_SHA256:sync.BASE};
 assert.doesNotThrow(()=>sync.invocation_(good));
 for(const bad of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},
  {GITHUB_REPOSITORY_PRIVATE:'false'},
  {REVIEWED_PR_SHA:'b'.repeat(40)},
  {HEAD_ONLY_CONFIRMATION:'I_AUTHORIZE_SOURCE_REPLACEMENT_ONLY'},
  {EXPECTED_REMOTE_SHA256:'f'.repeat(64)}])
  assert.throws(()=>sync.invocation_({...good,...bad}),/HEAD_ONLY_BLOCKED/);
});
test('private V128 and public V124 inventory must match exactly',()=>{
 assert.equal(sync.deploymentList_(deployments()).length,4);
 assert.throws(()=>sync.deploymentList_(deployments().slice(1)),/count/);
 const copy=deployments();
 copy[0].deploymentConfig.versionNumber=125;
 assert.throws(()=>sync.deploymentList_(copy),/private V128\/public V124/);
 const bad=deployments();bad[1].deploymentConfig.versionNumber=129;
 assert.throws(()=>sync.deploymentList_(bad),/private V128\/public V124/);
 const dup=deployments();dup[3].deploymentId=dup[2].deploymentId;
 assert.throws(()=>sync.deploymentList_(dup),/duplicate|deployment IDs/);
 const foreign=deployments();foreign[3].deploymentConfig.scriptId='other';
 assert.throws(()=>sync.deploymentList_(foreign),/deployment IDs or script ID/);
});
test('CAS detects HEAD, private/public deployment, manifest and immutable code drift',()=>{
 const a=snapshot();
 assert.doesNotThrow(()=>sync.same_(a,snapshot(),true));
 for(const alter of [x=>x.headSha='changed',x=>x.manifest='{}',
  x=>x.dep[0].version=999,x=>x.privateDeployment.config.versionNumber=127,
  x=>x.publicDeployment.config.versionNumber=125,x=>x.pSha='bad',x=>x.uSha='bad']){
  const b=snapshot();alter(b);
  assert.throws(()=>sync.same_(a,b,true),/HEAD_ONLY_BLOCKED/);
 }
});
test('remote malformed at prepare triggers no Drive backup, and never writes',async()=>{
 let writes=0,backups=0;
 const api={getContent:async()=>({scriptId:SID,files:[]}),
  backupToDrive:async()=>{backups++;},putContent:async()=>{writes++;}};
 await assert.rejects(sync.prepare_(api,[], 'a'.repeat(40)));
 assert.equal(backups,0);assert.equal(writes,0);
});
test('post-PUT timeout may mean committed: one call only, no retry or rollback',async()=>{
 let calls=0,reads=0;
 const api={putContent:async()=>{calls++;throw Error('connection timed out');}};
 await assert.rejects(sync.singlePut_(api,fixture().files,async()=>{reads++;}),
  /HEAD_SYNC_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
 assert.equal(calls,1);assert.equal(reads,0);
});
test('post-PUT stale readback also stops without retry or rollback',async()=>{
 let writes=0,reads=0;
 const api={putContent:async()=>{writes++;}};
 await assert.rejects(sync.singlePut_(api,fixture().files,async()=>{
  reads++;throw Error('GAS HEAD still stale');}),
 /HEAD_SYNC_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
 assert.equal(writes,1);assert.equal(reads,1);
});
test('successful isolated single PUT performs one write and verification',async()=>{
 let writes=0,reads=0;
 const api={putContent:async files=>{writes++;assert.equal(files.length,27);}};
 const result=await sync.singlePut_(api,fixture().files,async()=>{reads++;return 'verified';});
 assert.equal(result,'verified');assert.equal(writes,1);assert.equal(reads,1);
});
test('prewrite snapshot without backup OWNER-only proof is rejected',()=>{
 const s={scriptId:SID,branch:'fix/consent-last-preserve-wizard-20261110',
  triggerSha:'a'.repeat(40),baseSha:sync.BASE,targetSha:sync.TARGET,
  before:{headSha:sync.BASE,head:fixture()},
  backup:{id:'012345678901234567890123',sha256:'f'.repeat(64)}};
 assert.throws(()=>sync.verifySnapshot_(s,'a'.repeat(40)),/private backup ID\/SHA\/ACL missing/);
});
test('HEAD-only before.head files can be backed up without weakening original owner flow',()=>{
 const complete=fixture();
 assert.equal(drive.assertFullHeadSnapshot({scriptId:SID,before:{head:complete}}).length,27);
 assert.equal(drive.assertFullHeadSnapshot({scriptId:SID,original:complete}).length,27);
 const missing=fixture();missing.files.pop();
 assert.throws(()=>drive.assertFullHeadSnapshot({scriptId:SID,before:{head:missing}}),/all 27/);
 const duplicate=fixture();duplicate.files[1]={...duplicate.files[0]};
 assert.throws(()=>drive.assertFullHeadSnapshot({scriptId:SID,before:{head:duplicate}}),/duplicated file/);
 assert.throws(()=>drive.assertFullHeadSnapshot({scriptId:'wrong',before:{head:complete}}),/full verified GAS HEAD/);
});

test('private Drive backup verify rejects public ACL or additional reader',async()=>{
 const id='A234567890123456789012',body='{"safety":"test"}',hash=drive.sha256(body);
 const base={id,mimeType:'application/json',parents:[drive.FOLDER],
  owners:[{emailAddress:drive.OWNER}]};
 const fake=extra=>async(url)=>{
  const u=String(url),isMedia=u.includes('alt=media'),last=u.includes('permissions');
  const value=isMedia?body:JSON.stringify(last?{...base,shared:false,
   permissions:[{type:'user',role:'owner',emailAddress:drive.OWNER}],...extra}:base);
  return {ok:true,status:200,json:async()=>JSON.parse(value),text:async()=>value};
 };
 assert.equal((await drive.verifyPrivate(fake({}),'token',id,hash)).ownerOnly,true);
 for(const modification of [{shared:true},{permissions:[
  {type:'user',role:'owner',emailAddress:drive.OWNER},
  {type:'anyone',role:'reader'}]},{permissions:[]}])
  await assert.rejects(drive.verifyPrivate(fake(modification),'token',id,hash),/ACL not strictly owner-only/);
});
test('workflow and code never contain createVersion, deployment PUT, Sheets or clasp push',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../scripts/study1-gas-head-only-sync.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/manual-source-sync.yml'),'utf8');
 assert.equal((source.match(/api\.putContent\(/g)||[]).length,1);
 for(const prohibited of ['api.createVersion(','api.putDeployment(','api.createDeployment(',
  'api.deleteDeployment(','SpreadsheetApp','MailApp','setProperty(','clasp push'])
  assert.ok(!source.includes(prohibited),prohibited);
 assert.ok(workflow.includes('workflow_dispatch:'));
 assert.ok(!workflow.includes('\n  push:'));
 assert.ok(!workflow.includes('clasp push'));
 assert.ok(!workflow.includes('npx --yes @google/clasp'));
 assert.ok(workflow.includes('npm run verify:pr'));
 assert.ok(workflow.includes('group: study1-gas-source-sync'));
});
