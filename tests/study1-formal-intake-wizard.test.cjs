'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const website=read('gas/Website.js'),visitor=read('gas/Study1Visitor.html');
const intake=read('gas/Study1ParticipantIntake.js');
const gate=read('scripts/study1-gas-backend-allowlist.cjs');

test('Original single visitor HTML can be templated for E1, demo route remains owner-locked',()=>{
 assert.match(website,/view==='apply'\)\{const t=HtmlService\.createTemplateFromFile\('Study1Visitor'\)/);
 assert.match(website,/t\.flowMode='FORMAL'/);
 assert.match(website,/t\.evaluate\(\)/);
 assert.match(visitor,/<body data-site-mode="<\?= flowMode \?>">/);
 assert.match(website,/view==='demo'\)\{study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\)/);
 assert.match(website,/HtmlService\.createHtmlOutputFromFile\('Study1Visitor'\)/);
 assert.doesNotMatch(website,/view==='apply'\)\{study1AdminOwnerRequired_\(\)/);
});
test('Formal controller runs only for explicit FORMAL body tag and aborts old demo controller',()=>{
 const formal=visitor.indexOf("document.body.dataset.siteMode!=='FORMAL'");
 const demo=visitor.indexOf("document.body.dataset.siteMode==='FORMAL')return;");
 assert.ok(formal>0&&demo>formal);
 assert.match(visitor,/study1ParticipantReadiness\(\)/);
 assert.match(visitor,/rpc\('study1ParticipantBegin'/);
 assert.match(visitor,/rpc\('study1ParticipantSendOtp'/);
 assert.match(visitor,/rpc\('study1ParticipantVerifyOtp'/);
 assert.match(visitor,/rpc\('study1ParticipantEmailStatus',result.emailProof/);
 assert.match(visitor,/if\(!state\.ready\|\|state\.busy\)return/);
 assert.match(visitor,/state\.ready=!!\(result&&result\.ready===true&&result\.experiment==='E1'&&/);
 assert.match(visitor,/state\.humanToken/);
 assert.match(visitor,/humanToken:state\.humanToken/);
 assert.match(visitor,/study1_e1_apply/);
 assert.match(visitor,/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
 assert.match(visitor,/typeof result\.siteKey==='string'/);
 assert.match(visitor,/el\('chooseE2'\)\.disabled=true/);
});
test('No email or PII entry until independently approved public gate',()=>{
 assert.match(intake,/function study1ParticipantGate_\(\)/);
 for(const f of ['OPEN','CONSENT_READY','STUDY1_E1_INTAKE_APPROVED',
   'STUDY1_ECONSENT_LIVE_SHEETS_APPROVED','STUDY1_PARTICIPANT_DATA_USE_APPROVED',
   'STUDY1_PARTICIPANT_ABUSE_PROTECTION_VERIFIED'])
  assert.ok(intake.includes("'"+f+"'"));
 assert.match(intake,/function study1ParticipantRecPolicy_\(\)\{\s*return study1ParticipantRecSource_\(\)/);
 assert.match(intake,/function study1ParticipantAbuseProtection_\(\w+\)\{\s*return study1ParticipantTurnstileCheck_\(/);
 assert.match(intake,/function study1ParticipantReadiness\(\)/);
 assert.match(intake,/return \{ready:false,experiment:'E1',reason:'REGISTRATION_NOT_OPEN'\}/);
 for(const id of ['formalName','formalEmail','formalPhone'])
  assert.match(visitor,new RegExp('id="'+id+'"[^>]*disabled'));
 assert.match(visitor,/if\(el\(id\)\)el\(id\)\.disabled=!state\.ready/);
});
test('Real OTP never invokes test command or demo code; email is not student verification',()=>{
 assert.match(visitor,/document\.body\.dataset\.siteMode==='FORMAL'\)return;/);
 assert.match(visitor,/if\(sampleCode\)sampleCode\.hidden=true/);
 assert.match(visitor,/if\(el\('otpPaste'\)\)el\('otpPaste'\)\.hidden=true/);
 assert.match(visitor,/資格依本人勾選自陳/);
 assert.match(visitor,/formalV05Read_\(\)/);
 assert.match(visitor,/study1FormalWaitlistJoin/);
 assert.match(visitor,/study1FormalMove/);
 assert.match(visitor,/study1FormalCancel/);
 assert.match(visitor,/不查驗身分證或學生證/);
 assert.match(intake,/phase:'PENDING_EMAIL'/);
 assert.match(intake,/s\[3\]!=='ELIGIBLE'/);
 assert.match(intake,/s\[5\]!=='PARTICIPANT_SELF_REPORT'/);
 assert.match(intake,/return \{verified:true,reason:'EMAIL_CONTROL_ONLY',emailProof:proof\}/);
 assert.match(intake,/function study1ParticipantEmailStatus_\(/);
 assert.match(intake,/EMAIL_PROOF_SIGNATURE_INVALID/);
});
test('Original V05/V08 and summary/consent step order remain unchanged',()=>{
 assert.match(visitor,/const phases=\['choose','screen','otp','slots','confirm','consent','done'\]/);
 for(const id of ['v05Dates','v05Month','v08WaitBox','v08ManageReview',
  'v06Summary','officialPdfViewer','officialSignedPdfDownload','visitorSignaturePreview'])
  assert.match(visitor,new RegExp('id="'+id+'"'));
 assert.match(visitor,/SIMULATED_SIGN_ONLY/);
 assert.doesNotMatch(visitor,/<script[^>]+src=|\.innerHTML\s*=\s*|localStorage/);
 assert.doesNotMatch(website,/function requestOtp\([^)]*\)\{return study1ParticipantOtpSend_/);
 assert.match(website,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});
