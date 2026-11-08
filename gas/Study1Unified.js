/**
 * Study1 unified recruitment workflow — same transition model for future
 * participant interface and owner-only fixture adapter.
 * THIS MODULE IS STAGED ONLY. No public intake, real email, Sheets or signatures.
 * Research/REC source: locally supplied experiment 1/2 consent drafts.
 * Formal use requires separate approval and a reviewed production adapter.
 */
const STUDY1_UNIFIED_FIXTURE_KEY_='STUDY1_UNIFIED_FIXTURE_V1';
/* B01 preferences are OWNER-only non-sensitive layout IDs, not test research
 * transactions. A distinct single property prevents exhausting fixture CAS. */
const STUDY1_B01_LAYOUT_KEY_='STUDY1_B01_OWNER_LAYOUT_V1';
const STUDY1_B01_LAYOUT_IDS_=['APPLICATION_CODES','APPLICATION_RECORDS',
 'SESSION_RECORDS','TODAY_SESSIONS','ATTENDANCE_PENDING','OPEN_TASKS',
 'E1_ACTIVE','E2_ACTIVE','CONFIRMED','ATTENDANCE_MARKED',
 'PROGRESS_COMPLETE','MISSING_SLOT','CANCELLED_SLOT_ACTIVE'];

/**
 * Retain the same owner-only TEST Script Property and its complete history.
 * Existing plain JSON is read as-is; large subsequent writes use gzip/base64
 * in that same single key, avoiding multi-key partial commit or fixture reset.
 * This byte margin stays below the 9 KB Apps Script per-property quota.
 */
const STUDY1_UNIFIED_GZIP_PREFIX_='GZIP1:';
const STUDY1_UNIFIED_PROPERTY_SAFE_BYTES_=7900;
function study1UnifiedUtf8Bytes_(raw){
 return encodeURIComponent(raw).replace(/%[0-9A-F]{2}/gi,'_').length;
}
function study1UnifiedStoredDecode_(stored){
 if(!stored.startsWith(STUDY1_UNIFIED_GZIP_PREFIX_))return stored;
 const packed=stored.slice(STUDY1_UNIFIED_GZIP_PREFIX_.length);
 if(!packed||!/^[A-Za-z0-9+/]+={0,2}$/.test(packed))
  throw Error('虛構測試儲存資料壓縮格式不合法，已拒絕操作');
 return Utilities.ungzip(Utilities.newBlob(
  Utilities.base64Decode(packed),'application/gzip','study1-fixture.gz'
 )).getDataAsString('UTF-8');
}
function study1UnifiedStoredEncode_(raw){
 if(study1UnifiedUtf8Bytes_(raw)<=STUDY1_UNIFIED_PROPERTY_SAFE_BYTES_)return raw;
 const gzip=Utilities.gzip(Utilities.newBlob(raw,'application/json','study1-fixture.json'));
 const stored=STUDY1_UNIFIED_GZIP_PREFIX_+Utilities.base64Encode(gzip.getBytes());
 if(study1UnifiedUtf8Bytes_(stored)>STUDY1_UNIFIED_PROPERTY_SAFE_BYTES_)
  throw Error('測試資料壓縮後仍超出安全容量，未寫入或清除既有資料');
 if(study1UnifiedStoredDecode_(stored)!==raw)
  throw Error('測試資料壓縮回讀檢查失敗，未寫入');
 return stored;
}

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
/**
 * Research-team PRESENTATION setting; not an authorization to recruit people.
 * All /exec formal intake endpoints remain CLOSED regardless of this choice.
 * E2 is not recruiting in 2026; its announced research year is 2027.
 */
function study1UnifiedRecruitment_(){
 return {E1:{year:2026,mode:'DEMO_OPEN'},E2:{year:2027,mode:'COMING_SOON'}};
}
function study1UnifiedValidateRecruitment_(settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||
   Object.keys(settings).sort().join(',')!=='E1,E2')
  throw Error('實驗顯示與開放狀態設定格式錯誤');
 for(const exp of ['E1','E2']){
  const entry=settings[exp];
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     Object.keys(entry).sort().join(',')!=='mode,year'||
     entry.year!==(exp==='E1'?2026:2027)||
     !['DEMO_OPEN','COMING_SOON','HIDDEN'].includes(entry.mode))
   throw Error('實驗顯示狀態必須為示範開放／即將開放／隱藏，2027年實驗二不可提前');
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
/* B11 formal publication is explicitly forbidden until REC, data governance,
 * real roles and content approval are independently verified. Private GAS
 * function names ending in _ cannot be called from google.script.run. */
function study1UnifiedB11FormalPublish_(){
 throw Error('B11正式網站發布未經REC及資料權責核准，拒絕執行');
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


/**
 * Versioned, provider-neutral data contract for the FUTURE approved storage port.
 * It never calls Sheets, Drive, properties, email, or the existing fixture.
 * All records are explicitly synthetic. An approved persistent adapter and
 * REC/role controls must be supplied independently before real use.
 */
function study1UnifiedStoreReadiness_(){
 return Object.freeze({schema:'STUDY1_STORAGE_CONTRACT_V1',
  contractTestable:true,providerConnected:false,persistent:false,
  formalReads:false,formalWrites:false,authorization:'REC_AND_DATA_APPROVAL_REQUIRED',
  requirements:['ATOMIC_RECORD_AND_AUDIT','MONOTONIC_REVISION_CAS',
   'IDEMPOTENT_REQUESTS','IMMUTABLE_AUDIT_STREAM','CURSOR_PAGINATION',
   'ROLE_SCOPED_ACCESS','RETENTION_AND_ERASURE_POLICY']});
}
function study1UnifiedStoreHash_(value){
 const text=typeof value==='string'?value:JSON.stringify(value);
 const bytes=Utilities.newBlob(text,'text/plain','study1-hash-input').getBytes();
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)
  .map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');
}
function study1UnifiedStoreInitial_(){
 return {schema:'STUDY1_STORAGE_CONTRACT_V1',mode:'SYNTHETIC_CONTRACT_ONLY',
  revision:0,records:{},requestIndex:{},audit:[],head:'GENESIS'};
}
function study1UnifiedStoreApply_(original,command){
 if(!original||original.schema!=='STUDY1_STORAGE_CONTRACT_V1'||
  original.mode!=='SYNTHETIC_CONTRACT_ONLY'||!Number.isSafeInteger(original.revision)||
  original.revision<0||!original.records||!original.requestIndex||
  !Array.isArray(original.audit)||typeof original.head!=='string')
  throw Error('資料保存契約狀態不合法，拒絕操作');
 // Validate source audit and current row digests BEFORE applying a new update.
 study1UnifiedStoreVerify_(original);
 const c=command;
 if(!c||Object.keys(c).sort().join(',')!=='action,actor,expectedRevision,id,reason,requestId,value'||
  c.action!=='UPSERT'||!['PI','RA'].includes(c.actor)||
  !/^SIM-[A-Z0-9-]{4,64}$/.test(c.id)||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(c.requestId)||
  typeof c.reason!=='string'||c.reason.trim().length<4||c.reason.length>120||
  !c.value||typeof c.value!=='object'||Array.isArray(c.value)||
  // An unconnected contract must not ingest arbitrary contact/identity fields.
  // The marker SYNTHETIC_ONLY alone is not a sufficient data boundary.
  Object.keys(c.value).sort().join(',')!=='id,source,status'||
  !/^[A-Z_]{2,32}$/.test(c.value.status)||
  c.value.id!==c.id||c.value.source!=='SYNTHETIC_ONLY'||
  JSON.stringify(c.value).length>2400||/[<>]/.test(JSON.stringify(c.value)))
  throw Error('資料保存契約只允許具原因的虛構版本化更新');
 const fingerprint=study1UnifiedStoreHash_([c.action,c.id,c.value,c.reason.trim(),c.actor]);
 const previous=original.requestIndex[c.requestId];
 if(previous){
  if(previous.fingerprint!==fingerprint)throw Error('重複請求代碼對應不同內容');
  return {state:original,deduplicated:true};
 }
 if(c.expectedRevision!==original.revision)throw Error('資料版本衝突，請重讀後重新提交');
 if(!Number.isSafeInteger(original.revision+1))throw Error('版本計數已達上限');
 const next=JSON.parse(JSON.stringify(original)),old=next.records[c.id]||null;
 next.records[c.id]=JSON.parse(JSON.stringify(c.value));
 next.revision++;
 const entry={revision:next.revision,at:new Date().toISOString(),
  actor:c.actor,action:c.action,id:c.id,reason:c.reason.trim(),
  beforeHash:old?study1UnifiedStoreHash_(old):null,
  afterHash:study1UnifiedStoreHash_(c.value),
  previousHash:next.head,requestId:c.requestId,
  requestFingerprint:fingerprint};
 entry.digest=study1UnifiedStoreHash_(entry);
 next.audit.push(entry);next.head=entry.digest;
 next.requestIndex[c.requestId]={revision:next.revision,fingerprint};
 study1UnifiedStoreVerify_(next); // reject inconsistent append before return
 return {state:next,deduplicated:false};
}
function study1UnifiedStoreVerify_(state){
 if(!state||state.schema!=='STUDY1_STORAGE_CONTRACT_V1'||state.mode!=='SYNTHETIC_CONTRACT_ONLY'||
   !Array.isArray(state.audit)||!state.requestIndex||!state.records)
  throw Error('稽核契約格式不合法');
 let previous='GENESIS',previousAt='';
 const lastDigestById={};
 for(let i=0;i<state.audit.length;i++){
  const entry=state.audit[i];
  if(!entry||typeof entry!=='object')throw Error('稽核事件格式不合法');
  const copy={...entry};delete copy.digest;
  const request=state.requestIndex[entry.requestId];
  if(entry.revision!==i+1||entry.previousHash!==previous||
     !['PI','RA'].includes(entry.actor)||entry.action!=='UPSERT'||
     !/^SIM-[A-Z0-9-]{4,64}$/.test(entry.id)||
     !/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(entry.requestId)||
     typeof entry.reason!=='string'||entry.reason.trim().length<4||
     entry.reason.length>120||/[<>]/.test(entry.reason)||
     typeof entry.at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.at)||
     Number.isNaN(Date.parse(entry.at))||
     !/^[a-f0-9]{64}$/.test(entry.afterHash)||
     (entry.beforeHash!==null&&!/^[a-f0-9]{64}$/.test(entry.beforeHash))||
     !/^[a-f0-9]{64}$/.test(entry.requestFingerprint)||
     !request||request.revision!==entry.revision||
     request.fingerprint!==entry.requestFingerprint||
     entry.digest!==study1UnifiedStoreHash_(copy))
   throw Error('稽核雜湊鏈、請求指紋或版本不一致');
  const prior=Object.prototype.hasOwnProperty.call(lastDigestById,entry.id)?
   lastDigestById[entry.id]:null;
  if(entry.beforeHash!==prior)throw Error('稽核前態雜湊與前一版本不一致');
  if(entry.at<previousAt)throw Error('稽核事件時間順序倒退，拒絕資料');
  previousAt=entry.at;
  previous=entry.digest;
  lastDigestById[entry.id]=entry.afterHash;
 }
 for(const [id,row] of Object.entries(state.records)){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     Object.keys(row).sort().join(',')!=='id,source,status'||
     !/^[A-Z_]{2,32}$/.test(row.status)||
     row.id!==id||row.source!=='SYNTHETIC_ONLY'||
     lastDigestById[id]!==study1UnifiedStoreHash_(row))
   throw Error('目前資料與最後一筆稽核事件的雜湊不一致');
 }
 if(Object.keys(lastDigestById).length!==Object.keys(state.records).length)
  throw Error('稽核事件對應的資料列缺失');
 if(state.revision!==state.audit.length||state.head!==previous||
    Object.keys(state.requestIndex).length!==state.revision)
  throw Error('稽核事件數量、修訂版本或鏈頭不一致');
 return true;
}
/**
 * Snapshot-based stable pagination for SYNTHETIC records only.
 * A cursor resumes only the exact record set and byte-equivalent values
 * from its first page; version alone is not evidence against silent drift.
 * The digest is an integrity check, NOT an authenticated signature.
 */
function study1UnifiedStorePage_(state,query){
 if(!state||state.schema!=='STUDY1_STORAGE_CONTRACT_V1'||
    state.mode!=='SYNTHETIC_CONTRACT_ONLY'||
    !Number.isSafeInteger(state.revision)||state.revision<0||
    !state.records||typeof state.records!=='object'||Array.isArray(state.records)||
    !query||typeof query!=='object'||Array.isArray(query))
  throw Error('資料分頁契約或快照狀態不合法');
 const queryFields=Object.keys(query).sort().join(',');
 if(!['after,expectedRevision,limit','after,expectedRevision,limit,snapshotHash'].includes(queryFields)||
    query.expectedRevision!==state.revision||!Number.isSafeInteger(query.limit)||
    query.limit<1||query.limit>100||typeof query.after!=='string'||
    query.after.length>100)
  throw Error('資料分頁需要正確的版本、游標及上限');
 const ids=Object.keys(state.records).sort();
 for(const id of ids){
  const row=state.records[id];
  if(!/^SIM-[A-Z0-9-]{4,64}$/.test(id)||
     !row||typeof row!=='object'||Array.isArray(row)||
     row.id!==id||row.source!=='SYNTHETIC_ONLY')
   throw Error('資料分頁只接受完整的虛構資料快照');
  if(Object.keys(row).sort().join(',')!=='id,source,status'||
     typeof row.status!=='string'||!/^[A-Z_]{2,32}$/.test(row.status))
   throw Error('資料分頁包含非已核准欄位，拒絕讀取');
 }
 const snapshotHash=study1UnifiedStoreHash_(
  [state.revision,ids.map(id=>[id,state.records[id]])]);
 if(query.after){
  if(!ids.includes(query.after)||query.snapshotHash!==snapshotHash)
   throw Error('資料分頁快照已漂移或游標失效，請從第一頁重讀');
 }else if('snapshotHash' in query&&query.snapshotHash!==snapshotHash){
  throw Error('資料分頁快照已變更');
 }
 const all=ids.filter(id=>id>query.after),selected=all.slice(0,query.limit);
 return {revision:state.revision,snapshotHash,
  items:selected.map(id=>JSON.parse(JSON.stringify(state.records[id]))),
  nextAfter:all.length>selected.length?selected[selected.length-1]:null};
}


/**
 * B06 owner-only administrative todos in the ORIGINAL Study1 GAS deployment.
 * Separate bounded ScriptProperties key avoids consuming B02-B05's legacy 40
 * transaction slots. It is NOT a separate website or an approved real-data DB.
 */
