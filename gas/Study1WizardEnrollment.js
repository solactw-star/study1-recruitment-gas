/**
 * Study1 §70-S.13: original formal Applicants, Screenings and Verification
 * issuance. Private, fail-closed; no public RPC and no synthetic identity.
 */
function study1WizardIntakeAuthority_(request){
 throw Error('IDENTITY_SOURCE_NOT_CONFIGURED：未有核實本人、E1/E2與資格的來源');
}
function study1WizardIntakeGate_(){
 study1BindingGate_();
 if(PropertiesService.getScriptProperties().getProperty(
   'STUDY1_WIZARD_APPLICANT_CREATE_APPROVED')!=='true')
  throw Error('APPLICATION_NOT_READY');
}
function study1WizardIssueGate_(){
 study1BindingGate_();
 if(PropertiesService.getScriptProperties().getProperty(
   'STUDY1_ECONSENT_OTP_ISSUE_APPROVED')!=='true')
  throw Error('OTP_ISSUE_NOT_READY');
}
function study1WizardTable_(book,name,headers){
 const tab=book.getSheetByName(name);
 if(!tab||tab.getLastColumn()!==headers.length)
  throw Error('正式來源欄位數不同');
 const n=tab.getLastRow();
 if(!Number.isSafeInteger(n)||n<1||n>10001)
  throw Error('正式來源列數不合法');
 const h=tab.getRange(1,1,1,headers.length).getValues()[0];
 if(!Array.isArray(h)||headers.some((s,i)=>h[i]!==s))
  throw Error('正式來源表頭不合法');
 return {tab,n,headers};
}
function study1WizardLookup_(s,col,value,caseSensitive){
 if(s.n===1)return [];
 const found=s.tab.getRange(2,col,s.n-1,1)
  .createTextFinder(value).matchEntireCell(true).matchCase(caseSensitive)
  .useRegularExpression(false).findAll();
 if(!Array.isArray(found))throw Error('索引查詢失敗');
 return found.map(c=>{
  const r=c.getRow();
  if(c.getColumn()!==col||!Number.isSafeInteger(r)||r<2||r>s.n)
   throw Error('索引位置錯誤');
  return r;
 });
}
function study1WizardAppend_(s,record){
 if(s.tab.getLastRow()!==s.n||
    study1WizardLookup_(s,1,record[0],true).length)
  throw Error('寫入前競寫或識別碼重複');
 s.tab.appendRow(record);
 SpreadsheetApp.flush();
 const latest={...s,n:s.n+1};
 if(s.tab.getLastRow()!==latest.n||
    study1WizardLookup_(latest,1,record[0],true).join(',')!==String(latest.n)||
    JSON.stringify(s.tab.getRange(latest.n,1,1,record.length).getValues()[0])!==
     JSON.stringify(record))
  throw Error('寫後驗證失敗，結果未知');
}
/** Two tab append operations are NOT ACID. Partial failure requires review. */
function study1WizardCreateApplication_(r){
 study1WizardIntakeGate_();
 if(!r||Array.isArray(r)||typeof r!=='object'||
    Object.keys(r).sort().join(',')!=='email,experiment,name,phone,requestId')
  throw Error('申請資料欄位不合法');
 const email=study1BindingEmail_(r.email);
 if(!['E1','E2'].includes(r.experiment)||typeof r.name!=='string'||
    r.name.trim().length<2||r.name.length>80||/[<>\r\n]/.test(r.name)||
    typeof r.phone!=='string'||r.phone.length>30||
    /[<>\r\n]/.test(r.phone)||
    typeof r.requestId!=='string'||
    !/^[A-Za-z0-9_-]{16,80}$/.test(r.requestId))
  throw Error('申請欄值不合法');
 const att=study1WizardIntakeAuthority_(r);
 if(!att||att.approved!==true||
    att.provenance!=='REC_APPROVED_IDENTITY_ATTESTATION'||
    att.experiment!==r.experiment||
    study1BindingEmail_(att.email)!==email||att.name!==r.name.trim()||
    att.age18OrOlderVerified!==true||att.cycuStudentVerified!==true||
    att.eligibilityVerified!==true||
    att.eligibilityEvidenceSource!=='REC_APPROVED_ELIGIBILITY_VERIFICATION'||
    !/^[a-f0-9]{64}$/.test(att.evidenceSha256||'')||
    !/^[a-f0-9]{64}$/.test(att.eligibilityEvidenceSha256||'')||
    !/^[A-Za-z0-9._/-]{4,64}$/.test(att.screeningVersion||''))
  throw Error('IDENTITY_EVIDENCE_INVALID');
 if(r.experiment==='E2'&&!(att.priorE1ParticipationVerified===true&&
    att.priorE1Participation===false&&
    att.priorE1Source==='REC_APPROVED_STUDY_HISTORY'&&
    /^[a-f0-9]{64}$/.test(att.priorE1EvidenceSha256||'')))
  throw Error('ELIGIBILITY_EVIDENCE_MISSING');
 const appId='APP_'+study1BindingHmac_(
  ['APP_V1',r.requestId,r.experiment,email]).slice(0,28);
 const screeningId='SCR_'+study1BindingHmac_(
  ['SCR_V1',appId,att.evidenceSha256]).slice(0,28);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)throw Error('無法取得申請共用鎖');
 try{
  if(!lock.hasLock())throw Error('申請共用鎖失效');
  study1WizardIntakeGate_();
  const refreshed=study1WizardIntakeAuthority_(r);
  if(JSON.stringify(refreshed)!==JSON.stringify(att))
   throw Error('申請權責證據變動');
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const a=study1WizardTable_(book,'Applicants',STUDY1_BINDING_SCHEMA_.applicants);
  const s=study1WizardTable_(book,'Screenings',STUDY1_BINDING_SCHEMA_.screenings);
  const ai=study1WizardLookup_(a,1,appId,true);
  const si=study1WizardLookup_(s,1,screeningId,true);
  if(ai.length||si.length){
   if(ai.length!==1||si.length!==1)
    throw Error('APPLICATION_PARTIAL_WRITE_REQUIRES_REVIEW');
   const ar=a.tab.getRange(ai[0],1,1,7).getValues()[0];
   const sr=s.tab.getRange(si[0],1,1,6).getValues()[0];
   if(ar[1]!==r.name.trim()||study1BindingEmail_(ar[2])!==email||
      ar[3]!==r.phone.trim()||ar[6]!=='VERIFIED'||
      sr[1]!==appId||sr[2]!==att.screeningVersion||
      sr[3]!=='ELIGIBLE'||sr[5]!=='REC_APPROVED_ATTESTATION:'+att.evidenceSha256)
    throw Error('APPLICATION_REPLAY_MISMATCH');
   return {created:false,applicantId:appId,screeningId,experiment:r.experiment};
  }
  const now=new Date().toISOString();
  study1WizardAppend_(a,[appId,r.name.trim(),email,r.phone.trim(),
   now,now,'VERIFIED']);
  study1WizardAppend_(s,[screeningId,appId,att.screeningVersion,
   'ELIGIBLE',now,'REC_APPROVED_ATTESTATION:'+att.evidenceSha256]);
  if(!lock.hasLock())throw Error('申請寫後共用鎖失效');
  return {created:true,applicantId:appId,screeningId,experiment:r.experiment};
 }finally{lock.releaseLock();}
}
function study1WizardIssueRows_(book,appId,email){
 const ref=study1WizardTable_(book,'Verification',
  STUDY1_BINDING_SCHEMA_.verification);
 const matches=new Set(study1WizardLookup_(ref,2,appId,true)
  .concat(study1WizardLookup_(ref,8,email,false)));
 const rows=Array.from({length:ref.n-1},
  ()=>Array(ref.headers.length).fill(''));
 for(const rowNum of matches){
  const row=study1BindingOtpRow_(ref.tab,rowNum,9);
  if(row[1]!==appId&&study1BindingEmail_(row[7])!==email)
   throw Error('OTP索引競寫');
  rows[rowNum-2]=row;
 }
 return {ref,snapshot:{headers:ref.headers.slice(),rows}};
}
function study1WizardCode_(){
 const limit=Math.floor(4294967296/100000000)*100000000;
 for(let i=0;i<20;i++){
  const uuid=Utilities.getUuid();
  if(typeof uuid!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(uuid))
   throw Error('安全亂數來源未準備');
  const n=parseInt(uuid.slice(0,8),16);
  if(n<limit){
   const code=String(n%100000000).padStart(8,'0');
   if(code!=='00000000')return code;
  }
 }
 throw Error('安全OTP產生失敗');
}
function study1WizardOtpSendBound_(r){
 study1WizardIssueGate_();
 if(!r||Array.isArray(r)||typeof r!=='object'||
    Object.keys(r).sort().join(',')!=='applicantId,experiment,requestId,screeningId')
  throw Error('OTP核發請求欄位不合法');
 study1BindingId_(r.applicantId);study1BindingId_(r.screeningId);
 if(!['E1','E2'].includes(r.experiment)||
    typeof r.requestId!=='string'||
    !/^[A-Za-z0-9_-]{16,80}$/.test(r.requestId))
  throw Error('OTP重送鍵不合法');
 const att=study1EConsentOtpApplicantAuthorization_(r);
 if(!att||att.approved!==true||
    att.provenance!=='REC_APPROVED_APPLICANT_SCREENING'||
    att.applicantId!==r.applicantId||att.screeningId!==r.screeningId||
    att.experiment!==r.experiment||typeof att.screeningVersion!=='string')
  throw Error('OTP的可信申請及實驗來源不符');
 const email=study1BindingEmail_(att.email);
 const key=otpSecret_(PropertiesService.getScriptProperties().getProperty(
  'STUDY1_OTP_HMAC_SECRET'));
 if(/SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(key))
  throw Error('OTP正式HMAC金鑰不合法');
 const challengeId='CHL_'+study1BindingHmac_(
  ['CHL_V1',r.applicantId,r.screeningId,r.experiment,r.requestId]).slice(0,28);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)throw Error('OTP全域鎖遭佔用');
 try{
  if(!lock.hasLock())throw Error('OTP全域鎖失效');
  study1WizardIssueGate_();
  if(JSON.stringify(study1EConsentOtpApplicantAuthorization_(r))!==
     JSON.stringify(att))throw Error('OTP身分來源競寫');
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const applicant=study1BindingSheetRow_(book,'Applicants',
   STUDY1_BINDING_SCHEMA_.applicants,r.applicantId).rows[0];
  const screening=study1BindingSheetRow_(book,'Screenings',
   STUDY1_BINDING_SCHEMA_.screenings,r.screeningId).rows[0];
  if(applicant[6]!=='VERIFIED'||
     study1BindingEmail_(applicant[2])!==email||
     screening[1]!==r.applicantId||
     screening[2]!==att.screeningVersion||
     screening[3]!=='ELIGIBLE'||!screening[5])
   throw Error('OTP申請／篩檢／信箱不一致');
  const state=study1WizardIssueRows_(book,r.applicantId,email);
  const previous=study1WizardLookup_(state.ref,1,challengeId,true);
  if(previous.length){
   if(previous.length!==1)throw Error('OTP challenge非唯一');
   const row=study1BindingOtpRow_(state.ref.tab,previous[0],9);
   if(row[1]!==r.applicantId||study1BindingEmail_(row[7])!==email)
    throw Error('OTP重送指向不同申請');
   return {sent:false,reason:'ALREADY_ISSUED',challengeId};
  }
  const now=new Date().toISOString();
  if(!otpThrottleIssuePreflight_(state.snapshot,
     {applicantId:r.applicantId,email},now).allowed)
   return {sent:false,reason:'THROTTLED'};
  const code=study1WizardCode_();
  const expires=new Date(Date.parse(now)+OTP_RULES_.ttlMinutes*60000).toISOString();
  study1WizardIssueGate_();
  study1WizardAppend_(state.ref,[challengeId,r.applicantId,
   OTP_RULES_.emailPurpose,otpHmacHex_(challengeId,r.applicantId,
   OTP_RULES_.emailPurpose,code,key),expires,0,'',email,now]);
  if(!lock.hasLock())throw Error('OTP寄送前全域鎖失效');
  study1WizardIssueGate_();
  // Real implementation, always replaced with fake MailApp in offline tests.
  // A send timeout may be ambiguous; NEVER automatically retry same request.
  MailApp.sendEmail({to:email,subject:'Study1｜電子郵件驗證碼',
   body:'Study1信箱驗證碼：'+code+
    '\n10分鐘內有效；僅用來證明信箱控制權，不是本人身分證明。'});
  return {sent:true,reason:'ISSUED',challengeId,expiresAtUtc:expires};
 }finally{lock.releaseLock();}
}
