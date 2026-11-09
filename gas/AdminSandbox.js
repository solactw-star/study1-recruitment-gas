/** Study1 isolated research-admin SANDBOX. Never accepts real participants. */
const STUDY1_ADMIN_OWNER_='solac.tw@gmail.com';
const STUDY1_ADMIN_PROPERTY_='STUDY1_SANDBOX_ADMIN_CONFIG_V1';
const STUDY1_ADMIN_SELFTEST_PROPERTY_='STUDY1_SANDBOX_SELFTEST_V1';
const STUDY1_SANDBOX_BOOKINGS_PROPERTY_='STUDY1_SANDBOX_BOOKINGS_V1';
function study1AdminOwnerRequired_(){
  // Fail closed if Google redacts the active caller identity. EffectiveUser
  // alone is the deploying account in execute-as-me apps, not the caller.
  // MYSELF /exec remains mandatory; this is defense in depth against
  // accidental deployment with ANYONE / ANYONE_ANONYMOUS access.
  const active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(effective!==STUDY1_ADMIN_OWNER_||active!==STUDY1_ADMIN_OWNER_){
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
      typeof x.id!=='string'||!/^test_q[1-6]$/.test(x.id)||typeof x.text!=='string'||!x.text.trim()||x.text.length>200||
      /[<>]/.test(x.text)||typeof x.required!=='boolean')throw Error('測試資格問題格式錯誤：'+(i+1));
    return {id:x.id,text:x.text.trim(),required:x.required};
  });
  value.testSlots=input.testSlots.map((x,i)=>{
    // Calendar validation is server-side: a shape-only regex accepts dates such
    // as 2027-02-30 and times such as 25:99, which cannot be booked safely.
    const match=x&&typeof x.start==='string'&&/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(x.start);
    const year=match?Number(match[1]):NaN,month=match?Number(match[2]):NaN;
    const day=match?Number(match[3]):NaN,hour=match?Number(match[4]):NaN,minute=match?Number(match[5]):NaN;
    const utc=match?new Date(Date.UTC(year,month-1,day,hour,minute)):null;
    const validStart=!!utc&&year>=2000&&year<=2100&&utc.getUTCFullYear()===year&&
      utc.getUTCMonth()+1===month&&utc.getUTCDate()===day&&
      utc.getUTCHours()===hour&&utc.getUTCMinutes()===minute;
    if(!x||typeof x!=='object'||Object.keys(x).some(k=>!['id','start','location','capacity'].includes(k))||
      typeof x.id!=='string'||!/^test_slot_[1-8]$/.test(x.id)||!validStart||
      typeof x.location!=='string'||!x.location.trim()||x.location.length>100||/[<>]/.test(x.location)||
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
  study1SandboxBookingFlags_();
  return {mode:'SANDBOX_ONLY',open:false,consentReady:false,
    store:'ScriptProperties:STUDY1_SANDBOX_ADMIN_CONFIG_V1',config:study1AdminPersisted_()};
}
/** Validate an unsaved admin draft on the server, without touching any property. */
function adminValidateSandboxConfig(input){
  study1AdminOwnerRequired_();
  study1SandboxBookingFlags_();
  return {mode:'SANDBOX_ONLY',open:false,consentReady:false,config:study1AdminValidate_(input)};
}
/** The same revision comparison is used by sandbox edits and disposable self-tests. */
function study1AdminRequireRevision_(current,expectedRevision){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('無效的設定版本');
  if(current.revision!==expectedRevision)throw Error('設定已由其他工作更新，請重新讀取後編輯');
}
function adminSaveSandboxConfig(input,expectedRevision){
  study1AdminOwnerRequired_();
  study1SandboxBookingFlags_();
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('無效的設定版本');
  const config=study1AdminValidate_(input);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw Error('另一項測試設定更新正在進行，請重新讀取');
  try{
    study1SandboxBookingFlags_();
    const current=study1AdminPersisted_();
    study1AdminRequireRevision_(current,expectedRevision);
    // The config editor and booking RPC share this script lock. A saved
    // capacity must never invalidate an existing ACTIVE test reservation.
    // This is read-only against the separate synthetic booking property.
    const existingState=study1SandboxBookingState_();
    study1SandboxBookingIntegrity_(existingState,current);
    const activeBookings=existingState.bookings.filter(b=>b.status==='ACTIVE');
    for(const slotId of new Set(activeBookings.map(b=>b.slotId))){
      const slot=config.testSlots.find(x=>x.id===slotId);
      const previous=current.testSlots.find(x=>x.id===slotId);
      const occupied=activeBookings.filter(b=>b.slotId===slotId).length;
      if(!slot||slot.capacity<occupied)
        throw Error('已有有效測試預約，不能移除時段或把容量調低於已預約數：'+slotId);
      // Changing a booked slot's date or location silently reschedules every
      // ACTIVE synthetic reservation. Require explicit MOVE/CANCEL first.
      if(!previous||slot.start!==previous.start||slot.location!==previous.location)
        throw Error('已有有效測試預約，不能直接變更時段日期或地點：'+slotId);
    }
    const newValue={schemaVersion:1,revision:current.revision+1,config};
    const payload=JSON.stringify(newValue);
    if(payload.length>7500)throw Error('測試設定過大');
    const properties=PropertiesService.getScriptProperties();
    properties.setProperty(STUDY1_ADMIN_PROPERTY_,payload);
    if(properties.getProperty(STUDY1_ADMIN_PROPERTY_)!==payload)throw Error('測試設定回讀不一致');
    return adminGetSandboxConfig();
  }finally{lock.releaseLock();}
}

/**
 * Explicit owner-only, disposable backend self-test. It never edits the real
 * sandbox admin config, OPEN/CONSENT_READY, other properties or research Sheets.
 */
function adminRunSandboxSelfTest(){
  study1AdminOwnerRequired_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw Error('其他測試設定工作進行中，請稍後重試');
  const p=PropertiesService.getScriptProperties();
  let created=false,payload='',result=null;
  let before,bookingBefore,openBefore,consentBefore;
  try{
    before=p.getProperty(STUDY1_ADMIN_PROPERTY_);
    bookingBefore=p.getProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_);
    openBefore=p.getProperty('OPEN');
    consentBefore=p.getProperty('CONSENT_READY');
    if(openBefore!=='false'||consentBefore!=='false')
      throw Error('正式收件關閉旗標未確認為 false，停止隔離自我測試');
    const current=study1AdminPersisted_();
    if(!Number.isSafeInteger(current.revision)||current.revision<0)throw Error('原測試設定版本異常');
    // A PASS must not conceal an already-corrupt isolated booking ledger.
    // Read and validate it without mutation before creating disposable data.
    study1SandboxBookingIntegrity_(study1SandboxBookingState_(),current);
    if(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)!==null)
      throw Error('自我測試鍵已存在，為保護既有資料不覆寫也不清除');
    const defaults=study1AdminDefault_();
    const draft={studyTitle:'〔自我測試〕暫存',researchIntro:defaults.researchIntro,
      eligibilityNote:defaults.eligibilityNote,screeningQuestions:defaults.screeningQuestions,
      testSlots:defaults.testSlots,emailTemplate:defaults.emailTemplate,
      pdfVersionNote:defaults.pdfVersionNote};
    const validated=study1AdminValidate_(draft);
    const record={purpose:'STUDY1_SANDBOX_SELFTEST_V1',revision:1,config:validated};
    payload=JSON.stringify(record);
    if(payload.length>7500)throw Error('暫存測試資料長度異常');
    created=true;
    p.setProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_,payload);
    const reread=p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_);
    if(reread!==payload)throw Error('隔離測試寫入／回讀不一致');
    const observed=JSON.parse(reread);
    if(observed.purpose!=='STUDY1_SANDBOX_SELFTEST_V1'||observed.revision!==1||
      observed.config.studyTitle!==draft.studyTitle)throw Error('隔離測試資料內容不符');
    let conflictDenied=false;
    try{study1AdminRequireRevision_(observed,0);}
    catch(e){conflictDenied=/其他工作更新/.test(String(e.message));}
    if(!conflictDenied)throw Error('過期 revision 未被拒絕');
    if(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)!==payload)
      throw Error('過期 revision 檢查意外修改測試資料');

    // Exercise the SAME booking transition used by the owner RPC, but persist
    // only within the disposable self-test key. Never touch actual booking rows.
    const bookingConfig={testSlots:[
      {id:'test_slot_1',start:'2027-01-01T10:00',location:'〔自我測試〕A',capacity:1},
      {id:'test_slot_2',start:'2027-01-02T10:00',location:'〔自我測試〕B',capacity:1}
    ]};
    let bookingState={schemaVersion:1,revision:0,bookings:[],requests:[]};
    const bookingChecks=[];
    const transact=input=>{
      const outcome=study1SandboxBookingMutation_(input,bookingState,bookingConfig);
      if(outcome.changed){
        record.bookingState=bookingState;
        payload=JSON.stringify(record);
        if(payload.length>7500)throw Error('隔離預約自我測試資料過大');
        p.setProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_,payload);
        if(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)!==payload)
          throw Error('隔離預約交易寫入／回讀不一致');
        const written=JSON.parse(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_));
        if(JSON.stringify(written.bookingState)!==JSON.stringify(bookingState))
          throw Error('隔離預約交易回讀內容不一致');
        bookingState=written.bookingState;
      }
      return outcome.view;
    };
    const make={action:'CREATE',bookingCode:'TST-001',slotId:'test_slot_1',
      requestId:'REQ-self-create001',expectedRevision:0};
    const createdBooking=transact(make);
    if(createdBooking.revision!==1||createdBooking.slots[0].remaining!==0)
      throw Error('隔離建立預約或名額扣減錯誤');
    bookingChecks.push('建立虛構預約、容量扣減並回讀');
    const savedPayload=payload;
    const deduped=transact(make);
    if(!deduped.deduplicated||deduped.revision!==1||payload!==savedPayload)
      throw Error('隔離預約冪等重試錯誤');
    bookingChecks.push('相同請求冪等重試，未產生重複紀錄');
    let fullRejected=false;
    try{transact({...make,bookingCode:'TST-002',requestId:'REQ-self-full0001',expectedRevision:1});}
    catch(e){fullRejected=/容量已滿/.test(String(e.message));}
    if(!fullRejected||payload!==savedPayload||bookingState.revision!==1)
      throw Error('隔離預約額滿防護未阻擋');
    bookingChecks.push('額滿拒絕、暫存版本不變');
    const movedBooking=transact({action:'MOVE',bookingCode:'TST-001',slotId:'test_slot_2',
      requestId:'REQ-self-move0001',expectedRevision:1});
    if(movedBooking.revision!==2||movedBooking.slots[0].remaining!==1||
      movedBooking.slots[1].remaining!==0)throw Error('隔離改期或名額轉移錯誤');
    bookingChecks.push('改期後原名額釋放、目標名額扣減並回讀');
    const cancelledBooking=transact({action:'CANCEL',bookingCode:'TST-001',slotId:null,
      requestId:'REQ-self-cancel01',expectedRevision:2});
    if(cancelledBooking.revision!==3||cancelledBooking.slots[1].remaining!==1||
       cancelledBooking.bookings[0].status!=='CANCELLED')
      throw Error('隔離取消後容量回復錯誤');
    bookingChecks.push('取消後容量回復、狀態更新並回讀');
    if(p.getProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_)!==bookingBefore)
      throw Error('既有隔離預約資料意外異動');
    bookingChecks.push('原測試預約資料及其 revision 未被更動');
    if(p.getProperty(STUDY1_ADMIN_PROPERTY_)!==before)
      throw Error('原管理測試設定被修改');
    if(p.getProperty('OPEN')!==openBefore||p.getProperty('CONSENT_READY')!==consentBefore)
      throw Error('正式收件關閉旗標在測試期間發生變更');
    result={ok:true,mode:'SANDBOX_ONLY',open:false,consentReady:false,
      checks:['管理者驗證','正式收件旗標均為 false 且未變更','既有隔離設定讀取','暫存測試寫入','暫存測試回讀',
        '過期 revision 拒絕覆寫','原管理設定未變'],mainRevision:current.revision,
      bookingChecks,bookingE2eVerified:true,bookingsUnchanged:true};
  }finally{
    try{
      if(created){
        if(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)!==payload)
          throw Error('測試鍵內容異動，為避免清除非本次資料而停止');
        p.deleteProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_);
        if(p.getProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)!==null)
          throw Error('隔離測試鍵刪除後回讀失敗');
      }
      // PASS requires a final read AFTER disposal and BEFORE releasing the
      // shared lock. Earlier checks alone cannot verify cleanup side effects.
      if(result){
        if(p.getProperty(STUDY1_ADMIN_PROPERTY_)!==before)
          throw Error('隔離自我測試清理後原設定發生異動');
        if(p.getProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_)!==bookingBefore)
          throw Error('隔離自我測試清理後原預約資料發生異動');
        if(p.getProperty('OPEN')!==openBefore||p.getProperty('CONSENT_READY')!==consentBefore)
          throw Error('隔離自我測試清理後正式收件旗標發生異動');
        if(study1AdminPersisted_().revision!==result.mainRevision)
          throw Error('隔離自我測試清理後設定 revision 發生異動');
        result.postCleanupVerified=true;
      }
    }finally{lock.releaseLock();}
  }
  if(!result)throw Error('隔離自我測試未完整完成');
  result.checks.push('暫存測試資料已清理');
  result.cleanupVerified=true;
  return result;
}

