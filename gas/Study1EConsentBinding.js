/**
 * Study1 one-applicant/one-OTP/one-reservation/one-REC-document consent binding.
 * PRIVATE GAS kernel ONLY. No direct participant RPC and NO live adapter.
 * The current production Applicants / Screenings / Verification /
 * Reservations / Slots schemas do not include verified human identity plus
 * experiment authorization; an authentic, REC-approved identity provenance
 * adapter is required BEFORE any live invite or signature can proceed.
 * No applicant names, email, OTP codes or HMAC secrets are returned or logged.
 */
/**
 * REC source is NOT the same thing as a technical PDF or OTP test.
 * Approval certificate: NTU-REC 202604EM033, approved 2026-06-30,
 * effective 2026-08-01 through 2027-07-31; protocol dated 2026-05-19;
 * informed-consent version dated 2026-05-11.
 * Certificate original Drive ID: 1O5rgS4q0_0wo9UNUD45kg5AEVnFCn2Iy
 * Verified original certificate SHA256:
 * de6fb412f9f266c358f22744f20988e214633571843a1679d95d7c63a5a5eda4
 * The original E1/E2 consent text describes oral/researcher explanation
 * and written consent, a researcher signature, participant signature and
 * a participant copy. It does not authorize online signature, email OTP
 * as proof of real-world identity, or automatic E1/E2 participant linking.
 * This read-only finding is NOT an amendment, nor does a project date
 * establish REC approval of a new participant-facing procedure.
 */
var STUDY1_REC_VERIFIED_BASELINE_=Object.freeze({
 caseId:'202604EM033',
 approvalDate:'2026-06-30',
 validFrom:'2026-08-01',
 validThrough:'2027-07-31',
 protocolDate:'2026-05-19',
 consentVersionDate:'2026-05-11',
 certificateDriveId:'1O5rgS4q0_0wo9UNUD45kg5AEVnFCn2Iy',
 certificateSha256:'de6fb412f9f266c358f22744f20988e214633571843a1679d95d7c63a5a5eda4',
 approvedConsentProcedure:'RESEARCHER_EXPLANATION_AND_WRITTEN_SIGNATURE',
 remoteElectronicConsentApproved:false,
 emailOtpProvesLegalIdentity:false,
 e1RequiresCycuStudentAndAdult:true,
 e2MustNotHaveParticipatedE1:true
});
/** Deliberately irreducible by any runtime Script Property or a browser
 * payload. A later genuine REC approval requires a separately reviewed
 * source-level change plus its signed, versioned evidence and regression
 * tests. A researcher changing OPEN/CONSENT_READY is never sufficient.
 */
