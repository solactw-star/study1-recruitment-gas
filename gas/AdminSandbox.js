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
   x.bytes<100||x.bytes>3000000||
   (x.researcherPresigned!==undefined&&typeof x.researcherPresigned!=='boolean')||
   typeof x.url!=='string'||
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
  !['base64,expectedRevision,experiment,title,version',
    'base64,expectedRevision,experiment,researcherPresigned,title,version']
    .includes(Object.keys(input).sort().join(','))||
  (input.researcherPresigned!==undefined&&typeof input.researcherPresigned!=='boolean')||
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
 let file=null,indexCommitAttempted=false;
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
   version:input.version,sha256,bytes:bytes.length,url:file.getUrl(),
   researcherPresigned:input.experiment==='E1'&&input.researcherPresigned===true,
   at:new Date().toISOString()};
  // Independently read the actual Drive bytes, SHA, folder membership and ACL
  // BEFORE the immutable version index can reference this uploaded PDF.
  study1ConsentDocumentBytes_(entry);
  const next={schemaVersion:1,revision:current.revision+1,
   documents:current.documents.concat([entry]),current:{...current.current},published:{...current.published}};
  const payload=JSON.stringify(next);
  if(payload.length>7500)throw Error('文件索引容量不足，未接受新版本');
  const prop=PropertiesService.getScriptProperties();
  indexCommitAttempted=true;
  prop.setProperty(STUDY1_CONSENT_DOC_INDEX_,payload);
  if(prop.getProperty(STUDY1_CONSENT_DOC_INDEX_)!==payload)
   throw Error('同意書版本索引寫後回讀不一致');
  return next;
 }catch(e){
  // A failed/ambiguous property commit may already reference the uploaded
  // PDF. Never trash that file after attempting the index pointer write.
  if(file&&!indexCommitAttempted)try{file.setTrashed(true);}catch(_){}
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
  if(entry.experiment==='E1'&&entry.researcherPresigned!==true)
   throw Error('E1_RESEARCHER_PRESIGNED_PDF_REQUIRED');
  // Recheck the exact original immutable PDF bytes, SHA, PRIVATE ACL and
  // original-folder parent, even when the same version was already selected.
  study1ConsentDocumentBytes_(entry);
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

/**
 * P0 formal e-consent secure transaction core, staged CLOSED by default.
 * A research team member verifies the participant in person, then privately
 * gives them a high-entropy one-use code. Public anonymous requests cannot
 * create codes, select another document, or browse participant records.
 * No emails, public Drive URLs, Sheets writes or automatic consent enabling.
 * Each event is a separate private file. SHA checks detect mutation, but
 * Google Drive is NOT a legally immutable/WORM evidence store.
 */
const STUDY1_ECONSENT_REGISTRY_='STUDY1_ECONSENT_PRIVATE_V1';
const STUDY1_ECONSENT_MAX_RECORDS_=3000;
const STUDY1_ECONSENT_LEGACY_MAX_RECORDS_=12;
const STUDY1_ECONSENT_POINTER_V2_='STUDY1_ECONSENT_POINTER_V2';
const STUDY1_ECONSENT_MIGRATE_APPROVED_='STUDY1_ECONSENT_MIGRATION_V2_APPROVED';
const STUDY1_ECONSENT_MAX_BYTES_V2_=5000000;
function study1EConsentHash_(value){
 return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value)
 .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function study1EConsentEnabled_(){
 const p=PropertiesService.getScriptProperties();
 return p.getProperty('OPEN')==='true'&&p.getProperty('CONSENT_READY')==='true'&&
  p.getProperty('STUDY1_ECONSENT_PROVIDER_VERIFIED')==='true';
}
function study1EConsentAvailability(){return {enabled:study1EConsentEnabled_()};}
/**
 * E1 formal e-consent registry v2: immutable versioned JSON snapshots in the
 * SAME original private consent Drive folder. Only a small SHA/HMAC protected
 * pointer lives in Script Properties; the V1 property is retained byte-for-byte.
 * Migration is opt-in and happens under the existing ScriptLock on first write.
 * No live Sheet, PDF, event or sharing permissions are automatically changed.
 */
function study1EConsentValidateRegistry_(r,maxRecords){
 if(!r||r.schemaVersion!==1||!Number.isSafeInteger(r.revision)||
    r.revision<1||!Array.isArray(r.records)||r.records.length>maxRecords||
    new Set(r.records.map(x=>x&&x.id)).size!==r.records.length)
  throw Error('電子同意紀錄索引不一致，已停止操作');
 for(const x of r.records){
  if(!x||typeof x.id!=='string'||!/^[-a-f0-9]{30,40}$/i.test(x.id)||
   !['E1','E2'].includes(x.experiment)||!/^[-a-f0-9]{64}$/.test(x.tokenHash)||
   !/^[-a-f0-9]{64}$/.test(x.documentSha)||!Number.isSafeInteger(x.expires)||
   !['ISSUED','EXPLAINED','SIGNED','CONFIRMED','WITHDRAWN'].includes(x.state))
   throw Error('電子同意紀錄來源不合法');
  for(const kind of ['explanation','signature','confirmation','withdrawal','disposition']){
   const event=x[kind];
   if(event!==null&&event!==undefined&&
    (typeof event.id!=='string'||!/^[A-Za-z0-9_-]{15,100}$/.test(event.id)||
     !/^[a-f0-9]{64}$/.test(event.sha)))
    throw Error('電子同意證據來源不合法');
  }
 }
 return r;
}
function study1EConsentPointerV2_(raw,legacyRaw){
 let p;
 try{p=JSON.parse(raw);}catch(_){throw Error('E1_REGISTRY_V2_POINTER_INVALID');}
 if(!p||Array.isArray(p)||typeof p!=='object'||
    Object.keys(p).sort().join(',')!==
     'fileId,hmac,legacySha256,revision,schemaVersion,sha256'||
    p.schemaVersion!==2||!Number.isSafeInteger(p.revision)||
    p.revision<1||typeof p.fileId!=='string'||
    !/^[A-Za-z0-9_-]{15,150}$/.test(p.fileId)||
    !/^[a-f0-9]{64}$/.test(p.sha256)||
    !/^[a-f0-9]{64}$/.test(p.legacySha256)||
    !/^[a-f0-9]{64}$/.test(p.hmac))
  throw Error('E1_REGISTRY_V2_POINTER_INVALID');
 if(study1EConsentHash_(legacyRaw||'')!==p.legacySha256)
  throw Error('E1_REGISTRY_LEGACY_CHANGED_AFTER_MIGRATION');
 const expected=study1BindingHmac_([
  'STUDY1_ECONSENT_POINTER_V2',p.revision,p.fileId,p.sha256,
  p.legacySha256]);
 if(expected!==p.hmac)throw Error('E1_REGISTRY_V2_POINTER_HMAC_INVALID');
 return p;
}
function study1EConsentReadV2_(p){
 study1EConsentFolder_();
 const file=DriveApp.getFileById(p.fileId);
 if(!file||file.getSharingAccess()!==DriveApp.Access.PRIVATE||
    file.getMimeType()!=='application/json'||
    !Number.isSafeInteger(file.getSize())||
    file.getSize()<50||file.getSize()>STUDY1_ECONSENT_MAX_BYTES_V2_)
  throw Error('E1_REGISTRY_V2_PRIVATE_FILE_INVALID');
 const parents=file.getParents();
 let inside=false;
 while(parents.hasNext()){
  if(parents.next().getId()===STUDY1_CONSENT_DOC_FOLDER_)inside=true;
 }
 if(!inside)throw Error('E1_REGISTRY_V2_OUTSIDE_PRIVATE_FOLDER');
 const bytes=file.getBlob().getBytes();
 if(bytes.length!==file.getSize()||study1EConsentHash_(bytes)!==p.sha256)
  throw Error('E1_REGISTRY_V2_SNAPSHOT_SHA_CHANGED');
 const raw=file.getBlob().getDataAsString();
 if(study1EConsentHash_(raw)!==p.sha256)
  throw Error('E1_REGISTRY_V2_SNAPSHOT_TEXT_CHANGED');
 let registry;
 try{registry=JSON.parse(raw);}
 catch(_){throw Error('E1_REGISTRY_V2_SNAPSHOT_INVALID');}
 study1EConsentValidateRegistry_(registry,STUDY1_ECONSENT_MAX_RECORDS_);
 if(registry.revision!==p.revision)
  throw Error('E1_REGISTRY_V2_SNAPSHOT_REVISION_MISMATCH');
 return registry;
}
function study1EConsentRegistry_(){
 const props=PropertiesService.getScriptProperties();
 const legacyRaw=props.getProperty(STUDY1_ECONSENT_REGISTRY_);
 const pointerRaw=props.getProperty(STUDY1_ECONSENT_POINTER_V2_);
 // Never silently fall back to an older snapshot if the v2 pointer exists.
 if(pointerRaw!==null&&pointerRaw!==undefined){
  const pointer=study1EConsentPointerV2_(pointerRaw,legacyRaw);
  return study1EConsentReadV2_(pointer);
 }
 if(!legacyRaw)return {schemaVersion:1,revision:0,records:[]};
 let r;
 try{r=JSON.parse(legacyRaw);}
 catch(_){throw Error('電子同意舊索引JSON損毀');}
 return study1EConsentValidateRegistry_(r,STUDY1_ECONSENT_LEGACY_MAX_RECORDS_);
}
/**
 * All authorized callers already hold the shared GAS ScriptLock.
 * V2 commit point is one small Script Properties pointer write AFTER a full
 * private file SHA/ACL/readback check. A thrown error after that commit is
 * ambiguous: preserve the snapshot and signed files; the next read recovers.
 */
function study1EConsentWrite_(old,next){
 if(next.revision!==old.revision+1||
    next.schemaVersion!==1||!Array.isArray(next.records)||
    next.records.length>STUDY1_ECONSENT_MAX_RECORDS_)
  throw Error('電子同意索引版本或容量不合法');
 // Reject malformed event references, duplicate IDs and invalid states BEFORE
 // staging anything. Never point the authoritative index at unreadable bytes.
 study1EConsentValidateRegistry_(next,STUDY1_ECONSENT_MAX_RECORDS_);
 const lock=LockService.getScriptLock();
 if(!lock||lock.hasLock()!==true)
  throw Error('E1_REGISTRY_SHARED_LOCK_REQUIRED');
 const props=PropertiesService.getScriptProperties();
 const previous=study1EConsentRegistry_();
 if(JSON.stringify(previous)!==JSON.stringify(old))
  throw Error('電子同意索引遭其他作業變動');
 const legacyRaw=props.getProperty(STUDY1_ECONSENT_REGISTRY_);
 const pointerBefore=props.getProperty(STUDY1_ECONSENT_POINTER_V2_);
 const payload=JSON.stringify(next);
 // All old tests and old installations remain on legacy storage until an
 // explicit owner-controlled enablement; an existing V2 can never downgrade.
 if(!pointerBefore&&
    props.getProperty(STUDY1_ECONSENT_MIGRATE_APPROVED_)!=='true'){
  if(next.records.length>STUDY1_ECONSENT_LEGACY_MAX_RECORDS_||
     payload.length>7500)
   throw Error('電子同意索引容量不足，停止收件');
  if(props.getProperty(STUDY1_ECONSENT_REGISTRY_)!==
     (old.revision?JSON.stringify(old):null))
   throw Error('電子同意索引遭其他作業變動');
  props.setProperty(STUDY1_ECONSENT_REGISTRY_,payload);
  if(props.getProperty(STUDY1_ECONSENT_REGISTRY_)!==payload)
   throw Error('電子同意索引寫後回讀失敗');
  return next;
 }
 // V2 only when explicitly approved or already committed; never create a
 // parallel authoritative Sheet or overwrite legacy evidence.
 const blob=Utilities.newBlob(payload,'application/json');
 const payloadBytes=blob.getBytes();
 if(payloadBytes.length<50||
    payloadBytes.length>STUDY1_ECONSENT_MAX_BYTES_V2_)
  throw Error('E1_REGISTRY_V2_SNAPSHOT_CAPACITY');
 const sha=study1EConsentHash_(payloadBytes);
 const folder=study1EConsentFolder_();
 const name='Study1_EConsent_RegistryV2_'+next.revision+'_'+sha.slice(0,16)+'.json';
 const stored=folder.createFile(
  Utilities.newBlob(payload,'application/json',name));
 // Never auto-delete a snapshot on uncertain write; it may already be the
 // authoritative pointer target following a partial server failure.
 stored.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
 if(stored.getSharingAccess()!==DriveApp.Access.PRIVATE||
    stored.getMimeType()!=='application/json'||
    stored.getSize()!==payloadBytes.length||
    study1EConsentHash_(stored.getBlob().getBytes())!==sha||
    study1EConsentHash_(stored.getBlob().getDataAsString())!==sha)
  throw Error('E1_REGISTRY_V2_FILE_WRITEBACK_FAILED');
 let parentVerified=false,parents=stored.getParents();
 while(parents.hasNext()){
  if(parents.next().getId()===STUDY1_CONSENT_DOC_FOLDER_)
   parentVerified=true;
 }
 if(!parentVerified)throw Error('E1_REGISTRY_V2_FILE_PARENT_INVALID');
 if(props.getProperty(STUDY1_ECONSENT_REGISTRY_)!==legacyRaw||
    props.getProperty(STUDY1_ECONSENT_POINTER_V2_)!==pointerBefore)
  throw Error('E1_REGISTRY_V2_CONCURRENT_POINTER_WRITE');
 const legacySha256=study1EConsentHash_(legacyRaw||'');
 const pointer={schemaVersion:2,revision:next.revision,
  fileId:stored.getId(),sha256:sha,legacySha256};
 pointer.hmac=study1BindingHmac_([
  'STUDY1_ECONSENT_POINTER_V2',pointer.revision,pointer.fileId,
  pointer.sha256,pointer.legacySha256]);
 const ptrRaw=JSON.stringify(pointer);
 if(ptrRaw.length>7500)throw Error('E1_REGISTRY_V2_POINTER_OVERFLOW');
 props.setProperty(STUDY1_ECONSENT_POINTER_V2_,ptrRaw);
 if(props.getProperty(STUDY1_ECONSENT_POINTER_V2_)!==ptrRaw||
    JSON.stringify(study1EConsentRegistry_())!==payload)
  throw Error('E1_REGISTRY_V2_COMMIT_READBACK_UNKNOWN');
 return next;
}
function study1EConsentFolder_(){
 const folder=DriveApp.getFolderById(STUDY1_CONSENT_DOC_FOLDER_);
 if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)
  throw Error('電子同意證據儲存資料夾非私人，停止收件');
 return folder;
}
function study1EConsentFile_(kind,entry,data){
 const body=JSON.stringify({schemaVersion:1,kind,recordId:entry.id,
  experiment:entry.experiment,documentSha:entry.documentSha,
  recordedAt:new Date().toISOString(),data});
 if(body.length>130000)throw Error('電子同意證據超過容量限制');
 const folder=study1EConsentFolder_();
 const sha=study1EConsentHash_(body);
 const name='Study1_EConsent_'+kind+'_'+entry.id+'_'+sha.slice(0,16)+'.json';
 const file=folder.createFile(Utilities.newBlob(body,'application/json',name));
 try{
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE||
   file.getSize()!==Utilities.newBlob(body).getBytes().length)
   throw Error('電子同意證據寫入或權限驗證失敗');
  const readback=file.getBlob().getDataAsString();
  if(study1EConsentHash_(readback)!==sha)
   throw Error('電子同意證據原檔回讀SHA不一致');
  return {id:file.getId(),sha};
 }catch(e){try{file.setTrashed(true);}catch(_){}throw e;}
}
function study1EConsentEvent_(ref,entry,kind){
 if(!ref)throw Error('缺少電子同意存證');
 const f=DriveApp.getFileById(ref.id);
 if(f.getSharingAccess()!==DriveApp.Access.PRIVATE||f.getMimeType()!=='application/json')
  throw Error('同意存證檔案權限或格式已改變');
 const raw=f.getBlob().getDataAsString();
 if(study1EConsentHash_(raw)!==ref.sha)throw Error('同意證據已被更動');
 const data=JSON.parse(raw);
 if(data.kind!==kind||data.recordId!==entry.id||data.documentSha!==entry.documentSha)
  throw Error('存證與固定文件版本不一致');
 return data;
}
function study1EConsentReadyDocument_(experiment){
 if(!study1EConsentEnabled_())throw Error('目前尚未開放有效電子知情同意');
 if(experiment!=='E1'&&experiment!=='E2')throw Error('實驗不合法');
 if(experiment==='E2'&&(new Date().getUTCFullYear()<2027||
  PropertiesService.getScriptProperties().getProperty('STUDY1_E2_CONSENT_EXPLICIT')!=='true'))
  throw Error('實驗二尚未取得獨立開放授權');
 const index=study1ConsentVersionRead_(),id=index.published[experiment];
 const entry=index.documents.find(x=>x.id===id&&x.experiment===experiment);
 if(!entry||index.current[experiment]!==id)throw Error('尚無正式選用及發布的文件版本');
 // Source bytes, ACL and SHA are checked against the original uploaded PDF.
 study1ConsentDocumentBytes_(entry);
 return entry;
}
function study1EConsentEntry_(token,r){
 if(typeof token!=='string'||!/^[-a-f0-9]{70,90}$/i.test(token))
  throw Error('無效的知情同意存取憑證');
 const sha=study1EConsentHash_(token);
 const item=r.records.find(x=>x.tokenHash===sha);
 if(!item||item.expires<Date.now())throw Error('知情同意憑證無效或已過期');
 return item;
}
function study1EConsentChange_(id,fn){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('電子同意作業忙碌，請重試');
 try{
  const r=study1EConsentRegistry_(),index=r.records.findIndex(x=>x.id===id);
  if(index<0)throw Error('電子同意紀錄未找到');
  const before=r.records[index];let after=null;
  try{
   after=fn(before,r,lock);
   if(!after)return before;
   const next={...r,revision:r.revision+1,
    records:r.records.map((x,j)=>j===index?after:x)};
   study1EConsentWrite_(r,next);
   return after;
  }catch(error){
   // If the registry CAS was refused before the new file was referenced,
   // discard only that unreferenced PII artifact. Never trash a record that
   // might already be committed or a previously confirmed version.
   const stored=PropertiesService.getScriptProperties()
    .getProperty(STUDY1_ECONSENT_REGISTRY_);
   // A V2 pointer might already have committed after a readback error.
   // Never delete possibly referenced participant PDF/evidence in that case.
   const v2Pointer=PropertiesService.getScriptProperties()
    .getProperty(STUDY1_ECONSENT_POINTER_V2_);
   if(after&&!v2Pointer&&stored===JSON.stringify(r)){
    for(const kind of ['explanation','signature','signedPdf','confirmation','withdrawal','disposition']){
     if(after[kind]&&!before[kind])try{
      DriveApp.getFileById(after[kind].id).setTrashed(true);
     }catch(_){}
    }
   }
   throw error;
  }
 }finally{lock.releaseLock();}
}
/** Authenticated OWNER creates a fixed-document one-person invitation. */
function study1EConsentIssue(input){
 study1AdminOwnerRequired_();
 if(!study1EConsentEnabled_())throw Error('尚未開放有效電子簽署');
 if(!input||Object.keys(input).join(',')!=='experiment'||
  !['E1','E2'].includes(input.experiment))throw Error('實驗選擇不合法');
 const doc=study1EConsentReadyDocument_(input.experiment);
 // Owner-only experiment-only invitations lack all human and slot provenance.
 // Retain solely for synthetic legacy TEST fixtures; not a live path.
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY')!=='true')
  throw Error('BINDING_REQUIRED：正式邀請必須綁定本人身分、OTP及預約');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('電子同意作業忙碌');
 try{
  study1AdminOwnerRequired_();study1EConsentReadyDocument_(input.experiment);
  const r=study1EConsentRegistry_();
  if(r.records.length>=STUDY1_ECONSENT_MAX_RECORDS_)throw Error('正式同意收件容量不足，禁止發出新憑證');
  const token=Utilities.getUuid()+'-'+Utilities.getUuid();
  const entry={id:Utilities.getUuid(),tokenHash:study1EConsentHash_(token),
   experiment:input.experiment,documentSha:doc.sha256,documentVersion:doc.version,
   expires:Date.now()+86400000,state:'ISSUED',
   explanation:null,signature:null,confirmation:null,withdrawal:null};
  if(r.records.some(x=>x.id===entry.id||x.tokenHash===entry.tokenHash))
   throw Error('電子同意憑證重複，拒絕發出');
  study1EConsentWrite_(r,{...r,revision:r.revision+1,records:r.records.concat([entry])});
  return {id:entry.id,token,experiment:entry.experiment,
   version:entry.documentVersion,sha256:entry.documentSha,expires:entry.expires};
 }finally{lock.releaseLock();}
}
/** OWNER documents researcher explanation and specific questions before signing. */
function study1EConsentExplain(input){
 study1AdminOwnerRequired_();
 if(!input||Object.keys(input).sort().join(',')!=='answer,id,question,resolved'||
  typeof input.id!=='string'||typeof input.question!=='string'||
  typeof input.answer!=='string'||input.question.length>1600||
  !input.answer.trim()||input.answer.length>2400||/[<>]/.test(input.question+input.answer)||
  input.resolved!==true)throw Error('必須完整記錄說明、疑問與研究人員答覆');
 return study1EConsentChange_(input.id,x=>{
  study1AdminOwnerRequired_();
  if(x.state!=='ISSUED'||x.expires<Date.now())throw Error('不能修改已處理或過期邀請');
  const proof=study1EConsentFile_('EXPLANATION',x,{
   question:input.question,answer:input.answer,staff:'OWNER',
   questionsResolved:true});
  return {...x,state:'EXPLAINED',explanation:proof};
 });
}
/** Bearer proof is required even to read the attested explanation. */
function study1EConsentSession(token){
 const r=study1EConsentRegistry_(),entry=study1EConsentEntry_(token,r);
 if(!study1EConsentEnabled_()&&entry.state!=='CONFIRMED'&&entry.state!=='WITHDRAWN')
  throw Error('電子同意目前不開放');
 const explanation=entry.explanation?
  study1EConsentEvent_(entry.explanation,entry,'EXPLANATION').data:null;
 return {experiment:entry.experiment,version:entry.documentVersion,
  sha256:entry.documentSha,state:entry.state,expires:entry.expires,
  explanation:explanation&&{question:explanation.question,answer:explanation.answer}};
}
/** Browser supplied signature is accepted once, bound to owner-verified invite. */
function study1EConsentSign(input){
 if(!study1EConsentEnabled_())throw Error('尚未開放有效電子簽署');
 // Legacy isolated synthetic event is preserved solely for existing TEST regression.
 // It must NEVER serve as an operational signed consent or replace a signed PDF.
 if(PropertiesService.getScriptProperties().getProperty('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY')!=='true')
  throw Error('正式電子簽署必須產生完整簽名PDF，舊獨立PNG簽名路徑已關閉');
 if(!input||Object.keys(input).sort().join(',')!=='agree,answerAcknowledged,documentSha,name,read,signature,token'||
  input.agree!==true||input.answerAcknowledged!==true||input.read!==true||
  typeof input.name!=='string'||!input.name.trim()||input.name.length>80||
  /[<>\u0000-\u001f]/.test(input.name)||
  typeof input.documentSha!=='string'||!/^[a-f0-9]{64}$/.test(input.documentSha)||
  typeof input.signature!=='string'||input.signature.length>125000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signature))
  throw Error('必須完成全文閱讀、說明確認、姓名與本人簽名');
 const bytes=Utilities.base64Decode(input.signature);
 if(bytes.length<100||bytes.length>90000||
  bytes.slice(0,8).map(b=>b&255).join(',')!=='137,80,78,71,13,10,26,10')
  throw Error('電子簽名必須是完整PNG筆跡');
 const token=input.token,r=study1EConsentRegistry_(),entry=study1EConsentEntry_(token,r);
 return study1EConsentChange_(entry.id,x=>{
  if(!study1EConsentEnabled_()||x.state!=='EXPLAINED'||x.expires<Date.now()||
   x.documentSha!==input.documentSha)throw Error('同意書邀請、版本或說明已失效');
  study1EConsentEvent_(x.explanation,x,'EXPLANATION');
  const original=study1ConsentVersionRead_().documents.find(d=>
   d.experiment===x.experiment&&d.sha256===x.documentSha&&d.version===x.documentVersion);
  if(!original)throw Error('原版同意書已不存在');
  study1ConsentDocumentBytes_(original);
  const file=study1EConsentFile_('SIGNATURE',x,{name:input.name.trim(),
   signaturePngBase64:input.signature,read:true,answerAcknowledged:true,
   agreed:true,explanationHash:x.explanation.sha});
  return {...x,state:'SIGNED',signature:file};
 }).state==='SIGNED'?{state:'SIGNED',message:'已記錄固定版本的本人簽名，待研究人員確認'}:
 {state:'UNVERIFIED'};
}
/** Staff confirmation is another independently stored event, not an overwrite. */
function study1EConsentConfirm(input){
 study1AdminOwnerRequired_();
 if(!input||Object.keys(input).sort().join(',')!=='id,identityVerified,notes'||
  input.identityVerified!==true||typeof input.id!=='string'||
  typeof input.notes!=='string'||!input.notes.trim()||input.notes.length>1000||
  /[<>]/.test(input.notes))throw Error('請記錄身分核對與研究人員確認');
 return study1EConsentChange_(input.id,x=>{
  study1AdminOwnerRequired_();
  if(x.channel==='FORMAL_E1')throw Error('RESEARCHER_PDF_SIGNATURE_REQUIRED');
  if(x.state!=='SIGNED')throw Error('只有已簽署紀錄能被研究人員確認');
  if(!x.signedPdf&&PropertiesService.getScriptProperties()
     .getProperty('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY')!=='true')
   throw Error('沒有完整已簽署PDF，不得標記研究人員確認');
  if(x.signedPdf)study1EConsentSignedPdfRead_(x.signedPdf,x);
  study1EConsentEvent_(x.signature,x,'SIGNATURE');
  const file=study1EConsentFile_('CONFIRMATION',x,{
   researcher:'OWNER',reviewerEmail:Session.getActiveUser().getEmail(),
   identityVerified:true,notes:input.notes,
   signatureHash:x.signature.sha,explanationHash:x.explanation.sha});
  return {...x,state:'CONFIRMED',confirmation:file};
 });
}
/** Participant can retrieve their own document-bound evidence with bearer code. */
function study1EConsentCopy(token){
 const entry=study1EConsentEntry_(token,study1EConsentRegistry_());
 if(!['CONFIRMED','WITHDRAWN'].includes(entry.state))
  throw Error('尚未完成雙方確認，不提供有效簽署副本');
 if(!entry.signedPdf&&PropertiesService.getScriptProperties()
   .getProperty('STUDY1_ECONSENT_LEGACY_SYNTHETIC_ONLY')!=='true')
  throw Error('正式電子同意必須提供完整已簽署PDF，不能只提供PNG和收據');
 const signed=study1EConsentEvent_(entry.signature,entry,'SIGNATURE');
 const confirmed=study1EConsentEvent_(entry.confirmation,entry,'CONFIRMATION');
 const withdrawn=entry.withdrawal?
  study1EConsentEvent_(entry.withdrawal,entry,'WITHDRAWAL'):null;
 // The participant's own existing consent-copy workflow must contain the
 // FULL stamped PDF, not only a receipt with detached PNG. Keep legacy
 // synthetic-only tests untouched while the actual enrollment provider is OFF.
 const complete=entry.signedPdf?study1EConsentSignedPdfCopy(token):null;
 return {state:entry.state,experiment:entry.experiment,version:entry.documentVersion,
  documentSha256:entry.documentSha,signatureEvidenceSha256:entry.signature.sha,
  confirmationEvidenceSha256:entry.confirmation.sha,participant:signed.data.name,
  signaturePngBase64:signed.data.signaturePngBase64,
  signedAt:complete?complete.signedAt:signed.recordedAt,
  taipeiDate:complete?.taipeiDate||null,
  signedPdfSha256:complete?.signedPdfSha256||null,
  signedPdfBase64:complete?.base64||null,
  signedPdfMime:complete?.mime||null,
  reviewer:confirmed.data.reviewerEmail,confirmedAt:confirmed.recordedAt,
  withdrawalAt:withdrawn?.recordedAt||null,withdrawalEvidenceSha256:entry.withdrawal?.sha||null};
}
/** Withdrawal is a new private event, never deletion/edit of original consent. */
function study1EConsentWithdraw(input){
 const keys=input&&typeof input==='object'&&!Array.isArray(input)?
  Object.keys(input).sort().join(','):'';
 if(!['reason,token','dataChoice,reason,token'].includes(keys)||
  (keys==='dataChoice,reason,token'&&
   !['DESTROY','DEIDENTIFY','CONTACT_STAFF'].includes(input.dataChoice))||
  typeof input.reason!=='string'||input.reason.trim().length<4||
  input.reason.length>600||/[<>]/.test(input.reason))throw Error('請填寫撤回理由');
 const entry=study1EConsentEntry_(input.token,study1EConsentRegistry_());
 const next=study1EConsentChange_(entry.id,x=>{
  if(x.state!=='CONFIRMED')throw Error('此同意紀錄不可重複撤回');
  const f=study1EConsentFile_('WITHDRAWAL',x,{
   reason:input.reason.trim(),signatureHash:x.signature.sha,
   confirmationHash:x.confirmation.sha,
   dataChoice:input.dataChoice||'CONTACT_STAFF'});
  return {...x,state:'WITHDRAWN',withdrawal:f};
 });
 return {state:next.state,recorded:true,
  requiresResearcherDataDisposition:true,
  dataDispositionState:'PENDING_RESEARCH_TEAM_ACTION'};
}
function study1EConsentOwnerList(){
 study1AdminOwnerRequired_();
 const r=study1EConsentRegistry_();
 return {revision:r.revision,records:r.records.map(x=>({id:x.id,
  experiment:x.experiment,version:x.documentVersion,sha256:x.documentSha,
  state:x.state,expires:x.expires,
  researcherPresigned:x.researcherPresigned===true,
  signedPdfSha256:x.researcherPresigned===true&&x.state==='CONFIRMED'&&x.signedPdf?
   x.signedPdf.sha:null}))};
}


