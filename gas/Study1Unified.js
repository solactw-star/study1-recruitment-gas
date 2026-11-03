/**
 * Study1 unified recruitment workflow — same transition model for future
 * participant interface and owner-only fixture adapter.
 * THIS MODULE IS STAGED ONLY. No public intake, real email, Sheets or signatures.
 * Research/REC source: locally supplied experiment 1/2 consent drafts.
 * Formal use requires separate approval and a reviewed production adapter.
 */
const STUDY1_UNIFIED_FIXTURE_KEY_='STUDY1_UNIFIED_FIXTURE_V1';
/* Draft-only policy: editable text and PDF metadata, never approved or signed. */
function study1UnifiedPolicy_(){
 return {screening:{source:'REC_DRAFT_ONLY',version:'PENDING_SCREENING_APPROVAL',questions:{
 adult:'模擬：年滿 18 歲',cycu:'模擬：具中原大學學生身分',
 diagnosed:'模擬：目前無醫師診斷之心理疾患',
 treatment:'模擬：未因心理狀況接受持續治療',
 frequentPractice:'模擬：沒有規律正念或相關練習',
 joinedE1:'模擬：未曾參與實驗一（實驗二條件）'},
 mappings:{
 E1:{source:'REC_DRAFT_ONLY',version:'PENDING_E1_RULES_V1',rules:{adult:true,cycu:true,diagnosed:false,treatment:false,frequentPractice:false,joinedE1:null}},
 E2:{source:'REC_DRAFT_ONLY',version:'PENDING_E2_RULES_V1',rules:{adult:true,cycu:true,diagnosed:false,treatment:false,frequentPractice:false,joinedE1:false}}
 }},
 consent:{E1:{version:'PENDING_REC_APPROVAL_E1',sha256:'',approval:'PENDING'},
 E2:{version:'PENDING_REC_APPROVAL_E2',sha256:'',approval:'PENDING'}},
 retention:{status:'PENDING',days:null},notification:{status:'DISABLED'}};
}
function study1UnifiedValidatePolicy_(v){
 const keys=['adult','cycu','diagnosed','treatment','frequentPractice','joinedE1'];
 if(!v||!v.screening||v.screening.source!=='REC_DRAFT_ONLY'||
 v.screening.version!=='PENDING_SCREENING_APPROVAL'||!v.screening.questions||
 Object.keys(v.screening.questions).sort().join(',')!==keys.sort().join(',')||
 keys.some(k=>typeof v.screening.questions[k]!=='string'||!v.screening.questions[k].trim()||
 v.screening.questions[k].length>120||/[<>]/.test(v.screening.questions[k]))||
 !v.screening.mappings||Object.keys(v.screening.mappings).sort().join(',')!=='E1,E2'||
 !v.consent||!v.retention||v.retention.status!=='PENDING'||v.retention.days!==null||
 !v.notification||v.notification.status!=='DISABLED')throw Error('研究政策測試設定不合法');
 for(const exp of ['E1','E2']){
  const m=v.screening.mappings[exp];
  if(!m||Object.keys(m).sort().join(',')!=='rules,source,version'||
   m.source!=='REC_DRAFT_ONLY'||typeof m.version!=='string'||
   !/^PENDING_[A-Z0-9_]{3,64}$/.test(m.version)||!m.rules||
   Object.keys(m.rules).sort().join(',')!==keys.slice().sort().join(',')||
   keys.some(k=>m.rules[k]!==null&&typeof m.rules[k]!=='boolean')||
   m.rules.adult!==true||m.rules.cycu!==true||
   (exp==='E1'&&m.rules.joinedE1!==null)||(exp==='E2'&&m.rules.joinedE1!==false))
   throw Error('實驗初篩對照表必須維持 REC 草稿、版本與最低安全條件');

  const c=v.consent[exp];
  if(!c||c.approval!=='PENDING'||typeof c.version!=='string'||
  !/^PENDING_[A-Z0-9_]{3,64}$/.test(c.version)||typeof c.sha256!=='string'||
  (c.sha256!==''&&!/^[a-f0-9]{64}$/.test(c.sha256)))
   throw Error('REC 版本必須維持 PENDING，PDF 雜湊格式必須正確');
 }
 return true;
}
function study1UnifiedValidateSlots_(slots){
 if(!Array.isArray(slots)||slots.length>8)throw Error('測試時段不得超過八筆');
 const seen=new Set();
 for(const s of slots){
  if(!s||Object.keys(s).sort().join(',')!=='capacity,experiment,id,when'||
  typeof s.id!=='string'||!/^SIM-SLOT-E[12]-[A-Z]$/.test(s.id)||
  !['E1','E2'].includes(s.experiment)||!s.id.includes('-'+s.experiment+'-')||
  typeof s.when!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01]) ([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s.when)||
  !Number.isSafeInteger(s.capacity)||s.capacity<1||s.capacity>20||seen.has(s.id))
   throw Error('測試時段欄位、容量或日期不合法');
  const date=s.when.replace(' ','T')+':00Z';
  if(Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,16)!==date.slice(0,16))
   throw Error('測試時段日期不存在');
  seen.add(s.id);
 }
 return true;
}
function study1UnifiedAudit_(s){
 return s.requests.slice(-15).map((r,i)=>({
  revision:s.requests.length-Math.min(s.requests.length,15)+i+1,
  action:JSON.parse(r.fingerprint)[0]}));
}
/* Preview notification uses the same owner-edited template; never sends email. */
function study1UnifiedNotify_(s,a,event){
 const labels={CONFIRM:'確認',MOVE:'改期',CANCEL:'取消'};
 if(!Object.prototype.hasOwnProperty.call(labels,event))throw Error('未知測試通知事件');
 s.notifications.push({id:a.id,event,
  text:'〔SIM '+labels[event]+'〕'+s.config.emailTemplate+'（僅預覽，未寄送）',
  status:'SIM_PENDING',attempts:0,lastError:null});
}
function study1UnifiedProductionAdapter_(){
 // Explicit fail-closed contract for the future approved production adapter.
 // No Sheets, Drive, Mail, real participant or REC operation is possible here.
 const deny=()=>{throw Error('正式資料 adapter 尚未核准，拒絕讀寫及寄送');};
 return Object.freeze({mode:'FORMAL_BLOCKED',approved:false,
  source:'PENDING_REC_AND_DATA_APPROVAL',
  read:deny,readParticipant:deny,lookupEligibility:deny,writeParticipant:deny,
  requestOtp:deny,verifyOtp:deny,listSlots:deny,holdSlot:deny,
  confirmBooking:deny,rescheduleBooking:deny,cancelBooking:deny,
  readConsent:deny,submitConsent:deny,sendNotification:deny,
  exportAudit:deny,deleteParticipant:deny});
}

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
/* Owner-editable draft research copy. This is NOT an REC approval source. */
function study1UnifiedResearch_(){
 const defs=study1UnifiedDefinitions_();
 return {source:'REC_DRAFT_ONLY',approval:'PENDING',
  ...Object.fromEntries(['E1','E2'].map(exp=>[exp,
   Object.fromEntries(['label','duration','procedure','compensation'].map(k=>[k,defs[exp][k]]))]))};
}
function study1UnifiedValidateResearch_(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).sort().join(',')!=='E1,E2,approval,source'||
    v.source!=='REC_DRAFT_ONLY'||v.approval!=='PENDING')
  throw Error('研究說明必須維持 REC 草稿來源及待核狀態');
 for(const exp of ['E1','E2']){
  const d=v[exp];
  if(!d||typeof d!=='object'||Array.isArray(d)||
     Object.keys(d).sort().join(',')!=='compensation,duration,label,procedure'||
     ['label','duration','procedure','compensation'].some(k=>
      typeof d[k]!=='string'||!d[k].trim()||d[k].length>350||/[<>]/.test(d[k])))
   throw Error('研究說明測試欄位不合法');
 }
 return true;
}
function study1UnifiedInitial_(){
 return {schemaVersion:1,revision:0,config:{
  title:'Study 1｜正式網站整合流程（測試資料模式）',
  notice:'所有資料均為虛構測試，不會建立正式報名、寄信或產生有效同意書。',
  emailTemplate:'〔測試通知〕預約狀態變更，正式寄送尚未啟用。'},
  policy:study1UnifiedPolicy_(),research:study1UnifiedResearch_(),
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
 if(s&&!s.policy)s.policy=study1UnifiedPolicy_(); // migrate only owner fixture
 if(s&&!s.research)s.research=study1UnifiedResearch_(); // legacy owner-only fixture, no write on read
 if(s&&s.policy&&s.policy.screening&&!s.policy.screening.mappings)
  s.policy.screening.mappings=study1UnifiedPolicy_().screening.mappings;
 if(s&&Array.isArray(s.notifications))s.notifications.forEach(n=>{
  if(n&&n.status===undefined){n.status='SIM_PENDING';n.attempts=0;n.lastError=null;}
 });
 if(s&&Array.isArray(s.applications))s.applications.forEach(a=>{
  if(!Array.isArray(a.otpHistory))a.otpHistory=a.otpRequestedAt===null?[]:
   [{createdAt:a.otpRequestedAt,attempts:a.otpAttempts,
    usedAt:a.phase==='OTP_SENT'?'':new Date(a.otpRequestedAt+1000).toISOString()}];
 });
 if(!s||s.schemaVersion!==1||!Number.isSafeInteger(s.revision)||s.revision<1||
    !s.config||typeof s.config.title!=='string'||typeof s.config.notice!=='string'||
    typeof s.config.emailTemplate!=='string'||
    !Array.isArray(s.slots)||s.slots.length>8||
    !Array.isArray(s.applications)||s.applications.length>8||
    !Array.isArray(s.requests)||s.requests.length>40||
    !Array.isArray(s.notifications)||s.notifications.length>15||
    s.revision!==s.requests.length)throw Error('統一網站測試資料版本不一致，拒絕操作');
 study1UnifiedValidatePolicy_(s.policy);
 study1UnifiedValidateResearch_(s.research);
 study1UnifiedValidateSlots_(s.slots);
 for(const n of s.notifications){
  if(!n||!/^SIM-[0-9]{3}$/.test(n.id)||!['CONFIRM','MOVE','CANCEL'].includes(n.event)||
   typeof n.text!=='string'||n.text.length>650||
   !['SIM_PENDING','SIM_FAILED','SIM_DELIVERED'].includes(n.status)||
   !Number.isSafeInteger(n.attempts)||n.attempts<0||n.attempts>3||
   (n.lastError!==null&&n.lastError!=='SIMULATED_FAILURE')||
   (n.status==='SIM_FAILED'&&n.lastError!=='SIMULATED_FAILURE'))
    throw Error('虛構通知重送紀錄不合法');
 }
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
  if(a.screeningVersion!==undefined&&a.screeningVersion!==null&&
   (typeof a.screeningVersion!=='string'||!/^PENDING_[A-Z0-9_]{3,64}$/.test(a.screeningVersion)||
    a.screeningSource!=='REC_DRAFT_ONLY'))
   throw Error('虛構初篩來源版本不合法');
  if(a.consentSha256!==undefined&&a.consentSha256!==null&&
    (typeof a.consentSha256!=='string'||
     (a.consentSha256!==''&&!/^[a-f0-9]{64}$/.test(a.consentSha256))))
   throw Error('虛構同意書鎖定雜湊格式異常');
  if(a.consentReviewedAt!==undefined&&a.consentReviewedAt!==null&&
     (!Number.isFinite(a.consentReviewedAt)||a.consentReviewedAt<=0))
   throw Error('測試版本資訊閱覽時間不合法');
  if(a.consentReviewedAt!=null&&
     (a.consentReviewedVersion!==a.consentVersion||
      a.consentReviewedSha256!==a.consentSha256))
   throw Error('測試版本資訊閱覽與鎖定版本不符');
  if(!Array.isArray(a.otpHistory)||a.otpHistory.length>3||
    a.otpHistory.some(h=>!h||!Number.isFinite(h.createdAt)||
     !Number.isSafeInteger(h.attempts)||h.attempts<0||h.attempts>5||
     typeof h.usedAt!=='string'||(h.usedAt!==''&&Number.isNaN(Date.parse(h.usedAt)))))
   throw Error('測試 OTP 歷程不合法');
  appIds.add(a.id);
 }
 for(const request of s.requests){
  if(!request||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(request.id)||
    typeof request.fingerprint!=='string'||request.fingerprint.length>800||
    usedReq.has(request.id))throw Error('虛構請求歷史異常');
  let parsed;try{parsed=JSON.parse(request.fingerprint);}catch(e){throw Error('虛構稽核格式不合法');}
  if(!Array.isArray(parsed)||parsed.length!==2||typeof parsed[0]!=='string')throw Error('虛構稽核格式不合法');
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

/**
 * Reuse the pre-reviewed BookingCore availability computation with in-memory
 * synthetic rows ONLY. No Sheet ID, participant details, or adapter access.
 * A synthetic two-hour end is solely a fixture shape for the pure kernel;
 * NOT an experiment duration or a formally approved timeslot policy.
 */
function study1UnifiedCoreAvailability_(s,now){
 const slotRows=s.slots.map(slot=>{
  const start=Date.parse(slot.when.replace(' ','T')+':00+08:00');
  if(!Number.isFinite(start))throw Error('虛構時段日期異常');
  return [slot.id,new Date(start).toISOString(),
   new Date(start+7200000).toISOString(),slot.capacity,
   'SIM_ONLY','OPEN','SIM_OWNER',''];
 });
 const reservationRows=s.applications.filter(a=>a.slotId!==null).map(a=>{
  const status=({HELD:'HELD',CONSENTED:'HELD',CONFIRMED:'CONFIRMED',
   CANCELLED:'CANCELLED'})[a.phase];
  if(!status)throw Error('虛構預約狀態與時段衝突');
  const expiry=a.holdUntil===null?'':new Date(a.holdUntil).toISOString();
  return [a.id,a.id,a.slotId,status,expiry,
   'SIM_ONLY_'+a.id,new Date(now).toISOString(),'','',''];
 });
 return bookingComputeAvailability_(slotRows,reservationRows,new Date(now).toISOString());
}
/**
 * Call the original audited OTP evaluator using exclusively synthetic
 * challenge data. Fixed dummy fixture key and code never authorize real email.
 * The real production adapter remains independently fail-closed.
 */
function study1UnifiedCoreOtpDecision_(app,code,now){
 const secret='SIMULATED_ONLY_NOT_A_PRODUCTION_SECRET_V1';
 const challenge='SIM-OTP-'+app.id;
 const issued=app.otpRequestedAt;
 const expiry=issued+OTP_RULES_.ttlMinutes*60000;
 const row=[challenge,app.id,OTP_RULES_.emailPurpose,
  otpHmacHex_(challenge,app.id,OTP_RULES_.emailPurpose,'00000000',secret),
  new Date(expiry).toISOString(),app.otpAttempts,'',
  'fixture@example.invalid',new Date(issued).toISOString()];
 return otpEvaluateVerification_(row,code,new Date(now).toISOString(),secret);
}

function study1UnifiedCapacity_(s,slotId,now){
 return s.applications.filter(a=>a.slotId===slotId&&
  (a.phase==='CONFIRMED'||
   ['HELD','CONSENTED'].includes(a.phase)&&a.holdUntil>now)).length;
}
function study1UnifiedView_(s){
 const now=Date.now();
 const available=new Map(study1UnifiedCoreAvailability_(s,now).map(x=>[x.slotId,x.remaining]));
 return {mode:'TEST',open:false,consentReady:false,formalApproval:'PENDING',
  revision:s.revision,researchSource:s.research.source,researchApproval:s.research.approval,
  definitions:Object.fromEntries(Object.entries(s.research).filter(([k])=>k==='E1'||k==='E2').map(([k,v])=>
   [k,{...v,recVersion:s.policy.consent[k].version}])),config:s.config,
  policy:s.policy,audit:study1UnifiedAudit_(s),
  slots:s.slots.map(slot=>{
   const bookable=Date.parse(slot.when.replace(' ','T')+':00+08:00')>now;
   return {...slot,bookable,remaining:bookable?
    (available.get(slot.id)||0):0};}),
  applications:s.applications.map(a=>({id:a.id,experiment:a.experiment,phase:a.phase,eligible:a.eligible,
   screeningVersion:a.screeningVersion||null,screeningSource:a.screeningSource||null,
   slotId:a.slotId,otpAttempts:a.otpAttempts,consentVersion:a.consentVersion,
   consentSha256:a.consentSha256===undefined?null:a.consentSha256,
   consentReviewedAt:a.consentReviewedAt||null,
   holdUntil:a.holdUntil,
   holdExpired:['HELD','CONSENTED'].includes(a.phase)&&Number.isFinite(a.holdUntil)&&a.holdUntil<=Date.now(),
   signatureDemo:a.signatureDemo})),
  notifications:s.notifications.slice(-6).map((n,i)=>({...n,index:s.notifications.length-Math.min(s.notifications.length,6)+i})),
  fixtureOtp:'00000000'};
}
function study1UnifiedRequireCommand_(command){
 if(!command||typeof command!=='object'||Array.isArray(command)||
  Object.keys(command).sort().join(',')!=='action,expectedRevision,payload,requestId'||
  !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
  typeof command.action!=='string'||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(command.requestId)||
  !command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)||
  JSON.stringify(command.payload).length>1600)throw Error('統一流程測試指令格式不合法');
 const approved=['START','SCREEN','OTP_REQUEST','OTP_VERIFY','HOLD','CONSENT_REVIEW','CONSENT','CONFIRM','MOVE','CANCEL','ADMIN_EDIT','ADMIN_RESEARCH','ADMIN_SLOTS','ADMIN_POLICY','ADMIN_SCREENING','ADMIN_NOTIFY_ATTEMPT','ADMIN_RESET'];
 if(!approved.includes(command.action))throw Error('未核准的測試指令');
 return command;
}
function study1UnifiedEligibility_(experiment,answers,policy){
 if(!answers||typeof answers!=='object'||Array.isArray(answers)||
  Object.keys(answers).sort().join(',')!=='adult,cycu,diagnosed,frequentPractice,joinedE1,treatment'||
  Object.values(answers).some(x=>typeof x!=='boolean'))throw Error('資格測試答覆格式錯誤');
 const m=policy&&policy.screening&&policy.screening.mappings&&policy.screening.mappings[experiment];
 if(!m)throw Error('實驗初篩來源版本缺失');
 return Object.keys(m.rules).every(k=>m.rules[k]===null||answers[k]===m.rules[k]);
}
function study1UnifiedTransition_(s,cmd,now,outerLock){
 const p=cmd.payload,action=cmd.action,byId=id=>s.applications.find(a=>a.id===id);
 if(action==='START'){
  if(Object.keys(p).sort().join(',')!=='experiment'||!['E1','E2'].includes(p.experiment)||
    s.applications.length>=8)throw Error('測試申請上限或實驗別格式錯誤');
  const next='SIM-'+String(s.applications.length+1).padStart(3,'0');
  s.applications.push({id:next,experiment:p.experiment,phase:'STARTED',eligible:null,
    otpAttempts:0,otpRequestedAt:null,otpHistory:[],slotId:null,holdUntil:null,
    consentVersion:null,consentSha256:null,consentReviewedAt:null,
    consentReviewedVersion:null,consentReviewedSha256:null,signatureDemo:false});return;
 }
 if(action==='ADMIN_EDIT'){
  if(Object.keys(p).sort().join(',')!=='emailTemplate,notice,title'||
    ['title','notice','emailTemplate'].some(k=>typeof p[k]!=='string'||p[k].length>500||
      /[<>]/.test(p[k])))throw Error('後台設定草稿格式錯誤');
  s.config={title:p.title,notice:p.notice,emailTemplate:p.emailTemplate};return;
 }

 if(action==='ADMIN_RESEARCH'){
  if(Object.keys(p).join(',')!=='research'||!p.research||
     Object.keys(p.research).sort().join(',')!=='E1,E2')
   throw Error('研究說明測試草稿欄位不合法');
  const next={source:'REC_DRAFT_ONLY',approval:'PENDING',
   E1:p.research.E1,E2:p.research.E2};
  study1UnifiedValidateResearch_(next);
  s.research=JSON.parse(JSON.stringify(next));return;
 }
 if(action==='ADMIN_SCREENING'){
  if(Object.keys(p).join(',')!=='mappings'||!p.mappings||
   Object.keys(p.mappings).sort().join(',')!=='E1,E2')throw Error('初篩版本對照表格式不合法');
  const next=JSON.parse(JSON.stringify(s.policy));next.screening.mappings=p.mappings;
  study1UnifiedValidatePolicy_(next);
  for(const exp of ['E1','E2']){
   const old=s.policy.screening.mappings[exp],fresh=next.screening.mappings[exp];
   if(JSON.stringify(old.rules)!==JSON.stringify(fresh.rules)&&old.version===fresh.version)
    throw Error('初篩規則異動必須更新 PENDING 版本號');
  }
  s.policy=next;return;
 }
 if(action==='ADMIN_NOTIFY_ATTEMPT'){
  if(Object.keys(p).sort().join(',')!=='index,result'||
   !Number.isSafeInteger(p.index)||p.index<0||p.index>=s.notifications.length||
   !['FAIL','SIM_OK'].includes(p.result))throw Error('虛構通知重試指令不合法');
  const n=s.notifications[p.index];
  if(n.status==='SIM_DELIVERED'||n.attempts>=3)throw Error('虛構通知已完成或達重試上限');
  n.attempts++;n.status=p.result==='FAIL'?'SIM_FAILED':'SIM_DELIVERED';
  n.lastError=p.result==='FAIL'?'SIMULATED_FAILURE':null;
  return; // No delivery adapter, no email or network calls.
 }
 if(action==='ADMIN_SLOTS'){
  if(Object.keys(p).join(',')!=='slots')throw Error('時段管理欄位不合法');
  study1UnifiedValidateSlots_(p.slots);
  for(const old of s.slots){
   const next=p.slots.find(x=>x.id===old.id);
   if(s.applications.some(a=>a.slotId===old.id)&&
      (!next||next.experiment!==old.experiment||next.when!==old.when))
    throw Error('已有歷史預約的時段不得刪除或變更日期／實驗');
   if(next&&study1UnifiedCapacity_(s,old.id,now)>next.capacity)
    throw Error('測試容量低於有效預約數');
  }
  s.slots=p.slots.map(x=>({id:x.id,experiment:x.experiment,when:x.when,capacity:x.capacity}));return;
 }
 if(action==='ADMIN_POLICY'){
  if(Object.keys(p).sort().join(',')!=='consent,questions')throw Error('研究政策欄位不合法');
  const next=JSON.parse(JSON.stringify(s.policy));next.screening.questions=p.questions;
  for(const exp of ['E1','E2']){
   if(!p.consent||!p.consent[exp]||Object.keys(p.consent[exp]).sort().join(',')!=='sha256,version')
    throw Error('REC 版本欄位不合法');
   next.consent[exp]={...p.consent[exp],approval:'PENDING'};
  }
  study1UnifiedValidatePolicy_(next);
  for(const a of s.applications){
   if(['HELD','CONSENTED'].includes(a.phase)&&a.holdUntil>now&&
    (next.consent[a.experiment].version!==s.policy.consent[a.experiment].version||
     next.consent[a.experiment].sha256!==s.policy.consent[a.experiment].sha256))
    throw Error('已有有效暫留，禁止更動 REC 版本鎖定');
  }
  s.policy=next;return;
 }
 if(typeof p.id!=='string'||!/^SIM-[0-9]{3}$/.test(p.id))throw Error('只能操作虛構申請識別碼');
 const a=byId(p.id);if(!a)throw Error('虛構申請不存在');
 if(action==='SCREEN'){
  if(a.phase!=='STARTED'||Object.keys(p).sort().join(',')!=='answers,id')
    throw Error('初篩流程順序或欄位不符');
  a.eligible=study1UnifiedEligibility_(a.experiment,p.answers,s.policy);
  a.screeningVersion=s.policy.screening.mappings[a.experiment].version;
  a.screeningSource='REC_DRAFT_ONLY';
  a.phase=a.eligible?'SCREENED':'INELIGIBLE';return;
 }
 if(action==='OTP_REQUEST'){
  if(!['SCREENED','OTP_SENT'].includes(a.phase)||Object.keys(p).join(',')!=='id')
    throw Error('尚未符合虛構 OTP 申請條件');
  if(a.otpRequestedAt!==null&&now-a.otpRequestedAt<60000)
    throw Error('虛構 OTP 重送太頻繁');
  study1FixtureIssue_(s,a,now);a.phase='OTP_SENT';return;
 }
 if(action==='OTP_VERIFY'){
  if(a.phase!=='OTP_SENT'||Object.keys(p).sort().join(',')!=='code,id')
    throw Error('OTP 測試流程順序錯誤');
  if(typeof p.code!=='string'||!/^[0-9]{8}$/.test(p.code))throw Error('測試 OTP 格式錯誤');
  study1FixtureVerify_(s,a,p.code,now,outerLock);
  return;
 }
 if(action==='HOLD'||action==='MOVE'){
  // Expired synthetic holds can be renewed only after a fresh capacity check.
  const expiredHold=['HELD','CONSENTED'].includes(a.phase)&&
   Number.isFinite(a.holdUntil)&&a.holdUntil<=now;
  if(action==='HOLD'&&a.phase!=='VERIFIED'&&!expiredHold)
   throw Error('尚未完成測試驗證');
  if(action==='MOVE'&&a.phase!=='CONFIRMED')throw Error('只允許已確認虛構預約改期');
  if(Object.keys(p).sort().join(',')!=='id,slotId')throw Error('時段操作欄位不完整');
  const slot=s.slots.find(x=>x.id===p.slotId&&x.experiment===a.experiment);
  if(!slot||(slot.id===a.slotId&&!expiredHold)||
     Date.parse(slot.when.replace(' ','T')+':00+08:00')<=now||
     !(study1UnifiedCoreAvailability_(s,now).some(x=>x.slotId===slot.id&&x.remaining>0)))
    throw Error('測試時段不存在、重複、已開始或已額滿');
  if(action==='HOLD')study1FixtureHold_(s,a,slot,cmd.requestId,now,outerLock);
  a.slotId=slot.id;
  if(action==='HOLD'){a.phase='HELD';a.holdUntil=now+900000;
   a.consentVersion=s.policy.consent[a.experiment].version;
   a.consentSha256=s.policy.consent[a.experiment].sha256;
   a.consentReviewedAt=null;a.consentReviewedVersion=null;
   a.consentReviewedSha256=null;a.signatureDemo=false;}
  else study1UnifiedNotify_(s,a,'MOVE');
  return;
 }
 if(action==='CONSENT_REVIEW'){
  if(a.phase!=='HELD'||a.holdUntil<=now||
     Object.keys(p).sort().join(',')!=='id,sha256,version'||
     p.version!==a.consentVersion||p.sha256!==a.consentSha256||
     p.version!==s.policy.consent[a.experiment].version||
     p.sha256!==s.policy.consent[a.experiment].sha256)
    throw Error('測試同意資訊未與暫留版本核對');
  // This records ONLY review of synthetic version metadata, NOT viewing a REC PDF.
  a.consentReviewedAt=now;a.consentReviewedVersion=p.version;
  a.consentReviewedSha256=p.sha256;return;
 }
 if(action==='CONSENT'){
  if(a.phase!=='HELD'||a.holdUntil<=now||
    Object.keys(p).sort().join(',')!=='accepted,id,signature,version'||
    p.accepted!==true||p.signature!=='SIMULATED_SIGN_ONLY'||
    p.version!==a.consentVersion||p.version!==s.policy.consent[a.experiment].version||
    a.consentSha256!==s.policy.consent[a.experiment].sha256||
    !Number.isFinite(a.consentReviewedAt)||
    a.consentReviewedVersion!==a.consentVersion||
    a.consentReviewedSha256!==a.consentSha256)
     throw Error('虛構同意書版本／雜湊、閱覽紀錄或模擬簽署不符');
  a.phase='CONSENTED';a.consentVersion=p.version;a.signatureDemo=true;return;
 }
 if(action==='CONFIRM'){
  if(a.phase!=='CONSENTED'||a.holdUntil<=now||Object.keys(p).join(',')!=='id')
    throw Error('簽署測試或暫留期限未確認');
  a.phase='CONFIRMED';a.holdUntil=null;
  study1UnifiedNotify_(s,a,'CONFIRM');return;
 }
 if(action==='CANCEL'){
  if((['HELD','CONSENTED'].includes(a.phase)&&a.holdUntil<=now)||
     !['HELD','CONSENTED','CONFIRMED'].includes(a.phase)||Object.keys(p).join(',')!=='id')
    throw Error('只有有效的虛構預約可取消');
  a.phase='CANCELLED';a.holdUntil=null;
  study1UnifiedNotify_(s,a,'CANCEL');return;
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
      s.applications.find(a=>a.id===c.payload.id)?.experiment,c.payload.answers,s.policy),
      version:s.policy.screening.mappings[s.applications.find(a=>a.id===c.payload.id)?.experiment]?.version}]):
    c.action==='OTP_VERIFY'?
    JSON.stringify([c.action,{id:c.payload.id,matched:c.payload.code==='00000000'}]):
    JSON.stringify([c.action,c.payload]);
  const found=s.requests.find(x=>x.id===c.requestId);
  if(found){
   if(found.fingerprint!==fingerprint)throw Error('請求識別碼對應不同操作');
   return {...study1UnifiedView_(s),deduplicated:true};
  }
  if(s.revision!==c.expectedRevision)throw Error('版本已變更，請重新讀取');
  if(c.action==='ADMIN_RESET'){
   if(Object.keys(c.payload).join(',')!=='confirmation'||
      c.payload.confirmation!=='RESET_SIM_FIXTURE_ONLY')
    throw Error('清除測試資料須使用完整確認字串');
   // Delete exactly one owner-only fixture key. Never touch research data or flags.
   const fixture=PropertiesService.getScriptProperties();
   fixture.deleteProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
   if(fixture.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_)!==null)
    throw Error('測試資料清除後回讀失敗');
   return {...study1UnifiedView_(study1UnifiedInitial_()),deduplicated:false,reset:true};
  }
  if(s.requests.length>=40)throw Error('測試交易歷史已達上限');
  // Work on an isolated copy so rejected transitions never mutate the stored model.
  const next=JSON.parse(JSON.stringify(s));
  study1UnifiedTransition_(next,c,Date.now(),lock);
  if(next.notifications.length>15)throw Error('測試通知歷程已達上限');
  study1UnifiedValidatePolicy_(next.policy);study1UnifiedValidateResearch_(next.research);
  study1UnifiedValidateSlots_(next.slots);
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
