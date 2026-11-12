'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),
 vm=require('node:vm'),zlib=require('node:zlib');
const PDFLib=require('../gas/Study1PdfLib.js');
const sha=buf=>crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const blobBytes=value=>Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(
 typeof value==='string'?value:[...value].map(b=>b&255));
const crc32=bytes=>{let x=0xffffffff;for(const b of bytes){x^=b;for(let i=0;i<8;i++)
 x=x&1?x>>>1^0xedb88320:x>>>1;}return (x^0xffffffff)>>>0};
const chunk=(name,data)=>{let t=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);
 len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
 return Buffer.concat([len,t,data,crc]);};
function syntheticInk(){
 const w=64,h=32,pixels=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){let row=y*(w*4+1);for(let x=0;x<w;x++){
  let p=row+1+x*4,mark=x>3&&x<58&&Math.abs(y-(x/2-3))<2;
  pixels[p]=mark?10:255;pixels[p+1]=mark?10:255;
  pixels[p+2]=mark?20:255;pixels[p+3]=255;
 }}
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w,0);hdr.writeUInt32BE(h,4);
 hdr[8]=8;hdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
async function createBlank(){
 const pdf=await PDFLib.PDFDocument.create();
 for(let i=0;i<5;i++){let p=pdf.addPage([595,842]);
  p.drawText('SYNTHETIC REC-UNAPPROVED E1 '+i,{x:20,y:800});}
 return Buffer.from(await pdf.save());
}
function buildHarness(original){
 const values=new Map(),files=new Map();
 const folderId='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU',
       originalId='SyntheticPrivatePdfE1_0001';
 let counter=0,writes=0;
 let privateAccess='PRIVATE';
 function file(id,bytes,mime,name){
  const data={id,bytes:blobBytes(bytes),mime,name,access:privateAccess,trashed:false};
  files.set(id,data);
  return {getId:()=>id,getMimeType:()=>data.mime,getSize:()=>data.bytes.length,
   getSharingAccess:()=>data.access,
   setSharing:(access)=>{data.access=access;},
   setTrashed:()=>{data.trashed=true;},
   getBlob:()=>({getBytes:()=>[...data.bytes],
    getDataAsString:()=>data.bytes.toString('utf8')}),
   getParents:()=>{
    let pending=true;
    return {
     hasNext:()=>pending,
     next:()=>{pending=false;return {getId:()=>folderId};}
    };
   }
  };
 }
 file(originalId,original,'application/pdf','Synthetic.pdf');
 const fd={getProperty:k=>values.has(k)?values.get(k):null,
  setProperty:(k,v)=>{writes++;values.set(k,v)},
  setProperties:(pairs)=>{for(const [k,v] of Object.entries(pairs))values.set(k,v)}
 };
 const drives={Access:{PRIVATE:privateAccess},Permission:{VIEW:'VIEW'},
  getFolderById:id=>{assert.equal(id,folderId);return {
   getSharingAccess:()=>privateAccess,
   createFile:blob=>file('SyntheticPrivateFile_'+String(++counter).padStart(17,'0'),
    blob.bytes,blob.mime,blob.name)
  }},
  getFileById:id=>{assert.ok(files.has(id),'unknown Drive file ID '+id);
   return fileProxy(id);}};
 function fileProxy(id){
  const data=files.get(id);
  return {getId:()=>id,getMimeType:()=>data.mime,getSize:()=>data.bytes.length,
   getSharingAccess:()=>data.access,
   setTrashed:()=>{data.trashed=true},
   getBlob:()=>({getBytes:()=>[...data.bytes],
    getDataAsString:()=>data.bytes.toString('utf8')}),
   getParents:()=>{
    let more=true;
    return {
     hasNext:()=>more,
     next:()=>{more=false;return {getId:()=>folderId};}
    };
   }
  };
 }
 let serial=0;
 const utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF-8'},
  computeHmacSha256Signature:(txt,key)=>[...crypto.createHmac('sha256',key).update(txt).digest()],
  computeDigest:(_,data)=>[...crypto.createHash('sha256').update(blobBytes(data)).digest()],
  getUuid:()=>{serial++;return 'aaaaaaaa-bbbb-4ccc-8ddd-'+serial.toString(16).padStart(12,'0');},
  base64Decode:base64=>[...Buffer.from(base64,'base64')],
  base64Encode:bytes=>blobBytes(bytes).toString('base64'),
  newBlob:(value,mime='application/octet-stream',name='')=>{
   const bytes=blobBytes(value);return {bytes,mime,name,
    getBytes:()=>[...bytes]}
  },
  formatDate:(when,zone,format)=>{
   assert.equal(zone,'Asia/Taipei');assert.equal(format,'yyyy/MM/dd');
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(when).filter(t=>t.type!=='literal').map(t=>[t.type,t.value]));
   return p.year+'/'+p.month+'/'+p.day;
  }
 };
 const scope=vm.createContext({
  PDFLib,Utilities:utilities,PropertiesService:{getScriptProperties:()=>fd},
  DriveApp:drives,Session:{
   getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),
   getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})
  },
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}})},
  JSON,Date,Number,String,Array,Set,Object,Uint8Array,Math,Error,Promise
 });
 for(const p of ['gas/AdminSandbox.js','gas/Study1PdfStampCore.js','gas/Study1EConsentBinding.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',p),'utf8'),scope);
 const doc={experiment:'E1',id:originalId,title:'Synthetic study consent',
  version:'Version02',sha256:sha(original),bytes:original.length,
  url:'https://drive.google.com/file/d/'+originalId+'/view'};
 values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify({
  schemaVersion:1,revision:2,documents:[doc],
  current:{E1:originalId,E2:null},published:{E1:originalId,E2:null}
 }));
 values.set('STUDY1_ECONSENT_APPROVED_PDF_LAYOUT_V1',JSON.stringify({
  schemaVersion:1,bindings:[{
   experiment:'E1',documentSha:doc.sha256,version:doc.version,
   pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
   signature:{x:100,y:70,width:190,height:50},
   date:{x:350,y:87,fontSize:11}
  }]
 }));
 for(const [k,v] of Object.entries({OPEN:'true',CONSENT_READY:'true',
  STUDY1_ECONSENT_PROVIDER_VERIFIED:'true',
  STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED:'true',
  STUDY1_ECONSENT_WIZARD_LINK_VERIFIED:'true',
  STUDY1_ECONSENT_BINDING_HMAC_KEY:crypto.randomBytes(40).toString('hex')}))values.set(k,v);
 return {scope,values,files,originalId,doc,writes:()=>writes};
}

