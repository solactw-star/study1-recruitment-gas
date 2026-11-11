/**
 * Study1 §70-S.15: original-model prospective participant PENDING intake.
 * This module is never a credential/REC verdict. It does NOT send email,
 * mark a person verified, book a slot, sign consent or call a demo adapter.
 * Its only future write is to the original Applicants/Screenings tables.
 */
function study1ParticipantRecPolicy_(){
 return study1ParticipantRecSource_();
}
function study1ParticipantAbuseProtection_(request){
 return study1ParticipantTurnstileCheck_(request);
}
function study1ParticipantGate_(){
 // Unlike the OWNER-only consent signing gate, this pre-enrollment boundary
 // is designed for real public participants, but remains closed by default.
 const props=PropertiesService.getScriptProperties();
 const required=[
  'OPEN','CONSENT_READY',
  'STUDY1_E1_INTAKE_APPROVED',
  'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED',
  'STUDY1_PARTICIPANT_DATA_USE_APPROVED',
  'STUDY1_PARTICIPANT_ABUSE_PROTECTION_VERIFIED'
 ];
 if(required.some(key=>props.getProperty(key)!=='true'))
  throw Error('PARTICIPANT_INTAKE_NOT_READY：正式資料與個資安全門檻尚未通過');
 return true;
}
function study1ParticipantInput_(input){
 const keys='adult,cycu,email,experiment,humanToken,name,noDx,noPractice,noTreatment,phone,requestId';
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==keys)
  throw Error('申請欄位不合法');
 if(input.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN：實驗二未獨立核准開放');
 if([input.adult,input.cycu,input.noDx,input.noPractice,input.noTreatment]
     .some(x=>typeof x!=='boolean'))
  throw Error('資格自陳答案缺失');
 // Failed screening is never stored. No item-level diagnosis information
 // is ever written to Applicants or Screenings.
 if([input.adult,input.cycu,input.noDx,input.noPractice,input.noTreatment]
     .some(x=>x!==true))
  return {accepted:false,experiment:'E1'};
 const email=study1BindingEmail_(input.email);
 // Google Sheets appendRow interprets leading '=' as a formula; reject
 // spreadsheet-active leading characters in every caller-controlled field.
 if(/^[=+\-@]/.test(email)||(/^[=+\-@]/.test(String(input.name||'').trim()))||
    (/^[=+\-@]/.test(String(input.phone||'').trim())))
  throw Error('申請欄位包含禁止的試算表公式前綴');
 if(typeof input.name!=='string'||input.name.trim().length<2||
    input.name.length>80||/[<>\r\n\x00-\x1f]/.test(input.name)||
    typeof input.phone!=='string'||input.phone.length>30||
    /[<>\r\n\x00-\x1f]/.test(input.phone)||
    typeof input.requestId!=='string'||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))
  throw Error('個資欄位或重送鍵不合法');
 return {accepted:true,experiment:'E1',
  name:input.name.trim(),phone:input.phone.trim(),email,
  requestId:input.requestId,humanToken:input.humanToken};
}
function study1ParticipantVerifiedPolicy_(policy){
 if(!policy||policy.approved!==true||
    policy.provenance!=='REC_EFFECTIVE_SCREENING_AND_DATA_PROCESSING'||
    policy.experiment!=='E1'||
    !/^[a-f0-9]{64}$/.test(policy.documentSha256||'')||
    !/^[A-Za-z0-9._/-]{4,64}$/.test(policy.screeningVersion||'')||
    policy.allowsProspectiveIntake!==true||
    policy.allowsPrivateSheetsStorage!==true)
  throw Error('REC_INTAKE_POLICY_INVALID：不足以確認前置蒐集及篩檢適用程序');
 return policy;
}
/** Independent global intake limiter on the ORIGINAL Applicants timestamps only.
 * This is an operational anti-abuse ceiling, not a study sample-size decision.
 * Caller must hold the shared ScriptLock; never inspect names or diagnoses.
 */
