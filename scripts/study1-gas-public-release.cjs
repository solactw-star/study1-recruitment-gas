'use strict';
/** Study1 original GAS Script ID, second PUBLIC-READONLY /exec audience only.
 * The existing versioned MYSELF /exec remains unchanged for the owner portal.
 * Public means INFORMATION ONLY. No real enrollment, mail, signatures, or Sheets.
 */
const fs=require('node:fs'),path=require('node:path');
const core=require('./study1-gas-index-preview.cjs');
const gate=require('./study1-gas-backend-allowlist.cjs');
const SCRIPT_ID=core.SCRIPT_ID;
const PRIVATE_ID='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
const PUBLIC_DESCRIPTION='Study1 OFFICIAL public information | enrollment CLOSED | V1';
const check=(value,message)=>{if(!value)throw Error(message)};
const script=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const one=(files,name,type)=>core.file(files,name,type);
function assertEnvironment(env){
 check(env.GITHUB_REPOSITORY==='solactw-star/study1-recruitment-gas','Wrong GitHub repository');
 check(env.GITHUB_REPOSITORY_PRIVATE==='true','Refuse nonprivate source repository');
 check(env.GITHUB_REF==='refs/heads/main','Only current main can publish');
 check(env.STUDY1_PUBLIC_INFO_RELEASE==='OWNER_APPROVED_2026_11_09','No explicit public information release authorization');
}
function assertClosedPublicSources(remote){
 check(remote&&Array.isArray(remote.files),'Missing complete remote GAS source');
 // Never publish unknown or unreviewed callable remote-only modules, even when
 // the private sync workflow conservatively preserves their source bytes.
 const reviewed=new Set(['appsscript','Index','Website','AdminSandbox','AdminConsole',
  'Study1Flow','Study1Unified','OtpCore','BookingCore','OtpThrottle',
  'OtpTransaction','BookingHoldTransaction','Study1FixtureAdapter',
  'Study1Visitor','Study1Team','Study1PdfLib','Study1PdfStampCore']);
 check(remote.files.length===reviewed.size&&
  remote.files.every(x=>reviewed.has(x.name))&&
  new Set(remote.files.map(x=>x.name)).size===reviewed.size,
  'Unknown GAS module found; public release requires explicit global RPC review');
 const idx=one(remote.files,'Index','HTML').source;
 const site=one(remote.files,'Website','SERVER_JS').source;
 const admin=one(remote.files,'AdminSandbox','SERVER_JS').source;
 const flow=one(remote.files,'Study1Flow','SERVER_JS').source;
 const manifest=JSON.parse(one(remote.files,'appsscript','JSON').source);
 check(manifest.webapp?.executeAs==='USER_DEPLOYING'&&
  manifest.webapp?.access==='ANYONE_ANONYMOUS','GAS HEAD must be public-info-capable but no source has been deployed publicly');
 core.assertIndex(idx);gate.assertClosedWebsite(site);
 const sourceMap={
  Index:['HTML','gas/Index.html'],Website:['SERVER_JS','gas/Website.js'],
  AdminSandbox:['SERVER_JS','gas/AdminSandbox.js'],
  AdminConsole:['HTML','gas/AdminConsole.html'],
  Study1Flow:['SERVER_JS','gas/Study1Unified.js'],
  Study1Unified:['HTML','gas/Study1Unified.html'],
  OtpCore:['SERVER_JS','gas/OtpCore.js'],BookingCore:['SERVER_JS','gas/BookingCore.js'],
  OtpThrottle:['SERVER_JS','gas/OtpThrottle.js'],
  OtpTransaction:['SERVER_JS','gas/OtpTransaction.js'],
  BookingHoldTransaction:['SERVER_JS','gas/BookingHoldTransaction.js'],
  Study1FixtureAdapter:['SERVER_JS','gas/Study1FixtureAdapter.js'],
  Study1Visitor:['HTML','gas/Study1Visitor.html'],
  Study1Team:['HTML','gas/Study1Team.html'],
  Study1PdfLib:['SERVER_JS','gas/Study1PdfLib.js'],
  Study1PdfStampCore:['SERVER_JS','gas/Study1PdfStampCore.js']
 };
 for(const [name,[type,filename]] of Object.entries(sourceMap)){
  check(one(remote.files,name,type).source===script(filename),
   'Original GAS remote source diverged from reviewed GitHub main: '+name);
 }
 check(!idx.includes('id="consent"')&&!idx.includes('href="#consent"')&&
  idx.includes('href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=apply"')&&
  !/view=demo|Demo|虛構|純TEST/.test(idx),'Public page must route to the FORMAL CLOSED product, not Demo or standalone consent');
 check(!/<(?:form|textarea)\b/i.test(idx),'Public site has no active collection form');
 const inputs=[...idx.matchAll(/<input\\b[^>]*>/gi)].map(x=>x[0]);
 check(inputs.length===0,'Public homepage must not accept identity/signature inputs');
 check(!idx.includes('完整閱讀研究文件，再決定是否同意')&&
  !idx.includes('知情同意是報名最後的步驟')&&
  !idx.includes('class="container faq"')&&
  !/id="consent(?:Signature|Signer|Submit|AccessCode|PdfViewer)"/.test(idx)&&
  !/<(?:canvas|iframe)\\b/i.test(idx)&&!idx.includes('initConsentPortal_'),
  'Signing interface may not be exposed on public information homepage');
 check(site.includes("function getPublicConsentDocument(experiment){return study1ConsentPublicRead_(experiment);}")&&
  admin.includes("function study1ConsentPublicRead_(experiment){")&&
  admin.includes("function study1ConsentVersionPublication(input){")&&
  admin.includes("study1ConsentDocumentBytes_(entry)")&&
  admin.includes("if(hash!==entry.sha256)throw Error(")&&
  admin.includes("file.getSharingAccess()!==DriveApp.Access.PRIVATE"),
  'Public PDF can only originate from explicitly published private SHA-verified original');
 check(site.includes("function requestOtp(){return rejectIntake_();}")&&
  site.includes("function submitConsent(){return rejectIntake_();}")&&
  site.includes("function holdSlot(){return rejectIntake_();}")&&
  site.includes("function listSlots(){return [];}"),
  'Any live enrollment API is an absolute blocker');
 for(const route of ["view==='admin'","view==='team'","view==='preview'","view==='demo'"]){
  check(site.includes(route),'Missing protected route '+route);
 }
 check(admin.includes("Session.getActiveUser().getEmail()")&&
  admin.includes("Session.getEffectiveUser().getEmail()")&&
  admin.includes("effective!==STUDY1_ADMIN_OWNER_||active!==STUDY1_ADMIN_OWNER_"),
  'The original OWNER must be verified as ACTIVE and EFFECTIVE caller; public access forbidden otherwise');
 for(const fn of ['adminGetSandboxConfig','adminSaveSandboxConfig','adminGetTestBookings','adminChangeTestBooking','study1ConsentVersionPublication']){
  const pos=admin.indexOf('function '+fn+'(');
  check(pos>=0&&admin.slice(pos,pos+200).includes('study1AdminOwnerRequired_();'),
   'Unprotected admin RPC: '+fn);
 }
 for(const fn of ['study1UnifiedPreviewGet','study1UnifiedPreviewCommand','study1UnifiedPreviewSelfTest']){
  const pos=flow.indexOf('function '+fn+'(');
  check(pos>=0&&flow.slice(pos,pos+250).includes('study1UnifiedAssertOwner_();'),
   'Unprotected owner RPC: '+fn);
 }
 return {idx,manifest};
}
function selectDeployments(all){
 const original=all.filter(x=>x.deploymentId===PRIVATE_ID);
 const publicOne=all.filter(x=>x.deploymentConfig?.description===PUBLIC_DESCRIPTION);
 check(original.length===1&&publicOne.length<=1,'Private or official public deployment conflict');
 return {private:original[0],publicExisting:publicOne[0]||null};
}
async function readVersion(api,deployment){
 const v=deployment?.deploymentConfig?.versionNumber;
 check(Number.isInteger(v)&&v>0,'Missing effective deployment version');
 return api.getVersion(v);
}
async function waitForReviewedPrivateVersion(api,reviewed,attempts=15,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const digest=core.digest(reviewed.files.filter(x=>x.name!=='appsscript'));
 for(let attempt=0;attempt<attempts;attempt++){
  const deployment=await api.getDeployment(PRIVATE_ID);
  core.deploymentCheck(deployment,PRIVATE_ID);
  const immutable=await readVersion(api,deployment);
  const manifest=JSON.parse(one(immutable.files,'appsscript','JSON').source);
  const bytesMatch=core.digest(immutable.files.filter(x=>x.name!=='appsscript'))===digest;
  if(manifest.webapp?.access==='MYSELF'&&manifest.webapp?.executeAs==='USER_ACCESSING'&&bytesMatch)
   return {deployment,immutable};
  if(attempt<attempts-1)await pause(1000);
 }
 throw Error('Private owner source has not converged with reviewed main; public release blocked');
}

