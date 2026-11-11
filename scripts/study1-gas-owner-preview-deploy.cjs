'use strict';
/**
 * Study1 §70-S.14 single-purpose PRIVATE owner preview deployment.
 * Runs ONLY from explicitly authorized PR #133 branch, never main.
 * Reuses original GAS Script ID and original private /exec deployment.
 * Does not change public /exec, formal Sheets, REC, OPEN or CONSENT_READY.
 */
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-gas-index-preview.cjs');
const backend=require('./study1-gas-backend-allowlist.cjs');
const backups=require('./study1-gas-drive-backup.cjs');
const SCRIPT_ID=core.SCRIPT_ID;
const REPO='solactw-star/study1-recruitment-gas';
const BRANCH='fix/consent-last-preserve-wizard-20261110';
const PRIVATE_ID='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
const SNAP=()=>path.join(process.env.RUNNER_TEMP,'study1-pr133-owner-preview-prewrite.json');
function must(v,m){if(!v)throw Error('OWNER_PREVIEW_BLOCKED: '+m);}
function filesOf(source){return source.map(f=>({name:f.name,type:f.type,source:f.source}));}
function ensureInvocation(){
 must(process.env.GITHUB_REPOSITORY===REPO,'repository mismatch');
 must(process.env.GITHUB_REF==='refs/heads/'+BRANCH,'not isolated branch');
 must(process.env.GITHUB_EVENT_NAME==='push','not explicitly pinned push');
 must(process.env.GITHUB_REPOSITORY_PRIVATE==='true','not private');
 must(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||''),'invalid exact SHA');
}
function checkFrontEnd(source){
 must(source.startsWith('<!doctype html>'),'no reviewed Index');
 must(source.includes('href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=apply"')&&!source.includes('id="consent"')&&
  !source.includes('href="#consent"'),'Index must link to FORMAL enrollment without standalone consent');
 must(!/id="consentSignature"|id="consentSubmit"|initConsentPortal_|<canvas\b|<form\b|<textarea\b/i.test(source),
  'public Index can collect identity or signatures');
}
function reviewSources(){
 const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const sources=[{name:'Index',type:'HTML',source:get('gas/Index.html')}];
 for(const f of backend.APPROVED_BACKEND)sources.push({...f,source:get(f.path)});
 must(sources.length===backend.APPROVED_BACKEND.length+1,'unexpected source allowlist');
 const m=new Set();
 for(const f of sources){
  must(!m.has(f.name),'duplicate source name '+f.name);m.add(f.name);
  must(typeof f.source==='string'&&f.source.length>0,'empty source '+f.name);
 }
 const map=new Map(sources.map(x=>[x.name,x.source]));
 checkFrontEnd(map.get('Index'));
 backend.assertClosedWebsite(map.get('Website'));
 backend.assertAdminSandbox(map.get('AdminSandbox'));
 backend.assertAdminHtml(map.get('AdminConsole'));
 backend.assertUnifiedFlow(map.get('Study1Flow'));
 backend.assertUnifiedHtml(map.get('Study1Unified'));
 backend.assertVisitorHtml(map.get('Study1Visitor'));
 backend.assertTeamHtml(map.get('Study1Team'));
 backend.assertOtpCore(map.get('OtpCore'));
 backend.assertBookingCore(map.get('BookingCore'));
 backend.assertFixtureAdapter(map.get('Study1FixtureAdapter'));
 for(const [name,hash] of [
  ['OtpThrottle','93fc0adb2e45b90d75f092109b204dce51ac6ee1'],
  ['OtpTransaction','85e554cab2c6767fd80545b8c6e573c99e750a9e'],
  ['BookingHoldTransaction','d15375bb4ea6825231cca60cd2ab9cbb28a4f024']])
   backend.assertTransactionKernel(map.get(name),hash,name);
 must(map.get('Study1Visitor').includes("document.body.dataset.siteMode!=='FORMAL'")&&
  map.get('Study1Visitor').includes('study1ParticipantReadiness()')&&
  map.get('Study1Visitor').includes('function formalConsentLoadPdf_()'),
  'original seven-step FORMAL enrollment controller missing');
 must(map.get('Study1Visitor').includes('id="v05Dates"')&&
  map.get('Study1Visitor').includes('id="v08WaitBox"'),
  'V05/V08 not preserved');
 must(map.get('Study1WizardEnrollment').includes('function study1WizardIntakeAuthority_(request){')&&
  map.get('Study1WizardEnrollment').includes('throw Error(')&&
  map.get('Study1WizardEnrollment').includes('function study1WizardOtpSendBound_(r){'),
  'OTP intake authority/issuer not pinned');
 must(map.get('Study1EConsentBinding').includes('function study1EConsentIdentityAttestation_(request,heldLock){')&&
  map.get('Study1EConsentBinding').includes('SELF_REPORT_OTP_SOURCE_NOT_CONFIGURED')&&
  map.get('Study1EConsentBinding').includes('return study1SelfReportedAuthority_(request,heldLock);'),
  'self-reported E1 applicant must still have consumed OTP and locked binding');
 must(map.get('Study1WizardP0Bridge').includes('SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED'),
  'source-based E1/E2 slot mapping must remain fail-closed');
 must(map.get('Study1EConsentOtpAdapter').includes('OTP_SUPERSEDED'),
  'stale OTP rejection missing');
 must(map.get('Website').includes('function requestOtp(){return rejectIntake_();}')&&
  map.get('Website').includes('function submitConsent(){return rejectIntake_();}'),
  'public intake must remain unconditionally closed');
 return sources;
}
function merge(old,sources){
 const out=structuredClone(filesOf(old.files));
 const allowed=new Set(sources.map(f=>f.name));
 for(const f of sources){
  const matches=out.filter(x=>x.name===f.name);
  must(matches.length<=1&&matches.every(x=>x.type===f.type),
   'remote name/type collision '+f.name);
  if(matches.length)matches[0].source=f.source;
  else out.push({name:f.name,type:f.type,source:f.source});
 }
 const keep=x=>x.filter(f=>!allowed.has(f.name));
 must(core.digest(keep(old.files))===core.digest(keep(out)),
  'unapproved GAS source modified');
 return out;
}
function privateAudience(files){
 const manifest=JSON.parse(core.file(files,'appsscript','JSON').source);
 return manifest.webapp;
}
function stagedOwnerOnly(desired){
 const stage=structuredClone(desired);
 const manifest=JSON.parse(core.file(stage,'appsscript','JSON').source);
 must(manifest.webapp?.access==='ANYONE_ANONYMOUS'&&
  manifest.webapp?.executeAs==='USER_DEPLOYING',
  'unexpected GAS HEAD manifest audience');
 manifest.webapp={access:'MYSELF',executeAs:'USER_ACCESSING'};
 core.file(stage,'appsscript','JSON').source=JSON.stringify(manifest,null,2);
 return stage;
}
function privateTarget(list){
 const found=list.filter(d=>d.deploymentId===PRIVATE_ID&&
  d.deploymentConfig?.scriptId===SCRIPT_ID);
 must(found.length===1,'original private deployment not unique');
 return found[0];
}
function stableDeployments(list){
 return list.map(z=>({id:z.deploymentId,version:z.deploymentConfig?.versionNumber,
  scriptId:z.deploymentConfig?.scriptId}))
 .sort((a,b)=>a.id.localeCompare(b.id,'en'));
}

