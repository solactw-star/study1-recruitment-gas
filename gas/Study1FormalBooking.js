/**
 * Study1 §70-S.19: ORIGINAL E1 Slots/Reservations formal V05/V08 adapter.
 * Participant self-declaration + consumed email OTP are the only eligibility
 * evidence, never an ID/student-card check. No new Sheets, public demo, data
 * migration, automatic consent, or E2 intake.
 *
 * All mutating operations use the same GAS ScriptLock and original ten-column
 * Reservations table. Sheets is not ACID: on partial writes report UNKNOWN,
 * never quietly retry, roll back or claim completion.
 */
var STUDY1_FORMAL_HOLD_MS_=10*60000;
var STUDY1_FORMAL_QUOTE_MS_=2*60000;
function study1FormalKey_(r){
 if(typeof r!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(r))
  throw Error('正式預約重送識別碼不合法');
 return r;
}
function study1FormalGate_(){
 study1WizardP0Gate_(); // PUBLIC E1 gates, not owner-only e-consent
 // Trust/REC/data-use source is independently checked by the intake gate.
 return true;
}
function study1FormalProof_(value){
 const p=study1ParticipantEmailProofRequest_(value);
 if(p.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
 return p;
}
function study1FormalAuthenticateLocked_(proof,heldLock){
 if(!heldLock||heldLock.hasLock()!==true)
  throw Error('FORMAL_BOOKING_SHARED_LOCK_REQUIRED');
 const identity=study1SelfReportedAuthority_({
  applicantId:proof.applicantId,screeningId:proof.screeningId,
  challengeId:proof.challengeId,experiment:'E1'},heldLock);
 if(identity.verifiedAtUtc!==proof.usedAtUtc||
    identity.eligibilityEvidenceSource!=='PARTICIPANT_SELF_REPORT'||
    identity.emailControlSource!=='ORIGINAL_VERIFICATION_FG'||
    study1BindingHmac_(['MAIL_HASH_V1',identity.email])!==proof.emailHash)
  throw Error('FORMAL_BOOKING_EMAIL_PROOF_CHANGED');
 return identity;
}
function study1FormalValidateSnapshot_(snapshot,nowUtc){
 const current=bookingHoldSnapshot_({readSnapshot:()=>snapshot});
 bookingReadOnlyValidateTemporalCells_(current);
 bookingReadOnlyValidateCanonicalStatuses_(current);
 bookingReadOnlyValidateTextMetadata_(current);
 bookingComputeAvailability_(current.slots.rows,current.reservations.rows,nowUtc);
 const now=study1BindingUtc_(nowUtc);
 bookingHoldAssertUniqueActiveApplicants_(current.reservations.rows,now);
 bookingHoldAssertGlobalOccupancy_(current.slots.rows,current.reservations.rows,now);
 return current;
}
function study1FormalSnapshot_(){
 // Two full independently matching read-only passes + formula checks.
 const snapshot=bookingReadOnlySnapshot_(id=>SpreadsheetApp.openById(id));
 return snapshot;
}
function study1FormalWithLock_(untrustedProof,fn){
 study1FormalGate_();
 const proof=study1FormalProof_(untrustedProof);
 const lock=LockService.getScriptLock();
 if(!lock||lock.tryLock(5000)!==true)
  throw Error('FORMAL_BOOKING_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_LOCK_LOST');
  study1FormalGate_();
  const identity=study1FormalAuthenticateLocked_(proof,lock);
  const nowUtc=new Date().toISOString(),snapshot=study1FormalSnapshot_();
  study1FormalValidateSnapshot_(snapshot,nowUtc);
  const ctx={proof,identity,nowUtc,snapshot,lock};
  const result=fn(ctx);
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_LOCK_LOST');
  return result;
 }finally{lock.releaseLock();}
}
function study1FormalSlot_(ctx,slotId){
 study1BindingId_(slotId);
 const matches=ctx.snapshot.slots.rows.filter(row=>row[0]===slotId);
 if(matches.length!==1)throw Error('SLOT_NOT_FOUND');
 const row=matches[0];
 // Registry is OWNER-reviewed, HMAC-bound, and pins the full original row.
 study1WizardSlotCheck_({slotId,experiment:'E1'},row,ctx.lock);
 if(row[5]!=='OPEN'||study1BindingUtc_(row[1])<=Date.now()||
    study1BindingUtc_(row[2])<=study1BindingUtc_(row[1]))
  throw Error('SLOT_NOT_BOOKABLE');
 return row;
}
function study1FormalQueue_(snapshot,slotId){
 // Same-millisecond entries retain original append order, not random
 // HMAC/UUID lexical ordering; that is the only auditable FIFO tie-break.
 return snapshot.reservations.rows.map((row,index)=>({row,index}))
  .filter(x=>x.row[2]===slotId&&x.row[3]==='WAITLISTED')
  .sort((a,b)=>a.row[6].localeCompare(b.row[6])||a.index-b.index)
  .map(x=>x.row);
}
function study1FormalRemaining_(ctx,row){
 return row[3]-bookingHoldCount_(ctx.snapshot.reservations.rows,
  row[0],study1BindingUtc_(ctx.nowUtc));
}
function study1FormalRowsFor_(ctx){
 return ctx.snapshot.reservations.rows.filter(x=>x[1]===ctx.identity.applicantId)
  .map(x=>({reservationId:x[0],slotId:x[2],status:x[3],
   holdUntilUtc:x[4],createdAtUtc:x[6]}));
}
function study1FormalV05Slots(emailProof){
 return study1FormalWithLock_(emailProof,ctx=>{
  // Missing/invalid registry is NOT an empty calendar: fail closed.
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('STUDY1_E1_SLOT_REGISTRY_APPROVED')!=='true')
   throw Error('SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED');
  const list=[];
  for(const row of ctx.snapshot.slots.rows){
   if(row[5]!=='OPEN'||study1BindingUtc_(row[1])<=Date.now())continue;
   try{study1WizardSlotAuthority_({slotId:row[0],experiment:'E1'},row,ctx.lock);}
   catch(error){
    if(String(error.message)==='SLOT_EXPERIMENT_MISMATCH')continue;
    throw error; // expired/HMAC-invalid/stale E1 mapping blocks output
   }
   const queue=study1FormalQueue_(ctx.snapshot,row[0]);
   const remaining=study1FormalRemaining_(ctx,row);
   list.push({slotId:row[0],startAtUtc:row[1],endAtUtc:row[2],
    capacity:row[3],remaining,waitlistCount:queue.length,
    bookable:remaining>0&&queue.length===0});
  }
  list.sort((a,b)=>a.startAtUtc.localeCompare(b.startAtUtc)||
   a.slotId.localeCompare(b.slotId));
  return {experiment:'E1',asOfUtc:ctx.nowUtc,slots:list,
   selfReportedEligible:true,emailVerified:true};
 });
}
function study1FormalQuoteHold(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,slotId')
  throw Error('V05_QUOTE_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  const slot=study1FormalSlot_(ctx,input.slotId);
  if(study1FormalRemaining_(ctx,slot)<1||
     study1FormalQueue_(ctx.snapshot,input.slotId).length)
   return {allowed:false,reason:'FULL_OR_WAITLIST'};
  const now=study1BindingUtc_(ctx.nowUtc);
  const until=Math.min(now+STUDY1_FORMAL_HOLD_MS_,
   study1BindingUtc_(slot[1])-1000);
  if(until<=now+60000)return {allowed:false,reason:'TOO_CLOSE_TO_START'};
  const document=study1EConsentReadyDocument_('E1');
  if(!document||document.experiment!=='E1'||
     !/^[a-f0-9]{64}$/.test(document.sha256||''))
   throw Error('E1_DOCUMENT_NOT_READY');
  const q={version:1,applicantId:ctx.identity.applicantId,
   screeningId:ctx.identity.screeningId,challengeId:ctx.identity.challengeId,
   experiment:'E1',slotId:slot[0],requestId:input.requestId,
   issuedAtUtc:ctx.nowUtc,
   expiresAtUtc:new Date(now+STUDY1_FORMAL_QUOTE_MS_).toISOString(),
   holdUntilUtc:new Date(until).toISOString(),
   documentSha:document.sha256,documentVersion:document.version};
  q.signature=study1BindingHmac_(['E1_V05_HOLD_QUOTE_V1',
   ctx.proof.signature,...Object.keys(q).sort().map(k=>q[k])]);
  return {allowed:true,quote:q};
 });
}
function study1FormalHoldSlot(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,quote')
  throw Error('V05_HOLD_REQUEST_INVALID');
 const quote=input.quote;
 const keys='applicantId,challengeId,documentSha,documentVersion,experiment,expiresAtUtc,holdUntilUtc,issuedAtUtc,requestId,screeningId,signature,slotId,version';
 if(!quote||Array.isArray(quote)||typeof quote!=='object'||
    Object.keys(quote).sort().join(',')!==keys||
    quote.version!==1||quote.experiment!=='E1'||
    typeof quote.signature!=='string'||!/^[a-f0-9]{64}$/.test(quote.signature))
  throw Error('V05_QUOTE_INVALID');
 const expires=study1BindingUtc_(quote.expiresAtUtc);
 const issued=study1BindingUtc_(quote.issuedAtUtc);
 study1BindingUtc_(quote.holdUntilUtc);
 study1FormalKey_(quote.requestId);
 if(expires-issued!==STUDY1_FORMAL_QUOTE_MS_||
    expires<=Date.now()||issued>Date.now())
  throw Error('V05_QUOTE_EXPIRED');
 let ok=false;
 study1FormalWithLock_(input.emailProof,ctx=>{
  if(quote.applicantId!==ctx.identity.applicantId||
     quote.screeningId!==ctx.identity.screeningId||
     quote.challengeId!==ctx.identity.challengeId)
   throw Error('V05_QUOTE_OWNER_MISMATCH');
  const untrusted={...quote};delete untrusted.signature;
  const expected=study1BindingHmac_(['E1_V05_HOLD_QUOTE_V1',
   ctx.proof.signature,...Object.keys(untrusted).sort().map(k=>untrusted[k])]);
  if(expected!==quote.signature)throw Error('V05_QUOTE_HMAC_INVALID');
  study1FormalSlot_(ctx,quote.slotId);
  const document=study1EConsentReadyDocument_('E1');
  if(document.sha256!==quote.documentSha||
     document.version!==quote.documentVersion)
   throw Error('V05_QUOTE_DOCUMENT_CHANGED');
  ok=true;
  return true;
 });
 if(!ok)throw Error('V05_QUOTE_RECHECK_FAILED');
 // Existing BookingHoldOnceLocked_ reacquires ScriptLock, globally rechecks
 // capacity/ownership/FIFO and appends exactly one original reservation row.
 return study1WizardHoldBound_({
  applicantId:quote.applicantId,screeningId:quote.screeningId,
  challengeId:quote.challengeId,experiment:'E1',slotId:quote.slotId,
  documentSha:quote.documentSha,documentVersion:quote.documentVersion,
  holdUntilUtc:quote.holdUntilUtc,requestId:quote.requestId});
}
function study1FormalManageSource_(ctx,reservationId){
 study1BindingId_(reservationId);
 const rows=ctx.snapshot.reservations.rows.filter(r=>r[0]===reservationId);
 if(rows.length!==1||rows[0][1]!==ctx.identity.applicantId)
  throw Error('V08_RESERVATION_NOT_OWNED');
 study1FormalSlot_(ctx,rows[0][2]);
 return rows[0];
}
function study1FormalSame_(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
 return a.every((v,i)=>{
  const x=Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():v;
  const y=Object.prototype.toString.call(b[i])==='[object Date]'?
   b[i].toISOString():b[i];
  return x===y;
 });
}
function study1FormalWriteExisting_(ctx,before,after){
 const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
 const tab=book.getSheetByName('Reservations');
 const ix=ctx.snapshot.reservations.rows.findIndex(r=>r[0]===before[0]);
 if(ix<0||!tab||tab.getLastColumn()!==BOOKING_RESERVATION_HEADERS_.length)
  throw Error('V08_STORAGE_CHANGED');
 const range=tab.getRange(ix+2,1,1,BOOKING_RESERVATION_HEADERS_.length);
 if(!study1FormalSame_(range.getValues()[0],before))
  throw Error('V08_CONCURRENT_CHANGE');
 if(!ctx.lock||ctx.lock.hasLock()!==true)
  throw Error('V08_LOCK_LOST');
 range.setValues([after]);
 SpreadsheetApp.flush();
 if(!study1FormalSame_(range.getValues()[0],after))
  throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 return true;
}
function study1FormalAppend_(ctx,newRow){
 const book=SpreadsheetApp.openById(study1BindingSheetId_('reservations'));
 const tab=book.getSheetByName('Reservations');
 if(!tab||tab.getLastColumn()!==BOOKING_RESERVATION_HEADERS_.length||
    tab.getLastRow()!==ctx.snapshot.reservations.rows.length+1)
  throw Error('V08_STORAGE_CHANGED');
 if(!ctx.lock||ctx.lock.hasLock()!==true)throw Error('V08_LOCK_LOST');
 tab.appendRow(newRow);SpreadsheetApp.flush();
 const row=tab.getRange(tab.getLastRow(),1,1,newRow.length).getValues()[0];
 if(!study1FormalSame_(row,newRow))throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 return true;
}
function study1FormalAfterMutation_(original,expected){
 const updated=study1FormalSnapshot_();
 study1FormalValidateSnapshot_(updated,new Date().toISOString());
 bookingHoldAssertSlotsStable_(original.slots.rows,updated.slots.rows);
 for(const [id,row] of expected){
  const matches=updated.reservations.rows.filter(r=>r[0]===id);
  if(matches.length!==1||!study1FormalSame_(matches[0],row))
   throw Error('V08_MUTATION_OUTCOME_UNKNOWN');
 }
 return updated;
}
function study1FormalStatus(emailProof){
 return study1FormalWithLock_(emailProof,ctx=>({
  experiment:'E1',asOfUtc:ctx.nowUtc,reservations:study1FormalRowsFor_(ctx)
 }));
}
function study1FormalWaitlistGate_(){
 study1FormalGate_();
 if(PropertiesService.getScriptProperties()
    .getProperty('STUDY1_E1_WAITLIST_POLICY_REVIEWED')!=='true')
  throw Error('E1_WAITLIST_POLICY_NOT_READY');
}
function study1FormalWaitlistJoin(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,slotId')
  throw Error('V08_WAITLIST_REQUEST_INVALID');
 study1FormalWaitlistGate_();study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalWaitlistGate_();
  const slot=study1FormalSlot_(ctx,input.slotId),queue=study1FormalQueue_(ctx.snapshot,input.slotId);
  const key='WQ_'+study1BindingHmac_(['E1_V08_WAITLIST_V1',
   ctx.identity.applicantId,slot[0],input.requestId]).slice(0,42);
  const existing=ctx.snapshot.reservations.rows.filter(r=>r[5]===key);
  if(existing.length>1)throw Error('V08_WAITLIST_DUPLICATE_KEY');
  if(existing.length===1){
   const r=existing[0];
   if(r[1]!==ctx.identity.applicantId||r[2]!==slot[0])
    throw Error('V08_WAITLIST_REPLAY_CHANGED');
   return {joined:r[3]==='WAITLISTED',status:r[3],
    reservationId:r[0],reason:'REPLAY'};
  }
  const mine=ctx.snapshot.reservations.rows.filter(r=>r[1]===ctx.identity.applicantId);
  if(mine.some(r=>r[3]==='WAITLISTED'))
   return {joined:false,reason:'EXISTING_WAITLIST'};
  if(mine.some(r=>r[2]===slot[0]&&
     bookingHoldActive_(r,study1BindingUtc_(ctx.nowUtc))))
   return {joined:false,reason:'ALREADY_BOOKED'};
  if(study1FormalRemaining_(ctx,slot)>0&&queue.length===0)
   return {joined:false,reason:'SEAT_AVAILABLE'};
  const reservationId='RSV_'+study1BindingHmac_([
   'E1_V08_WAITLIST_ROW_V1',ctx.identity.applicantId,slot[0],key]).slice(0,28);
  if(ctx.snapshot.reservations.rows.some(r=>r[0]===reservationId))
   throw Error('V08_RESERVATION_ID_COLLISION');
  const row=[reservationId,ctx.identity.applicantId,slot[0],'WAITLISTED',
   '',key,ctx.nowUtc,'','',ctx.nowUtc];
  study1FormalAppend_(ctx,row);
  study1FormalAfterMutation_(ctx.snapshot,[[reservationId,row]]);
  return {joined:true,status:'WAITLISTED',reservationId,
   position:queue.length+1,reason:'CREATED'};
 });
}
function study1FormalWaitlistClaim(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,reservationId')
  throw Error('V08_WAITLIST_CLAIM_INVALID');
 study1FormalWaitlistGate_();study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  study1FormalWaitlistGate_();
  const r=study1FormalManageSource_(ctx,input.reservationId);
  if(r[3]==='HELD'&&study1BindingUtc_(r[4])>Date.now())
   return {held:true,reason:'ALREADY_CLAIMED',reservationId:r[0],holdUntilUtc:r[4]};
  if(r[3]!=='WAITLISTED')return {held:false,reason:'NOT_WAITLISTED'};
  const head=study1FormalQueue_(ctx.snapshot,r[2])[0];
  if(!head||head[0]!==r[0])return {held:false,reason:'WAITLIST_FIFO'};
  const slot=study1FormalSlot_(ctx,r[2]);
  if(study1FormalRemaining_(ctx,slot)<1)
   return {held:false,reason:'FULL'};
  if(ctx.snapshot.reservations.rows.some(x=>
     x[1]===ctx.identity.applicantId&&x[0]!==r[0]&&
     bookingHoldActive_(x,study1BindingUtc_(ctx.nowUtc))))
   return {held:false,reason:'EXISTING_ACTIVE_HOLD'};
  const now=study1BindingUtc_(ctx.nowUtc);
  const until=Math.min(now+STUDY1_FORMAL_HOLD_MS_,
   study1BindingUtc_(slot[1])-1000);
  if(until<=now+60000)return {held:false,reason:'TOO_CLOSE_TO_START'};
  const after=r.slice();after[3]='HELD';
  after[4]=new Date(until).toISOString();after[9]=ctx.nowUtc;
  study1FormalWriteExisting_(ctx,r,after);
  study1FormalAfterMutation_(ctx.snapshot,[[r[0],after]]);
  return {held:true,reason:'CLAIMED',reservationId:r[0],
   slotId:r[2],holdUntilUtc:after[4]};
 });
}
function study1FormalCancel(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='emailProof,requestId,reservationId')
  throw Error('V08_CANCEL_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  const r=study1FormalManageSource_(ctx,input.reservationId);
  if(r[3]==='CANCELLED')return {cancelled:true,reason:'ALREADY_CANCELLED',
   reservationId:r[0],status:'CANCELLED'};
  if(r[3]!=='WAITLISTED'&&
     !(r[3]==='HELD'&&study1BindingUtc_(r[4])>Date.now()))
   return {cancelled:false,reason:'NOT_CANCELLABLE'};
  // Confirmed attendance and study participation are deliberately excluded.
  const after=r.slice();after[3]='CANCELLED';after[8]=ctx.nowUtc;
  after[9]=ctx.nowUtc;
  study1FormalWriteExisting_(ctx,r,after);
  study1FormalAfterMutation_(ctx.snapshot,[[r[0],after]]);
  return {cancelled:true,reason:'CANCELLED',reservationId:r[0],
   status:'CANCELLED'};
 });
}
function study1FormalMove(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==
    'emailProof,newSlotId,requestId,reservationId')
  throw Error('V08_MOVE_REQUEST_INVALID');
 study1FormalKey_(input.requestId);
 return study1FormalWithLock_(input.emailProof,ctx=>{
  const previous=study1FormalManageSource_(ctx,input.reservationId);
  const target=study1FormalSlot_(ctx,input.newSlotId);
  if(previous[2]===target[0])return {moved:false,reason:'UNCHANGED'};
  const key='MV_'+study1BindingHmac_(['E1_V08_MOVE_V1',
   ctx.identity.applicantId,previous[0],target[0],input.requestId]).slice(0,42);
  const newId='RSV_'+study1BindingHmac_([
   'E1_V08_MOVE_ROW_V1',ctx.identity.applicantId,previous[0],key]).slice(0,28);
  const already=ctx.snapshot.reservations.rows.filter(r=>r[5]===key);
  if(already.length>1)throw Error('V08_MOVE_DUPLICATE_KEY');
  if(already.length===1){
   const r=already[0];
   if(r[0]!==newId||r[1]!==ctx.identity.applicantId||
      previous[3]!=='CANCELLED')
    throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');
   return {moved:r[3]==='HELD',reason:'REPLAY',
    reservationId:newId,slotId:target[0],holdUntilUtc:r[4]};
  }
  if(previous[3]==='CANCELLED')
   throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');
  if(previous[3]!=='HELD'||
     study1BindingUtc_(previous[4])<=Date.now())
   return {moved:false,reason:'NOT_ACTIVE_HELD'};
  if(study1FormalQueue_(ctx.snapshot,target[0]).length)
   return {moved:false,reason:'WAITLIST_FIFO'};
  if(study1FormalRemaining_(ctx,target)<1)
   return {moved:false,reason:'FULL'};
  if(study1BindingUtc_(previous[4])>study1BindingUtc_(target[1]))
   return {moved:false,reason:'HOLD_EXTENDS_PAST_START'};
  const oldCancelled=previous.slice();
  oldCancelled[3]='CANCELLED';oldCancelled[8]=ctx.nowUtc;oldCancelled[9]=ctx.nowUtc;
  const newRow=[newId,ctx.identity.applicantId,target[0],
   'HELD',previous[4],key,ctx.nowUtc,'','',ctx.nowUtc];
  if(ctx.snapshot.reservations.rows.some(x=>x[0]===newId))
   throw Error('V08_RESERVATION_ID_COLLISION');
  // Two Sheet mutations are not ACID. If append fails after cancellation,
  // report PARTIAL/UNKNOWN and require manual reconciliation, never re-run.
  study1FormalWriteExisting_(ctx,previous,oldCancelled);
  try{study1FormalAppend_(ctx,newRow);}
  catch(_){throw Error('V08_MUTATION_PARTIAL_REQUIRES_REVIEW');}
  study1FormalAfterMutation_(ctx.snapshot,[[previous[0],oldCancelled],[newId,newRow]]);
  return {moved:true,reason:'MOVED',
   reservationId:newId,slotId:target[0],holdUntilUtc:newRow[4]};
 });
}