function study1RecRequireElectronicConsentApproval_(){
 throw Error('REC_REVIEW_REQUIRED：202604EM033核准口頭及書面知情同意；尚無網路電子簽署修正核可，不得簽發或簽署正式PDF');
}
var STUDY1_BINDING_SCHEMA_=Object.freeze({
 applicants:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
 screenings:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
 verification:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
 slots:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
 reservations:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc']
});
function study1BindingId_(id){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(id)||
    /^SIM[-_]/.test(id))throw Error('不可使用虛構或無效的正式識別碼');
 return id;
}
function study1BindingUniqueRow_(source,fields,id){
 if(!source||!Array.isArray(source.headers)||!Array.isArray(source.rows)||
    source.headers.length!==fields.length||fields.some((h,i)=>source.headers[i]!==h)||
    source.rows.length>10000)
  throw Error('來源欄位、資料列數或正式 schema 不符');
 const found=[];
 for(const row of source.rows){
  if(!Array.isArray(row)||row.length!==fields.length)
   throw Error('正式來源列不完整');
  for(let i=0;i<fields.length;i++){
   if(!Object.prototype.hasOwnProperty.call(row,i))
    throw Error('正式來源存在稀疏資料欄位');
  }
  if(row[0]===id)found.push(row);
 }
 if(found.length!==1)throw Error('資料筆數不唯一或無法找到正式身分／憑證／預約');
 return found[0];
}
function study1BindingUtc_(v){
 if(typeof v!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v))
  throw Error('時間來源必須是 UTC ISO 毫秒');
 const t=Date.parse(v);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==v)
  throw Error('來源時間不合法');
 return t;
}
function study1BindingEmail_(value){
 if(typeof value!=='string'||value.length>254||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)||
    /\.invalid$/i.test(value))
  throw Error('未核實之虛構或無效電子郵件');
 return value.trim().toLowerCase();
}
function study1BindingHmac_(items){
 const props=PropertiesService.getScriptProperties();
 const key=props.getProperty('STUDY1_ECONSENT_BINDING_HMAC_KEY');
 if(typeof key!=='string'||key.length<32||
    /SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(key))
  throw Error('缺少正式身分連結的獨立伺服器簽章金鑰');
 const raw=Utilities.computeHmacSha256Signature(JSON.stringify(items),key,Utilities.Charset.UTF_8);
 if(!Array.isArray(raw)||raw.length!==32)
  throw Error('身分連結簽章計算失敗');
 return raw.map(x=>(x&255).toString(16).padStart(2,'0')).join('');
}
/** REC identity attestation is a separate, authoritative private source.
 * The current approved Applicants/Screenings sheets do NOT contain identity
 * provenance or E1/E2 authorization. No browser, OTP or admin checkbox can
 * provide that missing evidence. Wire the REC-approved source only after
 * its document, purpose, retention, identity policy and owner are verified.
 */
function study1EConsentIdentityAttestation_(request){
 throw Error('REC_REVIEW_REQUIRED：本人核身與實驗別沒有獨立REC核准來源');
}
function study1BindingGate_(){
 study1AdminOwnerRequired_();
 const p=PropertiesService.getScriptProperties();
 const expected=[
  'OPEN','CONSENT_READY','STUDY1_ECONSENT_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED',
  'STUDY1_ECONSENT_WIZARD_LINK_VERIFIED',
  'STUDY1_ECONSENT_IDENTITY_SOURCE_APPROVED',
  'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED'
 ];
 if(expected.some(k=>p.getProperty(k)!=='true'))
  throw Error('REC_REVIEW_REQUIRED：正式本人／OTP／預約／電子同意尚未核准啟用');
 return true;
}
function study1BindingSheetId_(kind){
 if(typeof SITE_RESOURCES_!=='object'||!SITE_RESOURCES_||
    SITE_RESOURCES_.personal!=='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI'||
    SITE_RESOURCES_.operations!=='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ')
  throw Error('正式Sheet ID已變更，拒絕核身與簽署');
 if(['applicants','screenings','verification'].includes(kind))
  return SITE_RESOURCES_.personal;
 if(['slots','reservations'].includes(kind))
  return SITE_RESOURCES_.operations;
 throw Error('未核准的正式資料來源');
}
/** Targeted, unique col-A lookup, never read the entire PII table.
 * Preconditions: the ONE shared ScriptLock is held, independent REC identity
 * attestation succeeded, and all gates have been rechecked before I/O.
 * No write, append, flush, sheet creation, format/permission mutation.
 */
