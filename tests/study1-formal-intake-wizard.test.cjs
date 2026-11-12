'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const website=read('gas/Website.js'),visitor=read('gas/Study1Visitor.html');
const intake=read('gas/Study1ParticipantIntake.js');
const gate=read('scripts/study1-gas-backend-allowlist.cjs');

test('Formal E1 entry is canonical; deprecated demo alias is owner-locked and uses FORMAL only',()=>{
 assert.match(website,/view==='apply'\)\{const t=HtmlService\.createTemplateFromFile\('Study1Visitor'\)/);
 assert.match(website,/t\.flowMode='FORMAL'/);
 assert.match(website,/t\.evaluate\(\)/);
 assert.match(visitor,/<body data-site-mode="<\?= flowMode \?>">/);
 assert.match(website,/view==='demo'\)\{study1AdminOwnerRequired_\(\);const t=HtmlService\.createTemplateFromFile\('Study1Visitor'\)/);
 assert.doesNotMatch(website,/HtmlService\.createHtmlOutputFromFile\('Study1Visitor'\)/);
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

test('FORMAL seventh stage exists and does not expose demo results or premature success',()=>{
 assert.match(visitor,/id="formalDoneResult"/);
 assert.match(visitor,/id="formalDonePdfDownload"[^>]*hidden/);
 assert.ok(visitor.includes("for(const id of ['officialPdfDownload','officialSignedPdfDownload','formalDonePdfDownload'])"));
 assert.ok(visitor.includes("const result=await formalVerifySigned_(copy)"));
 assert.ok(visitor.includes("finalLink.href=url;finalLink.download="));
 assert.ok(visitor.indexOf("finalLink.href=url;finalLink.download=")>visitor.indexOf("const result=await formalVerifySigned_(copy)"));
 assert.match(visitor,/id="demoDoneDetails"/);
 assert.match(visitor,/if\(formalDemoDone\)formalDemoDone\.hidden=true/);
 assert.match(visitor,/if\(formalTestResult\)formalTestResult\.hidden=true/);
 assert.match(visitor,/function formalReceiptOutcome_\(/);
 assert.match(visitor,/function formalDoneRender_\(/);
 assert.match(visitor,/show\('done'\)/);
 assert.match(visitor,/const result=await formalVerifySigned_\(copy\)/);
 assert.match(visitor,/rpc\('study1FormalStatus',state\.emailProof,booking=>/);
 assert.match(visitor,/formalDoneRender_\(outcome,result\.sha,copy\.taipeiDate,reservationId\)/);
 assert.match(visitor,/formalConsent\.confirmed/);
 assert.match(visitor,/status\('已簽PDF完整性核對失敗，禁止提供副本/);
});
test('FORMAL seventh-stage booking outcome is derived exclusively from one E1 ID/slot match',()=>{
 const vm=require('node:vm');
 const start=visitor.indexOf('function formalReceiptOutcome_(');
 const end=visitor.indexOf('\nfunction formalDoneRender_(',start);
 assert.ok(start>0&&end>start);
 const judge=vm.runInNewContext('('+visitor.slice(start,end)+')');
 const now=Date.parse('2026-11-11T02:00:00.000Z');
 const row=(status,until)=>({reservationId:'RES_OFFLINE',slotId:'SLOT_E1',status,holdUntilUtc:until});
 const booking=reservations=>({experiment:'E1',reservations});
 assert.equal(judge(booking([row('CONFIRMED')]),'RES_OFFLINE','SLOT_E1',now),'CONFIRMED');
 assert.equal(judge(booking([row('HELD','2026-11-11T03:00:00.000Z')]),'RES_OFFLINE','SLOT_E1',now),'HELD');
 assert.equal(judge(booking([row('HELD','2026-11-11T02:00:00.000Z')]),'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('HELD','bad-date')]),'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('CANCELLED')]),'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('WAITLISTED')]),'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('CONFIRMED'),row('CONFIRMED')]),'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('CONFIRMED')]),'OTHER_RES','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(booking([row('CONFIRMED')]),'RES_OFFLINE','OTHER_SLOT',now),'UNKNOWN');
 assert.equal(judge({experiment:'E2',reservations:[row('CONFIRMED')]},'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
 assert.equal(judge(null,'RES_OFFLINE','SLOT_E1',now),'UNKNOWN');
});
test('FORMAL result page never claims completion for HELD or UNKNOWN and blocks unverified hashes',()=>{
 const vm=require('node:vm'),start=visitor.indexOf('function formalDoneRender_(');
 const end=visitor.indexOf('\nfunction formalRevoke_(',start);
 assert.ok(start>0&&end>start);
 const nodes=new Map();
 const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id)};
 let shown='',message='';
 const ctx=vm.createContext({formalConsent:{confirmed:true,reservationId:'RES_OFFLINE'},
  el,show:step=>{shown=step},status:text=>{message=text},RegExp});
 const render=vm.runInContext('('+visitor.slice(start,end)+')',ctx);
 const sha='f'.repeat(64);
 render('HELD',sha,'2026/11/11','RES_OFFLINE');
 assert.equal(shown,'done');
 assert.match(el('formalDoneHeading').textContent,/暫留/);
 assert.doesNotMatch(el('formalDoneHeading').textContent,/已確認/);
 assert.match(el('formalDoneBooking').textContent,/非正式確認/);
 shown='';
 render('UNKNOWN',sha,'2026/11/11','RES_OFFLINE');
 assert.equal(shown,'done');
 assert.match(el('formalDoneHeading').textContent,/尚未確認/);
 shown='';
 render('CONFIRMED','bad','2026/11/11','RES_OFFLINE');
 assert.equal(shown,'');
 assert.match(message,/不得宣稱完成/);
 ctx.formalConsent.confirmed=false;
 render('CONFIRMED',sha,'2026/11/11','RES_OFFLINE');
 assert.equal(shown,'');
 ctx.formalConsent.confirmed=true;
 render('CONFIRMED',sha,'2026/11/11','RES_OFFLINE');
 assert.equal(shown,'done');
 assert.match(el('formalDoneHeading').textContent,/已確認/);
});