async function anonymousProbe(url,fetcher=fetch){
 check(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url),
  'Public URL is not the expected GAS /exec');
 const res=await fetcher(url,{redirect:'follow',signal:AbortSignal.timeout(25000)});
 const text=await res.text();
 check(res.status===200&&!/accounts\.google\.com/.test(res.url)&&
  !/Sign in to continue|需要登入|Request access|您需要存取權限/.test(text),
  'Anonymous public information GET is not actually available');
 const privateViews=['team','admin','demo','preview'];
 const blocked={};
 for(const view of privateViews){
  const probe=await fetcher(url+'?view='+view,{redirect:'follow',signal:AbortSignal.timeout(25000)});
  const body=await probe.text();
  check(!/id="b03Module"|id="profileModule"|id="calendarModule"|id="step-otp"|id="adminTabs"|id="adminPanel"/.test(body),
   'Anonymous request exposed private '+view+' HTML');
  blocked[view]=probe.status;
 }
 return {status:res.status,privateViewStatuses:blocked,contentLength:text.length};
}
async function waitForPublicDeployment(api,id,version,attempts=24,pause=ms=>new Promise(done=>setTimeout(done,ms)),previousVersion=null){
 let last;
 for(let i=0;i<attempts;i++){
  try{
   const deployed=await api.getDeployment(id);
   // Only the exact pre-write version may be briefly stale. A different
   // version means another writer: never retry or treat it as convergence.
   const observed=deployed?.deploymentConfig?.versionNumber;
   if(observed!==version){
    check(Number.isInteger(observed)&&observed>0,'Invalid public deployment version metadata');
    core.deploymentCheck(deployed,id,observed);
    check(Number.isInteger(previousVersion)&&observed===previousVersion,
     'Public deployment version changed by another writer: expected '+version+', observed '+observed);
    last=Error('Public deployment not yet converged: expected '+version+', still '+previousVersion);
    if(i<attempts-1){await pause(Math.min(2000,600+100*i));continue;}
    throw last;
   }
   const info=core.deploymentCheck(deployed,id,version);
   return {deployment:deployed,info};
  }catch(e){
   last=e;
   // Newly created GAS deployment metadata is sometimes temporarily 404.
   // Never retry permission errors, stale version mismatches or any other failure.
   if(!/HTTP 404|NOT_FOUND|Requested entity was not found|Expected one existing \/exec entry point/.test(String(e)))throw e;
   if(i<attempts-1)await pause(Math.min(2000,600+100*i));
  }
 }
 throw Error('New public deployment was never independently readable: '+String(last?.message||last));
}
async function waitForAnonymousAccess(url,probe,attempts=14,pause=ms=>new Promise(done=>setTimeout(done,ms))){
 let last;
 for(let i=0;i<attempts;i++){
  try{return await probe(url);}
  catch(e){
   last=e;
   // Private route exposure is a permanent safety failure, never retried.
   const message=String(e?.message||e);
   if(!/Anonymous public information GET is not actually available|fetch failed|HTTP 404/.test(message))throw e;
   if(i<attempts-1)await pause(Math.min(2000,700+150*i));
  }
 }
 throw Error('Public anonymous information never became available: '+String(last?.message||last));
}
async function publish(api,env,probe=anonymousProbe){
 assertEnvironment(env);
 const remote=await api.getContent();
 assertClosedPublicSources(remote);
 const remoteSha=core.digest(remote.files),all=await api.deployments();
 const {private:owner,publicExisting}=selectDeployments(all);
 const reviewedPrivate=await waitForReviewedPrivateVersion(api,remote);
 const privateFull=reviewedPrivate.deployment;
 const privateBefore=reviewedPrivate.immutable;
 console.log('PRIVATE_OWNER_SOURCE_CONVERGED=true',privateFull.deploymentConfig.versionNumber);
 check(JSON.parse(one(privateBefore.files,'appsscript','JSON').source).webapp?.access==='MYSELF',
  'Original owner deployment is not private, STOP');
 const privateVersion=privateFull.deploymentConfig.versionNumber;
 let oldPublic=publicExisting?await api.getDeployment(publicExisting.deploymentId):null;
 if(oldPublic){
  const old=await readVersion(api,oldPublic);
  check(JSON.parse(one(old.files,'appsscript','JSON').source).webapp?.access==='ANYONE_ANONYMOUS',
   'Existing official public deployment audience changed');
 }
 const deployedOld=oldPublic?await readVersion(api,oldPublic):null;
 const needsUpdate=!deployedOld||core.digest(deployedOld.files)!==remoteSha;
 const before={at:new Date().toISOString(),scriptId:SCRIPT_ID,sourceMain:env.GITHUB_SHA||'',
  original:remote,remoteSha256:remoteSha,originalPrivateDeployment:privateFull,
  publicDeploymentBefore:oldPublic,publicUpdateRequired:needsUpdate};
 if(!needsUpdate){console.log('PUBLIC_INFO_ALREADY_CURRENT=true URL',oldPublic.entryPoints?.[0]?.webApp?.url);
  return {publicUrl:oldPublic.entryPoints?.[0]?.webApp?.url,sha:remoteSha,unchanged:true};}
 const backup=await api.backupToDrive(before);
 check(backup?.id&&backup.sha256,'Missing PRIVATE Drive prewrite backup');
 await api.verifyDriveBackup(backup.id,backup.sha256);
 console.log('PUBLIC_INFO_PRIVATE_PREWRITE_BACKUP_ID:',backup.id);
 const current=await api.getContent();
 check(core.digest(current.files)===remoteSha,'GAS HEAD changed after private backup');
 check(JSON.stringify(await api.getDeployment(PRIVATE_ID))===JSON.stringify(privateFull),
  'Private owner deployment changed while publishing');
 if(oldPublic)check(JSON.stringify(await api.getDeployment(oldPublic.deploymentId))===JSON.stringify(oldPublic),
  'Public deployment changed while publishing');
 const ver=await api.createVersion('Study1 REC-gated PUBLIC information ONLY; no enrollment ('+String(env.GITHUB_SHA||'').slice(0,12)+')');
 check(Number.isInteger(ver.versionNumber)&&ver.versionNumber>privateVersion,'Invalid public version');
 const immutable=await api.getVersion(ver.versionNumber);
 check(core.digest(immutable.files)===remoteSha,'Public immutable version differs from approved original GAS source');
 check(JSON.parse(one(immutable.files,'appsscript','JSON').source).webapp?.access==='ANYONE_ANONYMOUS',
  'Public immutable version lacks explicit anonymous information access');
 let created=null,changed=false;
 try{
  if(oldPublic){
   await api.putDeployment(oldPublic.deploymentId,{...oldPublic.deploymentConfig,versionNumber:ver.versionNumber});
   changed=true;
  }else{
   created=await api.createDeployment({versionNumber:ver.versionNumber,
    manifestFileName:'appsscript',description:PUBLIC_DESCRIPTION});
   changed=true;
  }
  const depId=oldPublic?oldPublic.deploymentId:created?.deploymentId;
  check(depId&&depId!==PRIVATE_ID,'Missing separate official public deployment ID');
  const {info}=await waitForPublicDeployment(api,depId,ver.versionNumber,24,undefined,
    oldPublic?.deploymentConfig?.versionNumber||null);
  const final=await api.getContent();
  check(core.digest(final.files)===remoteSha,'Original GAS HEAD changed after public deployment');
  const ownerAfter=await api.getDeployment(PRIVATE_ID);
  check(JSON.stringify(ownerAfter)===JSON.stringify(privateFull),'Original private OWNER deployment was touched');
  const privateAfter=await readVersion(api,ownerAfter);
  check(JSON.parse(one(privateAfter.files,'appsscript','JSON').source).webapp?.access==='MYSELF',
   'Owner audience changed unexpectedly after public release');
  const anonymous=await waitForAnonymousAccess(info.url,probe);
  console.log('PUBLIC_INFO_URL:',info.url);
  console.log('PUBLIC_INFO_VERSION:',ver.versionNumber);
  console.log('PUBLIC_INFO_SHA256:',remoteSha);
  console.log('PUBLIC_INFO_ANONYMOUS_HTTP:',JSON.stringify(anonymous));
  console.log('PRIVATE_OWNER_STILL_MYSELF=true; OPEN=false; CONSENT_READY=false; REAL_CONSENT_DISABLED=true');
  console.log('PUBLIC_INFO_RELEASE_VERIFIED=true');
  return {url:info.url,version:ver.versionNumber,sha:remoteSha,backupId:backup.id};
 }catch(error){
  if(changed)try{
   // Do not roll back an independently updated deployment.
   const targetId=oldPublic?.deploymentId||created?.deploymentId;
   const currentDeployment=await api.getDeployment(targetId);
   if(currentDeployment?.deploymentConfig?.versionNumber!==ver.versionNumber){
    console.log('PUBLIC_RELEASE_ROLLBACK_BLOCKED_COMPETING_WRITE=true');
   }else{
    core.deploymentCheck(currentDeployment,targetId,ver.versionNumber);
    if(oldPublic)await api.putDeployment(oldPublic.deploymentId,oldPublic.deploymentConfig);
    else if(created?.deploymentId)await api.deleteDeployment(created.deploymentId);
    console.log('PUBLIC_RELEASE_ROLLBACK_ATTEMPTED=true; refusal:',String(error.message));
   }
  }catch(rollbackError){console.log('PUBLIC_RELEASE_ROLLBACK_FAILED:',String(rollbackError.message));}
  throw error;
 }
}
if(require.main===module)core.authorizedApi().then(api=>publish(api,process.env)).catch(e=>{console.error('PUBLIC_DEPLOYMENT_BLOCKED:',e.message);process.exitCode=1;});
module.exports={assertEnvironment,assertClosedPublicSources,selectDeployments,waitForReviewedPrivateVersion,anonymousProbe,waitForPublicDeployment,waitForAnonymousAccess,publish,PUBLIC_DESCRIPTION,PRIVATE_ID};
