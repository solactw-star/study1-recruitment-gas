/**
 * Owner-only unified TEST fixture transaction adapters. No I/O, real email,
 * research Sheets, approved REC, or production credentials. Every call occurs
 * inside Study1Flow's existing owner-checked script-wide lock; this module
 * only mutates the in-memory COPY, committed by Study1Flow after validation.
 * A re-entrant synthetic lock proxy exercises the existing OTP/Booking
 * transaction kernels against fictional rows.
 */
function study1FixtureLock_(outer){
 if(!outer||typeof outer.hasLock!=='function'||outer.hasLock()!==true)
  throw Error('測試交易必須持有外層全域鎖');
 return {tryLock:()=>outer.hasLock()===true,
  hasLock:()=>outer.hasLock()===true,releaseLock:()=>{}};
}
function study1FixtureEmail_(a){return 'sim-'+a.id.toLowerCase()+'@example.invalid';}
function study1FixtureOtpSnapshot_(s){
 const secret='SIMULATED_ONLY_NOT_A_PRODUCTION_SECRET_V1';
 const rows=[];
 for(const a of s.applications){
  (a.otpHistory||[]).forEach((h,i)=>{
   const challenge='SIMOTP_'+a.id+'_'+(i+1);
   rows.push([challenge,a.id,OTP_RULES_.emailPurpose,
    otpHmacHex_(challenge,a.id,OTP_RULES_.emailPurpose,'00000000',secret),
    new Date(h.createdAt+OTP_RULES_.ttlMinutes*60000).toISOString(),
    h.attempts,h.usedAt||'',study1FixtureEmail_(a),
    new Date(h.createdAt).toISOString()]);
  });
 }
 return {headers:[...OTP_VERIFICATION_HEADERS_],rows};
}
function study1FixtureIssue_(s,a,now){
 if(!Array.isArray(a.otpHistory)||a.otpHistory.length>=3)
  throw Error('測試 OTP 重送已達限制');
 const preflight=otpThrottleIssuePreflight_(
  study1FixtureOtpSnapshot_(s),
  {applicantId:a.id,email:study1FixtureEmail_(a)},new Date(now).toISOString());
 if(!preflight.allowed)throw Error('測試 OTP 節流限制，拒絕重送');
 a.otpHistory.push({createdAt:now,attempts:0,usedAt:''});
 a.otpRequestedAt=now;a.otpAttempts=0;
}
function study1FixtureVerify_(s,a,code,now,outerLock){
 if(!Array.isArray(a.otpHistory)||!a.otpHistory.length)
  throw Error('尚無測試 OTP 挑戰');
 const decision=study1UnifiedCoreOtpDecision_(a,code,now);
 if(decision.reason==='EXPIRED'||decision.reason==='ATTEMPT_LIMIT')
  throw Error('測試 OTP 已過期或超過嘗試限制');
 if(decision.reason!=='MATCH'&&decision.reason!=='INVALID')
  throw Error('測試 OTP 核心拒絕驗證');
 const challenge='SIMOTP_'+a.id+'_'+a.otpHistory.length;
 const result=otpVerifyOnceLocked_({
  challengeId:challenge,applicantId:a.id,email:study1FixtureEmail_(a),
  code,nowUtc:new Date(now).toISOString()
 },{
  getLock:()=>study1FixtureLock_(outerLock),
  getSecret:()=> 'SIMULATED_ONLY_NOT_A_PRODUCTION_SECRET_V1',
  readSnapshot:()=>study1FixtureOtpSnapshot_(s),
  writeAttemptAndUse:(rowNumber,attempts,usedAt)=>{
   if(outerLock.hasLock()!==true)return false;
   const rows=study1FixtureOtpSnapshot_(s).rows;
   if(!rows[rowNumber-2]||rows[rowNumber-2][0]!==challenge)return false;
   const h=a.otpHistory[a.otpHistory.length-1];
   h.attempts=attempts;h.usedAt=usedAt||'';a.otpAttempts=attempts;
   return true;
  }
 });
 if(result.verified===true)a.phase='VERIFIED';
 return result;
}
function study1FixtureBookingSnapshot_(s,now){
 const slots=s.slots.map(slot=>{
  const start=Date.parse(slot.when.replace(' ','T')+':00+08:00');
  return [slot.id,new Date(start).toISOString(),
   new Date(start+7200000).toISOString(),slot.capacity,
   'SIM_ONLY','OPEN','SIM_OWNER',''];
 });
 const reservations=s.applications.filter(a=>a.slotId!==null).map(a=>{
  const status=({HELD:'HELD',CONSENTED:'HELD',CONFIRMED:'CONFIRMED',
   CANCELLED:'CANCELLED'})[a.phase];
  if(!status)throw Error('測試預約歷史狀態不合法');
  const expiry=status==='HELD'?new Date(a.holdUntil).toISOString():'';
  const created=status==='HELD'?
   Math.min(now-1000,a.holdUntil-1000):now-2000;
  const event=status==='CONFIRMED'||status==='CANCELLED'?
   new Date(now-1000).toISOString():'';
  return ['SIMRES_'+a.id,a.id,a.slotId,status,expiry,
   'SIMHISTORY_'+a.id,new Date(created).toISOString(),
   status==='CONFIRMED'?event:'',
   status==='CANCELLED'?event:'',
   event];
 });
 return {slots:{headers:[...BOOKING_SLOT_HEADERS_],rows:slots},
  reservations:{headers:[...BOOKING_RESERVATION_HEADERS_],rows:reservations}};
}
function study1FixtureHold_(s,a,slot,requestId,now,outerLock){
 const shadow=study1FixtureBookingSnapshot_(s,now);
 const result=bookingHoldOnceLocked_({
  applicantId:a.id,slotId:slot.id,idempotencyKey:requestId,
  nowUtc:new Date(now).toISOString(),
  holdUntilUtc:new Date(now+900000).toISOString()
 },{
  getLock:()=>study1FixtureLock_(outerLock),
  isVerifiedAndEligible:id=>id===a.id&&a.eligible===true&&
   (a.phase==='VERIFIED'||(['HELD','CONSENTED'].includes(a.phase)&&a.holdUntil<=now)),
  readSnapshot:()=>({
   slots:{headers:[...shadow.slots.headers],rows:shadow.slots.rows.map(r=>r.slice())},
   reservations:{headers:[...shadow.reservations.headers],rows:shadow.reservations.rows.map(r=>r.slice())}
  }),
  appendHold:row=>{
   if(outerLock.hasLock()!==true)return false;
   shadow.reservations.rows.push(['SIMNEW_'+a.id,a.id,row.slotId,'HELD',
    row.holdUntilUtc,row.idempotencyKey,row.nowUtc,'','','']);
   return true;
  }
 });
 if(!result.held||result.reason!=='CREATED')
  throw Error('測試時段不存在、重複、已開始或已額滿');
 return result;
}