function study1ParticipantHourlyGate_(apps){
 const last=apps.n;
 if(last<2)return true;
 const values=apps.tab.getRange(2,5,last-1,1).getValues();
 if(!Array.isArray(values)||values.length!==last-1)
  throw Error('GLOBAL_INTAKE_RATE_SOURCE_INCOMPLETE');
 const now=Date.now(),since=now-3600000;let recent=0;
 for(const item of values){
  if(!Array.isArray(item)||item.length!==1)throw Error('GLOBAL_INTAKE_RATE_SOURCE_INVALID');
  const cell=item[0];
  const raw=Object.prototype.toString.call(cell)==='[object Date]'?
   cell.toISOString():cell;
  const t=study1BindingUtc_(raw);
  if(t>now+60000)throw Error('GLOBAL_INTAKE_TIMESTAMP_FUTURE');
  if(t>=since)recent++;
 }
 if(recent>=60)throw Error('GLOBAL_INTAKE_RATE_LIMIT');
 return true;
}

function study1ParticipantBegin_(input){
 // Fail before parsing/using any personal data without real PI-pinned E1 slots.
 study1ParticipantGate_();
 if(!study1FormalPublicSlotReady_())
  throw Error('E1_OFFICIAL_SLOTS_NOT_AVAILABLE');
 const r=study1ParticipantInput_(input);
 if(!r.accepted)return {accepted:false,reason:'SCREENING_NOT_ELIGIBLE'};
 const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
 // Anti-abuse grant is independently audited; user cannot self-approve.
 const abuse=study1ParticipantAbuseProtection_(r);
 if(!abuse||abuse.allowed!==true||
    abuse.provenance!=='SERVER_APPROVED_RATE_AND_BOT_PROTECTION'||
    abuse.requestId!==r.requestId)
  throw Error('PUBLIC_INTAKE_ABUSE_PROTECTION_FAILED');
 const applicantId='APP_'+study1BindingHmac_([
  'PUBLIC_PENDING_E1_V1',r.requestId,r.email]).slice(0,28);
 const screeningId='SCR_'+study1BindingHmac_([
  'PUBLIC_PENDING_SCREEN_E1_V1',applicantId,policy.documentSha256]).slice(0,28);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)
  throw Error('正式申請共用交易鎖不可用');
 try{
  if(lock.hasLock()!==true)throw Error('正式申請共用鎖失效');
  study1ParticipantGate_();
  // Recheck inside the existing intake lock before the first applicant write.
  if(!study1FormalPublicSlotReady_(lock))
   throw Error('E1_OFFICIAL_SLOTS_CHANGED_DURING_INTAKE');
  const refreshed=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  if(JSON.stringify(refreshed)!==JSON.stringify(policy))
   throw Error('REC正式來源在申請期間變動');
  study1ParticipantAbuseRecheck_(abuse,r);
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const apps=study1WizardTable_(book,'Applicants',STUDY1_BINDING_SCHEMA_.applicants);
  const screens=study1WizardTable_(book,'Screenings',STUDY1_BINDING_SCHEMA_.screenings);
  const existing=study1WizardLookup_(apps,1,applicantId,true);
  const existingScreen=study1WizardLookup_(screens,1,screeningId,true);
  if(existing.length||existingScreen.length){
   if(existing.length!==1||existingScreen.length!==1)
    throw Error('APPLICATION_PARTIAL_WRITE_REQUIRES_REVIEW');
   const a=apps.tab.getRange(existing[0],1,1,7).getValues()[0];
   const s=screens.tab.getRange(existingScreen[0],1,1,6).getValues()[0];
   if(a[0]!==applicantId||a[1]!==r.name||
      study1BindingEmail_(a[2])!==r.email||a[3]!==r.phone||
      !['PENDING_EMAIL','EMAIL_VERIFIED','VERIFIED'].includes(a[6])||
      s[0]!==screeningId||s[1]!==applicantId||
      s[2]!==policy.screeningVersion||
      s[3]!=='ELIGIBLE'||
      s[5]!=='PARTICIPANT_SELF_REPORT')
    throw Error('APPLICATION_REPLAY_MISMATCH');
   return {accepted:true,created:false,applicantId,screeningId,
    phase:a[6]==='EMAIL_VERIFIED'?'EMAIL_VERIFIED':'PENDING_EMAIL'};
  }
  // An email cannot be enrolled under multiple different request IDs.
  // Eligibility is declared by the participant's affirmative selections.
  // No ID card, student card, or separate manual identity inspection is
  // required; no individual mental-health answers are persisted.
  if(study1WizardLookup_(apps,3,r.email,false).length>0)
   throw Error('EMAIL_ALREADY_PENDING：已有相同信箱的未完成申請');
  study1ParticipantHourlyGate_(apps);
  const now=new Date().toISOString();
  study1WizardAppend_(apps,[applicantId,r.name,r.email,r.phone,
   now,now,'PENDING_EMAIL']);
  study1WizardAppend_(screens,[screeningId,applicantId,
   policy.screeningVersion,'ELIGIBLE',now,
   'PARTICIPANT_SELF_REPORT']);
  if(lock.hasLock()!==true)throw Error('寫後共用鎖失效');
  return {accepted:true,created:true,applicantId,screeningId,
   phase:'PENDING_EMAIL'};
 }finally{lock.releaseLock();}
}


