/**
 * Study1 future formal email-OTP verification adapter: PRIVATE GAS only.
 * Uses the ORIGINAL Applicants/Screenings/Verification Sheets and the existing
 * OTP HMAC, per-challenge limits, cross-challenge throttle and locked F:G CAS.
 *
 * IMPORTANT: No authorized real applicant identity/screening service exists
 * yet. The independent REC source returns a deliberate blocker below.
 * No public RPC is added and this file must not be deployed/live-enabled
 * until REC, personal data purpose, identity source and UAT are verified.
 */
function study1EConsentOtpApplicantAuthorization_(request){
 throw Error('IDENTITY_SOURCE_NOT_CONFIGURED：尚無可信的本人資格與實驗別來源可執行OTP');
}
function study1BindingOtpFullHeaders_(tab){
 if(!tab||typeof tab.getLastRow!=='function')throw Error('OTP正式資料表不存在');
 const headers=STUDY1_BINDING_SCHEMA_.verification;
 const last=tab.getLastRow();
 if(!Number.isSafeInteger(last)||last<2||last>10001||
    tab.getLastColumn()!==headers.length)
  throw Error('OTP表格範圍或欄位數變更');
 const found=tab.getRange(1,1,1,headers.length).getValues()[0];
 if(!Array.isArray(found)||headers.some((x,i)=>x!==found[i]))
  throw Error('OTP表頭與正式來源不一致');
 return {last,headers};
}
function study1BindingOtpRangeRows_(tab,col,last,term,caseSensitive){
 if(typeof term!=='string'||term.length<3||term.length>254)
  throw Error('OTP查詢條件不合法');
 const finder=tab.getRange(2,col,last-1,1).createTextFinder(term)
  .matchEntireCell(true).matchCase(caseSensitive).useRegularExpression(false);
 const hits=finder.findAll();
 if(!Array.isArray(hits)||hits.length>10000)
  throw Error('OTP查詢結果異常');
 const out=[];
 for(const h of hits){
  if(!h||typeof h.getRow!=='function'||h.getColumn()!==col||
     !Number.isSafeInteger(h.getRow())||h.getRow()<2||h.getRow()>last)
   throw Error('OTP索引定位異常');
  out.push(h.getRow());
 }
 return out;
}
function study1BindingOtpRow_(tab,row,width){
 const raw=tab.getRange(row,1,1,width).getValues()[0];
 if(!Array.isArray(raw)||raw.length!==width)
  throw Error('OTP資料欄位不完整');
 return raw.map((v,i)=>{
  if(!Object.prototype.hasOwnProperty.call(raw,i))
   throw Error('OTP來源資料稀疏');
  if(Object.prototype.toString.call(v)==='[object Date]'){
   if(!Number.isFinite(v.getTime()))throw Error('OTP時間格式不合法');
   return new Date(v.getTime()).toISOString();
  }
  if(typeof v==='string'||(typeof v==='number'&&Number.isFinite(v)))
   return v;
  throw Error('OTP來源資料型別不合法');
 });
}
/** The throttle uses ALL matched applicant/mailbox challenges in the last hour.
 * Preserve their exact original Sheet row positions with blank placeholder
 * rows. Other participants' unrelated PII is not loaded into memory.
 */
function study1BindingOtpSnapshot_(tab,request,email){
 const meta=study1BindingOtpFullHeaders_(tab);
 const uniqueChallenge=study1BindingOtpRangeRows_(tab,1,meta.last,request.challengeId,true);
 if(uniqueChallenge.length!==1)throw Error('OTP挑戰識別碼不是唯一來源');
 const rowsForApplicant=study1BindingOtpRangeRows_(tab,2,meta.last,request.applicantId,true);
 const rowsForEmail=study1BindingOtpRangeRows_(tab,8,meta.last,email,false);
 const rowNumbers=new Set(uniqueChallenge.concat(rowsForApplicant,rowsForEmail));
 const rows=Array.from({length:meta.last-1},()=>Array(meta.headers.length).fill(''));
 for(const rowNum of rowNumbers){
  const value=study1BindingOtpRow_(tab,rowNum,meta.headers.length);
  // Exact identity membership; prevent a malformed finder response from
  // causing an account budget bypass or reading another person's full row.
  if(value[0]!==request.challengeId&&value[1]!==request.applicantId&&
     study1BindingEmail_(value[7])!==email)
   throw Error('OTP搜尋索引與實際來源不符');
  rows[rowNum-2]=value;
 }
 return {headers:meta.headers.slice(),rows};
}
/** This is the only intended private contact-OTP transition. It is not
 * personal identity verification and does not set Applicants.status.
 * Existing OTP transaction kernel obtains the single ScriptLock, verifies
 * cross-challenge rate limits and writes ONLY the F:G pair atomically.
 */
/** Independent permission for the OTP F:G writer, separate from merely
 * approving read-only Sheets, consent PDFs or closed-site publication.
 */