/** Synthetic bookings only. No human identifiers, emails, OTP or formal Sheets. */
function study1SandboxBookingState_(){
  const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_);
  if(raw===null)return {schemaVersion:1,revision:0,bookings:[],requests:[]};
  const parsed=JSON.parse(raw);
  if(!parsed||parsed.schemaVersion!==1||!Number.isSafeInteger(parsed.revision)||
    parsed.revision<1||!Array.isArray(parsed.bookings)||!Array.isArray(parsed.requests)||
    parsed.bookings.length>20||parsed.requests.length>35)throw Error('隔離預約資料版本或結構異常');
  for(const b of parsed.bookings){
    if(!b||Object.keys(b).sort().join(',')!=='code,slotId,status'||
      !/^TST-[0-9]{3}$/.test(b.code)||!/^test_slot_[1-8]$/.test(b.slotId)||
      !['ACTIVE','CANCELLED'].includes(b.status))throw Error('隔離預約內容異常');
  }
  for(const x of parsed.requests){
    if(!x||Object.keys(x).sort().join(',')!=='fingerprint,requestId'||
      !/^REQ-[A-Za-z0-9-]{8,50}$/.test(x.requestId)||
      typeof x.fingerprint!=='string'||x.fingerprint.length>120)throw Error('隔離請求歷史異常');
  }
  if(new Set(parsed.bookings.map(x=>x.code)).size!==parsed.bookings.length||
     new Set(parsed.requests.map(x=>x.requestId)).size!==parsed.requests.length)throw Error('隔離代碼重複');
  return parsed;
}
function study1SandboxBookingFlags_(){
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('OPEN')!=='false'||p.getProperty('CONSENT_READY')!=='false')
    throw Error('正式收件關閉旗標未確認，拒絕隔離預約');
}
/** Refuse malformed or inconsistent preexisting synthetic ledger before any read or write. */
function study1SandboxBookingIntegrity_(state,config){
  if(state.revision!==state.requests.length)
    throw Error('隔離預約版本與請求歷史不一致');
  const counts=new Map();
  for(const booking of state.bookings){
    if(booking.status!=='ACTIVE')continue;
    const slot=config.testSlots.find(x=>x.id===booking.slotId);
    if(!slot)throw Error('有效測試預約對應時段不存在：'+booking.slotId);
    const count=(counts.get(booking.slotId)||0)+1;
    if(count>slot.capacity)throw Error('既有測試預約超過時段容量：'+booking.slotId);
    counts.set(booking.slotId,count);
  }
  // Every successful CREATE/MOVE/CANCEL appends one canonical request to the
  // bounded synthetic ledger. Reconstruct the lifecycle to detect a request
  // fingerprint that no longer matches the current booking rows, even when
  // revision, request count, and capacity otherwise look consistent.
  const reconstructed=new Map();
  for(const request of state.requests){
    let parts;
    try{parts=JSON.parse(request.fingerprint);}
    catch(e){throw Error('隔離預約請求歷史內容不一致');}
    if(!Array.isArray(parts)||parts.length!==3||
      JSON.stringify(parts)!==request.fingerprint)
      throw Error('隔離預約請求歷史內容不一致');
    const [action,code,slotId]=parts;
    if(typeof code!=='string'||!/^TST-[0-9]{3}$/.test(code))
      throw Error('隔離預約請求歷史內容不一致');
    const original=reconstructed.get(code);
    if(action==='CREATE'){
      if(original||typeof slotId!=='string'||!/^test_slot_[1-8]$/.test(slotId))
        throw Error('隔離預約請求歷史順序異常');
      reconstructed.set(code,{code,slotId,status:'ACTIVE'});
    }else if(action==='MOVE'){
      if(!original||original.status!=='ACTIVE'||typeof slotId!=='string'||
         !/^test_slot_[1-8]$/.test(slotId)||original.slotId===slotId)
        throw Error('隔離預約請求歷史順序異常');
      original.slotId=slotId;
    }else if(action==='CANCEL'){
      if(!original||original.status!=='ACTIVE'||slotId!==null)
        throw Error('隔離預約請求歷史順序異常');
      original.status='CANCELLED';
    }else throw Error('隔離預約請求歷史動作異常');
  }
  if(reconstructed.size!==state.bookings.length||
    state.bookings.some(b=>{
      const r=reconstructed.get(b.code);
      return !r||r.slotId!==b.slotId||r.status!==b.status;
    }))throw Error('隔離預約狀態與請求歷史不一致');
}
function study1SandboxBookingView_(state,config){
  const slots=config.testSlots.map(slot=>{
    const booked=state.bookings.filter(b=>b.status==='ACTIVE'&&b.slotId===slot.id).length;
    return {id:slot.id,start:slot.start,location:slot.location,capacity:slot.capacity,
      booked,remaining:Math.max(0,slot.capacity-booked),overCapacity:booked>slot.capacity};
  });
  return {mode:'SANDBOX_ONLY',open:false,consentReady:false,revision:state.revision,
    slots,bookings:state.bookings.map(x=>({code:x.code,slotId:x.slotId,status:x.status}))};
}
function adminGetTestBookings(){
  study1AdminOwnerRequired_();
  study1SandboxBookingFlags_();
  // Config edits and booking writes use this same script lock. Read both
  // together so the owner never sees a mixed-revision capacity snapshot.
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw Error('隔離預約正在更新，請稍後重新讀取');
  try{
    study1SandboxBookingFlags_();
    const config=study1AdminPersisted_();
    const state=study1SandboxBookingState_();
    study1SandboxBookingIntegrity_(state,config);
    return study1SandboxBookingView_(state,config);
  }finally{lock.releaseLock();}
}
/** Pure shared booking transition: used by locked owner RPC and isolated live self-test. */
function study1SandboxBookingMutation_(input,state,config){
  const {action,bookingCode,slotId,requestId,expectedRevision}=input;
  study1SandboxBookingIntegrity_(state,config);
  const fingerprint=JSON.stringify([action,bookingCode,slotId]);
    const repeated=state.requests.find(x=>x.requestId===requestId);
    if(repeated){
      if(repeated.fingerprint!==fingerprint)throw Error('重複請求代碼對應不同操作，拒絕執行');
      const view=study1SandboxBookingView_(state,config);
      view.deduplicated=true;
      return {changed:false,view};
    }
    if(state.revision!==expectedRevision)throw Error('測試預約已被更新，請重新讀取 revision');
    if(state.requests.length>=35)throw Error('測試請求紀錄已達上限，停止新增操作');
    const existing=state.bookings.find(x=>x.code===bookingCode);
    const target=config.testSlots.find(x=>x.id===slotId);
    if(action!=='CANCEL'&&!target)throw Error('指定的測試時段不存在');
    if(action==='CREATE'){
      if(existing)throw Error('測試代碼已存在，不可重複建立');
      if(state.bookings.length>=20)throw Error('隔離預約已達 20 筆上限');
    }else{
      if(!existing||existing.status!=='ACTIVE')throw Error('只有仍有效的測試預約可以改期或取消');
      if(action==='MOVE'&&existing.slotId===slotId)throw Error('新時段與原時段相同');
    }
    if(action!=='CANCEL'){
      const occupied=state.bookings.filter(x=>x.status==='ACTIVE'&&x.slotId===slotId).length;
      if(occupied>=target.capacity)throw Error('測試時段容量已滿；拒絕超額預約');
    }
    if(action==='CREATE')state.bookings.push({code:bookingCode,slotId,status:'ACTIVE'});
    if(action==='MOVE')existing.slotId=slotId;
    if(action==='CANCEL')existing.status='CANCELLED';
    state.revision++;
    state.requests.push({requestId,fingerprint});

    const view=study1SandboxBookingView_(state,config);
    view.deduplicated=false;
    return {changed:true,view};
}
/** A single owner-only server transaction; all capacity checks are locked. */
function adminChangeTestBooking(input){
  study1AdminOwnerRequired_();
  study1SandboxBookingFlags_();
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='action,bookingCode,expectedRevision,requestId,slotId')
    throw Error('測試預約請求只允許核准欄位');
  const {action,bookingCode,slotId,requestId,expectedRevision}=input;
  if(!['CREATE','MOVE','CANCEL'].includes(action)||
    typeof bookingCode!=='string'||!/^TST-[0-9]{3}$/.test(bookingCode)||
    typeof requestId!=='string'||!/^REQ-[A-Za-z0-9-]{8,50}$/.test(requestId)||
    !(slotId===null||typeof slotId==='string'&&/^test_slot_[1-8]$/.test(slotId))||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    throw Error('隔離預約指令格式不符；不得使用真人資訊');
  if((action==='CANCEL')!==(slotId===null))throw Error('取消不可指定時段；建立或改期必須指定時段');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000))throw Error('測試預約正由其他工作更新，請重新讀取');
  try{
    study1SandboxBookingFlags_();
    const config=study1AdminPersisted_(),state=study1SandboxBookingState_();
    const outcome=study1SandboxBookingMutation_(input,state,config);
    if(!outcome.changed)return outcome.view;
    const payload=JSON.stringify(state);
    if(payload.length>7900)throw Error('隔離預約資料達到容量限制');
    const p=PropertiesService.getScriptProperties();
    p.setProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_,payload);
    if(p.getProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_)!==payload)
      throw Error('測試預約寫入後回讀不一致');
    return outcome.view;
  }finally{lock.releaseLock();}
}