/**
 * PRIVATE prospective mailbox OTP. Contact control is NOT a verified student,
 * REC eligibility, participant identity, or authorization to book/sign.
 * Original Verification A:I only; F:G changes solely under one ScriptLock.
 */
function study1ParticipantMailGate_(){
 study1ParticipantGate_();
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_PARTICIPANT_EMAIL_ISSUE_APPROVED')!=='true'||
    p.getProperty('STUDY1_PARTICIPANT_EMAIL_VERIFY_APPROVED')!=='true')
  throw Error('PUBLIC_EMAIL_OTP_NOT_READY');
 return true;
}
function study1ParticipantOtpRequest_(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||
    Object.keys(input).sort().join(',')!==
     'applicantId,email,experiment,requestId,screeningId')
  throw Error('信箱驗證請求欄位不合法');
 study1BindingId_(input.applicantId);
 study1BindingId_(input.screeningId);
 const email=study1BindingEmail_(input.email);
 if(input.experiment!=='E1'||typeof input.requestId!=='string'||
    !/^[A-Za-z0-9_-]{16,80}$/.test(input.requestId))
  throw Error('實驗或重送鍵尚未核准');
 return {applicantId:input.applicantId,screeningId:input.screeningId,
  experiment:'E1',email,requestId:input.requestId};
}
function study1ParticipantOtpRows_(r){
 const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
 const apps=study1WizardTable_(book,'Applicants',STUDY1_BINDING_SCHEMA_.applicants);
 const screens=study1WizardTable_(book,'Screenings',STUDY1_BINDING_SCHEMA_.screenings);
 const ai=study1WizardLookup_(apps,1,r.applicantId,true);
 const si=study1WizardLookup_(screens,1,r.screeningId,true);
 if(ai.length!==1||si.length!==1)throw Error('申請或初篩資料不唯一');
 const a=study1BindingOtpRow_(apps.tab,ai[0],7);
 const s=study1BindingOtpRow_(screens.tab,si[0],6);
 const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
 if(a[0]!==r.applicantId||study1BindingEmail_(a[2])!==r.email||
    a[6]!=='PENDING_EMAIL'||
    s[0]!==r.screeningId||s[1]!==r.applicantId||
    s[2]!==policy.screeningVersion||s[3]!=='ELIGIBLE'||
    s[5]!=='PARTICIPANT_SELF_REPORT')
  throw Error('OTP_PENDING_APPLICATION_MISMATCH');
 return {book,apps,screens,policy};
}
function study1ParticipantOtpSend_(input){
 study1ParticipantMailGate_();
 const r=study1ParticipantOtpRequest_(input);
 const secret=otpSecret_(PropertiesService.getScriptProperties()
  .getProperty('STUDY1_OTP_HMAC_SECRET'));
 if(/SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(secret))
  throw Error('OTP簽章金鑰不合法');
 const challengeId='CHL_'+study1BindingHmac_([
  'PUBLIC_PENDING_MAIL_OTP_V1',r.applicantId,r.email,r.requestId]).slice(0,28);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)throw Error('OTP核發共用鎖遭占用');
 try{
  if(lock.hasLock()!==true)throw Error('OTP核發共用鎖失效');
  study1ParticipantMailGate_();
  const data=study1ParticipantOtpRows_(r);
  const state=study1WizardIssueRows_(data.book,r.applicantId,r.email);
  const same=study1WizardLookup_(state.ref,1,challengeId,true);
  if(same.length){
   if(same.length!==1)throw Error('OTP挑戰ID不唯一');
   const old=study1BindingOtpRow_(state.ref.tab,same[0],9);
   if(old[0]!==challengeId||old[1]!==r.applicantId||
      study1BindingEmail_(old[7])!==r.email)
    throw Error('OTP重送資料來源不一致');
   return {sent:false,reason:'ALREADY_ISSUED',challengeId};
  }
  const now=new Date().toISOString();
  if(!otpThrottleIssuePreflight_(state.snapshot,
      {applicantId:r.applicantId,email:r.email},now).allowed)
   return {sent:false,reason:'THROTTLED'};
  const code=study1WizardCode_();
  const expires=new Date(Date.parse(now)+OTP_RULES_.ttlMinutes*60000).toISOString();
  const hmac=otpHmacHex_(challengeId,r.applicantId,
   OTP_RULES_.emailPurpose,code,secret);
  study1ParticipantMailGate_();
  // Durable challenge precedes send. No sent/failed claim on timeout; same
  // requestId never resends and another request is throttled by mailbox.
  study1WizardAppend_(state.ref,[challengeId,r.applicantId,
   OTP_RULES_.emailPurpose,hmac,expires,0,'',r.email,now]);
  if(lock.hasLock()!==true)throw Error('OTP寄送前共用鎖失效');
  study1ParticipantMailGate_();
  MailApp.sendEmail({to:r.email,subject:'Study1｜信箱驗證碼',
   body:'您的Study1電子郵件驗證碼：'+code+
    '\n10分鐘內有效，此驗證只確認電子郵件控制權，不代表研究資格或本人身分。'});
  return {sent:true,reason:'ISSUED',challengeId,expiresAtUtc:expires};
 }finally{lock.releaseLock();}
}
function study1ParticipantOtpVerify_(input){
 study1ParticipantMailGate_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
    Object.keys(input).sort().join(',')!==
    'applicantId,challengeId,code,email,experiment,screeningId')
  throw Error('驗證碼提交欄位不合法');
 study1BindingId_(input.challengeId);
 const r=study1ParticipantOtpRequest_({
  applicantId:input.applicantId,screeningId:input.screeningId,
  experiment:input.experiment,email:input.email,
  requestId:'VERIFY_PENDING_E1_12345'
 });
 if(typeof input.code!=='string'||!/^\d{8}$/.test(input.code))
  throw Error('驗證碼格式不合法');
 const secret=otpSecret_(PropertiesService.getScriptProperties()
  .getProperty('STUDY1_OTP_HMAC_SECRET'));
 if(/SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(secret))
  throw Error('OTP簽章金鑰不合法');
 const lock=LockService.getScriptLock();
 let tab=null,lastRead=null,policy=null;
 const adapters={
  getLock:()=>lock,
  getSecret:()=>{study1ParticipantMailGate_();return secret},
  readSnapshot:()=>{
   if(lock.hasLock()!==true)throw Error('OTP回讀前共鎖失效');
   study1ParticipantMailGate_();
   const ready=study1ParticipantOtpRows_(r);
   policy=ready.policy;
   tab=ready.book.getSheetByName('Verification');
   const snapshot=study1BindingOtpSnapshot_(tab,
    {applicantId:r.applicantId,challengeId:input.challengeId},r.email);
   const matching=snapshot.rows.filter(v=>v[0]===input.challengeId);
   if(matching.length!==1)throw Error('OTP挑戰來源不唯一');
   const issued=study1BindingUtc_(matching[0][8]);
   if(snapshot.rows.some(v=>v[0]!==''&&
     (v[1]===r.applicantId||study1BindingEmail_(v[7])===r.email)&&
     study1BindingUtc_(v[8])>issued))
    throw Error('OTP_SUPERSEDED');
   lastRead=snapshot;
   return snapshot;
  },
  writeAttemptAndUse:(rowNumber,attempts,usedAt)=>{
   study1ParticipantMailGate_();
   if(lock.hasLock()!==true||!lastRead||!tab||
      !Number.isSafeInteger(rowNumber)||rowNumber<2||
      rowNumber>lastRead.rows.length+1||
      !Number.isSafeInteger(attempts)||attempts<1||attempts>OTP_RULES_.maxAttempts)
    throw Error('OTP寫入欄位及鎖不正確');
   const prev=lastRead.rows[rowNumber-2];
   if(!prev||prev[0]!==input.challengeId||prev[1]!==r.applicantId||
      study1BindingEmail_(prev[7])!==r.email)
    throw Error('OTP並非原申請者');
   const fresh=study1BindingOtpRow_(tab,rowNumber,9);
   if(JSON.stringify(fresh)!==JSON.stringify(prev))
    throw Error('OTP寫入前競寫');
   if(usedAt!=='')study1BindingUtc_(usedAt);
   tab.getRange(rowNumber,6,1,2).setValues([[attempts,usedAt||'']]);
   SpreadsheetApp.flush();
   const after=tab.getRange(rowNumber,6,1,2).getValues()[0];
   if(after[0]!==attempts||after[1]!==usedAt)
    throw Error('OTP F:G完整回讀不一致');
   return true;
  }
 };
 const result=otpVerifyOnceLocked_({
  challengeId:input.challengeId,applicantId:r.applicantId,
  email:r.email,code:input.code,nowUtc:new Date().toISOString()
 },adapters);
 // Verification F:G was read back inside the same transaction lock.
 // Never promote Applicants to VERIFIED or Screenings to ELIGIBLE.
 if(result.verified!==true)return {verified:false,reason:'REJECTED'};
 // readSnapshot captured the pre-write F:G state. The successful CAS
 // updated the sheet, not that snapshot; use a fresh persisted readback.
 const after=study1BindingOtpSnapshot_(tab,
  {applicantId:r.applicantId,challengeId:input.challengeId},r.email);
 const rows=after.rows.filter(row=>row[0]===input.challengeId);
 if(rows.length!==1||rows[0][1]!==r.applicantId||
    study1BindingEmail_(rows[0][7])!==r.email||
    typeof rows[0][6]!=='string'||!rows[0][6])
  throw Error('OTP_POST_WRITE_PROOF_UNKNOWN');
 const proof=study1ParticipantEmailProof_(r,input.challengeId,rows[0][6]);
 return {verified:true,reason:'EMAIL_CONTROL_ONLY',emailProof:proof};
}


