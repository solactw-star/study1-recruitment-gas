/**
 * Study1 E1 / §70-S.15 trust providers. All evidence is server-side.
 * No REC amendment, third-party bot service, or private key is inferred from
 * an existing approved research certificate or a property named "OPEN".
 * Without a reviewer-confirmed specific scope, these providers fail closed.
 */
function study1TrustHexSha_(bytes){
 const out=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes);
 if(!Array.isArray(out)||out.length!==32)throw Error('EVIDENCE_DIGEST_FAILED');
 return out.map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function study1TrustApprovedFile_(fileId,pinnedSha){
 if(typeof fileId!=='string'||!/^[A-Za-z0-9_-]{15,100}$/.test(fileId)||
    typeof pinnedSha!=='string'||!/^[a-f0-9]{64}$/.test(pinnedSha))
  throw Error('REC_EVIDENCE_PIN_INVALID');
 const file=DriveApp.getFileById(fileId);
 if(!file||typeof file.getSize!=='function'||typeof file.getBlob!=='function')
  throw Error('REC_EVIDENCE_SOURCE_MISSING');
 // Bounded immutable document read, no copy, sharing edit, or download link.
 const size=file.getSize();
 if(!Number.isFinite(size)||size<100||size>5*1024*1024)
  throw Error('REC_EVIDENCE_SIZE_INVALID');
 const bytes=file.getBlob().getBytes();
 if(!Array.isArray(bytes)||bytes.length!==size||
    study1TrustHexSha_(bytes)!==pinnedSha)
  throw Error('REC_EVIDENCE_SHA_MISMATCH');
 return true;
}
function study1ParticipantRecSource_(){
 const raw=PropertiesService.getScriptProperties().getProperty(
  'STUDY1_E1_REC_WEB_INTAKE_POLICY_V1');
 if(typeof raw!=='string'||!raw||raw.length>6000)
  throw Error('REC_INTAKE_POLICY_NOT_CONFIGURED');
 let p;
 try{p=JSON.parse(raw);}catch(_){throw Error('REC_INTAKE_POLICY_PARSE_FAILED');}
 const required=[
  'approvalDocumentId','approvalDocumentSha256','approvalReference',
  'approved','approvedAtUtc','consentDocumentId','consentDocumentSha256',
  'experiment','provenance','reviewedBy','scope','screeningVersion',
  'validThroughUtc'
 ];
 if(!p||Array.isArray(p)||typeof p!=='object'||
    Object.keys(p).sort().join(',')!==required.sort().join(',')||
    p.approved!==true||p.experiment!=='E1'||
    p.provenance!=='PI_REVIEWED_EFFECTIVE_REC_DOCUMENTS'||
    p.scope!=='E1_WEB_PRESCREEN_GOOGLE_SHEETS_PII'||
    typeof p.approvalReference!=='string'||
    !/^202604EM033[-_/A-Za-z0-9]{3,90}$/.test(p.approvalReference)||
    typeof p.reviewedBy!=='string'||p.reviewedBy.trim().length<5||
    typeof p.screeningVersion!=='string'||
    !/^[A-Za-z0-9._/-]{4,64}$/.test(p.screeningVersion))
  throw Error('REC_INTAKE_SCOPE_NOT_APPROVED');
 const at=study1BindingUtc_(p.approvedAtUtc),
  expires=study1BindingUtc_(p.validThroughUtc),now=Date.now();
 if(at>now||expires<=now||expires<=at)
  throw Error('REC_INTAKE_APPROVAL_NOT_EFFECTIVE');
 // The reviewed consent and approval/scope letters are distinct authorities.
 if(p.approvalDocumentId===p.consentDocumentId||
    p.approvalDocumentSha256===p.consentDocumentSha256)
  throw Error('REC_EVIDENCE_NOT_INDEPENDENT');
 study1TrustApprovedFile_(p.approvalDocumentId,p.approvalDocumentSha256);
 study1TrustApprovedFile_(p.consentDocumentId,p.consentDocumentSha256);
 return {approved:true,provenance:'REC_EFFECTIVE_SCREENING_AND_DATA_PROCESSING',
  experiment:'E1',documentSha256:p.consentDocumentSha256,
  screeningVersion:p.screeningVersion,allowsProspectiveIntake:true,
  allowsPrivateSheetsStorage:true};
}
/** Exact hostname, not suffix or a client-supplied Referer; dummy Cloudflare
 * test credentials are prohibited for real participant collection.
 */