/* P0 consent-document content registry. PDF originals stay immutable in the
 * existing PRIVATE research Drive folder, never public or a signature record.
 * Only the authenticated OWNER can list, upload or select a document version. */
const STUDY1_CONSENT_DOC_FOLDER_='1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU';
const STUDY1_CONSENT_DOC_INDEX_='STUDY1_CONSENT_DOCUMENT_INDEX_V1';
function study1ConsentVersionRead_(){
 const raw=PropertiesService.getScriptProperties().getProperty(STUDY1_CONSENT_DOC_INDEX_);
 if(!raw)return {schemaVersion:1,revision:0,documents:[],current:{E1:null,E2:null},published:{E1:null,E2:null}};
 const s=JSON.parse(raw);
 if(!s||s.schemaVersion!==1||!Number.isSafeInteger(s.revision)||s.revision<1||
  !Array.isArray(s.documents)||s.documents.length>24||!s.current||
  Object.keys(s.current).sort().join(',')!=='E1,E2')throw Error('同意書版本目錄損毀，拒絕使用');
 for(const x of s.documents){
  if(!x||!['E1','E2'].includes(x.experiment)||typeof x.id!=='string'||
   !/^[A-Za-z0-9_-]{15,100}$/.test(x.id)||typeof x.version!=='string'||
   !/^[A-Za-z0-9][A-Za-z0-9._-]{0,32}$/.test(x.version)||
   typeof x.title!=='string'||x.title.length>100||
   !/^[a-f0-9]{64}$/.test(x.sha256)||!Number.isSafeInteger(x.bytes)||
   x.bytes<100||x.bytes>3000000||typeof x.url!=='string'||
   !/^https:\/\/drive\.google\.com\//.test(x.url))
   throw Error('同意書來源、版號或雜湊紀錄不合法，拒絕使用');
 }
 if(new Set(s.documents.map(x=>x.id)).size!==s.documents.length||
  new Set(s.documents.map(x=>x.experiment+':'+x.version)).size!==s.documents.length||
  ['E1','E2'].some(exp=>s.current[exp]!==null&&
   !s.documents.some(x=>x.experiment===exp&&x.id===s.current[exp])))
  throw Error('同意書版本索引不一致，拒絕使用');
 // V117 documents predate separate explicit public-presentation permission.
 // Never infer publication from current selection; missing means NOT published.
 if(s.published===undefined)s.published={E1:null,E2:null};
 if(!s.published||Object.keys(s.published).sort().join(',')!=='E1,E2'||
  ['E1','E2'].some(exp=>s.published[exp]!==null&&
    !s.documents.some(x=>x.experiment===exp&&x.id===s.published[exp])))
  throw Error('公開同意書版本指標不一致，拒絕使用');
 return s;
}
function study1ConsentVersionList(){
 study1AdminOwnerRequired_();study1SandboxBookingFlags_();
 return study1ConsentVersionRead_();
}
function study1ConsentVersionUpload(input){
 study1AdminOwnerRequired_();study1SandboxBookingFlags_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).sort().join(',')!=='base64,expectedRevision,experiment,title,version'||
  !['E1','E2'].includes(input.experiment)||
  typeof input.title!=='string'||!input.title.trim()||
  input.title.trim().length>100||/[<>]/.test(input.title)||
  typeof input.version!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,32}$/.test(input.version)||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
  typeof input.base64!=='string'||input.base64.length<130||
  input.base64.length>4200000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))
  throw Error('請選擇符合規格的PDF、實驗與獨立文件版本');
 let bytes;
 try{bytes=Utilities.base64Decode(input.base64);}catch(_){throw Error('PDF內容編碼錯誤');}
 if(bytes.length<100||bytes.length>3000000||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
  throw Error('只能上傳完整且不超過3MB的PDF檔案');
 const sha256=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)
  .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('另一筆同意書版本作業進行中，請重試');
 let file=null;
 try{
  study1AdminOwnerRequired_();study1SandboxBookingFlags_();
  const current=study1ConsentVersionRead_();
  if(current.revision!==input.expectedRevision)throw Error('同意書版本已由其他分頁變更，請先重新載入');
  if(current.documents.length>=24)throw Error('版本目錄已滿，請由管理者處理歸檔');
  if(current.documents.some(x=>x.experiment===input.experiment&&x.version===input.version))
   throw Error('這個實驗的同意書版號已存在，舊版不可覆寫');
  const folder=DriveApp.getFolderById(STUDY1_CONSENT_DOC_FOLDER_);
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)
   throw Error('同意書資料夾不是私人權限，已拒絕上傳');
  const name='Study1_'+input.experiment+'_Consent_v'+input.version+'_'+sha256.slice(0,12)+'.pdf';
  file=folder.createFile(Utilities.newBlob(bytes,'application/pdf',name));
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE||file.getSize()!==bytes.length)
   throw Error('同意書檔案權限或完整性核對失敗');
  const entry={experiment:input.experiment,id:file.getId(),title:input.title.trim(),
   version:input.version,sha256,bytes:bytes.length,url:file.getUrl(),at:new Date().toISOString()};
  const next={schemaVersion:1,revision:current.revision+1,
   documents:current.documents.concat([entry]),current:{...current.current},published:{...current.published}};
  const payload=JSON.stringify(next);
  if(payload.length>7500)throw Error('文件索引容量不足，未接受新版本');
  const prop=PropertiesService.getScriptProperties();
  prop.setProperty(STUDY1_CONSENT_DOC_INDEX_,payload);
  if(prop.getProperty(STUDY1_CONSENT_DOC_INDEX_)!==payload)
   throw Error('同意書版本索引寫後回讀不一致');
  return next;
 }catch(e){
  // Only the newly created file may be discarded; existing versions are immutable.
  if(file)try{file.setTrashed(true);}catch(_){}
  throw e;
 }finally{lock.releaseLock();}
}
function study1ConsentVersionSelect(input){
 study1AdminOwnerRequired_();study1SandboxBookingFlags_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).sort().join(',')!=='expectedRevision,id'||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
  typeof input.id!=='string')throw Error('請提供已上傳的版本及最新目錄修訂版');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('同意書版本目前正在更新');
 try{
  study1AdminOwnerRequired_();study1SandboxBookingFlags_();
  const current=study1ConsentVersionRead_();
  if(current.revision!==input.expectedRevision)throw Error('版本選用衝突，請先重新載入');
  const entry=current.documents.find(x=>x.id===input.id);
  if(!entry)throw Error('只能選擇原私人資料夾中的已存版本');
  if(current.current[entry.experiment]===entry.id)return current;
  // Selection changes only the owner's reference, never REC approval, signatures,
  // public routes, existing signed records or the formal intake switch.
  const next={...current,revision:current.revision+1,
   current:{...current.current,[entry.experiment]:entry.id}};
  const payload=JSON.stringify(next),prop=PropertiesService.getScriptProperties();
  if(payload.length>7500)throw Error('同意書版本索引容量不足');
  prop.setProperty(STUDY1_CONSENT_DOC_INDEX_,payload);
  if(prop.getProperty(STUDY1_CONSENT_DOC_INDEX_)!==payload)throw Error('同意書版本選用回讀失敗');
  return next;
 }finally{lock.releaseLock();}
}