/**
 * One-time OTP -> time-bounded HMAC possession proof. This proves only that
 * this applicant controlled the pending email address at challenge use time;
 * it is never evidence of age, CYCU enrollment, REC eligibility, or consent.
 */
function study1ParticipantEmailProof_(r,challengeId,usedAtUtc){
 study1BindingId_(r.applicantId);study1BindingId_(r.screeningId);
 study1BindingId_(challengeId);
 const used=study1BindingUtc_(usedAtUtc),now=Date.now();
 if(used>now||now-used>30000)throw Error('OTP_EMAIL_PROOF_NOT_FRESH');
 const expiresAtUtc=new Date(used+30*60000).toISOString();
 const emailHash=study1BindingHmac_(['MAIL_HASH_V1',r.email]);
 const fields=[r.applicantId,r.screeningId,challengeId,'E1',
  emailHash,usedAtUtc,expiresAtUtc];
 return {version:1,applicantId:r.applicantId,screeningId:r.screeningId,
  challengeId,experiment:'E1',emailHash,usedAtUtc,expiresAtUtc,
  signature:study1BindingHmac_(['MAIL_CONTROL_ONLY_V1'].concat(fields))};
}
function study1ParticipantEmailProofRequest_(proof){
 const keys='applicantId,challengeId,emailHash,experiment,expiresAtUtc,screeningId,signature,usedAtUtc,version';
 if(!proof||Array.isArray(proof)||typeof proof!=='object'||
    Object.keys(proof).sort().join(',')!==keys||
    proof.version!==1||proof.experiment!=='E1'||
    typeof proof.signature!=='string'||!/^[a-f0-9]{64}$/.test(proof.signature)||
    typeof proof.emailHash!=='string'||!/^[a-f0-9]{64}$/.test(proof.emailHash))
  throw Error('EMAIL_PROOF_NOT_VALID');
 study1BindingId_(proof.applicantId);
 study1BindingId_(proof.screeningId);
 study1BindingId_(proof.challengeId);
 const used=study1BindingUtc_(proof.usedAtUtc),
  expires=study1BindingUtc_(proof.expiresAtUtc),now=Date.now();
 if(used>now||expires<=now||expires-used!==30*60000)
  throw Error('EMAIL_PROOF_EXPIRED');
 const expected=study1BindingHmac_(['MAIL_CONTROL_ONLY_V1',
  proof.applicantId,proof.screeningId,proof.challengeId,
  proof.experiment,proof.emailHash,proof.usedAtUtc,proof.expiresAtUtc]);
 let diff=0;
 for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^proof.signature.charCodeAt(i);
 if(diff!==0)throw Error('EMAIL_PROOF_SIGNATURE_INVALID');
 return proof;
}
function study1ParticipantEmailStatus_(untrusted){
 study1ParticipantMailGate_();
 const p=study1ParticipantEmailProofRequest_(untrusted);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)throw Error('EMAIL_STATUS_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('EMAIL_STATUS_LOCK_LOST');
  study1ParticipantMailGate_();
  // A successful mail token still must match the ORIGINAL persisted
  // Applicants/Screenings and Verification F:G under the same lock.
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const appRef=study1WizardTable_(book,'Applicants',
   STUDY1_BINDING_SCHEMA_.applicants);
  const positions=study1WizardLookup_(appRef,1,p.applicantId,true);
  if(positions.length!==1)throw Error('EMAIL_APPLICATION_NOT_UNIQUE');
  const a=study1BindingOtpRow_(appRef.tab,positions[0],7);
  const s=study1BindingSheetRow_(book,'Screenings',
   STUDY1_BINDING_SCHEMA_.screenings,p.screeningId).rows[0];
  const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  const v=study1BindingSheetRow_(book,'Verification',
   STUDY1_BINDING_SCHEMA_.verification,p.challengeId).rows[0];
  const email=study1BindingEmail_(a[2]);
  const hashed=study1BindingHmac_(['MAIL_HASH_V1',email]);
  const created=study1BindingUtc_(v[8]),expiry=study1BindingUtc_(v[4]),
   used=study1BindingUtc_(v[6]);
  const all=study1WizardIssueRows_(book,p.applicantId,email).snapshot.rows;
  if(!['PENDING_EMAIL','EMAIL_VERIFIED'].includes(a[6])||
     s[1]!==p.applicantId||s[2]!==policy.screeningVersion||
     s[3]!=='ELIGIBLE'||s[5]!=='PARTICIPANT_SELF_REPORT'||
     p.emailHash!==hashed||v[1]!==p.applicantId||
     v[2]!=='EMAIL_VERIFICATION'||study1BindingEmail_(v[7])!==email||
     v[6]!==p.usedAtUtc||used<created||used>=expiry||
     expiry-created>600000||Number(v[5])<1||Number(v[5])>5||
     all.some(row=>row[0]!==''&&row[0]!==p.challengeId&&
       (row[1]===p.applicantId||
        study1BindingEmail_(row[7])===email)&&
       study1BindingUtc_(row[8])>=created))
   throw Error('EMAIL_CONTROL_EVIDENCE_CHANGED');
  if(lock.hasLock()!==true)throw Error('EMAIL_STATUS_LOCK_LOST');
  // Persist only CONTACT verification, not documentary identity.
  // The separate screening already records participant self-declaration.
  if(a[6]==='PENDING_EMAIL'){
   const fresh=study1BindingOtpRow_(appRef.tab,positions[0],7);
   if(JSON.stringify(fresh)!==JSON.stringify(a))
    throw Error('EMAIL_APPLICATION_CONCURRENT_CHANGE');
   const updatedAt=new Date().toISOString();
   appRef.tab.getRange(positions[0],6,1,2)
    .setValues([[updatedAt,'EMAIL_VERIFIED']]);
   SpreadsheetApp.flush();
   const after=study1BindingOtpRow_(appRef.tab,positions[0],7);
   if(after[5]!==updatedAt||after[6]!=='EMAIL_VERIFIED')
    throw Error('EMAIL_APPLICATION_WRITE_VERIFY_FAILED');
  }
  return {emailVerified:true,experiment:'E1',
   eligibilitySource:'PARTICIPANT_SELF_REPORT',
   applicationState:'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED',
   reservationState:'NOT_AUTHORIZED',consentState:'NOT_SIGNED'};
 }finally{lock.releaseLock();}
}

