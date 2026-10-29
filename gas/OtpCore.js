/**
 * Study 1 OTP verification primitives — internal (underscore) only.
 *
 * NO email sending, challenge issuance, database write, public endpoint or
 * account unlocking. Website.js requestOtp()/verifyOtp() remain CLOSED.
 * The workflow that calls these primitives MUST enforce account-level
 * throttling, send limits, atomic updates, and LockService before opening.
 *
 * Verification tab actual column order checked against the 828 Sheet.
 * OTP policy values are provisional until the researcher approves them.
 */
var OTP_VERIFICATION_HEADERS_ = Object.freeze([
  'challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc',
  'attempts','used_at_utc','email','created_at_utc'
]);
var OTP_RULES_ = Object.freeze({
  digits:8,
  ttlMinutes:10,
  maxAttempts:5,
  emailPurpose:'EMAIL_VERIFICATION'
});

function otpVerifyHeaders_(headers) {
  if (!Array.isArray(headers) || headers.length < OTP_VERIFICATION_HEADERS_.length) {
    throw new Error('驗證碼資料表欄位不足。');
  }
  for (var i=0; i<OTP_VERIFICATION_HEADERS_.length; i++) {
    if (headers[i] !== OTP_VERIFICATION_HEADERS_[i]) {
      throw new Error('驗證碼資料表欄位與核實版本不一致。');
    }
  }
  return true;
}
function otpId_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('驗證資料識別碼不合法。');
  }
  return value;
}
function otpUtc_(value) {
  var date;
  if (Object.prototype.toString.call(value)==='[object Date]') {
    date=new Date(value.getTime());
  } else {
    if (typeof value!=='string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
      throw new Error('驗證資料時間需為 UTC ISO 8601。');
    }
    date=new Date(value);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0,19)!==value.slice(0,19)) {
      throw new Error('驗證資料時間無效。');
    }
  }
  if (!Number.isFinite(date.getTime())) throw new Error('驗證資料時間無效。');
  return date.getTime();
}
function otpSecret_(secret) {
  // Do not check in, log, return, or save the secret with verification rows.
  if (typeof secret!=='string' || secret.length < 32) {
    throw new Error('尚未設定符合長度要求的 OTP 簽章金鑰。');
  }
  return secret;
}
function otpPayload_(challengeId, applicantId, purpose, code) {
  otpId_(challengeId);
  otpId_(applicantId);
  if (purpose!==OTP_RULES_.emailPurpose) throw new Error('未知驗證用途。');
  if (typeof code!=='string' || !/^\d{8}$/.test(code)) {
    throw new Error('驗證碼必須是八位數字字串。');
  }
  // JSON array prevents ambiguous concatenations between identity fields.
  return JSON.stringify([challengeId,applicantId,purpose,code]);
}
function otpHmacHex_(challengeId, applicantId, purpose, code, secret) {
  var bytes=Utilities.computeHmacSha256Signature(
    otpPayload_(challengeId,applicantId,purpose,code),
    otpSecret_(secret),
    Utilities.Charset.UTF_8
  );
  if (!Array.isArray(bytes) || bytes.length!==32) throw new Error('HMAC 計算失敗。');
  return bytes.map(function(b){
    return (b&255).toString(16).padStart(2,'0');
  }).join('');
}
function otpConstantTimeHexEquals_(left, right) {
  // No early return on mismatched characters. Fixed-length hex digests only.
  var mismatch=left.length ^ right.length;
  var length=Math.max(left.length,right.length);
  for (var i=0; i<length; i++){
    mismatch |= (i<left.length ? left.charCodeAt(i):0) ^
                (i<right.length ? right.charCodeAt(i):0);
  }
  return mismatch===0;
}
/**
 * Inputs: one verification row, submitted code, UTC now, secret.
 * Output contains no code, secret, email, applicant ID, challenge ID or hash.
 * attemptsAfter / usedAtUtc are candidate updates ONLY; a caller must
 * re-read and update one matching challenge atomically under LockService.
 */
function otpEvaluateVerification_(row, submittedCode, nowUtc, secret) {
  if (!Array.isArray(row) || row.length<OTP_VERIFICATION_HEADERS_.length) {
    throw new Error('驗證資料欄位不足。');
  }
  var challengeId=otpId_(row[0]), applicantId=otpId_(row[1]),purpose=row[2];
  if (purpose!==OTP_RULES_.emailPurpose) throw new Error('未知驗證用途。');
  var stored=row[3];
  if (typeof stored!=='string' || !/^[0-9a-f]{64}$/.test(stored)){
    throw new Error('OTP 簽章資料不合法。');
  }
  var attempts=(typeof row[5]==='number') ? row[5] :
    (typeof row[5]==='string' && /^\d+$/.test(row[5]) ? Number(row[5]) : NaN);
  if (!Number.isSafeInteger(attempts) || attempts<0) {
    throw new Error('驗證嘗試次數資料不合法。');
  }
  var now=otpUtc_(nowUtc), created=otpUtc_(row[8]), expires=otpUtc_(row[4]);
  if (expires<=created || expires-created>OTP_RULES_.ttlMinutes*60000) {
    throw new Error('驗證碼有效期限資料不合法。');
  }
  var used=row[6];
  if (used!=='' && used!==null && used!==undefined) {
    var usedAt=otpUtc_(used);
    if (usedAt<created) throw new Error('驗證碼使用時間不合法。');
    return {verified:false,reason:'USED',attemptsAfter:attempts,usedAtUtc:null};
  }
  if (now<created || now>=expires) {
    return {verified:false,reason:'EXPIRED',attemptsAfter:attempts,usedAtUtc:null};
  }
  if (attempts>=OTP_RULES_.maxAttempts) {
    return {verified:false,reason:'ATTEMPT_LIMIT',attemptsAfter:attempts,usedAtUtc:null};
  }
  // Invalid input counts as one attempt; no plaintext OTP is returned/logged.
  var wellFormed=typeof submittedCode==='string' && /^\d{8}$/.test(submittedCode);
  var candidate=wellFormed?submittedCode:'00000000';
  var calculated=otpHmacHex_(challengeId,applicantId,purpose,candidate,secret);
  var ok=wellFormed && otpConstantTimeHexEquals_(stored,calculated);
  var attemptsAfter=attempts+1;
  return {verified:ok,reason:ok?'MATCH':'INVALID',attemptsAfter:attemptsAfter,
    usedAtUtc:ok?new Date(now).toISOString():null};
}
