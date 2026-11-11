'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyOwnerInventory_,waitForOwnerInventory_,recoverOwnerPreview_}=
 require('../scripts/study1-gas-owner-preview-deploy.cjs');
const core=require('../scripts/study1-gas-index-preview.cjs');
const PRIVATE='AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s';
const SCRIPT='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z';
const target=128;
const baseline=()=>[
 {id:'PUBLIC_DEPLOY_ID',version:124,scriptId:SCRIPT},
 {id:PRIVATE,version:127,scriptId:SCRIPT},
 {id:'OTHER_DEPLOY_ID',version:1,scriptId:SCRIPT}
].sort((a,b)=>a.id.localeCompare(b.id,'en'));
const list=(b=baseline(),privateVersion=127)=>b.map(x=>({
 deploymentId:x.id,
 deploymentConfig:{scriptId:x.scriptId,
  versionNumber:x.id===PRIVATE?privateVersion:x.version}
})).reverse();
test('GET deployments old PRIVATE version may converge without any writes',async()=>{
 let reads=0,sleeps=0,writes=0,b=baseline();
 const api={deployments:async()=>{reads++;return list(b,reads<3?127:128);},
  putDeployment:async()=>{writes++;}};
 assert.equal(await waitForOwnerInventory_(api,b,128,4,async()=>{sleeps++;}),true);
 assert.equal(reads,3);assert.equal(sleeps,2);assert.equal(writes,0);
});
test('already-current PRIVATE version is accepted without polling',async()=>{
 let reads=0;
 assert.equal(await waitForOwnerInventory_({
  deployments:async()=>{reads++;return list(baseline(),128);}
 },baseline(),128,3,async()=>{throw Error('unexpected sleep');}),true);
 assert.equal(reads,1);
});
test('permanently stale target inventory fails closed after bounded reads',async()=>{
 let count=0;
 await assert.rejects(waitForOwnerInventory_({
  deployments:async()=>{count++;return list();}
 },baseline(),128,3,async()=>{}),/INVENTORY_STALE/);
 assert.equal(count,3);
});
test('changed PUBLIC version is not tolerated as eventual consistency',async()=>{
 const items=list(baseline(),127);
 items.find(x=>x.deploymentId==='PUBLIC_DEPLOY_ID').deploymentConfig.versionNumber=125;
 await assert.rejects(waitForOwnerInventory_({
  deployments:async()=>items
 },baseline(),128,3,async()=>{throw Error('must fail without pause');}),
 /public or other deployment version changed/);
});
test('changed OTHER deployment still blocks when PRIVATE target already updated',()=>{
 const items=list(baseline(),128);
 items.find(x=>x.deploymentId==='OTHER_DEPLOY_ID').deploymentConfig.versionNumber=2;
 assert.throws(()=>classifyOwnerInventory_(baseline(),items,128),
  /public or other deployment version changed/);
});
test('V129 unknown private version and wrong script ID fail closed',()=>{
 assert.throws(()=>classifyOwnerInventory_(baseline(),list(baseline(),129),128),
  /private deployment unexpectedly changed/);
 const items=list(baseline(),128);
 items.find(x=>x.deploymentId===PRIVATE).deploymentConfig.scriptId='OTHER_SCRIPT_ID';
 assert.throws(()=>classifyOwnerInventory_(baseline(),items,128),
  /deployment inventory ID\/script changed/);
});
test('missing, extra or duplicate deployment entries cannot be misread as success',()=>{
 const b=baseline(),items=list(b,128);
 assert.throws(()=>classifyOwnerInventory_(b,items.slice(1),128),
  /missing, extra or duplicate IDs/);
 assert.throws(()=>classifyOwnerInventory_(b,[...items,{deploymentId:'EXTRA',
  deploymentConfig:{scriptId:SCRIPT,versionNumber:1}}],128),
  /missing, extra or duplicate IDs/);
 assert.throws(()=>classifyOwnerInventory_(b,[...items,items[0]],128),
  /missing, extra or duplicate IDs/);
});
test('ambiguous post-put result never re-reads stale deployment or rolls back HEAD',async()=>{
 let calls=0;
 const api={
  getContent:async()=>{calls++;throw Error('must not read');},
  getDeployment:async()=>{calls++;throw Error('must not read');},
  deployments:async()=>{calls++;throw Error('must not read');},
  putContent:async()=>{calls++;throw Error('must not write');}
 };
 assert.equal(await recoverOwnerPreview_(api,{oldVersion:127},true),
  'POST_DEPLOY_READONLY_AUDIT_REQUIRED');
 assert.equal(calls,0);
});
test('pre-put recovery refuses to overwrite when inventory changed',async()=>{
 const b=baseline(),old={deploymentConfig:{versionNumber:127}};
 let writes=0;
 const snap={oldVersion:127,deployment:old,deployments:b,
  original:{files:[]},originalSha:'shaold',desiredSha:'shanew',stageSha:'shastage'};
 // GAS SHA canonicalization requires an actual nonempty file inventory.
 const syntheticFiles=[{name:'Index',type:'HTML',source:'synthetic unchanged source'}];
 const api={getContent:async()=>({files:syntheticFiles}),getDeployment:async()=>old,
  deployments:async()=>list(b,128),putContent:async()=>{writes++;}};
 assert.equal(await recoverOwnerPreview_(api,snap,false),
  'CONCURRENT_DEPLOYMENT_NO_MUTATION');
 assert.equal(writes,0);
});
test('pre-put recovery only restores backed-up HEAD with stable target and inventory',async()=>{
 const b=baseline(),old={deploymentConfig:{versionNumber:127}};
 const originalFiles=[{name:'Index',type:'HTML',source:'original'}];
 const stagedFiles=[{name:'Index',type:'HTML',source:'staged'}];
 let current=stagedFiles,writes=0;
 const s={oldVersion:127,deployment:old,deployments:b,
  original:{files:originalFiles},originalSha:core.digest(originalFiles),
  desiredSha:core.digest(stagedFiles),stageSha:core.digest(stagedFiles)};
 const api={getContent:async()=>({files:current}),
  getDeployment:async()=>old,deployments:async()=>list(b,127),
  putContent:async files=>{current=files;writes++;}};
 assert.equal(await recoverOwnerPreview_(api,s,false),'PRE_DEPLOY_HEAD_RESTORED');
 assert.equal(writes,1);
 assert.equal(core.digest(current),s.originalSha);
});
test('invalid polling bound is rejected before any GET',async()=>{
 let calls=0;
 await assert.rejects(waitForOwnerInventory_({
  deployments:async()=>{calls++;return list(baseline(),128);}
 },baseline(),128,31,async()=>{}),/invalid inventory poll bound/);
 assert.equal(calls,0);
});
