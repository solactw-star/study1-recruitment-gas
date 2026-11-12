'use strict';
/** PR #133 original GAS OWNER deployment verification — READ ONLY. */
const core=require('./study1-gas-index-preview.cjs');
const p=require('./study1-gas-owner-preview-deploy.cjs');
const SCRIPT_ID=core.SCRIPT_ID;
const PRIVATE_ID='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
(async()=>{
 if(process.env.GITHUB_REF!=='refs/heads/fix/consent-last-preserve-wizard-20261110'||
  process.env.GITHUB_REPOSITORY_PRIVATE!=='true')
  throw Error('not the isolated private source branch');
 const api=await core.authorizedApi();
 const current=await api.getContent();
 const privateDeployment=await api.getDeployment(PRIVATE_ID);
 const version=privateDeployment.deploymentConfig?.versionNumber;
 const currentVersion=await api.getVersion(version);
 const src=p.reviewSources(),desired=p.merge(current,src);
 const headAudience=JSON.parse(core.file(current.files,'appsscript','JSON').source).webapp;
 const verAudience=JSON.parse(core.file(currentVersion.files,'appsscript','JSON').source).webapp;
 let expectedSha=null,expectedMatches=false,headMatches=false;
 if(headAudience?.access==='ANYONE_ANONYMOUS'&&headAudience?.executeAs==='USER_DEPLOYING'){
  const stage=p.stagedOwnerOnly(desired);
  expectedSha=core.digest(stage);
  expectedMatches=expectedSha===core.digest(currentVersion.files);
  headMatches=core.digest(current.files)===core.digest(desired);
 }
 const deployed=await api.deployments();
 const privateUrl=core.deploymentCheck(privateDeployment,PRIVATE_ID).url;
 const report={scriptId:SCRIPT_ID,branch:process.env.GITHUB_REF,
  privateVersion:version,privateUrl,privateAudience:verAudience,
  headAudience,headMatches,immutableMatchesBranch:expectedMatches,
  branchOwnerVersionSha256:expectedSha,
  currentImmutableSha256:core.digest(currentVersion.files),
  remoteHeadSha256:core.digest(current.files),
  deployments:p.stableDeployments(deployed)};
 console.log('OWNER_PREVIEW_READONLY_AUDIT='+JSON.stringify(report));
 console.log('OWNER_PREVIEW_PRIVATE_SOURCE_VERIFIED='+
   (expectedMatches&&headMatches&&verAudience?.access==='MYSELF'&&
    verAudience?.executeAs==='USER_ACCESSING'));
})().catch(e=>{console.error('OWNER_PREVIEW_READONLY_AUDIT_FAILED: '+e.message);process.exitCode=1});