/** Original owner-only public-read permission, not REC approval or e-signature.
 * Publish only an explicitly selected, byte-verified BLANK source document.
 * Anyone can later read the explicitly published PDF; the Drive original stays PRIVATE.
 */
function study1ConsentDocumentBytes_(entry){
 const folder=DriveApp.getFolderById(STUDY1_CONSENT_DOC_FOLDER_);
 if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('原同意書資料夾權限異常，停止提供');
 const file=DriveApp.getFileById(entry.id);
 if(file.getSharingAccess()!==DriveApp.Access.PRIVATE||
  file.getMimeType()!=='application/pdf'||file.getSize()!==entry.bytes)
  throw Error('原同意書檔案格式或私人權限異常');
 const parents=file.getParents();
 let inOriginalFolder=false;
 while(parents.hasNext())if(parents.next().getId()===STUDY1_CONSENT_DOC_FOLDER_)inOriginalFolder=true;
 if(!inOriginalFolder)throw Error('PDF原始檔已不在指定私人資料夾');
 const bytes=file.getBlob().getBytes();
 if(bytes.length!==entry.bytes||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
  throw Error('同意書原始位元組已變更');
 const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)
  .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
 if(hash!==entry.sha256)throw Error('原始PDF雜湊已改變，不可提供或簽署');
 return bytes;
}
/** OWNER explicitly approves READ-ONLY publication of a selected blank PDF,
 * or deactivates a published pointer; neither operation enables enrollment. */