function study1BindingSheetRow_(book,tabName,headers,requestedId){
 study1BindingId_(requestedId);
 if(!book||typeof book.getSheetByName!=='function')
  throw Error('正式Google Sheet連接失敗');
 const tab=book.getSheetByName(tabName);
 if(!tab||typeof tab.getLastRow!=='function'||
    typeof tab.getLastColumn!=='function')
  throw Error('正式工作表不存在');
 const rowCount=tab.getLastRow(),colCount=tab.getLastColumn();
 if(!Number.isSafeInteger(rowCount)||rowCount<2||rowCount>10001||
    colCount!==headers.length)
  throw Error('正式工作表資料範圍或欄位數不合格');
 const hdr=tab.getRange(1,1,1,headers.length).getValues()[0];
 if(!Array.isArray(hdr)||hdr.length!==headers.length||
    headers.some((h,i)=>hdr[i]!==h))
  throw Error('正式工作表表頭不符合已核實schema');
 const finder=tab.getRange(2,1,rowCount-1,1).createTextFinder(requestedId)
  .matchEntireCell(true).matchCase(true).useRegularExpression(false);
 const matches=finder.findAll();
 if(!Array.isArray(matches)||matches.length!==1)
  throw Error('正式申請／OTP／預約／時段不是唯一來源');
 const cell=matches[0];
 if(!cell||typeof cell.getRow!=='function'||typeof cell.getColumn!=='function')
  throw Error('正式來源搜尋結果不完整');
 const n=cell.getRow();
 if(cell.getColumn()!==1||!Number.isSafeInteger(n)||n<2||n>rowCount)
  throw Error('正式來源搜尋結果位置錯誤');
 const row=tab.getRange(n,1,1,headers.length).getValues()[0];
 if(!Array.isArray(row)||row.length!==headers.length)
  throw Error('正式來源列欄位不完整');
 const parsed=[];
 for(let i=0;i<headers.length;i++){
  if(!Object.prototype.hasOwnProperty.call(row,i))
   throw Error('正式來源包含稀疏資料');
  const v=row[i];
  if(Object.prototype.toString.call(v)==='[object Date]'){
   if(!Number.isFinite(v.getTime()))throw Error('正式來源時間無效');
   parsed.push(new Date(v.getTime()).toISOString());
  }else if(typeof v==='string'||typeof v==='boolean'||
           (typeof v==='number'&&Number.isFinite(v))){
   parsed.push(v);
  }else throw Error('正式來源資料類型未核准');
 }
 if(parsed[0]!==requestedId)throw Error('正式資料列身分遭替換');
 return {headers:headers.slice(),rows:[parsed]};
}
/** Only the approved server-side authority may supply the independent
 * attestation. It is deliberately BLOCKED until the REC source is verified.
 * A scripted adapter cannot make a live visitor from the owner TEST fixture.
 */
