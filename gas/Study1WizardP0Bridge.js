/**
 * Study1 original 7-step Visitor -> official Applicants / Screenings /
 * Verification / Slots / Reservations / E1-E2 document binding.
 *
 * PRIVATE GAS ONLY: all externally accessible site intake RPCs in Website.js
 * remain closed. This adapter DOES NOT replace Study1Unified TEST, V05/V08,
 * publish any endpoint, send mail, or write real Sheet data until a separate
 * deployment and E1 slot source are approved and verified.
 *
 * The research is REC-approved (202604EM033). Missing slot
 * mapping is a TECHNICAL readiness failure, never a blanket REC veto.
 *
 * OTP_VERIFY (step 3) delegates to existing one-time OTP adapter/kernel.
 * HOLD (step 4) delegates to existing BookingHoldTransaction kernel, preserving
 * unique applicant, no overcapacity, lock, idempotency and full readback.
 * Final consent (step 6) remains study1EConsentIssueBound_ / SignPdf;
 * it must re-read this same applicant / OTP / reservation identity source.
 */

/** The original self-declaration+OTP source is server-only and HMAC-bound.
 * No researcher checks identity cards, student cards or the CYCU registry.
 * The authority cannot be read without the shared booking transaction lock.
 */
function study1WizardApplicantAuthority_(request,heldLock){
 return study1SelfReportedAuthority_(request,heldLock);
}
/** Official Slots tab has NO experiment column. Never infer E1/E2 from a
 * slotId string, client selection or free-text location_code.
 */