function study1ConsentVersionPublication(input){
 study1AdminOwnerRequired_();study1SandboxBookingFlags_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).sort().join(',')!=='confirmSha256,expectedRevision,experiment,id'||
  !['E1','E2'].includes(input.experiment)||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
  !(input.id===null||typeof input.id==='string')||
  typeof input.confirmSha256!=='string')throw Error('請提供明確版號、實驗及完整雜湊確認');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('同意書版本更新正在進行，請重新載入');
 try{
  study1AdminOwnerRequired_();study1SandboxBookingFlags_();
  const before=study1ConsentVersionRead_();
  if(before.revision!==input.expectedRevision)throw Error('公開文件版本已更新，請重新載入');
  if(before.published[input.experiment]===input.id)return before;
  if(input.id!==null){
   const entry=before.documents.find(x=>x.id===input.id&&x.experiment===input.experiment);
   if(!entry||before.current[input.experiment]!==input.id||
    input.confirmSha256!==entry.sha256)
    throw Error('只能公開已選用且原SHA完全吻合的文件版本');
   study1ConsentDocumentBytes_(entry);
  }else if(input.confirmSha256!=='')throw Error('停止提供時不應附帶文件雜湊');
  const after={...before,revision:before.revision+1,
   published:{...before.published,[input.experiment]:input.id}};
  const payload=JSON.stringify(after);
  if(payload.length>7500)throw Error('公開文件索引容量不足');
  const prop=PropertiesService.getScriptProperties();
  prop.setProperty(STUDY1_CONSENT_DOC_INDEX_,payload);
  if(prop.getProperty(STUDY1_CONSENT_DOC_INDEX_)!==payload)
   throw Error('公開文件索引回讀失敗');
  return after;
 }finally{lock.releaseLock();}
}
/** Anonymous public READ ONLY. Never returns Drive file IDs, private URLs,
 * the list of draft versions, personal data, or participant signature records. */
function study1ConsentPublicRead_(experiment){
 if(!['E1','E2'].includes(experiment))throw Error('不合法的研究實驗');
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('OPEN')!=='false'||props.getProperty('CONSENT_READY')!=='false')
  throw Error('研究站點狀態不可信，拒絕提供文件');
 const index=study1ConsentVersionRead_(),fileId=index.published[experiment];
 if(!fileId)return {available:false,experiment};
 const entry=index.documents.find(x=>x.id===fileId&&x.experiment===experiment);
 if(!entry)throw Error('已發布的文件來源不存在');
 const bytes=study1ConsentDocumentBytes_(entry);
 return {available:true,experiment,title:entry.title,version:entry.version,
  sha256:entry.sha256,bytes:bytes.length,mime:'application/pdf',
  base64:Utilities.base64Encode(bytes)};
}