function study1EConsentBindingAdapter_(){
 study1BindingGate_();
 return {readTrustedSnapshot:function(input){
  study1BindingGate_();
  if(!input||Object.keys(input).sort().join(',')!==
      'applicantId,challengeId,documentSha,documentVersion,experiment,reservationId,screeningId,slotId')
   throw Error('本人／文件／預約綁定索引不合法');
  const id=study1EConsentIdentityAttestation_(input);
  // This independent attestation must match the requested binding before
  // any real applicant rows or other PII are read.
  if(!id||id.provenance!=='REC_APPROVED_IDENTITY_ATTESTATION'||
     id.verified!==true||id.consentProcedureApproved!==true||
     id.age18OrOlderVerified!==true||id.cycuStudentVerified!==true||
     id.eligibilityEvidenceSource!=='REC_APPROVED_ELIGIBILITY_VERIFICATION'||
     !/^[a-f0-9]{64}$/.test(id.eligibilityEvidenceSha256||'')||
     id.applicantId!==input.applicantId||id.experiment!==input.experiment||
     id.reservationId!==input.reservationId||id.slotId!==input.slotId||
     id.challengeId!==input.challengeId||id.screeningId!==input.screeningId||
     !/^[a-f0-9]{64}$/.test(id.evidenceSha256||''))
   throw Error('REC_REVIEW_REQUIRED：身分核定證據或研究實驗別未經授權');
  study1BindingGate_();
  const personal=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const operations=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
  // Each of five target rows is read in full under the calling ScriptLock.
  // A later signature must reread the same five rows before the CAS write.
  return {identity:id,
   applicants:study1BindingSheetRow_(personal,'Applicants',
    STUDY1_BINDING_SCHEMA_.applicants,input.applicantId),
   screenings:study1BindingSheetRow_(personal,'Screenings',
    STUDY1_BINDING_SCHEMA_.screenings,input.screeningId),
   verification:study1BindingSheetRow_(personal,'Verification',
    STUDY1_BINDING_SCHEMA_.verification,input.challengeId),
   reservations:study1BindingSheetRow_(operations,'Reservations',
    STUDY1_BINDING_SCHEMA_.reservations,input.reservationId),
   slots:study1BindingSheetRow_(operations,'Slots',
    STUDY1_BINDING_SCHEMA_.slots,input.slotId)};
 }};
}
function study1BindingVerify_(snapshot,request,doc,nowUtc){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
    !request||typeof request!=='object'||Array.isArray(request)||
    !doc||typeof doc!=='object')
  throw Error('正式身分連結來源缺失');
 const applicantId=study1BindingId_(request.applicantId);
 const reservationId=study1BindingId_(request.reservationId);
 const slotId=study1BindingId_(request.slotId);
 const challengeId=study1BindingId_(request.challengeId);
 const experiment=request.experiment;
 if(!['E1','E2'].includes(experiment)||
    doc.experiment!==experiment||doc.sha256!==request.documentSha||
    doc.version!==request.documentVersion||!/^[a-f0-9]{64}$/.test(doc.sha256))
  throw Error('實驗與正式PDF原始SHA／版本不符');
 const now=study1BindingUtc_(nowUtc);
 // The identity attestation is an INDEPENDENT trusted owner/REC data source;
 // email OTP proves account access, not biological/legal personal identity.
 const identity=snapshot.identity;
 if(!identity||identity.verified!==true||
    identity.provenance!=='REC_APPROVED_IDENTITY_ATTESTATION'||
    identity.applicantId!==applicantId||identity.experiment!==experiment||
    identity.verifierId===''||typeof identity.verifierId!=='string'||
    identity.consentProcedureApproved!==true||
    identity.age18OrOlderVerified!==true||
    identity.cycuStudentVerified!==true||
    identity.eligibilityEvidenceSource!=='REC_APPROVED_ELIGIBILITY_VERIFICATION'||
    !/^[a-f0-9]{64}$/.test(identity.eligibilityEvidenceSha256||'')||
    typeof identity.approvalReference!=='string'||identity.approvalReference.length<8||
    typeof identity.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.evidenceSha256))
  throw Error('REC_REVIEW_REQUIRED：缺少獨立有效本人身分及實驗別核准證據');
 const idWhen=study1BindingUtc_(identity.verifiedAtUtc);
 if(idWhen>now||idWhen<now-86400000)
  throw Error('身分核對已過期或時間異常');
 // Explicit E2 exclusion appears in the 2026-05-11 REC consent.
 // No existing approved Study1 Sheet has a verified cross-study history
 // source, so missing, browser-claimed or positive E1 history MUST fail.
 if(experiment==='E2'&&
    !(identity.priorE1ParticipationVerified===true&&
      identity.priorE1Participation===false&&
      identity.priorE1Source==='REC_APPROVED_STUDY_HISTORY'&&
      typeof identity.priorE1EvidenceSha256==='string'&&
      /^[a-f0-9]{64}$/.test(identity.priorE1EvidenceSha256)))
  throw Error('REC_REVIEW_REQUIRED：實驗二必須獨立確認未參加過實驗一');
 const person=study1BindingUniqueRow_(snapshot.applicants,
    STUDY1_BINDING_SCHEMA_.applicants,applicantId);
 if(person[0]!==applicantId||person[6]!=='VERIFIED')
  throw Error('申請者尚未達正式驗證狀態');
 const email=study1BindingEmail_(person[2]);
 if(study1BindingEmail_(identity.email)!==email)
  throw Error('正式身分與OTP電子郵件不是同一人');
 const screened=study1BindingUniqueRow_(snapshot.screenings,
    STUDY1_BINDING_SCHEMA_.screenings,request.screeningId);
 if(screened[1]!==applicantId||screened[3]!=='ELIGIBLE'||
    screened[2]!==identity.screeningVersion||
    !screened[5]||typeof screened[5]!=='string')
  throw Error('資格審核結果、規則版號或核對人不一致');
 const screenAt=study1BindingUtc_(screened[4]);
 if(screenAt>now||screenAt<study1BindingUtc_(person[4]))
  throw Error('資格檢查時間與申請狀態不符');
 const challenge=study1BindingUniqueRow_(snapshot.verification,
    STUDY1_BINDING_SCHEMA_.verification,challengeId);
 if(challenge[1]!==applicantId||
    challenge[2]!=='EMAIL_VERIFICATION'||study1BindingEmail_(challenge[7])!==email||
    !/^[a-f0-9]{64}$/.test(challenge[3])||
    !Number.isSafeInteger(Number(challenge[5]))||
    Number(challenge[5])<1||Number(challenge[5])>5)
  throw Error('OTP尚未綁定同一已核實申請者');
 const challengeCreated=study1BindingUtc_(challenge[8]);
 const challengeExpiry=study1BindingUtc_(challenge[4]);
 const otpUsed=study1BindingUtc_(challenge[6]);
 if(challengeExpiry<=challengeCreated||challengeExpiry-challengeCreated>600000||
    otpUsed<challengeCreated||otpUsed>=challengeExpiry||otpUsed>now||
    otpUsed<screenAt)
  throw Error('OTP未經有效期限內的一次性使用');
 const reservation=study1BindingUniqueRow_(snapshot.reservations,
    STUDY1_BINDING_SCHEMA_.reservations,reservationId);
 const holdUntil=study1BindingUtc_(reservation[4]);
 if(reservation[1]!==applicantId||reservation[2]!==slotId||
    reservation[3]!=='HELD'||holdUntil<=now||
    study1BindingUtc_(reservation[6])<otpUsed)
  throw Error('當前有效時段保留不是同一已核實申請者');
 const slot=study1BindingUniqueRow_(snapshot.slots,
    STUDY1_BINDING_SCHEMA_.slots,slotId);
 if(slot[5]!=='OPEN'||study1BindingUtc_(slot[1])<=now||
    study1BindingUtc_(slot[2])<=study1BindingUtc_(slot[1])||
    !Number.isSafeInteger(slot[3])||slot[3]<1)
  throw Error('正式時段尚未核定或已開始／關閉');
 // Cross-source race check: the time source & document must be bound to the
 // attested experiment, never derived from a filename or the browser.
 if(identity.slotId!==slotId||identity.reservationId!==reservationId||
    identity.challengeId!==challengeId||identity.screeningId!==request.screeningId)
  throw Error('身分核對與實驗／OTP／時段未關聯同一交易');
 return {schemaVersion:1,applicantId,reservationId,slotId,challengeId,
  screeningId:request.screeningId,experiment,documentSha:doc.sha256,
  documentVersion:doc.version,identityEvidenceSha:identity.evidenceSha256,
  eligibilityEvidenceSha:identity.eligibilityEvidenceSha256,
  priorE1EvidenceSha:experiment==='E2'?identity.priorE1EvidenceSha256:null,
  verifiedAtUtc:identity.verifiedAtUtc,otpUsedAtUtc:challenge[6],
  holdUntilUtc:reservation[4]};
}
function study1BindingDigest_(binding){
 const keys=['schemaVersion','applicantId','reservationId','slotId','challengeId',
  'screeningId','experiment','documentSha','documentVersion',
  'identityEvidenceSha','eligibilityEvidenceSha','priorE1EvidenceSha','verifiedAtUtc','otpUsedAtUtc','holdUntilUtc'];
 if(!binding||Object.keys(binding).sort().join(',')!==
    keys.concat(['digest']).sort().join(','))
  throw Error('電子同意綁定結構遭更動');
 const items=keys.map(k=>binding[k]);
 return study1BindingHmac_(items);
}
/** Atomic source reread is performed by the caller UNDER the shared lock. */
function study1BindingRecheck_(bound,doc,adapter,nowUtc){
 if(!adapter||typeof adapter.readTrustedSnapshot!=='function')
  throw Error('REC_REVIEW_REQUIRED：沒有獲核准的正式身分／OTP／時段來源');
 if(study1BindingDigest_(bound)!==bound.digest)
  throw Error('身分連結簽章已變更');
 const expected={applicantId:bound.applicantId,reservationId:bound.reservationId,
  slotId:bound.slotId,challengeId:bound.challengeId,screeningId:bound.screeningId,
  experiment:bound.experiment,documentSha:bound.documentSha,
  documentVersion:bound.documentVersion};
 const current=study1BindingVerify_(adapter.readTrustedSnapshot(expected),
  expected,doc,nowUtc);
 const reread={...current,digest:bound.digest};
 if(study1BindingDigest_(reread)!==bound.digest)
  throw Error('OTP、身分、場次或文件來源已更新；需重新驗證');
 return current;
}
/** Pre-signature read must also be protected by the same shared script lock;
 * after PDF composition the independent final CAS recheck runs inside the
 * e-consent transaction lock. Never hold a GAS lock across async PDF work.
 */
