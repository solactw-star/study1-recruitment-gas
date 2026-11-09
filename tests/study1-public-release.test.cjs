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
 webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}});
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
