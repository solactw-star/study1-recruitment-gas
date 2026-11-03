/**
 * Study1 unified recruitment workflow — same transition model for future
 * participant interface and owner-only fixture adapter.
 * THIS MODULE IS STAGED ONLY. No public intake, real email, Sheets or signatures.
 * Research/REC source: locally supplied experiment 1/2 consent drafts.
 * Formal use requires separate approval and a reviewed production adapter.
 */
const STUDY1_UNIFIED_FIXTURE_KEY_='STUDY1_UNIFIED_FIXTURE_V1';
function study1UnifiedDefinitions_(){
 return {
  E1:{label:'實驗一｜記憶與內感覺',duration:'90–120 分鐘',
   compensation:'完成實驗後 200 元車馬費（依來源文件；正式版本待核對）',
   procedure:'單次實驗：文字與自傳式記憶作業、問卷及心跳偵測。',
   recVersion:'PENDING_REC_APPROVAL_E1'},
  E2:{label:'實驗二｜身心中軸覺察',duration:'前後測各約 90–120 分鐘，另有 8 週安排',
   compensation:'前測 200、介入 1,600、後測 200 元（依來源文件；正式版本待核對）',
   procedure:'前置問卷、前測、研究分組、8 週安排與後測。',
   recVersion:'PENDING_REC_APPROVAL_E2'}
 };
}
function study1UnifiedInitial_(){
 return {schemaVersion:1,revision:0,config:{
  title:'Study 1｜正式網站整合流程（測試資料模式）',
  notice:'所有資料均為虛構測試，不會建立正式報名、寄信或產生有效同意書。',
  emailTemplate:'〔測試通知〕預約狀態變更，正式寄送尚未啟用。'},
  slots:[
   {id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',capacity:2},
   {id:'SIM-SLOT-E1-B',experiment:'E1',when:'2027-01-06 14:00',capacity:2},
   {id:'SIM-SLOT-E2-A',experiment:'E2',when:'2027-01-07 10:00',capacity:2},
   {id:'SIM-SLOT-E2-B',experiment:'E2',when:'2027-01-08 14:00',capacity:2}
  ],applications:[],requests:[],notifications:[]};
}
function study1UnifiedAssertOwner_(){
 study1AdminOwnerRequired_();
 study1SandboxBookingFlags_();
}
function study1UnifiedRead_(){
 const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
 if(raw===null)return study1UnifiedInitial_();
 const s=JSON.parse(raw);
 if(!s||s.schemaVersion!==1||!Number.isSafeInteger(s.revision)||s.revision<1||
    !s.config||typeof s.config.title!=='string'||typeof s.config.notice!=='string'||
    typeof s.config.emailTemplate!=='string'||
    !Array.isArray(s.slots)||s.slots.length>8||
    !Array.isArray(s.applications)||s.applications.length>8||
    !Array.isArray(s.requests)||s.requests.length>40||
    !Array.isArray(s.notifications)||s.notifications.length>15||
    s.revision!==s.requests.length)throw Error('統一網站測試資料版本不一致，拒絕操作');
 const ids=new Set(),usedReq=new Set();
 for(const slot of s.slots){
  if(!slot||!/^SIM-SLOT-E[12]-[A-Z]$/.test(slot.id)||!['E1','E2'].includes(slot.experiment)||
     typeof slot.when!=='string'||slot.when.length>40||
     !Number.isSafeInteger(slot.capacity)||slot.capacity<1||slot.capacity>20||
     ids.has(slot.id))throw Error('虛構時段資料異常');
  ids.add(slot.id);
 }
 const appIds=new Set();
 for(const a of s.applications){
  if(!a||!/^SIM-[0-9]{3}$/.test(a.id)||!['E1','E2'].includes(a.experiment)||
    !['STARTED','INELIGIBLE','SCREENED','OTP_SENT','VERIFIED','HELD','CONSENTED','CONFIRMED','CANCELLED'].includes(a.phase)||
    appIds.has(a.id)||typeof a.otpAttempts!=='number'||
    (a.slotId!==null&&!ids.has(a.slotId)))throw Error('虛構申請資料異常');
  appIds.add(a.id);
 }
 for(const request of s.requests){
  if(!request||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(request.id)||
    typeof request.fingerprint!=='string'||request.fingerprint.length>800||
    usedReq.has(request.id))throw Error('虛構請求歷史異常');
  usedReq.add(request.id);
 }
 const occupancy=new Map();
 for(const a of s.applications){
  if(!['HELD','CONSENTED','CONFIRMED'].includes(a.phase))continue;
  if(!a.slotId)throw Error('有效虛構申請缺少時段');
  if(a.phase!=='CONFIRMED'&&(!Number.isFinite(a.holdUntil)))throw Error('暫留期限缺失');
  if(a.phase!=='CONFIRMED'&&a.holdUntil<=Date.now())continue;
  occupancy.set(a.slotId,(occupancy.get(a.slotId)||0)+1);
 }
 for(const slot of s.slots){
  if((occupancy.get(slot.id)||0)>slot.capacity)throw Error('虛構名額超額');
 }
 return s;
}
function study1UnifiedCapacity_(s,slotId,now){
 return s.applications.filter(a=>a.slotId===slotId&&
  (a.phase==='CONFIRMED'||
   ['HELD','CONSENTED'].includes(a.phase)&&a.holdUntil>now)).length;
}
function study1UnifiedView_(s){
 return {mode:'TEST',open:false,consentReady:false,formalApproval:'PENDING',
  revision:s.revision,definitions:study1UnifiedDefinitions_(),config:s.config,
  slots:s.slots.map(slot=>({...slot,remaining:slot.capacity-study1UnifiedCapacity_(s,slot.id,Date.now())})),
  applications:s.applications.map(a=>({id:a.id,experiment:a.experiment,phase:a.phase,eligible:a.eligible,
   slotId:a.slotId,otpAttempts:a.otpAttempts,consentVersion:a.consentVersion,
   holdUntil:a.holdUntil,signatureDemo:a.signatureDemo})),
  notifications:s.notifications.slice(-6).map(n=>({...n})),
  fixtureOtp:'00000000'};
}
function study1UnifiedRequireCommand_(command){
 if(!command||typeof command!=='object'||Array.isArray(command)||
  Object.keys(command).sort().join(',')!=='action,expectedRevision,payload,requestId'||
  !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
  typeof command.action!=='string'||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(command.requestId)||
  !command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)||
  JSON.stringify(command.payload).length>1600)throw Error('統一流程測試指令格式不合法');
 const approved=['START','SCREEN','OTP_REQUEST','OTP_VERIFY','HOLD','CONSENT','CONFIRM','MOVE','CANCEL','ADMIN_EDIT'];
 if(!approved.includes(command.action))throw Error('未核准的測試指令');
 return command;
}
function study1UnifiedEligibility_(experiment,answers){
 if(!answers||typeof answers!=='object'||Array.isArray(answers)||
  Object.keys(answers).sort().join(',')!=='adult,cycu,diagnosed,frequentPractice,joinedE1,treatment'||
  Object.values(answers).some(x=>typeof x!=='boolean'))throw Error('資格測試答覆格式錯誤');
 return answers.adult&&answers.cycu&&!answers.diagnosed&&!answers.treatment&&
        !answers.frequentPractice&&(experiment==='E1'||!answers.joinedE1);
}
function study1UnifiedTransition_(s,cmd,now){
 const p=cmd.payload,action=cmd.action,byId=id=>s.applications.find(a=>a.id===id);
 if(action==='START'){
  if(Object.keys(p).sort().join(',')!=='experiment'||!['E1','E2'].includes(p.experiment)||
    s.applications.length>=8)throw Error('測試申請上限或實驗別格式錯誤');
  const next='SIM-'+String(s.applications.length+1).padStart(3,'0');
  s.applications.push({id:next,experiment:p.experiment,phase:'STARTED',eligible:null,
    otpAttempts:0,otpRequestedAt:null,slotId:null,holdUntil:null,
    consentVersion:null,signatureDemo:false});return;
 }
 if(action==='ADMIN_EDIT'){
  if(Object.keys(p).sort().join(',')!=='emailTemplate,notice,title'||
    ['title','notice','emailTemplate'].some(k=>typeof p[k]!=='string'||p[k].length>500||
      /[<>]/.test(p[k])))throw Error('後台設定草稿格式錯誤');
  s.config={title:p.title,notice:p.notice,emailTemplate:p.emailTemplate};return;
 }
 if(typeof p.id!=='string'||!/^SIM-[0-9]{3}$/.test(p.id))throw Error('只能操作虛構申請識別碼');
 const a=byId(p.id);if(!a)throw Error('虛構申請不存在');
 if(action==='SCREEN'){
  if(a.phase!=='STARTED'||Object.keys(p).sort().join(',')!=='answers,id')
    throw Error('初篩流程順序或欄位不符');
  a.eligible=study1UnifiedEligibility_(a.experiment,p.answers);
  a.phase=a.eligible?'SCREENED':'INELIGIBLE';return;
 }
 if(action==='OTP_REQUEST'){
  if(!['SCREENED','OTP_SENT'].includes(a.phase)||Object.keys(p).join(',')!=='id')
    throw Error('尚未符合虛構 OTP 申請條件');
  if(a.otpRequestedAt!==null&&now-a.otpRequestedAt<60000)
    throw Error('虛構 OTP 重送太頻繁');
  a.otpRequestedAt=now;a.otpAttempts=0;a.phase='OTP_SENT';return;
 }
 if(action==='OTP_VERIFY'){
  if(a.phase!=='OTP_SENT'||Object.keys(p).sort().join(',')!=='code,id')
    throw Error('OTP 測試流程順序錯誤');
  if(typeof p.code!=='string'||!/^[0-9]{8}$/.test(p.code))throw Error('測試 OTP 格式錯誤');
  if(now-a.otpRequestedAt>600000||a.otpAttempts>=5)throw Error('測試 OTP 已過期或超過嘗試限制');
  a.otpAttempts++;
  if(p.code!=='00000000')return; // Persist the failed attempt within the locked fixture transaction.
  a.phase='VERIFIED';return;
 }
 if(action==='HOLD'||action==='MOVE'){
  if(action==='HOLD'&&a.phase!=='VERIFIED')throw Error('尚未完成測試驗證');
  if(action==='MOVE'&&a.phase!=='CONFIRMED')throw Error('只允許已確認虛構預約改期');
  if(Object.keys(p).sort().join(',')!=='id,slotId')throw Error('時段操作欄位不完整');
  const slot=s.slots.find(x=>x.id===p.slotId&&x.experiment===a.experiment);
  if(!slot||slot.id===a.slotId||study1UnifiedCapacity_(s,slot.id,now)>=slot.capacity)
    throw Error('測試時段不存在、重複或已額滿');
  a.slotId=slot.id;
  if(action==='HOLD'){a.phase='HELD';a.holdUntil=now+900000;}
  else s.notifications.push({id:a.id,event:'MOVE',text:'〔測試通知〕已改期；沒有寄送電子郵件。'});
  return;
 }
 if(action==='CONSENT'){
  if(a.phase!=='HELD'||a.holdUntil<=now||
    Object.keys(p).sort().join(',')!=='accepted,id,signature,version'||
    p.accepted!==true||p.signature!=='SIMULATED_SIGN_ONLY'||
    p.version!==study1UnifiedDefinitions_()[a.experiment].recVersion)
     throw Error('虛構同意書版本或模擬簽署不符');
  a.phase='CONSENTED';a.consentVersion=p.version;a.signatureDemo=true;return;
 }
 if(action==='CONFIRM'){
  if(a.phase!=='CONSENTED'||a.holdUntil<=now||Object.keys(p).join(',')!=='id')
    throw Error('簽署測試或暫留期限未確認');
  a.phase='CONFIRMED';a.holdUntil=null;
  s.notifications.push({id:a.id,event:'CONFIRM',text:'〔測試通知〕預約已確認；不會發送郵件。'});return;
 }
 if(action==='CANCEL'){
  if(!['HELD','CONSENTED','CONFIRMED'].includes(a.phase)||Object.keys(p).join(',')!=='id')
    throw Error('只有有效的虛構預約可取消');
  a.phase='CANCELLED';a.holdUntil=null;
  s.notifications.push({id:a.id,event:'CANCEL',text:'〔測試通知〕預約已取消；不會發送郵件。'});return;
 }
 throw Error('不可執行測試操作');
}
/** Single future site workflow, currently only reachable to the 828 owner in TEST mode. */
function study1UnifiedPreviewGet(){
 study1UnifiedAssertOwner_();
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('測試流程資料暫時鎖定');
 try{study1SandboxBookingFlags_();return study1UnifiedView_(study1UnifiedRead_());}
 finally{lock.releaseLock();}
}
function study1UnifiedPreviewCommand(command){
 study1UnifiedAssertOwner_();
 const c=study1UnifiedRequireCommand_(command);
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('其他測試流程正在進行');
 try{
  study1SandboxBookingFlags_();
  const s=study1UnifiedRead_();
  // Never persist per-question health/screening responses or even fixture OTP.
  // Replay identity stores only a derived test eligibility outcome / OTP match.
  const fingerprint=c.action==='SCREEN'?
    JSON.stringify([c.action,{id:c.payload.id,eligible:study1UnifiedEligibility_(
      s.applications.find(a=>a.id===c.payload.id)?.experiment,c.payload.answers)}]):
    c.action==='OTP_VERIFY'?
    JSON.stringify([c.action,{id:c.payload.id,matched:c.payload.code==='00000000'}]):
    JSON.stringify([c.action,c.payload]);
  const found=s.requests.find(x=>x.id===c.requestId);
  if(found){
   if(found.fingerprint!==fingerprint)throw Error('請求識別碼對應不同操作');
   return {...study1UnifiedView_(s),deduplicated:true};
  }
  if(s.revision!==c.expectedRevision)throw Error('版本已變更，請重新讀取');
  if(s.requests.length>=40)throw Error('測試交易歷史已達上限');
  // Work on an isolated copy so rejected transitions never mutate the stored model.
  const next=JSON.parse(JSON.stringify(s));
  study1UnifiedTransition_(next,c,Date.now());
  if(next.notifications.length>15)throw Error('測試通知歷程已達上限');
  next.revision++;
  next.requests.push({id:c.requestId,fingerprint});
  const raw=JSON.stringify(next);
  if(raw.length>8000)throw Error('測試資料已達 ScriptProperties 容量界線');
  const prop=PropertiesService.getScriptProperties();
  prop.setProperty(STUDY1_UNIFIED_FIXTURE_KEY_,raw);
  if(prop.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_)!==raw)
    throw Error('統一測試流程寫入後回讀失敗');
  return {...study1UnifiedView_(next),deduplicated:false};
 }finally{lock.releaseLock();}
}
