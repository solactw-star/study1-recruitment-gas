'use strict';
/** Study1 PR #133: HEAD ONLY, never new version or deployment.
 * GAS updateContent replaces the entire file inventory; retain all 27 files.
 * API has no atomic CAS; single-writer workflow + repeated readback minimize
 * but cannot eliminate independent external concurrent writers.
 */
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-gas-index-preview.cjs');
const owner=require('./study1-gas-owner-preview-deploy.cjs');
const backup=require('./study1-gas-drive-backup.cjs');
const SID=core.SCRIPT_ID;
const REPO='solactw-star/study1-recruitment-gas';
const BRANCH='fix/consent-last-preserve-wizard-20261110';
const PRIVATE='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
const PUBLIC='AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s';
const BASE='972cb7ceb617776ca161d283dd05e8f1d38b73b90afc68071b79eeffba25a611';
const TARGET='7d65feb0bc099064770e89c61df201bad3b8ab5ece34de7d97b456a304cb45ea';
const OWNER_V128='82691b2744b9fc8ff92c6a28cda2a20e0c1f32d9fa01b1aa99397fb77f59b17e';
const CHANGED=Object.freeze(['Index','Website','AdminSandbox','Study1WizardP0Bridge',
 'Study1ParticipantIntake','Study1FormalBooking','Study1Visitor','Study1Team'].sort());
