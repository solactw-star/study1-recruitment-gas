'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const begin=html.indexOf('function officialSignedPdfVerify_(');
const end=html.indexOf('async function officialSignedPdfDisplay_(',begin);
assert.ok(begin>0&&end>begin,'Last-step signed-PDF verification must exist');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const ctx=vm.createContext({Uint8Array,Number,Object,String,Array,Date,Intl,Error,
 atob:s=>Buffer.from(s,'base64').toString('binary'),
 window:{crypto:{subtle:crypto.webcrypto.subtle}}});
vm.runInContext(html.slice(begin,end),ctx,{timeout:1000});
function syntheticCopy(experiment){
 const data=Buffer.concat([Buffer.from('%PDF-1.7\n% synthetic readback only\n'),
  Buffer.alloc(222,5),Buffer.from('\n%%EOF\n')]);
 const original={experiment,version:'Version02',hash:'a'.repeat(64)};
 const copy={
  experiment,version:'Version02',sourceSha256:original.hash,
  signedPdfSha256:sha(data),bytes:data.length,base64:data.toString('base64'),
  mime:'application/pdf',signedAt:'2026-11-10T23:30:00.000Z',
  taipeiDate:'2026/11/11'};
 return {data,original,copy};
}
test('E1/E2 recipient final step verifies independent PDF SHA and the Taipei calendar day',async()=>{
 for(const experiment of ['E1','E2']){
  const {original,copy,data}=syntheticCopy(experiment);
  const result=await ctx.officialSignedPdfVerify_(copy,original);
  assert.equal(result.sha,sha(data));
  assert.equal(result.date,'2026/11/11');
  assert.equal(result.experiment,experiment);
  assert.equal(result.version,'Version02');
  assert.deepEqual(Buffer.from(result.bytes),data);
 }
});
test('Cross-experiment, wrong version, original SHA, byte count, PDF magic and changed signed SHA fail closed',async()=>{
 const {original,copy,data}=syntheticCopy('E1');
 const variants=[
  {...copy,experiment:'E2'},
  {...copy,version:'Version03'},
  {...copy,sourceSha256:'b'.repeat(64)},
  {...copy,bytes:data.length+1},
  {...copy,signedPdfSha256:'c'.repeat(64)},
  {...copy,mime:'text/html'},
  {...copy,signedPdfSha256:original.hash},
  {...copy,base64:Buffer.from('NOTPDF'+'.'.repeat(230)).toString('base64')}
 ];
 for(const altered of variants){
  await assert.rejects(Promise.resolve().then(()=>ctx.officialSignedPdfVerify_(altered,original)));
 }
});
test('Date in PDF delivery must reflect trusted timestamp in Asia/Taipei, not a browser-supplied date',async()=>{
 const {original,copy}=syntheticCopy('E1');
 for(const invalid of [
  {...copy,taipeiDate:'2026/11/10'},
  {...copy,taipeiDate:'2026/11/12'},
  {...copy,signedAt:'2026-11-10T23:30:00+00:00'},
  {...copy,signedAt:'2026-11-10T23:30:00.000Z',taipeiDate:'2026-13-11'},
  {...copy,signedAt:'malformed'}
 ]){
  await assert.rejects(Promise.resolve().then(()=>ctx.officialSignedPdfVerify_(invalid,original)));
 }
});
test('Original seven-step visitor wizard, calendar and booking management remain intact',()=>{
 const phases=['choose','screen','otp','slots','confirm','consent','done'];
 assert.ok(html.includes("const phases=['choose','screen','otp','slots','confirm','consent','done']"));
 for(const phase of phases)assert.ok(html.includes('id="step-'+phase+'"'));
 for(const id of ['v05Dates','v05Prev','v05Next','v08WaitJoin','move','cancel','officialPdfViewer',
 'officialSignedPdfResult','officialSignedPdfSha','officialSignedPdfDate',
 'officialSignedPdfDownload','visitorSignaturePreview'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/function officialSignedPdfReset_\(/);
 assert.match(html,/function officialSignedPdfVerify_\(/);
 assert.match(html,/function officialSignedPdfDisplay_\(/);
 assert.match(html,/function officialPdfReset_\(message\)\{\s*officialSignedPdfReset_\(\)/);
 // No unsafe personal-copy RPC invocation is made from legacy synthetic finish.
 const end=html.slice(html.indexOf("$('finish').addEventListener("));
 assert.doesNotMatch(end,/study1EConsentSignPdf\(|study1EConsentSignedPdfCopy\(/);
});