/** Explicit reviewed public HTML Service RPCs, always fail-closed.
 * Existing Website.js CLOSED endpoints are preserved and unchanged.
 */
function study1ParticipantReadiness(){
 try{
  study1ParticipantGate_();
  const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  // Readiness checks configuration only: a one-time Turnstile token is
  // validated exactly once with Siteverify in the actual intake operation.
  const antiBot=study1ParticipantTurnstileConfig_();
  if(policy.approved!==true)throw Error('REC_POLICY_NOT_APPROVED');
  // No real future PI-reviewed E1 slot means no pre-booking PII intake.
  if(!study1FormalPublicSlotReady_())
   throw Error('E1_OFFICIAL_SLOTS_NOT_AVAILABLE');
  return {ready:true,experiment:'E1',siteKey:antiBot.siteKey};
 }catch(_){
  // Do not expose the presence or kind of private record / missing permission.
  return {ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'};
 }
}
function study1ParticipantBegin(request){
 return study1ParticipantBegin_(request);
}
function study1ParticipantSendOtp(request){
 return study1ParticipantOtpSend_(request);
}
function study1ParticipantVerifyOtp(request){
 return study1ParticipantOtpVerify_(request);
}
function study1ParticipantEmailStatus(proof){
 return study1ParticipantEmailStatus_(proof);
}


/**
 * Minimal MVP booking-confirmed email notice. Internal private helper ONLY:
 * caller must first verify the original E1 Reservation is CONFIRMED and the
 * applicant mailbox against the original consumed OTP under ScriptLock.
 * Never send a PDF attachment, eligibility detail or private Drive URL.
 */
var STUDY1_E1_NOTIFICATION_HEADERS_=Object.freeze([
 'job_id','applicant_id','reservation_id','notice_type','status',
 'attempts','created_at_utc','sent_at_utc','last_error_code'
]);
/** At-most-once original Notifications A:I outbox; no automatic resend after
 * ambiguous MailApp failures. PROVIDER_ACCEPTED is not delivery proof. */
function study1ParticipantBookingNotice_(verifiedApplicantEmail,consentId){
 study1ParticipantMailGate_();
 study1FormalConsentGate_();
 study1BindingId_(consentId);
 const to=study1BindingEmail_(verifiedApplicantEmail);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(10000)!==true)throw Error('E1_NOTICE_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('E1_NOTICE_LOCK_LOST');
  study1ParticipantMailGate_();study1FormalConsentGate_();
  const matches=study1EConsentRegistry_().records.filter(x=>x.id===consentId);
  if(matches.length!==1)throw Error('E1_NOTICE_CONSENT_NOT_UNIQUE');
  const entry=matches[0],binding=entry.binding;
  if(entry.channel!=='FORMAL_E1'||entry.experiment!=='E1'||
     entry.researcherPresigned!==true||entry.state!=='CONFIRMED'||
     !entry.signedPdf||!entry.signature||!entry.confirmation||
     !binding||binding.experiment!=='E1')
   throw Error('E1_NOTICE_SIGNED_CONSENT_REQUIRED');
  const id=study1SelfReportedAuthority_({
   applicantId:binding.applicantId,screeningId:binding.screeningId,
   challengeId:binding.challengeId,experiment:'E1'},lock);
  if(id.verified!==true||id.experiment!=='E1'||
     study1BindingEmail_(id.email)!==to)
   throw Error('E1_NOTICE_VERIFIED_EMAIL_CHANGED');
  const snapshot=study1FormalSnapshot_();
  study1FormalValidateSnapshot_(snapshot,new Date().toISOString());
  const reservations=snapshot.reservations.rows.filter(x=>x[0]===binding.reservationId);
  if(reservations.length!==1||reservations[0][1]!==binding.applicantId||
     reservations[0][2]!==binding.slotId||
     reservations[0][3]!=='CONFIRMED'||!reservations[0][7]||reservations[0][8])
   throw Error('E1_NOTICE_ORIGINAL_BOOKING_NOT_CONFIRMED');
  const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
  const source=study1WizardTable_(book,'Notifications',STUDY1_E1_NOTIFICATION_HEADERS_);
  const noticeType='E1_RESERVATION_CONFIRMED';
  const jobId='NTF_'+study1BindingHmac_([
   'E1_BOOKING_CONFIRMATION_NOTICE_V1',entry.id,binding.applicantId,
   binding.reservationId]).slice(0,28);
  let oldNotice=null;
  for(const rowNo of study1WizardLookup_(source,3,binding.reservationId,true)){
   const row=source.tab.getRange(rowNo,1,1,9).getValues()[0];
   if(!Array.isArray(row)||row.length!==9||row[2]!==binding.reservationId)
    throw Error('E1_NOTICE_SOURCE_CHANGED');
   if(row[3]===noticeType){
    if(oldNotice||row[0]!==jobId||row[1]!==binding.applicantId||
       row[5]!==1||
       !['DISPATCHING','PROVIDER_ACCEPTED','UNKNOWN'].includes(row[4]))
     throw Error('E1_NOTICE_DUPLICATE_OR_CHANGED');
    oldNotice=row;
   }
  }
  if(oldNotice)return {attempted:false,status:oldNotice[4],jobId};
  if(study1WizardLookup_(source,1,jobId,true).length)
   throw Error('E1_NOTICE_JOB_ID_COLLISION');
  const original=[jobId,binding.applicantId,binding.reservationId,
   noticeType,'DISPATCHING',1,new Date().toISOString(),'',''];
  study1WizardAppend_(source,original);
  if(lock.hasLock()!==true)throw Error('E1_NOTICE_LOCK_LOST_BEFORE_SEND');
  study1ParticipantMailGate_();
  let accepted=false;
  try{
   MailApp.sendEmail({to,subject:'Study1｜報名與預約已確認',
    body:'您的Study1實驗一報名與時段預約已確認。研究者事先簽署的知情同意書已由您於報名網站完成簽名。完整簽署PDF已存入研究團隊私人資料庫；您可在原報名頁面的有效驗證期間下載副本。如需協助請聯絡研究團隊。'});
   accepted=true;
  }catch(_){/* Remote receipt could be unknown; never auto-resend. */}
  if(lock.hasLock()!==true)throw Error('E1_NOTICE_LOCK_LOST_AFTER_SEND');
  const range=source.tab.getRange(source.n+1,1,1,9);
  if(JSON.stringify(range.getValues()[0])!==JSON.stringify(original))
   throw Error('E1_NOTICE_POST_SEND_CAS_UNKNOWN');
  const updated=original.slice();
  updated[4]=accepted?'PROVIDER_ACCEPTED':'UNKNOWN';
  updated[7]=accepted?new Date().toISOString():'';
  updated[8]=accepted?'':'MAIL_PROVIDER_OUTCOME_UNKNOWN';
  range.setValues([updated]);SpreadsheetApp.flush();
  if(JSON.stringify(range.getValues()[0])!==JSON.stringify(updated))
   throw Error('E1_NOTICE_POST_SEND_READBACK_UNKNOWN');
  return {attempted:true,status:updated[4],jobId};
 }finally{lock.releaseLock();}
}