/** Entirely synthetic trusted SNAPSHOT, not an authenticated GAS adapter or
 * a participant identity. Tests the actual binding verifier + PDF write path. */
function syntheticBindingEvidence(doc){
 const now=Date.now(),ts=n=>new Date(now+n).toISOString();
 const req={applicantId:'APP_00000001',screeningId:'SCR_00000001',
  challengeId:'CHAL_00000001',reservationId:'RSV_00000001',slotId:'SLOT_00000001',
  experiment:'E1',documentSha:doc.sha256,documentVersion:doc.version};
 const snapshot={
  applicants:{headers:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
   rows:[[req.applicantId,'SYNTHETIC','participant@example.org','',ts(-7200000),ts(-600000),'EMAIL_VERIFIED']]},
  screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
   rows:[[req.screeningId,req.applicantId,'REC_TEST_V1','ELIGIBLE',ts(-5400000),'PARTICIPANT_SELF_REPORT']]},
  verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
   rows:[[req.challengeId,req.applicantId,'EMAIL_VERIFICATION','b'.repeat(64),ts(-1200000),
     1,ts(-1500000),'participant@example.org',ts(-1800000)]]},
  reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[[req.reservationId,req.applicantId,req.slotId,'HELD',ts(900000),'HOLD_TEST',ts(-900000),'','',ts(-850000)]]},
  slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
   rows:[[req.slotId,ts(7200000),ts(10800000),5,'TEST','OPEN','STAFF_TEST','']]},
  identity:{verified:true,provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
   consentProcedureApproved:true,
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   eligibilityEvidenceSha256:'e'.repeat(64),applicantId:req.applicantId,experiment:'E1',
   email:'participant@example.org',
   evidenceSha256:'c'.repeat(64),verifiedAtUtc:ts(-1500000),
   screeningVersion:'REC_TEST_V1',screeningId:req.screeningId,slotId:req.slotId,
   reservationId:req.reservationId,challengeId:req.challengeId}
 };
 return {request:req,adapter:{readTrustedSnapshot:()=>snapshot},snapshot};
}
test('§70-S E1 full PDF writes a new private signed file, SHA-verifies readback and issues a correct participant copy',async()=>{
 const original=await createBlank(),h=buildHarness(original),png=syntheticInk();
 const {request,adapter}=syntheticBindingEvidence(h.doc);
 h.scope.study1EConsentBindingAdapter_=()=>adapter;
 const issued=h.scope.study1EConsentIssueBound_(request);
 assert.equal(issued.sha256,sha(original));
 h.scope.study1EConsentExplain({id:issued.id,question:'研究資料保存多久？',
  answer:'完整說明合成研究流程。',resolved:true});
 const input={token:issued.token,name:'合成參與者',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true};
 await assert.rejects(h.scope.study1EConsentSignPdf({...input,documentSha:'0'.repeat(64)}));
 const result=await h.scope.study1EConsentSignPdf(input);
 assert.equal(result.state,'SIGNED');assert.equal(result.experiment,'E1');
 assert.equal(result.documentSha256,sha(original));
 assert.match(result.taipeiDate,/^20\d\d\/\d\d\/\d\d$/);
 assert.match(result.signedPdfSha256,/^[a-f0-9]{64}$/);
 assert.notEqual(result.signedPdfSha256,result.documentSha256);
 assert.throws(()=>h.scope.study1EConsentSignedPdfCopy(issued.token),/尚未|未取得/);
 h.scope.study1EConsentConfirm({id:issued.id,identityVerified:true,notes:'測試環境中已核實合成當事人'});
 const copy=h.scope.study1EConsentSignedPdfCopy(issued.token);
 const integratedCopy=h.scope.study1EConsentCopy(issued.token);
 assert.equal(integratedCopy.signedPdfSha256,copy.signedPdfSha256);
 assert.equal(integratedCopy.signedPdfMime,'application/pdf');
 assert.equal(sha(Buffer.from(integratedCopy.signedPdfBase64,'base64')),
  copy.signedPdfSha256);
 assert.equal(integratedCopy.taipeiDate,copy.taipeiDate);
 assert.equal(copy.sourceSha256,sha(original));
 assert.equal(copy.signedPdfSha256,result.signedPdfSha256);
 assert.equal(copy.mime,'application/pdf');
 assert.equal(copy.bytes,Buffer.from(copy.base64,'base64').length);
 assert.equal(sha(Buffer.from(copy.base64,'base64')),copy.signedPdfSha256);
 const signed=await PDFLib.PDFDocument.load(Buffer.from(copy.base64,'base64'));
 assert.equal(signed.getPageCount(),5);
 assert.equal(sha(h.files.get(h.originalId).bytes),sha(original),'original PDF immutable');
 assert.ok([...h.files.values()].filter(x=>x.mime==='application/pdf').length===2);
 assert.ok([...h.files.values()].every(x=>x.access==='PRIVATE'&&!x.trashed));
 const withdrawal=h.scope.study1EConsentWithdraw({token:issued.token,reason:'合成當事人要求退出'});
 assert.equal(withdrawal.requiresResearcherDataDisposition,true,'撤回事件不能冒稱資料已依REC銷毀或去識別化');
 assert.equal(h.scope.study1EConsentSignedPdfCopy(issued.token).signedPdfSha256,copy.signedPdfSha256);
});
test('E2 e-sign never opens before 2027, even if synthetic document and other flags exist',async()=>{
 const h=buildHarness(await createBlank());
 assert.throws(()=>h.scope.study1EConsentIssue({experiment:'E2'}),/實驗二|文件/);
});
test('full signing is fail-closed when the independent PDF or wizard binding gate is missing',async()=>{
 const h=buildHarness(await createBlank()),before=h.files.size;
 h.values.set('STUDY1_ECONSENT_WIZARD_LINK_VERIFIED','false');
 await assert.rejects(h.scope.study1EConsentSignPdf({}),/PDF_LINK_NOT_READY|目前尚未/);
 assert.equal(h.files.size,before);
});

