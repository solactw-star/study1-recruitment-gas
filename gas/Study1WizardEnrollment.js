/**
 * Study1 §70-S.13: original formal Applicants, Screenings and Verification
 * issuance. Private, fail-closed; no public RPC and no synthetic identity.
 */
function study1WizardIntakeAuthority_(request){
 // Eligibility is a participant self-declaration, never an ID/registration
 // card or researcher-approved identity attestation.
 return study1ParticipantInput_(request);
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
/** One authoritative intake writer, so duplicate legacy enrollment cannot
 * create a parallel applicant identity or skip server Turnstile/REC gates.
 */
function study1WizardCreateApplication_(r){
 study1WizardIntakeGate_();
 const stated=study1WizardIntakeAuthority_(r);
 if(stated.accepted!==true)
  return {accepted:false,reason:'SCREENING_NOT_ELIGIBLE'};
 // The real implementation rechecks original versioned REC scope, verifies a
 // single-use human token and appends original Applicant + Screening under
 // the shared ScriptLock. No documentary identity review is added.
 return study1ParticipantBegin_(r);
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
/** Legacy internal step-03 entry now routes to the SAME original PENDING
 * applicant and mailbox transaction as the public self-report flow.
 * There is no second applicant-authorization registry or fake VERIFIED flag.
 */
function study1WizardOtpSendBound_(r){
 study1WizardIssueGate_();
 if(!r||typeof r!=='object'||Array.isArray(r)||
    Object.keys(r).sort().join(',')!==
    'applicantId,experiment,requestId,screeningId')
  throw Error('OTP核發請求欄位不合法');
 study1BindingId_(r.applicantId);study1BindingId_(r.screeningId);
 if(r.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 if(typeof r.requestId!=='string'||
    !/^[A-Za-z0-9_-]{16,80}$/.test(r.requestId))
  throw Error('OTP重送鍵不合法');
 // Read minimal original fields under the SAME shared ScriptLock. Release
 // before delegating: the real OTP issuer independently reacquires the lock
 // and performs complete source/REC/gate checks immediately before MailApp.
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)
  throw Error('OTP申請來源共用鎖遭占用');
 let email;
 try{
  if(!lock.hasLock())throw Error('OTP申請來源共用鎖失效');
  study1WizardIssueGate_();
  const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
  const applicant=study1BindingSheetRow_(book,'Applicants',
   STUDY1_BINDING_SCHEMA_.applicants,r.applicantId).rows[0];
  const screening=study1BindingSheetRow_(book,'Screenings',
   STUDY1_BINDING_SCHEMA_.screenings,r.screeningId).rows[0];
  const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
  if(!['PENDING_EMAIL','EMAIL_VERIFIED'].includes(applicant[6])||
     screening[1]!==r.applicantId||
     screening[2]!==policy.screeningVersion||
     screening[3]!=='ELIGIBLE'||
     screening[5]!=='PARTICIPANT_SELF_REPORT')
   throw Error('自陳資格及待驗電子郵件來源不一致');
  email=study1BindingEmail_(applicant[2]);
 }finally{lock.releaseLock();}
 return study1ParticipantOtpSend_({
  applicantId:r.applicantId,screeningId:r.screeningId,
  experiment:'E1',email,requestId:r.requestId});
}
