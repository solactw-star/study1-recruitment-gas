/**
 * Study1 one-applicant/one-OTP/one-reservation/one-REC-document consent binding.
 * PRIVATE GAS kernel ONLY. No direct participant RPC and NO live adapter.
 * The current production Applicants / Screenings / Verification /
 * Reservations / Slots schemas do not include verified human identity plus
 * experiment authorization; an authentic, REC-approved identity provenance
 * adapter is required BEFORE any live invite or signature can proceed.
 * No applicant names, email, OTP codes or HMAC secrets are returned or logged.
 */
var STUDY1_BINDING_SCHEMA_=Object.freeze({
 applicants:['applicant_id','name','email','phone','created_at_utc','updated_at_utc','status'],
 screenings:['screening_id','applicant_id','rules_version','eligibility_result','screened_at_utc','verified_by'],
 verification:['challenge_id','applicant_id','purpose','otp_hmac','expires_at_utc','attempts','used_at_utc','email','created_at_utc'],
 slots:['slot_id','start_at_utc','end_at_utc','capacity','location_code','status','created_by','updated_at_utc'],
 reservations:['reservation_id','applicant_id','slot_id','status','hold_until_utc','idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc']
});
function study1BindingId_(id){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(id)||
    /^SIM[-_]/.test(id))throw Error('不可使用虛構或無效的正式識別碼');
 return id;
}
function study1BindingUniqueRow_(source,fields,id){
 if(!source||!Array.isArray(source.headers)||!Array.isArray(source.rows)||
    source.headers.length!==fields.length||fields.some((h,i)=>source.headers[i]!==h)||
    source.rows.length>10000)
  throw Error('來源欄位、資料列數或正式 schema 不符');
 const found=[];
 for(const row of source.rows){
  if(!Array.isArray(row)||row.length!==fields.length||
    row.some((_,i)=>!Object.prototype.hasOwnProperty.call(row,i)))
   throw Error('正式來源列不完整');
  if(row[0]===id)found.push(row);
 }
 if(found.length!==1)throw Error('資料筆數不唯一或無法找到正式身分／憑證／預約');
 return found[0];
}
function study1BindingUtc_(v){
 if(typeof v!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v))
  throw Error('時間來源必須是 UTC ISO 毫秒');
 const t=Date.parse(v);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==v)
  throw Error('來源時間不合法');
 return t;
}
function study1BindingEmail_(value){
 if(typeof value!=='string'||value.length>254||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)||
    /\.invalid$/i.test(value))
  throw Error('未核實之虛構或無效電子郵件');
 return value.trim().toLowerCase();
}
function study1BindingHmac_(items){
 const props=PropertiesService.getScriptProperties();
 const key=props.getProperty('STUDY1_ECONSENT_BINDING_HMAC_KEY');
 if(typeof key!=='string'||key.length<32||
    /SIMULATED|TEST_ONLY|EXAMPLE|DEFAULT/i.test(key))
  throw Error('缺少正式身分連結的獨立伺服器簽章金鑰');
 const raw=Utilities.computeHmacSha256Signature(JSON.stringify(items),key,Utilities.Charset.UTF_8);
 if(!Array.isArray(raw)||raw.length!==32)
  throw Error('身分連結簽章計算失敗');
 return raw.map(x=>(x&255).toString(16).padStart(2,'0')).join('');
}
/** This adapter must be built from independently REC-approved authenticated
 * identity and CURRENT live Sheet records within the shared script lock.
 * It is deliberately absent while formal source authority is unresolved.
 * It must never accept a browser-supplied snapshot or fixture.
 */
