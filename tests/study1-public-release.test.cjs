'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const release=require('../scripts/study1-gas-public-release.cjs');
const root=path.join(__dirname,'..');
const source=x=>fs.readFileSync(path.join(root,x),'utf8');
const privateId=release.PRIVATE_ID;
const closedEnv={GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas',
 GITHUB_REPOSITORY_PRIVATE:'true',GITHUB_REF:'refs/heads/main',
 STUDY1_PUBLIC_INFO_RELEASE:'OWNER_APPROVED_2026_11_09',
 GITHUB_SHA:'a'.repeat(40)};
const publicManifest=JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',
 webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}});
const privateManifest=JSON.stringify({timeZone:'Asia/Taipei',runtimeVersion:'V8',
 webapp:{access:'MYSELF',executeAs:'USER_ACCESSING'}});
const entries=[
 ['appsscript','JSON',null],
 ['Index','HTML','gas/Index.html'],
 ['Website','SERVER_JS','gas/Website.js'],
 ['AdminSandbox','SERVER_JS','gas/AdminSandbox.js'],
 ['AdminConsole','HTML','gas/AdminConsole.html'],
 ['Study1Flow','SERVER_JS','gas/Study1Unified.js'],
 ['Study1Unified','HTML','gas/Study1Unified.html'],
 ['OtpCore','SERVER_JS','gas/OtpCore.js'],
 ['BookingCore','SERVER_JS','gas/BookingCore.js'],
 ['OtpThrottle','SERVER_JS','gas/OtpThrottle.js'],
 ['OtpTransaction','SERVER_JS','gas/OtpTransaction.js'],
 ['BookingHoldTransaction','SERVER_JS','gas/BookingHoldTransaction.js'],
 ['Study1FixtureAdapter','SERVER_JS','gas/Study1FixtureAdapter.js'],
 ['Study1PdfLib','SERVER_JS','gas/Study1PdfLib.js'],
 ['Study1PdfStampCore','SERVER_JS','gas/Study1PdfStampCore.js'],
 ['Study1Visitor','HTML','gas/Study1Visitor.html'],
 ['Study1Team','HTML','gas/Study1Team.html']
];
function remote(){
 return {files:entries.map(([name,type,p])=>({name,type,source:p?source(p):publicManifest}))};
}
function fixture(){
 const current=remote(), privateContent=structuredClone(current);
 privateContent.files[0].source=privateManifest;
 const owner={deploymentId:privateId,deploymentConfig:{
  scriptId:'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',
  versionNumber:113,manifestFileName:'appsscript',description:'Study 1 網站私人預覽 V1'},
  entryPoints:[{webApp:{url:'https://script.google.com/macros/s/'+privateId+'/exec'}}]};
 let publicDeploy=null,createCalled=0,deleteCalled=0,mutation=0,backup=0;
 let publicVersion=null;
 const api={
  getContent:async()=>structuredClone(current),
  deployments:async()=>[structuredClone(owner),...(publicDeploy?[structuredClone(publicDeploy)]:[])],
  getDeployment:async id=>id===privateId?structuredClone(owner):structuredClone(publicDeploy),
  getVersion:async v=>v===113?structuredClone(privateContent):structuredClone(publicVersion),
  createVersion:async()=>{publicVersion=structuredClone(current);return {versionNumber:114};},
  backupToDrive:async()=>{backup++;return {id:'private-backup',sha256:'a'.repeat(64)};},
  verifyDriveBackup:async()=>{},
  createDeployment:async config=>{
   assert.deepEqual(Object.keys(config).sort(),['description','manifestFileName','versionNumber'],
    'Official GAS create API requires a FLAT body; deploymentConfig is response-only');
   mutation++;createCalled++;
   publicDeploy={deploymentId:'AKfycbPublicReadOnlyUniqueId123',
    deploymentConfig:{scriptId:'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',...config},
    entryPoints:[{webApp:{url:'https://script.google.com/macros/s/AKfycbPublicReadOnlyUniqueId123/exec'}}]};
   return structuredClone(publicDeploy);
  },
  putDeployment:async(id,config)=>{
   assert.notEqual(id,privateId,'original private /exec must not change');
   mutation++;publicDeploy.deploymentConfig=config;return structuredClone(publicDeploy);
  },
  deleteDeployment:async id=>{assert.notEqual(id,privateId);deleteCalled++;publicDeploy=null;}
 };
 return {api,current,owner,metrics:()=>({mutation,backup,createCalled,deleteCalled,publicDeploy})};
}
test('Release requires explicit original private main, no other repo or branch',()=>{
 assert.doesNotThrow(()=>release.assertEnvironment(closedEnv));
 for(const bad of [{GITHUB_REF:'refs/heads/staging'},
  {GITHUB_REPOSITORY_PRIVATE:'false'},{STUDY1_PUBLIC_INFO_RELEASE:'bypass'},
  {GITHUB_REPOSITORY:'other/test'}]){
  assert.throws(()=>release.assertEnvironment({...closedEnv,...bad}));
 }
});
test('Public build is final CLOSED product UI, rejects missing gates or unreviewed GAS module',()=>{
 assert.doesNotThrow(()=>release.assertClosedPublicSources(remote()));
 for(const mutation of [
  r=>{r.files.find(x=>x.name==='Website').source=r.files.find(x=>x.name==='Website').source.replace(
   'function submitConsent(){return rejectIntake_();}','function submitConsent(){return "accepted";}');},
  r=>{r.files.find(x=>x.name==='AdminSandbox').source=r.files.find(x=>x.name==='AdminSandbox').source.replace(
   'Session.getActiveUser().getEmail()','Session.getEffectiveUser().getEmail()');},
  r=>{r.files.push({name:'UnknownRemoteGlobals',type:'SERVER_JS',source:'function copyAllData(){}'});},
  r=>{r.files.find(x=>x.name==='Index').source=r.files.find(x=>x.name==='Index').source+
   '<form><input name="realName"></form>';},
  r=>{r.files[0].source=privateManifest;}
 ]){
  const mutated=remote();mutation(mutated);
  assert.throws(()=>release.assertClosedPublicSources(mutated));
 }
});
test('An original OWNER deployment is mandatory and distinct from public deployment',()=>{
 const x=fixture();
 assert.equal(release.selectDeployments([x.owner]).private.deploymentId,privateId);
 assert.equal(release.selectDeployments([x.owner]).publicExisting,null);
 assert.throws(()=>release.selectDeployments([]));
 assert.throws(()=>release.selectDeployments([x.owner,x.owner]));
});
test('Public release uses private Drive backup and preserves existing owner /exec on successful anonymous check',async()=>{
 const x=fixture();
 const result=await release.publish(x.api,closedEnv,async url=>{
  assert.equal(url,'https://script.google.com/macros/s/AKfycbPublicReadOnlyUniqueId123/exec');
  return {status:200,privateViewStatuses:{team:200,admin:200,demo:200,preview:200}};
 });
 assert.equal(result.version,114);
 assert.equal(x.metrics().backup,1,'must backup original GAS before any mutation');
 assert.equal(x.metrics().mutation,1);
 assert.equal(x.metrics().createCalled,1);
 assert.equal(x.metrics().deleteCalled,0);
 assert.equal((await x.api.getDeployment(privateId)).deploymentConfig.versionNumber,113);
 assert.equal((await x.api.getVersion(113)).files[0].source,privateManifest);
 assert.equal(x.metrics().publicDeploy.deploymentConfig.description,release.PUBLIC_DESCRIPTION);
});
test('Failed anonymous external GET rolls back newly created public deployment without touching OWNER',async()=>{
 const x=fixture();
 await assert.rejects(release.publish(x.api,closedEnv,async()=>{throw Error('cannot open anonymously');}),
  /cannot open anonymously/);
 assert.equal(x.metrics().backup,1);
 assert.equal(x.metrics().createCalled,1);
 assert.equal(x.metrics().deleteCalled,1);
 assert.equal(x.metrics().publicDeploy,null);
 assert.equal((await x.api.getDeployment(privateId)).deploymentConfig.versionNumber,113);
});
test('Anonymous probes refuse login redirects and even a single leaked private owner view',async()=>{
 const url='https://script.google.com/macros/s/AKfycbPublicReadOnlyUniqueId123/exec';
 const fake=(route,body='official closed')=>({status:200,url:route,
  text:async()=>body});
 await assert.rejects(release.anonymousProbe(url,async()=>fake('https://accounts.google.com/login',
  '<html>Sign in to continue</html>')),/Anonymous/);
 await assert.rejects(release.anonymousProbe(url,async(route)=>{
  if(route.endsWith('?view=team'))return fake(route,'<section id="b03Module"></section>');
  return fake(route);
 }),/exposed private team/);
 const ok=await release.anonymousProbe(url,async(route)=>fake(route));
 assert.equal(ok.status,200);assert.deepEqual(Object.keys(ok.privateViewStatuses),
  ['team','admin','demo','preview']);
});

