'use strict';
// Closed-only reviewed backend source gate. No live Sheets, OTP, or consent operations.
const APPROVED_BACKEND = Object.freeze([{name:'Website',type:'SERVER_JS',path:'gas/Website.js'}]);
function assertClosedWebsite(source) {
  if(typeof source!=='string') throw Error('Missing Website source');
  const required=[
    "const SITE_CONTACT_ = 'lily4318@cycu.edu.tw';",
    "operations:'1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ'",
    'function doGet()',
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
  for(const token of required) if(!source.includes(token)) throw Error('CLOSED Website guard changed: '+token);
  const allowed=new Set(['doGet','getPublicConfig','rejectIntake_','requestOtp',
    'verifyOtp','holdSlot','cancelHold','submitConsent','listSlots','setOpen_',
    'initializeClosedSystem_','runClosedChecks_']);
  const functions=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
  if(functions.length!==allowed.size||new Set(functions).size!==functions.length||
    functions.some(name=>!allowed.has(name))) throw Error('Unreviewed Website server entry point');
  if(/\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp|ScriptApp|eval)\b/.test(source))
    throw Error('Live data or external operation in CLOSED Website');
}
function mergeApproved(core,remote,index,website) {
  core.assertIndex(index);assertClosedWebsite(website);
  const original=remote.files,merged=core.merge(remote,index);
  core.file(merged,'Website','SERVER_JS').source=website;
  const keep=files=>files.filter(f=>f.name!=='Index'&&f.name!=='Website');
  if(core.digest(keep(merged))!==core.digest(keep(original)))
    throw Error('Unapproved GAS source changed');
  return merged;
}
module.exports={APPROVED_BACKEND,assertClosedWebsite,mergeApproved};
