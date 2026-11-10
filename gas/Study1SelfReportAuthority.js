/**
 * Study1 §70-S.17: original E1 self-declaration + email-control HMAC source.
 * No ID card, student card, identity-provider API or manual identity approval.
 * Security source is the ORIGINAL Applicants, Screenings and Verification F:G.
 *
 * The caller must own the shared ScriptLock. No public RPC in this module.
 */
function study1SelfReportedAuthority_(request,heldLock){
 if(!request||typeof request!=='object'||Array.isArray(request))
  throw Error('SELF_REPORT_REQUEST_INVALID');
 for(const field of ['applicantId','screeningId','challengeId'])
  study1BindingId_(request[field]);
 if(request.experiment!=='E1')
  throw Error('EXPERIMENT_NOT_OPEN');
 if(!heldLock||heldLock.hasLock()!==true)
  throw Error('SELF_REPORT_SHARED_LOCK_REQUIRED');
 // This source is also used by the PUBLIC participant booking RPC.
 // Never apply study1BindingGate_() here: it requires admin-owner login.
 // The private e-consent adapter separately enforces the owner/REC gate.
 study1ParticipantGate_();
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED')!=='true')
  throw Error('SELF_REPORT_OTP_SOURCE_NOT_READY');
 const policy=study1ParticipantVerifiedPolicy_(study1ParticipantRecPolicy_());
 const book=SpreadsheetApp.openById(study1BindingSheetId_('applicants'));
 const applicant=study1BindingSheetRow_(book,'Applicants',
  STUDY1_BINDING_SCHEMA_.applicants,request.applicantId).rows[0];
 const screening=study1BindingSheetRow_(book,'Screenings',
  STUDY1_BINDING_SCHEMA_.screenings,request.screeningId).rows[0];
 const challenge=study1BindingSheetRow_(book,'Verification',
  STUDY1_BINDING_SCHEMA_.verification,request.challengeId).rows[0];
 const email=study1BindingEmail_(applicant[2]),now=Date.now();
 const screenedAt=study1BindingUtc_(screening[4]),
  openedAt=study1BindingUtc_(applicant[4]),
  createdAt=study1BindingUtc_(challenge[8]),
  expiresAt=study1BindingUtc_(challenge[4]),
  usedAt=study1BindingUtc_(challenge[6]);
 if(applicant[6]!=='EMAIL_VERIFIED'||
    screening[1]!==request.applicantId||
    screening[2]!==policy.screeningVersion||
    screening[3]!=='ELIGIBLE'||
    screening[5]!=='PARTICIPANT_SELF_REPORT'||
    screenedAt<openedAt||screenedAt>now||
    challenge[1]!==request.applicantId||
    challenge[2]!=='EMAIL_VERIFICATION'||
    study1BindingEmail_(challenge[7])!==email||
    !/^[a-f0-9]{64}$/.test(challenge[3])||
    !Number.isSafeInteger(Number(challenge[5]))||
    Number(challenge[5])<1||Number(challenge[5])>5||
    createdAt<screenedAt||expiresAt<=createdAt||
    expiresAt-createdAt>600000||
    usedAt<createdAt||usedAt>=expiresAt||
    usedAt>now||now-usedAt>1800000)
  throw Error('SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID');
 // A re-sent challenge invalidates the earlier consumed OTP, as in the
 // original live mailbox adapter. Never silently fall back to a stale OTP.
 const history=study1WizardIssueRows_(book,request.applicantId,email).snapshot.rows;
 if(history.some(row=>row[0]!==''&&row[0]!==request.challengeId&&
    (row[1]===request.applicantId||
     study1BindingEmail_(row[7])===email)&&
    study1BindingUtc_(row[8])>=createdAt))
  throw Error('SELF_REPORT_EMAIL_OTP_SUPERSEDED');
 const eligibilityEvidenceSha256=study1BindingHmac_([
  'E1_SELF_DECLARED_SCREENING_V1',request.applicantId,
  request.screeningId,policy.screeningVersion,
  screening[4],policy.documentSha256]);
 const evidenceSha256=study1BindingHmac_([
  'E1_CONSUMED_EMAIL_OTP_V1',request.applicantId,
  request.screeningId,request.challengeId,email,
  challenge[6],eligibilityEvidenceSha256]);
 return {verified:true,provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
  applicantId:request.applicantId,screeningId:request.screeningId,
  challengeId:request.challengeId,experiment:'E1',email,
  screeningVersion:policy.screeningVersion,
  eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
  eligibilityEvidenceSha256,evidenceSha256,
  emailControlSource:'ORIGINAL_VERIFICATION_FG',
  verifiedAtUtc:challenge[6],
  consentProcedureApproved:PropertiesService.getScriptProperties()
   .getProperty('STUDY1_E1_REMOTE_CONSENT_REC_SCOPE_VERIFIED')==='true',
  slotId:request.slotId||null,reservationId:request.reservationId||null};
}
