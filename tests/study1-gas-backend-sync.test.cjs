'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../scripts/study1-gas-index-preview.cjs');
const backend=require('../scripts/study1-gas-backend-allowlist.cjs');
const sync=require('../scripts/study1-gas-auto-index.cjs');
const website=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
const adminSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8');
function remote(){
 return {files:[
  {name:'Index',type:'HTML',source:'old'},
  {name:'Website',type:'SERVER_JS',source:website},
  {name:'appsscript',type:'JSON',source:'{"webapp":{"access":"ANYONE_ANONYMOUS","executeAs":"USER_DEPLOYING"}}'},
  {name:'Untracked',type:'SERVER_JS',source:'preserve this remote-only file'}
 ]};
}
test('Current reviewed CLOSED Website source passes strict server gate',()=>{
 assert.doesNotThrow(()=>backend.assertClosedWebsite(website));
 assert.deepEqual(backend.APPROVED_BACKEND.map(f=>f.name),['Website','AdminSandbox','AdminConsole']);
 assert.doesNotThrow(()=>backend.assertAdminSandbox(adminSource));
 assert.doesNotThrow(()=>backend.assertAdminHtml(adminHtml));
});
test('Rejects new server endpoints and changes to fail-closed intake',()=>{
 assert.throws(()=>backend.assertClosedWebsite(website+'\nfunction newPublicEndpoint(){}'),/Unreviewed/);
 assert.throws(()=>backend.assertClosedWebsite(website.replace('function listSlots(){return [];}', 'function listSlots(){return [1];}')),/CLOSED/);
 assert.throws(()=>backend.assertClosedWebsite(website+'\n// SpreadsheetApp'),/Live data/);
});
test('Approved merge preserves manifest and unknown remote-only GAS modules byte for byte',()=>{
 const original=remote(),result=backend.mergeApproved(core,original,index,website,adminSource,adminHtml);
 assert.equal(core.file(result,'Index','HTML').source,index);
 assert.equal(core.file(result,'Website','SERVER_JS').source,website);
 assert.equal(core.file(result,'AdminSandbox','SERVER_JS').source,adminSource);
 assert.equal(core.file(result,'AdminConsole','HTML').source,adminHtml);
 assert.equal(core.file(result,'Untracked','SERVER_JS').source,'preserve this remote-only file');
 assert.equal(core.file(result,'appsscript','JSON').source,core.file(original.files,'appsscript','JSON').source);
 assert.equal(sync.compareUnapproved(result,original.files),true);
 assert.equal(sync.compareNoIndex(result,original.files),false);
 result.find(f=>f.name==='Untracked').source='unexpected';
 assert.equal(sync.compareUnapproved(result,original.files),false);
});
test('A reviewed CLOSED Website-only change is included without modifying other GAS files',()=>{
 const original=remote(),changed=website+'\n// reviewed comment only';
 const result=backend.mergeApproved(core,original,index,changed,adminSource,adminHtml);
 assert.equal(core.file(result,'Website','SERVER_JS').source,changed);
 assert.equal(sync.compareUnapproved(result,original.files),true);
 assert.equal(sync.compareNoIndex(result,original.files),false);
});
test('Workflow watches both reviewed source files, never triggers force push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(workflow,/'gas\/Website.js'/);
 assert.match(workflow,/'scripts\/study1-gas-backend-allowlist.cjs'/);
 assert.match(workflow,/main-website-after.js/);
 assert.doesNotMatch(workflow,/clasp push --force/);
});

test('Admin source guard rejects new functions, live research Sheets calls and altered identity check',()=>{
 assert.throws(()=>backend.assertAdminSandbox(adminSource+'\nfunction publicOverride(){}'),/Unreviewed admin endpoint/);
 assert.throws(()=>backend.assertAdminSandbox(adminSource+'\n// SpreadsheetApp.openById'),/Forbidden/);
 assert.throws(()=>backend.assertAdminSandbox(adminSource.replace('Session.getActiveUser().getEmail()','Session.getEffectiveUser().getEmail()')),/Unreviewed AdminSandbox/);
 assert.throws(()=>backend.assertAdminHtml(adminHtml+'<script src="https://bad.test/x.js"></script>'),/Unreviewed/);
});
test('The admin screen and backend are allowlisted, yet Booking/OTP are never allowed',()=>{
 const original=remote(),result=backend.mergeApproved(core,original,index,website,adminSource,adminHtml);
 assert.equal(result.length,6);
 assert.equal(result.some(x=>/^Booking|^Otp/.test(x.name)),false);
 const withProtected=remote();withProtected.files.push({name:'BookingCore',type:'SERVER_JS',source:'DO NOT TOUCH'});
 const r=backend.mergeApproved(core,withProtected,index,website,adminSource,adminHtml);
 assert.equal(core.file(r,'BookingCore','SERVER_JS').source,'DO NOT TOUCH');
});
test('Admin file-name collision or unexpected type fails before writing GAS',()=>{
 const conflicting=remote();conflicting.files.push({name:'AdminSandbox',type:'JSON',source:'{}'});
 assert.throws(()=>backend.mergeApproved(core,conflicting,index,website,adminSource,adminHtml),/collision/);
});
test('Workflow watches sandbox backend and HTML and checks both against current main',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(w,/'gas\/AdminSandbox.js'/);assert.match(w,/'gas\/AdminConsole.html'/);
 assert.match(w,/main-admin-after\.js/);assert.match(w,/main-admin-after\.html/);
});

test('MYSELF deployment plus explicit active and effective owner identities are mandatory',()=>{
 const path=require('node:path');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../gas/appsscript.json'),'utf8'));
 assert.equal(manifest.webapp.access,'MYSELF');
 assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');
 const code=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
 assert.match(code,/if\(effective!==STUDY1_ADMIN_OWNER_\|\|active!==STUDY1_ADMIN_OWNER_\)/);
});