/**
 * MVP OWNER-only prior review and download of an immutable completed PDF.
 * No public URL/Drive ID, questionnaire answers or bearer signing token is
 * leaked. Bytes are returned only after the original PRIVATE SHA readback.
 */
function study1EConsentOwnerSignedPdfDownload(consentId){
 study1AdminOwnerRequired_();
 if(typeof consentId!=='string'||!/^[-a-f0-9]{30,40}$/i.test(consentId))
  throw Error('OWNER_SIGNED_PDF_RECORD_ID_INVALID');
 const matches=study1EConsentRegistry_().records.filter(x=>x.id===consentId);
 if(matches.length!==1)throw Error('OWNER_SIGNED_PDF_RECORD_NOT_UNIQUE');
 const x=matches[0];
 if(x.channel!=='FORMAL_E1'||x.experiment!=='E1'||
    x.researcherPresigned!==true||
    !['CONFIRMED','WITHDRAWN'].includes(x.state)||
    !x.signedPdf||!x.signature||!x.confirmation)
  throw Error('OWNER_SIGNED_PDF_NOT_READY');
 const signature=study1EConsentEvent_(x.signature,x,'SIGNATURE');
 const confirmed=study1EConsentEvent_(x.confirmation,x,'CONFIRMATION');
 if(signature.data.signedPdfSha256!==x.signedPdf.sha||
    confirmed.data.mode!=='RESEARCHER_PRESIGNED_SOURCE'||
    confirmed.data.researcherSignedSourceSha256!==x.documentSha||
    confirmed.data.signatureHash!==x.signature.sha||
    confirmed.data.researcherSignedPdfSha256!==x.signedPdf.sha)
  throw Error('OWNER_SIGNED_PDF_EVIDENCE_CHANGED');
 const bytes=study1EConsentSignedPdfRead_(x.signedPdf,x);
 return {experiment:'E1',recordId:x.id,version:x.documentVersion,
  researcherPreSigned:true,sourceSha256:x.documentSha,
  signedPdfSha256:x.signedPdf.sha,bytes:bytes.length,
  mime:'application/pdf',base64:Utilities.base64Encode(bytes)};
}


