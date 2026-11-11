'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const home=()=>read('gas/Index.html');
const visitor=()=>read('gas/Study1Visitor.html');

test('§70-S public information homepage cannot expose direct signing or actual enrollment',()=>{
 const html=home();
 assert.doesNotMatch(html,/id="consent"/);
 assert.doesNotMatch(html,/知情同意是報名最後的步驟/);
 assert.match(html,/exec\?view=apply/);
 assert.match(html,/id="apply"/);
 assert.match(html,/查看正式報名流程（目前不收件）/);
 assert.doesNotMatch(html,/<(?:form|input|textarea|canvas|iframe)\b/i);
 assert.doesNotMatch(html,/id="consent(?:Signature|Signer|Submit|AccessCode|PdfViewer)"/);
 assert.doesNotMatch(html,/initConsentPortal_|study1EConsentSign\(/);
 assert.match(read('gas/Website.js'),/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});

test('§70-S original seven-stage booking and V05/V08 management survive with summary before consent',()=>{
 const html=visitor();
 assert.match(html,/const phases=\['choose','screen','otp','slots','confirm','consent','done'\]/);
 const phases=['choose','screen','otp','slots','confirm','consent','done'];
 let last=-1;
 for(const step of phases){
  const p=html.indexOf('id="step-'+step+'"');
  assert.ok(p>last,'Missing or reordered step '+step);
  last=p;
 }
 for(const id of ['chooseE1','chooseE2','screenNext','otpVerify','v05Dates','v05Choices',
  'v05Prev','v05Next','v06Summary','confirm','pdf','readPdf','visitorSignaturePreview',
  'visitorSignatureClear','review','finish','v08WaitBox','move','cancel',
  'v08UnknownRecover','receiptId'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/case 'HELD':return reviewedHoldKey===holdFingerprint_\(a\)\?'consent':'confirm'/);
 assert.match(html,/case 'CONSENTED':return 'consent'/);
 assert.match(html,/const a=current\(\);[\s\S]{0,250}reviewedHoldKey=holdFingerprint_\(a\);clearVisitorSignature_\(\);render\(\);/);
 assert.doesNotMatch(html,/\$\('confirm'\)\.addEventListener\('click',[\s\S]{0,200}issue\('CONFIRM'/);
});

test('§70-S handwriting remains private-only and synthetic while PDF composition is unapproved',()=>{
 const html=visitor();
 assert.match(html,/touch-action:none/);
 assert.match(html,/pointerdown/);
 assert.match(html,/pointermove/);
 assert.match(html,/pointerup/);
 assert.match(html,/pointercancel/);
 assert.match(html,/!previewInk/);
 assert.match(html,/reviewedHoldKey!==holdFingerprint_\(a\)/);
 assert.match(html,/signature:'SIMULATED_SIGN_ONLY'/);
 assert.match(html,/尚未存入PDF或形成有效電子同意/);
 assert.match(html,/原私人流程回歸測試/);
 assert.doesNotMatch(html,/MailApp\.|GmailApp\.|SpreadsheetApp\./);
 assert.doesNotMatch(html,/<script[^>]+src=/);
});

test('§70-S no public GAS collection or route escalation has been introduced',()=>{
 const website=read('gas/Website.js');
 const release=read('scripts/study1-gas-public-release.cjs');
 const indexGate=read('scripts/study1-gas-index-preview.cjs');
 assert.match(website,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function holdSlot\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
 assert.match(indexGate,/Formal consent cannot be signed on the public information homepage/);
 assert.match(release,/Signing interface may not be exposed on public information homepage/);
});
