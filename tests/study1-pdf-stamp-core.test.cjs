'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const PDFLib=require('../gas/Study1PdfLib.js');
const sha=buf=>crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const utilities={DigestAlgorithm:{SHA_256:'SHA_256'},
 computeDigest:(_,bytes)=>[...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()],
 formatDate:(date,zone,format)=>{
  assert.equal(zone,'Asia/Taipei');assert.equal(format,'yyyy/MM/dd');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
   timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
   .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return parts.year+'/'+parts.month+'/'+parts.day;
 }};
const sandbox=vm.createContext({PDFLib,Utilities:utilities,Date,Uint8Array,Number,Array,
 String,JSON,Math,Promise,Error,Object,PropertiesService:{
 getScriptProperties:()=>({getProperty:()=>null})
}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/Study1PdfStampCore.js'),'utf8'),sandbox);
const pngCrc=bytes=>{
 let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)
 c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;
};
function chunk(type,buf){const t=Buffer.from(type,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
 length.writeUInt32BE(buf.length);crc.writeUInt32BE(pngCrc(Buffer.concat([t,buf])));
 return Buffer.concat([length,t,buf,crc]);}
function syntheticInk(){
 const w=64,h=32,pixels=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){
  const at=y*(w*4+1);pixels[at]=0;
  for(let x=0;x<w;x++){
   const px=at+1+x*4,stroke=x>3&&x<58&&Math.abs(y-(x/2-3))<2;
   pixels[px]=stroke?10:255;pixels[px+1]=stroke?20:255;
   pixels[px+2]=stroke?25:255;pixels[px+3]=255;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
 ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),
  chunk('IEND',Buffer.alloc(0))]);
}
async function blank(exp){
 const doc=await PDFLib.PDFDocument.create();
 for(let i=0;i<5;i++){
  const page=doc.addPage([595,842]);
  page.drawText('SYNTHETIC DOCUMENT '+exp+' page '+(i+1),{x:30,y:800});
 }
 return Buffer.from(await doc.save());
}
function layout(exp,hash){return {
 experiment:exp,documentSha:hash,version:'Version02',
 pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
 signature:{x:100,y:70,width:190,height:50},
 date:{x:350,y:87,fontSize:11}
};}
const expected=(exp,hash)=>({experiment:exp,sha256:hash,version:'Version02'});
test('independently stamp full five-page synthetic E1 and E2 PDFs, preserve source SHA and Taiwan date',async()=>{
 const png=syntheticInk();assert.ok(png.length>100);
 for(const exp of ['E1','E2']){
  const before=await blank(exp),hash=sha(before),copy=Buffer.from(before);
  const at=new Date('2026-11-10T23:30:00.000Z');
  const signed=await sandbox.study1PdfComposeSigned_(
    [...before],[...png],layout(exp,hash),expected(exp,hash),at);
  assert.equal(signed.sourceSha256,hash);
  assert.equal(signed.signedSha256,sha(signed.signedPdfBytes));
  assert.notEqual(signed.signedSha256,hash);
  assert.equal(signed.experiment,exp);
  assert.equal(signed.taipeiDate,'2026/11/11');
  assert.equal(signed.serverSignedAt,'2026-11-10T23:30:00.000Z');
  assert.equal(signed.pageCount,5);assert.equal(signed.pageIndex,4);
  assert.deepEqual(before,copy,'original PDF bytes were mutated');
  const again=await PDFLib.PDFDocument.load(Uint8Array.from(signed.signedPdfBytes));
  assert.equal(again.getPageCount(),5);
  assert.ok(again.getPage(4).node.Contents());
 }
});
test('cannot stamp a different experiment, version, source SHA, page, date box or unapproved layout',async()=>{
 const before=await blank('E1'),png=syntheticInk(),hash=sha(before);
 const ok=layout('E1',hash),want=expected('E1',hash),now=new Date('2026-11-10T00:00:00.000Z');
 for(const [bad,target] of [
  [{...ok,experiment:'E2'},want],
  [{...ok,version:'Version03'},want],
  [{...ok,documentSha:'a'.repeat(64)},want],
  [{...ok,pageIndex:8},want],
  [{...ok,pageCount:4},want],
  [{...ok,signature:{...ok.signature,x:580}},want],
  [{...ok,date:{...ok.date,y:-1}},want],
  [{...ok,date:{...ok.date,x:130,y:85}},want],
  [ok,{...want,experiment:'E2'}]
 ]){
  await assert.rejects(()=>sandbox.study1PdfComposeSigned_(
   [...before],[...png],bad,target,now));
 }
 await assert.rejects(()=>sandbox.study1PdfComposeSigned_(
  [...before],[...png],ok,want,new Date('invalid')));
 await assert.rejects(()=>sandbox.study1PdfComposeSigned_(
  [...before],[10,20],ok,want,now));
});
test('formal document layout cannot be inferred from filename, a missing REC map fails closed',()=>{
 assert.throws(()=>sandbox.study1PdfLayoutRead_('E1',
   {experiment:'E1',sha256:'a'.repeat(64),version:'Version02'}),/REC_REVIEW_REQUIRED/);
});
test('bundled PDF engine is offline, pinned and not remotely fetched at runtime',()=>{
 const bundle=fs.readFileSync(path.join(__dirname,'../gas/Study1PdfLib.js'),'utf8');
 assert.ok(bundle.includes('PDFLib'));
 assert.doesNotMatch(bundle,/XMLHttpRequest|sendBeacon|document\.cookie|fetch\(/);
 assert.ok(bundle.length>500000);
});
