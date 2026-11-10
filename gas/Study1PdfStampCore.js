/**
 * Study1 approved-PDF signer core. PRIVATE GAS helper; no public RPC, fetch,
 * cookie, remote font or participant storage. Requires a real OWNER-verified
 * source PDF SHA and a per-document, REC-reviewed page rectangle binding.
 * The returned byte array is a complete, new PDF, not a separate receipt.
 * Bundled PDFLib v1.17.1 is pinned as local source, never remote CDN.
 */
function study1PdfDigest_(bytes){
 if(!Array.isArray(bytes)&&!(bytes instanceof Uint8Array))
  throw Error('PDF SHA input must be byte array');
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Array.from(bytes))
  .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function study1PdfLayoutValidate_(layout,expected){
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||
   Object.keys(layout).sort().join(',')!==
    'date,documentSha,experiment,pageCount,pageHeight,pageIndex,pageWidth,signature,version'||
   !expected||!['E1','E2'].includes(expected.experiment)||
   layout.experiment!==expected.experiment||
   layout.documentSha!==expected.sha256||
   layout.version!==expected.version||
   !/^[a-f0-9]{64}$/.test(layout.documentSha)||
   !Number.isInteger(layout.pageCount)||layout.pageCount<1||layout.pageCount>20||
   !Number.isInteger(layout.pageIndex)||layout.pageIndex<0||layout.pageIndex>=layout.pageCount)
  throw Error('文件版號、實驗或研究人員核准的簽名頁配置不符');
 const n=x=>typeof x==='number'&&Number.isFinite(x);
 if(!n(layout.pageWidth)||!n(layout.pageHeight)||
  layout.pageWidth<180||layout.pageWidth>1500||
  layout.pageHeight<180||layout.pageHeight>2000||
  !layout.signature||Object.keys(layout.signature).sort().join(',')!=='height,width,x,y'||
  !['x','y','width','height'].every(k=>n(layout.signature[k]))||
  layout.signature.x<0||layout.signature.y<0||
  layout.signature.width<40||layout.signature.width>350||
  layout.signature.height<15||layout.signature.height>120||
  layout.signature.x+layout.signature.width>layout.pageWidth||
  layout.signature.y+layout.signature.height>layout.pageHeight||
  !layout.date||Object.keys(layout.date).sort().join(',')!=='fontSize,x,y'||
  !['x','y','fontSize'].every(k=>n(layout.date[k]))||
  layout.date.fontSize<8||layout.date.fontSize>16||
  layout.date.x<0||layout.date.y<0||
  layout.date.x+100>layout.pageWidth||
  layout.date.y+layout.date.fontSize>layout.pageHeight)
  throw Error('PDF簽名或日期座標超出核准頁面或缺少正式佈局');
 // Avoid accidental overlap that can make the date illegible.
 const s=layout.signature,d=layout.date;
 if(d.x>=s.x-100&&d.x<=s.x+s.width&&
    d.y>=s.y-20&&d.y<=s.y+s.height+20)
  throw Error('簽署日期與本人筆跡欄位重疊，需人工重新核准定位');
 return layout;
}
function study1PdfTaipeiDate_(now){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error('簽署時間必須是可信伺服器Date');
 const date=Utilities.formatDate(now,'Asia/Taipei','yyyy/MM/dd');
 if(!/^20\d\d\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])$/.test(date))
  throw Error('臺灣簽署日期格式不合法');
 return date;
}
function study1PdfLayoutRead_(experiment,document){
 if(!document||!['E1','E2'].includes(experiment)||
    document.experiment!==experiment)throw Error('正式文件實驗不符');
 // This server-only property MUST be provided by OWNER after REC/signature
 // geometry review, never inferred from filenames, demo fixtures or browser.
 const raw=PropertiesService.getScriptProperties()
   .getProperty('STUDY1_ECONSENT_APPROVED_PDF_LAYOUT_V1');
 if(!raw)throw Error('REC_REVIEW_REQUIRED：尚未核對正式PDF簽署欄位位置');
 let data;try{data=JSON.parse(raw);}catch(_){throw Error('簽署欄位核定索引無法解析');}
 if(!data||data.schemaVersion!==1||!Array.isArray(data.bindings)||
    data.bindings.length>24)throw Error('PDF簽署欄位索引未核准或無效');
 const b=data.bindings.filter(x=>x.experiment===experiment&&
   x.documentSha===document.sha256&&x.version===document.version);
 if(b.length!==1)throw Error('REC_REVIEW_REQUIRED：本PDF原版版號未核定唯一簽名欄位');
 return study1PdfLayoutValidate_(b[0],document);
}
/** Never trust the browser for original PDF bytes, layout, date or output SHA. */
async function study1PdfComposeSigned_(source,signature,layout,expected,serverDate){
 if(typeof PDFLib!=='object'||!PDFLib||!PDFLib.PDFDocument)
  throw Error('內建PDF合成引擎未通過核對');
 study1PdfLayoutValidate_(layout,expected);
 const original=Array.from(source||[]).map(x=>x&255),
       ink=Array.from(signature||[]).map(x=>x&255);
 if(original.length<100||original.length>3000000||
  String.fromCharCode(...original.slice(0,5))!=='%PDF-'||
  ink.length<100||ink.length>90000||
  ink.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')
  throw Error('原始PDF或本人手寫PNG內容不是完整有效檔');
 const originalHash=study1PdfDigest_(original);
 if(originalHash!==layout.documentSha||originalHash!==expected.sha256)
  throw Error('原始核准PDF SHA不一致，禁止簽署');
 const stampedAt=serverDate.toISOString(),
       taipeiDate=study1PdfTaipeiDate_(serverDate);
 let pdf;
 try{
  pdf=await PDFLib.PDFDocument.load(Uint8Array.from(original),
   {ignoreEncryption:false,updateMetadata:false});
  if(pdf.isEncrypted)throw Error('加密PDF不可直接簽署');
  if(pdf.getPageCount()!==layout.pageCount)throw Error('原PDF頁數變更');
  const page=pdf.getPage(layout.pageIndex),size=page.getSize();
  if(Math.abs(size.width-layout.pageWidth)>1.5||
     Math.abs(size.height-layout.pageHeight)>1.5)
   throw Error('原PDF簽名頁尺寸與核准定位不一致');
  const png=await pdf.embedPng(Uint8Array.from(ink));
  const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
  // Blank official document is retained in full. Signature must be drawn
  // INSIDE the participant's existing signature box (owner-reviewed coords).
  page.drawImage(png,{x:layout.signature.x,y:layout.signature.y,
   width:layout.signature.width,height:layout.signature.height});
  page.drawText(taipeiDate,{x:layout.date.x,y:layout.date.y,
   size:layout.date.fontSize,font,color:PDFLib.rgb(0,0,0)});
  pdf.setModificationDate(serverDate);
  const bytes=Array.from(await pdf.save({useObjectStreams:false}));
  if(bytes.length<original.length||bytes.length>6000000)
   throw Error('已簽署PDF大小不合理');
  const signedSha=study1PdfDigest_(bytes);
  if(signedSha===originalHash)throw Error('原PDF未發生有效簽署變更');
  const reloaded=await PDFLib.PDFDocument.load(Uint8Array.from(bytes),
   {ignoreEncryption:false,updateMetadata:false});
  if(reloaded.getPageCount()!==layout.pageCount)
   throw Error('簽署版PDF重開檢查失敗');
  return {sourceSha256:originalHash,signedSha256:signedSha,
   signedPdfBytes:bytes,serverSignedAt:stampedAt,
   taipeiDate,pageIndex:layout.pageIndex,pageCount:layout.pageCount,
   experiment:expected.experiment,version:expected.version};
 }catch(err){throw Error('正式PDF簽署合成失敗：'+String(err.message||err));}
}
