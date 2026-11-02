'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const s=require('../scripts/study1-gas-index-preview.cjs');
const data={files:[{name:'Index',type:'HTML',source:'OLD'}, {name:'Website',type:'SERVER_JS',source:'function doGet(){} function getPublicConfig(){return {open:false,consentReady:false};} function requestOtp(){return rejectIntake_();} function verifyOtp(){return rejectIntake_();} function holdSlot(){return rejectIntake_();} function submitConsent(){return rejectIntake_();} function listSlots(){return [];}'}, {name:'appsscript',type:'JSON',source:JSON.stringify({webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}})}]};
test('merge replaces only Index and preserves entire remote manifest and all other sources',()=>{
 const result=s.merge(data,'NEW');assert.equal(result[0].source,'NEW');
 assert.equal(result[1].source,data.files[1].source);assert.equal(result[2].source,data.files[2].source);
 assert.equal(data.files[0].source,'OLD');
});
test('a different source, file list or unrelated file changes digest',()=>{
 const a=s.digest(data.files),b=s.digest(s.merge(data,'NEW'));
 assert.notEqual(a,b);assert.notEqual(a,s.digest(data.files.filter(f=>f.name!=='Website')));
});
test('unsafe remote access settings fail closed',()=>{
 s.assertRemote(data);
 const altered=structuredClone(data);altered.files[2].source=JSON.stringify({webapp:{access:'MYSELF',executeAs:'USER_DEPLOYING'}});
 assert.throws(()=>s.assertRemote(altered),/permission|Testing access/);
});
test('apply cannot run without explicit confirmation, prior remote digest and deployment version',()=>{
 assert.throws(()=>s.config({SYNC_MODE:'apply'}),/authorization/);
 assert.throws(()=>s.config({SYNC_MODE:'apply',AUTHORIZATION:s.CONFIRM}),/SHA256/);
 assert.equal(s.config({SYNC_MODE:'apply',AUTHORIZATION:s.CONFIRM,EXPECTED_REMOTE_SHA256:'a'.repeat(64),DEPLOYMENT_ID:'AKfycb12345678901234567890',EXPECTED_VERSION:'8'}).expectedVersion,8);
});
test('old deployment ID and version must remain exact and versioned',()=>{
 const d={deploymentId:'AKfycb12345678901234567890',deploymentConfig:{scriptId:s.SCRIPT_ID,manifestFileName:'appsscript',versionNumber:8},entryPoints:[{webApp:{url:'https://script.google.com/macros/s/AKfycb12345678901234567890/exec'}}]};
 s.deploymentCheck(d,d.deploymentId,8);
 assert.throws(()=>s.deploymentCheck(d,d.deploymentId,7),/version changed/);
});
test('existing clasp V3 and legacy local credentials accepted without printing tokens',()=>{
 const c={refresh_token:'r',client_id:'i',client_secret:'s'};
 assert.deepEqual(s.storedCredentials(JSON.stringify({tokens:{default:c}})),c);
 assert.equal(s.storedCredentials(JSON.stringify({token:{refresh_token:'r'},oauth2ClientSettings:{clientId:'i',clientSecret:'s'}})).client_secret,'s');
 assert.throws(()=>s.storedCredentials('{}'),/OAuth/);
});

test('Manual preview workflow cannot auto-run or force-push whole repo',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-index-manual.yml'),'utf8');
 assert.match(yml,/^on:\n  workflow_dispatch:/m);
 assert.doesNotMatch(yml,/^\s{2}(?:push|pull_request|schedule):/m);
 assert.doesNotMatch(yml,/\bclasp(?:@\d+)?\s+push\b/);
 assert.match(yml,/inputs\.mode == 'apply'/);
 assert.match(yml,/github\.event\.repository\.private/);
 assert.match(yml,/git ls-remote origin refs\/heads\/main/);
});