/** No names, health answers or reasons in this owner-only action queue. */
function study1EConsentOwnerWithdrawalCases(){
 study1AdminOwnerRequired_();
 const r=study1EConsentRegistry_();
 return {readOnly:true,records:r.records.filter(x=>
   x.channel==='FORMAL_E1'&&x.experiment==='E1'&&x.state==='WITHDRAWN')
  .map(x=>{
   const event=study1EConsentEvent_(x.withdrawal,x,'WITHDRAWAL');
   return {id:x.id,withdrawalSha256:x.withdrawal.sha,
    dataChoice:event.data.dataChoice||'CONTACT_STAFF',
    dispositionState:x.disposition?'OWNER_EVIDENCE_RECORDED_PI_REVIEW':
     'PENDING_RESEARCH_TEAM_ACTION',
    requiresResearcherDataDisposition:true};
  })};
}


/** Staff-managed withdrawal handles requests after bearer links expire. */
function study1EConsentOwnerWithdraw(input){
 study1AdminOwnerRequired_();
 if(!input||Object.keys(input).sort().join(',')!=='id,identityVerified,reason'||
  input.identityVerified!==true||typeof input.id!=='string'||
  typeof input.reason!=='string'||input.reason.trim().length<4||
  input.reason.length>600||/[<>]/.test(input.reason))
  throw Error('研究人員須核對當事人身分與正式撤回要求');
 return study1EConsentChange_(input.id,x=>{
  study1AdminOwnerRequired_();
  if(x.state!=='CONFIRMED')throw Error('只有已確認且未撤回的紀錄可以撤回');
  study1EConsentEvent_(x.signature,x,'SIGNATURE');
  study1EConsentEvent_(x.confirmation,x,'CONFIRMATION');
  const f=study1EConsentFile_('WITHDRAWAL',x,{
   reason:input.reason.trim(),staff:'OWNER',identityVerified:true,
   signatureHash:x.signature.sha,confirmationHash:x.confirmation.sha,
   dataChoice:'CONTACT_STAFF'});
  return {...x,state:'WITHDRAWN',withdrawal:f};
 });
}


