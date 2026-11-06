'use strict';
const crypto=require('node:crypto');
// Exact CLOSED backend + admin + unified TEST path. Audited OTP/Booking kernels
// may be deployed only at pinned source hashes; no production sheet adapter.
const APPROVED_BACKEND=Object.freeze([
 {name:'Website',type:'SERVER_JS',path:'gas/Website.js'},
 {name:'AdminSandbox',type:'SERVER_JS',path:'gas/AdminSandbox.js'},
 {name:'AdminConsole',type:'HTML',path:'gas/AdminConsole.html'},
 {name:'Study1Flow',type:'SERVER_JS',path:'gas/Study1Unified.js'},
 {name:'Study1Unified',type:'HTML',path:'gas/Study1Unified.html'},
 {name:'Study1Visitor',type:'HTML',path:'gas/Study1Visitor.html'},
 {name:'Study1Team',type:'HTML',path:'gas/Study1Team.html'},
 {name:'OtpCore',type:'SERVER_JS',path:'gas/OtpCore.js'},
 {name:'BookingCore',type:'SERVER_JS',path:'gas/BookingCore.js'},
 {name:'OtpThrottle',type:'SERVER_JS',path:'gas/OtpThrottle.js'},
 {name:'OtpTransaction',type:'SERVER_JS',path:'gas/OtpTransaction.js'},
 {name:'BookingHoldTransaction',type:'SERVER_JS',path:'gas/BookingHoldTransaction.js'},
 {name:'Study1FixtureAdapter',type:'SERVER_JS',path:'gas/Study1FixtureAdapter.js'}
]);
function assertClosedWebsite(source){
 if(typeof source!=='string')throw Error('Missing Website source');
 const required=[
  "const SITE_CONTACT_ = 'lily4318@cycu.edu.tw';",
  "operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'",
  "function doGet(e){if(e&&e.parameter&&e.parameter.view==='admin'){study1AdminOwnerRequired_();",
  "HtmlService.createHtmlOutputFromFile('AdminConsole')",
  "study1SandboxBookingFlags_();return HtmlService.createHtmlOutputFromFile('Study1Unified')",
  "view==='demo'){study1AdminOwnerRequired_();study1SandboxBookingFlags_();",
  "view==='team'){study1AdminOwnerRequired_();study1SandboxBookingFlags_();",
  "HtmlService.createHtmlOutputFromFile('Index')",
  'function getPublicConfig(){return {open:false,consentReady:false',
  'function requestOtp(){return rejectIntake_();}',
  'function verifyOtp(){return rejectIntake_();}',
  'function holdSlot(){return rejectIntake_();}',
  'function cancelHold(){return rejectIntake_();}',
  'function submitConsent(){return rejectIntake_();}',
  'function listSlots(){return [];}', 
  'function setOpen_(){return rejectIntake_();}',
  "p.setProperties({OPEN:'false',CONSENT_READY:'false'},false)"
 ];
 for(const token of required)if(!source.includes(token))throw Error('CLOSED Website guard changed: '+token);
 const allowed=new Set(['doGet','getPublicConfig','rejectIntake_','requestOtp','verifyOtp','holdSlot','cancelHold','submitConsent','listSlots','setOpen_','initializeClosedSystem_','runClosedChecks_']);
 const functions=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(functions.length!==allowed.size||new Set(functions).size!==functions.length||functions.some(name=>!allowed.has(name)))throw Error('Unreviewed Website server entry point');
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|eval)\b/.test(source))throw Error('Live data or external operation in CLOSED Website');
}
function assertAdminSandbox(source){
 if(typeof source!=='string')throw Error('AdminSandbox source missing');
 const required=[
  "const STUDY1_ADMIN_OWNER_='solac.tw@gmail.com'",
  "const STUDY1_ADMIN_PROPERTY_='STUDY1_SANDBOX_ADMIN_CONFIG_V1'",
  "const STUDY1_ADMIN_SELFTEST_PROPERTY_='STUDY1_SANDBOX_SELFTEST_V1'",
  'function adminRunSandboxSelfTest(){',
  "const STUDY1_SANDBOX_BOOKINGS_PROPERTY_='STUDY1_SANDBOX_BOOKINGS_V1'",
  'function adminGetTestBookings(){',
  'function adminChangeTestBooking(input){',
  'study1SandboxBookingFlags_();',
  'LockService.getScriptLock()',
  'p.setProperty(STUDY1_SANDBOX_BOOKINGS_PROPERTY_,payload)',
  'study1AdminRequireRevision_(observed,0)',
  'p.deleteProperty(STUDY1_ADMIN_SELFTEST_PROPERTY_)',
  'function study1SandboxBookingMutation_(input,state,config){',
  'bookingE2eVerified:true,bookingsUnchanged:true',
  'Session.getActiveUser().getEmail()',
  'Session.getEffectiveUser().getEmail()',
  'if(effective!==STUDY1_ADMIN_OWNER_||active!==STUDY1_ADMIN_OWNER_)',
  'function adminGetSandboxConfig(){',
  'function adminSaveSandboxConfig(input,expectedRevision){',
  'function adminValidateSandboxConfig(input){',
  'study1AdminOwnerRequired_();',
  'LockService.getScriptLock()',
  "PropertiesService.getScriptProperties()",
  'getProperty(STUDY1_ADMIN_PROPERTY_)',
  'setProperty(STUDY1_ADMIN_PROPERTY_,payload)',
  "mode:'SANDBOX_ONLY',open:false,consentReady:false"
 ];
 for(const token of required)if(!source.includes(token))throw Error('Unreviewed AdminSandbox change: '+token);
 const expected=new Set(['study1AdminOwnerRequired_','study1AdminDefault_','study1AdminValidate_','study1AdminPersisted_','study1AdminRequireRevision_','adminGetSandboxConfig','adminSaveSandboxConfig','adminValidateSandboxConfig','adminRunSandboxSelfTest','study1SandboxBookingMutation_','study1SandboxBookingState_','study1SandboxBookingFlags_','study1SandboxBookingIntegrity_','study1SandboxBookingView_','adminGetTestBookings','adminChangeTestBooking']);
 const found=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(found.length!==expected.size||found.some(x=>!expected.has(x))||new Set(found).size!==expected.size)throw Error('Unreviewed admin endpoint');
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|eval|deleteAllProperties|setProperties)\b/.test(source))throw Error('Forbidden research data or external operation');
}
function assertAdminHtml(html){
 if(typeof html!=='string'||!html.startsWith('<!doctype html>'))throw Error('Missing admin HTML');
 for(const token of ["google.script.run.withSuccessHandler(render)","adminGetSandboxConfig()","adminSaveSandboxConfig(data,revision)","adminValidateSandboxConfig(data)","adminRunSandboxSelfTest()","STUDY1_SANDBOX_EXPORT_V1","importConfig()","adminGetTestBookings()","adminChangeTestBooking({action,bookingCode,slotId,requestId,expectedRevision:bookingRevision})","目前不接受真人報名"])if(!html.includes(token))throw Error('Admin HTML missing safe workflow');
 if(/<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i.test(html))throw Error('Unreviewed admin HTML operation');
}