const STUDY1_B06_TASK_KEY_='STUDY1_B06_TASKS_V1';
function study1B06Initial_(){
 return {schema:'STUDY1_B06_V1',revision:0,next:1,
  tasks:[],audit:[],requests:[],head:'GENESIS'};
}
function study1B06Text_(value,min,max){
 if(typeof value!=='string'||value.trim().length<min||value.length>max||
    /[<>]/.test(value)||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
  throw Error('待辦欄位長度或格式不合法');
 return value.trim();
}
function study1B06Fields_(p,source){
 const keys='assignee,description,dueDate,experiment,reason,relationId,relationType,title';
 if(!p||Object.keys(p).sort().join(',')!==keys)
  throw Error('待辦欄位不完整');
 const title=study1B06Text_(p.title,2,90),
  description=study1B06Text_(p.description,0,350),
  assignee=p.assignee,dueDate=p.dueDate,
  experiment=p.experiment,kind=p.relationType,
  relationId=p.relationId,
  reason=study1B06Text_(p.reason,4,120);
 if(!['','PI','RA'].includes(assignee)||
   !['ALL','E1','E2'].includes(experiment)||
   !['NONE','EXPERIMENT','PARTICIPANT','BOOKING','SESSION'].includes(kind)||
   typeof dueDate!=='string'||(dueDate!==''&&
     (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||
      Number.isNaN(Date.parse(dueDate+'T00:00:00Z'))||
      new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)))
  throw Error('待辦實驗、負責人、關聯或日期格式不合法');
 const refs=source||study1UnifiedInitial_();
 if(kind==='NONE'&&relationId!=='')throw Error('無關聯待辦不得指定參照');
 if(kind==='EXPERIMENT'&&(!['E1','E2'].includes(relationId)||
    ![relationId,'ALL'].includes(experiment)))throw Error('實驗關聯不一致');
 if(kind==='PARTICIPANT'||kind==='BOOKING'){
  const a=refs.applications.find(v=>v.id===relationId);
  if(!a||!/^SIM-\d{3}$/.test(relationId)||
    (kind==='BOOKING'&&!a.slotId))throw Error('待辦關聯的虛構參與者或預約不存在');
  if(![a.experiment,'ALL'].includes(experiment))
   throw Error('待辦關聯的實驗別與虛構參與者不一致');
 }
 if(kind==='SESSION'){
  const slot=refs.slots.find(v=>v.id===relationId);
  if(!slot||![slot.experiment,'ALL'].includes(experiment))
   throw Error('待辦關聯場次不存在或實驗別不一致');
 }
 return {title,description,assignee,dueDate,experiment,
  relationType:kind,relationId,reason};
}
function study1B06Verify_(s){
 if(!s||s.schema!=='STUDY1_B06_V1'||
  !Number.isSafeInteger(s.revision)||s.revision<0||
  !Number.isSafeInteger(s.next)||s.next<1||
  !Array.isArray(s.tasks)||!Array.isArray(s.audit)||
  !Array.isArray(s.requests)||typeof s.head!=='string'||
  s.revision!==s.audit.length||s.revision!==s.requests.length||
  s.revision>200||s.tasks.length>100)
  throw Error('B06待辦儲存版本或格式不一致');
 const ids=new Set(),latest=new Map(),reqIds=new Set();
 const taskShape='archived,assignee,createdAt,description,dueDate,experiment,id,relationId,relationType,status,title,updatedAt';
 for(const t of s.tasks){
  if(!t||Object.keys(t).sort().join(',')!==taskShape||
    !/^SIM-TASK-\d{6}$/.test(t.id)||ids.has(t.id)||
    !['OPEN','DONE'].includes(t.status)||typeof t.archived!=='boolean'||
    !['','PI','RA'].includes(t.assignee)||
    !['ALL','E1','E2'].includes(t.experiment)||
    !['NONE','EXPERIMENT','PARTICIPANT','BOOKING','SESSION'].includes(t.relationType)||
    typeof t.relationId!=='string'||t.relationId.length>30||
    typeof t.title!=='string'||t.title.length>90||
    typeof t.description!=='string'||t.description.length>350||
    typeof t.dueDate!=='string'||t.dueDate.length>10||
    Number.isNaN(Date.parse(t.createdAt))||Number.isNaN(Date.parse(t.updatedAt)))
   throw Error('B06待辦紀錄不合法');
  ids.add(t.id);
 }
 let prev='GENESIS',previousAt='',createdCount=0;
 const lastTaskState=new Map();
 for(let i=0;i<s.audit.length;i++){
  const h=s.audit[i];
  if(!h||typeof h!=='object')throw Error('B06稽核事件格式不合法');
  const copy={...h};delete copy.digest;
  if(!h||h.seq!==i+1||h.prev!==prev||h.actor!=='OWNER'||
     !['CREATE','EDIT','COMPLETE','REOPEN','ARCHIVE','RESTORE'].includes(h.action)||
     !/^SIM-TASK-\d{6}$/.test(h.taskId)||typeof h.reason!=='string'||
     h.reason.length<4||Number.isNaN(Date.parse(h.at))||
     typeof h.requestId!=='string'||reqIds.has(h.requestId)||
     !h.after||h.after.id!==h.taskId||
     (h.before!==null&&h.before.id!==h.taskId)||
     h.digest!==study1UnifiedStoreHash_(copy)||
     !s.requests[i]||s.requests[i].id!==h.requestId||
     !/^[a-f0-9]{64}$/.test(s.requests[i].fingerprint)||
     (h.requestFingerprint!==undefined&&
      h.requestFingerprint!==s.requests[i].fingerprint)||
     !/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(h.requestId))
   throw Error('B06稽核鏈斷裂或紀錄遭修改');
  const beforeHash=h.before===null?null:study1UnifiedStoreHash_(h.before);
  const earlier=lastTaskState.has(h.taskId)?lastTaskState.get(h.taskId):null;
  if(beforeHash!==earlier)throw Error('B06稽核前後態不連續');
  // Verify the entire event history as a real state transition, not merely a rehashed JSON chain.
  if(h.at<previousAt)throw Error('B06稽核事件時間順序倒退');
  previousAt=h.at;
  if(Object.keys(h.after).sort().join(',')!==taskShape||
     (h.before!==null&&Object.keys(h.before).sort().join(',')!==taskShape))
   throw Error('B06歷史快照包含未核准欄位');
  if(h.action==='CREATE'){
   createdCount++;
   if(h.before!==null||h.taskId!=='SIM-TASK-'+String(createdCount).padStart(6,'0')||
      h.after.createdAt!==h.at||h.after.status!=='OPEN'||h.after.archived!==false)
    throw Error('B06建立事件序號或初始狀態不連續');
  }else if(h.before===null||!lastTaskState.has(h.taskId)||
           h.after.createdAt!==h.before.createdAt)
   throw Error('B06非建立事件缺少有效前態');
  if(h.after.updatedAt!==h.at)throw Error('B06稽核事件與資料更新時間不一致');
  if(h.action==='EDIT'&&(h.before.status!==h.after.status||
     h.before.archived!==h.after.archived))
   throw Error('B06編輯不得變更完成或封存狀態');
  if(h.action==='COMPLETE'&&
     (h.before.status!=='OPEN'||h.after.status!=='DONE'||h.before.archived||h.after.archived))
   throw Error('B06完成事件狀態轉移不合法');
  if(h.action==='REOPEN'&&
     (h.before.status!=='DONE'||h.after.status!=='OPEN'||h.before.archived||h.after.archived))
   throw Error('B06重開事件狀態轉移不合法');
  if(h.action==='ARCHIVE'&&(h.before.archived||!h.after.archived||
     h.before.status!==h.after.status))
   throw Error('B06封存事件狀態轉移不合法');
  if(h.action==='RESTORE'&&(!h.before.archived||h.after.archived||
     h.before.status!==h.after.status))
   throw Error('B06還原封存事件狀態轉移不合法');
  reqIds.add(h.requestId);latest.set(h.taskId,study1UnifiedStoreHash_(h.after));
  lastTaskState.set(h.taskId,study1UnifiedStoreHash_(h.after));
  prev=h.digest;
 }
 if(prev!==s.head||ids.size!==latest.size||
   createdCount!==s.tasks.length||s.next!==createdCount+1||
   s.tasks.some(t=>latest.get(t.id)!==study1UnifiedStoreHash_(t))||
   s.requests.some(r=>!r||typeof r.fingerprint!=='string'||
    !/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(r.id)))
  throw Error('B06目前待辦與稽核最後狀態不一致');
 return true;
}
function study1B06Read_(){
 const stored=PropertiesService.getScriptProperties().getProperty(STUDY1_B06_TASK_KEY_);
 if(stored===null)return study1B06Initial_();
 const state=JSON.parse(study1UnifiedStoredDecode_(stored));
 study1B06Verify_(state);
 return state;
}
function study1B06Apply_(state,command,source,now){
 study1B06Verify_(state);
 if(!command||Object.keys(command).sort().join(',')!=='action,expectedRevision,payload,requestId'||
   !['CREATE','EDIT','COMPLETE','REOPEN','ARCHIVE','RESTORE'].includes(command.action)||
   !/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(command.requestId)||
   !command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))
  throw Error('B06人工指令格式不合法');
 const fingerprint=study1UnifiedStoreHash_([command.action,command.payload]);
 const match=state.requests.find(r=>r.id===command.requestId);
 if(match){
  if(match.fingerprint!==fingerprint)throw Error('同一B06請求識別碼對應不同操作');
  return {state,deduplicated:true};
 }
 if(command.expectedRevision!==state.revision)
  throw Error('B06版本已變更，請重讀後再操作');
 if(state.revision>=200)throw Error('B06隔離儲存交易上限，未修改既有資料');
 const s=JSON.parse(JSON.stringify(state));
 const action=command.action,p=command.payload;
 let task,previous=null,reason;
 // Event timestamps remain monotonic even if host clock is adjusted backwards.
 const at=new Date(Math.max(now,state.audit.length?
  Date.parse(state.audit[state.audit.length-1].at):0)).toISOString();
 if(action==='CREATE'||action==='EDIT'){
  const payload=action==='EDIT'?p.data:p;
  if(action==='EDIT'&&Object.keys(p).sort().join(',')!=='data,id')
   throw Error('B06編輯格式不合法');
  const fields=study1B06Fields_(payload,source);
  reason=fields.reason;
  if(action==='CREATE'){
   if(s.tasks.length>=100)throw Error('B06隔離儲存筆數上限，未更動資料');
   task={id:'SIM-TASK-'+String(s.next++).padStart(6,'0'),
    ...fields,createdAt:at,updatedAt:at,status:'OPEN',archived:false};
   delete task.reason;s.tasks.push(task);
  }else{
   task=s.tasks.find(t=>t.id===p.id);
   if(!task||task.archived)throw Error('待辦不存在或已封存，不可編輯');
   previous=JSON.parse(JSON.stringify(task));
   Object.assign(task,fields,{updatedAt:at});delete task.reason;
   if(JSON.stringify(previous)===JSON.stringify(task))throw Error('待辦資料未變更');
  }
 }else{
  if(Object.keys(p).sort().join(',')!=='id,reason')
   throw Error('B06狀態操作缺少原因或待辦代碼');
  reason=study1B06Text_(p.reason,4,120);
  task=s.tasks.find(t=>t.id===p.id);
  if(!task)throw Error('指定的人工待辦不存在');
  previous=JSON.parse(JSON.stringify(task));
  if(action==='COMPLETE'){
   if(task.archived||task.status!=='OPEN')throw Error('僅未封存且未完成的待辦可勾選完成');
   task.status='DONE';
  }else if(action==='REOPEN'){
   if(task.archived||task.status!=='DONE')throw Error('僅未封存且已完成的待辦可重新開啟');
   task.status='OPEN';
  }else if(action==='ARCHIVE'){
   if(task.archived)throw Error('此待辦已封存');
   task.archived=true;
  }else if(action==='RESTORE'){
   if(!task.archived)throw Error('此待辦尚未封存');
   task.archived=false;
  }
  task.updatedAt=at;
 }
 s.revision++;
 const h={seq:s.revision,taskId:task.id,action,actor:'OWNER',at,
  requestId:command.requestId,requestFingerprint:fingerprint,reason,before:previous,
  after:JSON.parse(JSON.stringify(task)),prev:s.head};
 h.digest=study1UnifiedStoreHash_(h);
 s.audit.push(h);s.head=h.digest;
 s.requests.push({id:command.requestId,fingerprint});
 study1B06Verify_(s);
 return {state:s,deduplicated:false};
}
/**
 * Restore only a byte-exact value written by this transaction, under ScriptLock.
 * If a noncooperating writer changed the property, DO NOT erase their bytes.
 * ScriptLock does not give isolation against writers ignoring that lock.
 */
function study1UnifiedRestoreOwnedWrite_(props,key,before,attempted){
 const observed=props.getProperty(key);
 if(observed===before)return true;
 if(observed!==attempted)
  throw Error('資料遭非本次寫入者變更，禁止覆蓋恢復');
 if(before===null)props.deleteProperty(key);
 else props.setProperty(key,before);
 if(props.getProperty(key)!==before)
  throw Error('原始資料恢復後回讀失敗');
 return true;
}

/* B01: strictly non-sensitive OWNER-only preference; no subject IDs, amounts,
 * analytics, names, roles, formal permissions or payments. */
function study1B01LayoutInitial_(){
 return {schema:'STUDY1_B01_LAYOUT_V1',revision:0,
  order:STUDY1_B01_LAYOUT_IDS_.slice(),hidden:[],
  lastRequestId:'',fingerprint:''};
}
function study1B01LayoutVerify_(s){
 const ids=STUDY1_B01_LAYOUT_IDS_;
 if(!s||typeof s!=='object'||Array.isArray(s)||
  Object.keys(s).sort().join(',')!=='fingerprint,hidden,lastRequestId,order,revision,schema'||
  s.schema!=='STUDY1_B01_LAYOUT_V1'||!Number.isSafeInteger(s.revision)||s.revision<0||
  !Array.isArray(s.order)||s.order.length!==13||
  new Set(s.order).size!==13||s.order.some(id=>!ids.includes(id))||
  !Array.isArray(s.hidden)||s.hidden.length>13||
  new Set(s.hidden).size!==s.hidden.length||
  s.hidden.some((id,i)=>!ids.includes(id)||(i>0&&ids.indexOf(id)<=ids.indexOf(s.hidden[i-1])))||
  typeof s.lastRequestId!=='string'||typeof s.fingerprint!=='string'||
  (s.revision===0&&(s.lastRequestId!==''||s.fingerprint!==''))||
  (s.revision>0&&(!/^REQ-SIM-B01_[A-Za-z0-9_-]{8,48}$/.test(s.lastRequestId)||
   s.fingerprint!==JSON.stringify([s.order,s.hidden]))))
  throw Error('B01偏好來源版本、欄位或固定卡片識別碼不合法');
 return true;
}
function study1B01LayoutRead_(){
 const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_B01_LAYOUT_KEY_);
 const state=raw===null?study1B01LayoutInitial_():JSON.parse(raw);
 study1B01LayoutVerify_(state);return state;
}
function study1B01LayoutView_(state,deduplicated){
 return {mode:'TEST_LAYOUT_ONLY',revision:state.revision,
  order:state.order.slice(),hidden:state.hidden.slice(),
  deduplicated:deduplicated===true};
}
/** GET under original GAS OWNER identity, CLOSED flags and ScriptLock. */
function study1UnifiedB01LayoutGet(){
 study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_READ');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('B01偏好讀取鎖定中');
 try{
  study1SandboxBookingFlags_();
  const props=PropertiesService.getScriptProperties();
  const before=props.getProperty(STUDY1_B01_LAYOUT_KEY_);
  const state=study1B01LayoutRead_();
  if(props.getProperty(STUDY1_B01_LAYOUT_KEY_)!==before)
   throw Error('B01偏好讀取發生競寫，拒絕回傳');
  return study1B01LayoutView_(state,false);
 }finally{lock.releaseLock();}
}
/** SAVE requires an explicit expectedRevision and a single request identity. */
function study1UnifiedB01LayoutSave(command){
 study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_WRITE');
 if(!command||typeof command!=='object'||Array.isArray(command)||
  Object.keys(command).sort().join(',')!=='expectedRevision,hidden,order,requestId'||
  !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
  !/^REQ-SIM-B01_[A-Za-z0-9_-]{8,48}$/.test(command.requestId)||
  !Array.isArray(command.order)||!Array.isArray(command.hidden))
  throw Error('B01僅允許不含個資的排序與顯示偏好');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('B01偏好有其他管理操作，請重新載入');
 try{
  study1SandboxBookingFlags_();
  const props=PropertiesService.getScriptProperties();
  const before=props.getProperty(STUDY1_B01_LAYOUT_KEY_);
  const state=study1B01LayoutRead_();
  if(props.getProperty(STUDY1_B01_LAYOUT_KEY_)!==before)
   throw Error('B01偏好讀取期間發生競寫');
  const fingerprint=JSON.stringify([command.order,command.hidden]);
  if(state.lastRequestId===command.requestId){
   if(fingerprint!==state.fingerprint)throw Error('B01相同請求識別碼不可換操作');
   return study1B01LayoutView_(state,true);
  }
  if(state.revision!==command.expectedRevision)
   throw Error('B01偏好版本已變更，請回讀後重新修改');
  const next={schema:'STUDY1_B01_LAYOUT_V1',revision:state.revision+1,
   order:command.order.slice(),hidden:command.hidden.slice(),
   lastRequestId:command.requestId,fingerprint};
  study1B01LayoutVerify_(next);
  if(state.order.join('|')===next.order.join('|')&&
     state.hidden.join('|')===next.hidden.join('|'))
   throw Error('B01偏好沒有修改，不新增重複寫入');
  const raw=JSON.stringify(next);
  if(study1UnifiedUtf8Bytes_(raw)>2000)
   throw Error('B01偏好超過非敏感欄位安全容量');
  if(props.getProperty(STUDY1_B01_LAYOUT_KEY_)!==before)
   throw Error('B01偏好競寫，不覆寫其他管理頁');
  try{
   props.setProperty(STUDY1_B01_LAYOUT_KEY_,raw);
   if(props.getProperty(STUDY1_B01_LAYOUT_KEY_)!==raw)
    throw Error('B01偏好寫入回讀不一致');
   const verified=study1B01LayoutRead_();
   if(verified.revision!==next.revision||verified.fingerprint!==next.fingerprint)
    throw Error('B01偏好寫後內容不一致');
  }catch(error){
   try{
    study1UnifiedRestoreOwnedWrite_(props,STUDY1_B01_LAYOUT_KEY_,before,raw);
   }catch(recovery){throw Error('B01偏好寫入狀態不明或競寫，已鎖定操作');}
   throw Error('B01偏好未完成寫入，已安全恢復：'+String(error.message||error));
  }
  return study1B01LayoutView_(next,false);
 }finally{lock.releaseLock();}
}