function study1EConsentBindingAdapter_(){
 throw Error('REC_REVIEW_REQUIRED：正式核身與實驗別權責來源尚未完成接線');
}
function study1BindingVerify_(snapshot,request,doc,nowUtc){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
    !request||typeof request!=='object'||Array.isArray(request)||
    !doc||typeof doc!=='object')
  throw Error('正式身分連結來源缺失');
 const applicantId=study1BindingId_(request.applicantId);
 const reservationId=study1BindingId_(request.reservationId);
 const slotId=study1BindingId_(request.slotId);
 const challengeId=study1BindingId_(request.challengeId);
 const experiment=request.experiment;
 if(!['E1','E2'].includes(experiment)||
    doc.experiment!==experiment||doc.sha256!==request.documentSha||
    doc.version!==request.documentVersion||!/^[a-f0-9]{64}$/.test(doc.sha256))
  throw Error('實驗與正式PDF原始SHA／版本不符');
 const now=study1BindingUtc_(nowUtc);
 // The identity attestation is an INDEPENDENT trusted owner/REC data source;
 // email OTP proves account access, not biological/legal personal identity.
 const identity=snapshot.identity;
 if(!identity||identity.verified!==true||
    identity.provenance!=='REC_APPROVED_IDENTITY_ATTESTATION'||
    identity.applicantId!==applicantId||identity.experiment!==experiment||
    identity.verifierId===''||typeof identity.verifierId!=='string'||
    identity.consentProcedureApproved!==true||
    typeof identity.approvalReference!=='string'||identity.approvalReference.length<8||
    typeof identity.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.evidenceSha256))
  throw Error('REC_REVIEW_REQUIRED：缺少獨立有效本人身分及實驗別核准證據');
 const idWhen=study1BindingUtc_(identity.verifiedAtUtc);
 if(idWhen>now||idWhen<now-86400000)
  throw Error('身分核對已過期或時間異常');
 const person=study1BindingUniqueRow_(snapshot.applicants,
    STUDY1_BINDING_SCHEMA_.applicants,applicantId);
 if(person[0]!==applicantId||person[6]!=='VERIFIED')
  throw Error('申請者尚未達正式驗證狀態');
 const email=study1BindingEmail_(person[2]);
 if(study1BindingEmail_(identity.email)!==email)
  throw Error('正式身分與OTP電子郵件不是同一人');
 const screened=study1BindingUniqueRow_(snapshot.screenings,
    STUDY1_BINDING_SCHEMA_.screenings,request.screeningId);
 if(screened[1]!==applicantId||screened[3]!=='ELIGIBLE'||
    screened[2]!==identity.screeningVersion||
    !screened[5]||typeof screened[5]!=='string')
  throw Error('資格審核結果、規則版號或核對人不一致');
 const screenAt=study1BindingUtc_(screened[4]);
 if(screenAt>now||screenAt<study1BindingUtc_(person[4]))
  throw Error('資格檢查時間與申請狀態不符');
 const challenge=study1BindingUniqueRow_(snapshot.verification,
    STUDY1_BINDING_SCHEMA_.verification,challengeId);
 if(challenge[1]!==applicantId||
    challenge[2]!=='EMAIL_VERIFICATION'||study1BindingEmail_(challenge[7])!==email||
    !/^[a-f0-9]{64}$/.test(challenge[3])||
    !Number.isSafeInteger(Number(challenge[5]))||
    Number(challenge[5])<1||Number(challenge[5])>5)
  throw Error('OTP尚未綁定同一已核實申請者');
 const challengeCreated=study1BindingUtc_(challenge[8]);
 const challengeExpiry=study1BindingUtc_(challenge[4]);
 const otpUsed=study1BindingUtc_(challenge[6]);
 if(challengeExpiry<=challengeCreated||challengeExpiry-challengeCreated>600000||
    otpUsed<challengeCreated||otpUsed>=challengeExpiry||otpUsed>now||
    otpUsed<screenAt)
  throw Error('OTP未經有效期限內的一次性使用');
 const reservation=study1BindingUniqueRow_(snapshot.reservations,
    STUDY1_BINDING_SCHEMA_.reservations,reservationId);
 const holdUntil=study1BindingUtc_(reservation[4]);
 if(reservation[1]!==applicantId||reservation[2]!==slotId||
    reservation[3]!=='HELD'||holdUntil<=now||
    study1BindingUtc_(reservation[6])<otpUsed)
  throw Error('當前有效時段保留不是同一已核實申請者');
 const slot=study1BindingUniqueRow_(snapshot.slots,
    STUDY1_BINDING_SCHEMA_.slots,slotId);
 if(slot[5]!=='OPEN'||study1BindingUtc_(slot[1])<=now||
    study1BindingUtc_(slot[2])<=study1BindingUtc_(slot[1])||
    !Number.isSafeInteger(slot[3])||slot[3]<1)
  throw Error('正式時段尚未核定或已開始／關閉');
 // Cross-source race check: the time source & document must be bound to the
 // attested experiment, never derived from a filename or the browser.
 if(identity.slotId!==slotId||identity.reservationId!==reservationId||
    identity.challengeId!==challengeId||identity.screeningId!==request.screeningId)
  throw Error('身分核對與實驗／OTP／時段未關聯同一交易');
 return {schemaVersion:1,applicantId,reservationId,slotId,challengeId,
  screeningId:request.screeningId,experiment,documentSha:doc.sha256,
  documentVersion:doc.version,identityEvidenceSha:identity.evidenceSha256,
  verifiedAtUtc:identity.verifiedAtUtc,otpUsedAtUtc:challenge[6],
  holdUntilUtc:reservation[4]};
}
function study1BindingDigest_(binding){
 const keys=['schemaVersion','applicantId','reservationId','slotId','challengeId',
  'screeningId','experiment','documentSha','documentVersion',
  'identityEvidenceSha','verifiedAtUtc','otpUsedAtUtc','holdUntilUtc'];
 if(!binding||Object.keys(binding).sort().join(',')!==
    keys.concat(['digest']).sort().join(','))
  throw Error('電子同意綁定結構遭更動');
 const items=keys.map(k=>binding[k]);
 return study1BindingHmac_(items);
}
/** Atomic source reread is performed by the caller UNDER the shared lock. */
function study1BindingRecheck_(bound,doc,adapter,nowUtc){
 if(!adapter||typeof adapter.readTrustedSnapshot!=='function')
  throw Error('REC_REVIEW_REQUIRED：沒有獲核准的正式身分／OTP／時段來源');
 if(study1BindingDigest_(bound)!==bound.digest)
  throw Error('身分連結簽章已變更');
 const expected={applicantId:bound.applicantId,reservationId:bound.reservationId,
  slotId:bound.slotId,challengeId:bound.challengeId,screeningId:bound.screeningId,
  experiment:bound.experiment,documentSha:bound.documentSha,
  documentVersion:bound.documentVersion};
 const current=study1BindingVerify_(adapter.readTrustedSnapshot(expected),
  expected,doc,nowUtc);
 const reread={...current,digest:bound.digest};
 if(study1BindingDigest_(reread)!==bound.digest)
  throw Error('OTP、身分、場次或文件來源已更新；需重新驗證');
 return current;
}
/** STRICTLY INTERNAL issuance. No public route or live adapter exists yet. */
function study1EConsentIssueBound_(input,adapter){
 study1AdminOwnerRequired_();
 if(!input||Object.keys(input).sort().join(',')!==
    'applicantId,challengeId,documentSha,documentVersion,experiment,reservationId,screeningId,slotId')
  throw Error('正式申請綁定欄位不正確');
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.hasLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('無法取得共用交易鎖');
 try{
  if(lock.hasLock()!==true)throw Error('共用交易鎖已失效');
  study1AdminOwnerRequired_();
  const doc=study1EConsentReadyDocument_(input.experiment);
  const nowUtc=new Date().toISOString();
  const binding=study1BindingVerify_(adapter.readTrustedSnapshot(input),input,doc,nowUtc);
  binding.digest=study1BindingDigest_({...binding,digest:''});
  if(lock.hasLock()!==true)throw Error('共用交易鎖已失效');
  const r=study1EConsentRegistry_();
  if(r.records.length>=STUDY1_ECONSENT_MAX_RECORDS_)
   throw Error('電子同意索引容量不足');
  if(r.records.some(x=>x.binding&&
     (x.binding.applicantId===binding.applicantId||
      x.binding.reservationId===binding.reservationId)))
   throw Error('該本人申請／預約已核發簽署邀請，禁止重複簽發');
  const token=Utilities.getUuid()+'-'+Utilities.getUuid();
  const entry={id:Utilities.getUuid(),tokenHash:study1EConsentHash_(token),
   experiment:input.experiment,documentSha:doc.sha256,documentVersion:doc.version,
   expires:Math.min(Date.now()+86400000,Date.parse(binding.holdUntilUtc)),
   state:'ISSUED',binding,
   explanation:null,signature:null,confirmation:null,withdrawal:null};
  if(entry.expires<=Date.now())throw Error('原預約保留已到期');
  if(r.records.some(x=>x.id===entry.id||x.tokenHash===entry.tokenHash))
   throw Error('憑證重複');
  study1EConsentWrite_(r,{...r,revision:r.revision+1,
   records:r.records.concat([entry])});
  return {id:entry.id,token,experiment:entry.experiment,version:doc.version,
    sha256:doc.sha256,expires:entry.expires};
 }finally{lock.releaseLock();}
}
