'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),sync=require('../scripts/study1-gas-auto-index.cjs');
const scriptId='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z';
const dep={deploymentId:'AKfycb12345678901234567890',deploymentConfig:{scriptId,versionNumber:5,manifestFileName:'appsscript',description:'Study 1 網站私人預覽 V1'},entryPoints:[{webApp:{url:'https://script.google.com/macros/s/AKfycb12345678901234567890/exec'}}]};
test('Only unique existing versioned /exec deployment may be updated',()=>{
 assert.deepEqual(sync.targetDeployment([dep]),dep);
 assert.throws(()=>sync.targetDeployment([]),/exactly one/);
 assert.throws(()=>sync.targetDeployment([dep,dep]),/exactly one/);
 const older={...dep,deploymentId:'AKfycbolderdeployment123456',deploymentConfig:{...dep.deploymentConfig,versionNumber:1,description:'Study1 關閉報名網站｜私人測試｜2026-10-29'}};
 assert.deepEqual(sync.targetDeployment([older,dep]),dep);
});
test('Non-Index remote files are always preserved',()=>{
 const f=[{name:'Index',type:'HTML',source:'old'},{name:'appsscript',type:'JSON',source:'{"webapp":{"access":"ANYONE_ANONYMOUS"}}'}];
 const g=[{...f[0],source:'new'},f[1]];
 assert.equal(sync.compareNoIndex(f,g),true);
 assert.equal(sync.compareNoIndex(f,[g[0],{...f[1],source:'{}'}]),false);
});
test('Only private repository push to main is accepted',()=>{
 const valid={GITHUB_REPOSITORY:'solactw-star/study1-recruitment-gas',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY_PRIVATE:'true',GITHUB_SHA:'a'.repeat(40)};
 assert.doesNotThrow(()=>sync.assertEvent(valid));
 assert.throws(()=>sync.assertEvent({...valid,GITHUB_REPOSITORY_PRIVATE:'false'}),/private/);
 assert.throws(()=>sync.assertEvent({...valid,GITHUB_EVENT_NAME:'pull_request'}),/main push/);
});
test('Automatic deployment workflow is push-only, secret-bearing and limited to Index',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(text,/^on:\n  push:\n    branches: \[main\]/m);
 assert.match(text,/'gas\/Index.html'/);
 assert.match(text,/'gas\/Study1Unified.js'/);
 assert.match(text,/'gas\/Study1Unified.html'/);
 assert.match(text,/'gas\/OtpCore.js'/);
 assert.match(text,/'gas\/BookingCore.js'/);
 assert.match(text,/'gas\/OtpThrottle.js'/);
 assert.match(text,/'gas\/OtpTransaction.js'/);
 assert.match(text,/'gas\/BookingHoldTransaction.js'/);
 assert.match(text,/'gas\/Study1FixtureAdapter.js'/);
 assert.match(text,/main-booking-after.js/);
 assert.match(text,/main-unified-after.js/);
 assert.match(text,/main-unified-after.html/);
 assert.doesNotMatch(text,/clasp(?:@\d+)? push\b/);
 assert.match(text,/CLASPRC_JSON/);
 assert.match(text,/node scripts\/study1-gas-auto-index.cjs prepare/);
 assert.match(text,/node scripts\/study1-gas-auto-index.cjs apply/);
});

test('Deployment version readback tolerates short-lived previous-version responses',async()=>{
 const id='AKfycb12345678901234567890';let reads=0;
 const fake={getDeployment:async()=>({deploymentConfig:{versionNumber:++reads<3?2:3}})};
 const result=await sync.waitForVersion(fake,id,3,5,async()=>{});
 assert.equal(reads,3);assert.equal(result.deploymentConfig.versionNumber,3);
});
test('Slow GAS deployment propagation is tolerated without a second update call',async()=>{
 let reads=0,waits=0;
 const fake={getDeployment:async()=>({deploymentConfig:{versionNumber:++reads<9?45:46}})};
 const result=await sync.waitForVersion(fake,'original-exec',46,25,async ms=>{
  waits++;assert.ok(ms>=500&&ms<=2000);
 });
 assert.equal(result.deploymentConfig.versionNumber,46);
 assert.equal(reads,9);assert.equal(waits,8);
});
test('Deployment readback rejects unexpected version advancement without overwriting',async()=>{
 const fake={getDeployment:async()=>({deploymentConfig:{versionNumber:5}})};
 await assert.rejects(sync.waitForVersion(fake,'a',3,3,async()=>{}),/Unexpected deployment/);
});

test('prewrite backup binds the exact prior GAS source bytes and original deployment',()=>{
 const core=require('../scripts/study1-gas-index-preview.cjs');
 const backup=require('../scripts/study1-gas-drive-backup.cjs');
 const original={files:[
  {name:'appsscript',type:'JSON',source:'{"webapp":{"access":"ANYONE_ANONYMOUS"}}'},
  {name:'Website',type:'SERVER_JS',source:'function closedPreview(){}'}
 ]};
 const base={scriptId,triggerSha:'a'.repeat(40),original,
  remoteSha256:core.digest(original.files),
  deploymentId:dep.deploymentId,oldVersion:dep.deploymentConfig.versionNumber,
  deployment:dep,approvedSourceChanged:true,deploymentChanged:true};
 const attached={...base,backup:{id:'A'.repeat(28),
  sha256:backup.sha256(JSON.stringify(base,null,2))}};
 assert.equal(sync.assertBackupBinding(attached),true);
 assert.throws(()=>sync.assertBackupBinding({...attached,
  original:{files:[...original.files,{name:'Other',type:'SERVER_JS',source:'foreign'}]}}),
 /original GAS HEAD digest/);
 assert.throws(()=>sync.assertBackupBinding({...attached,
  backup:{...attached.backup,sha256:'e'.repeat(64)}}),/not bound to exact prewrite/);
 const wrongVersion={...base,oldVersion:base.oldVersion+1};
 assert.throws(()=>sync.assertBackupBinding({...wrongVersion,
  backup:{id:attached.backup.id,sha256:backup.sha256(JSON.stringify(wrongVersion,null,2))}}),
 /deployment and version mismatch/);
 assert.equal(sync.assertBackupBinding({...base,approvedSourceChanged:false,
  deploymentChanged:false}),true,'no content change does not require a new Drive backup');
});