/* The only B06 entrypoint; available to the SAME authorized GAS owner only. */
function study1UnifiedB06Command(command){
 study1UnifiedAssertOwner_();
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('其他研究管理操作進行中，請重新載入');
 try{
  study1SandboxBookingFlags_();
  const props=PropertiesService.getScriptProperties();
  const initial=props.getProperty(STUDY1_B06_TASK_KEY_);
  const state=study1B06Read_();
  if(props.getProperty(STUDY1_B06_TASK_KEY_)!==initial)
   throw Error('B06資料讀取時發生競寫');
  const applied=study1B06Apply_(state,command,study1UnifiedRead_(),Date.now());
  if(applied.deduplicated)return {...study1UnifiedView_(study1UnifiedRead_()),deduplicated:true};
  const raw=JSON.stringify(applied.state),packed=study1UnifiedStoredEncode_(raw);
  if(props.getProperty(STUDY1_B06_TASK_KEY_)!==initial)
   throw Error('B06資料已被其他寫入者更新，拒絕覆寫');
  try{
   props.setProperty(STUDY1_B06_TASK_KEY_,packed);
   const check=props.getProperty(STUDY1_B06_TASK_KEY_);
   if(check!==packed||study1UnifiedStoredDecode_(check)!==raw)
    throw Error('B06寫後回讀失敗');
  }catch(error){
   try{
    study1UnifiedRestoreOwnedWrite_(props,STUDY1_B06_TASK_KEY_,initial,packed);
   }catch(recover){throw Error('B06資料寫入狀態不明或發生競寫；請由管理者核對');}
   throw Error('B06儲存未完成，已恢復原資料（或資料未變更）：'+String(error.message||error));
  }
  return {...study1UnifiedView_(study1UnifiedRead_()),deduplicated:false};
 }catch(error){
  study1B12FailureDiagnostic_('B06',error);
  throw error;
 }finally{lock.releaseLock();}
}

/**
 * B12: read-only audit projection on top of EXISTING synthetic fixture and B06
 * history. No additional ScriptProperties key, migration or real data adapter.
 * B06 has a SHA chain; legacy B02/B04/B05 have bounded, non-chained history.
 * A simulated failed notification is a CURRENT STATUS SNAPSHOT, never a
 * fabricated historical audit event.
 */
function study1B12AuditBuild_(fixture,b06){
 study1B06Verify_(b06);
 if(!fixture||!Number.isSafeInteger(fixture.revision)||fixture.revision<0||
    !fixture.b02||!Array.isArray(fixture.b02.history)||
    fixture.b02.history.length>12||
    !fixture.b04||!Array.isArray(fixture.b04.history)||
    !fixture.b05||!Array.isArray(fixture.b05.history)||
    !Array.isArray(fixture.notifications))
  throw Error('B12虛構稽核來源格式不合法');
 study1B07PendingSummary_(fixture); // fail closed on forged B07 source
  const waitlistSummary=study1WaitlistSummary_(fixture); // same original synthetic fixture
 const postCancelSummary=study1PostCancelSummary_(fixture);
 const events=[],b04Last=new Map(),b05Last=new Map();
 // B02 has only a 12-entry event-only ring; its absence is not evidence of
 // missing committed state or proof of corruption. Never fabricate a diff.
 for(let i=0;i<fixture.b02.history.length;i++){
  const h=fixture.b02.history[i],slotAction=['CREATE','UPDATE','CANCEL',
   'ADMIN_CLOSE','ADMIN_REOPEN'].includes(h?.action);
  if(!h||typeof h.at!=='string'||Number.isNaN(Date.parse(h.at))||
     new Date(h.at).toISOString()!==h.at||
     !['CREATE','UPDATE','CANCEL','ATTEND','ADMIN_CLOSE','ADMIN_REOPEN'].includes(h.action)||
     !Array.isArray(h.ids)||!h.ids.length||h.ids.length>8||
     h.ids.some(id=>typeof id!=='string'||
       !(slotAction?/^SIM-SLOT-E[12]-[A-Z]$/:/^SIM-\d{3}$/).test(id))||
     (['ATTEND','ADMIN_CLOSE','ADMIN_REOPEN'].includes(h.action)&&h.ids.length!==1))
   throw Error('B12行事曆有限歷程動作、代碼或時間不一致');
  events.push({id:'B02-'+String(i+1).padStart(6,'0'),module:'B02',
   actor:'OWNER',at:h.at,action:h.action,target:h.ids.join(', '),
   before:null,after:{affectedIds:h.ids.slice()},
   reason:'原B02僅保存操作類型、虛構代碼與時間；無前後值可供重建',
   result:'SUCCESS',provenance:'BOUNDED_EVENT_ONLY',historical:true});
 }
 let b06At='';
 for(const h of b06.audit){
  if(h.at<b06At||(h.action==='CREATE'&&h.before!==null)||
     (h.action!=='CREATE'&&h.before===null)||
     !h.after||h.after.updatedAt!==h.at)
   throw Error('B12待辦歷史時間、前後值或操作類型不一致');
  b06At=h.at;
  events.push({id:'B06-'+String(h.seq).padStart(6,'0'),module:'B06',
   actor:'OWNER',at:h.at,action:h.action,target:h.taskId,
   before:h.before,after:h.after,reason:h.reason,result:'SUCCESS',
   provenance:'SHA256_CHAIN_VERIFIED',historical:true});
 }
 for(let i=0;i<fixture.b04.history.length;i++){
  const h=fixture.b04.history[i];
  if(!h||!['adminNote','attendanceAndProgress'].includes(h.field)||
     !/^SIM-\d{3}$/.test(h.id)||h.actor!=='OWNER'||
     typeof h.before!=='string'||typeof h.after!=='string'||
     typeof h.reason!=='string'||Number.isNaN(Date.parse(h.at)))
   throw Error('B12近期參與者歷程格式不一致');
  const key=h.id+'|'+h.field;
  if(b04Last.has(key)&&b04Last.get(key)!==h.before)
   throw Error('B12近期參與者前後值不連續');
  b04Last.set(key,h.after);
  events.push({id:'B04-'+String(i+1).padStart(6,'0'),module:'B04',
   actor:'OWNER',at:h.at,action:h.field,target:h.id,
   before:h.before,after:h.after,reason:h.reason,result:'SUCCESS',
   provenance:'BOUNDED_LEGACY_HISTORY',historical:true});
 }
 for(const [key,after] of b04Last){
  const [id,field]=key.split('|'),current=field==='adminNote'?
   (fixture.b04.notes[id]||''):(()=>{
    const a=fixture.b02&&fixture.b02.attendance&&fixture.b02.attendance[id];
    return a?a.attendance+' / '+a.progress+(a.note?' / '+a.note:''):
     'PENDING / NOT_STARTED';
   })();
  if(current!==after)throw Error('B12近期參與者最後前後值與目前資料不符');
 }
 for(let i=0;i<fixture.b05.history.length;i++){
  const h=fixture.b05.history[i];
  if(!h||!['CLOSE','REOPEN'].includes(h.action)||h.actor!=='OWNER'||
     !/^SIM-SLOT-E[12]-[A-Z]$/.test(h.slotId)||
     !['OPEN','CLOSED'].includes(h.before)||
     !['OPEN','CLOSED'].includes(h.after)||
     (h.action==='CLOSE'&&!(h.before==='OPEN'&&h.after==='CLOSED'))||
     (h.action==='REOPEN'&&!(h.before==='CLOSED'&&h.after==='OPEN'))||
     Number.isNaN(Date.parse(h.at)))
   throw Error('B12近期場次結案歷程格式或狀態不一致');
  if(b05Last.has(h.slotId)&&b05Last.get(h.slotId)!==h.before)
   throw Error('B12近期場次前後值不連續');
  b05Last.set(h.slotId,h.after);
  events.push({id:'B05-'+String(i+1).padStart(6,'0'),module:'B05',
   actor:'OWNER',at:h.at,action:h.action,target:h.slotId,
   before:h.before,after:h.after,reason:h.reason,result:'SUCCESS',
   provenance:'BOUNDED_LEGACY_HISTORY',historical:true});
 }
 for(const [id,after] of b05Last){
  const current=fixture.b02&&fixture.b02.sessions&&fixture.b02.sessions[id];
  if((current?current.status:'OPEN')!==after)
   throw Error('B12近期場次最後前後值與目前資料不符');
 }
 // B07: bounded before/after TEST corrections, never fabricated payments.
 for(let i=0;i<fixture.b07.itemHistory.length;i++){
  const h=fixture.b07.itemHistory[i];
  events.push({id:'B07-'+String(i+1).padStart(6,'0'),module:'B07',
   actor:'OWNER',at:h.at,action:'ADMIN_B07_ITEM_REVIEW',target:h.id+':'+h.stage,
   before:{stage:h.stage,status:h.from},after:{stage:h.stage,status:h.to},
   reason:h.reason,result:'SUCCESS',provenance:'BOUNDED_PENDING_HISTORY',historical:true});
 }
   // B12 has no append-only waitlist event table: expose each retained current
  // state as a non-historical snapshot, never manufacture JOIN/OFFER/EXPIRY events.
  for(const e of fixture.waitlist.entries){
   const slot=waitlistSummary.bySlot.find(x=>x.slotId===e.slotId);
   if(!slot||slot.experiment!==e.experiment)
    throw Error('B12候補原場次、研究階段來源不一致');
   events.push({id:'WAITLIST-SNAPSHOT-'+String(e.seq).padStart(6,'0'),
    module:'WAITLIST',actor:'SYSTEM_TEST_SNAPSHOT',at:null,
    action:e.status,target:e.id,before:null,
    after:{experiment:e.experiment,slotId:e.slotId,stage:slot.stage,
     status:e.status,seq:e.seq,offeredAt:e.offeredAt,expiresAt:e.expiresAt,
     closedAt:e.closedAt},
    reason:'目前候補狀態的有限TEST快照；不是原始操作事件，不能重建完整加入／邀請／結案歷程',
    result:'CURRENT_SNAPSHOT',provenance:'CURRENT_TEST_WAITLIST_ONLY',historical:false});
  }
 for(let i=0;i<fixture.notifications.length;i++){
  const n=fixture.notifications[i];
  if(n&&n.status==='SIM_FAILED'){
   if(!/^SIM-\d{3}$/.test(n.id)||n.lastError!=='SIMULATED_FAILURE')
    throw Error('B12虛構失敗狀態資料不合法');
   events.push({id:'B08-SNAPSHOT-'+String(i+1).padStart(6,'0'),
    module:'B08',actor:'OWNER',at:null,action:'SIM_NOTIFY_FAILURE',
    target:n.id,before:null,after:{status:n.status,attempts:n.attempts},
    reason:'虛構通知失敗的目前狀態；不是歷史事件',
    result:'SIM_FAILED_SNAPSHOT',provenance:'CURRENT_SNAPSHOT_ONLY',historical:false});
  }
 }
 return events.sort((a,b)=>(a.at||'9999').localeCompare(b.at||'9999')||
  a.id.localeCompare(b.id));
}
function study1B12AuditPage_(fixture,b06,query){
 if(!query||typeof query!=='object'||Array.isArray(query)||
    !['after,expectedB06Revision,expectedFixtureRevision,limit,module,result,search,snapshotHash',
      'after,expectedB06Revision,expectedFixtureRevision,limit,module,result,search,snapshotHash,sort']
      .includes(Object.keys(query).sort().join(','))||
    query.expectedB06Revision!==b06.revision||
    query.expectedFixtureRevision!==fixture.revision||
    !Number.isSafeInteger(query.limit)||query.limit<1||query.limit>30||
    !['ALL','B02','B04','B05','B06','B07','B08','WAITLIST'].includes(query.module)||
    !['ALL','SUCCESS','SIM_FAILED_SNAPSHOT','CURRENT_SNAPSHOT'].includes(query.result)||
    !(query.sort===undefined||['ASC','DESC'].includes(query.sort))||
    typeof query.search!=='string'||query.search.length>60||
    /[<>\u0000-\u001f]/.test(query.search)||
    typeof query.after!=='string'||query.after.length>40||
    typeof query.snapshotHash!=='string')
  throw Error('B12稽核查詢、版本或分頁參數不合法');
 const all=study1B12AuditBuild_(fixture,b06);
 const b07Summary=study1B07PendingSummary_(fixture);
  const waitlistSummary=study1WaitlistSummary_(fixture);
 const postCancelSummary=study1PostCancelSummary_(fixture);
 // Cross-module mirrors are a consistency signal, not a complete ledger.
 // A missing mirror may mean old entries were trimmed by different ring caps.
 const b02=fixture.b02.history,b04=fixture.b04.history,b05=fixture.b05.history;
 const mirrorAction=h=>h.action==='CLOSE'?'ADMIN_CLOSE':'ADMIN_REOPEN';
 const sameSlot=(h,id,at)=>h.at===at&&h.ids.includes(id);
 // Conflicting action in a retained matching slot/time pair is a provable
 // contradiction. Absence of a counterpart is NOT (legacy truncation).
 for(const h of b05){
  const paired=b02.filter(e=>['ADMIN_CLOSE','ADMIN_REOPEN'].includes(e.action)&&
    sameSlot(e,h.slotId,h.at));
  if(paired.length&&!paired.some(e=>e.action===mirrorAction(h)))
   throw Error('B12 B02／B05 同時點操作類型互相矛盾，拒絕查詢');
 }
 for(const h of b02.filter(e=>['ADMIN_CLOSE','ADMIN_REOPEN'].includes(e.action))){
  const paired=b05.filter(e=>e.slotId===h.ids[0]&&e.at===h.at);
  if(paired.length&&!paired.some(e=>mirrorAction(e)===h.action))
   throw Error('B12 B02／B05 原場次稽核鏡像互相矛盾，拒絕查詢');
 }
 const check={b02B05Matched:0,b02B05NoMirror:0,
  b05B02NoMirror:0,b04AttendanceB02NoMirror:0,b02AttendanceNotProvable:0};
 for(const h of b02){
  if(['ADMIN_CLOSE','ADMIN_REOPEN'].includes(h.action)){
   if(b05.some(e=>e.slotId===h.ids[0]&&e.at===h.at&&mirrorAction(e)===h.action))
    check.b02B05Matched++;
   else check.b02B05NoMirror++;
  }else if(h.action==='ATTEND'){
   if(!b04.some(e=>e.field==='attendanceAndProgress'&&
      e.id===h.ids[0]&&e.at===h.at))check.b02AttendanceNotProvable++;
  }
 }
 for(const h of b05){
  if(!b02.some(e=>e.at===h.at&&e.action===mirrorAction(h)&&
    e.ids.includes(h.slotId)))check.b05B02NoMirror++;
 }
 for(const h of b04.filter(e=>e.field==='attendanceAndProgress')){
  if(!b02.some(e=>e.action==='ATTEND'&&e.at===h.at&&e.ids.includes(h.id)))
   check.b04AttendanceB02NoMirror++;
 }
 const warnings=[{code:'WAITLIST_CURRENT_ONLY',severity:'LIMITED',
   text:'候補僅保存每筆目前狀態與部分時間欄位；沒有逐筆不可改寫的加入/遞補操作事件，不能將快照冒充歷史稽核'},
   {code:'BOUNDED_NOT_FULL',severity:'INFO',
  text:'B02／B04／B05是有限近期歷程，沒有完整交易稽核鏈；未出現某筆不代表該操作從未發生'}];
 if(b02.length===12)warnings.push({code:'B02_CAP',severity:'LIMITED',
  text:'B02已達12筆保留上限，更早的操作可能已被環狀截斷'});
 if(b04.length===30)warnings.push({code:'B04_CAP',severity:'LIMITED',
  text:'B04已達30筆保留上限，更早的前後值可能已截斷'});
 if(b05.length===32)warnings.push({code:'B05_CAP',severity:'LIMITED',
  text:'B05已達32筆保留上限，更早的結案紀錄可能已截斷'});
 if(fixture.b07.itemHistory.length===32)warnings.push({code:'B07_CAP',severity:'LIMITED',
  text:'B07已達32筆保留上限，更早的TEST更正可能已截斷'});
 const noMirror=check.b02B05NoMirror+check.b05B02NoMirror+
  check.b04AttendanceB02NoMirror;
 if(noMirror)warnings.push({code:'MIRROR_NOT_FOUND',severity:'REVIEW',
  text:'跨B02／B04／B05部分保留歷程無法找到對照事件（'+noMirror+
   '處）；可能為舊版或截斷紀錄，請人工比對，不能直接認定遺失或遭修改'});
 if(check.b02AttendanceNotProvable)warnings.push({
  code:'ATTEND_NO_CHANGE_UNPROVABLE',severity:'LIMITED',
  text:'有'+check.b02AttendanceNotProvable+
   '筆B02出席操作無同時點B04更動；原系統未改值時不寫B04歷程，不能判為遺漏'});
 const coverage={scope:'BOUNDED_SYNTHETIC_SNAPSHOT',complete:false,
  sources:[{module:'B02',retained:b02.length,limit:12,provenance:'BOUNDED_EVENT_ONLY'},
   {module:'B04',retained:b04.length,limit:30,provenance:'BOUNDED_LEGACY_HISTORY'},
   {module:'B05',retained:b05.length,limit:32,provenance:'BOUNDED_LEGACY_HISTORY'},
   {module:'B06',retained:b06.audit.length,limit:200,provenance:'SHA256_CHAIN_VERIFIED'},
   {module:'B07',retained:fixture.b07.itemHistory.length,limit:32,
    provenance:'BOUNDED_PENDING_HISTORY'},
   {module:'WAITLIST',retained:fixture.waitlist.entries.length,limit:8,
    provenance:'CURRENT_TEST_WAITLIST_ONLY'}],
  b07Summary,waitlistSummary,postCancelSummary,crossChecks:check,warnings};
 const direction=query.sort===undefined?'ASC':query.sort; // legacy cursors remain ASC
 const q=query.search.trim().toLowerCase();
 const filtered=all.filter(e=>
  (query.module==='ALL'||e.module===query.module)&&
  (query.result==='ALL'||e.result===query.result)&&
  (!q||[e.id,e.module,e.action,e.target,e.reason,e.result].join(' ').toLowerCase().includes(q)));
 // Source event ids remain stable; reverse chronological order for the new
 // UI must be tied to its own snapshot so a cursor cannot cross directions.
 if(direction==='DESC')filtered.reverse();
 const snapshotHash=study1UnifiedStoreHash_([
  fixture.revision,b06.revision,b06.head,query.module,query.result,q,direction,all,coverage]);
 let start=0;
 if(query.after){
  if(query.snapshotHash!==snapshotHash)
   throw Error('B12稽核快照已變更，必須從第一頁重查');
  const idx=filtered.findIndex(e=>e.id===query.after);
  if(idx<0)throw Error('B12稽核游標不存在或已失效');
  start=idx+1;
 }else if(query.snapshotHash&&query.snapshotHash!==snapshotHash)
  throw Error('B12稽核快照已變更');
 const selected=filtered.slice(start,start+query.limit);
 return {mode:'SYNTHETIC_AUDIT_ONLY',formalExport:false,
  completeImmutableArchive:false,b06ChainVerified:true,
  legacyHistoryBounded:true,fixtureRevision:fixture.revision,
  b06Revision:b06.revision,snapshotHash,coverage,total:filtered.length,
  items:JSON.parse(JSON.stringify(selected)),
  nextAfter:start+selected.length<filtered.length?
   selected[selected.length-1].id:null};
}
/* The only B12 read endpoint is the SAME private original GAS site. */
function study1UnifiedB12AuditPage(query){
 study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_READ');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('B12稽核讀取鎖定中');
 try{
  study1SandboxBookingFlags_();
  const props=PropertiesService.getScriptProperties();
  const fBytes=props.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
  const bBytes=props.getProperty(STUDY1_B06_TASK_KEY_);
  const fixture=study1UnifiedRead_(),b06=study1B06Read_();
  const result=study1B12AuditPage_(fixture,b06,query);
  if(props.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_)!==fBytes||
     props.getProperty(STUDY1_B06_TASK_KEY_)!==bBytes)
   throw Error('B12稽核讀取過程發現競寫，已拒絕回傳');
  return result;
 }finally{lock.releaseLock();}
}
/* No CSV, audit download or role self-service is approved. */
function study1UnifiedB12Export_(){
 study1UnifiedRoleAuthorise_('OWNER','EXPORT_AUDIT');
 throw Error('B12正式或測試稽核匯出未獲授權');
}
/**
 * Rejection diagnostics contain no request payload, participant content,
 * reason text, OTP, or personal identifiers. Execution log ONLY; not B12
 * permanent storage and never reported as successfully committed history.
 */