/** Content-addressed review gate for EXISTING, unchanged pure core files.
 * No token, real participant, live adapter or Sheet mutation is authorized.
 * BookingCore contains an underscore-suffixed manual read-only schema preflight:
 * NEVER call it from the deployed owner preview workflow.
 */
function assertPinnedCore(source,expected,name){
 if(typeof source!=='string')throw Error(name+' source missing');
 const bytes=Buffer.from(source,'utf8');
 const sha=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(sha!==expected)throw Error('PINNED '+name+' source changed; manual review required');
}
function assertOtpCore(source){
 assertPinnedCore(source,'d85a6a161613b017fa7b144826d31333eab0ee89','OtpCore');
 if(!source.includes('function otpEvaluateVerification_(')||
    !source.includes('function otpHmacHex_('))throw Error('OtpCore pure methods missing');
}
function assertBookingCore(source){
 assertPinnedCore(source,'496fa02b896f71682bf2dead373b2a146cfe0f7e','BookingCore');
 if(!source.includes('function bookingComputeAvailability_(')||
    !source.includes('function bookingVerifySheetHeaders_('))
   throw Error('BookingCore expected pure method or read-only preflight missing');
}

function assertFixtureAdapter(source){
 assertPinnedCore(source,'2230b704fd7ce560b0691ac4314b7a99c749e5d8','Study1FixtureAdapter');
 const expected=new Set(['study1FixtureLock_','study1FixtureEmail_',
  'study1FixtureOtpSnapshot_','study1FixtureIssue_','study1FixtureVerify_',
  'study1FixtureBookingSnapshot_','study1FixtureHold_']);
 const found=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(found.length!==expected.size||found.some(x=>!expected.has(x))||
   new Set(found).size!==expected.size)throw Error('Unreviewed fixture adapter function');
 for(const token of ['otpThrottleIssuePreflight_(','otpVerifyOnceLocked_(',
   'bookingHoldOnceLocked_(','outerLock.hasLock()','example.invalid'])
  if(!source.includes(token))throw Error('Fixture adapter transaction guard missing');
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|PropertiesService|LockService|eval)\b/.test(source))
  throw Error('Fixture adapter cannot access live resources');
}
function assertTransactionKernel(source,expected,name){
 assertPinnedCore(source,expected,name);
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|PropertiesService|LockService|eval)\s*\./.test(source))
  throw Error('Transaction kernel cannot access live resources');
 const names=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(names.some(x=>!x.endsWith('_')))throw Error('Unreviewed public transaction endpoint');
}
function assertUnifiedFlow(source){
 if(typeof source!=='string')throw Error('Unified flow source missing');
 for(const token of ["const STUDY1_UNIFIED_FIXTURE_KEY_='STUDY1_UNIFIED_FIXTURE_V1'",
   "function study1UnifiedAssertOwner_(){","study1AdminOwnerRequired_();",
   "study1SandboxBookingFlags_();","function study1UnifiedPreviewGet(){",
   "function study1UnifiedPreviewCommand(command){","LockService.getScriptLock()",
   "prop.setProperty(STUDY1_UNIFIED_FIXTURE_KEY_,stored)",
   "const STUDY1_UNIFIED_GZIP_PREFIX_='GZIP1:'",
   "const STUDY1_UNIFIED_PROPERTY_SAFE_BYTES_=7900",
   "function study1UnifiedStoredDecode_(stored){",
   "function study1UnifiedStoredEncode_(raw){",
   "Utilities.gzip(Utilities.newBlob(",
   "Utilities.ungzip(Utilities.newBlob(",
   "study1UnifiedStoredDecode_(readback)!==raw",
   "fixture.deleteProperty(STUDY1_UNIFIED_FIXTURE_KEY_)",
   "c.action==='ADMIN_RESET'","action==='CONSENT_REVIEW'","action==='ADMIN_RESEARCH'",
   "action==='ADMIN_SCREENING'","action==='ADMIN_NOTIFY_ATTEMPT'",
   "action==='PDF_DEMO_REVIEW'","function study1UnifiedPdfFixture_(){",
   "Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256",
   "kind:'SIMULATED_PDF_NOT_REC'","function study1UnifiedGovernance_(s){",
   "study1FixtureIssue_(s,a,now)","study1FixtureVerify_(s,a,p.code,now,outerLock)",
   "study1FixtureHold_(s,a,slot,cmd.requestId,now,outerLock)",
   "function study1UnifiedFormalReadiness_(s){",
   "function study1UnifiedPreviewSelfTest(){",
   "formalReadiness:study1UnifiedFormalReadiness_(s)","study1UnifiedValidateE2Weeks_(s.e2Weeks)",
   "action==='ADMIN_RECRUITMENT'","study1UnifiedValidateRecruitment_(s.recruitment)",
   "action==='ADMIN_B04_NOTE'","s.b04.notes[p.id]=p.note",
   "s.b04.history.push(","p.reason.trim().length<4",
   "e.actor!=='OWNER'","b04:JSON.parse(JSON.stringify(s.b04",
   "if(s&&!s.b04)s.b04={notes:{},history:[]}",
   "action==='ADMIN_B05_CLOSURE'","s.b05.history.push(",
   "s.b05.closures[slot.id]=","delete s.b05.closures[slot.id]",
   "s.b02.sessions[slot.id]={...m,status:'CLOSED'}",
   "s.b05.history=s.b05.history.slice(-32)",
   "if(s&&!s.b05)s.b05={closures:{},history:[]}",
   "b05:JSON.parse(JSON.stringify(s.b05",
   "p.action==='CLOSE'&&issues>0&&p.handoff.trim().length<4",
   "if(!Number.isFinite(start)||start>now)",
   "function study1UnifiedStoreReadiness_()",
   "function study1UnifiedStoreApply_(original,command)",
   "function study1UnifiedStoreVerify_(state)",
   "function study1UnifiedStorePage_(state,query)",
   "original.mode!=='SYNTHETIC_CONTRACT_ONLY'",
   "c.value.source!=='SYNTHETIC_ONLY'",
   "query.expectedRevision!==state.revision",
   "if(beforeBytes!==initialStored)",
   "study1UnifiedRestoreOwnedWrite_(prop,STUDY1_UNIFIED_FIXTURE_KEY_,beforeBytes,stored)",
   "throw Error('資料寫入狀態不明或發生競寫",
   "const STUDY1_B06_TASK_KEY_='STUDY1_B06_TASKS_V1'",
   "function study1UnifiedB06Command(command)",
   "function study1B06Apply_(state,command,source,now)",
   "function study1B06Verify_(s)",
   "props.setProperty(STUDY1_B06_TASK_KEY_,packed)",
   "if(props.getProperty(STUDY1_B06_TASK_KEY_)!==initial)",
   "study1UnifiedAssertOwner_();","study1SandboxBookingFlags_();",
   "b06:{...study1B06Read_(),formalPersistence:false}",
   "function study1UnifiedB12AuditPage(query)",
   "study1UnifiedRoleAuthorise_('OWNER','SYNTHETIC_READ')",
   "study1UnifiedB12Export(){",
   "study1UnifiedRoleAuthorise_('OWNER','EXPORT_AUDIT')",
   "function study1B12AuditPage_(fixture,b06,query)",
   "study1B06Verify_(b06)",
   "query.snapshotHash!==snapshotHash",
   "function study1B12FailureDiagnostic_(module,error)",
   "persistedInB12:false" ])
  if(!source.includes(token))throw Error('Unreviewed unified workflow change: '+token);
 const expected=new Set([
  'study1UnifiedDefinitions_','study1UnifiedInitial_','study1UnifiedAssertOwner_',
  'study1UnifiedRead_','study1UnifiedCapacity_','study1UnifiedView_',
  'study1UnifiedRequireCommand_','study1UnifiedEligibility_','study1UnifiedTransition_',
  'study1UnifiedPreviewGet','study1UnifiedPreviewCommand',
  'study1UnifiedPolicy_','study1UnifiedValidatePolicy_','study1UnifiedValidateSlots_',
  'study1UnifiedAudit_','study1UnifiedNotify_','study1UnifiedProductionAdapter_',
  'study1UnifiedResearch_','study1UnifiedValidateResearch_',
  'study1UnifiedCoreAvailability_','study1UnifiedCoreOtpDecision_',
  'study1UnifiedPdfFixture_','study1UnifiedGovernance_',
  'study1UnifiedFormalReadiness_','study1UnifiedPreviewSelfTest',
  'study1UnifiedE2Weeks_','study1UnifiedValidateE2Weeks_','study1UnifiedFormalPorts_',
  'study1UnifiedRecruitment_','study1UnifiedValidateRecruitment_',
  'study1UnifiedUtf8Bytes_','study1UnifiedStoredDecode_','study1UnifiedStoredEncode_',
  'study1UnifiedStoreReadiness_','study1UnifiedStoreHash_','study1UnifiedStoreInitial_',
  'study1UnifiedStoreApply_','study1UnifiedStoreVerify_','study1UnifiedStorePage_',
  'study1UnifiedRoleAuthorise_','study1UnifiedRestoreOwnedWrite_',
  'study1B06Initial_','study1B06Text_','study1B06Fields_','study1B06Verify_',
  'study1B06Read_','study1B06Apply_','study1UnifiedB06Command',
  'study1B12AuditBuild_','study1B12AuditPage_',
  'study1UnifiedB12AuditPage','study1UnifiedB12Export',
  'study1B12FailureDiagnostic_']);
 const functions=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(functions.length!==expected.size||new Set(functions).size!==expected.size||
   functions.some(name=>!expected.has(name)))throw Error('Unreviewed unified workflow endpoint');
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|eval|deleteAllProperties|setProperties)\b/.test(source))
  throw Error('Unified workflow cannot access live research data or send emails');
 // Even the pinned BookingCore contains an INTERNAL read-only Sheet preflight.
 // Never permit TEST flow code to call that preflight or unapproved writers.
 if(/\b(?:bookingVerifySheetHeaders_|bookingReadOnlySnapshot_|bookingHoldOnceLocked_|otpVerifyOnceLocked_)\s*\(/.test(source))
  throw Error('Forbidden production preflight or writer in TEST workflow');
}
function assertUnifiedHtml(html){
 if(typeof html!=='string'||!html.startsWith('<!doctype html>')||
  !html.includes('study1UnifiedPreviewGet()')||
  !html.includes('study1UnifiedPreviewCommand(envelope)')||
  !html.includes('SIMULATED_SIGN_ONLY')||
  !html.includes("command('CONSENT_REVIEW'")||
  !html.includes("command('ADMIN_RESET'")||
  !html.includes("command('ADMIN_SCREENING'")||
  !html.includes("command('ADMIN_NOTIFY_ATTEMPT'")||
  !html.includes("command('PDF_DEMO_REVIEW'")||
  !html.includes('id="testPdfLink"')||
  !html.includes('id="governanceStatus"')||
  !html.includes('id="formalReadinessStatus"')||
  !html.includes('id="adminAcceptance"')||
  !html.includes('study1UnifiedPreviewSelfTest()')||
  !html.includes('正式報名未開放'))throw Error('Unified website missing TEST-only workflow');
 if(/<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i.test(html))
  throw Error('Unified website has forbidden external or raw HTML operations');
}
function assertVisitorHtml(html){
 if(typeof html!=='string'||!html.startsWith('<!doctype html>')||
    !html.includes('id="chooseE1"')||!html.includes('id="chooseE2"')||
    !html.includes('id="screenNext"')||!html.includes('id="otpSend"')||
    !html.includes('id="otpVerify"')||!html.includes('id="hold"')||
    !html.includes('id="review"')||!html.includes('id="finish"')||
    !html.includes('id="receiptId"')||
    !html.includes('study1UnifiedPreviewGet()')||
    !html.includes('study1UnifiedPreviewCommand(envelope)')||
    !html.includes('SIMULATED_SIGN_ONLY')||
    !html.includes('不接受正式報名')||
    !html.includes('<base target="_top">')||
    !html.includes('https://script.google.com/macros/s/AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s/exec')||
    /<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i.test(html))
   throw Error('Visitor demo must remain participant-only, synthetic and without external scripts');
}
function assertTeamHtml(html){
 if(typeof html!=='string'||!html.startsWith('<!doctype html>')||
    !html.includes('id="saveModes"')||!html.includes('id="modeE1"')||
    !html.includes('id="modeE2"')||!html.includes('id="saveResearch"')||
    !html.includes('id="saveSlots"')||!html.includes('id="saveWeeks"')||
    !html.includes("save('ADMIN_RECRUITMENT'")||
    !html.includes('id="b06Module"')||!html.includes('id="b06Form"')||
    !html.includes('id="b06History"')||!html.includes('study1UnifiedB06Command(')||
    !html.includes('study1UnifiedPreviewGet()')||
    !html.includes('study1UnifiedPreviewCommand({action,payload,requestId:id,expectedRevision:model.revision})')||
    !html.includes('正式收件開關保持鎖定')||
    !html.includes('https://script.google.com/macros/s/AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s/exec?view=demo')||
    /<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i.test(html))
  throw Error('Research team UI must remain graphical, approved owner-only and CLOSED');
}
function mergeApproved(core,remote,index,website,adminScript,adminHtml,unifiedScript,unifiedHtml,otpCore,bookingCore,otpThrottle,otpTransaction,bookingHoldTransaction,fixtureAdapter){
 core.assertIndex(index);assertClosedWebsite(website);assertAdminSandbox(adminScript);assertAdminHtml(adminHtml);assertUnifiedFlow(unifiedScript);assertUnifiedHtml(unifiedHtml);assertOtpCore(otpCore);assertBookingCore(bookingCore);
 assertTransactionKernel(otpThrottle,'93fc0adb2e45b90d75f092109b204dce51ac6ee1','OtpThrottle');
 assertTransactionKernel(otpTransaction,'85e554cab2c6767fd80545b8c6e573c99e750a9e','OtpTransaction');
 assertTransactionKernel(bookingHoldTransaction,'1f12a687625ceb72414227451853a900e3dab692','BookingHoldTransaction');
 assertFixtureAdapter(fixtureAdapter);
 const visitorHtml=require('node:fs').readFileSync(require('node:path').join(__dirname,'../gas/Study1Visitor.html'),'utf8');
 assertVisitorHtml(visitorHtml);
 const teamHtml=require('node:fs').readFileSync(require('node:path').join(__dirname,'../gas/Study1Team.html'),'utf8');
 assertTeamHtml(teamHtml);
 const originals=remote.files,merged=structuredClone(originals);
 const incoming=[{name:'Index',type:'HTML',source:index},{name:'Website',type:'SERVER_JS',source:website},
  {name:'AdminSandbox',type:'SERVER_JS',source:adminScript},{name:'AdminConsole',type:'HTML',source:adminHtml},
  {name:'Study1Flow',type:'SERVER_JS',source:unifiedScript},{name:'Study1Unified',type:'HTML',source:unifiedHtml},
  {name:'Study1Visitor',type:'HTML',source:visitorHtml},
  {name:'Study1Team',type:'HTML',source:teamHtml},
  {name:'OtpCore',type:'SERVER_JS',source:otpCore},{name:'BookingCore',type:'SERVER_JS',source:bookingCore},
  {name:'OtpThrottle',type:'SERVER_JS',source:otpThrottle},
  {name:'OtpTransaction',type:'SERVER_JS',source:otpTransaction},
  {name:'BookingHoldTransaction',type:'SERVER_JS',source:bookingHoldTransaction},
  {name:'Study1FixtureAdapter',type:'SERVER_JS',source:fixtureAdapter}];
 for(const change of incoming){
  const collisions=merged.filter(f=>f.name===change.name);
  if(collisions.length>1||collisions.some(f=>f.type!==change.type))throw Error('Unexpected remote GAS file collision: '+change.name);
  if(collisions.length===1)collisions[0].source=change.source;
  else merged.push(change);
 }
 const approved=new Set(incoming.map(x=>x.name));
 const keep=files=>files.filter(f=>!approved.has(f.name));
 if(core.digest(keep(merged))!==core.digest(keep(originals)))throw Error('Unapproved remote GAS source changed');
 return merged;
}
module.exports={APPROVED_BACKEND,assertClosedWebsite,assertAdminSandbox,assertAdminHtml,assertUnifiedFlow,assertUnifiedHtml,assertOtpCore,assertBookingCore,assertFixtureAdapter,assertTransactionKernel,assertVisitorHtml,assertTeamHtml,mergeApproved};