function study1BindingRecheckWithLock_(binding,doc,adapter){
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||
    typeof lock.hasLock!=='function'||typeof lock.releaseLock!=='function'||
    lock.tryLock(10000)!==true)
  throw Error('無法取得身分／預約共用交易鎖');
 try{
  if(lock.hasLock()!==true)throw Error('共用交易鎖已失效');
  const result=study1BindingRecheck_(binding,doc,adapter,new Date().toISOString());
  if(lock.hasLock()!==true)throw Error('身分核對期間共用交易鎖失效');
  return result;
 }finally{lock.releaseLock();}
}
/** STRICTLY INTERNAL issuance. No public route or live adapter exists yet. */
function study1EConsentIssueBound_(input){
 study1AdminOwnerRequired_();
 study1RecRequireElectronicConsentApproval_();
 if(!input||Object.keys(input).sort().join(',')!==
    'applicantId,challengeId,documentSha,documentVersion,experiment,reservationId,screeningId,slotId')
  throw Error('正式申請綁定欄位不正確');
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.hasLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('無法取得共用交易鎖');
 try{
  if(lock.hasLock()!==true)throw Error('共用交易鎖已失效');
  study1AdminOwnerRequired_();
  const doc=study1EConsentReadyDocument_(input.experiment);
  const nowUtc=new Date().toISOString();
  // No caller-supplied adapter: the only trusted reader is the server-owned,
  // REC-gated factory. Unit tests replace that factory inside a VM.
  const reader=study1EConsentBindingAdapter_();
  if(!reader||typeof reader.readTrustedSnapshot!=='function')
   throw Error('REC_REVIEW_REQUIRED：未設立可信正式讀取介接');
  const binding=study1BindingVerify_(reader.readTrustedSnapshot(input),input,doc,nowUtc);
  binding.digest=study1BindingDigest_({...binding,digest:''});
  if(lock.hasLock()!==true)throw Error('共用交易鎖已失效');
  const r=study1EConsentRegistry_();
  if(r.records.length>=STUDY1_ECONSENT_MAX_RECORDS_)
   throw Error('電子同意索引容量不足');
  if(r.records.some(x=>x.binding&&
     (x.binding.applicantId===binding.applicantId||
      x.binding.reservationId===binding.reservationId)))
   throw Error('該本人申請／預約已核發簽署邀請，禁止重複簽發');
  const token=Utilities.getUuid()+'-'+Utilities.getUuid();
  const entry={id:Utilities.getUuid(),tokenHash:study1EConsentHash_(token),
   experiment:input.experiment,documentSha:doc.sha256,documentVersion:doc.version,
   expires:Math.min(Date.now()+86400000,Date.parse(binding.holdUntilUtc)),
   state:'ISSUED',binding,
   explanation:null,signature:null,confirmation:null,withdrawal:null};
  if(entry.expires<=Date.now())throw Error('原預約保留已到期');
  if(r.records.some(x=>x.id===entry.id||x.tokenHash===entry.tokenHash))
   throw Error('憑證重複');
  study1EConsentWrite_(r,{...r,revision:r.revision+1,
   records:r.records.concat([entry])});
  return {id:entry.id,token,experiment:entry.experiment,version:doc.version,
    sha256:doc.sha256,expires:entry.expires};
 }finally{lock.releaseLock();}
}