test('unbound legacy invitation cannot create a signed PDF even if nominal feature flags are enabled',async()=>{
 const h=buildHarness(await createBlank());
 assert.throws(()=>h.scope.study1EConsentIssue({experiment:'E1'}),/BINDING_REQUIRED/);
 h.values.set('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY','true');
 const issued=h.scope.study1EConsentIssue({experiment:'E1'});
 h.scope.study1EConsentExplain({id:issued.id,question:'synthetic Q&A',answer:'synthetic answer',resolved:true});
 const count=h.files.size;
 await assert.rejects(h.scope.study1EConsentSignPdf({
  token:issued.token,name:'TEST NAME',signature:syntheticInk().toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true
 }),/未綁定身分|未綁定/);
 assert.equal(h.files.size,count,'no signed PDF or new evidence after a refused unbound token');
});

test('FORMAL_E1 real PDF engine rechecks original self-reported name under final lock and preserves post-sign copy TTL',async()=>{
 const original=await createBlank(),h=buildHarness(original),png=syntheticInk();
 const {request,adapter}=syntheticBindingEvidence(h.doc);
 let reads=0;
 h.scope.study1EConsentBindingAdapter_=audience=>{
  assert.ok(audience===undefined||audience==='PUBLIC_E1');
  return {readTrustedSnapshot:(req,heldLock)=>{
   assert.ok(heldLock&&heldLock.hasLock()===true,
    'Final signer must retain the original ScriptLock when reading applicant, OTP and booking');
   reads++;return adapter.readTrustedSnapshot(req,heldLock);
  }};
 };
 const issued=h.scope.study1EConsentIssueBound_(request);
 h.scope.study1EConsentExplain({id:issued.id,question:'是否可以退出？',
  answer:'研究人員已說明撤回及副本保存方式。',resolved:true});
 const before=h.scope.study1EConsentRegistry_();
 const invitation=before.records.find(x=>x.id===issued.id);
 assert.ok(invitation);
 invitation.channel='FORMAL_E1';
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(before));
 h.scope.study1FormalConsentGate_=()=>true;
 h.scope.study1FormalConsentCopyExpiry_=()=>Date.now()+72*3600000;
 const input={token:issued.token,name:'NOT_THE_ORIGINAL_NAME',
  signature:png.toString('base64'),documentSha:h.doc.sha256,
  read:true,answerAcknowledged:true,agree:true};
 const priorPdfCount=[...h.files.values()].filter(x=>x.mime==='application/pdf').length;
 await assert.rejects(h.scope.study1EConsentSignPdf(input),/NAME_NOT_SAME_APPLICATION/);
 assert.equal([...h.files.values()].filter(x=>x.mime==='application/pdf'&&!x.trashed).length,
  priorPdfCount);
 const signed=await h.scope.study1EConsentSignPdf({...input,name:'SYNTHETIC'});
 assert.equal(signed.state,'SIGNED');
 assert.ok(reads>=5,'source reread before signing, in final CAS and name match');
 const after=h.scope.study1EConsentRegistry_();
 const current=after.records.find(x=>x.id===issued.id);
 assert.ok(current.expires>Date.now()+71*3600000);
 assert.throws(()=>h.scope.study1EConsentConfirm({id:issued.id,identityVerified:true,
  notes:'禁止繞過研究員PDF本人簽名'}),/RESEARCHER_PDF_SIGNATURE_REQUIRED/);
 const staffRequest={id:issued.id,notes:'離線合成研究人員已完成獨立說明及本人簽章',
  participantSignedSha256:signed.signedPdfSha256,
  researcherSignature:png.toString('base64')};
 // No REC-approved independent researcher fields, even with all other
 // simulated safety flags enabled: no CONFIRMED and no double-signed file.
 await assert.rejects(h.scope.study1EConsentConfirmPdf(staffRequest),
  /RESEARCHER_PDF_LAYOUT_NOT_APPROVED|study1FormalConsentRecScope_/);
 assert.equal(h.scope.study1EConsentRegistry_().records[0].state,'SIGNED');
 h.scope.study1FormalConsentRecScope_=()=>({
  consentDocumentId:h.doc.id,consentDocumentSha256:h.doc.sha256});
 const staffLayout={
  experiment:'E1',documentSha:h.doc.sha256,version:h.doc.version,
  pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
  signature:{x:100,y:160,width:190,height:50},
  date:{x:350,y:180,fontSize:11}
 };
 h.values.set('STUDY1_ECONSENT_APPROVED_RESEARCHER_LAYOUT_V1',
  JSON.stringify({schemaVersion:1,bindings:[staffLayout]}));
 await assert.rejects(h.scope.study1EConsentConfirmPdf({
  ...staffRequest,participantSignedSha256:'f'.repeat(64)}),/RESEARCHER_PDF_UNBOUND_OR_STALE/);
 const result=await h.scope.study1EConsentConfirmPdf(staffRequest);
 assert.equal(result.state,'CONFIRMED');
 assert.notEqual(result.signedPdfSha256,signed.signedPdfSha256);
 assert.match(result.researcherTaipeiDate,/^20\d\d\/\d\d\/\d\d$/);
 const copy=h.scope.study1EConsentSignedPdfCopy(issued.token);
 assert.equal(copy.dualSigned,true);
 assert.equal(copy.participantSignedPdfSha256,signed.signedPdfSha256);
 assert.equal(copy.signedPdfSha256,result.signedPdfSha256);
 assert.equal(sha(Buffer.from(copy.base64,'base64')),result.signedPdfSha256);
 assert.equal(copy.researcherTaipeiDate,result.researcherTaipeiDate);
 assert.equal(copy.sourceSha256,h.doc.sha256);
 // Even a hash-valid complete PDF must not be delivered if the participant
 // signing event were internally re-linked to a later server instant.
 const originalEvent=h.scope.study1EConsentEvent_;
 h.scope.study1EConsentEvent_=(ref,entry,kind)=>{
  const evt=originalEvent(ref,entry,kind);
  if(kind!=='SIGNATURE')return evt;
  return {...evt,data:{...evt.data,
   serverSignedAt:'2030-01-01T00:00:00.000Z',taipeiDate:'2030/01/01'}};
 };
 assert.throws(()=>h.scope.study1EConsentSignedPdfCopy(issued.token),
  /FORMAL_DUAL_PDF_CHRONOLOGY_INVALID/);
 h.scope.study1EConsentEvent_=originalEvent;
 assert.equal(h.scope.study1EConsentSignedPdfCopy(issued.token).signedPdfSha256,
  result.signedPdfSha256);
 const pdf=await PDFLib.PDFDocument.load(Buffer.from(copy.base64,'base64'));
 assert.equal(pdf.getPageCount(),5,'all REC PDF pages must be preserved');
 assert.equal(sha(h.files.get(h.originalId).bytes),h.doc.sha256);
 const finalRef=h.scope.study1EConsentRegistry_().records[0];
 assert.equal(finalRef.participantSignedPdf.sha,signed.signedPdfSha256);
 assert.equal(finalRef.signedPdf.sha,result.signedPdfSha256);
 await assert.rejects(h.scope.study1EConsentConfirmPdf(staffRequest),
  /RESEARCHER_PDF_UNBOUND_OR_STALE/);
 assert.throws(()=>h.scope.study1EConsentWithdraw({
  token:issued.token,reason:'合成參與者要求退出',dataChoice:'AUTO_DELETE'}),
  /請填寫撤回理由/);
 const withdrawn=h.scope.study1EConsentWithdraw({
  token:issued.token,reason:'合成參與者要求退出',dataChoice:'DEIDENTIFY'});
 assert.equal(withdrawn.requiresResearcherDataDisposition,true);
 assert.equal(withdrawn.dataDispositionState,'PENDING_RESEARCH_TEAM_ACTION');
 const pending=h.scope.study1EConsentOwnerWithdrawalCases();
 assert.equal(pending.readOnly,true);
 assert.equal(pending.records[0].dataChoice,'DEIDENTIFY');
 assert.equal(pending.records[0].dispositionState,'PENDING_RESEARCH_TEAM_ACTION');
 assert.equal(h.scope.study1EConsentSignedPdfCopy(issued.token).signedPdfSha256,
  result.signedPdfSha256);
});