/**
 * §70-S: full PDF composition is separate from the legacy synthetic-only
 * SIGNATURE event. No live personal data is accepted unless the independent
 * provider/REC/WIZARD gates are verified, and a pinned owner-reviewed PDF
 * layout exists for the exact E1/E2 source SHA. Private GAS only, no CDN.
 */
function study1EConsentSignedPdfStore_(stamp,entry){
 if(!stamp||stamp.experiment!==entry.experiment||
   stamp.sourceSha256!==entry.documentSha||
   stamp.version!==entry.documentVersion||
   !/^[a-f0-9]{64}$/.test(stamp.signedSha256))
  throw Error('簽署版PDF與固定研究實驗、文件版號不相符');
 const bytes=stamp.signedPdfBytes;
 if(!Array.isArray(bytes)||bytes.length<100||bytes.length>6000000||
   study1PdfDigest_(bytes)!==stamp.signedSha256)
  throw Error('簽署版PDF內容或SHA錯誤');
 const folder=study1EConsentFolder_();
 const name='Study1_'+entry.experiment+'_signed_'+entry.id+'_'+stamp.signedSha256.slice(0,12)+'.pdf';
 const blob=Utilities.newBlob(bytes.map(b=>b>127?b-256:b),'application/pdf',name);
 const file=folder.createFile(blob);
 try{
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE||
     file.getMimeType()!=='application/pdf'||
     file.getSize()!==bytes.length)
   throw Error('完整簽署PDF未保存在私人位置');
  const copied=file.getBlob().getBytes();
  if(copied.length!==bytes.length||
     study1PdfDigest_(copied)!==stamp.signedSha256)
   throw Error('完整簽署PDF寫入後回讀SHA不一致');
  return {id:file.getId(),sha:stamp.signedSha256};
 }catch(error){try{file.setTrashed(true);}catch(_){}throw error;}
}
function study1EConsentSignedPdfRead_(ref,entry){
 if(!ref||typeof ref.id!=='string'||!/^[A-Za-z0-9_-]{15,100}$/.test(ref.id)||
   typeof ref.sha!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha))
  throw Error('完整簽署PDF索引不合法');
 study1EConsentFolder_();
 const f=DriveApp.getFileById(ref.id);
 if(f.getMimeType()!=='application/pdf'||
   f.getSharingAccess()!==DriveApp.Access.PRIVATE||
   f.getSize()<100||f.getSize()>6000000)
  throw Error('簽署PDF格式、大小或私人權限變動');
 const parents=f.getParents();let allowed=false;
 while(parents.hasNext())
  if(parents.next().getId()===STUDY1_CONSENT_DOC_FOLDER_)allowed=true;
 if(!allowed)throw Error('簽署PDF已脫離原私人研究資料夾');
 const bytes=f.getBlob().getBytes();
 if(bytes.length!==f.getSize()||study1PdfDigest_(bytes)!==ref.sha)
  throw Error('完整簽署PDF已變動或SHA不一致');
 return bytes;
}
async function study1EConsentSignPdf(input){
 // Important: this endpoint is intentionally UNAVAILABLE until a real
 // registration-bound identity provider and approved PDF evidence provider
 // are installed. No owner-only TEST fixture can set these live gates.
 if(!study1EConsentEnabled_())
  throw Error('尚未開放有效電子簽署');
 // The approved research protocol must not be globally vetoed by an
 // assumed REC prohibition. This path still requires independent technical
 // PDF-provider, wizard-binding, identity, booking, consent and storage gates.
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED')!=='true'||
    p.getProperty('STUDY1_ECONSENT_WIZARD_LINK_VERIFIED')!=='true')
  throw Error('PDF_LINK_NOT_READY：正式PDF保存與本人報名身分連結尚未驗證');
 if(!input||Object.keys(input).sort().join(',')!=='agree,answerAcknowledged,documentSha,name,read,signature,token'||
  input.agree!==true||input.answerAcknowledged!==true||input.read!==true||
  typeof input.name!=='string'||!input.name.trim()||input.name.length>80||
  /[<>\u0000-\u001f]/.test(input.name)||
  typeof input.documentSha!=='string'||!/^[a-f0-9]{64}$/.test(input.documentSha)||
  typeof input.signature!=='string'||input.signature.length>125000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signature))
  throw Error('必須完成正式文件全文閱讀、說明確認、姓名及本人手寫簽名');
 const pngBytes=Utilities.base64Decode(input.signature);
 if(pngBytes.length<100||pngBytes.length>90000||
  pngBytes.slice(0,8).map(b=>b&255).join(',')!=='137,80,78,71,13,10,26,10')
  throw Error('本人手寫簽名必須是完整PNG');
 const prior=study1EConsentEntry_(input.token,study1EConsentRegistry_());
 // A bearer token and staff manual invitation are never sufficient proof.
 // This must be re-read from approved server-only sources, not from the browser.
 if(!prior.binding)throw Error('BINDING_REQUIRED：此邀請未綁定身分／OTP／預約');
 if(prior.channel==='FORMAL_E1'){
  study1FormalConsentGate_();study1FormalConsentCopyExpiry_();
 }
 const preSigned=prior.channel==='FORMAL_E1'&&prior.researcherPresigned===true;
 const bindingAdapter=study1EConsentBindingAdapter_(prior.channel==='FORMAL_E1'?'PUBLIC_E1':undefined);
 if((prior.state!=='EXPLAINED'&&!(preSigned&&prior.state==='ISSUED'))||
   prior.documentSha!==input.documentSha||prior.expires<=Date.now())
  throw Error('此固定文件已失效，無法簽署');
 if(!preSigned)study1EConsentEvent_(prior.explanation,prior,'EXPLANATION');
 const doc=study1EConsentReadyDocument_(prior.experiment);
 if(preSigned&&doc.researcherPresigned!==true)
  throw Error('RESEARCHER_PRESIGNED_SOURCE_CHANGED');
 if(doc.version!==prior.documentVersion||doc.sha256!==prior.documentSha)
  throw Error('已選用的核准文件不是原先說明並同意的版本');
 study1BindingRecheckWithLock_(prior.binding,doc,bindingAdapter);
 const layout=study1PdfLayoutRead_(prior.experiment,doc);
 const verifiedOriginal=study1ConsentDocumentBytes_(doc);
 // Trusted server time is created here, never accepted from the browser.
 const signedAt=new Date();
 const stamped=await study1PdfComposeSigned_(verifiedOriginal,pngBytes,layout,
  {experiment:prior.experiment,sha256:prior.documentSha,
   version:prior.documentVersion},signedAt);
 let savedPdf=null,verifiedContactEmail=null;
 try{
  const changed=study1EConsentChange_(prior.id,(x,r,heldLock)=>{
   if(!study1EConsentEnabled_()||
      p.getProperty('STUDY1_ECONSENT_PDF_PROVIDER_VERIFIED')!=='true'||
      p.getProperty('STUDY1_ECONSENT_WIZARD_LINK_VERIFIED')!=='true'||
      (x.state!=='EXPLAINED'&&!(preSigned&&x.state==='ISSUED'&&x.researcherPresigned===true))||
      x.expires<=Date.now()||
      x.documentSha!==prior.documentSha||
      x.documentVersion!==prior.documentVersion)
    throw Error('同意書版本、身分連結或簽署狀態在處理時已改變');
   if(!preSigned)study1EConsentEvent_(x.explanation,x,'EXPLANATION');
   const reloaded=study1EConsentReadyDocument_(x.experiment);
   if(preSigned&&reloaded.researcherPresigned!==true)
    throw Error('RESEARCHER_PRESIGNED_SOURCE_CHANGED');
   study1PdfLayoutRead_(x.experiment,reloaded);
   if(reloaded.sha256!==stamped.sourceSha256)throw Error('核准原PDF變動');
   // Revalidate the same identity, consumed OTP, active slot and hold while
   // holding the very script lock protecting the signature event CAS.
   if(!x.binding||x.binding.digest!==prior.binding.digest)
    throw Error('簽署邀請的本人身分連結發生變動');
   if(!heldLock||heldLock.hasLock()!==true)
    throw Error('PDF_SIGN_FINAL_CAS_LOCK_REQUIRED');
   study1BindingRecheck_(x.binding,reloaded,bindingAdapter,new Date().toISOString(),heldLock);
   // The typed self-declared signing name must match the original applicant
   // row. Email OTP is mailbox control, never documentary identity checking.
   if(x.channel==='FORMAL_E1'){
    const expected={applicantId:x.binding.applicantId,
     screeningId:x.binding.screeningId,challengeId:x.binding.challengeId,
     experiment:'E1',reservationId:x.binding.reservationId,
     slotId:x.binding.slotId,documentSha:x.binding.documentSha,
     documentVersion:x.binding.documentVersion};
    const source=bindingAdapter.readTrustedSnapshot(expected,heldLock);
    const originalName=source&&source.applicants&&source.applicants.rows&&
     source.applicants.rows[0]&&source.applicants.rows[0][1];
    if(typeof originalName!=='string'||originalName.trim()!==input.name.trim())
     throw Error('FORMAL_CONSENT_NAME_NOT_SAME_APPLICATION');
    // E-mail is read only from the original verified applicant, not browser input.
    if(preSigned)verifiedContactEmail=study1BindingEmail_(source.applicants.rows[0][2]);
   }
   const accessExpires=x.channel==='FORMAL_E1'?
    study1FormalConsentCopyExpiry_():x.expires;
   savedPdf=study1EConsentSignedPdfStore_(stamped,x);
   const event=study1EConsentFile_('SIGNATURE',x,{
    name:input.name.trim(),signaturePngBase64:input.signature,
    read:true,answerAcknowledged:true,agreed:true,
    signedPdfSha256:savedPdf.sha,serverSignedAt:stamped.serverSignedAt,
    taipeiDate:stamped.taipeiDate,
    explanationHash:x.explanation?x.explanation.sha:null});
   // Researcher signed the immutable uploaded source before enrollment.
   // Never request or forge a second researcher signature after participant.
   const confirmation=preSigned?study1EConsentFile_('CONFIRMATION',x,{
    mode:'RESEARCHER_PRESIGNED_SOURCE',researcherSignedSourceSha256:x.documentSha,
    signatureHash:event.sha,participantSignedPdfSha256:savedPdf.sha,
    researcherSignedPdfSha256:savedPdf.sha,recordedAtUtc:new Date().toISOString()}):null;
   return {...x,state:preSigned?'CONFIRMED':'SIGNED',signature:event,
    signedPdf:savedPdf,participantSignedPdf:preSigned?savedPdf:null,
    confirmation:preSigned?confirmation:x.confirmation,
    expires:accessExpires};
  });
  if(changed.state!==(preSigned?'CONFIRMED':'SIGNED')||!changed.signedPdf||
     changed.signedPdf.sha!==stamped.signedSha256)
   throw Error('簽署PDF寫後索引核對未通過');
  let originalBookingConfirmed=false;
  if(preSigned){
   try{
    const result=study1FormalFinalizeSignedE1Booking_(changed.id,input.token);
    originalBookingConfirmed=result.bookingConfirmed===true&&result.bookingStatus==='CONFIRMED';
   }catch(_){/* PDF is immutable; original booking requires reconciliation. */}
  }
  let emailNotificationStatus='NOT_APPLICABLE';
  if(preSigned){
   emailNotificationStatus=originalBookingConfirmed?'NOT_SENT':'BOOKING_NOT_CONFIRMED';
   if(originalBookingConfirmed&&verifiedContactEmail){
    try{
     const notice=study1ParticipantBookingNotice_(verifiedContactEmail,changed.id);
     emailNotificationStatus=notice.status==='PROVIDER_ACCEPTED'?
      'PROVIDER_ACCEPTED_NOT_DELIVERED':'UNKNOWN_REQUIRES_STAFF_REVIEW';
    }catch(_){emailNotificationStatus='UNKNOWN_REQUIRES_STAFF_REVIEW';}
   }
  }
  return {state:preSigned?'CONFIRMED':'SIGNED',experiment:prior.experiment,
   researcherPreSigned:preSigned,originalBookingConfirmed,emailNotificationStatus,
   documentSha256:stamped.sourceSha256,
   signedPdfSha256:stamped.signedSha256,
   signedAt:stamped.serverSignedAt,taipeiDate:stamped.taipeiDate,
   message:preSigned?'研究者已先簽署PDF，本人線上簽名版已保存；請核對預約狀態及下載副本':
    '完整簽署PDF已保存，待研究人員確認並交付本人副本'};
 }catch(error){
  if(savedPdf){
   let referenced=false;
   try{referenced=study1EConsentRegistry_().records.some(x=>x.id===prior.id&&
       x.signedPdf?.id===savedPdf.id&&x.signedPdf.sha===savedPdf.sha);}
   catch(_){referenced=true;} // ambiguous state: never delete possible evidence
   if(!referenced)try{DriveApp.getFileById(savedPdf.id).setTrashed(true);}catch(_){}
  }
  throw error;
 }
}