test('Public release GitHub workflow never edits existing private /exec, keeps secret off disk after use',()=>{
 const yaml=source('.github/workflows/study1-gas-public-release.yml');
 assert.match(yaml,/^on:\n  push:/m);
 assert.match(yaml,/workflow_run:/);
 assert.match(yaml,/group: study1-gas-source-sync/);
 assert.match(yaml,/cancel-in-progress: false/);
 assert.match(yaml,/secrets.CLASPRC_JSON/);
 assert.match(yaml,/persist-credentials: true/);
 assert.match(yaml,/rm -f "\$RUNNER_TEMP\/.clasprc.json"/);
 assert.doesNotMatch(yaml,/clasp push|publicPortals|makeAnyoneOwner/);
 const code=source('scripts/study1-gas-public-release.cjs');
 assert.match(code,/getDeployment\(PRIVATE_ID\)/);
 assert.doesNotMatch(code,/putDeployment\(PRIVATE_ID/);
 assert.match(code,/createDeployment\(/);
 assert.match(code,/anonymousProbe/);
 assert.match(code,/backupToDrive/);
});

test('New GAS /exec metadata may briefly 404 but must eventually match exact version and script',async()=>{
 let called=0,waited=0;
 const id='AKfycbPublicReadOnlyUniqueId123';
 const deployment={deploymentId:id,deploymentConfig:{
  scriptId:'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',
  versionNumber:114,manifestFileName:'appsscript'},
  entryPoints:[{webApp:{url:'https://script.google.com/macros/s/'+id+'/exec'}}]};
 const api={getDeployment:async()=>{
  called++;if(called<3)throw Error('GAS GET /deployments/id failed HTTP 404 (NOT_FOUND)');
  return deployment;
 }};
 const r=await release.waitForPublicDeployment(api,id,114,4,async()=>{waited++;});
 assert.equal(r.info.url,'https://script.google.com/macros/s/'+id+'/exec');
 assert.equal(called,3);assert.equal(waited,2);
 await assert.rejects(release.waitForPublicDeployment(
  {getDeployment:async()=>({...deployment,deploymentConfig:{...deployment.deploymentConfig,versionNumber:115}})},
  id,114,2,async()=>{}),/version changed/);
});
test('PUBLIC-CAS stale exact prewrite deployment eventually converges without accepting another version',async()=>{
 const id='AKfycbPublicReadOnlyUniqueId123',scriptId='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z';
 const mk=v=>({deploymentId:id,deploymentConfig:{scriptId,versionNumber:v,manifestFileName:'appsscript'},
  entryPoints:[{webApp:{url:'https://script.google.com/macros/s/'+id+'/exec'}}]});
 let calls=0,pauses=0;
 const api={getDeployment:async()=>mk(++calls<=2?114:118)};
 const ok=await release.waitForPublicDeployment(api,id,118,4,async()=>{pauses++;},114);
 assert.equal(ok.deployment.deploymentConfig.versionNumber,118);
 assert.equal(calls,3);assert.equal(pauses,2);
 await assert.rejects(release.waitForPublicDeployment({getDeployment:async()=>mk(115)},
  id,118,4,async()=>{},114),/another writer/,'a third-party version must never be retried');
 await assert.rejects(release.waitForPublicDeployment({getDeployment:async()=>mk(114)},
  id,118,2,async()=>{},114),/not yet converged/,'old version is never accepted as current');
});
test('PUBLIC-CAS competing writer prevents unsafe rollback of someone else\'s deployment',async()=>{
 const x=fixture(),description=release.PUBLIC_DESCRIPTION;
 await x.api.createDeployment({versionNumber:114,manifestFileName:'appsscript',description});
 const originalVersion=x.api.getVersion;
 const oldPublic=remote();
 oldPublic.files.find(x=>x.name==='Index').source='<html>previous official public page</html>';
 x.api.getVersion=async v=>v===113?originalVersion(v):v===114?structuredClone(oldPublic):remote();
 x.api.createVersion=async()=>({versionNumber:115});
 const originalPut=x.api.putDeployment;
 x.api.putDeployment=async(id,body)=>{
  if(body.versionNumber===115){
   await originalPut(id,body);
   // Another actor changes the effective version after this job's own update.
   return originalPut(id,{...body,versionNumber:116});
  }
  return originalPut(id,body);
 };
 await assert.rejects(release.publish(x.api,closedEnv,async()=>({status:200})),
  /another writer/);
 assert.equal(x.metrics().backup,1,'a private full backup precedes both updates');
 assert.equal(x.metrics().publicDeploy.deploymentConfig.versionNumber,116,
  'must not revert competitor version back to old 114');
 assert.equal(x.metrics().mutation,3,'pre-existing create, our update, competing update only');
});
test('Anonymous info may propagate but private-view exposure fails closed immediately',async()=>{
 let attempt=0,waited=0;
 const result=await release.waitForAnonymousAccess('https://script.google.com/macros/s/AKfycbPublicReadOnlyUniqueId123/exec',
  async()=>{attempt++;if(attempt<3)throw Error('Anonymous public information GET is not actually available');
   return {status:200,privateViewStatuses:{team:403,admin:403,demo:403,preview:403}};},
  4,async()=>{waited++;});
 assert.equal(result.status,200);assert.equal(waited,2);
 await assert.rejects(release.waitForAnonymousAccess('https://script.google.com/macros/s/AKfycbPublicReadOnlyUniqueId123/exec',
  async()=>{throw Error('Anonymous request exposed private team HTML');},4,async()=>{}),/exposed private team/);
});


test('Official page presents complete owner-published source PDF, researcher Q&A, signature, withdrawal and original copy without active collection',()=>{
 const index=source('gas/Index.html');
 const website=source('gas/Website.js');
 const admin=source('gas/AdminSandbox.js');
 // §70-S: public homepage is information only; no PDF signer or form belongs here.
 assert.doesNotMatch(index,/id="consent"/);
 assert.doesNotMatch(index,/知情同意是報名最後的步驟/);
 assert.match(index,/exec\?view=apply/);
 assert.doesNotMatch(index,/<(?:canvas|iframe|input|form|textarea)\\b/i);
 assert.doesNotMatch(index,/id="consent(?:Signature|Signer|Submit|AccessCode|PdfViewer)"/);
 assert.doesNotMatch(index,/initConsentPortal_/);
 assert.doesNotMatch(index,/<(?:form|textarea)\b/i);
 const inputs=[...index.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
 assert.equal(inputs.length,0);
 assert.doesNotMatch(index,/localStorage|sessionStorage|\.sendBeacon\(|fetch\(/);
 assert.match(website,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function getPublicConsentDocument\(experiment\)\{return study1ConsentPublicRead_\(experiment\);\}/);
 assert.match(admin,/if\(!fileId\)return \{available:false,experiment\}/);
 assert.match(admin,/if\(hash!==entry\.sha256\)throw Error\(/);
 assert.match(admin,/getParents\(\)/);
 assert.match(admin,/study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\);/);
 assert.doesNotThrow(()=>release.assertClosedPublicSources(remote()));
});
test('The public-release gate rejects a changed consent boundary, missing approved PDF GET or unauthorized private file exposure',()=>{
 for(const mutate of [
  r=>{const idx=r.files.find(x=>x.name==='Index');
   idx.source=idx.source.replace('href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=apply"','href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=demo"');},
  r=>{const site=r.files.find(x=>x.name==='Website');site.source=site.source.replace(
   'return study1ConsentPublicRead_(experiment);','return DriveApp.getFileById(experiment);');},
  r=>{const admin=r.files.find(x=>x.name==='AdminSandbox');admin.source=admin.source.replace(
   'if(hash!==entry.sha256)throw Error(', 'if(false)throw Error(');},
  r=>{const html=r.files.find(x=>x.name==='Index');html.source+='\n<form><input name="identity"></form>';}
 ]){
  const candidate=remote();mutate(candidate);
  assert.throws(()=>release.assertClosedPublicSources(candidate));
 }
});
test('Private owner source must converge before public deployment starts; delayed GAS versions are not concurrent writes',async()=>{
 const remoteLatest=remote();
 let calls=0,delays=0;
 const old=structuredClone(remoteLatest);
 old.files.find(x=>x.name==='Index').source='<html>old private page</html>';
 old.files.find(x=>x.name==='appsscript').source=privateManifest;
 const latest=structuredClone(remoteLatest);
 latest.files.find(x=>x.name==='appsscript').source=privateManifest;
 const deployment=version=>({deploymentId:privateId,deploymentConfig:{
   scriptId:'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z',
   versionNumber:version,manifestFileName:'appsscript'},
   entryPoints:[{webApp:{url:'https://script.google.com/macros/s/'+privateId+'/exec'}}]});
 const api={
  getDeployment:async()=>deployment(++calls<=2?117:119),
  getVersion:async v=>structuredClone(v===117?old:latest)
 };
 const result=await release.waitForReviewedPrivateVersion(api,remoteLatest,5,async()=>{delays++});
 assert.equal(result.deployment.deploymentConfig.versionNumber,119);
 assert.equal(calls,3);
 assert.equal(delays,2);
 assert.equal(result.immutable.files.find(x=>x.name==='Index').source,
   remoteLatest.files.find(x=>x.name==='Index').source);
 const stale={
  getDeployment:async()=>deployment(117),
  getVersion:async()=>structuredClone(old)
 };
 await assert.rejects(release.waitForReviewedPrivateVersion(stale,remoteLatest,2,async()=>{}),
  /has not converged/);
});