test('researcher signing uses only independently reviewed, nonoverlapping original PDF rectangles',async()=>{
 const original=await createBlank(),h=buildHarness(original);
 h.scope.study1FormalConsentRecScope_=()=>({
  consentDocumentId:h.doc.id,consentDocumentSha256:h.doc.sha256});
 assert.throws(()=>h.scope.study1PdfResearcherLayoutRead_('E1',h.doc),
  /RESEARCHER_PDF_LAYOUT_NOT_APPROVED/);
 const staff={experiment:'E1',documentSha:h.doc.sha256,version:h.doc.version,
  pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
  signature:{x:100,y:70,width:190,height:50},
  date:{x:350,y:87,fontSize:11}};
 h.values.set('STUDY1_ECONSENT_APPROVED_RESEARCHER_LAYOUT_V1',
  JSON.stringify({schemaVersion:1,bindings:[staff]}));
 assert.throws(()=>h.scope.study1PdfResearcherLayoutRead_('E1',h.doc),
  /RESEARCHER_PDF_SIGNING_FIELDS_OVERLAP/);
 staff.signature.y=180;staff.date.y=190;
 h.values.set('STUDY1_ECONSENT_APPROVED_RESEARCHER_LAYOUT_V1',
  JSON.stringify({schemaVersion:1,bindings:[staff]}));
 assert.equal(h.scope.study1PdfResearcherLayoutRead_('E1',h.doc).signature.y,180);
 h.scope.study1FormalConsentRecScope_=()=>({
  consentDocumentId:h.doc.id,consentDocumentSha256:'f'.repeat(64)});
 assert.throws(()=>h.scope.study1PdfResearcherLayoutRead_('E1',h.doc),
  /RESEARCHER_LAYOUT_REC_SOURCE_MISMATCH/);
});
test('two handwritten signatures preserve full PDF and independently trusted Asia/Taipei calendar days across midnight',async()=>{
 const original=await createBlank(),h=buildHarness(original),ink=syntheticInk();
 const participant=await h.scope.study1PdfComposeSigned_([...original],[...ink],
  h.scope.study1PdfLayoutRead_('E1',h.doc),
  {experiment:'E1',version:h.doc.version,sha256:h.doc.sha256},
  new Date('2026-11-10T15:55:00.000Z'));
 h.scope.study1FormalConsentRecScope_=()=>({
  consentDocumentId:h.doc.id,consentDocumentSha256:h.doc.sha256});
 const staff={experiment:'E1',documentSha:h.doc.sha256,version:h.doc.version,
  pageCount:5,pageIndex:4,pageWidth:595,pageHeight:842,
  signature:{x:100,y:180,width:190,height:50},
  date:{x:350,y:195,fontSize:11}};
 h.values.set('STUDY1_ECONSENT_APPROVED_RESEARCHER_LAYOUT_V1',
  JSON.stringify({schemaVersion:1,bindings:[staff]}));
 const layout=h.scope.study1PdfResearcherLayoutRead_('E1',h.doc);
 const expected={experiment:'E1',version:h.doc.version,sha256:h.doc.sha256,
  participantSignedSha256:participant.signedSha256};
 const dual=await h.scope.study1PdfComposeResearcherSigned_(
  participant.signedPdfBytes,[...ink],layout,expected,
  new Date('2026-11-10T16:05:00.000Z'));
 assert.equal(participant.taipeiDate,'2026/11/10');
 assert.equal(dual.researcherTaipeiDate,'2026/11/11');
 assert.notEqual(dual.signedSha256,participant.signedSha256);
 assert.notEqual(dual.signedSha256,h.doc.sha256);
 assert.equal(sha(original),h.doc.sha256);
 assert.equal((await PDFLib.PDFDocument.load(Buffer.from(dual.signedPdfBytes))).getPageCount(),5);
 await assert.rejects(h.scope.study1PdfComposeResearcherSigned_(
  participant.signedPdfBytes,[...ink],layout,
  {...expected,participantSignedSha256:'f'.repeat(64)},
  new Date('2026-11-10T16:05:00.000Z')),/RESEARCHER_PDF_PARTICIPANT_SHA_CHANGED/);
});