function study1B12FailureDiagnostic_(module,error){
 if(!['B06','UNIFIED'].includes(module))
  throw Error('B12異常模組未核准');
 const msg=String(error&&error.message||'');
 const code=/狀態不明|恢復|回復失敗/.test(msg)?'UNCERTAIN_WRITE':
  /競寫|版本|請求識別碼/.test(msg)?'CONFLICT':
  /容量|上限/.test(msg)?'LIMIT_REJECTED':'INVALID_REJECTED';
 const event={schema:'STUDY1_B12_DIAGNOSTIC_V1',mode:'SYNTHETIC_ONLY',
  module,code,result:'REJECTED',persistedInB12:false};
 if(typeof console!=='undefined'&&typeof console.warn==='function')
  console.warn('STUDY1_B12_REJECTION '+JSON.stringify(event));
 return event;
}

/**
 * Byte-verified one-page synthetic PDF. It is NOT an REC consent document.
 * The actual approved REC PDF bytes are absent and remain inaccessible.
 */
function study1UnifiedPdfFixture_(){
 const base64='JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1MDAgMjIwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2NiA+PgpzdHJlYW0KQlQgL0YxIDE1IFRmIDQwIDE1MCBUZCAoVEVTVCBQREYgLSBOT1QgUkVDIC0gU1lOVEhFVElDIE9OTFkpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0NyAwMDAwMCBuIAowMDAwMDAwMzYzIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDMzCiUlRU9G';
 const bytes=Utilities.base64Decode(base64);
 if(bytes.length!==615)throw Error('虛構 PDF 位元組長度不符');
 const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)
  .map(x=>(x<0?x+256:x).toString(16).padStart(2,'0')).join('');
 if(hash!=='82e8b20b8d0849f5482a94f1f8adf1e3c3bf1d41b45c33ab48dbd4481fe72ad1')throw Error('虛構 PDF SHA-256 驗證失敗');
 return {kind:'SIMULATED_PDF_NOT_REC',mime:'application/pdf',bytes:615,
  sha256:hash,base64,approved:false,title:'TEST PDF - NOT REC - SYNTHETIC ONLY'};
}
/** No formal retention/permission is authorized by the simulated governance. */
/**
 * Formal activation evidence inventory. This is a read-only specification
 * checklist, NOT an approval engine: self-declared hashes or TEST metadata
 * cannot satisfy a source-byte, REC, retention or identity gate.
 * Every future production port remains separately FORMAL_BLOCKED.
 */

/** E2 eight-week OPERATIONS planning, not a REC-approved intervention schedule.
 * Each row is a planning week, not a claim that one weekly class is sufficient.
 * Dates and location notes are optional and TEST-only. Never assign participants.
 */
function study1UnifiedE2Weeks_(){
 return Array.from({length:8},(_,i)=>({week:i+1,date:null,notes:''}));
}
function study1UnifiedValidateE2Weeks_(weeks){
 if(!Array.isArray(weeks)||weeks.length!==8)throw Error('實驗二須保留完整八週測試規劃');
 let previous='';
 weeks.forEach((w,i)=>{
  if(!w||typeof w!=='object'||Array.isArray(w)||
     Object.keys(w).sort().join(',')!=='date,notes,week'||w.week!==i+1||
     typeof w.notes!=='string'||w.notes.length>100||/[<>]/.test(w.notes)||
     !(w.date===null||typeof w.date==='string'))
    throw Error('八週測試時程格式錯誤：'+(i+1));
  if(w.date!==null){
   if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(w.date)||
      Number.isNaN(Date.parse(w.date+'T00:00:00Z'))||
      new Date(w.date+'T00:00:00Z').toISOString().slice(0,10)!==w.date||
      (previous&&w.date<=previous))
     throw Error('八週日期無效或順序重複：'+(i+1));
   previous=w.date;
  }
 });
 return true;
}
/** Explicit role, evidence and port contracts. This does NOT grant any role
 * or invoke a real storage/mail/REC connector; adapters remain denied.
 */
function study1UnifiedFormalPorts_(){
 const ports=[
  {name:'IDENTITY_VERIFY',state:'BLOCKED',needs:'核准身分及最小角色權限'},
  {name:'OTP_SEND_REAL',state:'BLOCKED',needs:'正式寄信授權、個資欄位及節流政策'},
  {name:'OTP_VERIFY_REAL',state:'BLOCKED',needs:'一次性驗證狀態與安全儲存核准'},
  {name:'BOOKING_RESERVE',state:'BLOCKED',needs:'正式資料庫 schema、鎖及交易回讀'},
  {name:'BOOKING_MOVE_CANCEL',state:'BLOCKED',needs:'正式歷程、稽核與通知政策'},
  {name:'E2_EIGHT_WEEK_OPERATIONS',state:'BLOCKED',needs:'分組、團課／居家安排及出缺席政策核准'},
  {name:'CONSENT_PDF_READ',state:'BLOCKED',needs:'原 REC 核准 PDF 位元組、版本及 SHA256'},
  {name:'CONSENT_SIGN',state:'BLOCKED',needs:'簽署資格、研究人員預簽、時間戳與證據保存'},
  {name:'NOTIFICATION_DISPATCH',state:'BLOCKED',needs:'核准郵件來源、模板及去重通知 outbox'},
  {name:'SUBJECT_DATA_ACCESS',state:'BLOCKED',needs:'角色授權、留存、撤回、刪除與稽核證據'}
 ];
 return {mode:'FORMAL_BLOCKED',activated:false,publicIntake:false,
  roles:{PI:'PENDING_APPROVAL',RESEARCH_COORDINATOR:'PENDING_APPROVAL',
   PARTICIPANT:'PENDING_APPROVAL',AUDITOR:'PENDING_APPROVAL'},
  ports,authorization:'EXTERNAL_APPROVAL_REQUIRED',
  pdf:{sourceBytesVerified:false,recApproved:false,signatureEnabled:false},
  otp:{realDelivery:false},booking:{formalWrites:false},
  notification:{realDelivery:false},retention:{policy:'PENDING'}};
}