const APPROVED=Object.freeze(['appsscript',...owner.reviewSources().map(f=>f.name)].sort());
const snapPath=()=>path.join(process.env.RUNNER_TEMP,'study1-pr133-head-only-prewrite.json');
const must=(v,msg)=>{if(!v)throw Error('HEAD_ONLY_BLOCKED: '+msg)};
const contentOnly=files=>files.map(x=>({name:x.name,type:x.type,source:x.source}));
function manifest_(files){
 const obj=core.file(files,'appsscript','JSON');
 let j;
 try{j=JSON.parse(obj.source);}catch(_){throw Error('HEAD_ONLY_BLOCKED: manifest invalid JSON');}
 must(j.timeZone==='Asia/Taipei'&&j.runtimeVersion==='V8'&&
  j.webapp?.access==='ANYONE_ANONYMOUS'&&j.webapp?.executeAs==='USER_DEPLOYING',
  'HEAD manifest access/execution changed');
 return obj.source;
}
function inventory_(files){
 must(Array.isArray(files)&&files.length===27,'full 27 GAS files required');
 const seen=new Set();
 for(const f of files){
  must(f&&typeof f.name==='string'&&typeof f.type==='string'&&
   typeof f.source==='string'&&!seen.has(f.name),'duplicate or malformed source');
  seen.add(f.name);
 }
 must(JSON.stringify([...seen].sort())===JSON.stringify(APPROVED),'GAS file inventory changed');
 must(files.filter(f=>f.type==='JSON').length===1,'unexpected JSON manifest count');
 manifest_(files);
 return files;
}
function invocation_(env){
 must(env.GITHUB_REPOSITORY===REPO&&
  env.GITHUB_REF==='refs/heads/'+BRANCH&&
  env.GITHUB_REPOSITORY_PRIVATE==='true'&&env.GITHUB_EVENT_NAME==='workflow_dispatch',
  'repository/ref/private/manual-only gate');
 must(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&
  env.GITHUB_SHA===env.REVIEWED_PR_SHA,'exact PR SHA mismatch');
 must(env.HEAD_ONLY_CONFIRMATION==='I_AUTHORIZE_PR133_HEAD_ONLY_SYNC',
  'independent future authorization missing');
 must(env.EXPECTED_REMOTE_SHA256===BASE,'remote SHA confirmation mismatch');
}
function patch_(head,reviewed){
 must(head&&head.scriptId===SID,'wrong GAS Script ID');
 inventory_(head.files);
 must(core.digest(head.files)===BASE,'original HEAD SHA changed');
 core.assertRemote(head);
 must(Array.isArray(reviewed)&&reviewed.length===26,'reviewed source set not complete');
 const map=new Map(reviewed.map(x=>[x.name,x]));
 must(map.size===26&&APPROVED.every(n=>n==='appsscript'||map.has(n)),
  'reviewed source names changed');
 const changes=[];
 const full=contentOnly(head.files).map(f=>{
  if(f.name==='appsscript')return f;
  const source=map.get(f.name);
  must(source&&source.type===f.type&&typeof source.source==='string'&&source.source.length>0,
   'reviewed file type/content mismatch');
  if(source.source===f.source)return f;
  changes.push(f.name);
  must(CHANGED.includes(f.name),'unapproved original code change: '+f.name);
  return {...f,source:source.source};
 });
 must(JSON.stringify(changes.sort())===JSON.stringify(CHANGED),
  'exact eight original differences not verified');
 inventory_(full);
 must(core.file(head.files,'appsscript','JSON').source===
  core.file(full,'appsscript','JSON').source,'manifest bytes changed');
 must(core.digest(full)===TARGET,'target complete HEAD SHA changed');
 return full;
}
function deploymentList_(list){
 must(Array.isArray(list)&&list.length===4,'unexpected deployment count');
 const d=owner.stableDeployments(list);
 must(new Set(d.map(x=>x.id)).size===4&&d.every(x=>x.scriptId===SID),
  'deployment IDs or script ID changed');
 must(d.filter(x=>x.id===PRIVATE&&x.version===128).length===1&&
  d.filter(x=>x.id===PUBLIC&&x.version===124).length===1,
  'private V128/public V124 changed');
 return d;
}
function deploymentInfo_(d){
 return {id:d.deploymentId,config:d.deploymentConfig,
  urls:(d.entryPoints||[]).map(x=>x.webApp?.url||'').sort()};
}
async function observe_(api){
 const head=await api.getContent();
 must(head?.scriptId===SID,'wrong remotely observed Script ID');
 inventory_(head.files);
 core.assertRemote(head);
 const dep=deploymentList_(await api.deployments());
 const privateDeployment=await api.getDeployment(PRIVATE);
 const publicDeployment=await api.getDeployment(PUBLIC);
 const p=core.deploymentCheck(privateDeployment,PRIVATE,128);
 const u=core.deploymentCheck(publicDeployment,PUBLIC,124);
 must(p.url.includes(PRIVATE)&&u.url.includes(PUBLIC),'deployment URL changed');
 const pVersion=await api.getVersion(128),uVersion=await api.getVersion(124);
 const pSha=core.digest(pVersion.files),uSha=core.digest(uVersion.files);
 must(pSha===OWNER_V128,'private immutable V128 SHA changed');
 const pManifest=JSON.parse(core.file(pVersion.files,'appsscript','JSON').source).webapp;
 const uManifest=JSON.parse(core.file(uVersion.files,'appsscript','JSON').source).webapp;
 must(pManifest?.access==='MYSELF'&&pManifest?.executeAs==='USER_ACCESSING',
  'PRIVATE immutable manifest ACL differs');
 must(uManifest?.access==='ANYONE_ANONYMOUS'&&uManifest?.executeAs==='USER_DEPLOYING',
  'PUBLIC immutable manifest ACL differs');
 return {head,headSha:core.digest(head.files),manifest:manifest_(head.files),
  dep,privateDeployment:deploymentInfo_(privateDeployment),
  publicDeployment:deploymentInfo_(publicDeployment),
  pSha,uSha};
}
function same_(a,b,head=true){
 must(!head||a.headSha===b.headSha,'HEAD changed (CAS rejected)');
 must(a.manifest===b.manifest,'HEAD manifest changed');
 for(const k of ['dep','privateDeployment','publicDeployment'])
  must(JSON.stringify(a[k])===JSON.stringify(b[k]),k+' changed');
 must(a.pSha===b.pSha&&a.uSha===b.uSha,'immutable version changed');
}
function verifySnapshot_(s,sha){
 must(s&&s.scriptId===SID&&s.branch===BRANCH&&
  s.triggerSha===sha&&s.baseSha===BASE&&s.targetSha===TARGET&&
  s.before?.headSha===BASE&&s.before?.head?.files?.length===27,
  'runner snapshot untrusted');
 must(s.backup?.ownerOnly===true&&typeof s.backup.id==='string'&&
  /^[a-f0-9]{64}$/.test(s.backup.sha256||''),
  'private backup ID/SHA/ACL missing');
 const raw={...s};delete raw.backup;
 must(backup.sha256(JSON.stringify(raw,null,2))===s.backup.sha256,
  'runner snapshot differs from private Drive backup SHA');
}
async function prepare_(api,reviewed,sha){
 const before=await observe_(api);
 must(before.headSha===BASE,'remote HEAD differs from reviewed baseline');
 const full=patch_(before.head,reviewed);
 const unsigned={scriptId:SID,branch:BRANCH,triggerSha:sha,baseSha:BASE,
  targetSha:core.digest(full),at:new Date().toISOString(),before};
 const saved=await api.backupToDrive(unsigned);
 must(saved&&saved.id&&saved.sha256,'new Drive backup failed');
 const verified=await api.verifyDriveBackupPrivate(saved.id,saved.sha256);
 must(verified?.ownerOnly===true,'private backup ACL or bytes not verified');
 const s={...unsigned,backup:{id:saved.id,sha256:saved.sha256,ownerOnly:true}};
 same_(before,await observe_(api),true);
 return s;
}
/** One remote mutation only; any returned failure, timeout or readback ambiguity
 * stops WITHOUT a retry or automatic rollback. */