/** OWNER handwritten second signature in the REC-pinned researcher PDF box.
 * Original PDF and participant-signed PDF remain immutable and traceable.
 */
async function study1EConsentConfirmPdf(input){
 study1AdminOwnerRequired_();
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).sort().join(',')!=='id,notes,participantSignedSha256,researcherSignature'||
  !/^[-a-f0-9]{30,40}$/i.test(input.id||'')||
  typeof input.notes!=='string'||!input.notes.trim()||input.notes.length>1000||
  /[<>]/.test(input.notes)||!/^[a-f0-9]{64}$/.test(input.participantSignedSha256||'')||
  typeof input.researcherSignature!=='string'||input.researcherSignature.length>125000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(input.researcherSignature))
  throw Error('RESEARCHER_PDF_REQUEST_INVALID');
 const png=Utilities.base64Decode(input.researcherSignature);
 if(png.length<100||png.length>90000||
  png.slice(0,8).map(b=>b&255).join(',')!=='137,80,78,71,13,10,26,10')
  throw Error('RESEARCHER_PDF_PNG_INVALID');
 study1FormalConsentGate_();
 const active=Session.getActiveUser().getEmail(),
   effective=Session.getEffectiveUser().getEmail();
 if(!active||active!==effective)throw Error('RESEARCHER_SESSION_MISMATCH');
 const registry=study1EConsentRegistry_(),
  before=registry.records.find(x=>x.id===input.id);
 if(!before||before.channel!=='FORMAL_E1'||before.experiment!=='E1'||
  before.state!=='SIGNED'||!before.binding||!before.signedPdf||
  before.signedPdf.sha!==input.participantSignedSha256)
  throw Error('RESEARCHER_PDF_UNBOUND_OR_STALE');
 const signedEvent=study1EConsentEvent_(before.signature,before,'SIGNATURE');
 study1EConsentEvent_(before.explanation,before,'EXPLANATION');
 if(signedEvent.data.signedPdfSha256!==before.signedPdf.sha)
  throw Error('RESEARCHER_PDF_PARTICIPANT_HASH_MISMATCH');
 const doc=study1EConsentReadyDocument_('E1');
 if(doc.sha256!==before.documentSha||doc.version!==before.documentVersion)
  throw Error('RESEARCHER_PDF_SOURCE_CHANGED');
 const adapter=study1EConsentBindingAdapter_('PUBLIC_E1');
 study1BindingRecheckWithLock_(before.binding,doc,adapter);
 const layout=study1PdfResearcherLayoutRead_('E1',doc);
 const bytes=study1EConsentSignedPdfRead_(before.signedPdf,before);
 const expected={experiment:'E1',sha256:before.documentSha,
  version:before.documentVersion,participantSignedSha256:before.signedPdf.sha};
 const stamped=await study1PdfComposeResearcherSigned_(bytes,png,layout,expected,new Date());
 let saved=null;
 try{
  const changed=study1EConsentChange_(before.id,(x,_,heldLock)=>{
   study1AdminOwnerRequired_();study1FormalConsentGate_();
   if(Session.getActiveUser().getEmail()!==active||
    Session.getEffectiveUser().getEmail()!==effective)
    throw Error('RESEARCHER_OWNER_CHANGED');
   if(!heldLock||heldLock.hasLock()!==true||x.state!=='SIGNED'||
    x.channel!=='FORMAL_E1'||!x.binding||x.binding.digest!==before.binding.digest||
    !x.signedPdf||x.signedPdf.id!==before.signedPdf.id||
    x.signedPdf.sha!==before.signedPdf.sha||
    x.documentSha!==doc.sha256||x.documentVersion!==doc.version)
    throw Error('RESEARCHER_PDF_CAS_CHANGED');
   const current=study1EConsentReadyDocument_('E1');
   if(current.sha256!==doc.sha256||
     JSON.stringify(study1PdfResearcherLayoutRead_('E1',current))!==JSON.stringify(layout))
    throw Error('RESEARCHER_PDF_LAYOUT_CHANGED');
   study1BindingRecheck_(x.binding,current,adapter,new Date().toISOString(),heldLock);
   study1EConsentEvent_(x.signature,x,'SIGNATURE');
   study1EConsentEvent_(x.explanation,x,'EXPLANATION');
   study1EConsentSignedPdfRead_(x.signedPdf,x);
   saved=study1EConsentSignedPdfStore_(stamped,x);
   const confirmation=study1EConsentFile_('CONFIRMATION',x,{
    researcher:'OWNER',reviewerEmail:active,
    identityEvidenceSource:'PARTICIPANT_SELF_REPORT_EMAIL_OTP',
    notes:input.notes,signatureHash:x.signature.sha,
    explanationHash:x.explanation.sha,
    participantSignedPdfSha256:x.signedPdf.sha,
    researcherSignedPdfSha256:saved.sha,
    researcherSignedAt:stamped.researcherSignedAt,
    researcherTaipeiDate:stamped.researcherTaipeiDate,
    researcherSignaturePngSha256:study1PdfDigest_(png)});
   return {...x,state:'CONFIRMED',confirmation,
    participantSignedPdf:x.signedPdf,signedPdf:saved};
  });
  if(changed.state!=='CONFIRMED'||changed.signedPdf.sha!==stamped.signedSha256)
   throw Error('RESEARCHER_PDF_COMMIT_UNKNOWN');
  // The consent event and original Reservations are separate data stores.
  // NEVER move a booking before the dual PDF is fully committed. The second
  // OWNER-only transaction is independently locked, source-verified and CAS
  // read back; if it fails, preserve the genuine PDF and report PENDING.
  let originalBookingConfirmed=false;
  try{
   if(typeof study1FormalFinalizeSignedE1Booking_==='function'){
    const booking=study1FormalFinalizeSignedE1Booking_(before.id);
    originalBookingConfirmed=booking.bookingConfirmed===true&&
      booking.bookingStatus==='CONFIRMED';
   }
  }catch(_){/* No claim of booking success or automatic unsafe replay. */}
  return {state:'CONFIRMED',experiment:'E1',
   participantSignedPdfSha256:before.signedPdf.sha,
   signedPdfSha256:stamped.signedSha256,
   researcherSignedAt:stamped.researcherSignedAt,
   researcherTaipeiDate:stamped.researcherTaipeiDate,participantCopyAvailable:true,
   originalBookingConfirmed,
   originalBookingStatus:originalBookingConfirmed?'CONFIRMED':'OWNER_RECONCILIATION_REQUIRED'};
 }catch(error){
  if(saved){
   let referenced=true;
   try{referenced=study1EConsentRegistry_().records.some(x=>
    x.id===before.id&&x.signedPdf&&x.signedPdf.id===saved.id);}
   catch(_){referenced=true;}
   if(!referenced)try{DriveApp.getFileById(saved.id).setTrashed(true);}catch(_){}
  }
  throw error;
 }
}
function study1EConsentOwnerPendingPdfConfirmations(){
 study1AdminOwnerRequired_();
 return {readOnly:true,records:study1EConsentRegistry_().records
  .filter(x=>x.channel==='FORMAL_E1'&&x.state==='SIGNED'&&x.signedPdf)
  .map(x=>({id:x.id,experiment:'E1',version:x.documentVersion,
   sourceSha256:x.documentSha,participantSignedPdfSha256:x.signedPdf.sha}))};
}