/**
 * §70-S.23: OWNER-only, post-dual-PDF ORIGINAL Reservations completion.
 * The signed consent registry is stored separately from the operations Sheet:
 * NEVER confirm the seat before the independent PDF registry has committed.
 * Afterward, recheck the complete source under the shared ScriptLock, then
 * CAS only that existing HELD row to CONFIRMED, and read it back. A failure
 * leaves a real signed PDF intact but booking status explicitly unconfirmed.
 * This is a deliberately one-way, idempotent repairable transaction; it does
 * NOT change the HELD/quote policy or silently resurrect expired bookings.
 */
function study1FormalFinalizeSignedE1Booking_(consentId,capabilityToken){
 // OWNER can reconcile legacy records; a valid participant token can only
 // close its own already-signed, owner-uploaded pre-signed E1 PDF transaction.
 const participantPath=typeof capabilityToken==='string';
 if(!participantPath)study1AdminOwnerRequired_();
 study1FormalConsentGate_();
 study1BindingId_(consentId);
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('FORMAL_BOOKING_FINALIZE_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_FINALIZE_LOCK_LOST');
  if(!participantPath)study1AdminOwnerRequired_();
  study1FormalConsentGate_();
  const registry=study1EConsentRegistry_();
  const matches=registry.records.filter(x=>x.id===consentId);
  if(matches.length!==1)throw Error('FORMAL_BOOKING_CONSENT_NOT_UNIQUE');
  const entry=matches[0],bound=entry.binding;
  const researcherPreSigned=entry.researcherPresigned===true;
  if(participantPath){
   const holder=study1EConsentEntry_(capabilityToken,registry);
   if(holder.id!==entry.id||holder.tokenHash!==entry.tokenHash||
      !researcherPreSigned)throw Error('FORMAL_BOOKING_OWNER_OR_SELF_TOKEN_REQUIRED');
  }
  if(entry.state!=='CONFIRMED'||entry.channel!=='FORMAL_E1'||
     entry.experiment!=='E1'||!bound||bound.experiment!=='E1'||
     !entry.signature||!entry.confirmation||!entry.participantSignedPdf||
     !entry.signedPdf)
   throw Error('FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED');
  const doc=study1EConsentReadyDocument_('E1');
  const rec=study1FormalConsentRecScope_();
  if(researcherPreSigned&&doc.researcherPresigned!==true)
   throw Error('FORMAL_BOOKING_RESEARCHER_PRESIGNED_SOURCE_CHANGED');
  if(doc.id!==rec.consentDocumentId||
     doc.sha256!==rec.consentDocumentSha256||
     doc.sha256!==entry.documentSha||doc.version!==entry.documentVersion||
     bound.documentSha!==doc.sha256||bound.documentVersion!==doc.version||
     study1BindingDigest_(bound)!==bound.digest)
   throw Error('FORMAL_BOOKING_CONSENT_SOURCE_CHANGED');
  const signature=study1EConsentEvent_(entry.signature,entry,'SIGNATURE').data;
  const confirmation=study1EConsentEvent_(entry.confirmation,entry,'CONFIRMATION').data;
  if(researcherPreSigned&&
     (confirmation.mode!=='RESEARCHER_PRESIGNED_SOURCE'||
      confirmation.researcherSignedSourceSha256!==entry.documentSha||
      entry.participantSignedPdf.id!==entry.signedPdf.id))
   throw Error('FORMAL_BOOKING_PRESIGNED_SOURCE_EVIDENCE_MISMATCH');
  if(signature.signedPdfSha256!==entry.participantSignedPdf.sha||
     confirmation.signatureHash!==entry.signature.sha||
     confirmation.participantSignedPdfSha256!==entry.participantSignedPdf.sha||
     confirmation.researcherSignedPdfSha256!==entry.signedPdf.sha)
   throw Error('FORMAL_BOOKING_DUAL_PDF_HASH_MISMATCH');
  study1EConsentSignedPdfRead_(entry.participantSignedPdf,entry);
  study1EConsentSignedPdfRead_(entry.signedPdf,entry);
  const nowUtc=new Date().toISOString(),snapshot=study1FormalSnapshot_();
  study1FormalValidateSnapshot_(snapshot,nowUtc);
  const originals=snapshot.reservations.rows.filter(r=>r[0]===bound.reservationId);
  if(originals.length!==1)throw Error('FORMAL_BOOKING_ORIGINAL_RESERVATION_NOT_UNIQUE');
  const original=originals[0],ctx={snapshot,nowUtc,lock};
  if(original[1]!==bound.applicantId||original[2]!==bound.slotId)
   throw Error('FORMAL_BOOKING_IDENTITY_SLOT_CHANGED');
  // The same PI-signed original E1 slot row remains the only authority.
  study1FormalSlot_(ctx,original[2]);
  if(original[3]==='CONFIRMED'){
   if(!original[7]||original[8])
    throw Error('FORMAL_BOOKING_CONFIRMATION_INCONSISTENT');
   return {bookingConfirmed:true,reason:'ALREADY_CONFIRMED',
    reservationId:original[0],bookingStatus:'CONFIRMED',readOnlyReplay:true};
  }
  if(original[3]!=='HELD'||study1BindingUtc_(original[4])<=Date.now())
   throw Error('FORMAL_BOOKING_HELD_EXPIRED_OR_CHANGED');
  // Verify the actual self-reported applicant and consumed Email OTP afresh.
  const adapter=study1EConsentBindingAdapter_('PUBLIC_E1');
  study1BindingRecheck_(bound,doc,adapter,nowUtc,lock);
  if(lock.hasLock()!==true)throw Error('FORMAL_BOOKING_FINALIZE_LOCK_LOST');
  const changed=original.slice();
  changed[3]='CONFIRMED';changed[7]=nowUtc;changed[9]=nowUtc;
  study1FormalWriteExisting_(ctx,original,changed);
  study1FormalAfterMutation_(snapshot,[[original[0],changed]]);
  return {bookingConfirmed:true,reason:'CONFIRMED_AFTER_DUAL_PDF',
   reservationId:original[0],bookingStatus:'CONFIRMED',readOnlyReplay:false};
 }finally{lock.releaseLock();}
}


