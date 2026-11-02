'use strict';
// Push-driven *Index-only* Study1 GAS sync. Deployment and other source files are preserved.
// Never push GitHub's entire gas directory. No user action is required per Index update.
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-gas-index-preview.cjs');
const id=core.SCRIPT_ID;
const ensure=(v,message)=>{if(!v)throw Error(message)};
const snapPath=()=>path.join(process.env.RUNNER_TEMP,'study1-auto-index-snapshot.json');
const fields=f=>({name:f.name,type:f.type,source:f.source});
const same=(a,b)=>core.digest(a)===core.digest(b);
function targetDeployment(deployments){
 const d=deployments.filter(z=>z?.deploymentConfig?.scriptId===id&&
  Number.isInteger(z.deploymentConfig.versionNumber)&&z.deploymentConfig.versionNumber>0&&
  (z.entryPoints||[]).some(p=>typeof p.webApp?.url==='string'&&/\/exec(?:\?|$)/.test(p.webApp.url)));
 ensure(d.length===1,'Expected exactly one versioned /exec deployment; no automatic guessing');
 return d[0];
}
function assertEvent(env){
 ensure(env.GITHUB_REPOSITORY==='solactw-star/study1-recruitment-gas','Wrong repository');
 ensure(env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='push','Not a main push');
 ensure(env.GITHUB_REPOSITORY_PRIVATE==='true','Repository is not private');
 ensure(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||''),'Missing exact triggering commit SHA');
}
async function prepare(api,indexSource){
 core.assertIndex(indexSource);
 const remote=await api.getContent();core.assertRemote(remote);
 const current=targetDeployment(await api.deployments());
 const dep=await api.getDeployment(current.deploymentId);
 const old=core.deploymentCheck(dep,current.deploymentId,current.deploymentConfig.versionNumber);
 const deployedContent=await api.getVersion(current.deploymentConfig.versionNumber);
 const depManifest=JSON.parse(core.file(deployedContent.files,'appsscript','JSON').source);
 const headManifest=JSON.parse(core.file(remote.files,'appsscript','JSON').source);
 ensure(JSON.stringify(depManifest.webapp)===JSON.stringify(headManifest.webapp),'Existing deployed access differs from HEAD; refusing to alter audience');
 const updated=core.merge(remote,indexSource);
 const indexChanged=!same(remote.files,updated);
 const deployedIndex=core.file(deployedContent.files,'Index','HTML').source;
 const deploymentChanged=deployedIndex!==indexSource;
 const snapshot={scriptId:id,triggerSha:process.env.GITHUB_SHA||'',readAt:new Date().toISOString(),
  original:remote,remoteSha256:core.digest(remote.files),desiredSha256:core.digest(updated),
  indexSha256:core.sha(indexSource),deployment:dep,deploymentId:dep.deploymentId,
  oldVersion:current.deploymentConfig.versionNumber,oldUrl:old.url,indexChanged,deploymentChanged};
 fs.writeFileSync(snapPath(),JSON.stringify(snapshot,null,2),{mode:0o600});
 console.log('GAS remote HEAD SHA256:',snapshot.remoteSha256);
 console.log('GAS proposed HEAD SHA256:',snapshot.desiredSha256);
 console.log('Selected existing deployment:',snapshot.deploymentId,'old version:',snapshot.oldVersion);
 console.log('Index update required:',indexChanged,'deployment update required:',deploymentChanged);
 return snapshot;
}
function compareNoIndex(a,b){
 const omit=fs=>fs.filter(x=>x.name!=='Index').map(fields);
 return same(omit(a),omit(b));
}
async function apply(api,indexSource,s){
 ensure(s.scriptId===id&&s.triggerSha===process.env.GITHUB_SHA&&s.indexSha256===core.sha(indexSource),'Snapshot mismatch');
 core.assertIndex(indexSource);
 // Fetch again immediately before mutation. Never write through a stale snapshot.
 const remote=await api.getContent();core.assertRemote(remote);
 ensure(core.digest(remote.files)===s.remoteSha256,'GAS was edited while the job ran; no write');
 const dep=await api.getDeployment(s.deploymentId);
 core.deploymentCheck(dep,s.deploymentId,s.oldVersion);
 ensure(JSON.stringify(dep)===JSON.stringify(s.deployment),'Existing /exec was changed while the job ran');
 const desired=core.merge(remote,indexSource);
 ensure(core.digest(desired)===s.desiredSha256,'Proposed content changed since backup');
 if(!s.indexChanged&&!s.deploymentChanged){
   console.log('SYNC_VERIFIED=true; already identical GAS HEAD and existing /exec version');
   return {status:'already-current',id:s.deploymentId,version:s.oldVersion,sha:s.desiredSha256};
 }
 // Preserve entire remote file set; send only editable File fields from HEAD.
 if(s.indexChanged){
   const result=await api.putContent(desired.map(fields));
   ensure(same(result.files,desired),'GAS updateContent response does not match the proposed content');
 }
 const reloaded=await api.getContent();core.assertRemote(reloaded);
 ensure(same(reloaded.files,desired),'GAS HEAD readback differs; DO NOT deploy');
 ensure(compareNoIndex(reloaded.files,s.original.files),'Non-Index GAS files unexpectedly modified; DO NOT deploy');
 const newVersion=await api.createVersion('Study1 closed preview auto-sync Index only ('+process.env.GITHUB_SHA.slice(0,12)+')');
 ensure(Number.isInteger(newVersion.versionNumber)&&newVersion.versionNumber>s.oldVersion,'Version creation failed or returned an invalid version');
 const immutable=await api.getVersion(newVersion.versionNumber);
 ensure(same(immutable.files,desired),'New version content is not the expected HEAD');
 const current=await api.getDeployment(s.deploymentId);
 core.deploymentCheck(current,s.deploymentId,s.oldVersion);
 ensure(JSON.stringify(current)===JSON.stringify(s.deployment),'Deployment changed before update; DO NOT deploy');
 await api.putDeployment(s.deploymentId,{...current.deploymentConfig,versionNumber:newVersion.versionNumber});
 const finalDeployment=await api.getDeployment(s.deploymentId);
 const details=core.deploymentCheck(finalDeployment,s.deploymentId,newVersion.versionNumber);
 ensure(details.url===s.oldUrl,'Existing /exec URL changed unexpectedly');
 const deployed=await api.getVersion(newVersion.versionNumber);
 ensure(same(deployed.files,desired),'The deployed version differs from committed Index');
 const final=await api.getContent();
 ensure(same(final.files,desired)&&compareNoIndex(final.files,s.original.files),'Final GAS HEAD mismatch');
 console.log('SYNC_VERIFIED=true; original /exec deployment preserved; version',newVersion.versionNumber,'sha256',s.desiredSha256);
 return {status:'deployed',id:s.deploymentId,version:newVersion.versionNumber,sha:s.desiredSha256};
}
async function main(){
 assertEvent(process.env);
 const phase=process.argv[2];ensure(phase==='prepare'||phase==='apply','Invalid execution phase');
 const indexSource=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8');
 const api=await core.authorizedApi();
 if(phase==='prepare')return prepare(api,indexSource);
 const s=JSON.parse(fs.readFileSync(snapPath(),'utf8'));
 return apply(api,indexSource,s);
}
if(require.main===module)main().catch(e=>{console.error('AUTO_GAS_SYNC_BLOCKED: '+e.message);process.exitCode=1});
module.exports={assertEvent,targetDeployment,compareNoIndex,prepare,apply,fields};