function study1BindingOtpGate_(){
 study1BindingGate_();
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_ECONSENT_OTP_VERIFY_APPROVED')!=='true')
  throw Error('OTP_TRANSACTION_NOT_READY：尚未啟用正式OTP寫入及本人驗證');
 return true;
}
function study1EConsentVerifyContactOtp_(request){
 study1BindingOtpGate_();
 if(!request||Array.isArray(request)||typeof request!=='object'||
    Object.keys(request).sort().join(',')!==
     'applicantId,challengeId,code,experiment,screeningId')
  throw Error('OTP驗證指令格式不合法');
 study1BindingId_(request.applicantId);
 study1BindingId_(request.challengeId);
 study1BindingId_(request.screeningId);
 if(!['E1','E2'].includes(request.experiment)||
    typeof request.code!=='string'||!/^\d{8}$/.test(request.code))
  throw Error('OTP挑戰或實驗別不合法');
 const auth=study1EConsentOtpApplicantAuthorization_(request);
 if(!auth||auth.applicantId!==request.applicantId||
    auth.experiment!==request.experiment||
    auth.screeningId!==request.screeningId||
    auth.provenance!=='REC_APPROVED_APPLICANT_SCREENING'||
    auth.approved!==true)
  throw Error('IDENTITY_EVIDENCE_INVALID：OTP申請者／資格／實驗別證據未核實');
 study1BindingOtpGate_();
 const sourceEmail=study1BindingEmail_(auth.email);
 const p=PropertiesService.getScriptProperties();
 const otpSecret=p.getProperty('STUDY1_OTP_HMAC_SECRET');
 if(typeof otpSecret!=='string'||otpSecret.length<32||
    /SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(otpSecret))
  throw Error('OTP正式HMAC金鑰未核准');
 const tab=SpreadsheetApp.openById(study1BindingSheetId_('verification'))
   .getSheetByName('Verification');
 if(!tab)throw Error('OTP正式來源不存在');
 let lastRead=null;
 const adapters={
  getLock:()=>LockService.getScriptLock(),
  getSecret:()=>{study1BindingGate_();return otpSecret;},
  readSnapshot:()=>{
   study1BindingOtpGate_();
   // Active locked call only, the target and account/email index are re-read
   // after every write to detect changes or late overwritten values.
   const snap=study1BindingOtpSnapshot_(tab,request,sourceEmail);
   const matching=snap.rows.filter(row=>row[0]===request.challengeId);
   if(matching.length!==1)throw Error('OTP挑戰識別碼非唯一');
   const issued=study1BindingUtc_(matching[0][8]);
   if(snap.rows.some(row=>row[0]!==''&&
      (row[1]===request.applicantId||
       study1BindingEmail_(row[7])===sourceEmail)&&
      study1BindingUtc_(row[8])>issued))
    throw Error('OTP_SUPERSEDED：新碼已核發，舊碼不得再次使用');
   lastRead=snap;
   return snap;
  },
  writeAttemptAndUse:(rowNumber,attempts,usedAt)=>{
   study1BindingOtpGate_();
   if(!lastRead||!Number.isSafeInteger(rowNumber)||rowNumber<2||
      rowNumber>lastRead.rows.length+1||!Number.isSafeInteger(attempts)||
      attempts<1||attempts>5)
    throw Error('OTP寫入資料位置或嘗試次數不正確');
   const prev=lastRead.rows[rowNumber-2];
   if(!prev||prev[0]!==request.challengeId||prev[1]!==request.applicantId||
      study1BindingEmail_(prev[7])!==sourceEmail)
    throw Error('OTP目標資料不是原申請者');
   const fresh=study1BindingOtpRow_(tab,rowNumber,lastRead.headers.length);
   if(JSON.stringify(fresh)!==JSON.stringify(prev))
    throw Error('OTP來源在寫前已被競寫，禁止覆蓋');
   if(usedAt!==''&&usedAt!==null)study1BindingUtc_(usedAt);
   const nextUsed=usedAt||'';
   tab.getRange(rowNumber,6,1,2).setValues([[attempts,nextUsed]]);
   SpreadsheetApp.flush();
   const check=tab.getRange(rowNumber,6,1,2).getValues()[0];
   if(!Array.isArray(check)||check[0]!==attempts||check[1]!==nextUsed)
    throw Error('OTP F:G寫後驗證不一致；交易狀態未知');
   return true;
  }
 };
 // The OTP transaction owns the lock; it rejects stale and duplicate-use.
 const result=otpVerifyOnceLocked_({
  challengeId:request.challengeId,applicantId:request.applicantId,
  email:sourceEmail,code:request.code,nowUtc:new Date().toISOString()
 },adapters);
 // Do not return code, email, HMAC, challenge or participant information.
 return {verified:result.verified===true,reason:result.reason};
}
