/**
 * Study 1 OTP: guarded single-use state transition, INTERNAL TEST KERNEL.
 * No public endpoint, no live Sheet adapter, no real email or participant data.
 * Caller-supplied adapters must use ONE script-wide LockService lock for ALL
 * OTP writers and implement a single contiguous F:G write + flush + reread.
 * This file is NOT a production verifier until the adapter and full flow are
 * independently security-reviewed and deployed with researcher approval.
 */
function otpFindUniqueChallenge_(snapshot, challengeId) {
  if (!snapshot || !Array.isArray(snapshot.headers) || !Array.isArray(snapshot.rows)) {
    throw new Error('驗證碼資料快照格式不合法。');
  }
  otpVerifyHeaders_(snapshot.headers);
  var found=null;
  for (var i=0; i<snapshot.rows.length; i++) {
    var row=snapshot.rows[i];
    if (!Array.isArray(row)) throw new Error('驗證碼資料列格式不合法。');
    if (row[0]===challengeId) {
      if (found) throw new Error('驗證碼識別碼重複，已拒絕驗證。');
      if (row.length<OTP_VERIFICATION_HEADERS_.length) {
        throw new Error('驗證碼資料列欄位不足。');
      }
      found={row:row,rowNumber:i+2};
    }
  }
  return found;
}
function otpBindingEmail_(value) {
  // Binding only, not a definitive user-facing email eligibility policy.
  if (typeof value!=='string' || value.length<3 || value.length>254 ||
      /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('驗證對象電子郵件格式不合法。');
  }
  return value.trim().toLowerCase();
}
function otpBindingMatches_(row, request) {
  return row[0]===request.challengeId &&
    row[1]===request.applicantId &&
    row[2]===OTP_RULES_.emailPurpose &&
    otpBindingEmail_(row[7])===otpBindingEmail_(request.email);
}
/**
 * @param {Object} request {challengeId,applicantId,email,code,nowUtc}
 * @param {Object} adapters
 *  getLock(): script-wide lock with tryLock(ms)/releaseLock()
 *  getSecret(): server-side HMAC secret, NEVER provided by the browser
 *  readSnapshot(): {headers, rows}, fresh read INSIDE the acquired lock
 *  writeAttemptAndUse(rowNumber, attempts, usedAt): one F:G update,
 *    must flush and persist before returning true. No writes elsewhere.
 *
 * Every call reads fresh state while locked and rereads after writes.
 * Failure to lock, malformed state, failed write or failed readback THROWS.
 * Normal rejection always returns the same non-enumerating result.
 */
/** Refuse any OTP state transition unless the injected script lock is held. */
function otpAssertLockStillHeld_(lock) {
  if (lock.hasLock() !== true) {
    throw new Error('OTP 全域交易鎖在執行期間失效，已拒絕驗證。');
  }
}
function otpVerifyOnceLocked_(request, adapters) {
  if (!request || typeof request!=='object' || Array.isArray(request) ||
      !adapters || typeof adapters.getLock!=='function' ||
      typeof adapters.getSecret!=='function' ||
      typeof adapters.readSnapshot!=='function' ||
      typeof adapters.writeAttemptAndUse!=='function') {
    throw new Error('OTP 驗證交易介面未就緒。');
  }
  otpId_(request.challengeId);
  otpId_(request.applicantId);
  otpBindingEmail_(request.email);
  // Reject invalid now before lock; the evaluator validates its UTC form.
  otpUtc_(request.nowUtc);
  var lock=adapters.getLock();
  if (!lock || typeof lock.tryLock!=='function' ||
      typeof lock.releaseLock!=='function' ||
      typeof lock.hasLock!=='function') {
    throw new Error('OTP 全域交易鎖介面不合法，已拒絕驗證。');
  }
  if (lock.tryLock(5000)!==true) {
    throw new Error('無法取得 OTP 全域交易鎖，已拒絕驗證。');
  }
  try {
    otpAssertLockStillHeld_(lock);
    var snapshot=adapters.readSnapshot();
    otpAssertLockStillHeld_(lock);
    var match=otpFindUniqueChallenge_(snapshot,request.challengeId);
    if (!match || !otpBindingMatches_(match.row,request)) {
      return {verified:false,reason:'REJECTED'};
    }
    // Cross-challenge limit is mandatory, using the SAME locked snapshot.
    if (!otpThrottleVerifyGate_(snapshot,request,request.nowUtc).allowed) {
      return {verified:false,reason:'REJECTED'};
    }
    var decision=otpEvaluateVerification_(
      match.row,request.code,request.nowUtc,adapters.getSecret());
    // A secret-provider callback may have released the shared lock.
    otpAssertLockStillHeld_(lock);
    if (decision.reason!=='MATCH' && decision.reason!=='INVALID') {
      return {verified:false,reason:'REJECTED'};
    }
    // F:G columns (attempts,used_at_utc) must be written together.
    var newUsed=decision.verified ? decision.usedAtUtc : match.row[6];
    var wrote=adapters.writeAttemptAndUse(
      match.rowNumber,decision.attemptsAfter,newUsed);
    // A write may have happened before ownership was lost: never report
    // verified success without the lock. Reconciliation remains necessary.
    otpAssertLockStillHeld_(lock);
    if (wrote!==true) throw new Error('OTP 狀態寫入未確認，已拒絕驗證。');
    var check=otpFindUniqueChallenge_(adapters.readSnapshot(),request.challengeId);
    otpAssertLockStillHeld_(lock);
    if (!check || check.rowNumber!==match.rowNumber ||
        !otpBindingMatches_(check.row,request) ||
        Number(check.row[5])!==decision.attemptsAfter ||
        check.row[6]!==newUsed) {
      throw new Error('OTP 狀態寫入後核對失敗，已拒絕驗證。');
    }
    return {verified:decision.verified,reason:decision.verified?'VERIFIED':'REJECTED'};
  } finally {
    lock.releaseLock();
  }
}