function study1UnifiedFormalReadiness_(s){
 const gates=[
  {id:'REC_PROTOCOL_APPROVAL',state:'PENDING',reason:'須核對研究倫理審查核准內容與生效版本'},
  {id:'DATA_RETENTION_APPROVAL',state:'PENDING',reason:'保存期間、刪除時點與例外尚未核定'},
  {id:'ACCESS_ROLE_APPROVAL',state:'PENDING',reason:'正式研究人員角色、最小權限與撤權程序未核定'},
  {id:'FORMAL_STORAGE_SCHEMA',state:'BLOCKED',reason:'正式 Sheets adapter 尚未核准或接入'},
  {id:'OTP_DELIVERY_AUTHORIZATION',state:'BLOCKED',reason:'真人信箱及 OTP 寄送均禁止'},
  {id:'NOTIFICATION_POLICY_APPROVAL',state:'PENDING',reason:'寄送時機、重試間隔與錯誤處理待核定'},
  {id:'CONSENT_SIGNING_EVIDENCE',state:'BLOCKED',reason:'未建置核准 PDF 的有效閱覽、簽署與證據保存'},
  {id:'E2_EIGHT_WEEK_PLAN_APPROVAL',state:'PENDING',reason:'實驗二團課／居家安排、研究分組、出席與追蹤政策仍待核定'},
  {id:'FORMAL_DATA_PORT_AUTHORIZATION',state:'BLOCKED',reason:'正式 OTP／預約／通知及資料權限 adapter 尚未接入'},
  {id:'OWNER_LIVE_ACCEPTANCE',state:'PENDING',reason:'完整正式流程尚無真人上線驗收授權'}
 ];
 const provenance={};
 for(const exp of ['E1','E2']){
  const c=s.policy.consent[exp],m=s.policy.screening.mappings[exp];
  provenance[exp]={screeningSource:m.source,screeningVersion:m.version,
   recVersion:c.version,declaredSha256:c.sha256,sourceDocumentId:null,
   sourceVersionVerified:false,sourceBytesVerified:false,
   recApprovalVerified:false,preSignedResearcherPdfVerified:false};
  gates.push(
   {id:exp+'_SCREENING_SOURCE',state:'PENDING',reason:'初篩對照仍為 REC 草稿，缺核准來源及版本核對'},
   {id:exp+'_REC_PDF_BYTES',state:'BLOCKED',reason:'缺已核准 REC PDF 原始位元組及獨立 SHA-256 回讀'},
   {id:exp+'_RESEARCHER_PRESIGN',state:'BLOCKED',reason:'缺經核對之研究人員預簽原始文件'}
  );
 }
 return {mode:'FORMAL_BLOCKED',activationAllowed:false,passed:0,total:gates.length,
  gates,provenance,
  notificationPolicy:{channel:'DISABLED',realEmail:'PROHIBITED',
   sendOnlyAfter:['CONFIRM_COMMITTED','MOVE_COMMITTED','CANCEL_COMMITTED'],
   maxSimulatedAttempts:3,realRetryBackoff:'PENDING',realDeliveryAudit:'PENDING'},
  storagePolicy:{formalRead:'DENIED',formalWrite:'DENIED',
   retention:'PENDING',rolePermissions:'PENDING',consentSignature:'DENIED'}};
}
function study1UnifiedGovernance_(s){
 return {mode:'TEST',approval:'PENDING',access:'828_OWNER_ONLY',
  publicIntake:'DISABLED',realData:'NEVER_COLLECTED',audit:'SIM_ACTION_ONLY',
  subjectExport:'FORMAL_BLOCKED',subjectDeletion:'FORMAL_BLOCKED',
  fixtureDeletion:'STUDY1_UNIFIED_FIXTURE_V1_ONLY',
  retention:{status:s.policy.retention.status,days:s.policy.retention.days},
  notification:{status:s.policy.notification.status},
  documents:Object.fromEntries(['E1','E2'].map(exp=>[exp,{
   source:'REC_DRAFT_ONLY',version:s.policy.consent[exp].version,
   declaredSha256:s.policy.consent[exp].sha256,sourceBytesVerified:false,
   approved:false,formalPdfAvailable:false}]))};
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
/* B07 synthetic compensation-administration PREPARATION ONLY.
 * No amount, reimbursement, proof file, payee, transfer or approval field.
 * A REVIEW_PENDING label is not REC/PI approval or payment eligibility. */
const STUDY1_B07_STAGES_={E1:['SINGLE_SESSION'],
 E2:['PRETEST','INTERVENTION_8W','POSTTEST']};
/** Canonical B07 TEST pending-only counts, not entitlements or payments. */
function study1B07PendingSummary_(s){
 study1B07Verify_(s);
 const zero=()=>({total:0,unrecorded:0,sourcePending:0,documentsPending:0,piReviewPending:0});
 const byExperiment={E1:zero(),E2:zero()};
 const byStage={SINGLE_SESSION:zero(),PRETEST:zero(),INTERVENTION_8W:zero(),POSTTEST:zero()};
 const fields={UNRECORDED:'unrecorded',SOURCE_PENDING:'sourcePending',
  DOCUMENTS_PENDING:'documentsPending',PI_REVIEW_PENDING:'piReviewPending'};
 for(const a of s.applications){
  if(!a||!/^SIM-[0-9]{3}$/.test(a.id)||!STUDY1_B07_STAGES_[a.experiment])
   throw Error('B07階段統計申請來源不合法');
  for(const stage of STUDY1_B07_STAGES_[a.experiment]){
   const field=fields[s.b07.itemReviews[a.id+':'+stage]?.status||'UNRECORDED'];
   if(!field)throw Error('B07階段統計出現非待核狀態');
   for(const count of [byExperiment[a.experiment],byStage[stage]]){count.total++;count[field]++;}
  }
 }
 const total=zero();
 for(const exp of ['E1','E2'])
  for(const field of Object.keys(total))total[field]+=byExperiment[exp][field];
 return {mode:'SYNTHETIC_PENDING_ONLY',approved:false,payment:false,
  total,byExperiment,byStage,historyRetained:s.b07.itemHistory.length,historyLimit:32};
}
function study1B07Initial_(){return {reviews:{},history:[],itemReviews:{},itemHistory:[]};}
function study1B07Verify_(s){
 const b=s.b07,allowed=['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'];
 if(!b||typeof b!=='object'||Array.isArray(b)||
    Object.keys(b).sort().join(',')!=='history,itemHistory,itemReviews,reviews'||
    !b.reviews||typeof b.reviews!=='object'||Array.isArray(b.reviews)||
    !Array.isArray(b.history)||b.history.length>12||
    Object.keys(b.reviews).length>8||
    !b.itemReviews||typeof b.itemReviews!=='object'||Array.isArray(b.itemReviews)||
    !Array.isArray(b.itemHistory)||b.itemHistory.length>32||
    Object.keys(b.itemReviews).length>24)
  throw Error('B07虛構行政準備資料結構異常');
 for(const [id,x] of Object.entries(b.reviews)){
  if(!/^SIM-[0-9]{3}$/.test(id)||
     !s.applications.some(a=>a.id===id)||!x||
     Object.keys(x).sort().join(',')!=='actor,at,status'||
     x.actor!=='OWNER'||!allowed.includes(x.status)||
     typeof x.at!=='string'||Number.isNaN(Date.parse(x.at))||
     new Date(x.at).toISOString()!==x.at)
   throw Error('B07行政狀態與原虛構申請來源不一致');
 }
 for(const e of b.history){
  if(!e||Object.keys(e).sort().join(',')!=='actor,at,from,id,reason,to'||
     !/^SIM-[0-9]{3}$/.test(e.id)||!s.applications.some(a=>a.id===e.id)||
     e.actor!=='OWNER'||!(e.from==='UNRECORDED'||allowed.includes(e.from))||
     !allowed.includes(e.to)||e.from===e.to||
     !['SOURCE_CHECK','DOCUMENT_CHECK','PI_REVIEW_REQUEST'].includes(e.reason)||
     typeof e.at!=='string'||Number.isNaN(Date.parse(e.at))||
     new Date(e.at).toISOString()!==e.at)
   throw Error('B07虛構行政更正歷程不合法');
 }
 const last=new Map();
 for(const e of b.history){
  const previous=last.get(e.id);
  if(previous&&previous.to!==e.from)throw Error('B07同一代碼歷程前後狀態不連續');
  last.set(e.id,e);
 }
 for(const [id,e] of last)
  if(b.reviews[id]?.status!==e.to||b.reviews[id]?.at!==e.at)
   throw Error('B07最近歷程與目前行政狀態不一致');
 // Every TEST ledger item is uniquely defined by an existing SIM code plus a valid stage.
 const validItem=(id,stage)=>{
  const a=s.applications.find(x=>x.id===id);
  return !!(a&&STUDY1_B07_STAGES_[a.experiment]?.includes(stage));
 };
 for(const [key,x] of Object.entries(b.itemReviews)){
  const parts=key.split(':');
  if(parts.length!==2||!/^SIM-[0-9]{3}$/.test(parts[0])||
     !validItem(parts[0],parts[1])||!x||typeof x!=='object'||
     Object.keys(x).sort().join(',')!=='actor,at,status'||
     x.actor!=='OWNER'||!allowed.includes(x.status)||
     typeof x.at!=='string'||Number.isNaN(Date.parse(x.at))||
     new Date(x.at).toISOString()!==x.at)
   throw Error('B07階段項目與虛構申請來源不一致');
 }
 const lastItem=new Map();
 for(const e of b.itemHistory){
  if(!e||typeof e!=='object'||Array.isArray(e)||
     Object.keys(e).sort().join(',')!=='actor,at,from,id,reason,stage,to'||
     !/^SIM-[0-9]{3}$/.test(e.id)||!validItem(e.id,e.stage)||
     e.actor!=='OWNER'||!(e.from==='UNRECORDED'||allowed.includes(e.from))||
     !allowed.includes(e.to)||e.from===e.to||
     !['SOURCE_CHECK','DOCUMENT_CHECK','PI_REVIEW_REQUEST'].includes(e.reason)||
     typeof e.at!=='string'||Number.isNaN(Date.parse(e.at))||
     new Date(e.at).toISOString()!==e.at)
   throw Error('B07階段項目更正歷程不合法');
  const key=e.id+':'+e.stage,previous=lastItem.get(key);
  if(!previous&&b.itemHistory.length<32&&e.from!=='UNRECORDED')
   throw Error('B07階段項目初始更正值不一致');
  if(previous&&previous.to!==e.from)
   throw Error('B07階段項目歷程前後狀態不連續');
  lastItem.set(key,e);
 }
 for(const [key,e] of lastItem)
  if(b.itemReviews[key]?.status!==e.to||b.itemReviews[key]?.at!==e.at)
   throw Error('B07階段項目最近歷程與目前狀態不一致');
 return true;
}
/* OWNER TEST only: experiment, stage, activity/slot hierarchy.
 * E2 stage is deliberately unknown until OWNER explicitly binds a test slot.
 * These modes never grant real research intake or email delivery. */
function study1WaitlistSettingsInitial_(){
 return {experiments:{E1:'MANUAL_TEST',E2:'CLOSED'},
  stages:{'E1:SINGLE_SESSION':'INHERIT','E2:PRETEST':'INHERIT',
   'E2:INTERVENTION_8W':'INHERIT','E2:POSTTEST':'INHERIT'},
  activities:{}};
}
function study1WaitlistSettingsVerify_(s){
 const p=s.waitlist?.settings,defaults=study1WaitlistSettingsInitial_();
 if(!p||typeof p!=='object'||Array.isArray(p)||
  Object.keys(p).sort().join(',')!=='activities,experiments,stages'||
  !p.experiments||Object.keys(p.experiments).sort().join(',')!=='E1,E2'||
  !p.stages||Object.keys(p.stages).sort().join(',')!==Object.keys(defaults.stages).sort().join(',')||
  !p.activities||typeof p.activities!=='object'||Array.isArray(p.activities))
  throw Error('候補TEST分層設定來源不合法');
 for(const exp of ['E1','E2'])
  if(!['CLOSED','MANUAL_TEST'].includes(p.experiments[exp]))
   throw Error('候補實驗設定不得啟用正式或自動通知');
 for(const k of Object.keys(defaults.stages))
  if(!['INHERIT','CLOSED','MANUAL_TEST'].includes(p.stages[k]))
   throw Error('候補階段設定不合法');
 if(Object.keys(p.activities).length>8)throw Error('候補TEST活動設定上限不合法');
 for(const [id,rule] of Object.entries(p.activities)){
  const slot=s.slots.find(z=>z.id===id);
  if(!slot||!rule||typeof rule!=='object'||Array.isArray(rule)||
   Object.keys(rule).sort().join(',')!=='mode,stage'||
   !STUDY1_B07_STAGES_[slot.experiment].includes(rule.stage)||
   !['INHERIT','CLOSED','MANUAL_TEST'].includes(rule.mode))
   throw Error('候補活動綁定或研究階段與原場次不一致');
 }
 return true;
}
function study1WaitlistPolicy_(s,slotId){
 const slot=s.slots.find(z=>z.id===slotId);
 if(!slot)throw Error('候補活動不存在於原TEST場次');
 const settings=s.waitlist.settings,rule=settings.activities[slotId];
 const stage=rule?.stage||(slot.experiment==='E1'?'SINGLE_SESSION':null);
 const expMode=settings.experiments[slot.experiment];
 const stageMode=stage?settings.stages[slot.experiment+':'+stage]:'CLOSED';
 const activityMode=rule?.mode||'INHERIT';
 const permitted=expMode==='MANUAL_TEST'&&stage!==null&&
  stageMode!=='CLOSED'&&activityMode!=='CLOSED';
 return {experiment:slot.experiment,slotId,stage,activity:slotId,
  experimentMode:expMode,stageMode,activityMode,
  mode:permitted?'MANUAL_TEST':'CLOSED',mail:'DISABLED',approved:false};
}

/* P1-08 synthetic FIFO queue: same locked TEST fixture, no email or real data. */
function study1WaitlistInitial_(){return {nextSeq:0,entries:[],settings:study1WaitlistSettingsInitial_()};}
function study1WaitlistVerify_(s){
 const w=s.waitlist;
 if(!w||typeof w!=='object'||Array.isArray(w)||
  Object.keys(w).sort().join(',')!=='entries,nextSeq,settings'||
  !Number.isSafeInteger(w.nextSeq)||w.nextSeq<0||w.nextSeq>8||
  !Array.isArray(w.entries)||w.entries.length>8||
  w.nextSeq!==w.entries.length)throw Error('候補資料格式或順位不合法');
 study1WaitlistSettingsVerify_(s);
 const seen=new Set(),live=new Set();
 for(const e of w.entries){
  const a=s.applications.find(x=>x.id===e?.id);
  const slot=s.slots.find(x=>x.id===e?.slotId);
  if(!e||Object.keys(e).sort().join(',')!==
    'closedAt,experiment,expiresAt,id,joinedAt,offeredAt,seq,slotId,status'||
   !a||!slot||a.experiment!==e.experiment||slot.experiment!==e.experiment||
   seen.has(e.id)||e.seq!==w.entries.indexOf(e)+1||
   !Number.isSafeInteger(e.joinedAt)||e.joinedAt<0||
   !['WAITING','OFFERED','ACCEPTED','DECLINED','EXPIRED','OWNER_CLOSED'].includes(e.status))
   throw Error('候補代碼、實驗或順序不合法');
  seen.add(e.id);
  // Cancelled/closed B02 sessions must not retain actionable FIFO entries.
  if(['WAITING','OFFERED'].includes(e.status)&&
     ['CANCELLED','CLOSED'].includes(s.b02.sessions[e.slotId]?.status))
   throw Error('已取消或結案場次仍有未處理候補，拒絕跨模組來源');
  if(['WAITING','OFFERED'].includes(e.status)&&study1WaitlistPolicy_(s,e.slotId).mode!=='MANUAL_TEST')
   throw Error('有效候補與實驗/階段/活動開放設定矛盾');
  const offer=Number.isSafeInteger(e.offeredAt)&&Number.isSafeInteger(e.expiresAt)&&
    e.offeredAt>=e.joinedAt&&e.expiresAt>e.offeredAt;
  if(e.status==='WAITING'&&(e.offeredAt!==null||e.expiresAt!==null||
    e.closedAt!==null||a.phase!=='VERIFIED')||
   e.status==='OFFERED'&&(!offer||e.closedAt!==null||
    a.phase!=='VERIFIED'||live.has(e.slotId))||
   e.status==='ACCEPTED'&&(!offer||!Number.isSafeInteger(e.closedAt)||
    e.closedAt<e.offeredAt||e.closedAt>=e.expiresAt||!a.slotId||
    // Preserve original offer slot after a later confirmed-booking MOVE.
    (a.slotId!==e.slotId&&!['CONFIRMED','CANCELLED'].includes(a.phase))||
    !['HELD','CONSENTED','CONFIRMED','CANCELLED'].includes(a.phase))||
   e.status==='EXPIRED'&&(!offer||!Number.isSafeInteger(e.closedAt)||
    e.closedAt<e.expiresAt)||
   e.status==='DECLINED'&&(!Number.isSafeInteger(e.closedAt)||
    (e.offeredAt===null?e.expiresAt!==null:!offer))||
   e.status==='OWNER_CLOSED'&&(e.offeredAt!==null||e.expiresAt!==null||
    !Number.isSafeInteger(e.closedAt)||e.closedAt<e.joinedAt||
    a.phase!=='VERIFIED'))
   throw Error('候補期限、狀態或應答來源不一致');
  if(e.status==='OFFERED')live.add(e.slotId);
 }
 return true;
}
/* P1-08 B02/B03/B04/B09/B12: deterministic current-state counts only.
 * OFFERED includes overdue-but-not-yet-manually-closed offers; no event,
 * participant notification, reservation or eligibility is inferred. */
function study1WaitlistSummary_(s){
 study1WaitlistVerify_(s);
 const keys=['WAITING','OFFERED','ACCEPTED','EXPIRED','DECLINED','OWNER_CLOSED'];
 const zero=()=>({WAITING:0,OFFERED:0,ACCEPTED:0,EXPIRED:0,DECLINED:0,OWNER_CLOSED:0,total:0});
 const total=zero(),byExperiment={E1:zero(),E2:zero()},
  byStage=Object.fromEntries(Object.keys(s.waitlist.settings.stages).map(k=>[k,zero()])),
  bySlot=s.slots.map(slot=>{
   const policy=study1WaitlistPolicy_(s,slot.id);
   return {slotId:slot.id,experiment:slot.experiment,stage:policy.stage,
    mode:policy.mode,counts:zero()};
  });
 const slotMap=new Map(bySlot.map(x=>[x.slotId,x]));
 for(const e of s.waitlist.entries){
  const slot=slotMap.get(e.slotId);
  if(!slot||slot.experiment!==e.experiment)throw Error('候補原場次與實驗來源不一致');
  for(const bucket of [total,byExperiment[e.experiment],slot.counts,
   ...(slot.stage?[byStage[e.experiment+':'+slot.stage]]:[])]){
   if(!bucket||!keys.includes(e.status))throw Error('候補階段或狀態彙整來源不合法');
   bucket[e.status]++;bucket.total++;
  }
 }
 return {mode:'CURRENT_TEST_STATUS_ONLY',completeHistory:false,mailSent:false,
  limit:8,retained:s.waitlist.entries.length,byExperiment,byStage,bySlot,total};
}

/* §70-F: read-only derived cancelled-session cross-module snapshot.
 * ACCEPTED retains its original offer slot after a later confirmed MOVE.
 * B02 cancellation never edits individual booking or attendance.
 * This is NOT an event log, person resolution, or evidence of mail. */
function study1PostCancelSummary_(s){
 study1WaitlistVerify_(s);
 const bySlot=s.slots.filter(slot=>s.b02.sessions[slot.id]?.status==='CANCELLED')
  .map(slot=>{
   const linked=s.applications.filter(a=>a.slotId===slot.id);
   const queue=s.waitlist.entries.filter(e=>e.slotId===slot.id);
   if(queue.some(e=>['WAITING','OFFERED'].includes(e.status)))
    throw Error('已取消場次仍有待處理候補邀請，拒絕不一致快照');
   const accepted=queue.filter(e=>e.status==='ACCEPTED').map(e=>{
    const a=s.applications.find(x=>x.id===e.id);
    if(!a||!a.slotId||a.experiment!==slot.experiment||
      (a.slotId!==slot.id&&!['CONFIRMED','CANCELLED'].includes(a.phase)))
     throw Error('已取消場次原候補接受紀錄與現有預約來源衝突');
    return {id:e.id,seq:e.seq,originalSlotId:e.slotId,
     currentSlotId:a.slotId,phase:a.phase};
   });
   // Raw, current-only per-person reconciliation for B02/B03/B04/B09/B12.
   // Do not infer whether an expired hold was administratively processed;
   // its holdUntil remains a timestamp and original accepted FIFO stays fixed.
   const linkedRecords=linked.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(a=>{
    const att=s.b02.attendance[a.id]||{attendance:'PENDING',progress:'NOT_STARTED'};
    const acceptedSource=s.waitlist.entries.find(e=>e.id===a.id&&e.status==='ACCEPTED');
    return {id:a.id,phase:a.phase,holdUntil:a.holdUntil===undefined?null:a.holdUntil,
     attendance:att.attendance,progress:att.progress,
     originalAcceptedSlotId:acceptedSource?acceptedSource.slotId:null,
     originalAcceptedSeq:acceptedSource?acceptedSource.seq:null};
   });
   return {slotId:slot.id,experiment:slot.experiment,when:slot.when,
    acceptedOrigins:accepted,linkedRecords,
    linked:linked.length,
    linkedConfirmed:linked.filter(a=>a.phase==='CONFIRMED').length,
    linkedHoldOrConsented:linked.filter(a=>['HELD','CONSENTED'].includes(a.phase)).length,
    linkedCancelled:linked.filter(a=>a.phase==='CANCELLED').length,
    linkedAttendanceRecorded:linked.filter(a=>['PRESENT','LATE','ABSENT'].includes(
     s.b02.attendance[a.id]?.attendance)).length,
    linkedProgressComplete:linked.filter(a=>s.b02.attendance[a.id]?.progress==='COMPLETE').length,
    pendingQueue:0,
    retainedCancelEvents:s.b02.history.filter(h=>h.action==='CANCEL'&&
     h.ids.includes(slot.id)).length};
  });
 return {mode:'CURRENT_CANCELLED_TEST_ONLY',completeHistory:false,mailSent:false,
  bySlot};
}

function study1WaitlistPending_(s,slotId){
 return s.waitlist.entries.filter(e=>e.slotId===slotId&&
  ['WAITING','OFFERED'].includes(e.status));
}
function study1WaitlistFree_(s,slotId,now){
 const slot=s.slots.find(x=>x.id===slotId);
 if(!slot)return 0;
 return Math.max(0,slot.capacity-study1UnifiedCapacity_(s,slotId,now)-
  s.waitlist.entries.filter(e=>e.slotId===slotId&&e.status==='OFFERED'&&e.expiresAt>now).length);
}
function study1WaitlistAdvance_(s,slotId,now){
 const slot=s.slots.find(x=>x.id===slotId);
 const start=slot?Date.parse(slot.when.replace(' ','T')+':00+08:00'):0;
 if(!slot||start<=now||study1WaitlistPolicy_(s,slotId).mode!=='MANUAL_TEST'||
  ['CANCELLED','CLOSED'].includes(s.b02.sessions[slotId]?.status))
  throw Error('已取消、已結案或過期場次不可遞補');
 let changed=false;
 for(const e of s.waitlist.entries){
  if(e.slotId===slotId&&e.status==='OFFERED'&&e.expiresAt<=now){
   e.status='EXPIRED';e.closedAt=now;changed=true;
  }
 }
 if(!s.waitlist.entries.some(e=>e.slotId===slotId&&e.status==='OFFERED')&&
  study1WaitlistFree_(s,slotId,now)>0){
  const next=s.waitlist.entries.find(e=>e.slotId===slotId&&e.status==='WAITING');
  if(next){
   if(start-now<=600000)throw Error('不足十分鐘，不能建立候補回覆期限');
   next.status='OFFERED';next.offeredAt=now;next.expiresAt=now+600000;
   changed=true;
  }
 }
 if(!changed)throw Error('無逾期邀請或可遞補名額，不建立空交易');
}

function study1UnifiedInitial_(){
 return {schemaVersion:1,revision:0,config:{
  title:'Study 1｜正式網站整合流程（測試資料模式）',
  notice:'所有資料均為虛構測試，不會建立正式報名、寄信或產生有效同意書。',
  emailTemplate:'〔測試通知〕預約狀態變更，正式寄送尚未啟用。'},
  policy:study1UnifiedPolicy_(),research:study1UnifiedResearch_(),
  recruitment:study1UnifiedRecruitment_(),
  slots:[
   {id:'SIM-SLOT-E1-A',experiment:'E1',when:'2027-01-05 10:00',capacity:2},
   {id:'SIM-SLOT-E1-B',experiment:'E1',when:'2027-01-06 14:00',capacity:2},
   {id:'SIM-SLOT-E2-A',experiment:'E2',when:'2027-01-07 10:00',capacity:2},
   {id:'SIM-SLOT-E2-B',experiment:'E2',when:'2027-01-08 14:00',capacity:2}
  ],e2Weeks:study1UnifiedE2Weeks_(),applications:[],requests:[],notifications:[],waitlist:study1WaitlistInitial_(),
   b02:{sessions:{},attendance:{},history:[]},
    b04:{notes:{},history:[]},b05:{closures:{},history:[]},
    b07:study1B07Initial_()};
}
/** Server-side role boundary for the existing OWNER-only synthetic routes.
 * Synthetic PI/RA audit labels never authenticate a user or grant a role.
 * Future PI/RA and all formal-data capabilities remain blocked until approved.
 */
function study1UnifiedRoleAuthorise_(role,operation){
 if(role!=='OWNER'||!['SYNTHETIC_READ','SYNTHETIC_WRITE'].includes(operation))
  throw Error('正式PI／RA角色或操作未獲授權，拒絕執行');
 study1AdminOwnerRequired_();
 study1SandboxBookingFlags_();
 return true;
}
function study1UnifiedAssertOwner_(){
 study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_WRITE');
}
function study1UnifiedRead_(){
 const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
 if(raw===null)return study1UnifiedInitial_();
 const s=JSON.parse(study1UnifiedStoredDecode_(raw));
 if(s&&!s.policy)s.policy=study1UnifiedPolicy_(); // migrate only owner fixture
 if(s&&!s.research)s.research=study1UnifiedResearch_(); // legacy owner-only fixture, no write on read
 if(s&&!s.recruitment)s.recruitment=study1UnifiedRecruitment_(); // non-writing TEST migration
 if(s&&!s.e2Weeks)s.e2Weeks=study1UnifiedE2Weeks_(); // read-only fixture migration
 if(s&&!s.b02)s.b02={sessions:{},attendance:{},history:[]}; // non-writing TEST migration
 if(s&&!s.b04)s.b04={notes:{},history:[]}; // non-writing B04 migration
 if(s&&!s.b05)s.b05={closures:{},history:[]}; // non-writing B05 migration
 if(s&&!s.b07)s.b07=study1B07Initial_(); // non-writing B07 owner TEST migration
 if(s&&!s.waitlist)s.waitlist=study1WaitlistInitial_(); // non-writing TEST migration
 if(s&&s.waitlist&&!Object.prototype.hasOwnProperty.call(s.waitlist,'settings'))
  s.waitlist.settings=study1WaitlistSettingsInitial_(); // V99 non-writing policy migration
 if(s&&s.b07&&!Object.prototype.hasOwnProperty.call(s.b07,'itemReviews')&&
    !Object.prototype.hasOwnProperty.call(s.b07,'itemHistory')){
  s.b07.itemReviews={};s.b07.itemHistory=[]; // non-writing old B07 ledger migration
 }
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
 study1UnifiedValidateRecruitment_(s.recruitment);
 study1UnifiedValidateSlots_(s.slots);
 if(!s.b02||typeof s.b02!=='object'||Array.isArray(s.b02)||
    Object.keys(s.b02).sort().join(',')!=='attendance,history,sessions'||
    !s.b02.sessions||!s.b02.attendance||!Array.isArray(s.b02.history)||
    s.b02.history.length>12)throw Error('行事曆隔離資料格式異常');
 for(const [id,m] of Object.entries(s.b02.sessions)){
   if(!/^SIM-SLOT-E[12]-[A-Z]$/.test(id)||!m||
      Object.keys(m).sort().join(',')!=='group,minutes,place,status,title'||
      typeof m.title!=='string'||m.title.length>36||/[<>]/.test(m.title)||
      typeof m.place!=='string'||m.place.length>48||/[<>]/.test(m.place)||
      !Number.isSafeInteger(m.minutes)||m.minutes<15||m.minutes>480||
      !['OPEN','CANCELLED','CLOSED'].includes(m.status)||
      typeof m.group!=='string'||m.group.length>32)
     throw Error('行事曆場次元資料不合法');
 }
 for(const [id,a] of Object.entries(s.b02.attendance)){
   if(!/^SIM-[0-9]{3}$/.test(id)||!a||
      Object.keys(a).sort().join(',')!=='attendance,note,progress'||
      !['PENDING','PRESENT','LATE','ABSENT'].includes(a.attendance)||
      !['NOT_STARTED','IN_PROGRESS','PARTIAL','COMPLETE'].includes(a.progress)||
      typeof a.note!=='string'||a.note.length>80||/[<>]/.test(a.note))
     throw Error('虛構出席／施測資料不合法');
 }
 if(s.b02.history.some(h=>!h||typeof h.at!=='string'||typeof h.action!=='string'||
      !Array.isArray(h.ids)||h.ids.length>8||h.ids.some(x=>typeof x!=='string')))
   throw Error('行事曆操作歷程不合法');
 if(!s.b04||typeof s.b04!=='object'||Array.isArray(s.b04)||
    Object.keys(s.b04).sort().join(',')!=='history,notes'||!s.b04.notes||
    typeof s.b04.notes!=='object'||Array.isArray(s.b04.notes)||
    !Array.isArray(s.b04.history)||s.b04.history.length>30||
    Object.entries(s.b04.notes).some(([id,note])=>!/^SIM-[0-9]{3}$/.test(id)||
      !s.applications.some(a=>a.id===id)||typeof note!=='string'||note.length>180||/[<>]/.test(note))||
    s.b04.history.some(e=>!e||Object.keys(e).sort().join(',')!=='actor,after,at,before,field,id,reason'||
      !/^SIM-[0-9]{3}$/.test(e.id)||!s.applications.some(a=>a.id===e.id)||
      e.actor!=='OWNER'||typeof e.at!=='string'||Number.isNaN(Date.parse(e.at))||
      !['adminNote','attendanceAndProgress'].includes(e.field)||
      [e.before,e.after,e.reason].some(v=>typeof v!=='string'||v.length>220||/[<>]/.test(v))||
      e.reason.length<4))
   throw Error('B04參與者管理資料或歷程不合法');

 if(!s.b05||typeof s.b05!=='object'||Array.isArray(s.b05)||
    Object.keys(s.b05).sort().join(',')!=='closures,history'||
    !s.b05.closures||typeof s.b05.closures!=='object'||Array.isArray(s.b05.closures)||
    !Array.isArray(s.b05.history)||s.b05.history.length>32)
  throw Error('B05場次結案紀錄格式不合法');
 for(const [id,x] of Object.entries(s.b05.closures)){
  if(!/^SIM-SLOT-E[12]-[A-Z]$/.test(id)||!s.slots.some(a=>a.id===id)||
     !x||Object.keys(x).sort().join(',')!=='actor,at,handoff,issues,reason'||
     x.actor!=='OWNER'||typeof x.at!=='string'||Number.isNaN(Date.parse(x.at))||
     !Number.isSafeInteger(x.issues)||x.issues<0||x.issues>8||
     typeof x.handoff!=='string'||x.handoff.length>250||/[<>]/.test(x.handoff)||
     typeof x.reason!=='string'||x.reason.length<4||x.reason.length>120||/[<>]/.test(x.reason)||
     s.b02.sessions[id]?.status!=='CLOSED')
   throw Error('B05結案狀態與原場次不一致');
 }
 if(s.b05.history.some(h=>!h||Object.keys(h).sort().join(',')!=='action,actor,after,at,before,handoff,issues,reason,slotId'||
    !['CLOSE','REOPEN'].includes(h.action)||h.actor!=='OWNER'||
    !/^SIM-SLOT-E[12]-[A-Z]$/.test(h.slotId)||!s.slots.some(a=>a.id===h.slotId)||
    !['OPEN','CLOSED'].includes(h.before)||!['OPEN','CLOSED'].includes(h.after)||
    typeof h.at!=='string'||Number.isNaN(Date.parse(h.at))||
    !Number.isSafeInteger(h.issues)||h.issues<0||h.issues>8||
    typeof h.reason!=='string'||h.reason.length<4||h.reason.length>120||/[<>]/.test(h.reason)||
    typeof h.handoff!=='string'||h.handoff.length>250||/[<>]/.test(h.handoff)))
  throw Error('B05近期結案操作歷程不合法');

 study1B07Verify_(s);
 study1UnifiedValidateE2Weeks_(s.e2Weeks);
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
  if(a.pdfDemoReviewedAt!==undefined&&a.pdfDemoReviewedAt!==null&&
      (!Number.isFinite(a.pdfDemoReviewedAt)||a.pdfDemoReviewedAt<=0||
       a.pdfDemoSha256!=='82e8b20b8d0849f5482a94f1f8adf1e3c3bf1d41b45c33ab48dbd4481fe72ad1'))
   throw Error('虛構 PDF 閱覽紀錄不合法');
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
 study1WaitlistVerify_(s);
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
 study1WaitlistVerify_(s);
 const available=new Map(study1UnifiedCoreAvailability_(s,now).map(x=>[x.slotId,x.remaining]));
 return {mode:'TEST',open:false,consentReady:false,formalApproval:'PENDING',
  revision:s.revision,researchSource:s.research.source,researchApproval:s.research.approval,
  recruitment:JSON.parse(JSON.stringify(s.recruitment)),
  definitions:Object.fromEntries(Object.entries(s.research).filter(([k])=>k==='E1'||k==='E2').map(([k,v])=>
   [k,{...v,recVersion:s.policy.consent[k].version}])),config:s.config,
  policy:s.policy,audit:study1UnifiedAudit_(s),
  pdfFixture:study1UnifiedPdfFixture_(),governance:study1UnifiedGovernance_(s),
  formalReadiness:study1UnifiedFormalReadiness_(s),formalPorts:study1UnifiedFormalPorts_(),
  b02:JSON.parse(JSON.stringify(s.b02||{sessions:{},attendance:{},history:[]})),
  b04:JSON.parse(JSON.stringify(s.b04||{notes:{},history:[]})),
  b05:JSON.parse(JSON.stringify(s.b05||{closures:{},history:[]})),
  b07:JSON.parse(JSON.stringify(s.b07||study1B07Initial_())),
  b07Summary:study1B07PendingSummary_(s),
  postCancel:study1PostCancelSummary_(s),
   waitlist:{nextSeq:s.waitlist.nextSeq,asOf:now,mode:'MANUAL_TEST_NO_MAIL',
    summary:study1WaitlistSummary_(s),
    settings:JSON.parse(JSON.stringify(s.waitlist.settings)),
    slotPolicies:s.slots.map(slot=>study1WaitlistPolicy_(s,slot.id)),
    entries:s.waitlist.entries.map(e=>({...e,rank:e.status==='WAITING'?
      s.waitlist.entries.filter(t=>t.slotId===e.slotId&&t.status==='WAITING'&&t.seq<=e.seq).length:0,
      expiredOffer:e.status==='OFFERED'&&e.expiresAt<=now}))},
  b06:{...study1B06Read_(),formalPersistence:false},
  e2Operations:{mode:'TEST_PLANNING',approval:'PENDING',groupAllocation:'PENDING_PI',
   realAttendance:'DISABLED',pretest:'PENDING_DATE',posttest:'PENDING_DATE',
   weeks:s.e2Weeks.map(w=>({...w})),plannedWeeks:s.e2Weeks.filter(w=>w.date!==null).length},
  slots:s.slots.map(slot=>{
   const bookable=Date.parse(slot.when.replace(' ','T')+':00+08:00')>now;
   const b02Status=s.b02&&s.b02.sessions[slot.id]&&s.b02.sessions[slot.id].status;
   return {...slot,bookable:bookable&&b02Status!=='CANCELLED'&&b02Status!=='CLOSED',
     remaining:bookable&&b02Status!=='CANCELLED'&&b02Status!=='CLOSED'?
    study1WaitlistFree_(s,slot.id,now):0};}),
  applications:s.applications.map(a=>({id:a.id,experiment:a.experiment,phase:a.phase,eligible:a.eligible,
   screeningVersion:a.screeningVersion||null,screeningSource:a.screeningSource||null,
   slotId:a.slotId,otpAttempts:a.otpAttempts,consentVersion:a.consentVersion,
   consentSha256:a.consentSha256===undefined?null:a.consentSha256,
   consentReviewedAt:a.consentReviewedAt||null,pdfDemoReviewedAt:a.pdfDemoReviewedAt||null,
   holdUntil:a.holdUntil,
   holdExpired:['HELD','CONSENTED'].includes(a.phase)&&Number.isFinite(a.holdUntil)&&a.holdUntil<=Date.now(),
   signatureDemo:a.signatureDemo})),
  notifications:s.notifications.slice(-15).map((n,i)=>({...n,index:s.notifications.length-Math.min(s.notifications.length,15)+i})),
  fixtureOtp:'00000000'};
}
function study1UnifiedRequireCommand_(command){
 if(!command||typeof command!=='object'||Array.isArray(command)||
  Object.keys(command).sort().join(',')!=='action,expectedRevision,payload,requestId'||
  !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
  typeof command.action!=='string'||!/^REQ-SIM-[A-Za-z0-9_-]{8,48}$/.test(command.requestId)||
  !command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)||
  JSON.stringify(command.payload).length>1600)throw Error('統一流程測試指令格式不合法');
 const approved=['START','SCREEN','OTP_REQUEST','OTP_VERIFY','HOLD','CONSENT_REVIEW','PDF_DEMO_REVIEW','CONSENT','CONFIRM','MOVE','CANCEL','ADMIN_EDIT','ADMIN_RESEARCH','ADMIN_SLOTS','ADMIN_POLICY','ADMIN_SCREENING','ADMIN_NOTIFY_ATTEMPT','ADMIN_E2_WEEKS','ADMIN_RECRUITMENT','ADMIN_B11_SETTINGS','ADMIN_RESET','ADMIN_B02_SLOT','ADMIN_B02_ATTEND','ADMIN_B04_NOTE','ADMIN_B05_CLOSURE','ADMIN_B07_REVIEW','ADMIN_B07_ITEM_REVIEW','WAITLIST_JOIN','WAITLIST_ADVANCE','WAITLIST_ACCEPT','WAITLIST_DECLINE','ADMIN_WAITLIST_POLICY','ADMIN_WAITLIST_RESOLVE'];
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
    consentReviewedVersion:null,consentReviewedSha256:null,
    pdfDemoReviewedAt:null,pdfDemoSha256:null,signatureDemo:false});return;
 }

 if(action==='ADMIN_B02_SLOT'){
  const keys='capacity,experiment,minutes,operation,place,repeatCount,scope,slotId,title,when';
  if(Object.keys(p).sort().join(',')!==keys||
    !['CREATE','UPDATE','CANCEL'].includes(p.operation)||!['E1','E2'].includes(p.experiment)||
    typeof p.title!=='string'||p.title.trim().length<2||p.title.length>36||/[<>]/.test(p.title)||
    typeof p.place!=='string'||p.place.length>48||/[<>]/.test(p.place)||
    !Number.isSafeInteger(p.capacity)||p.capacity<1||p.capacity>20||
    !Number.isSafeInteger(p.minutes)||p.minutes<15||p.minutes>480||
    !Number.isSafeInteger(p.repeatCount)||p.repeatCount<1||p.repeatCount>4||
    !['ONE','FUTURE','SERIES'].includes(p.scope)||
    typeof p.when!=='string'||!/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d$/.test(p.when))
   throw Error('隔離場次欄位不合法');
  const parse=w=>Date.parse(w.replace(' ','T')+':00+08:00');
  const date=parse(p.when);
  if(!Number.isFinite(date)||new Date(date+28800000).toISOString().slice(0,16)!==p.when.replace(' ','T')||
     (p.operation!=='CANCEL'&&date<=now))
   throw Error('場次日期無效或已經過期');
  const meta=s.b02.sessions,existing=s.slots.find(z=>z.id===p.slotId);
  let ids=[];
  if(p.operation==='CREATE'){
   if(p.slotId!==''||p.scope!=='ONE'||s.slots.length+p.repeatCount>8)
    throw Error('測試最多八個時段，新增不得指定舊時段ID');
   const available='ABCDEFGH'.split('').map(x=>'SIM-SLOT-'+p.experiment+'-'+x)
    .filter(id=>!s.slots.some(z=>z.id===id));
   if(available.length<p.repeatCount)throw Error('可用時段編號不足');
   const group=p.repeatCount>1?'SIM-G-'+String(now).slice(-10):'';
   for(let i=0;i<p.repeatCount;i++){
    const id=available[i],when=new Date(date+i*7*86400000+28800000).toISOString().slice(0,16).replace('T',' ');
    s.slots.push({id,experiment:p.experiment,when,capacity:p.capacity});
    meta[id]={title:p.title,place:p.place,minutes:p.minutes,status:'OPEN',group};ids.push(id);
   }
  }else{
   if(!existing||existing.experiment!==p.experiment)throw Error('場次不存在或實驗別不一致');
   const group=meta[p.slotId]?.group||'';
   ids=(p.scope==='ONE'||!group)?[p.slotId]:s.slots.filter(z=>
    z.experiment===p.experiment&&meta[z.id]?.group===group&&
    (p.scope==='SERIES'||parse(z.when)>=parse(existing.when))).map(z=>z.id);
   if(p.operation==='UPDATE'){
    if(p.scope!=='ONE'&&p.when!==existing.when)throw Error('批次操作不得移動歷史預約時間');
    for(const id of ids){
     const slot=s.slots.find(z=>z.id===id),oldMeta=meta[id];
     if(oldMeta?.status==='CANCELLED')throw Error('已取消場次不能直接再開放');
     if(study1UnifiedCapacity_(s,id,now)+s.waitlist.entries.filter(e=>e.slotId===id&&e.status==='OFFERED'&&e.expiresAt>now).length>p.capacity)throw Error('新容量低於現有預約與有效候補邀請');
     if(id===p.slotId&&slot.when!==p.when&&s.applications.some(a=>a.slotId===id))
      throw Error('已有預約歷史，須先逐人處理，禁止靜默改期');
     if(id===p.slotId&&slot.when!==p.when&&
       s.waitlist.entries.some(e=>e.slotId===id))
      throw Error('已有候補現況紀錄，禁止靜默改期並改寫B09／B12來源');
     if(id===p.slotId)slot.when=p.when;
     slot.capacity=p.capacity;
     meta[id]={title:p.title,place:p.place,minutes:p.minutes,status:oldMeta?.status||'OPEN',group};
    }
   }else{
    for(const id of ids){
     const oldMeta=meta[id];
     if(oldMeta?.status==='CLOSED')throw Error('已結案場次不可取消');
     if(study1WaitlistPending_(s,id).length)
      throw Error('場次仍有WAITING／OFFERED候補，須先逐筆安全結束，拒絕靜默取消');
     meta[id]={title:oldMeta?.title||p.title,place:oldMeta?.place||p.place,
      minutes:oldMeta?.minutes||p.minutes,status:'CANCELLED',group};
    }
   }
  }
  study1UnifiedValidateSlots_(s.slots);
  // One shared TEST calendar must not create overlapping sessions in the same experiment.
  for(const a of s.slots){
   if(s.b02.sessions[a.id]?.status==='CANCELLED')continue;
   const aStart=parse(a.when),aEnd=aStart+(s.b02.sessions[a.id]?.minutes||120)*60000;
   for(const b of s.slots){
    if(a.id===b.id||a.experiment!==b.experiment||s.b02.sessions[b.id]?.status==='CANCELLED')continue;
    const bStart=parse(b.when),bEnd=bStart+(s.b02.sessions[b.id]?.minutes||120)*60000;
    if(aStart<bEnd&&bStart<aEnd)throw Error('同一實驗存在重疊場次：'+a.id+'／'+b.id);
   }
  }
  s.b02.history.push({at:new Date(now).toISOString(),action:p.operation,ids});
  s.b02.history=s.b02.history.slice(-12);return;
 }
 if(action==='ADMIN_B02_ATTEND'){
  if(Object.keys(p).sort().join(',')!=='attendance,id,note,progress'||
   !/^SIM-[0-9]{3}$/.test(p.id)||!s.applications.some(a=>a.id===p.id&&a.slotId)||
   !['PENDING','PRESENT','LATE','ABSENT'].includes(p.attendance)||
   !['NOT_STARTED','IN_PROGRESS','PARTIAL','COMPLETE'].includes(p.progress)||
   typeof p.note!=='string'||p.note.length>80||/[<>]/.test(p.note))
   throw Error('只能更新有預約關聯的虛構參與者');
  const target=s.applications.find(a=>a.id===p.id);
  if(['CLOSED','CANCELLED'].includes(s.b02.sessions[target.slotId]?.status))
   throw Error('場次已行政結案或取消；須依權責重新開啟後才能更正出席與施測');
  const before=s.b02.attendance[p.id]||{attendance:'PENDING',progress:'NOT_STARTED',note:''};
  s.b02.attendance[p.id]={attendance:p.attendance,progress:p.progress,note:p.note};
  if(before.attendance!==p.attendance||before.progress!==p.progress||before.note!==p.note){
   s.b04.history.push({id:p.id,field:'attendanceAndProgress',
     before:before.attendance+' / '+before.progress+(before.note?' / '+before.note:''),
     after:p.attendance+' / '+p.progress+(p.note?' / '+p.note:''),
     reason:'B02場次面板更新（未另填更正原因）',actor:'OWNER',at:new Date(now).toISOString()});
   s.b04.history=s.b04.history.slice(-30);
  }
  s.b02.history.push({at:new Date(now).toISOString(),action:'ATTEND',ids:[p.id]});
  s.b02.history=s.b02.history.slice(-12);return;
 }


 if(action==='ADMIN_B05_CLOSURE'){
  if(Object.keys(p).sort().join(',')!=='action,handoff,reason,slotId'||
     !['CLOSE','REOPEN'].includes(p.action)||typeof p.slotId!=='string'||
     !/^SIM-SLOT-E[12]-[A-Z]$/.test(p.slotId)||
     typeof p.reason!=='string'||p.reason.trim().length<4||p.reason.length>120||/[<>]/.test(p.reason)||
     typeof p.handoff!=='string'||p.handoff.length>250||/[<>]/.test(p.handoff))
   throw Error('B05結案／重開須指定場次與至少四字的人工確認原因');
  const slot=s.slots.find(x=>x.id===p.slotId);
  if(!slot)throw Error('B05場次不存在');
  const before=s.b02.sessions[slot.id]?.status||'OPEN';
  if(p.action==='CLOSE'&&before!=='OPEN')throw Error('場次已結案或已取消');
  if(p.action==='REOPEN'&&before!=='CLOSED')throw Error('只有已行政結案場次可重新開啟');
  if(p.action==='CLOSE'){
   if(study1WaitlistPending_(s,slot.id).length)
    throw Error('仍有未處理候補或虛構邀請，不可直接行政結案');
   const start=Date.parse(slot.when.replace(' ','T')+':00+08:00');
   if(!Number.isFinite(start)||start>now)throw Error('尚未開始的場次不能提前行政結案');
  }
  const people=s.applications.filter(a=>a.slotId===slot.id&&a.phase!=='CANCELLED');
  const issues=people.filter(a=>{
   const t=s.b02.attendance[a.id];
   return !t||t.attendance==='PENDING'||t.progress!=='COMPLETE';
  }).length;
  if(p.action==='CLOSE'&&issues>0&&p.handoff.trim().length<4)
   throw Error('仍有待確認出席或未完成施測，需填後續交接紀錄才可人工結案');
  const at=new Date(now).toISOString();
  if(p.action==='CLOSE'){
   const m=s.b02.sessions[slot.id]||{title:'研究場次',place:'',minutes:120,group:'',status:'OPEN'};
   s.b02.sessions[slot.id]={...m,status:'CLOSED'};
   s.b05.closures[slot.id]={actor:'OWNER',at,reason:p.reason.trim(),
     handoff:p.handoff.trim(),issues};
  }else{
   s.b02.sessions[slot.id]={...s.b02.sessions[slot.id],status:'OPEN'};
   delete s.b05.closures[slot.id];
  }
  s.b05.history.push({action:p.action,actor:'OWNER',at,slotId:slot.id,
   before,after:p.action==='CLOSE'?'CLOSED':'OPEN',
   issues,reason:p.reason.trim(),handoff:p.handoff.trim()});
  s.b05.history=s.b05.history.slice(-32);
  s.b02.history.push({action:p.action==='CLOSE'?'ADMIN_CLOSE':'ADMIN_REOPEN',at,ids:[slot.id]});
  s.b02.history=s.b02.history.slice(-12);
  return;
 }

 if(action==='ADMIN_B07_ITEM_REVIEW'){
  if(Object.keys(p).sort().join(',')!=='id,reason,stage,status'||
     typeof p.id!=='string'||!/^SIM-[0-9]{3}$/.test(p.id)||
     !s.applications.some(a=>a.id===p.id&&
      STUDY1_B07_STAGES_[a.experiment]?.includes(p.stage))||
     !['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'].includes(p.status)||
     !['SOURCE_CHECK','DOCUMENT_CHECK','PI_REVIEW_REQUEST'].includes(p.reason))
   throw Error('B07階段項目僅允許既有虛構申請的待核分類，禁止金額或付款');
  study1B07Verify_(s);
  const key=p.id+':'+p.stage;
  const previous=s.b07.itemReviews[key]?.status||'UNRECORDED';
  if(previous===p.status)throw Error('B07階段項目未變更，禁止重複項目事件');
  const at=new Date(now).toISOString();
  s.b07.itemReviews[key]={status:p.status,actor:'OWNER',at};
  s.b07.itemHistory.push({id:p.id,stage:p.stage,from:previous,to:p.status,
   reason:p.reason,actor:'OWNER',at});
  s.b07.itemHistory=s.b07.itemHistory.slice(-32);
  return; // No amounts, payee/payer, entitlement, receipt, or payment.
 }

 if(action==='ADMIN_B07_REVIEW'){
  // These are pending document/source checks, NEVER a financial status.
  if(Object.keys(p).sort().join(',')!=='id,reason,status'||
     typeof p.id!=='string'||!/^SIM-[0-9]{3}$/.test(p.id)||
     !s.applications.some(a=>a.id===p.id)||
     !['SOURCE_PENDING','DOCUMENTS_PENDING','PI_REVIEW_PENDING'].includes(p.status)||
     !['SOURCE_CHECK','DOCUMENT_CHECK','PI_REVIEW_REQUEST'].includes(p.reason))
    throw Error('B07只能記錄既有虛構代碼的待核行政準備狀態');
  study1B07Verify_(s);
  const previous=s.b07.reviews[p.id]?.status||'UNRECORDED';
  if(previous===p.status)throw Error('B07狀態沒有實際變更，拒絕重複行政紀錄');
  const at=new Date(now).toISOString();
  s.b07.reviews[p.id]={status:p.status,actor:'OWNER',at};
  s.b07.history.push({id:p.id,from:previous,to:p.status,
   reason:p.reason,actor:'OWNER',at});
  s.b07.history=s.b07.history.slice(-12);
  return; // No money, approved amounts, receipts, identity, files or payment.
 }

 if(action==='ADMIN_B04_NOTE'){
  if(Object.keys(p).sort().join(',')!=='id,note,reason'||
     !/^SIM-[0-9]{3}$/.test(p.id)||!s.applications.some(a=>a.id===p.id)||
     typeof p.note!=='string'||p.note.length>180||/[<>]/.test(p.note)||
     typeof p.reason!=='string'||p.reason.trim().length<4||
     p.reason.length>120||/[<>]/.test(p.reason))
   throw Error('B04更正需既有參與者代碼、行政備註及至少四字更正原因');
  const previous=s.b04.notes[p.id]||'';
  if(previous===p.note)throw Error('B04行政備註未變更，無需建立更正紀錄');
  s.b04.notes[p.id]=p.note;
  s.b04.history.push({id:p.id,field:'adminNote',before:previous,after:p.note,
    reason:p.reason.trim(),actor:'OWNER',at:new Date(now).toISOString()});
  s.b04.history=s.b04.history.slice(-30);
  return;
 }
 /* Atomic B11 configuration change to the existing synthetic fixture.
  * The top-level transaction already checks owner, CLOSED flags, ScriptLock,
  * expectedRevision, idempotency, rollback and post-write readback. */
 if(action==='ADMIN_B11_SETTINGS'){
  if(Object.keys(p).sort().join(',')!=='modes,release,scope,site'||
    p.release!=='TEST_ONLY'||!['E1','E2','ALL'].includes(p.scope)||
    !p.modes||typeof p.modes!=='object'||Array.isArray(p.modes))
   throw Error('B11僅允許指定實驗範圍的虛構設定，不允許正式發布');
  const selected=p.scope==='ALL'?['E1','E2']:[p.scope];
  if(Object.keys(p.modes).sort().join(',')!==selected.slice().sort().join(','))
   throw Error('B11實驗範圍與修改欄位不一致');
  const nextRecruitment=JSON.parse(JSON.stringify(s.recruitment));
  for(const exp of selected){
   const mode=p.modes[exp];
   if(typeof mode!=='string'||!['DEMO_OPEN','COMING_SOON','HIDDEN'].includes(mode))
    throw Error('B11只能選擇已核准的虛構網站顯示模式');
   nextRecruitment[exp]={year:exp==='E1'?2026:2027,mode};
  }
  study1UnifiedValidateRecruitment_(nextRecruitment);
  let nextConfig=s.config;
  if(p.site!==null){
   if(!p.site||typeof p.site!=='object'||Array.isArray(p.site)||
     Object.keys(p.site).sort().join(',')!=='emailTemplate,notice,title'||
     typeof p.site.title!=='string'||p.site.title.length>160||
     typeof p.site.notice!=='string'||p.site.notice.length>200||
     typeof p.site.emailTemplate!=='string'||p.site.emailTemplate.length>200||
     Object.values(p.site).some(x=>/[<>]/.test(x)))
    throw Error('B11虛構全站文字草稿欄位不合法');
   nextConfig={title:p.site.title,notice:p.site.notice,
     emailTemplate:p.site.emailTemplate};
  }
  if(JSON.stringify(nextRecruitment)===JSON.stringify(s.recruitment)&&
     JSON.stringify(nextConfig)===JSON.stringify(s.config))
   throw Error('B11沒有實質設定變更，無需新增測試交易');
  s.recruitment=nextRecruitment;s.config=nextConfig;
  return; // Explicit TEST_ONLY; no REC, approval, real mail, or deployment.
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
   if(s.waitlist.entries.some(e=>e.slotId===old.id)&&
      (!next||next.experiment!==old.experiment||next.when!==old.when))
    throw Error('舊版時段編輯器不得移除或移動已有候補現況的場次');
   if(s.applications.some(a=>a.slotId===old.id)&&
      (!next||next.experiment!==old.experiment||next.when!==old.when))
    throw Error('已有歷史預約的時段不得刪除或變更日期／實驗');
   if(next&&study1UnifiedCapacity_(s,old.id,now)+
      s.waitlist.entries.filter(e=>e.slotId===old.id&&
       e.status==='OFFERED'&&e.expiresAt>now).length>next.capacity)
    throw Error('測試容量低於有效預約與候補邀請保留總額');
  }
  // Legacy slot editor and B02 graphical calendar must not silently diverge.
  // Preserve all B02-managed slot IDs and prevent overlaps with their effective durations.
  for(const old of s.slots){
   if(s.b02.sessions[old.id]&&!p.slots.some(x=>x.id===old.id))
    throw Error('已有B02場次資料，不能從舊版時段編輯器直接移除；請用行事曆處理');
  }
  for(const a of p.slots){
   const startA=Date.parse(a.when.replace(' ','T')+':00+08:00');
   const endA=startA+(s.b02.sessions[a.id]?.minutes||120)*60000;
   if(s.b02.sessions[a.id]?.status==='CANCELLED')continue;
   for(const other of p.slots){
    if(a.id===other.id||a.experiment!==other.experiment||
       s.b02.sessions[other.id]?.status==='CANCELLED')continue;
    const startB=Date.parse(other.when.replace(' ','T')+':00+08:00');
    const endB=startB+(s.b02.sessions[other.id]?.minutes||120)*60000;
    if(startA<endB&&startB<endA)throw Error('舊版時段設定會造成同實驗場次重疊');
   }
  }
  s.slots=p.slots.map(x=>({id:x.id,experiment:x.experiment,when:x.when,capacity:x.capacity}));return;
 }
 if(action==='ADMIN_RECRUITMENT'){
  if(Object.keys(p).join(',')!=='settings')throw Error('網站實驗顯示設定欄位不合法');
  study1UnifiedValidateRecruitment_(p.settings);
  s.recruitment=JSON.parse(JSON.stringify(p.settings));
  return;
 }
 if(action==='ADMIN_E2_WEEKS'){
  if(Object.keys(p).join(',')!=='weeks')throw Error('實驗二八週測試時程只允許指定週次');
  study1UnifiedValidateE2Weeks_(p.weeks);
  s.e2Weeks=p.weeks.map(w=>({week:w.week,date:w.date,notes:w.notes}));return;
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
 if(action==='ADMIN_WAITLIST_POLICY'){
  if(Object.keys(p).sort().join(',')!=='experiment,level,mode,slotId,stage'||
   !['E1','E2'].includes(p.experiment)||
   !['EXPERIMENT','STAGE','ACTIVITY'].includes(p.level)||
   !['INHERIT','CLOSED','MANUAL_TEST'].includes(p.mode)||
   (p.level==='EXPERIMENT'&&p.mode==='INHERIT'))
   throw Error('純TEST候補設定不得包含自動通知或正式開放模式');
  const stages=STUDY1_B07_STAGES_[p.experiment];
  if(p.level==='EXPERIMENT'){
   if(p.stage!==null||p.slotId!==null)throw Error('實驗層不得指定階段或活動');
   s.waitlist.settings.experiments[p.experiment]=p.mode;
  }else if(p.level==='STAGE'){
   if(p.slotId!==null||!stages.includes(p.stage))
    throw Error('實驗與候補階段組合不合法');
   s.waitlist.settings.stages[p.experiment+':'+p.stage]=p.mode;
  }else{
   const slot=s.slots.find(x=>x.id===p.slotId&&x.experiment===p.experiment);
   if(!slot||!stages.includes(p.stage))
    throw Error('候補活動必須綁定原存在場次與同實驗已知階段');
   const hasActive=s.waitlist.entries.some(e=>e.slotId===slot.id&&
    ['WAITING','OFFERED'].includes(e.status));
   const previous=study1WaitlistPolicy_(s,slot.id);
   if(hasActive&&previous.stage!==p.stage)
    throw Error('仍有候補或期限內邀請，不可更動活動研究階段');
   s.waitlist.settings.activities[slot.id]={stage:p.stage,mode:p.mode};
  }
  study1WaitlistSettingsVerify_(s);
  for(const e of s.waitlist.entries){
   if(['WAITING','OFFERED'].includes(e.status)&&
    study1WaitlistPolicy_(s,e.slotId).mode!=='MANUAL_TEST')
    throw Error('有尚未處理的候補或有效邀請，不可關閉其實驗、階段或活動');
  }
  return;
 }
 /* §70-E: close exactly one TEST queue entry before a B02 cancellation.
  * Never offers next FIFO, reschedules, cancels an appointment or sends mail.
  * Live OFFERED is never revoked; expired OFFERED requires OWNER confirmation.
  * OWNER_CLOSED distinguishes an admin decision from visitor DECLINED. */
 if(action==='ADMIN_WAITLIST_RESOLVE'){
  if(Object.keys(p).sort().join(',')!=='ack,expectedStatus,id,reason,slotId'||
    p.ack!=='OWNER_TEST_PRE_CANCEL_REVIEWED'||
    p.reason!=='TEST_SESSION_CANCELLATION'||
    !/^SIM-SLOT-E[12]-[A-H]$/.test(p.slotId)||
    !/^SIM-\d{3}$/.test(p.id)||
    !['WAITING','OFFERED'].includes(p.expectedStatus))
   throw Error('B02候補單筆核結須明確TEST確認與來源狀態');
  const slot=s.slots.find(x=>x.id===p.slotId),entry=s.waitlist.entries.find(x=>x.id===p.id);
  const person=byId(p.id);
  if(!slot||!entry||!person||entry.slotId!==slot.id||
     entry.experiment!==slot.experiment||person.experiment!==slot.experiment||
     person.phase!=='VERIFIED'||entry.status!==p.expectedStatus||
     ['CANCELLED','CLOSED'].includes(s.b02.sessions[slot.id]?.status)||
     study1WaitlistPolicy_(s,slot.id).mode!=='MANUAL_TEST')
   throw Error('候補或場次來源、狀態、實驗或權限已變更，不得核結');
  if(entry.status==='OFFERED'){
   if(now<entry.expiresAt)
    throw Error('TEST邀請仍在有效期限內，不能由OWNER靜默撤銷');
   entry.status='EXPIRED';entry.closedAt=now;return;
  }
  if(s.waitlist.entries.some(x=>x.slotId===slot.id&&x.status==='OFFERED'))
   throw Error('仍有未核結TEST邀請，須先逐筆檢查後再處理WAITING');
  const oldest=s.waitlist.entries.find(x=>x.slotId===slot.id&&x.status==='WAITING');
  if(!oldest||oldest.id!==entry.id)
   throw Error('人工處理WAITING必須符合該場次既有FIFO順序');
  entry.status='OWNER_CLOSED';entry.closedAt=now;return;
 }
 if(action==='WAITLIST_ADVANCE'){
  if(Object.keys(p).join(',')!=='slotId'||typeof p.slotId!=='string'||
   !/^SIM-SLOT-E[12]-[A-H]$/.test(p.slotId))
   throw Error('候補遞補只接受虛構場次代碼');
  study1WaitlistAdvance_(s,p.slotId,now);return;
 }
 if(['WAITLIST_JOIN','WAITLIST_ACCEPT','WAITLIST_DECLINE'].includes(action)){
  const joining=action==='WAITLIST_JOIN';
  if(joining?Object.keys(p).sort().join(',')!=='id,slotId':
   Object.keys(p).join(',')!=='id')throw Error('候補指令欄位不合法');
  if(!/^SIM-[0-9]{3}$/.test(p.id))throw Error('非虛構候補代碼');
  const a=byId(p.id),e=s.waitlist.entries.find(x=>x.id===p.id);
  if(!a||a.eligible!==true)throw Error('未達TEST候補資格');
  if(joining){
   const slot=s.slots.find(x=>x.id===p.slotId&&x.experiment===a.experiment);
   if(a.phase!=='VERIFIED'||a.slotId!==null||e||s.waitlist.entries.length>=8||
    !slot||Date.parse(slot.when.replace(' ','T')+':00+08:00')<=now+600000||
    ['CANCELLED','CLOSED'].includes(s.b02.sessions[slot.id]?.status)||
    study1WaitlistFree_(s,slot.id,now)!==0||study1WaitlistPolicy_(s,slot.id).mode!=='MANUAL_TEST')
    throw Error('候補僅限同實驗已額滿、未取消之未來虛構時段');
   s.waitlist.entries.push({id:a.id,slotId:slot.id,experiment:a.experiment,
    seq:++s.waitlist.nextSeq,joinedAt:now,status:'WAITING',
    offeredAt:null,expiresAt:null,closedAt:null});return;
  }
  if(!e||a.phase!=='VERIFIED'||!['WAITING','OFFERED'].includes(e.status))
   throw Error('虛構候補無可執行的邀請');
  if(action==='WAITLIST_DECLINE'){
   e.status='DECLINED';e.closedAt=now;return;
  }
  const slot=s.slots.find(x=>x.id===e.slotId&&x.experiment===a.experiment);
  if(e.status!=='OFFERED'||e.expiresAt<=now||!slot||
   study1WaitlistPolicy_(s,slot.id).mode!=='MANUAL_TEST'||
   Date.parse(slot.when.replace(' ','T')+':00+08:00')<=now||
   ['CANCELLED','CLOSED'].includes(s.b02.sessions[slot.id]?.status)||
   study1UnifiedCapacity_(s,slot.id,now)>=slot.capacity)
   throw Error('候補邀請已過期、場次無效或無可核實名額');
  // The same locked, CAS-protected core creates a synthetic hold. The
  // accepted offer consumes its reserved capacity, never auto-confirms.
  study1FixtureHold_(s,a,slot,cmd.requestId,now,outerLock);
  a.slotId=slot.id;a.phase='HELD';a.holdUntil=now+900000;
  a.consentVersion=s.policy.consent[a.experiment].version;
  a.consentSha256=s.policy.consent[a.experiment].sha256;
  a.consentReviewedAt=null;a.consentReviewedVersion=null;
  a.consentReviewedSha256=null;a.pdfDemoReviewedAt=null;
  a.pdfDemoSha256=null;a.signatureDemo=false;
  e.status='ACCEPTED';e.closedAt=now;return;
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
  if(action==='HOLD'&&s.waitlist.entries.some(e=>e.id===a.id&&['WAITING','OFFERED'].includes(e.status)))
   throw Error('候補未退出或邀請尚有效，禁止繞過順序直接暫留');
  // Expired synthetic holds can be renewed only after a fresh capacity check.
  const expiredHold=['HELD','CONSENTED'].includes(a.phase)&&
   Number.isFinite(a.holdUntil)&&a.holdUntil<=now;
  if(action==='HOLD'&&a.phase!=='VERIFIED'&&!expiredHold)
   throw Error('尚未完成測試驗證');
  if(action==='MOVE'&&a.phase!=='CONFIRMED')throw Error('只允許已確認虛構預約改期');
  if(Object.keys(p).sort().join(',')!=='id,slotId')throw Error('時段操作欄位不完整');
  // A previously ACCEPTED FIFO offer binds an expired TEST hold to its
  // original invitation. This is not a MOVE authorization: only a confirmed
  // booking may MOVE to another future open session. Check BEFORE any hold
  // adapter operation so a later validator is not the first line of defence.
  const acceptedSource=s.waitlist.entries.find(e=>e.id===a.id&&e.status==='ACCEPTED');
  if(action==='HOLD'&&expiredHold&&acceptedSource&&p.slotId!==acceptedSource.slotId)
   throw Error('已接受候補暫留到期不能跨場次續留；原FIFO來源須保留，僅已確認預約可改期');
  const slot=s.slots.find(x=>x.id===p.slotId&&x.experiment===a.experiment);
  if(!slot||(slot.id===a.slotId&&!expiredHold)||
     // A WAITING FIFO queue has priority after capacity increases or cancellations.
     study1WaitlistPending_(s,p.slotId).some(e=>e.status==='WAITING')||
     Date.parse(slot.when.replace(' ','T')+':00+08:00')<=now||
     ['CANCELLED','CLOSED'].includes(s.b02.sessions[slot.id]?.status)||
     !(study1UnifiedCoreAvailability_(s,now).some(x=>x.slotId===slot.id&&x.remaining>0))||
     study1WaitlistFree_(s,slot.id,now)<1)
    throw Error('測試時段不存在、重複、已開始或已額滿');
  if(action==='HOLD')study1FixtureHold_(s,a,slot,cmd.requestId,now,outerLock);
  a.slotId=slot.id;
  if(action==='HOLD'){a.phase='HELD';a.holdUntil=now+900000;
   a.consentVersion=s.policy.consent[a.experiment].version;
   a.consentSha256=s.policy.consent[a.experiment].sha256;
   a.consentReviewedAt=null;a.consentReviewedVersion=null;
   a.consentReviewedSha256=null;a.pdfDemoReviewedAt=null;a.pdfDemoSha256=null;a.signatureDemo=false;}
  else study1UnifiedNotify_(s,a,'MOVE');
  return;
 }
 if(action==='PDF_DEMO_REVIEW'){
  if(a.phase!=='HELD'||a.holdUntil<=now||
    Object.keys(p).sort().join(',')!=='id,sha256'||
    p.sha256!==study1UnifiedPdfFixture_().sha256||
    a.pdfDemoReviewedAt!==null&&a.pdfDemoReviewedAt!==undefined)
    throw Error('虛構 PDF 閱覽紀錄需有效暫留及完整雜湊');
  // Demo review metadata cannot be interpreted as genuine REC PDF reading.
  a.pdfDemoReviewedAt=now;a.pdfDemoSha256=p.sha256;return;
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
  if(a.phase!=='CONSENTED'||a.holdUntil<=now||
     ['CANCELLED','CLOSED'].includes(s.b02.sessions[a.slotId]?.status)||
     Object.keys(p).join(',')!=='id')
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

/**
 * Owner-only, zero-persistence whole-site smoke test. It executes the same
 * E1/E2 transitions and synthetic OTP/booking kernels solely in memory.
 * It never reads existing fixtures, REC, Sheets, real email or signatures.
 * PASS is not research approval or live participant acceptance.
 */
function study1UnifiedPreviewSelfTest(){
 study1UnifiedAssertOwner_();
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(8000))throw Error('整站記憶體驗收暫時鎖定');
 try{
  study1SandboxBookingFlags_();
  const now=Date.now(),s=study1UnifiedInitial_(),checks=[];
  const date=days=>new Date(now+days*86400000+8*3600000)
   .toISOString().slice(0,16).replace('T',' ');
  s.slots=[
   {id:'SIM-SLOT-E1-A',experiment:'E1',when:date(3),capacity:2},
   {id:'SIM-SLOT-E1-B',experiment:'E1',when:date(4),capacity:2},
   {id:'SIM-SLOT-E2-A',experiment:'E2',when:date(5),capacity:2}
  ];
  const check=(id,ok)=>{if(ok!==true)throw Error('整站記憶體驗收失敗：'+id);checks.push(id);};
  let seq=0;
  const step=(action,payload)=>{
   const cmd=study1UnifiedRequireCommand_({action,payload,expectedRevision:s.revision,
    requestId:'REQ-SIM-ACCEPTANCE_'+String(++seq).padStart(8,'0')});
   study1UnifiedTransition_(s,cmd,now,lock);
   study1UnifiedValidateSlots_(s.slots);
   study1UnifiedValidatePolicy_(s.policy);
  };
  const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
   frequentPractice:false,joinedE1:false};
  step('START',{experiment:'E1'});
  step('SCREEN',{id:'SIM-001',answers});
  check('E1_SCREEN',s.applications[0].phase==='SCREENED');
  step('OTP_REQUEST',{id:'SIM-001'});
  step('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
  check('E1_OTP',s.applications[0].phase==='VERIFIED');
  step('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
  check('E1_HOLD',s.applications[0].phase==='HELD'&&study1UnifiedCapacity_(s,'SIM-SLOT-E1-A',now)===1);
  step('PDF_DEMO_REVIEW',{id:'SIM-001',sha256:study1UnifiedPdfFixture_().sha256});
  check('SYNTHETIC_PDF_ONLY',s.applications[0].pdfDemoReviewedAt===now);
  step('CONSENT_REVIEW',{id:'SIM-001',version:s.policy.consent.E1.version,sha256:s.policy.consent.E1.sha256});
  step('CONSENT',{id:'SIM-001',accepted:true,version:s.policy.consent.E1.version,signature:'SIMULATED_SIGN_ONLY'});
  check('E1_TEST_CONSENT',s.applications[0].phase==='CONSENTED'&&s.applications[0].signatureDemo===true);
  step('CONFIRM',{id:'SIM-001'});
  check('E1_CONFIRM',s.applications[0].phase==='CONFIRMED'&&s.notifications.length===1);
  step('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'});
  check('E1_MOVE',s.applications[0].slotId==='SIM-SLOT-E1-B');
  step('CANCEL',{id:'SIM-001'});
  check('E1_CANCEL',s.applications[0].phase==='CANCELLED'&&study1UnifiedCapacity_(s,'SIM-SLOT-E1-B',now)===0);
  step('START',{experiment:'E2'});
  step('SCREEN',{id:'SIM-002',answers:{...answers,joinedE1:true}});
  check('E2_EXCLUSION',s.applications[1].phase==='INELIGIBLE');
  step('START',{experiment:'E2'});
  step('SCREEN',{id:'SIM-003',answers});
  check('E2_SCREEN',s.applications[2].phase==='SCREENED');
  step('OTP_REQUEST',{id:'SIM-003'});
  step('OTP_VERIFY',{id:'SIM-003',code:'00000000'});
  step('HOLD',{id:'SIM-003',slotId:'SIM-SLOT-E2-A'});
  check('E2_OTP_AND_HOLD',s.applications[2].phase==='HELD');
  step('ADMIN_NOTIFY_ATTEMPT',{index:0,result:'FAIL'});
  check('NOTIFY_SIM_FAILURE',s.notifications[0].status==='SIM_FAILED'&&s.notifications[0].attempts===1);
  step('ADMIN_NOTIFY_ATTEMPT',{index:0,result:'SIM_OK'});
  check('NOTIFY_SIM_RETRY',s.notifications[0].status==='SIM_DELIVERED'&&s.notifications[0].attempts===2);
  const readiness=study1UnifiedFormalReadiness_(s);
  check('FORMAL_GATES_BLOCKED',readiness.activationAllowed===false&&readiness.mode==='FORMAL_BLOCKED'&&
   readiness.passed===0&&readiness.gates.every(g=>g.state!=='PASS')&&
   Object.values(readiness.provenance).every(p=>p.sourceBytesVerified===false));
  let denied=false;try{study1UnifiedProductionAdapter_().readParticipant();}catch(e){denied=true;}
  check('FORMAL_ADAPTER_DENIED',denied);
  check('NO_RAW_SCREENING_ANSWERS',!JSON.stringify(s).includes('"answers"'));
  study1SandboxBookingFlags_();
  return {ok:true,mode:'OWNER_ONLY_IN_MEMORY',checks,passed:checks.length,failed:0,
   persistentWrites:0,formalMode:'FORMAL_BLOCKED',recPdfApproved:false,
   ownerLiveAcceptance:'NOT_VERIFIED',realEmailSent:false};
 }finally{lock.releaseLock();}
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
  const initialStored=PropertiesService.getScriptProperties().getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
  const s=study1UnifiedRead_();
  if(PropertiesService.getScriptProperties().getProperty(STUDY1_UNIFIED_FIXTURE_KEY_)!==initialStored)
   throw Error('資料讀取期間發生競寫，拒絕操作');
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
  study1UnifiedValidateSlots_(next.slots);study1UnifiedValidateE2Weeks_(next.e2Weeks);
  study1UnifiedValidateRecruitment_(next.recruitment);
  study1B07Verify_(next);study1WaitlistVerify_(next);
  study1PostCancelSummary_(next);
  next.revision++;
  next.requests.push({id:c.requestId,fingerprint});
  const raw=JSON.stringify(next);
  const stored=study1UnifiedStoredEncode_(raw);
  const prop=PropertiesService.getScriptProperties();
  const beforeBytes=prop.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
  if(beforeBytes!==initialStored)
   throw Error('原始資料在版本鎖內發生非預期變動；已拒絕覆寫');
  try{
   prop.setProperty(STUDY1_UNIFIED_FIXTURE_KEY_,stored);
   const readback=prop.getProperty(STUDY1_UNIFIED_FIXTURE_KEY_);
   if(readback!==stored||study1UnifiedStoredDecode_(readback)!==raw)
    throw Error('統一測試流程寫入後回讀失敗');
  }catch(e){
   // Do not overwrite a noncooperating writer's bytes during recovery.
   try{
    study1UnifiedRestoreOwnedWrite_(prop,STUDY1_UNIFIED_FIXTURE_KEY_,beforeBytes,stored);
   }catch(recovery){
    throw Error('資料寫入狀態不明或發生競寫；已停止後續操作，須由管理者核查');
   }
   throw Error('本次寫入未完成；已回復寫入前版本（或資料未變更）：'+String(e.message||e));
  }
  return {...study1UnifiedView_(next),deduplicated:false};
 }catch(error){
  study1B12FailureDiagnostic_('UNIFIED',error);
  throw error;
 }finally{lock.releaseLock();}
}
