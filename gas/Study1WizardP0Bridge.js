/**
 * Study1 original 7-step Visitor -> official Applicants / Screenings /
 * Verification / Slots / Reservations / E1-E2 document binding.
 *
 * PRIVATE GAS ONLY: all externally accessible site intake RPCs in Website.js
 * remain closed. This adapter DOES NOT replace Study1Unified TEST, V05/V08,
 * publish any endpoint, send mail, or write real Sheet data until a separate
 * deployment and identity/slot source is approved and verified.
 *
 * The research is REC-approved (202604EM033). Missing identity or slot
 * mapping is a TECHNICAL readiness failure, never a blanket REC veto.
 *
 * OTP_VERIFY (step 3) delegates to existing one-time OTP adapter/kernel.
 * HOLD (step 4) delegates to existing BookingHoldTransaction kernel, preserving
 * unique applicant, no overcapacity, lock, idempotency and full readback.
 * Final consent (step 6) remains study1EConsentIssueBound_ / SignPdf;
 * it must re-read this same applicant / OTP / reservation identity source.
 */

/** Required trusted evidence originates on SERVER, never from visitor values.
 * Official Applicants/Screenings do not record the experiment or a verified
 * student identity. This is deliberately unavailable until mapped to a
 * documented, access-controlled personal identity evidence source.
 */
function study1WizardApplicantAuthority_(request){
 throw Error('IDENTITY_SOURCE_NOT_CONFIGURED：缺少經驗證的本人、資格及實驗別來源');
}
/** Official Slots tab has NO experiment column. Never infer E1/E2 from a
 * slotId string, client selection or free-text location_code.
 */
