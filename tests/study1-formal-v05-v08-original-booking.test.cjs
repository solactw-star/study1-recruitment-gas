'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 crypto=require('node:crypto');
const scripts=['BookingCore.js','BookingHoldTransaction.js','BookingReadOnlySheet.js',
 'Study1EConsentBinding.js','Study1ParticipantIntake.js','Study1WizardP0Bridge.js',
 'Study1FormalBooking.js'].map(name=>
  fs.readFileSync(path.join(__dirname,'../gas',name),'utf8')).join('\n');
const P='1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI',
 O='1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ';
const ts=(t,n)=>new Date(t+n).toISOString();
function harness(){
 const t=Date.now(),secret=crypto.randomBytes(48).toString('hex');
 const S1='SLOT_E1_12345678',S2='SLOT_E1_87654321',
  S3='SLOT_E2_22222222';
 let held=false,failAppend=false,intercept=null,seq=0,mutations=[];
 const props=new Map([
  ['STUDY1_ECONSENT_BINDING_HMAC_KEY',secret],
  ['STUDY1_WIZARD_P0_SHEET_HOLD_VERIFIED','true'],
  ['STUDY1_E1_SELF_REPORT_OTP_SOURCE_VERIFIED','true'],
  ['STUDY1_E1_BOOKING_APPROVED','true'],
  ['STUDY1_E1_SLOT_REGISTRY_APPROVED','true'],
  ['STUDY1_E1_WAITLIST_POLICY_REVIEWED','true']
 ]);
 const tables={
  Slots:{headers:['slot_id','start_at_utc','end_at_utc','capacity','location_code',
   'status','created_by','updated_at_utc'],
   rows:[[S1,ts(t,4*3600000),ts(t,5*3600000),1,'E1_ROOM','OPEN','REVIEWED_OWNER',''],
    [S2,ts(t,6*3600000),ts(t,7*3600000),1,'E1_ROOM_2','OPEN','REVIEWED_OWNER',''],
    [S3,ts(t,7*3600000),ts(t,8*3600000),1,'E2_ROOM','OPEN','REVIEWED_OWNER','']]},
  Reservations:{headers:['reservation_id','applicant_id','slot_id','status','hold_until_utc',
   'idempotency_key','created_at_utc','confirmed_at_utc','cancelled_at_utc','updated_at_utc'],
   rows:[]},
  Applicants:{headers:['applicant_id','name','email','phone','created_at_utc',
   'updated_at_utc','status'],rows:[]},
  Screenings:{headers:['screening_id','applicant_id','rules_version','eligibility_result',
   'screened_at_utc','verified_by'],rows:[]},
  Verification:{headers:['challenge_id','applicant_id','purpose','otp_hmac',
   'expires_at_utc','attempts','used_at_utc','email','created_at_utc'],rows:[]}
 };
 let personRecords=new Map();
 function person(label){
  const appId='APP_TEST_'+label+'12345678',
   screenId='SCR_TEST_'+label+'12345678',
   challengeId='CHL_TEST_'+label+'12345678',
   email='synthetic.'+label.toLowerCase()+'@example.org',
   created=ts(t,-1200000),screened=ts(t,-900000),
   challengeAt=ts(t,-300000),used=ts(t,-120000);
  tables.Applicants.rows.push([appId,'合成測試',email,'',
   created,ts(t,-110000),'EMAIL_VERIFIED']);
  tables.Screenings.rows.push([screenId,appId,'E1_TEST_V1','ELIGIBLE',
   screened,'PARTICIPANT_SELF_REPORT']);
  tables.Verification.rows.push([challengeId,appId,'EMAIL_VERIFICATION',
   'b'.repeat(64),ts(t,180000),1,used,email,challengeAt]);
  const id={applicantId:appId,screeningId:screenId,
   challengeId,experiment:'E1',verified:true,
   provenance:'STUDY1_E1_SELF_REPORT_OTP_HMAC',
   eligibilityEvidenceSource:'PARTICIPANT_SELF_REPORT',
   emailControlSource:'ORIGINAL_VERIFICATION_FG',
   eligibilityEvidenceSha256:crypto.createHash('sha256').update('elig'+label).digest('hex'),
   evidenceSha256:crypto.createHash('sha256').update('mail'+label).digest('hex'),
   screeningVersion:'E1_TEST_V1',email,verifiedAtUtc:used};
  personRecords.set(appId,id);
  return id;
 }
 function book(id){
  const allowed=id===P?['Applicants','Screenings','Verification']:['Slots','Reservations'];
  if(![P,O].includes(id))throw Error('UNKNOWN_SHEET');
  return {getId:()=>id,getSheetByName:name=>{
   if(!allowed.includes(name))return null;
   const table=tables[name];
   return {getLastRow:()=>table.rows.length+1,
    getLastColumn:()=>table.headers.length,
    getRange:(start,col,height,width)=>{
     if(start<1||col<1||height<1||width<1)throw Error('INVALID_RANGE');
     return {getValues:()=>Array.from({length:height},(_,i)=>{
      const row=start+i===1?table.headers:table.rows[start+i-2];
      if(!row)throw Error('READ_PAST_END');
      return row.slice(col-1,col+width-1);
     }),getFormulas:()=>Array.from({length:height},()=>Array(width).fill('')),
     createTextFinder:term=>{
      let entire=false,sensitive=true,regex=true;
      const finder={matchEntireCell(value){entire=value;return finder;},
       matchCase(value){sensitive=value;return finder;},
       useRegularExpression(value){regex=value;return finder;},
       findAll(){
        assert.equal(entire,true);assert.equal(regex,false);
        const matching=[];
        for(let row=start;row<start+height;row++){
         const cells=row===1?table.headers:table.rows[row-2];
         if(!cells)continue;
         const value=cells[col-1];
         const equal=sensitive?value===term:String(value).toLowerCase()===String(term).toLowerCase();
         if(equal)matching.push({getRow:()=>row,getColumn:()=>col});
        }
        return matching;
       }};
      return finder;
     },
     setValues:grid=>{
      if(!held)throw Error('UNLOCKED_MUTATION');
      if(intercept){const fn=intercept;intercept=null;fn()}
      for(let i=0;i<height;i++){
       const row=table.rows[start+i-2];
       if(!row)throw Error('WRITE_PAST_END');
       for(let j=0;j<width;j++)row[col+j-1]=grid[i][j];
      }
      mutations.push({name,method:'set',start,col});
     }};
    },
    appendRow:row=>{
     if(!held)throw Error('UNLOCKED_APPEND');
     if(failAppend){failAppend=false;throw Error('SYNTHETIC_APPEND_FAILURE');}
     if(intercept){const fn=intercept;intercept=null;fn()}
     table.rows.push(row.slice());
     mutations.push({name,method:'append',row:row.slice()});
    }};
  }};
 }
 const locks={getScriptLock:()=>{
  let owned=false;
  return {tryLock:()=>{if(held)return false;held=true;owned=true;return true},
   hasLock:()=>owned&&held,
   releaseLock:()=>{if(owned)held=false;owned=false}};
 }};
 const clock={now:t};
 class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[clock.now]))}
  static now(){return clock.now}
 }
 const ctx=vm.createContext({
  Date:FixedDate,JSON,Array,Object,Math,Number,String,Boolean,Set,Error,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null})},
  Utilities:{Charset:{UTF_8:'UTF-8'},
   getUuid:()=> '00000000-1111-4222-8333-'+String(++seq).padStart(12,'0'),
   computeHmacSha256Signature:(text,key)=>
    [...crypto.createHmac('sha256',key).update(text).digest()]},
  LockService:locks,
  SITE_RESOURCES_:{personal:P,operations:O},
  SpreadsheetApp:{openById:book,flush:()=>mutations.push({method:'flush'})}
 });
 vm.runInContext(scripts,ctx,{timeout:4500});
 ctx.study1ParticipantGate_=()=>{if(props.get('OPEN')==='false')
  throw Error('PARTICIPANT_INTAKE_NOT_READY');return true;};
 ctx.study1ParticipantRecPolicy_=()=>({screeningVersion:'E1_TEST_V1',documentSha256:'a'.repeat(64)});
 ctx.study1ParticipantVerifiedPolicy_=v=>v;
 ctx.study1SelfReportedAuthority_=(r,lock)=>{
  assert.equal(lock.hasLock(),true,'exact acquired Lock object required');
  if(r.experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  const stored=personRecords.get(r.applicantId);
  if(!stored||stored.screeningId!==r.screeningId||
     stored.challengeId!==r.challengeId)throw Error('SELF_REPORT_EMAIL_OTP_EVIDENCE_INVALID');
  return {...stored};
 };
 ctx.study1EConsentReadyDocument_=(experiment)=>{
  if(experiment!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  return {experiment:'E1',version:'REC_V02',sha256:'a'.repeat(64)};
 };
 ctx.study1ParticipantEmailProofRequest_=proof=>{
  if(!proof||proof.experiment!=='E1'||proof.expiresAtUtc<=new Date(clock.now).toISOString())
   throw Error('EMAIL_PROOF_EXPIRED');
  return proof;
 };
 const entries=tables.Slots.rows.map(row=>({
  experiment:row[0]===S3?'E2':'E1',slotId:row[0],
  slotRowSha256:ctx.study1BindingHmac_(['STUDY1_E1_ORIGINAL_SLOT_ROW_V1',...row])
 }));
 const raw=JSON.stringify(entries);
 props.set('STUDY1_E1_SLOT_REGISTRY_V1',raw);
 props.set('STUDY1_E1_SLOT_REGISTRY_HMAC',ctx.study1BindingHmac_(['STUDY1_E1_SLOT_REGISTRY_V1',raw]));
 function proof(id){
  return {version:1,applicantId:id.applicantId,screeningId:id.screeningId,
   challengeId:id.challengeId,experiment:'E1',emailHash:ctx.study1BindingHmac_([
    'MAIL_HASH_V1',id.email]),usedAtUtc:id.verifiedAtUtc,
   expiresAtUtc:ts(clock.now,1800000),signature:'c'.repeat(64)};
 }
 function holdSlot(p,slotId,requestId='REQ_HOLD_1234567890'){
  const q=ctx.study1FormalQuoteHold({emailProof:p,slotId,requestId});
  if(!q.allowed)return q;
  return ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 }
 return {ctx,tables,props,person,proof,holdSlot,S1,S2,S3,clock,
  mutations,locks,get held(){return held},
  set intercept(x){intercept=x},
  set failAppend(x){failAppend=x}};
}
test('V05 verified E1 registry returns only true E1 slots and exact seat counts',()=>{
 const h=harness(),p=h.proof(h.person('A'));
 const r=h.ctx.study1FormalV05Slots(p);
 assert.equal(r.experiment,'E1');
 assert.deepEqual(Array.from(r.slots,x=>x.slotId),[h.S1,h.S2]);
 assert.ok(r.slots.every(x=>x.capacity===1&&x.remaining===1&&x.bookable===true));
 assert.equal(h.tables.Reservations.rows.length,0);
});
test('V05 original booking quote + HMAC emits exactly one HELD row and safe replay',()=>{
 const h=harness(),p=h.proof(h.person('A'));
 const q=h.ctx.study1FormalQuoteHold({emailProof:p,slotId:h.S1,
  requestId:'REQ_HOLD_1234567890'});
 assert.equal(q.allowed,true);
 assert.match(q.quote.signature,/^[a-f0-9]{64}$/);
 assert.throws(()=>h.ctx.study1FormalHoldSlot({emailProof:p,quote:{
  ...q.quote,slotId:h.S2}}),/V05_QUOTE_HMAC_INVALID/);
 const result=h.ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 assert.equal(result.held,true);
 assert.equal(h.tables.Reservations.rows.length,1);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 const again=h.ctx.study1FormalHoldSlot({emailProof:p,quote:q.quote});
 assert.equal(again.reason,'REPLAY');
 assert.equal(h.tables.Reservations.rows.length,1);
 assert.equal(h.ctx.study1FormalV05Slots(p).slots[0].remaining,0);
});
test('V08 original WAITLISTED is not occupied and FIFO gets released seat',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B')),
  c=h.proof(h.person('C'));
 const held=h.holdSlot(a,h.S1);
 assert.equal(held.held,true);
 const first=h.ctx.study1FormalWaitlistJoin({emailProof:b,slotId:h.S1,
  requestId:'REQ_WAIT_B_1234567890'});
 assert.equal(first.joined,true);assert.equal(first.position,1);
 const second=h.ctx.study1FormalWaitlistJoin({emailProof:c,slotId:h.S1,
  requestId:'REQ_WAIT_C_1234567890'});
 assert.equal(second.position,2);
 assert.equal(h.tables.Reservations.rows.filter(r=>r[3]==='WAITLISTED').length,2);
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
 const canceled=h.ctx.study1FormalCancel({emailProof:a,
  reservationId:held.reservationId,requestId:'REQ_CANCEL_A_1234567890'});
 assert.equal(canceled.cancelled,true);
 const slots=h.ctx.study1FormalV05Slots(b).slots;
 assert.equal(slots[0].remaining,1);
 assert.equal(slots[0].bookable,false,'direct holds cannot bypass queued participant');
 assert.equal(h.ctx.study1FormalWaitlistClaim({emailProof:c,
  reservationId:second.reservationId,requestId:'REQ_CLAIM_C_1234567890'}).reason,
  'WAITLIST_FIFO');
 const claim=h.ctx.study1FormalWaitlistClaim({emailProof:b,
  reservationId:first.reservationId,requestId:'REQ_CLAIM_B_1234567890'});
 assert.equal(claim.held,true);assert.equal(claim.reason,'CLAIMED');
 assert.equal(h.tables.Reservations.rows.find(r=>r[0]===first.reservationId)[3],'HELD');
 assert.equal(h.tables.Reservations.rows.length,3,'claim reuses same reservation row');
 assert.equal(h.ctx.study1FormalV05Slots(b).slots[0].remaining,0);
});
test('V08 move persists old CANCELLED row + new HELD row, preserves expiry and replay',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 const original=h.holdSlot(a,h.S1),before=h.tables.Reservations.rows[0].slice();
 const input={emailProof:a,reservationId:original.reservationId,
  newSlotId:h.S2,requestId:'REQ_MOVE_A_1234567890'};
 const moved=h.ctx.study1FormalMove(input);
 assert.equal(moved.moved,true);assert.equal(moved.slotId,h.S2);
 assert.equal(h.tables.Reservations.rows.length,2);
 assert.equal(h.tables.Reservations.rows[0][3],'CANCELLED');
 assert.equal(h.tables.Reservations.rows[1][3],'HELD');
 assert.equal(h.tables.Reservations.rows[1][4],before[4]);
 assert.equal(h.ctx.study1FormalMove(input).reason,'REPLAY');
 assert.equal(h.tables.Reservations.rows.length,2);
 const cancel=h.ctx.study1FormalCancel({emailProof:a,
  reservationId:moved.reservationId,requestId:'REQ_CANCEL_A_9876543210'});
 assert.equal(cancel.status,'CANCELLED');
 assert.equal(h.tables.Reservations.rows[1][8],h.tables.Reservations.rows[1][9]);
 assert.equal(h.ctx.study1FormalCancel({emailProof:a,
  reservationId:moved.reservationId,requestId:'REQ_CANCEL_A_9876543210'}).reason,
  'ALREADY_CANCELLED');
});
test('Wrong experiment mapping and E2 cannot be booked or joined',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 assert.throws(()=>h.ctx.study1FormalQuoteHold({emailProof:a,
  slotId:h.S3,requestId:'REQ_HOLD_E2_1234567890'}),/SLOT_EXPERIMENT_MISMATCH/);
 assert.throws(()=>h.ctx.study1FormalWaitlistJoin({emailProof:a,
  slotId:h.S3,requestId:'REQ_WAIT_E2_1234567890'}),/SLOT_EXPERIMENT_MISMATCH/);
 a.experiment='E2';
 assert.throws(()=>h.ctx.study1FormalV05Slots(a),/EMAIL_PROOF_EXPIRED/);
 assert.equal(h.tables.Reservations.rows.length,0);
});
test('Closed gates, wrong applicant, stale slot HMAC, and revoked FIFO block mutations',()=>{
 const h=harness(),a=h.proof(h.person('A')),b=h.proof(h.person('B'));
 const booked=h.holdSlot(a,h.S1);
 assert.throws(()=>h.ctx.study1FormalCancel({emailProof:b,
  reservationId:booked.reservationId,requestId:'REQ_CANCEL_B_1234567890'}),
  /V08_RESERVATION_NOT_OWNED/);
 h.props.set('STUDY1_E1_SLOT_REGISTRY_HMAC','0'.repeat(64));
 assert.throws(()=>h.ctx.study1FormalV05Slots(a),/SLOT_REGISTRY_TAMPERED/);
 h.props.set('STUDY1_E1_SLOT_REGISTRY_APPROVED','false');
 assert.throws(()=>h.ctx.study1FormalQuoteHold({emailProof:a,
  slotId:h.S2,requestId:'REQ_HOLD_A_9999999999'}),/SLOT_EXPERIMENT_SOURCE_NOT_CONFIGURED/);
 h.props.set('OPEN','false');
 assert.throws(()=>h.ctx.study1FormalStatus(a),/PARTICIPANT_INTAKE_NOT_READY/);
 assert.equal(h.tables.Reservations.rows.length,1);
});
test('V08 rejects concurrent mutation of same ScriptLock and never makes second row',()=>{
 const h=harness(),a=h.proof(h.person('A'));
 const original=h.holdSlot(a,h.S1);
 h.intercept=()=>assert.throws(()=>h.ctx.study1FormalCancel({
  emailProof:a,reservationId:original.reservationId,
  requestId:'REQ_CONCURRENT_CANCEL_12'}),/FORMAL_BOOKING_LOCK_BUSY/);
 const moved=h.ctx.study1FormalMove({emailProof:a,
  reservationId:original.reservationId,newSlotId:h.S2,
  requestId:'REQ_MOVE_CONCURRENT_123456'});
 assert.equal(moved.moved,true);
 assert.equal(h.tables.Reservations.rows.length,2);
});
test('V08 partial move failure never claims success, never retries destructive step',()=>{
 const h=harness(),a=h.proof(h.person('A')),held=h.holdSlot(a,h.S1);
 h.failAppend=true;
 assert.throws(()=>h.ctx.study1FormalMove({emailProof:a,
  reservationId:held.reservationId,newSlotId:h.S2,
  requestId:'REQ_MOVE_PARTIAL_123456789'}),/V08_MUTATION_PARTIAL_REQUIRES_REVIEW/);
 assert.equal(h.tables.Reservations.rows[0][3],'CANCELLED');
 assert.equal(h.tables.Reservations.rows.length,1);
});


