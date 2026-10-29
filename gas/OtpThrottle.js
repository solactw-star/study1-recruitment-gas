/**
 * Study 1 OTP cross-challenge account throttling, INTERNAL / OFFLINE ONLY.
 *
 * Uses ONLY the verified Verification column layout; no extra Sheets, no
 * live reads/writes, no email sending. These thresholds are provisional.
 * The caller MUST evaluate issue policy and persist a new challenge under
 * the SAME script-wide lock; a preflight alone does not reserve permission.
 *
 * A row counts against an account if EITHER applicant_id OR normalized email
 * matches. This prevents issuing a new challenge for the same mailbox from
 * resetting its rolling attempt budget. It is NOT proof of real-world identity.
 */
var OTP_THROTTLE_RULES_ = Object.freeze({
  windowMinutes:60,
  maxIssuesPerWindow:3,
  minIssueIntervalSeconds:60,
  maxAccountAttemptsPerWindow:10
});
function otpThrottleAttempts_(value) {
  var n=typeof value==='number'?value:
    (typeof value==='string' && /^\d+$/.test(value)?Number(value):NaN);
  if (!Number.isSafeInteger(n) || n<0) throw new Error('OTP 節流嘗試次數資料不合法。');
  return n;
}
function otpThrottleSummary_(snapshot, identity, nowUtc) {
  if (!snapshot || !Array.isArray(snapshot.headers) ||
      !Array.isArray(snapshot.rows) || !identity ||
      typeof identity!=='object' || Array.isArray(identity)) {
    throw new Error('OTP 節流資料快照不合法。');
  }
  otpVerifyHeaders_(snapshot.headers);
  var applicantId=otpId_(identity.applicantId);
  var email=otpBindingEmail_(identity.email);
  var now=otpUtc_(nowUtc);
  var windowStart=now-OTP_THROTTLE_RULES_.windowMinutes*60000;
  var seen=Object.create(null),issues=0,attempts=0,lastIssue=null;
  snapshot.rows.forEach(function(row) {
    if (!Array.isArray(row)) throw new Error('OTP 節流資料列不合法。');
    if (row.every(function(v){return v==='' || v===null || v===undefined;})) return;
    if (row.length<OTP_VERIFICATION_HEADERS_.length) {
      throw new Error('OTP 節流資料列欄位不足。');
    }
    var challengeId=otpId_(row[0]);
    if (seen[challengeId]) throw new Error('OTP 節流資料存在重複識別碼。');
    seen[challengeId]=true;
    var rowApplicant=otpId_(row[1]);
    var rowEmail=otpBindingEmail_(row[7]);
    if (rowApplicant!==applicantId && rowEmail!==email) return;
    if (row[2]!==OTP_RULES_.emailPurpose) {
      throw new Error('OTP 節流用途不合法。');
    }
    var created=otpUtc_(row[8]),expires=otpUtc_(row[4]);
    if (created>now || expires<=created ||
        expires-created>OTP_RULES_.ttlMinutes*60000) {
      throw new Error('OTP 節流日期資料不合法。');
    }
    var count=otpThrottleAttempts_(row[5]);
    if (created>=windowStart) {
      issues++;
      attempts+=count;
      if (!Number.isSafeInteger(attempts)) throw new Error('OTP 節流次數溢位。');
      if (lastIssue===null || created>lastIssue) lastIssue=created;
    }
  });
  // Return no email, applicant ID, challenge ID, secret, code, or hash.
  return {issues:issues,attempts:attempts,lastIssueMs:lastIssue};
}
/**
 * Pure issue preflight; NOT a safe-to-send grant or a reservation.
 * All issue, resend, verify and cancel writers must share one script lock.
 */
function otpThrottleIssuePreflight_(snapshot, identity, nowUtc) {
  var now=otpUtc_(nowUtc);
  var state=otpThrottleSummary_(snapshot,identity,nowUtc);
  if (state.attempts>=OTP_THROTTLE_RULES_.maxAccountAttemptsPerWindow) {
    return {allowed:false,reason:'REJECTED'};
  }
  if (state.issues>=OTP_THROTTLE_RULES_.maxIssuesPerWindow) {
    return {allowed:false,reason:'REJECTED'};
  }
  if (state.lastIssueMs!==null &&
      now-state.lastIssueMs<OTP_THROTTLE_RULES_.minIssueIntervalSeconds*1000) {
    return {allowed:false,reason:'REJECTED'};
  }
  return {allowed:true,reason:'ELIGIBLE_FOR_LOCKED_ISSUANCE_ONLY'};
}
/**
 * Must be evaluated from the SAME fresh snapshot as the challenge lookup,
 * inside otpVerifyOnceLocked_ before any F:G write. No public endpoint.
 */
function otpThrottleVerifyGate_(snapshot, identity, nowUtc) {
  var state=otpThrottleSummary_(snapshot,identity,nowUtc);
  return {allowed:state.attempts<OTP_THROTTLE_RULES_.maxAccountAttemptsPerWindow,
    reason:'REJECTED'};
}