/**
 * OWNER-only E1 signed-PDF/booking status audit. No writes, owner-only IDs
 * and no claim of booked seating based solely on a CONFIRMED consent event.
 * Uses the ORIGINAL doubly-read Reservations snapshot and existing validator.
 */
function study1OwnerE1ConsentBookingAudit(){
 study1AdminOwnerRequired_();
 const lock=LockService.getScriptLock();
 if(!lock||typeof lock.tryLock!=='function'||lock.tryLock(10000)!==true)
  throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_BUSY');
 try{
  if(lock.hasLock()!==true)throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_LOST');
  study1AdminOwnerRequired_();
  const registry=study1EConsentRegistry_();
  const snapshot=study1FormalSnapshot_(),asOfUtc=new Date().toISOString();
  study1FormalValidateSnapshot_(snapshot,asOfUtc);
  if(!snapshot||!snapshot.reservations||
     !Array.isArray(snapshot.reservations.rows)||
     !Array.isArray(registry.records)||
     !Number.isSafeInteger(registry.revision))
   throw Error('OWNER_E1_BOOKING_AUDIT_SOURCE_INVALID');
  const matched=new Map();
  for(const row of snapshot.reservations.rows){
   if(!Array.isArray(row)||row.length!==10||typeof row[0]!=='string')
    throw Error('OWNER_E1_BOOKING_AUDIT_ROW_INVALID');
   const group=matched.get(row[0])||[];
   group.push(row);matched.set(row[0],group);
  }
  const records=registry.records.filter(x=>x&&x.channel==='FORMAL_E1'&&
   x.experiment==='E1').map(x=>{
    const unknown={id:x.id,bookingStatus:'UNKNOWN',bookingConfirmed:false};
    const b=x.binding;
    if(!b||b.experiment!=='E1'||typeof b.reservationId!=='string'||
       typeof b.applicantId!=='string'||typeof b.slotId!=='string')
     return unknown;
    const found=matched.get(b.reservationId)||[];
    if(found.length!==1)return unknown;
    const row=found[0];
    if(row[1]!==b.applicantId||row[2]!==b.slotId)return unknown;
    if(row[3]==='CONFIRMED'){
     if(typeof row[7]!=='string'||!row[7]||row[8])
      return unknown;
     return {id:x.id,bookingStatus:'CONFIRMED',bookingConfirmed:true};
    }
    if(row[3]==='HELD'){
     const heldUntil=study1BindingUtc_(row[4]);
     return {id:x.id,bookingStatus:heldUntil>Date.now()?'HELD':'EXPIRED',
      bookingConfirmed:false};
    }
    if(row[3]==='CANCELLED')
     return {id:x.id,bookingStatus:'CANCELLED',bookingConfirmed:false};
    return unknown;
   });
  if(lock.hasLock()!==true)throw Error('OWNER_E1_BOOKING_AUDIT_LOCK_LOST');
  return {readOnly:true,source:'ORIGINAL_RESERVATIONS',
   consentRevision:registry.revision,asOfUtc,records};
 }finally{lock.releaseLock();}
}
