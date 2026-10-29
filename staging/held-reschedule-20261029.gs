/**
 * STAGING ONLY — not a standalone Apps Script deployment file.
 * These two functions were added to the OFFLINE Study1 ZIP:
 *   rescheduleHold -> gas/Api.gs
 *   patchRow_       -> gas/Setup.gs
 * DO NOT push this file into GAS alongside the ZIP; doing so would duplicate
 * functions. First read/backup/diff the existing remote GAS project.
 *
 * 828 owner: solac.tw@gmail.com
 * GAS ID: 1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z
 */
function rescheduleHold(token,reservationId,newSlotId,requestKey){
 requireOpen_();const email=session_(token);
 if(typeof reservationId!=='string'||!/^R-[a-z0-9-]{10,100}$/i.test(reservationId)||
    typeof newSlotId!=='string'||newSlotId.length<3||newSlotId.length>100||
    typeof requestKey!=='string'||requestKey.length<12||requestKey.length>100)
   return {ok:false,message:'請重新選擇預約時段。'};
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
   const app=rows_('Applicants').find(x=>x.email===email);
   if(!app)return {ok:false,message:'請重新驗證電子信箱。'};
   const rs=rows_('Reservations'),now=Date.now();
   const held=rs.find(r=>r.reservation_id===reservationId&&r.applicant_id===app.applicant_id);
   if(!held||held.status!=='HELD'||new Date(held.hold_until).getTime()<=now)
     return {ok:false,message:'原保留時段已取消或逾時，請重新預約。'};
   if(held.idempotency_key===requestKey&&held.slot_id!==newSlotId)
     return {ok:false,message:'此變更識別碼已使用，請重新送出。'};
   if(held.slot_id===newSlotId)
     return {ok:true,reservation_id:held.reservation_id,slot_id:held.slot_id,expires_at:held.hold_until};
   if(rs.some(r=>r.reservation_id!==reservationId&&r.applicant_id===app.applicant_id&&
      (r.status==='CONFIRMED'||r.status==='FINALIZING'||
       r.status==='HELD'&&new Date(r.hold_until).getTime()>now)))
     return {ok:false,message:'已有其他有效預約，請聯絡研究團隊。'};
   const target=rows_('Slots').find(s=>s.slot_id===newSlotId&&s.status==='OPEN'&&new Date(s.start_at).getTime()>now);
   if(!target)return {ok:false,message:'新時段無法預約，原保留時段不變。'};
   const cap=Number(target.capacity);
   if(!Number.isInteger(cap)||cap<1)return {ok:false,message:'新時段暫無可用名額，原保留時段不變。'};
   const occupied=rs.filter(r=>r.slot_id===newSlotId&&
      (r.status==='CONFIRMED'||r.status==='FINALIZING'||
       r.status==='HELD'&&new Date(r.hold_until).getTime()>now)).length;
   if(occupied>=cap)return {ok:false,message:'新時段已額滿，原保留時段不變。'};
   patchRow_('Reservations',held.__row,{slot_id:newSlotId,idempotency_key:requestKey,updated_at:now_()});
   audit_('RESCHEDULE_HOLD',reservationId,'OK');
   return {ok:true,reservation_id:reservationId,slot_id:newSlotId,expires_at:held.hold_until};
 }finally{lock.releaseLock();}
}
function patchRow_(key,rowIndex,values){
  const sh=sheet_(key),m=tableHeader_(key,sh),width=sh.getLastColumn();
  if(!Number.isInteger(rowIndex)||rowIndex<2||rowIndex>sh.getLastRow())throw new Error('無效資料列');
  const range=sh.getRange(rowIndex,1,1,width),row=range.getValues()[0];
  for(const [logical,v] of Object.entries(values)){
    if(!Object.prototype.hasOwnProperty.call(m,logical))throw new Error('不允許欄位：'+logical);
    row[m[logical]]=safeCell_(v);
  }
  range.setValues([row]);SpreadsheetApp.flush();
}