function study1WizardSlotAuthority_(request, originalSlot, heldLock){
 // This registry is an OWNER-provisioned server-side source, NOT a field in
 // the visitor request or a guess from slot_id/location_code. Provisioning
 // remains disabled until the PI has verified the original Slots rows.
 if(!heldLock||heldLock.hasLock()!==true)
  throw Error('SLOT_SHARED_LOCK_REQUIRED');
 if(request.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')!=='true')
  throw Error('SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED');
 const raw=p.getProperty('STUDY1_E1_SLOT_REGISTRY_V1');
 const mac=p.getProperty('STUDY1_E1_SLOT_REGISTRY_HMAC');
 if(typeof raw!=='string'||raw.length<2||raw.length>200000||
    typeof mac!=='string'||!/^[a-f0-9]{64}$/.test(mac))
  throw Error('SLOT_REGISTRY_INVALID');
 if(study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw])!==mac)
  throw Error('SLOT_REGISTRY_TAMPERED');
 let entries;
 try{entries=JSON.parse(raw);}catch(e){throw Error('SLOT_REGISTRY_INVALID');}
 if(!Array.isArray(entries)||entries.length<1||entries.length>10000)
  throw Error('SLOT_REGISTRY_INVALID');
 const ids=new Set();let selected=null;
 for(const entry of entries){
  if(!entry||Array.isArray(entry)||typeof entry!=='object'||
     Object.keys(entry).sort().join(',')!==
       'experiment,slotId,slotRowSha256')
   throw Error('SLOT_REGISTRY_INVALID');
  study1BindingId_(entry.slotId);
  if(ids.has(entry.slotId)||!['E1','E2'].includes(entry.experiment)||
     !/^[a-f0-9]{64}$/.test(entry.slotRowSha256||''))
   throw Error('SLOT_REGISTRY_INVALID');
  ids.add(entry.slotId);
  if(entry.slotId===request.slotId)selected=entry;
 }
 if(!selected||selected.experiment!=='E1'||
    !Array.isArray(originalSlot)||originalSlot.length!==8||
    originalSlot[0]!==request.slotId)
  throw Error('SLOT_EXPERIMENT_MISMATCH');
 // The registry pins the complete original row; any schedule/capacity/status
 // edit requires a researcher-reviewed reissue, never a browser assertion.
 const rowSha=study1BindingHmac_([
  'STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...originalSlot]);
 if(rowSha!==selected.slotRowSha256)
  throw Error('SLOT_REGISTRY_STALE');
 return {verified:true,provenance:'TRUSTED_FORMAL_SLOT_EXPERIMENT_REGISTRY',
  experiment:'E1',slotId:request.slotId,
  evidenceSha256:study1BindingHmac_([
   'STUDY1_E1_SLOT_AUTHORITY_V1',mac,request.slotId,rowSha])};
}
function study1WizardP0Gate_(){
 // Participant booking uses an E1-specific gate; owner-only consent backend
 // permissions are checked separately and must never be borrowed here.
 study1ParticipantGate_();
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_WIZARD_P0_SHEET_HOLD_VERIFIED')!=='true'||
    p.getProperty('STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED')!=='true'||
    p.getProperty('STUDY1_E1_BOOKING_APPROVED')!=='true')
  throw Error('BACKEND_NOT_READY：原七步E1預約及自陳OTP來源尚未完成驗證');
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
/** Self-declaration+consumed OTP, never an identity-document attestation. */
function study1WizardAuthorityCheck_(r,identity){
 if(r.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 if(!identity||identity.verified!==true||
    identity.provenance!=='STUDY1_E1_SELF_REPORT_OTP_HMAC'||
    identity.applicantId!==r.applicantId||
    identity.screeningId!==r.screeningId||
    identity.challengeId!==r.challengeId||
    identity.experiment!=='E1'||
    identity.eligibilityEvidenceSource!=='PARTICIPANT_SELF_REPORT'||
    identity.emailControlSource!=='ORIGINAL_VERIFICATION_FG'||
    !/^[a-f0-9]{64}$/.test(identity.eligibilityEvidenceSha256||'')||
    !/^[a-f0-9]{64}$/.test(identity.evidenceSha256||'')||
    typeof identity.email!=='string'||
    typeof identity.screeningVersion!=='string')
   throw Error('SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID');
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
 if(a[0]!==r.applicantId||a[6]!=='EMAIL_VERIFIED'||
    study1BindingEmail_(a[2])!==email||
    s[1]!==r.applicantId||s[3]!=='ELIGIBLE'||
    s[2]!==identity.screeningVersion||
    s[5]!=='PARTICIPANT_SELF_REPORT'||
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
    used<study1BindingUtc_(s[4])||
    identity.verifiedAtUtc!==v[6]||now-used>30*60000)
  throw Error('WIZARD_PROOF_INVALID：OTP並非有效期間內已使用的一次性驗證');
 return {email,usedAtUtc:v[6],identityEvidenceSha:identity.evidenceSha256,
  eligibilityEvidenceSha:identity.eligibilityEvidenceSha256,
  e1HistorySha:null};
}
function study1WizardSlotCheck_(r,slot,heldLock){
 const grant=study1WizardSlotAuthority_(r,slot,heldLock);
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
 let last=null,proof=null,slotSha=null,bookingLock=null;
 const recheck=()=>{
  study1WizardP0Gate_();study1WizardDocument_(r);
  const att=study1WizardAuthorityCheck_(r,study1WizardApplicantAuthority_(r,bookingLock));
  const fresh=study1WizardReadPerson_(r,att);
  if(proof&&JSON.stringify(proof)!==JSON.stringify(fresh))
   throw Error('WIZARD_PROOF_CHANGED：資格自陳或OTP來源在同一交易中變動');
  proof=fresh;return fresh;
 };
 const adapters={
  getLock:()=>{bookingLock=LockService.getScriptLock();return bookingLock;},
  isVerifiedAndEligible:applicantId=>{
   if(applicantId!==r.applicantId)return false;
   recheck();
   operations=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
   slots=operations.getSheetByName('Slots');
   reservations=operations.getSheetByName('Reservations');
   if(!slots||!reservations)throw Error('正式時段及預約表不存在');
   const row=study1BindingSheetRow_(operations,'Slots',
     BOOKING_SLOT_HEADERS_,r.slotId).rows[0];
   slotSha=study1WizardSlotCheck_(r,row,bookingLock);
   // Direct holds must not jump over a prior E1 waitlist. A queue head
   // must claim the seat using the separate reverified WAITLIST operation.
   const pending=study1WizardReadBook_(reservations,BOOKING_RESERVATION_HEADERS_)
     .rows.some(x=>x[2]===r.slotId&&x[3]==='WAITLISTED');
   if(pending)return false;
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
   const checked=study1WizardSlotCheck_(r,chosen[0],bookingLock);
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
 // E1 eligibility is self-declared; OTP only verifies email access.
 if(r.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)
  throw Error('OTP本人申請共用鎖遭占用');
 let email;
 try{
  if(!lock.hasLock())throw Error('OTP本人申請共用鎖失效');
  study1WizardP0Gate_();
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const applicant=study1BindingSheetRow_(book,'Applicants',
   STUDY1_BINDING_SCHEMA_.applicants,r.applicantId).rows[0];
  const screening=study1BindingSheetRow_(book,'Screenings',
   STUDY1_BINDING_SCHEMA_.screenings,r.screeningId).rows[0];
  const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  if(applicant[6]!=='PENDING_EMAIL'||
     screening[1]!==r.applicantId||
     screening[2]!==policy.screeningVersion||
     screening[3]!=='ELIGIBLE'||
     screening[5]!=='PARTICIPANT_SELF_REPORT')
   throw Error('EMAIL_OTP_SELF_REPORT_SOURCE_INVALID');
  email=study1BindingEmail_(applicant[2]);
 }finally{lock.releaseLock();}
 // Both operations independently lock and recheck F:G+original rows.
 const verified=study1ParticipantOtpVerify_({
  applicantId:r.applicantId,screeningId:r.screeningId,
  challengeId:r.challengeId,experiment:'E1',email,code:r.code});
 if(verified.verified!==true)return verified;
 if(!verified.emailProof)throw Error('EMAIL_PROOF_MISSING');
 const status=study1ParticipantEmailStatus_(verified.emailProof);
 if(!status.emailVerified||
    status.eligibilitySource!=='PARTICIPANT_SELF_REPORT'||
    status.applicationState!=='SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED')
  throw Error('EMAIL_PROOF_RECHECK_FAILED');
 return verified;
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
  const identity=study1WizardAuthorityCheck_(r,study1WizardApplicantAuthority_(r,lock));
  const proof=study1WizardReadPerson_(r,identity);
  if(lock.hasLock()!==true)throw Error('自陳資格核對期間共用鎖失效');
  const operations=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
  const b=study1BindingSheetRow_(operations,'Reservations',
    BOOKING_RESERVATION_HEADERS_,reservationId).rows[0];
  const slot=study1BindingSheetRow_(operations,'Slots',
    BOOKING_SLOT_HEADERS_,r.slotId).rows[0];
  const slotEvidenceSha=study1WizardSlotCheck_(r,slot,lock);
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


/**
 * Public E1 pre-enrollment preflight: use ONLY the original Slots, never
 * applicant or consent records. Verify independent PI-reviewed E1 HMAC pins
 * and a future OPEN row before collecting a name or triggering Turnstile.
 * The response is Boolean only; no slot names, calendar, location or secret
 * is exposed to anonymous callers. Caller may supply an existing ScriptLock.
 */
function study1FormalPublicSlotReady_(heldLock){
 const externallyLocked=heldLock!==undefined;
 const lock=externallyLocked?heldLock:LockService.getScriptLock();
 if(!lock||typeof lock.hasLock!=='function'||
    (!externallyLocked&&(!lock.tryLock||lock.tryLock(5000)!==true)))
  throw Error('E1_PREFLIGHT_SLOT_LOCK_UNAVAILABLE');
 try{
  if(lock.hasLock()!==true)throw Error('E1_PREFLIGHT_SLOT_LOCK_LOST');
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')!=='true')
   return false;
  const book=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
  if(!book||typeof book.getId!=='function'||
     book.getId()!=='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ')
   throw Error('E1_PREFLIGHT_SOURCE_ID_MISMATCH');
  // These readers reject formulas and malformed headers, and two identical
  // reads guard against inconsistent rows without modifying the original.
  const first=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  const second=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  if(!bookingReadOnlySameTab_(first,second))
   throw Error('E1_PREFLIGHT_SOURCE_CHANGED');
  if(!first.rows.length)return false;
  const now=Date.now(),ids=new Set();let found=0;
  for(const row of first.rows){
   const id=study1BindingId_(row[0]);
   if(ids.has(id))throw Error('E1_PREFLIGHT_DUPLICATE_SLOT');
   ids.add(id);
   if(row[5]!=='OPEN')continue;
   const starts=study1BindingUtc_(row[1]);
   const ends=study1BindingUtc_(row[2]);
   if(ends<=starts)throw Error('E1_PREFLIGHT_TIME_INVALID');
   if(starts<=now)continue;
   if(!Number.isSafeInteger(row[3])||row[3]<1)
    throw Error('E1_PREFLIGHT_CAPACITY_INVALID');
   try{
    study1WizardSlotAuthority_({slotId:id,experiment:'E1'},row,lock);
    found++;
   }catch(error){
    if(String(error.message)==='SLOT_EXPERIMENT_MISMATCH')continue;
    throw error; // stale/tampered E1 registry is never silently ignored
   }
  }
  if(lock.hasLock()!==true)throw Error('E1_PREFLIGHT_SLOT_LOCK_LOST');
  return found>0;
 }finally{
  if(!externallyLocked)lock.releaseLock();
 }
}

/**
 * §70-S.20 OWNER-only, READ-ONLY audit of the exact original Slots rows.
 * This never assigns E1/E2, approves a slot, reads participant reservations,
 * writes ScriptProperties, or activates recruitment. A PI must separately
 * review real rows and their valid REC/protocol scope before provisioning.
 * A browser's claim that a slot is E1 is never used as authority.
 */
function study1OwnerE1SlotAudit(){
 study1AdminOwnerRequired_();
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(5000)!==true)
  throw Error('E1_AUDIT_LOCK_UNAVAILABLE');
 try{
  if(lock.hasLock()!==true)throw Error('E1_AUDIT_LOCK_LOST');
  study1AdminOwnerRequired_();
  const p=PropertiesService.getScriptProperties();
  const book=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
  if(!book||typeof book.getId!=='function'||
     book.getId()!=='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ')
   throw Error('E1_AUDIT_SOURCE_ID_MISMATCH');
  // Read only Slots twice, validating exact schema and formula absence.
  // In particular, never return/read Applicants or Reservations PII here.
  const first=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  const second=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  if(!bookingReadOnlySameTab_(first,second))
   throw Error('E1_AUDIT_SLOTS_CHANGED_DURING_READ');
  const raw=p.getProperty('STUDY1_E1_SLOT_REGISTRY_V1');
  const mac=p.getProperty('STUDY1_E1_SLOT_REGISTRY_HMAC');
  const approved=p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')==='true';
  const hasRegistry=raw!==null&&raw!==undefined;
  const hmacKey=p.getProperty('STUDY1_ECONSENT_BINDING_HMAC_KEY');
  const hmacConfigured=typeof hmacKey==='string'&&hmacKey.length>=32&&
   !/SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(hmacKey);
  let registry=[];
  if(hasRegistry||mac!==null&&mac!==undefined||approved){
   if(!hmacConfigured||typeof raw!=='string'||raw.length<2||
      raw.length>200000||typeof mac!=='string'||!/^[a-f0-9]{64}$/.test(mac))
    throw Error('E1_AUDIT_REGISTRY_INVALID');
   if(study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw])!==mac)
    throw Error('E1_AUDIT_REGISTRY_TAMPERED');
   try{registry=JSON.parse(raw);}catch(_){throw Error('E1_AUDIT_REGISTRY_INVALID');}
   if(!Array.isArray(registry)||registry.length<1||registry.length>10000)
    throw Error('E1_AUDIT_REGISTRY_INVALID');
   const ids=new Set();
   for(const r of registry){
    if(!r||Array.isArray(r)||typeof r!=='object'||
       Object.keys(r).sort().join(',')!=='experiment,slotId,slotRowSha256'||
       !['E1','E2'].includes(r.experiment)||!/^[a-f0-9]{64}$/.test(r.slotRowSha256||''))
     throw Error('E1_AUDIT_REGISTRY_INVALID');
    study1BindingId_(r.slotId);
    if(ids.has(r.slotId))throw Error('E1_AUDIT_REGISTRY_DUPLICATE');
    ids.add(r.slotId);
   }
  }
  const reg=new Map(registry.map(r=>[r.slotId,r]));
  const seen=new Set(),rows=first.rows.map(row=>{
   const slotId=study1BindingId_(row[0]);
   if(seen.has(slotId))throw Error('E1_AUDIT_DUPLICATE_ORIGINAL_SLOT_ID');
   seen.add(slotId);
   const pin=reg.get(slotId),fingerprint=hmacConfigured?
    study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...row]):null;
   const originalMatches=!!pin&&fingerprint===pin.slotRowSha256;
   // Report the registry label only: neither the ID nor the location implies E1.
   const registryExperiment=pin?pin.experiment:'UNCLASSIFIED';
   const start=row[1] instanceof Date?row[1].toISOString():row[1];
   const end=row[2] instanceof Date?row[2].toISOString():row[2];
   return {slotId,startAtUtc:start,endAtUtc:end,capacity:row[3],
    locationCode:row[4],status:row[5],registryExperiment,
    pinnedRowMatches:originalMatches,
    pinStatus:!pin?'NOT_REVIEWED':originalMatches?'MATCHED':'STALE'};
  });
  const missing=registry.filter(r=>!seen.has(r.slotId)).map(r=>r.slotId);
  if(lock.hasLock()!==true)throw Error('E1_AUDIT_LOCK_LOST');
  const matchedE1=rows.filter(r=>r.registryExperiment==='E1'&&
    r.pinnedRowMatches).length;
  const stale=rows.some(r=>r.pinStatus==='STALE')||missing.length>0;
  const mappingVerified=approved&&hasRegistry&&hmacConfigured&&
    matchedE1>0&&!stale;
  return {mode:'OWNER_ONLY_READ_ONLY',source:'ORIGINAL_OPERATIONS_SLOTS',
   slotCount:rows.length,registryEntries:registry.length,
   ownerRegistryApprovedFlag:approved,hmacKeyPresent:hmacConfigured,
   registrySignatureChecked:hasRegistry,matchedE1Count:matchedE1,
   staleOrMissingRegistryRows:stale,missingPinnedIds:missing,
   mappingVerified,formalReady:false,recRemoteConsentScopeVerified:false,
   note:'僅核對原Slots與目前已配置的HMAC；未審定新E1場次、未查REC遠端同意適用、未部署或開放收件。',
   rows};
 }finally{lock.releaseLock();}
}