async function singlePut_(api,files,verify){
 try{
  await api.putContent(contentOnly(files));
  return await verify();
 }catch(e){
  throw Error('HEAD_SYNC_UNKNOWN_NO_RETRY_NO_ROLLBACK: '+e.message);
 }
}
async function commitOnce_(api,s,files){
 const current=await observe_(api);
 same_(s.before,current,true);
 must(current.headSha===BASE&&core.digest(files)===TARGET,
  'original source or full candidate SHA changed');
 return singlePut_(api,files,async()=>{
  const after=await observe_(api);
  must(after.headSha===TARGET,'HEAD readback differs from exact candidate');
  same_(s.before,after,false);
  return {sha:after.headSha,count:after.head.files.length,
   privateSha:after.pSha,publicSha:after.uSha};
 });
}
async function apply_(api,reviewed,s,sha){
 verifySnapshot_(s,sha);
 const state=await observe_(api);
 same_(s.before,state,true);
 const files=patch_(state.head,reviewed);
 must(core.digest(files)===s.targetSha,'reviewed PR source changed after backup');
 const proof=await api.verifyDriveBackupPrivate(s.backup.id,s.backup.sha256);
 must(proof?.ownerOnly===true,'private Drive backup verification no longer valid');
 return commitOnce_(api,s,files);
}
async function main(){
 invocation_(process.env);
 must(process.argv[2]==='prepare'||process.argv[2]==='apply','invalid workflow phase');
 const reviewed=owner.reviewSources();
 const api=await core.authorizedApi();
 if(process.argv[2]==='prepare'){
  const s=await prepare_(api,reviewed,process.env.GITHUB_SHA);
  fs.writeFileSync(snapPath(),JSON.stringify(s,null,2),{mode:0o600,flag:'wx'});
  console.log('HEAD_ONLY_PREWRITE_VERIFIED=true');
  console.log('HEAD_ONLY_PRIVATE_BACKUP_ID='+s.backup.id);
  console.log('HEAD_ONLY_BASE_SHA256='+BASE);
  console.log('HEAD_ONLY_TARGET_SHA256='+TARGET);
 }else{
  const s=JSON.parse(fs.readFileSync(snapPath(),'utf8'));
  const v=await apply_(api,reviewed,s,process.env.GITHUB_SHA);
  console.log('HEAD_ONLY_SYNC_VERIFIED=true');
  console.log('HEAD_ONLY_SHA256='+v.sha);
  console.log('HEAD_ONLY_FILE_COUNT='+v.count);
  console.log('PRIVATE_V128_UNCHANGED_SHA256='+v.privateSha);
  console.log('PUBLIC_V124_UNCHANGED_SHA256='+v.publicSha);
  console.log('DEPLOYMENT_MUTATIONS=0');
 }
}
if(require.main===module)main().catch(e=>{
 console.error('HEAD_ONLY_SYNC_ABORTED: '+e.message);
 process.exitCode=1;
});
module.exports={SID,BASE,TARGET,CHANGED,APPROVED,invocation_,inventory_,
 manifest_,patch_,deploymentList_,same_,verifySnapshot_,prepare_,singlePut_,commitOnce_,apply_};