/** Only the one fixed document's signed-PDF bytes, after staff confirmation. */
function study1EConsentSignedPdfCopy(token){
 const entry=study1EConsentEntry_(token,study1EConsentRegistry_());
 if(!['CONFIRMED','WITHDRAWN'].includes(entry.state)||!entry.signedPdf)
  throw Error('未取得雙方確認的完整版簽署PDF，禁止以原PDF加HTML收據取代');
 const event=study1EConsentEvent_(entry.signature,entry,'SIGNATURE');
 const confirmation=study1EConsentEvent_(entry.confirmation,entry,'CONFIRMATION');
 if(confirmation.data.signatureHash!==entry.signature.sha)
  throw Error('PDF、本人簽名及研究人員確認事件未能一致核對');
 const researcherPreSigned=entry.channel==='FORMAL_E1'&&entry.researcherPresigned===true;
 if(entry.channel==='FORMAL_E1'){
  if(!entry.participantSignedPdf||
     entry.participantSignedPdf.sha!==event.data.signedPdfSha256||
     confirmation.data.participantSignedPdfSha256!==entry.participantSignedPdf.sha||
     confirmation.data.researcherSignedPdfSha256!==entry.signedPdf.sha)
   throw Error('FORMAL_DUAL_PDF_EVIDENCE_MISMATCH');
  if(researcherPreSigned){
   // The researcher's actual signature is ALREADY in the immutable uploaded
   // source PDF; a second researcher timestamp or online signature is false.
   if(entry.participantSignedPdf.id!==entry.signedPdf.id||
      confirmation.data.mode!=='RESEARCHER_PRESIGNED_SOURCE'||
      confirmation.data.researcherSignedSourceSha256!==entry.documentSha)
    throw Error('FORMAL_PRESIGNED_PDF_SOURCE_EVIDENCE_INVALID');
  }else if(typeof confirmation.data.researcherSignedAt!=='string'||
     confirmation.data.researcherTaipeiDate!==study1PdfTaipeiDate_(
      new Date(confirmation.data.researcherSignedAt))||
     !/^[a-f0-9]{64}$/.test(confirmation.data.researcherSignaturePngSha256||''))
    throw Error('FORMAL_DUAL_PDF_EVIDENCE_MISMATCH');
  study1EConsentSignedPdfRead_(entry.participantSignedPdf,entry);
 }else if(event.data.signedPdfSha256!==entry.signedPdf.sha)
  throw Error('舊簽署PDF來源與研究員確認未一致');

 // Re-evaluate BOTH independent server dates and their chronological order
 // before releasing a purportedly dual-signed copy. The PDF SHA alone cannot
 // detect a corrupted or re-linked timestamp evidence record.
 if(entry.channel==='FORMAL_E1'){
  const participantAt=new Date(event.data.serverSignedAt);
  if(!Number.isFinite(participantAt.getTime())||
     participantAt.toISOString()!==event.data.serverSignedAt||
     event.data.taipeiDate!==study1PdfTaipeiDate_(participantAt))
   throw Error('FORMAL_DUAL_PDF_CHRONOLOGY_INVALID');
  if(!researcherPreSigned){
   const researcherAt=new Date(confirmation.data.researcherSignedAt);
   if(!Number.isFinite(researcherAt.getTime())||
      researcherAt.toISOString()!==confirmation.data.researcherSignedAt||
      researcherAt.getTime()<participantAt.getTime()||
      confirmation.data.researcherTaipeiDate!==study1PdfTaipeiDate_(researcherAt))
    throw Error('FORMAL_DUAL_PDF_CHRONOLOGY_INVALID');
  }
 }
 const bytes=study1EConsentSignedPdfRead_(entry.signedPdf,entry);
 return {experiment:entry.experiment,version:entry.documentVersion,
  sourceSha256:entry.documentSha,signedPdfSha256:entry.signedPdf.sha,
  signedAt:event.data.serverSignedAt,taipeiDate:event.data.taipeiDate,
  researcherSignedAt:entry.channel==='FORMAL_E1'&&!researcherPreSigned?
   confirmation.data.researcherSignedAt:null,
  researcherTaipeiDate:entry.channel==='FORMAL_E1'&&!researcherPreSigned?
   confirmation.data.researcherTaipeiDate:null,
  researcherPreSigned,
  participantSignedPdfSha256:entry.channel==='FORMAL_E1'?entry.participantSignedPdf.sha:null,
  dualSigned:entry.channel==='FORMAL_E1',
  base64:Utilities.base64Encode(bytes),mime:'application/pdf',
  bytes:bytes.length};
}
