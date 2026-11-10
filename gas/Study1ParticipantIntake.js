/**
 * Study1 §70-S.15: original-model prospective participant PENDING intake.
 * This module is never a credential/REC verdict. It does NOT send email,
 * mark a person verified, book a slot, sign consent or call a demo adapter.
 * Its only future write is to the original Applicants/Screenings tables.
 */
function study1ParticipantRecPolicy_(){
 throw Error('REC_INTAKE_POLICY_NOT_CONFIGURED：尚無核實之正式招募／個資處理適用來源');
}
function study1ParticipantAbuseProtection_(request){
 throw Error('ABUSE_PROTECTION_NOT_CONFIGURED：缺少正式公開申請反濫用證據');
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
 const keys='adult,cycu,email,experiment,name,noDx,noPractice,noTreatment,phone,requestId';
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
 if(typeof input.name!=='string'||input.name.trim().length<2||
    input.name.length>80||/[<>\r\n\x00-\x1f]/.test(input.name)||
    typeof input.phone!=='string'||input.phone.length>30||
    /[<>\r\n\x00-\x1f]/.test(input.phone)||
    typeof input.requestId!=='string'||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))
  throw Error('個資欄位或重送鍵不合法');
 return {accepted:true,experiment:'E1',
  name:input.name.trim(),phone:input.phone.trim(),email,
  requestId:input.requestId};
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
function study1ParticipantBegin_(input){
 // Fail before parsing/using any personal data when intake remains closed.
 study1ParticipantGate_();
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
  const refreshed=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  if(JSON.stringify(refreshed)!==JSON.stringify(policy))
   throw Error('REC正式來源在申請期間變動');
  const abuseAgain=study1ParticipantAbuseProtection_(r);
  if(!abuseAgain||abuseAgain.allowed!==true||
     abuseAgain.provenance!==abuse.provenance||
     abuseAgain.requestId!==r.requestId)
   throw Error('反濫用授權在申請期間變動');
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
      s[3]!=='PENDING_REVIEW'||
      s[5]!=='SELF_REPORT_NOT_VERIFIED')
    throw Error('APPLICATION_REPLAY_MISMATCH');
   return {accepted:true,created:false,applicantId,screeningId,
    phase:'PENDING_EMAIL'};
  }
  // An email cannot be enrolled under multiple different request IDs.
  // No health answer is stored; only the NOT-VERIFIED decision is kept.
  if(study1WizardLookup_(apps,3,r.email,false).length>0)
   throw Error('EMAIL_ALREADY_PENDING：已有相同信箱的未完成申請');
  const now=new Date().toISOString();
  study1WizardAppend_(apps,[applicantId,r.name,r.email,r.phone,
   now,now,'PENDING_EMAIL']);
  study1WizardAppend_(screens,[screeningId,applicantId,
   policy.screeningVersion,'PENDING_REVIEW',now,
   'SELF_REPORT_NOT_VERIFIED']);
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
    s[2]!==policy.screeningVersion||s[3]!=='PENDING_REVIEW'||
    s[5]!=='SELF_REPORT_NOT_VERIFIED')
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
 // Only Verification F:G is mutated; pending applicant is NOT marked
 // VERIFIED or ELIGIBLE by mailbox control alone.
 return {verified:result.verified===true,
  reason:result.verified?'EMAIL_CONTROL_ONLY':'REJECTED'};
}

/** Explicit reviewed public HTML Service RPCs, always fail-closed.
 * Existing Website.js CLOSED endpoints are preserved and unchanged.
 */
function study1ParticipantReadiness(){
 try{
  study1ParticipantGate_();
  const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  // No active front-end until independently verified abuse controls exist.
  study1ParticipantAbuseProtection_({requestId:'READINESS_PROBE_ONLY',
   experiment:'E1',email:'not-supplied'});
  if(policy.approved!==true)throw Error('REC_POLICY_NOT_APPROVED');
  return {ready:true,experiment:'E1'};
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
