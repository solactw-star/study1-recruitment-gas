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