function study1WizardSlotAuthority_(request){
 throw Error('SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED：尚無可信的時段與實驗別對應');
}
function study1WizardP0Gate_(){
 study1BindingGate_();
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_WIZARD_P0_SHEET_HOLD_VERIFIED')!=='true')
  throw Error('BACKEND_NOT_READY：原七步與正式預約交易尚未完成驗證');
 return true;
}
function study1WizardRequest_(r){
 if(!r||Array.isArray(r)||typeof r!=='object'||
    Object.keys(r).sort().join(',')!==
    'applicantId,challengeId,documentSha,documentVersion,experiment,holdUntilUtc,requestId,screeningId,slotId')
  throw Error('原七步預約交易欄位不合法');
 for(const k of ['applicantId','challengeId','screeningId','slotId'])
  study1BindingId_(r[k]);
 if(!['E1','E2'].includes(r.experiment)||
    typeof r.documentSha!=='string'||!/^[a-f0-9]{64}$/.test(r.documentSha)||
    typeof r.documentVersion!=='string'||r.documentVersion.length<2||
    r.documentVersion.length>64||
    typeof r.requestId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(r.requestId))
  throw Error('研究實驗別、文件SHA或一次交易識別碼不合法');
 study1BindingUtc_(r.holdUntilUtc);
 return {
  applicantId:r.applicantId,challengeId:r.challengeId,
  screeningId:r.screeningId,slotId:r.slotId,
  experiment:r.experiment,documentSha:r.documentSha,
  documentVersion:r.documentVersion,holdUntilUtc:r.holdUntilUtc,
  requestId:r.requestId
 };
}
function study1WizardDocument_(r){
 const d=study1EConsentReadyDocument_(r.experiment);
 if(!d||d.experiment!==r.experiment||
    d.sha256!==r.documentSha||d.version!==r.documentVersion||
    !/^[a-f0-9]{64}$/.test(d.sha256||''))
  throw Error('DOC_VERSION_MISMATCH：E1/E2對應原版PDF及SHA不一致');
 return d;
}
/** Fail closed before querying/using any participant record. */
function study1WizardAuthorityCheck_(r,identity){
 if(!identity||identity.verified!==true||
    identity.provenance!=='REC_APPROVED_IDENTITY_ATTESTATION'||
    identity.applicantId!==r.applicantId||
    identity.screeningId!==r.screeningId||
    identity.challengeId!==r.challengeId||
    identity.experiment!==r.experiment||
    identity.age18OrOlderVerified!==true||
    identity.cycuStudentVerified!==true||
    identity.eligibilityEvidenceSource!=='REC_APPROVED_ELIGIBILITY_VERIFICATION'||
    typeof identity.eligibilityEvidenceSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(identity.eligibilityEvidenceSha256)||
    typeof identity.evidenceSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(identity.evidenceSha256)||
    typeof identity.email!=='string')
  throw Error('IDENTITY_EVIDENCE_INVALID：不是同一已核身申請、OTP及實驗資格');
 if(r.experiment==='E2'&&
    !(identity.priorE1ParticipationVerified===true&&
      identity.priorE1Participation===false&&
      identity.priorE1Source==='REC_APPROVED_STUDY_HISTORY'&&
      /^[a-f0-9]{64}$/.test(identity.priorE1EvidenceSha256||'')))
  throw Error('ELIGIBILITY_EVIDENCE_MISSING：實驗二缺少未參加實驗一的證據');
 return identity;
}
function study1WizardReadPerson_(r,identity){
 const personal=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
 const a=study1BindingSheetRow_(personal,'Applicants',
    STUDY1_BINDING_SCHEMA_.applicants,r.applicantId).rows[0];
 const s=study1BindingSheetRow_(personal,'Screenings',
    STUDY1_BINDING_SCHEMA_.screenings,r.screeningId).rows[0];
 const v=study1BindingSheetRow_(personal,'Verification',
    STUDY1_BINDING_SCHEMA_.verification,r.challengeId).rows[0];
 const email=study1BindingEmail_(identity.email),now=Date.now();
 if(a[0]!==r.applicantId||a[6]!=='VERIFIED'||
    study1BindingEmail_(a[2])!==email||
    s[1]!==r.applicantId||s[3]!=='ELIGIBLE'||
    s[2]!==identity.screeningVersion||!s[5]||
    v[1]!==r.applicantId||v[2]!=='EMAIL_VERIFICATION'||
    study1BindingEmail_(v[7])!==email||
    !/^[a-f0-9]{64}$/.test(v[3])||
    !Number.isSafeInteger(Number(v[5]))||Number(v[5])<1||
    Number(v[5])>5)
  throw Error('WIZARD_PROOF_INVALID：申請、資格、電子郵件與OTP不一致');
 const created=study1BindingUtc_(v[8]),expires=study1BindingUtc_(v[4]),
 used=study1BindingUtc_(v[6]);
 if(expires<=created||expires-created>600000||
    used<created||used>=expires||used>now||
    used<study1BindingUtc_(s[4]))
  throw Error('WIZARD_PROOF_INVALID：OTP並非有效期間內已使用的一次性驗證');
 return {email,usedAtUtc:v[6],identityEvidenceSha:identity.evidenceSha256,
  eligibilityEvidenceSha:identity.eligibilityEvidenceSha256,
  e1HistorySha:r.experiment==='E2'?identity.priorE1EvidenceSha256:null};
}
function study1WizardSlotCheck_(r,slot){
 const grant=study1WizardSlotAuthority_(r);
 if(!grant||grant.verified!==true||
    grant.provenance!=='TRUSTED_FORMAL_SLOT_EXPERIMENT_REGISTRY'||
    grant.experiment!==r.experiment||grant.slotId!==r.slotId||
    !/^[a-f0-9]{64}$/.test(grant.evidenceSha256||'')||
    !Array.isArray(slot)||slot[0]!==r.slotId||slot[5]!=='OPEN')
  throw Error('SLOT_EXPERIMENT_MISMATCH：不是此實驗正式核定場次');
 return grant.evidenceSha256;
}
/** Read original booking model without mutating or normalizing stored cells.
 * Source includes only the two operations Sheet tabs and required columns.
 * Every read and write is performed by the existing BookingHold kernel while
 * the single ScriptLock is owned by that kernel.
 */