/** Deployment list may lag a matching GET-by-id. Only PRIVATE old-version lag is tolerated. */
function classifyOwnerInventory_(baseline,live,targetVersion){
 must(Array.isArray(baseline)&&Array.isArray(live),'deployment inventory malformed');
 const current=stableDeployments(live),old=baseline.find(x=>x.id===PRIVATE_ID);
 must(old&&baseline.filter(x=>x.id===PRIVATE_ID).length===1&&
  old.scriptId===SCRIPT_ID&&Number.isInteger(old.version)&&
  Number.isInteger(targetVersion)&&targetVersion>old.version,
  'original private deployment baseline invalid');
 must(current.length===baseline.length&&
  new Set(current.map(x=>x.id)).size===current.length&&
  new Set(baseline.map(x=>x.id)).size===baseline.length,
  'deployment inventory has missing, extra or duplicate IDs');
 let observed=null;
 for(let i=0;i<baseline.length;i++){
  const before=baseline[i],after=current[i];
  must(before.id===after.id&&before.scriptId===after.scriptId,
   'deployment inventory ID/script changed');
  if(before.id===PRIVATE_ID){
   must(after.version===old.version||after.version===targetVersion,
    'private deployment unexpectedly changed to another version');
   observed=after.version;
  }else must(before.version===after.version,
   'public or other deployment version changed');
 }
 return observed===targetVersion;
}
async function waitForOwnerInventory_(api,baseline,targetVersion,
 attempts=20,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 must(Number.isInteger(attempts)&&attempts>=1&&attempts<=30,
  'invalid inventory poll bound');
 for(let i=0;i<attempts;i++){
  if(classifyOwnerInventory_(baseline,await api.deployments(),targetVersion))
   return true;
  if(i+1<attempts)await pause(Math.min(2000,500+i*200));
 }
 throw Error('OWNER_PREVIEW_PRIVATE_INVENTORY_STALE: GET-only audit required; no blind retry');
}
/** Never roll back HEAD once putDeployment is attempted: rejected calls may still commit. */
async function recoverOwnerPreview_(api,s,updateAttempted){
 if(updateAttempted){
  console.error('OWNER_PREVIEW_POST_DEPLOY_UNCERTAIN: no HEAD rollback or retry; GET-only audit required');
  return 'POST_DEPLOY_READONLY_AUDIT_REQUIRED';
 }
 const live=await api.getContent(),hash=core.digest(live.files);
 const dep=await api.getDeployment(PRIVATE_ID),inv=stableDeployments(await api.deployments());
 if(JSON.stringify(dep)!==JSON.stringify(s.deployment)||
    JSON.stringify(inv)!==JSON.stringify(s.deployments)){
  console.error('OWNER_PREVIEW_RECOVERY_BLOCKED: deployment changed; no remote write');
  return 'CONCURRENT_DEPLOYMENT_NO_MUTATION';
 }
 if(hash===s.originalSha)return 'ORIGINAL_HEAD_ALREADY_PRESENT';
 if(hash!==s.desiredSha&&hash!==s.stageSha){
  console.error('OWNER_PREVIEW_RECOVERY_BLOCKED: HEAD changed; no overwrite');
  return 'UNEXPECTED_HEAD_NO_MUTATION';
 }
 await api.putContent(filesOf(s.original.files));
 must(core.digest((await api.getContent()).files)===s.originalSha,
  'pre-update HEAD restore readback mismatch');
 console.error('OWNER_PREVIEW_FAIL_CLOSED: original HEAD restored before deployment update attempt');
 return 'PRE_DEPLOY_HEAD_RESTORED';
}
async function prepare(api,sources){
 const original=await api.getContent();core.assertRemote(original);
 const deployed=await api.deployments();
 const target=privateTarget(deployed);
 const prior=await api.getDeployment(PRIVATE_ID);
 must(prior.deploymentConfig?.versionNumber===target.deploymentConfig.versionNumber,
  'private deployment metadata changed');
 const oldV=await api.getVersion(prior.deploymentConfig.versionNumber);
 const webapp=privateAudience(oldV.files);
 must(webapp?.access==='MYSELF'&&webapp?.executeAs==='USER_ACCESSING',
  'existing private /exec audience not verified');
 const oldUrl=core.deploymentCheck(prior,PRIVATE_ID).url;
 must(oldUrl.includes(PRIVATE_ID),'private URL mismatch');
 const desired=merge(original,sources);
 const stage=stagedOwnerOnly(desired);
 const snapshot={scriptId:SCRIPT_ID,branch:BRANCH,triggerSha:process.env.GITHUB_SHA,
  readAt:new Date().toISOString(),original,
  originalSha:core.digest(original.files),desiredSha:core.digest(desired),
  stageSha:core.digest(stage),deployment:prior,
  deployments:stableDeployments(deployed),oldVersion:prior.deploymentConfig.versionNumber,
  oldUrl,reviewedFiles:sources.map(x=>({name:x.name,type:x.type,sha256:core.sha(x.source)}))};
 snapshot.backup=await api.backupToDrive(snapshot);
 await api.verifyDriveBackup(snapshot.backup.id,snapshot.backup.sha256);
 must(core.digest((await api.getContent()).files)===snapshot.originalSha,
  'GAS HEAD changed during backup');
 must(JSON.stringify(await api.getDeployment(PRIVATE_ID))===JSON.stringify(prior),
  'private deployment changed during backup');
 fs.writeFileSync(SNAP(),JSON.stringify(snapshot,null,2),{mode:0o600});
 console.log('PREWRITE_VERIFIED=true');
 console.log('GAS_PREWRITE_SOURCE_SHA256='+snapshot.originalSha);
 console.log('GAS_OWNER_PREVIEW_OLD_VERSION='+snapshot.oldVersion);
 console.log('GAS_PRIVATE_BACKUP_ID='+snapshot.backup.id);
 console.log('SOURCE_HEAD='+snapshot.triggerSha);
}
async function apply(api,sources){
 const s=JSON.parse(fs.readFileSync(SNAP(),'utf8'));
 must(s.scriptId===SCRIPT_ID&&s.branch===BRANCH&&
  s.triggerSha===process.env.GITHUB_SHA,'prepared source SHA changed');
 const desired=merge(s.original,sources),stage=stagedOwnerOnly(desired);
 must(core.digest(desired)===s.desiredSha&&core.digest(stage)===s.stageSha,
  'local source changed since backup');
 await api.verifyDriveBackup(s.backup.id,s.backup.sha256);
 const original=await api.getContent();core.assertRemote(original);
 must(core.digest(original.files)===s.originalSha,
  'GAS HEAD changed since prewrite backup');
 const prior=await api.getDeployment(PRIVATE_ID);
 must(JSON.stringify(prior)===JSON.stringify(s.deployment),
  'private deployment changed since prewrite backup');
 const beforeList=await api.deployments();
 must(JSON.stringify(stableDeployments(beforeList))===JSON.stringify(s.deployments),
  'deployment inventory changed since prewrite backup');
 let begun=false,committed=false,version=null,updateAttempted=false;
 try{
  begun=true;
  await api.putContent(filesOf(desired));
  must(core.digest((await api.getContent()).files)===s.desiredSha,
   'GAS HEAD writeback mismatch');
  await api.putContent(filesOf(stage));
  must(core.digest((await api.getContent()).files)===s.stageSha,
   'owner MYSELF temporary manifest readback mismatch');
  version=await api.createVersion('Study1 PR133 owner-only preview '+s.triggerSha.slice(0,12));
  must(Number.isInteger(version.versionNumber)&&version.versionNumber>s.oldVersion,
   'immutable version invalid');
  const immutable=await api.getVersion(version.versionNumber);
  must(core.digest(immutable.files)===s.stageSha&&
   JSON.stringify(privateAudience(immutable.files))===
    JSON.stringify({access:'MYSELF',executeAs:'USER_ACCESSING'}),
   'immutable owner-only version differs from verified source');
  // Restore the original public HEAD manifest before touching any deployment.
  await api.putContent(filesOf(desired));
  must(core.digest((await api.getContent()).files)===s.desiredSha,
   'failed to restore original HEAD audience');
  const privateBefore=await api.getDeployment(PRIVATE_ID);
  must(JSON.stringify(privateBefore)===JSON.stringify(s.deployment),
   'original private deployment was modified concurrently');
  must(JSON.stringify(stableDeployments(await api.deployments()))===
   JSON.stringify(s.deployments),'deployment inventory altered concurrently');
  // Mark before await: a timeout can mean the update already committed.
  updateAttempted=true;
  await api.putDeployment(PRIVATE_ID,{
    ...privateBefore.deploymentConfig,versionNumber:version.versionNumber});
  // GAS deployment API can be eventually consistent. The immediate GET may
  // still show the old version after a successful update; poll before judging.
  const autoIndex=require('./study1-gas-auto-index.cjs');
  const after=await autoIndex.waitForVersion(api,PRIVATE_ID,version.versionNumber);
  core.deploymentCheck(after,PRIVATE_ID,version.versionNumber);
  must(core.deploymentCheck(after,PRIVATE_ID).url===s.oldUrl,
   'private original /exec URL altered');
  // Bounded GET-only convergence; any non-private drift still fails immediately.
  await waitForOwnerInventory_(api,s.deployments,version.versionNumber);
  const confirmed=await autoIndex.waitForVersion(api,PRIVATE_ID,version.versionNumber);
  must(core.deploymentCheck(confirmed,PRIVATE_ID).url===s.oldUrl,
   'post-inventory private URL altered');
  must(core.digest((await api.getVersion(version.versionNumber)).files)===s.stageSha,
   'deployed version readback failed');
  must(core.digest((await api.getContent()).files)===s.desiredSha,
   'GAS HEAD post-deployment readback failed');
  committed=true;
  console.log('OWNER_PREVIEW_DEPLOY_VERIFIED=true');
  console.log('GAS_OWNER_PRIVATE_URL='+s.oldUrl);
  console.log('GAS_OWNER_PRIVATE_VERSION='+version.versionNumber);
  console.log('GAS_OWNER_PRIVATE_SHA256='+s.stageSha);
  console.log('GAS_PUBLIC_DEPLOYMENT_CHANGED=false');
  console.log('GAS_ORIGINAL_HEAD_MANIFEST_PRESERVED=true');
  console.log('UI_VERIFIED=NOT_VERIFIED (human browser required)');
 }finally{
  if(begun&&!committed){
   // No HEAD rollback after an attempted deployment update; do GET-only audit.
   try{await recoverOwnerPreview_(api,s,updateAttempted);}
   catch(e){console.error('OWNER_PREVIEW_RECOVERY_BLOCKED: '+e.message);}
  }
 }
 must(committed,'owner preview was not verified');
}
async function main(){
 ensureInvocation();
 const op=process.argv[2];
 must(op==='prepare'||op==='apply','invalid phase');
 const sources=reviewSources();
 const api=await core.authorizedApi();
 if(op==='prepare')await prepare(api,sources);
 else await apply(api,sources);
}
if(require.main===module)main().catch(err=>{
 console.error('OWNER_PREVIEW_DEPLOY_FAILED: '+err.message);
 process.exitCode=1;
});
module.exports={reviewSources,checkFrontEnd,merge,stagedOwnerOnly,privateTarget,stableDeployments,
 classifyOwnerInventory_,waitForOwnerInventory_,recoverOwnerPreview_};