/**
 * Synthetic OWNER researcher's online second signature has already committed
 * in a separate immutable PDF registry. Its consent state NEVER by itself
 * grants a seat: only this second original Reservations CAS can do that.
 */
function signedConsentFixture(h,person,held){
 const consentId='CONSENT_E1_ONLINE_12345678',docId='REC_SYNTH_DOC_12345678';
 const row=h.tables.Reservations.rows.find(r=>r[0]===held.reservationId);
 const binding={
  schemaVersion:1,applicantId:person.applicantId,reservationId:row[0],
  slotId:row[2],challengeId:person.challengeId,screeningId:person.screeningId,
  experiment:'E1',documentSha:'a'.repeat(64),documentVersion:'REC_V02',
  identityEvidenceSha:person.evidenceSha256,
  eligibilityEvidenceSha:person.eligibilityEvidenceSha256,
  priorE1EvidenceSha:'',verifiedAtUtc:person.verifiedAtUtc,
  otpUsedAtUtc:person.verifiedAtUtc,holdUntilUtc:row[4],digest:''
 };
 binding.digest=h.ctx.study1BindingDigest_(binding);
 const x={id:consentId,state:'CONFIRMED',channel:'FORMAL_E1',
  experiment:'E1',documentSha:'a'.repeat(64),documentVersion:'REC_V02',
  binding,signature:{id:'SIGNATURE_123456789',sha:'b'.repeat(64)},
  confirmation:{id:'CONFIRM_123456789',sha:'c'.repeat(64)},
  participantSignedPdf:{id:'PART_SIGNED_123456789',sha:'d'.repeat(64)},
  signedPdf:{id:'DOUBLE_SIGNED_123456789',sha:'e'.repeat(64)}
 };
 let owner=true, pdfChecks=0,bindingChecks=0;
 h.ctx.study1AdminOwnerRequired_=()=>{if(!owner)throw Error('OWNER_REQUIRED')};
 h.ctx.study1FormalConsentGate_=()=>true;
 h.ctx.study1FormalConsentRecScope_=()=>({
  consentDocumentId:docId,consentDocumentSha256:'a'.repeat(64)});
 h.ctx.study1EConsentReadyDocument_=exp=>{
  if(exp!=='E1')throw Error('EXPERIMENT_NOT_OPEN');
  return {id:docId,experiment:'E1',version:'REC_V02',sha256:'a'.repeat(64)};
 };
 h.ctx.study1EConsentRegistry_=()=>({records:[x]});
 h.ctx.study1EConsentEvent_=(ref,entry,kind)=>{
  assert.equal(entry,x);
  if(kind==='SIGNATURE')return {data:{signedPdfSha256:x.participantSignedPdf.sha}};
  if(kind==='CONFIRMATION')return {data:{
   signatureHash:x.signature.sha,
   participantSignedPdfSha256:x.participantSignedPdf.sha,
   researcherSignedPdfSha256:'e'.repeat(64)}};
  throw Error('UNEXPECTED_PDF_EVENT');
 };
 h.ctx.study1EConsentSignedPdfRead_=(ref,entry)=>{
  assert.equal(entry,x);assert.ok(ref===x.signedPdf||ref===x.participantSignedPdf);
  pdfChecks++;return [];
 };
 h.ctx.study1EConsentBindingAdapter_=(audience)=>{
  assert.equal(audience,'PUBLIC_E1');return {readTrustedSnapshot:()=>({})};
 };
 h.ctx.study1BindingRecheck_=(b,doc,adapter,utc,lock)=>{
  assert.equal(lock.hasLock(),true);assert.equal(b,binding);
  assert.equal(doc.sha256,'a'.repeat(64));assert.ok(adapter);
  assert.equal(typeof utc,'string');bindingChecks++;return b;
 };
 return {x,consentId,setOwner:v=>{owner=v;},
  get pdfChecks(){return pdfChecks},get bindingChecks(){return bindingChecks}};
}
test('§70-S.23 original reservation finalization requires valid online dual-PDF and OWNER',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 c.setOwner(false);
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /OWNER_REQUIRED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 c.setOwner(true);
 c.x.state='SIGNED';
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED/);
 c.x.state='CONFIRMED';
 c.x.signedPdf.sha='0'.repeat(64);
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_DUAL_PDF_HASH_MISMATCH|FORMAL_BOOKING_DUAL_PDF_NOT_CONFIRMED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
});
test('§70-S.23 OWNER confirmed dual-PDF transitions only original HELD to CONFIRMED once',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 const before=h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length;
 const done=h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId);
 assert.equal(done.bookingConfirmed,true);assert.equal(done.bookingStatus,'CONFIRMED');
 assert.equal(done.reason,'CONFIRMED_AFTER_DUAL_PDF');
 const row=h.tables.Reservations.rows[0];
 assert.equal(row[3],'CONFIRMED');assert.equal(row[7],row[9]);
 assert.ok(c.pdfChecks>=2);assert.equal(c.bindingChecks,1);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,before+1);
 const replay=h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId);
 assert.equal(replay.bookingConfirmed,true);assert.equal(replay.readOnlyReplay,true);
 assert.equal(h.mutations.filter(x=>x.name==='Reservations'&&x.method==='set').length,before+1);
});
test('§70-S.23 no online signature can resurrect an expired HELD or stale original slot',()=>{
 const h=harness(),person=h.person('A'),proof=h.proof(person),
  held=h.holdSlot(proof,h.S1),c=signedConsentFixture(h,person,held);
 h.tables.Slots.rows[0][3]=2;
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /SLOT_REGISTRY|SLOT.*HMAC|SLOT.*TAMPER|SLOT.*CHANGED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
 h.tables.Slots.rows[0][3]=1;
 h.clock.now+=11*60000;
 assert.throws(()=>h.ctx.study1FormalFinalizeSignedE1Booking_(c.consentId),
  /FORMAL_BOOKING_HELD_EXPIRED_OR_CHANGED/);
 assert.equal(h.tables.Reservations.rows[0][3],'HELD');
});
