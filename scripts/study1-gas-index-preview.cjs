'use strict';
// Authenticated Google Apps Script API; no clasp push or GitHub gas/ full-directory upload.
// updateContent itself is full-set replacement: use the *remote* files and alter Index.source alone.
// GAS API does not provide atomic compare-and-swap; final re-read minimizes concurrent-edit risk.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const driveBackup=require('./study1-gas-drive-backup.cjs');
const SCRIPT_ID='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z';
const CONFIRM='I_AUTHORIZE_STUDY1_EXISTING_EXEC_INDEX_ONLY';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function check(x,msg){if(!x)throw Error(msg);}
function canonical(files){
  check(Array.isArray(files)&&files.length>0,'Missing complete GAS files');
  const seen=new Set();
  return files.map(f=>{
    check(f&&typeof f.name==='string'&&typeof f.type==='string'&&typeof f.source==='string','Invalid GAS file');
    check(!seen.has(f.name),'Duplicate remote GAS file');
    seen.add(f.name);
    return [f.name,f.type,f.source];
  }).sort((a,b)=>a[0].localeCompare(b[0],'en')).map(x=>JSON.stringify(x)).join('\n');
}
const digest=files=>sha(canonical(files));
function file(files,name,type){
  const a=files.filter(f=>f.name===name&&f.type===type);
  check(a.length===1,'Missing or duplicate '+name+' ('+type+')');return a[0];
}
function assertIndex(s){
  for(const token of ['<base target="_top">','event.preventDefault()','scrollIntoView({','target.focus({preventScroll:true})','研究計畫聯絡人：賴詩潔','03-256-3414','tel:+88632563414','mailto:lily4318@cycu.edu.tw','研究計畫主持人：葉理豪','03-265-3413','tel:+88632653413','mailto:lhyeh@cycu.edu.tw' ,'href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=apply"']) check(s.includes(token),'Missing approved site content: '+token);
  const anchors=[...s.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
  check(anchors.join(',')==='main,home,about,apply,contact,apply,about','Public recruitment navigation links changed');
  for(const id of new Set(anchors))check(s.includes('id="'+id+'"'),'Missing anchor target');
  for(const token of ['03-264-3413','03-264-3414','psy.shihchieh@gmail.com','葉理豪副教授'])check(!s.includes(token),'Obsolete contact in Index');
  check(!/<(?:form|textarea)\b/i.test(s),'No unauthenticated collection form');
  const inputs=[...s.matchAll(/<input\\b[^>]*>/gi)].map(x=>x[0]);
  check(inputs.length===0,'Public introduction must not render identity or signature inputs');
  check(!s.includes('id="consent"')&&!s.includes('href="#consent"')&&
    !s.includes('完整閱讀研究文件，再決定是否同意')&&
    !s.includes('知情同意是報名最後的步驟')&&
    s.includes('href="https://script.google.com/macros/s/AKfycbwJv-Gne_31fjJHFoEkkXzAFns3g5RS1lMYT2ooUO1BQJejDsRbfBE4svr5S0cz43s/exec?view=apply"')&&
    !/id="consent(?:Signature|Signer|Submit|AccessCode|PdfViewer)"/.test(s)&&
    !/<(?:canvas|iframe)\\b/i.test(s)&&!s.includes('initConsentPortal_')&&
    !/<(?:form|textarea)\\b/i.test(s),
    'Formal consent cannot be signed on the public information homepage');
}
function assertRemote(head){
  check(head&&Array.isArray(head.files),'Missing GAS HEAD');canonical(head.files);
  const originalIndex=file(head.files,'Index','HTML');
  const server=file(head.files,'Website','SERVER_JS').source;
  const manifest=JSON.parse(file(head.files,'appsscript','JSON').source);
  check(manifest.webapp?.access==='ANYONE_ANONYMOUS'&&manifest.webapp?.executeAs==='USER_DEPLOYING','Testing access or execution setting has changed; refuse to change permissions');
  for(const token of ['function getPublicConfig(){return {open:false,consentReady:false','function requestOtp(){return rejectIntake_();}','function verifyOtp(){return rejectIntake_();}','function holdSlot(){return rejectIntake_();}','function submitConsent(){return rejectIntake_();}','function listSlots(){return [];}', 'function doGet']) check(server.includes(token),'Remote CLOSED mode cannot be verified');
  return {originalIndex,manifest};
}
function deploymentCheck(dep,id,version){
  check(dep?.deploymentId===id,'Unexpected deployment ID');
  const c=dep.deploymentConfig;
  check(c?.scriptId===SCRIPT_ID&&c?.manifestFileName==='appsscript'&&Number.isInteger(c?.versionNumber)&&c.versionNumber>0,'Not an existing versioned project deployment');
  if(version!==undefined)check(c.versionNumber===version,'Deployment version changed');
  const urls=(dep.entryPoints||[]).filter(p=>typeof p.webApp?.url==='string'&&/\/exec(?:\?|$)/.test(p.webApp.url));
  check(urls.length===1,'Expected one existing /exec entry point');
  return {url:urls[0].webApp.url,config:c};
}
function config(env){
  const mode=env.SYNC_MODE;check(mode==='audit'||mode==='apply','Mode must be audit or apply');
  const c={mode,expectedRemote:env.EXPECTED_REMOTE_SHA256||'',deploymentId:env.DEPLOYMENT_ID||'',expectedVersion:Number(env.EXPECTED_VERSION||0),confirmation:env.AUTHORIZATION||''};
  if(mode==='apply'){
    check(c.confirmation===CONFIRM,'Missing additional explicit apply authorization');
    check(/^[0-9a-f]{64}$/.test(c.expectedRemote),'Need the full GAS SHA256 from the earlier audit');
    check(/^[A-Za-z0-9_-]{20,}$/.test(c.deploymentId),'Need exact pre-existing deployment ID');
    check(Number.isSafeInteger(c.expectedVersion)&&c.expectedVersion>0,'Need existing deployment version');
  }
  return c;
}
function merge(remote,indexSource){
  const files=structuredClone(remote.files);
  file(files,'Index','HTML').source=indexSource;
  check(digest(files.filter(f=>f.name!=='Index'))===digest(remote.files.filter(f=>f.name!=='Index')),'Unrelated remote file changed');
  return files;
}
function storedCredentials(s){
  const j=JSON.parse(s);
  const c=j.tokens?.default||(j.token&&j.oauth2ClientSettings?{...j.token,client_id:j.oauth2ClientSettings.clientId,client_secret:j.oauth2ClientSettings.clientSecret}:null);
  check(c&&typeof c.refresh_token==='string'&&typeof c.client_id==='string'&&typeof c.client_secret==='string','Existing default OAuth refresh credentials unsupported; do not recreate secret');
  return c;
}
async function authorizedApi(){
  const c=storedCredentials(fs.readFileSync(process.env.CLASPRC_PATH,'utf8'));
  const params=new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:c.client_id,client_secret:c.client_secret});
  const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(20000)});
  check(auth.ok,'Existing OAuth refresh failed HTTP '+auth.status);
  const token=(await auth.json()).access_token;
  check(typeof token==='string'&&token.length>30,'OAuth access token not returned');
  const base='https://script.googleapis.com/v1/projects/'+encodeURIComponent(SCRIPT_ID);
  async function request(method,p,body){
    const res=await fetch(base+p,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(!res.ok){
      let errorCode='NO_DETAILS',reason='unspecified';
      try{
        const response=await res.json();
        errorCode=String(response?.error?.status||'UNKNOWN').slice(0,50);
        reason=String(response?.error?.message||'unspecified').replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,400);
      }catch(_e){}
      throw Error('GAS '+method+' '+p.split('?')[0]+' failed HTTP '+res.status+
       ' ('+errorCode+'): '+reason+'; no successful mutation assumed');
    }
    return res.status===204?{}:res.json();
  }
  return {
    backupToDrive:snapshot=>driveBackup.create(fetch,token,snapshot),
    verifyDriveBackup:(id,hash)=>driveBackup.verify(fetch,token,id,hash),
    verifyDriveBackupPrivate:(id,hash)=>driveBackup.verifyPrivate(fetch,token,id,hash),
    getContent:()=>request('GET','/content'),
    getVersion:v=>request('GET','/content?versionNumber='+v),
    putContent:files=>request('PUT','/content',{files}),
    createVersion:description=>request('POST','/versions',{description}),
    getDeployment:id=>request('GET','/deployments/'+encodeURIComponent(id)),
    putDeployment:(id,c)=>request('PUT','/deployments/'+encodeURIComponent(id),{deploymentConfig:c}),
    createDeployment:config=>request('POST','/deployments',config),
    deleteDeployment:id=>request('DELETE','/deployments/'+encodeURIComponent(id)),
    deployments:async()=>{let all=[],next='';for(let i=0;i<20;i++){const p=await request('GET','/deployments?pageSize=50'+(next?'&pageToken='+encodeURIComponent(next):''));all.push(...(p.deployments||[]));if(!p.nextPageToken)return all;next=p.nextPageToken;}throw Error('Too many deployments to audit safely');}
  };
}
async function prepare(api,c,indexSource){
  assertIndex(indexSource);
  const original=await api.getContent(),{manifest}=assertRemote(original);
  const proposed=merge(original,indexSource),remoteDigest=digest(original.files),proposedDigest=digest(proposed);
  check(remoteDigest!==proposedDigest,'GAS Index already matches GitHub; nothing to change');
  const deploymentList=(await api.deployments()).filter(d=>d.deploymentConfig?.scriptId===SCRIPT_ID && (d.entryPoints||[]).some(p=>/\/exec(?:\?|$)/.test(p.webApp?.url||''))).map(d=>({id:d.deploymentId,version:d.deploymentConfig.versionNumber}));
  let oldDeployment=null;
  if(c.mode==='apply'){
    check(remoteDigest===c.expectedRemote,'GAS source changed since the earlier audit');
    oldDeployment=await api.getDeployment(c.deploymentId);
    deploymentCheck(oldDeployment,c.deploymentId,c.expectedVersion);
    const version=await api.getVersion(c.expectedVersion);
    const webapp=JSON.parse(file(version.files,'appsscript','JSON').source).webapp;
    check(JSON.stringify(webapp)===JSON.stringify(manifest.webapp),'Deployed permission differs from GAS HEAD: stop rather than change access');
  }
  return {scriptId:SCRIPT_ID,readAt:new Date().toISOString(),original,remoteDigest,proposedDigest,indexSha256:sha(indexSource),deploymentList,oldDeployment,mode:c.mode};
}
async function apply(api,c,snapshot,indexSource){
  check(c.mode==='apply'&&c.confirmation===CONFIRM,'Not authorized to write');
  check(snapshot.scriptId===SCRIPT_ID&&snapshot.mode==='apply'&&snapshot.remoteDigest===c.expectedRemote&&snapshot.indexSha256===sha(indexSource),'Prepared snapshot mismatch');
  const now=await api.getContent();assertRemote(now);
  check(digest(now.files)===snapshot.remoteDigest,'Concurrent GAS edit since backup: no write');
  const dep=await api.getDeployment(c.deploymentId);
  const old=deploymentCheck(dep,c.deploymentId,c.expectedVersion);
  check(JSON.stringify(dep)===JSON.stringify(snapshot.oldDeployment),'Deployment changed since backup: no write');
  const proposed=merge(now,indexSource);
  check(digest(proposed)===snapshot.proposedDigest,'Prepared candidate differs: no write');
  // Whole-set API semantics; every non-Index original remote File is retained exactly.
  await api.putContent(proposed);
  const after=await api.getContent();assertRemote(after);
  check(digest(after.files)===snapshot.proposedDigest,'GAS HEAD readback mismatch. Do NOT deploy; recover using backup');
  check(digest(after.files.filter(f=>f.name!=='Index'))===digest(snapshot.original.files.filter(f=>f.name!=='Index')),'Unrelated file changed. Do NOT deploy');
  const newVersion=await api.createVersion('Study1 CLOSED private preview Index-only navigation and contacts');
  check(Number.isInteger(newVersion.versionNumber)&&newVersion.versionNumber>0,'Cannot verify version creation; do NOT deploy');
  const version=await api.getVersion(newVersion.versionNumber);
  check(digest(version.files)===snapshot.proposedDigest,'Created version content mismatch; do NOT deploy');
  const beforeDeploy=await api.getDeployment(c.deploymentId);
  deploymentCheck(beforeDeploy,c.deploymentId,c.expectedVersion);
  check(JSON.stringify(beforeDeploy)===JSON.stringify(dep),'Deployment was edited concurrently; stop');
  await api.putDeployment(c.deploymentId,{...old.config,versionNumber:newVersion.versionNumber});
  const updated=await api.getDeployment(c.deploymentId);
  const verified=deploymentCheck(updated,c.deploymentId,newVersion.versionNumber);
  check(verified.url===old.url,'The original /exec URL changed');
  check(digest((await api.getContent()).files)===snapshot.proposedDigest,'Post-deployment HEAD changed; verification failed');
  return {deploymentId:c.deploymentId,version:newVersion.versionNumber,digest:snapshot.proposedDigest};
}
async function main(){
  check(process.env.GITHUB_REPOSITORY==='solactw-star/study1-recruitment-gas'&&process.env.GITHUB_REF==='refs/heads/main','Wrong repo or branch');
  const op=process.argv[2];check(op==='prepare'||op==='apply','Usage: prepare|apply');
  const c=config(process.env),indexSource=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8');
  const api=await authorizedApi(),snapshotPath=path.join(process.env.RUNNER_TEMP,'study1-preview-gas-snapshot.json');
  if(op==='prepare'){
    const s=await prepare(api,c,indexSource);
    fs.writeFileSync(snapshotPath,JSON.stringify(s,null,2),{mode:0o600});
    console.log('GAS HEAD SHA256:',s.remoteDigest,'proposed SHA256:',s.proposedDigest);
    console.log('Current /exec deployments (ID + version only):',JSON.stringify(s.deploymentList));
    console.log('AUDIT ONLY; no source write or deployment.');
  }else{
    const s=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
    const result=await apply(api,c,s,indexSource);
    console.log('SYNC_VERIFIED=true; original deployment ID='+result.deploymentId+'; version='+result.version+'; HEAD SHA256='+result.digest);
  }
}
if(require.main===module)main().catch(e=>{console.error('Study1 sync stopped: '+e.message);process.exitCode=1;});
module.exports={SCRIPT_ID,CONFIRM,sha,digest,file,assertIndex,assertRemote,deploymentCheck,config,merge,storedCredentials,authorizedApi,prepare,apply};