test('MVP actual PDF engine accepts only researcher presigned source, adds participant ink once and permits OWNER private download',async()=>{
 const docPdf=await PDFLib.PDFDocument.load(await createBlank());
 docPdf.getPage(4).drawText('SYNTHETIC RESEARCHER PRESIGNED BEFORE PARTICIPANT',
  {x:60,y:260,size:10});
 const original=Buffer.from(await docPdf.save()),h=buildHarness(original),png=syntheticInk();
 const index=JSON.parse(h.values.get('STUDY1_CONSENT_DOCUMENT_INDEX_V1'));
 index.documents[0].researcherPresigned=true;
 h.doc.researcherPresigned=true;
 h.values.set('STUDY1_CONSENT_DOCUMENT_INDEX_V1',JSON.stringify(index));
 const {request,adapter}=syntheticBindingEvidence(h.doc);
 h.scope.study1EConsentBindingAdapter_=()=>adapter;
 const issued=h.scope.study1EConsentIssueBound_(request);
 const registry=h.scope.study1EConsentRegistry_();
 registry.records[0].channel='FORMAL_E1';
 registry.records[0].researcherPresigned=true;
 assert.equal(registry.records[0].state,'ISSUED');
 assert.equal(registry.records[0].explanation,null);
 h.values.set('STUDY1_ECONSENT_PRIVATE_V1',JSON.stringify(registry));
 h.scope.study1FormalConsentGate_=()=>true;
 h.scope.study1FormalConsentCopyExpiry_=()=>Date.now()+72*3600000;
 let bookingChecks=0,mailCount=0;
 h.scope.study1FormalFinalizeSignedE1Booking_=(id,token)=>{
  bookingChecks++;assert.equal(id,issued.id);assert.equal(token,issued.token);
  return {bookingConfirmed:true,bookingStatus:'CONFIRMED'};
 };
 h.scope.study1ParticipantBookingNotice_=(email,consentId)=>{
  mailCount++;assert.equal(email,'participant@example.org');
  assert.equal(consentId,issued.id);
  return {attempted:true,status:'PROVIDER_ACCEPTED'};
 };
 const signed=await h.scope.study1EConsentSignPdf({
  token:issued.token,name:'SYNTHETIC',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true
 });
 assert.equal(signed.state,'CONFIRMED');
 assert.equal(signed.researcherPreSigned,true);
 assert.equal(signed.originalBookingConfirmed,true);
 assert.equal(signed.emailNotificationStatus,'PROVIDER_ACCEPTED_NOT_DELIVERED');
 assert.equal(bookingChecks,1);assert.equal(mailCount,1);
 const entry=h.scope.study1EConsentRegistry_().records[0];
 assert.equal(entry.researcherPresigned,true);
 assert.equal(entry.explanation,null,'must not forge researcher explanation event');
 assert.equal(entry.signedPdf.sha,entry.participantSignedPdf.sha);
 const copy=h.scope.study1EConsentSignedPdfCopy(issued.token);
 assert.equal(copy.researcherPreSigned,true);
 assert.equal(copy.researcherSignedAt,null,'pre-sign time must not be fabricated');
 assert.equal(copy.participantSignedPdfSha256,copy.signedPdfSha256);
 assert.equal(sha(Buffer.from(copy.base64,'base64')),copy.signedPdfSha256);
 const owner=h.scope.study1EConsentOwnerSignedPdfDownload(issued.id);
 assert.equal(owner.signedPdfSha256,copy.signedPdfSha256);
 assert.equal(sha(Buffer.from(owner.base64,'base64')),copy.signedPdfSha256);
 const viewed=await PDFLib.PDFDocument.load(Buffer.from(copy.base64,'base64'));
 assert.equal(viewed.getPageCount(),5);
 assert.equal(sha(original),h.doc.sha256);
 await assert.rejects(h.scope.study1EConsentSignPdf({
  token:issued.token,name:'SYNTHETIC',signature:png.toString('base64'),
  documentSha:h.doc.sha256,read:true,answerAcknowledged:true,agree:true
 }),/失效|狀態|BINDING|驗證|not|此固定文件/);
});
