/** Study1 isolated research-admin SANDBOX. Never accepts real participants. */
const STUDY1_ADMIN_OWNER_='solac.tw@gmail.com';
const STUDY1_ADMIN_PROPERTY_='STUDY1_SANDBOX_ADMIN_CONFIG_V1';
function study1AdminOwnerRequired_(){
  // Only valid on the Google-enforced MYSELF /exec deployment.
  // Google may redact ActiveUser.email for execute-as-deployer web apps.
  // EffectiveUser MUST be the owner; a non-empty ActiveUser MUST also match.
  // This code must NOT be deployed through an ANYONE/anonymous executable.
  const active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(effective!==STUDY1_ADMIN_OWNER_||(active&&active!==STUDY1_ADMIN_OWNER_)){
    throw new Error('研究室管理身分無法驗證，已拒絕存取。');
  }
}
function study1AdminDefault_(){
  return {schemaVersion:1,revision:0,studyTitle:'〔測試〕Study 1 招募設定',
    researchIntro:'此為隔離測試資料，非正式研究說明或核准內容。',
    eligibilityNote:'〔測試〕正式資格條件尚待研究團隊核准。',
    screeningQuestions:[{id:'test_q1',text:'〔測試題〕您是否同意閱讀研究說明？',required:true}],
    testSlots:[{id:'test_slot_1',start:'2027-01-01T10:00',location:'〔測試〕研究室 A',capacity:2}],
    emailTemplate:'〔測試通知範本〕本系統目前不會寄送郵件。',
    pdfVersionNote:'〔測試〕正式 REC 同意書 PDF 尚未指定。'};
}
function study1AdminValidate_(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('無效的測試設定');
  const allowed=['studyTitle','researchIntro','eligibilityNote','screeningQuestions','testSlots','emailTemplate','pdfVersionNote'];
  for(const key of Object.keys(input))if(!allowed.includes(key))throw Error('禁止變更未核准的設定欄位');
  const value={};
  for(const [key,max] of [['studyTitle',100],['researchIntro',1500],['eligibilityNote',750],['emailTemplate',750],['pdfVersionNote',400]]){
    if(typeof input[key]!=='string'||input[key].length>max)throw Error('設定文字超過上限：'+key);
    if(/[<>]/.test(input[key]))throw Error('不得在測試設定加入 HTML');
    value[key]=input[key].trim();
  }
  if(!value.studyTitle)throw Error('請填入測試標題');
  if(!Array.isArray(input.screeningQuestions)||input.screeningQuestions.length>6||
     !Array.isArray(input.testSlots)||input.testSlots.length>8)throw Error('測試問題或時段數量超過上限');
  value.screeningQuestions=input.screeningQuestions.map((x,i)=>{
    if(!x||typeof x!=='object'||Object.keys(x).some(k=>!['id','text','required'].includes(k))||
      typeof x.id!=='string'||!/^test_q[1-6]$/.test(x.id)||typeof x.text!=='string'||x.text.length>200||
      /[<>]/.test(x.text)||typeof x.required!=='boolean')throw Error('測試資格問題格式錯誤：'+(i+1));
    return {id:x.id,text:x.text.trim(),required:x.required};
  });
  value.testSlots=input.testSlots.map((x,i)=>{
    if(!x||typeof x!=='object'||Object.keys(x).some(k=>!['id','start','location','capacity'].includes(k))||
      typeof x.id!=='string'||!/^test_slot_[1-8]$/.test(x.id)||
      typeof x.start!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(x.start)||
      typeof x.location!=='string'||x.location.length>100||/[<>]/.test(x.location)||
      !Number.isInteger(x.capacity)||x.capacity<1||x.capacity>20)throw Error('測試時段格式錯誤：'+(i+1));
    return {id:x.id,start:x.start,location:x.location.trim(),capacity:x.capacity};
  });
  if(new Set(value.screeningQuestions.map(x=>x.id)).size!==value.screeningQuestions.length||
     new Set(value.testSlots.map(x=>x.id)).size!==value.testSlots.length)throw Error('測試代碼重複');
  return value;
}
function study1AdminPersisted_(){
  const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_ADMIN_PROPERTY_);
  if(!raw)return study1AdminDefault_();
  const found=JSON.parse(raw);
  if(found.schemaVersion!==1||!Number.isSafeInteger(found.revision)||found.revision<1)throw Error('測試設定版本損毀');
  return Object.assign({schemaVersion:1,revision:found.revision},study1AdminValidate_(found.config));
}
function adminGetSandboxConfig(){
  study1AdminOwnerRequired_();
  return {mode:'SANDBOX_ONLY',open:false,consentReady:false,
    store:'ScriptProperties:STUDY1_SANDBOX_ADMIN_CONFIG_V1',config:study1AdminPersisted_()};
}
function adminSaveSandboxConfig(input,expectedRevision){
  study1AdminOwnerRequired_();
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('無效的設定版本');
  const config=study1AdminValidate_(input);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw Error('另一項測試設定更新正在進行，請重新讀取');
  try{
    const current=study1AdminPersisted_();
    if(current.revision!==expectedRevision)throw Error('設定已由其他工作更新，請重新讀取後編輯');
    const newValue={schemaVersion:1,revision:current.revision+1,config};
    const payload=JSON.stringify(newValue);
    if(payload.length>7500)throw Error('測試設定過大');
    const properties=PropertiesService.getScriptProperties();
    properties.setProperty(STUDY1_ADMIN_PROPERTY_,payload);
    if(properties.getProperty(STUDY1_ADMIN_PROPERTY_)!==payload)throw Error('測試設定回讀不一致');
    return adminGetSandboxConfig();
  }finally{lock.releaseLock();}
}
