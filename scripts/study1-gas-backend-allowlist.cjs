'use strict';
// Exact CLOSED backend + sandbox admin allowlist; never deploy Booking/OTP modules.
const APPROVED_BACKEND=Object.freeze([
 {name:'Website',type:'SERVER_JS',path:'gas/Website.js'},
 {name:'AdminSandbox',type:'SERVER_JS',path:'gas/AdminSandbox.js'},
 {name:'AdminConsole',type:'HTML',path:'gas/AdminConsole.html'}
]);
function assertClosedWebsite(source){
 if(typeof source!=='string')throw Error('Missing Website source');
 const required=[
  "const SITE_CONTACT_ = 'lily4318@cycu.edu.tw';",
  "operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'",
  "function doGet(e){if(e&&e.parameter&&e.parameter.view==='admin'){study1AdminOwnerRequired_();",
  "HtmlService.createHtmlOutputFromFile('AdminConsole')",
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
 const expected=new Set(['study1AdminOwnerRequired_','study1AdminDefault_','study1AdminValidate_','study1AdminPersisted_','adminGetSandboxConfig','adminSaveSandboxConfig','adminValidateSandboxConfig']);
 const found=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
 if(found.length!==expected.size||found.some(x=>!expected.has(x))||new Set(found).size!==expected.size)throw Error('Unreviewed admin endpoint');
 if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|eval|deleteAllProperties|setProperties)\b/.test(source))throw Error('Forbidden research data or external operation');
}
function assertAdminHtml(html){
 if(typeof html!=='string'||!html.startsWith('<!doctype html>'))throw Error('Missing admin HTML');
 for(const token of ["google.script.run.withSuccessHandler(render)","adminGetSandboxConfig()","adminSaveSandboxConfig(data,revision)","adminValidateSandboxConfig(data)","目前不接受真人報名"])if(!html.includes(token))throw Error('Admin HTML missing safe workflow');
 if(/<script[^>]+src=|<iframe\b|\.innerHTML\s*=|\blocalStorage\b|\bfetch\s*\(/i.test(html))throw Error('Unreviewed admin HTML operation');
}
function mergeApproved(core,remote,index,website,adminScript,adminHtml){
 core.assertIndex(index);assertClosedWebsite(website);assertAdminSandbox(adminScript);assertAdminHtml(adminHtml);
 const originals=remote.files,merged=structuredClone(originals);
 const incoming=[{name:'Index',type:'HTML',source:index},{name:'Website',type:'SERVER_JS',source:website},
  {name:'AdminSandbox',type:'SERVER_JS',source:adminScript},{name:'AdminConsole',type:'HTML',source:adminHtml}];
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
module.exports={APPROVED_BACKEND,assertClosedWebsite,assertAdminSandbox,assertAdminHtml,mergeApproved};