/**
 * §70-S.21: make a NON-ACTIVATING E1/E2 proposal for PI review.
 * Read the original Slots sheet twice under the owner lock. It is impossible
 * to propose a real slot when the source has header only, and nothing is
 * written to Slots, Properties or registry. Client classification is NEVER
 * treated as approval, even though the candidate is HMAC-addressed.
 */
function study1OwnerE1SlotRegistryProposal(input){
 study1AdminOwnerRequired_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
    Object.keys(input).sort().join(',')!=='decisions'||
    !Array.isArray(input.decisions)||input.decisions.length>1000)
  throw Error('SLOT_PROPOSAL_REQUEST_INVALID');
 const decisions=input.decisions;
 const ids=new Set();
 for(const d of decisions){
  if(!d||Array.isArray(d)||typeof d!=='object'||
     Object.keys(d).sort().join(',')!=='experiment,slotId'||
     !['E1','E2'].includes(d.experiment))
   throw Error('SLOT_PROPOSAL_DECISION_INVALID');
  study1BindingId_(d.slotId);
  if(ids.has(d.slotId))throw Error('SLOT_PROPOSAL_DUPLICATE_DECISION');
  ids.add(d.slotId);
 }
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(5000)!==true)
  throw Error('SLOT_PROPOSAL_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('SLOT_PROPOSAL_LOCK_LOST');
  study1AdminOwnerRequired_();
  const book=SpreadsheetApp.openById(study1BindingSheetId_('slots'));
  if(!book||typeof book.getId!=='function'||
     book.getId()!=='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ')
   throw Error('SLOT_PROPOSAL_ORIGINAL_SOURCE_MISMATCH');
  const first=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  const second=bookingReadOnlyTab_(book,'Slots',BOOKING_SLOT_HEADERS_);
  if(!bookingReadOnlySameTab_(first,second))
   throw Error('SLOT_PROPOSAL_READ_DRIFT');
  const sourceIds=new Set();
  for(const r of first.rows){
   if(!Array.isArray(r)||r.length!==8)
    throw Error('SLOT_PROPOSAL_ROW_INVALID');
   study1BindingId_(r[0]);
   if(sourceIds.has(r[0]))throw Error('SLOT_PROPOSAL_SOURCE_DUPLICATE');
   sourceIds.add(r[0]);
  }
  if(!first.rows.length){
   if(decisions.length)throw Error('SLOT_PROPOSAL_NO_ORIGINAL_ROWS');
   return {status:'BLOCKED_NO_OFFICIAL_SLOTS',sourceId:book.getId(),
    sourceRows:0,proposalEntries:[],registryJson:null,
    registryHmac:null,approved:false,scriptPropertiesChanged:false};
  }
  if(decisions.some(d=>!sourceIds.has(d.slotId)))
   throw Error('SLOT_PROPOSAL_UNMAPPED_DECISION');
  const props=PropertiesService.getScriptProperties();
  if(!props||typeof props.getProperty!=='function')
   throw Error('SLOT_PROPOSAL_HMAC_NOT_CONFIGURED');
  const selected=new Map(decisions.map(d=>[d.slotId,d.experiment]));
  const proposals=first.rows.filter(r=>selected.has(r[0])).map(r=>({
   slotId:r[0],experiment:selected.get(r[0]),
   slotRowSha256:study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...r])
  }));
  proposals.sort((a,b)=>a.slotId.localeCompare(b.slotId));
  if(!proposals.length)
   return {status:'PI_DECISIONS_REQUIRED',sourceId:book.getId(),
    sourceRows:first.rows.length,proposalEntries:[],registryJson:null,
    registryHmac:null,approved:false,scriptPropertiesChanged:false};
  const raw=JSON.stringify(proposals);
  const mac=study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw]);
  if(lock.hasLock()!==true)throw Error('SLOT_PROPOSAL_LOCK_LOST');
  return {status:'PI_REVIEW_CANDIDATE_ONLY',sourceId:book.getId(),
   sourceRows:first.rows.length,proposalEntries:proposals,
   registryJson:raw,registryHmac:mac,approved:false,
   scriptPropertiesChanged:false,needPiIndependentApproval:true,
   note:'原列HMAC候選，非PI核定；本函式絕不修改登錄或開啟E1/E2'};
 }finally{lock.releaseLock();}
}
