'use strict';
// Push-driven allowlisted Index + CLOSED Website sync. All other GAS files are preserved.
// Never push GitHub's entire gas directory. No user action is required per Index update.
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-gas-index-preview.cjs');
const backend=require('./study1-gas-backend-allowlist.cjs');
const driveBackup=require('./study1-gas-drive-backup.cjs');
const id=core.SCRIPT_ID;
const ensure=(v,message)=>{if(!v)throw Error(message)};
const snapPath=()=>path.join(process.env.RUNNER_TEMP,'study1-auto-index-snapshot.json');
const fields=f=>({name:f.name,type:f.type,source:f.source});
const same=(a,b)=>core.digest(a)===core.digest(b);
/**
 * Bind the verified private Drive backup to EXACTLY the pre-write remote HEAD,
 * deployment, and source snapshot to be used by this workflow invocation.
 * A valid Drive file with a valid SHA is not enough if it belongs to another run.
 */
function assertBackupBinding(snapshot){
 ensure(snapshot&&Array.isArray(snapshot.original?.files),'Missing original GAS HEAD');
 ensure(core.digest(snapshot.original.files)===snapshot.remoteSha256,
  'Prewrite backup original GAS HEAD digest mismatch');
 if(snapshot.approvedSourceChanged||snapshot.deploymentChanged){
  ensure(snapshot.backup&&/^[a-f0-9]{64}$/.test(snapshot.backup.sha256||'')&&
   typeof snapshot.backup.id==='string','Missing verified private Drive backup');
  const prewrite={...snapshot};delete prewrite.backup;
  ensure(driveBackup.sha256(JSON.stringify(prewrite,null,2))===snapshot.backup.sha256,
   'Private Drive backup not bound to exact prewrite snapshot');
  ensure(snapshot.deployment?.deploymentId===snapshot.deploymentId&&
   snapshot.deployment?.deploymentConfig?.versionNumber===snapshot.oldVersion,
   'Prewrite backup deployment and version mismatch');
 }
 return true;
}
function targetDeployment(deployments){
 const d=deployments.filter(z=>z?.deploymentConfig?.scriptId===id&&
  Number.isInteger(z.deploymentConfig.versionNumber)&&z.deploymentConfig.versionNumber>0&&
  (z.entryPoints||[]).some(p=>typeof p.webApp?.url==='string'&&/\/exec(?:\?|$)/.test(p.webApp.url)));
 const target=d.filter(z=>/Study\s*1\s*網站私人預覽\s*V1/.test(z.deploymentConfig.description||'')&&z.deploymentConfig.versionNumber>=2);
 ensure(target.length===1,'Expected exactly one approved Study 1 網站私人預覽 V1 deployment; do not modify older test URLs');
 return target[0];
}
function assertEvent(env){
 ensure(env.GITHUB_REPOSITORY==='solactw-star/study1-recruitment-gas','Wrong repository');
 ensure(env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='push','Not a main push');
 ensure(env.GITHUB_REPOSITORY_PRIVATE==='true','Repository is not private');
 ensure(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||''),'Missing exact triggering commit SHA');
}
async function prepare(api,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter){
 core.assertIndex(indexSource);backend.assertClosedWebsite(websiteSource);backend.assertAdminSandbox(adminScript);backend.assertAdminHtml(adminHtml);backend.assertUnifiedFlow(unifiedScript);backend.assertUnifiedHtml(unifiedHtml);backend.assertOtpCore(otpCore);backend.assertBookingCore(bookingCore);
 backend.assertTransactionKernel(otpThrottle,'93fc0adb2e45b90d75f092109b204dce51ac6ee1','OtpThrottle');
 backend.assertTransactionKernel(otpTransaction,'85e554cab2c6767fd80545b8c6e573c99e750a9e','OtpTransaction');
 backend.assertTransactionKernel(bookingHoldTransaction,'1f12a687625ceb72414227451853a900e3dab692','BookingHoldTransaction');
 backend.assertFixtureAdapter(fixtureAdapter);
 const remote=await api.getContent();core.assertRemote(remote);
 const candidates=await api.deployments();
 console.log('GAS deployment metadata:',JSON.stringify(candidates.map(z=>({idPrefix:String(z.deploymentId||'').slice(0,9),version:z.deploymentConfig?.versionNumber,scriptIdMatches:z.deploymentConfig?.scriptId===id,manifest:z.deploymentConfig?.manifestFileName,description:z.deploymentConfig?.description||'',updateTime:z.updateTime||'',entryPointTypes:(z.entryPoints||[]).map(p=>({type:p.entryPointType,hasWebApp:!!p.webApp,urlShape:p.webApp?.url?{exec:/\/exec(?:\?|$)/.test(p.webApp.url),dev:/\/dev(?:\?|$)/.test(p.webApp.url)}:null}))}))));
 const current=targetDeployment(candidates);
 const dep=await api.getDeployment(current.deploymentId);
 const old=core.deploymentCheck(dep,current.deploymentId,current.deploymentConfig.versionNumber);
 const deployedContent=await api.getVersion(current.deploymentConfig.versionNumber);
 const depManifest=JSON.parse(core.file(deployedContent.files,'appsscript','JSON').source);
 const headManifest=JSON.parse(core.file(remote.files,'appsscript','JSON').source);
 const permissionMatch=JSON.stringify(depManifest.webapp)===JSON.stringify(headManifest.webapp);
 console.log('Existing deployment audience:',depManifest.webapp?.access,'GAS HEAD audience:',headManifest.webapp?.access,'safe to version:',permissionMatch);
 const updated=backend.mergeApproved(core,remote,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 const approvedSourceChanged=!same(remote.files,updated);
 const deployedIndex=core.file(deployedContent.files,'Index','HTML').source;
 const deployedWebsite=core.file(deployedContent.files,'Website','SERVER_JS').source;
 const deployedAdmin=deployedContent.files.find(f=>f.name==='AdminSandbox'&&f.type==='SERVER_JS')?.source;
 const deployedAdminHtml=deployedContent.files.find(f=>f.name==='AdminConsole'&&f.type==='HTML')?.source;
 const deployedUnified=deployedContent.files.find(f=>f.name==='Study1Flow'&&f.type==='SERVER_JS')?.source;
 const deployedUnifiedHtml=deployedContent.files.find(f=>f.name==='Study1Unified'&&f.type==='HTML')?.source;
 const visitorHtml=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
 const deployedVisitorHtml=deployedContent.files.find(f=>f.name==='Study1Visitor'&&f.type==='HTML')?.source;
 const teamHtml=fs.readFileSync(path.join(__dirname,'../gas/Study1Team.html'),'utf8');
 const deployedTeamHtml=deployedContent.files.find(f=>f.name==='Study1Team'&&f.type==='HTML')?.source;
 const deployedOtpCore=deployedContent.files.find(f=>f.name==='OtpCore'&&f.type==='SERVER_JS')?.source;
 const deployedBookingCore=deployedContent.files.find(f=>f.name==='BookingCore'&&f.type==='SERVER_JS')?.source;
 const deployedOtpThrottle=deployedContent.files.find(f=>f.name==='OtpThrottle'&&f.type==='SERVER_JS')?.source;
 const deployedOtpTransaction=deployedContent.files.find(f=>f.name==='OtpTransaction'&&f.type==='SERVER_JS')?.source;
 const deployedBookingHoldTransaction=deployedContent.files.find(f=>f.name==='BookingHoldTransaction'&&f.type==='SERVER_JS')?.source;
 const deployedFixtureAdapter=deployedContent.files.find(f=>f.name==='Study1FixtureAdapter'&&f.type==='SERVER_JS')?.source;
 const deploymentChanged=deployedIndex!==indexSource||deployedWebsite!==websiteSource||deployedAdmin!==adminScript||deployedAdminHtml!==adminHtml||deployedUnified!==unifiedScript||deployedUnifiedHtml!==unifiedHtml||deployedVisitorHtml!==visitorHtml||deployedTeamHtml!==teamHtml||deployedOtpCore!==otpCore||deployedBookingCore!==bookingCore||deployedOtpThrottle!==otpThrottle||deployedOtpTransaction!==otpTransaction||deployedBookingHoldTransaction!==bookingHoldTransaction||deployedFixtureAdapter!==fixtureAdapter;
 if(!permissionMatch&&deploymentChanged)console.log('DEPLOYMENT_ACCESS_PRESERVE: original /exec access will be retained when making an immutable version');
 console.log('CURRENT_DEPLOYED_VERSION:',current.deploymentConfig.versionNumber,'DEPLOYED_INDEX_MATCHES_GITHUB:',!deploymentChanged);
 const snapshot={scriptId:id,triggerSha:process.env.GITHUB_SHA||'',readAt:new Date().toISOString(),
  original:remote,remoteSha256:core.digest(remote.files),desiredSha256:core.digest(updated),
  indexSha256:core.sha(indexSource),websiteSha256:core.sha(websiteSource),adminScriptSha256:core.sha(adminScript),adminHtmlSha256:core.sha(adminHtml),unifiedScriptSha256:core.sha(unifiedScript),unifiedHtmlSha256:core.sha(unifiedHtml),visitorHtmlSha256:core.sha(visitorHtml),teamHtmlSha256:core.sha(teamHtml),otpCoreSha256:core.sha(otpCore),bookingCoreSha256:core.sha(bookingCore),otpThrottleSha256:core.sha(otpThrottle),
  otpTransactionSha256:core.sha(otpTransaction),bookingHoldTransactionSha256:core.sha(bookingHoldTransaction),
  fixtureAdapterSha256:core.sha(fixtureAdapter),deployment:dep,deploymentId:dep.deploymentId,
  oldVersion:current.deploymentConfig.versionNumber,oldUrl:old.url,approvedSourceChanged,deploymentChanged,permissionMatch,deployedWebapp:depManifest.webapp};
 if(approvedSourceChanged||deploymentChanged){
  snapshot.backup=await api.backupToDrive(snapshot);
  console.log('Verified 828 Drive backup ID:',snapshot.backup.id);
 }
 assertBackupBinding(snapshot);
 fs.writeFileSync(snapPath(),JSON.stringify(snapshot,null,2),{mode:0o600});
 console.log('GAS remote HEAD SHA256:',snapshot.remoteSha256);
 console.log('GAS proposed HEAD SHA256:',snapshot.desiredSha256);
 console.log('Selected existing deployment:',snapshot.deploymentId,'old version:',snapshot.oldVersion);
 console.log('Approved source update required:',approvedSourceChanged,'deployment update required:',deploymentChanged);
 return snapshot;
}
function compareNoIndex(a,b){
 const omit=fs=>fs.filter(x=>x.name!=='Index').map(fields);
 return same(omit(a),omit(b));
}
function compareUnapproved(a,b){
 const approved=new Set(['Index','Website','AdminSandbox','AdminConsole','Study1Flow','Study1Unified','Study1Visitor','Study1Team','OtpCore','BookingCore','OtpThrottle','OtpTransaction','BookingHoldTransaction','Study1FixtureAdapter']);
 const omit=fs=>fs.filter(x=>!approved.has(x.name)).map(fields);
 return same(omit(a),omit(b));
}
async function waitForVersion(api,deploymentId,expected,attempts=25,pause=ms=>new Promise(done=>setTimeout(done,ms))){
 let latest;
 for(let i=0;i<attempts;i++){
   latest=await api.getDeployment(deploymentId);
   const observed=latest?.deploymentConfig?.versionNumber;
   if(observed===expected)return latest;
   ensure(Number.isInteger(observed)&&observed<expected,'Unexpected deployment version change after update');
   if(i<attempts-1)await pause(Math.min(2000,500+250*i));
 }
 throw Error('Deployment update not visible after repeated readback');
}
async function apply(api,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter,s){
 ensure(s.scriptId===id&&s.triggerSha===process.env.GITHUB_SHA&&s.indexSha256===core.sha(indexSource)&&s.websiteSha256===core.sha(websiteSource)&&s.adminScriptSha256===core.sha(adminScript)&&s.adminHtmlSha256===core.sha(adminHtml)&&s.unifiedScriptSha256===core.sha(unifiedScript)&&s.unifiedHtmlSha256===core.sha(unifiedHtml)&&s.visitorHtmlSha256===core.sha(fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8'))&&s.teamHtmlSha256===core.sha(fs.readFileSync(path.join(__dirname,'../gas/Study1Team.html'),'utf8'))&&s.otpCoreSha256===core.sha(otpCore)&&s.bookingCoreSha256===core.sha(bookingCore)&&
 s.otpThrottleSha256===core.sha(otpThrottle)&&s.otpTransactionSha256===core.sha(otpTransaction)&&
 s.bookingHoldTransactionSha256===core.sha(bookingHoldTransaction)&&
 s.fixtureAdapterSha256===core.sha(fixtureAdapter),'Snapshot mismatch');
 assertBackupBinding(s);
 core.assertIndex(indexSource);backend.assertClosedWebsite(websiteSource);backend.assertAdminSandbox(adminScript);backend.assertAdminHtml(adminHtml);backend.assertUnifiedFlow(unifiedScript);backend.assertUnifiedHtml(unifiedHtml);backend.assertOtpCore(otpCore);backend.assertBookingCore(bookingCore);
 backend.assertTransactionKernel(otpThrottle,'93fc0adb2e45b90d75f092109b204dce51ac6ee1','OtpThrottle');
 backend.assertTransactionKernel(otpTransaction,'85e554cab2c6767fd80545b8c6e573c99e750a9e','OtpTransaction');
 backend.assertTransactionKernel(bookingHoldTransaction,'1f12a687625ceb72414227451853a900e3dab692','BookingHoldTransaction');
 backend.assertFixtureAdapter(fixtureAdapter);
 if(s.approvedSourceChanged||s.deploymentChanged){
  ensure(s.backup&&typeof s.backup.id==='string'&&typeof s.backup.sha256==='string','Missing permanent 828 backup');
  await api.verifyDriveBackup(s.backup.id,s.backup.sha256);
 }
 // Fetch again immediately before mutation. Never write through a stale snapshot.
 const remote=await api.getContent();core.assertRemote(remote);
 ensure(core.digest(remote.files)===s.remoteSha256,'GAS was edited while the job ran; no write');
 const dep=await api.getDeployment(s.deploymentId);
 core.deploymentCheck(dep,s.deploymentId,s.oldVersion);
 ensure(JSON.stringify(dep)===JSON.stringify(s.deployment),'Existing /exec was changed while the job ran');
 const desired=backend.mergeApproved(core,remote,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 ensure(core.digest(desired)===s.desiredSha256,'Proposed content changed since backup');
 if(!s.approvedSourceChanged&&!s.deploymentChanged){
   console.log('SYNC_VERIFIED=true; already identical GAS HEAD and existing /exec version');
   return {status:'already-current',id:s.deploymentId,version:s.oldVersion,sha:s.desiredSha256};
 }
 // Preserve entire remote file set; send only editable File fields from HEAD.
 if(s.approvedSourceChanged){
   const result=await api.putContent(desired.map(fields));
   ensure(same(result.files,desired),'GAS updateContent response does not match the proposed content');
 }
 const reloaded=await api.getContent();core.assertRemote(reloaded);
 ensure(same(reloaded.files,desired),'GAS HEAD readback differs; DO NOT deploy');
 ensure(compareUnapproved(reloaded.files,s.original.files),'Unapproved GAS files unexpectedly modified; DO NOT deploy');
 let newVersion,expectedVersionFiles=desired;
 if(!s.permissionMatch){
   // Existing /exec is MYSELF, while HEAD is ANYONE_ANONYMOUS. Preserve both:
   // temporarily stage only the previous deployed webapp settings for immutable
   // version creation, then restore HEAD from the verified backup BEFORE deployment.
   ensure(s.deployedWebapp?.access==='MYSELF'&&['USER_DEPLOYING','USER_ACCESSING'].includes(s.deployedWebapp?.executeAs),'Unexpected owner-private deployment audience');
   const ownerAuthWebapp={access:'MYSELF',executeAs:'USER_ACCESSING'};
   // Execute-as-deployer may redact ActiveUser; the private MYSELF deployment
   // must authorize the accessing owner. Public read-only deployment stays intact.
   const manifest=core.file(desired,'appsscript','JSON');
   const stagedManifest=JSON.parse(manifest.source);
   const oldWebapp=JSON.parse(core.file(s.original.files,'appsscript','JSON').source).webapp;
   ensure(oldWebapp?.access==='ANYONE_ANONYMOUS'&&oldWebapp?.executeAs==='USER_DEPLOYING','GAS HEAD audience unexpectedly changed');
   stagedManifest.webapp=ownerAuthWebapp;
   const staged=structuredClone(desired);
   core.file(staged,'appsscript','JSON').source=JSON.stringify(stagedManifest,null,2);
   ensure(compareNoIndex(staged,desired)===false,'Temporary manifest staging not detected');
   expectedVersionFiles=staged;
   try{
     const prior=await api.getContent();
     ensure(same(prior.files,desired),'HEAD changed before temporary permission-preserving staging');
     await api.putContent(staged.map(fields));
     const stagedRead=await api.getContent();
     ensure(same(stagedRead.files,staged),'Staged version source mismatch; do not deploy');
     newVersion=await api.createVersion('Study1 existing-access preview auto-sync ('+process.env.GITHUB_SHA.slice(0,12)+')');
     ensure(Number.isInteger(newVersion.versionNumber)&&newVersion.versionNumber>s.oldVersion,'Version creation returned an invalid version');
     const stagedVersion=await api.getVersion(newVersion.versionNumber);
     ensure(same(stagedVersion.files,staged),'Immutable version differs from staged content');
   }finally{
     // Always restore original HEAD manifest. Refuse to overwrite any unexpected
     // concurrent edits; backup artifact contains the complete pre-write HEAD.
     const live=await api.getContent();
     if(same(live.files,staged))await api.putContent(desired.map(fields));
     else ensure(same(live.files,desired),'Concurrent GAS edit during staging; unsafe to restore automatically');
     const restored=await api.getContent();core.assertRemote(restored);
     ensure(same(restored.files,desired)&&compareUnapproved(restored.files,s.original.files),'Original GAS HEAD settings were not fully restored');
     console.log('GAS HEAD restored to original testing audience; other source files preserved.');
   }
 }else{
   newVersion=await api.createVersion('Study1 closed preview auto-sync approved sources ('+process.env.GITHUB_SHA.slice(0,12)+')');
 }
 ensure(newVersion&&Number.isInteger(newVersion.versionNumber)&&newVersion.versionNumber>s.oldVersion,'Version creation failed');
 const immutable=await api.getVersion(newVersion.versionNumber);
 ensure(same(immutable.files,expectedVersionFiles),'New version does not match the intended Index and existing deployment audience');
 const ownerAudience=JSON.stringify({access:'MYSELF',executeAs:'USER_ACCESSING'});
 ensure(JSON.stringify(JSON.parse(core.file(immutable.files,'appsscript','JSON').source).webapp)===ownerAudience,'Private owner deployment must require active user authorization');
 const current=await api.getDeployment(s.deploymentId);
 console.log('DEPLOYMENT_BEFORE_UPDATE:',current.deploymentConfig?.versionNumber,'expected:',s.oldVersion,'newly created:',newVersion.versionNumber);
 core.deploymentCheck(current,s.deploymentId,s.oldVersion);
 ensure(JSON.stringify(current)===JSON.stringify(s.deployment),'Deployment changed before update; DO NOT deploy');
 await api.putDeployment(s.deploymentId,{...current.deploymentConfig,versionNumber:newVersion.versionNumber});
 const finalDeployment=await waitForVersion(api,s.deploymentId,newVersion.versionNumber);
 console.log('DEPLOYMENT_AFTER_UPDATE:',finalDeployment.deploymentConfig?.versionNumber,'expected:',newVersion.versionNumber);
 const details=core.deploymentCheck(finalDeployment,s.deploymentId,newVersion.versionNumber);
 ensure(details.url===s.oldUrl,'Existing /exec URL changed unexpectedly');
 const deployed=await api.getVersion(newVersion.versionNumber);
 ensure(same(deployed.files,expectedVersionFiles),'The deployed version differs from approved sources / preserved audience');
 const final=await api.getContent();
 ensure(same(final.files,desired)&&compareUnapproved(final.files,s.original.files),'Final GAS HEAD mismatch');
 console.log('OWNER_PRIVATE_EXECUTION=USER_ACCESSING; MYSELF only; public deployment untouched');
 console.log('SYNC_VERIFIED=true; original /exec deployment preserved; version',newVersion.versionNumber,'sha256',s.desiredSha256);
 return {status:'deployed',id:s.deploymentId,version:newVersion.versionNumber,sha:s.desiredSha256};
}
async function main(){
 assertEvent(process.env);
 const phase=process.argv[2];ensure(phase==='prepare'||phase==='apply','Invalid execution phase');
 const indexSource=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8');
 const websiteSource=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
 const adminScript=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
 const adminHtml=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
 const unifiedScript=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.js'),'utf8');
 const unifiedHtml=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.html'),'utf8');
 const otpCore=fs.readFileSync(path.join(__dirname,'../gas/OtpCore.js'),'utf8');
 const bookingCore=fs.readFileSync(path.join(__dirname,'../gas/BookingCore.js'),'utf8');
 const otpThrottle=fs.readFileSync(path.join(__dirname,'../gas/OtpThrottle.js'),'utf8');
 const otpTransaction=fs.readFileSync(path.join(__dirname,'../gas/OtpTransaction.js'),'utf8');
 const bookingHoldTransaction=fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
 const fixtureAdapter=fs.readFileSync(path.join(__dirname,'../gas/Study1FixtureAdapter.js'),'utf8');
 const api=await core.authorizedApi();
 if(phase==='prepare')return prepare(api,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 const s=JSON.parse(fs.readFileSync(snapPath(),'utf8'));
 return apply(api,indexSource,websiteSource,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter,s);
}
if(require.main===module)main().catch(e=>{console.error('AUTO_GAS_SYNC_BLOCKED: '+e.message);process.exitCode=1});
module.exports={assertEvent,targetDeployment,assertBackupBinding,compareNoIndex,compareUnapproved,waitForVersion,prepare,apply,fields};
