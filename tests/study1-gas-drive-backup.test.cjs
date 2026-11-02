'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const backup=require('../scripts/study1-gas-drive-backup.cjs');
const scriptId='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z';
const id='A'.repeat(28);
const snapshot={scriptId,original:{files:[{name:'appsscript',type:'JSON',source:'{}'},{name:'Website',type:'SERVER_JS',source:'test'}]}};
function transport({badParent=false,badOwner=false,badBytes=false,denied=false}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options?.method||'GET'});
  if(denied)return {ok:false,status:403};
  if(url.includes('uploadType=multipart'))return {ok:true,json:async()=>({id})};
  if(url.includes('alt=media'))return {ok:true,text:async()=>JSON.stringify(snapshot,null,2)+(badBytes?'tampered':'')};
  return {ok:true,json:async()=>({
   id,mimeType:'application/json',
   parents:[badParent?'WRONG':backup.FOLDER],
   owners:[{emailAddress:badOwner?'wrong@example.com':backup.OWNER}]
  })};
 };
 return {fetcher,calls};
}
test('Private 828 backup creates one Drive file and verifies ownership, folder and bytes',async()=>{
 const t=transport(),result=await backup.create(t.fetcher,'synthetic-token',snapshot);
 assert.equal(result.id,id);
 assert.equal(result.sha256,backup.sha256(JSON.stringify(snapshot,null,2)));
 assert.deepEqual(t.calls.map(c=>c.method),['POST','GET','GET']);
 assert.equal(t.calls.some(c=>c.url.includes('alt=media')),true);
});
test('Wrong Drive folder or owner blocks backup verification',async()=>{
 await assert.rejects(backup.create(transport({badParent:true}).fetcher,'token',snapshot),/private 828/);
 await assert.rejects(backup.create(transport({badOwner:true}).fetcher,'token',snapshot),/private 828/);
});
test('Readback drift and OAuth failure block backup',async()=>{
 await assert.rejects(backup.create(transport({badBytes:true}).fetcher,'token',snapshot),/SHA256 mismatch/);
 await assert.rejects(backup.create(transport({denied:true}).fetcher,'token',snapshot),/HTTP 403/);
});
test('Wrong script ID is rejected before any upload',async()=>{
 const t=transport();
 await assert.rejects(backup.create(t.fetcher,'token',{...snapshot,scriptId:'wrong'}),/full verified GAS HEAD/);
 assert.equal(t.calls.length,0);
});