function study1WizardReadBook_(tab,headers){
 if(!tab||tab.getLastColumn()!==headers.length)
  throw Error('預約正式表欄位數不符合原模型');
 const last=tab.getLastRow();
 if(!Number.isSafeInteger(last)||last<1||last>10001)
  throw Error('預約正式表的資料列上限或表頭不合格');
 const actual=tab.getRange(1,1,1,headers.length).getValues()[0];
 if(!Array.isArray(actual)||headers.some((x,i)=>x!==actual[i]))
  throw Error('預約正式表的欄位次序改變');
 const data=last===1?[]:tab.getRange(2,1,last-1,headers.length).getValues();
 if(!Array.isArray(data)||data.length!==last-1)
  throw Error('預約資料快照未完整讀取');
 const rows=data.map(row=>{
  if(!Array.isArray(row)||row.length!==headers.length)
   throw Error('預約快照缺欄');
  return row.map((v,i)=>{
   if(!Object.prototype.hasOwnProperty.call(row,i))
    throw Error('預約資料有稀疏儲存格');
   if(Object.prototype.toString.call(v)==='[object Date]'){
    if(!Number.isFinite(v.getTime()))throw Error('預約時段時間不合法');
    return v.toISOString();
   }
   if(typeof v==='string'||typeof v==='boolean'||
      (typeof v==='number'&&Number.isFinite(v)))return v;
   throw Error('預約儲存格型別不合法');
  });
 });
 return {headers:headers.slice(),rows};
}
/** Enforce the same ScriptLock, document binding and trusted participant
 * identity at EACH read/append boundary of the original booking kernel.
 * No caller may inject a source adapter into this GAS entry.
 */