function study1ParticipantTurnstileConfig_(){
 const p=PropertiesService.getScriptProperties();
 const siteKey=p.getProperty('STUDY1_E1_TURNSTILE_SITEKEY');
 const secret=p.getProperty('STUDY1_E1_TURNSTILE_SECRET');
 const host=p.getProperty('STUDY1_E1_TURNSTILE_HOSTNAME');
 if(typeof siteKey!=='string'||!/^[-A-Za-z0-9_]{20,100}$/.test(siteKey)||
    typeof secret!=='string'||!/^[-A-Za-z0-9_]{20,150}$/.test(secret)||
    typeof host!=='string'||
    !['script.google.com','script.googleusercontent.com'].includes(host)||
    /^(?:1x|2x|3x)000000000000000000/.test(siteKey)||
    /^(?:1x|2x|3x)000000000000000000/.test(secret))
  throw Error('BOT_PROTECTION_PROVIDER_NOT_READY');
 return {siteKey,secret,host,action:'study1_e1_apply'};
}
function study1ParticipantTurnstileCheck_(request){
 const c=study1ParticipantTurnstileConfig_();
 const token=request?.humanToken;
 if(typeof token!=='string'||token.length<25||token.length>2048||
    /[\s<>\x00-\x1f]/.test(token))
  throw Error('BOT_PROTECTION_TOKEN_INVALID');
 // No name, email, phone, or screening answers are sent to Cloudflare.
 let response;
 try{
  response=UrlFetchApp.fetch(
   'https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'post',contentType:'application/json',muteHttpExceptions:true,
    payload:JSON.stringify({secret:c.secret,response:token})
   });
 }catch(_){throw Error('BOT_PROTECTION_PROVIDER_UNAVAILABLE');}
 if(!response||response.getResponseCode()!==200)
  throw Error('BOT_PROTECTION_PROVIDER_UNAVAILABLE');
 let verified;
 try{verified=JSON.parse(response.getContentText());}
 catch(_){throw Error('BOT_PROTECTION_RESPONSE_INVALID');}
 const ts=typeof verified?.challenge_ts==='string'?
  Date.parse(verified.challenge_ts):NaN;
 const now=Date.now();
 if(!verified||verified.success!==true||
    verified.hostname!==c.host||verified.action!==c.action||
    !Number.isFinite(ts)||ts>now+30000||now-ts>300000)
  throw Error('BOT_PROTECTION_REJECTED');
 return {allowed:true,provenance:'SERVER_APPROVED_RATE_AND_BOT_PROTECTION',
  requestId:request.requestId,
  validatedAtUtc:new Date(now).toISOString(),
  configHmac:study1BindingHmac_([
   'TURNSTILE_CONFIG_V1',c.siteKey,c.secret,c.host,c.action]),
  verificationHmac:study1BindingHmac_([
   'TURNSTILE_SITEVERIFY_V1',request.requestId,c.siteKey,c.host,c.action,ts
  ])};
}
function study1ParticipantAbuseRecheck_(grant,request){
 if(!grant||grant.allowed!==true||
    grant.provenance!=='SERVER_APPROVED_RATE_AND_BOT_PROTECTION'||
    grant.requestId!==request.requestId||
    typeof grant.verificationHmac!=='string'||
    !/^[a-f0-9]{64}$/.test(grant.verificationHmac)||
    typeof grant.configHmac!=='string'||
    !/^[a-f0-9]{64}$/.test(grant.configHmac))
  throw Error('BOT_GRANT_INVALID');
 const when=study1BindingUtc_(grant.validatedAtUtc);
 if(when>Date.now()+30000||Date.now()-when>240000)
  throw Error('BOT_GRANT_EXPIRED');
 // Only re-read independent *configuration* here. A Cloudflare token is
 // single-use: never send it to Siteverify a second time.
 const c=study1ParticipantTurnstileConfig_();
 const expected=study1BindingHmac_([
  'TURNSTILE_CONFIG_V1',c.siteKey,c.secret,c.host,c.action]);
 if(grant.configHmac!==expected)
  throw Error('BOT_PROVIDER_CONFIG_CHANGED_DURING_INTAKE');
 return true;
}
