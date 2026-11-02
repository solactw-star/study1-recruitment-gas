'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../scripts/study1-gas-index-preview.cjs');
const backend=require('../scripts/study1-gas-backend-allowlist.cjs');
const sync=require('../scripts/study1-gas-auto-index.cjs');
const website=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
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
 assert.deepEqual(backend.APPROVED_BACKEND.map(f=>f.name),['Website']);
});
test('Rejects new server endpoints and changes to fail-closed intake',()=>{
 assert.throws(()=>backend.assertClosedWebsite(website+'\nfunction newPublicEndpoint(){}'),/Unreviewed/);
 assert.throws(()=>backend.assertClosedWebsite(website.replace('function listSlots(){return [];}', 'function listSlots(){return [1];}')),/CLOSED/);
 assert.throws(()=>backend.assertClosedWebsite(website+'\n// SpreadsheetApp'),/Live data/);
});
test('Approved merge preserves manifest and unknown remote-only GAS modules byte for byte',()=>{
 const original=remote(),result=backend.mergeApproved(core,original,index,website);
 assert.equal(core.file(result,'Index','HTML').source,index);
 assert.equal(core.file(result,'Website','SERVER_JS').source,website);
 assert.equal(core.file(result,'Untracked','SERVER_JS').source,'preserve this remote-only file');
 assert.equal(core.file(result,'appsscript','JSON').source,core.file(original.files,'appsscript','JSON').source);
 assert.equal(sync.compareUnapproved(result,original.files),true);
 assert.equal(sync.compareNoIndex(result,original.files),true);
 result.find(f=>f.name==='Untracked').source='unexpected';
 assert.equal(sync.compareUnapproved(result,original.files),false);
});
test('Workflow watches both reviewed source files, never triggers force push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(workflow,/'gas\/Website.js'/);
 assert.match(workflow,/'scripts\/study1-gas-backend-allowlist.cjs'/);
 assert.match(workflow,/main-website-after.js/);
 assert.doesNotMatch(workflow,/clasp push --force/);
});