function study1WizardHoldBound_(untrusted){
 study1WizardP0Gate_();
 const r=study1WizardRequest_(untrusted);
 study1WizardDocument_(r);
 const issuedKey='WZ_'+study1BindingHmac_([
  'STUDY1_WIZARD_BOOKING_V1',r.applicantId,r.challengeId,
  r.screeningId,r.experiment,r.slotId,r.documentSha,
  r.documentVersion,r.requestId
 ]);
 // No booking Sheet open until the same locked applicant/OTP proof exists.
 let operations=null,slots=null,reservations=null;
 let last=null,proof=null,slotSha=null;
 const recheck=()=>{
  study1WizardP0Gate_();study1WizardDocument_(r);
  const att=study1WizardAuthorityCheck_(r,study1WizardApplicantAuthority_(r));
  const fresh=study1WizardReadPerson_(r,att);
  if(proof&&JSON.stringify(proof)!==JSON.stringify(fresh))
   throw Error('WIZARD_PROOF_CHANGED：核身或OTP來源在同一交易中變動');
  proof=fresh;return fresh;
 };
 const adapters={
  getLock:()=>LockService.getScriptLock(),
  isVerifiedAndEligible:applicantId=>{
   if(applicantId!==r.applicantId)return false;
   recheck();
   operations=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
   slots=operations.getSheetByName('Slots');
   reservations=operations.getSheetByName('Reservations');
   if(!slots||!reservations)throw Error('正式時段及預約表不存在');
   const row=study1BindingSheetRow_(operations,'Slots',
     BOOKING_SLOT_HEADERS_,r.slotId).rows[0];
   slotSha=study1WizardSlotCheck_(r,row);
   return true;
  },
  readSnapshot:()=>{
   recheck();
   const snapshot={
    slots:study1WizardReadBook_(slots,BOOKING_SLOT_HEADERS_),
    reservations:study1WizardReadBook_(reservations,BOOKING_RESERVATION_HEADERS_)
   };
   const chosen=snapshot.slots.rows.filter(row=>row[0]===r.slotId);
   if(chosen.length!==1)throw Error('指定場次並非唯一');
   const checked=study1WizardSlotCheck_(r,chosen[0]);
   if(slotSha&&checked!==slotSha)
    throw Error('SLOT_EXPERIMENT_MISMATCH：時段實驗別證據已更新');
   slotSha=checked;
   last=snapshot;
   return snapshot;
  },
  appendHold:params=>{
   recheck();
   if(!last||!slotSha||
      params.applicantId!==r.applicantId||params.slotId!==r.slotId||
      params.idempotencyKey!==issuedKey||
      params.holdUntilUtc!==r.holdUntilUtc)
    throw Error('預約資料與已驗證的同一請求不一致');
   // An independent out-of-band writer cannot be overwritten silently;
   // compare immediately before append, still under the same ScriptLock.
   const nowSlot=study1WizardReadBook_(slots,BOOKING_SLOT_HEADERS_);
   const nowRes=study1WizardReadBook_(reservations,BOOKING_RESERVATION_HEADERS_);
   if(JSON.stringify(nowSlot)!==JSON.stringify(last.slots)||
      JSON.stringify(nowRes)!==JSON.stringify(last.reservations))
    throw Error('預約在寫入前遭變更，請重新核對');
   const reservationId='RSV_'+Utilities.getUuid().replace(/-/g,'');
   study1BindingId_(reservationId);
   if(last.reservations.rows.some(x=>x[0]===reservationId))
    throw Error('預約ID碰撞，禁止覆寫');
   if(reservations.getLastRow()!==nowRes.rows.length+1)
    throw Error('預約表資料列在寫入前改變');
   reservations.appendRow([reservationId,r.applicantId,r.slotId,'HELD',
     params.holdUntilUtc,issuedKey,params.nowUtc,'','',params.nowUtc]);
   SpreadsheetApp.flush();
   return true; // BookingHoldOnceLocked_ performs full independent readback
  }
 };
 const result=bookingHoldOnceLocked_({
  applicantId:r.applicantId,slotId:r.slotId,
  idempotencyKey:issuedKey,nowUtc:new Date().toISOString(),
  holdUntilUtc:r.holdUntilUtc
 },adapters);
 if(result.held!==true)return {held:false,reason:result.reason};
 const matches=last?.reservations?.rows?.filter(row=>row[5]===issuedKey)||[];
 if(matches.length!==1||matches[0][1]!==r.applicantId||
    matches[0][2]!==r.slotId||matches[0][3]!=='HELD'||
    matches[0][4]!==r.holdUntilUtc)
  throw Error('預約成功回覆與原始持久化來源不一致');
 const reservationId=matches[0][0];
 // Proof is scoped to the selected original 7-step application, OTP, E1/E2,
 // exact booking and official document; cannot be transplanted to another.
 const receipt=study1BindingHmac_([
  'STUDY1_WIZARD_HOLD_RECEIPT_V1',r.applicantId,r.challengeId,
  r.screeningId,r.experiment,r.slotId,reservationId,
  r.holdUntilUtc,r.documentSha,r.documentVersion,
  proof.identityEvidenceSha,proof.eligibilityEvidenceSha,proof.e1HistorySha,
  slotSha,issuedKey
 ]);
 return {held:true,reason:result.reason,
  applicantId:r.applicantId,reservationId,slotId:r.slotId,
  experiment:r.experiment,documentSha:r.documentSha,
  documentVersion:r.documentVersion,holdUntilUtc:r.holdUntilUtc,
  receipt};
}
/** Stage 3 delegates to existing one-time code consumption and F:G CAS.
 * No separate OTP status or plaintext OTP is created in Study1Unified TEST.
 */
function study1WizardOtpVerifyBound_(r){
 study1WizardP0Gate_();
 if(!r||Array.isArray(r)||typeof r!=='object'||
    Object.keys(r).sort().join(',')!==
    'applicantId,challengeId,code,experiment,screeningId')
  throw Error('原七步OTP請求格式不正確');
 return study1EConsentVerifyContactOtp_(r);
}

/** Stage 05: server-verified booking summary, not client-authorized consent.
 * Validate original HELD row AND original document, identity and slot mapping
 * against the receipt generated at stage 04. This is read-only. No assumption
 * about a research participant's real identity can be derived from OTP alone.
 */
