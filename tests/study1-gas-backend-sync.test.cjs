'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../scripts/study1-gas-index-preview.cjs');
const backend=require('../scripts/study1-gas-backend-allowlist.cjs');
const sync=require('../scripts/study1-gas-auto-index.cjs');
const website=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
const adminSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const unified=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.js'),'utf8');
const unifiedHtml=fs.readFileSync(path.join(__dirname,'../gas/Study1Unified.html'),'utf8');
const otpCore=fs.readFileSync(path.join(__dirname,'../gas/OtpCore.js'),'utf8');
const bookingCore=fs.readFileSync(path.join(__dirname,'../gas/BookingCore.js'),'utf8');
const otpThrottle=fs.readFileSync(path.join(__dirname,'../gas/OtpThrottle.js'),'utf8');
const otpTransaction=fs.readFileSync(path.join(__dirname,'../gas/OtpTransaction.js'),'utf8');
const bookingHoldTransaction=fs.readFileSync(path.join(__dirname,'../gas/BookingHoldTransaction.js'),'utf8');
const fixtureAdapter=fs.readFileSync(path.join(__dirname,'../gas/Study1FixtureAdapter.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../gas/Index.html'),'utf8');
function remote(){
 return {files:[
  {name:'Index',type:'HTML',source:'old'},
  {name:'Website',type:'SERVER_JS',source:website},
  {name:'appsscript',type:'JSON',source:'{"webapp":{"access":"ANYONE_ANONYMOUS","executeAs":"USER_DEPLOYING"}}'},
  {name:'Untracked',type:'SERVER_JS',source:'preserve this remote-only file'}
 ]};
}
test('Current reviewed CLOSED Website source passes strict server gate',()=>{
 assert.doesNotThrow(()=>backend.assertClosedWebsite(website));
 assert.deepEqual(backend.APPROVED_BACKEND.map(f=>f.name),['Website','AdminSandbox','AdminConsole','Study1Flow','Study1Unified','Study1PdfLib','Study1PdfStampCore','Study1EConsentBinding','Study1EConsentOtpAdapter','Study1WizardP0Bridge','Study1WizardEnrollment','Study1ParticipantIntake','Study1ParticipantTrust','Study1SelfReportAuthority','Study1FormalBooking','Study1FormalConsent','Study1Visitor','Study1Team','OtpCore','BookingCore','OtpThrottle','OtpTransaction','BookingHoldTransaction','BookingReadOnlySheet','Study1FixtureAdapter']);
 assert.doesNotThrow(()=>backend.assertAdminSandbox(adminSource));
 assert.doesNotThrow(()=>backend.assertAdminHtml(adminHtml));
 assert.doesNotThrow(()=>backend.assertUnifiedFlow(unified));
 assert.doesNotThrow(()=>backend.assertUnifiedHtml(unifiedHtml));
 assert.doesNotThrow(()=>backend.assertOtpCore(otpCore));
 assert.doesNotThrow(()=>backend.assertBookingCore(bookingCore));
 assert.doesNotThrow(()=>backend.assertFixtureAdapter(fixtureAdapter));
 assert.doesNotThrow(()=>backend.assertTransactionKernel(otpThrottle,'93fc0adb2e45b90d75f092109b204dce51ac6ee1','OtpThrottle'));
});
test('Rejects new server endpoints and changes to fail-closed intake',()=>{
 assert.throws(()=>backend.assertClosedWebsite(website+'\nfunction newPublicEndpoint(){}'),/Unreviewed/);
 assert.throws(()=>backend.assertClosedWebsite(website.replace('function listSlots(){return [];}', 'function listSlots(){return [1];}')),/CLOSED/);
 assert.throws(()=>backend.assertClosedWebsite(website+'\n// SpreadsheetApp'),/Live data/);
});
test('Approved merge preserves manifest and unknown remote-only GAS modules byte for byte',()=>{
 const original=remote(),result=backend.mergeApproved(core,original,index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(core.file(result,'Index','HTML').source,index);
 assert.equal(core.file(result,'Website','SERVER_JS').source,website);
 assert.equal(core.file(result,'AdminSandbox','SERVER_JS').source,adminSource);
 assert.equal(core.file(result,'AdminConsole','HTML').source,adminHtml);
 assert.equal(core.file(result,'Study1Flow','SERVER_JS').source,unified);
 assert.equal(core.file(result,'Study1Unified','HTML').source,unifiedHtml);
 assert.equal(core.file(result,'OtpCore','SERVER_JS').source,otpCore);
 assert.equal(core.file(result,'BookingCore','SERVER_JS').source,bookingCore);
 assert.equal(core.file(result,'OtpTransaction','SERVER_JS').source,otpTransaction);
 assert.equal(core.file(result,'BookingHoldTransaction','SERVER_JS').source,bookingHoldTransaction);
 assert.equal(core.file(result,'Study1FixtureAdapter','SERVER_JS').source,fixtureAdapter);
 assert.equal(core.file(result,'Untracked','SERVER_JS').source,'preserve this remote-only file');
 assert.equal(core.file(result,'appsscript','JSON').source,core.file(original.files,'appsscript','JSON').source);
 assert.equal(sync.compareUnapproved(result,original.files),true);
 assert.equal(sync.compareNoIndex(result,original.files),false);
 result.find(f=>f.name==='Untracked').source='unexpected';
 assert.equal(sync.compareUnapproved(result,original.files),false);
});
test('A reviewed CLOSED Website-only change is included without modifying other GAS files',()=>{
 const original=remote(),changed=website+'\n// reviewed comment only';
 const result=backend.mergeApproved(core,original,index,changed,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(core.file(result,'Website','SERVER_JS').source,changed);
 assert.equal(sync.compareUnapproved(result,original.files),true);
 assert.equal(sync.compareNoIndex(result,original.files),false);
});
test('Workflow watches both reviewed source files, never triggers force push',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(workflow,/'gas\/Website.js'/);
 assert.match(workflow,/'scripts\/study1-gas-backend-allowlist.cjs'/);
 assert.match(workflow,/'gas\/OtpCore.js'/);
 assert.match(workflow,/'gas\/BookingCore.js'/);
 assert.match(workflow,/main-otp-after.js/);
 assert.match(workflow,/main-booking-after.js/);
 assert.match(workflow,/main-website-after.js/);
 assert.doesNotMatch(workflow,/clasp push --force/);
});

test('Admin source guard rejects new functions, live research Sheets calls and altered identity check',()=>{
 assert.throws(()=>backend.assertAdminSandbox(adminSource+'\nfunction publicOverride(){}'),/Unreviewed admin endpoint/);
 assert.throws(()=>backend.assertAdminSandbox(adminSource+'\n// SpreadsheetApp.openById'),/Forbidden/);
 assert.throws(()=>backend.assertAdminSandbox(adminSource.replace('Session.getActiveUser().getEmail()','Session.getEffectiveUser().getEmail()')),/Unreviewed AdminSandbox/);
 assert.throws(()=>backend.assertAdminHtml(adminHtml+'<script src="https://bad.test/x.js"></script>'),/Unreviewed/);
});
test('Only reviewed internal Booking/OTP pure cores are allowed, and fixture-only transaction adapters',()=>{
 const original=remote(),result=backend.mergeApproved(core,original,index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(result.length,16);
 assert.deepEqual(result.filter(x=>/^Booking|^Otp/.test(x.name)).map(x=>x.name).sort(),['BookingCore','BookingHoldTransaction','OtpCore','OtpThrottle','OtpTransaction']);
 assert.equal(result.some(x=>x.name==='BookingHoldTransaction'||x.name==='OtpTransaction'),true);
 const withProtected=remote();withProtected.files.push({name:'BookingReadOnlySheet',type:'SERVER_JS',source:'DO NOT TOUCH'});
 const r=backend.mergeApproved(core,withProtected,index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(core.file(r,'BookingReadOnlySheet','SERVER_JS').source,'DO NOT TOUCH');
});
test('Admin file-name collision or unexpected type fails before writing GAS',()=>{
 const conflicting=remote();conflicting.files.push({name:'AdminSandbox',type:'JSON',source:'{}'});
 assert.throws(()=>backend.mergeApproved(core,conflicting,index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter),/collision/);
});
test('Workflow watches sandbox backend and HTML and checks both against current main',()=>{
 const w=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
 assert.match(w,/'gas\/AdminSandbox.js'/);assert.match(w,/'gas\/AdminConsole.html'/);
 assert.match(w,/main-admin-after\.js/);assert.match(w,/main-admin-after\.html/);
});

test('MYSELF deployment plus explicit active and effective owner identities are mandatory',()=>{
 const path=require('node:path');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../gas/appsscript.json'),'utf8'));
 assert.equal(manifest.webapp.access,'MYSELF');
 assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');
 const code=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
 assert.match(code,/if\(effective!==STUDY1_ADMIN_OWNER_\|\|active!==STUDY1_ADMIN_OWNER_\)/);
});

test('Unified TEST mode is owner-only and includes only pinned core functions, transaction writers remain internal',()=>{
 const merged=backend.mergeApproved(core,remote(),index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.deepEqual(merged.filter(f=>f.name==='OtpCore'||f.name==='BookingCore').map(f=>f.name).sort(),['BookingCore','OtpCore']);
 assert.equal(merged.some(f=>f.name==='OtpTransaction'||f.name==='BookingHoldTransaction'),true);
 assert.throws(()=>backend.assertUnifiedFlow(unified+'\nfunction unsafePublicEndpoint(){}'),/Unreviewed/);
 assert.throws(()=>backend.assertUnifiedFlow(unified+'\n// MailApp'),/cannot access live/);
 assert.throws(()=>backend.assertUnifiedHtml(unifiedHtml+'<script src="x"></script>'),/forbidden/);
 assert.match(website,/view==='preview'\)\{study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\)/);
});

test('Only content-pinned internal core sources are allowed into the private /exec',()=>{
 assert.throws(()=>backend.assertOtpCore(otpCore+'\n// modified'),/PINNED OtpCore/);
 assert.throws(()=>backend.assertBookingCore(bookingCore+'\n// modified'),/PINNED BookingCore/);
 const r=backend.mergeApproved(core,remote(),index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(r.find(f=>f.name==='BookingCore').source,bookingCore);
 assert.equal(r.find(f=>f.name==='OtpCore').source,otpCore);
 assert.equal(r.some(f=>f.name==='OtpTransaction'||f.name==='BookingHoldTransaction'),true);
 const changed=remote();changed.files.push({name:'BookingCore',type:'SERVER_JS',source:'other'});
 const replaced=backend.mergeApproved(core,changed,index,website,adminSource,adminHtml,unified,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter);
 assert.equal(replaced.find(f=>f.name==='BookingCore').source,bookingCore);
 assert.equal(sync.compareUnapproved(replaced,changed.files),true);
});

test('Unified TEST integration cannot call real Sheet preflight or unreviewed transaction writers',()=>{
 for(const method of ['bookingVerifySheetHeaders_','bookingReadOnlySnapshot_',
   'bookingHoldOnceLocked_','otpVerifyOnceLocked_']){
  assert.throws(()=>backend.assertUnifiedFlow(unified+'\n// forbidden: '+method+'()'),/Forbidden production preflight/);
 }
 assert.doesNotThrow(()=>backend.assertUnifiedFlow(unified));
});


test('MVP deployment preview source preflight pins the entire original owner-only GAS set',()=>{
 const preview=require('../scripts/study1-gas-owner-preview-deploy.cjs');
 const files=preview.reviewSources();
 assert.ok(files.length>20);
 const pdf=files.find(x=>x.name==='Study1FormalConsent');
 const backend=files.find(x=>x.name==='AdminSandbox');
 const team=files.find(x=>x.name==='Study1Team');
 assert.match(pdf.source,/E1_RESEARCHER_PRESIGNED_PDF_NOT_UPLOADED/);
 assert.match(backend.source,/function study1EConsentOwnerSignedPdfDownload\(/);
 assert.match(team.source,/id="consentPresignedAttest"/);
 const names=files.map(x=>x.name);
 assert.equal(new Set(names).size,names.length);
 assert.equal(names.includes('appsscript'),false,'immutable private MYSELF manifest staged separately');
});