function study1WizardReviewBound_(untrusted){
 study1WizardP0Gate_();
 if(!untrusted||Array.isArray(untrusted)||typeof untrusted!=='object'||
    Object.keys(untrusted).sort().join(',')!==
    'applicantId,challengeId,documentSha,documentVersion,experiment,holdUntilUtc,receipt,requestId,reservationId,screeningId,slotId')
  throw Error('簽署前預約核對欄位不合格');
 const base={
  applicantId:untrusted.applicantId,challengeId:untrusted.challengeId,
  screeningId:untrusted.screeningId,slotId:untrusted.slotId,
  experiment:untrusted.experiment,documentSha:untrusted.documentSha,
  documentVersion:untrusted.documentVersion,
  holdUntilUtc:untrusted.holdUntilUtc,requestId:untrusted.requestId
 };
 const r=study1WizardRequest_(base);
 const reservationId=study1BindingId_(untrusted.reservationId);
 if(typeof untrusted.receipt!=='string'||!/^[a-f0-9]{64}$/.test(untrusted.receipt))
  throw Error('預約憑證格式不合法');
 study1WizardDocument_(r);
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||typeof lock.hasLock!=='function'||
    typeof lock.releaseLock!=='function'||lock.tryLock(5000)!==true)
  throw Error('無法取得簽署前預約核對共用鎖');
 try{
  if(lock.hasLock()!==true)throw Error('共用鎖失效');
  study1WizardP0Gate_();study1WizardDocument_(r);
  const identity=study1WizardAuthorityCheck_(r,study1WizardApplicantAuthority_(r));
  const proof=study1WizardReadPerson_(r,identity);
  if(lock.hasLock()!==true)throw Error('核身期間共用鎖失效');
  const operations=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
  const b=study1BindingSheetRow_(operations,'Reservations',
    BOOKING_RESERVATION_HEADERS_,reservationId).rows[0];
  const slot=study1BindingSheetRow_(operations,'Slots',
    BOOKING_SLOT_HEADERS_,r.slotId).rows[0];
  const slotEvidenceSha=study1WizardSlotCheck_(r,slot);
  const idempotencyKey='WZ_'+study1BindingHmac_([
   'STUDY1_WIZARD_BOOKING_V1',r.applicantId,r.challengeId,
   r.screeningId,r.experiment,r.slotId,r.documentSha,
   r.documentVersion,r.requestId
  ]);
  if(b[0]!==reservationId||b[1]!==r.applicantId||
     b[2]!==r.slotId||b[3]!=='HELD'||
     b[4]!==r.holdUntilUtc||b[5]!==idempotencyKey||
     study1BindingUtc_(b[4])<=Date.now()||
     study1BindingUtc_(slot[1])<=Date.now()||
     study1BindingUtc_(b[4])>study1BindingUtc_(slot[1]))
   throw Error('預約已失效、被取消、申請者不一致或重送識別碼已更改');
  const expected=study1BindingHmac_([
   'STUDY1_WIZARD_HOLD_RECEIPT_V1',
   r.applicantId,r.challengeId,r.screeningId,r.experiment,
   r.slotId,reservationId,r.holdUntilUtc,r.documentSha,
   r.documentVersion,proof.identityEvidenceSha,
   proof.eligibilityEvidenceSha,proof.e1HistorySha,
   slotEvidenceSha,idempotencyKey
  ]);
  // Fixed length, compare all bytes to avoid early mismatch disclosure.
  let diff=0;
  for(let i=0;i<64;i++)
   diff|=expected.charCodeAt(i)^untrusted.receipt.charCodeAt(i);
  if(diff!==0)throw Error('預約憑證HMAC與最新正式來源不符');
  if(lock.hasLock()!==true)throw Error('核對期間共用鎖失效');
  return {verified:true,stage:'CONFIRM',experiment:r.experiment,
   applicantId:r.applicantId,reservationId,slotId:r.slotId,
   startAtUtc:slot[1],endAtUtc:slot[2],locationCode:slot[4],
   holdUntilUtc:b[4],documentVersion:r.documentVersion,
   documentSha:r.documentSha};
 }finally{lock.releaseLock();}
}
