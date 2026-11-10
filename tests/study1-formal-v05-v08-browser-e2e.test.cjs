'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const start=html.indexOf("(function(){\n'use strict';\n// This controller reuses");
const end=html.indexOf("\n})();\n\n(function(){",start);
assert.ok(start>0&&end>start,'formal controller must remain inside original IIFE');
const formal=html.slice(start,end+5);
function simulate(available,withConsent=false,researcherPresigned=false){
 const nodes=new Map(),calls=[],errors=[],reservations=[],uuid=()=>crypto.randomBytes(8).toString('hex');
 const now=Date.now(),S1='SLOT_E1_BROWSER_A_12345678',S2='SLOT_E1_BROWSER_B_12345678';
 const base=[{slotId:S1,startAtUtc:new Date(now+86400000).toISOString(),endAtUtc:new Date(now+90000000).toISOString(),capacity:1,remaining:1,waitlistCount:0,bookable:true},
  {slotId:S2,startAtUtc:new Date(now+172800000).toISOString(),endAtUtc:new Date(now+176400000).toISOString(),capacity:1,remaining:1,waitlistCount:0,bookable:true}];
 const slots=available==='full'?[{...base[0],remaining:0,bookable:false}]:base;
 const token='aaaaaaaa-bbbb-4ccc-8ddd-111111111111-aaaaaaaa-bbbb-4ccc-8ddd-222222222222';
 const sourcePdf=Buffer.from('%PDF-'+('E1 APPROVED SYNTHETIC '.repeat(15)));
 const signedPdf=Buffer.from('%PDF-'+('SIGNED FOR E1 SYNTHETIC '.repeat(15)));
 const pdfSha=crypto.createHash('sha256').update(sourcePdf).digest('hex');
 const signedSha=crypto.createHash('sha256').update(signedPdf).digest('hex');
 const signedAt=new Date(now).toISOString();
 const taipei=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(signedAt));
 const date=Object.fromEntries(taipei.map(p=>[p.type,p.value]));
 const taipeiDate=date.year+'/'+date.month+'/'+date.day;
 let consent='ISSUED',staffExplained=false,staffConfirmed=false,withdrawn=false;

 function element(kind,id){
  const n={kind,id,hidden:id==='formalHumanCheck',disabled:false,textContent:'',value:'',checked:false,children:[],handlers:new Map(),attributes:{},
   setAttribute(name,value){this.attributes[name]=value;},
   addEventListener(name,fn){this.handlers.set(name,fn);},
   appendChild(child){this.children.push(child);if(this.kind==='select'&&!this.value&&child.kind==='option')this.value=child.value;return child;},
   removeChild(child){let idx=this.children.indexOf(child);if(idx<0)throw Error('missing child');this.children.splice(idx,1);return child;},
   get firstChild(){return this.children[0]||null;},
   get options(){return this.children.filter(x=>x.kind==='option');}
  };return n;
 }
 function node(id){
  if(!nodes.has(id)){
   const n=element(id==='slot'?'select':'div',id);
   if(withConsent&&id==='visitorSignaturePreview'){
    n.width=700;n.height=160;
    n.getContext=()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
    n.getBoundingClientRect=()=>({left:0,top:0,width:700,height:160});
    n.toDataURL=()=>('data:image/png;base64,'+
      Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(160)]).toString('base64'));
   }
   nodes.set(id,n);
  }
  return nodes.get(id);
 }
 const doc={body:{dataset:{siteMode:'FORMAL'}},
  head:{appendChild(x){x.onload?.();return x;}},
  getElementById:node,
  querySelector:()=>({hidden:false,textContent:'',value:''}),
  createElement:kind=>element(kind,null)};
 const turnstile={render:(selector,config)=>{assert.equal(selector,'#formalTurnstile');turnstile.config=config;return 'WIDGET_TEST'},reset:()=>{}};
 const eProof={version:1,applicantId:'APP_BROWSER_SYNTH_1234',screeningId:'SCR_BROWSER_SYNTH_1234',
  challengeId:'CHL_BROWSER_SYNTH_1234',experiment:'E1',signature:'b'.repeat(64)};
 const server={
  study1ParticipantReadiness:()=>({ready:true,experiment:'E1',siteKey:'OFFLINE_TEST_SITEKEY_1234567890'}),
  study1ParticipantBegin:()=>({accepted:true,applicantId:eProof.applicantId,screeningId:eProof.screeningId,phase:'PENDING_EMAIL'}),
  study1ParticipantSendOtp:()=>({sent:true,challengeId:eProof.challengeId}),
  study1ParticipantVerifyOtp:()=>({verified:true,emailProof:eProof}),
  study1ParticipantEmailStatus:()=>({emailVerified:true,eligibilitySource:'PARTICIPANT_SELF_REPORT',applicationState:'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED'}),
  study1FormalV05Slots:()=>({experiment:'E1',slots}),
  study1FormalQuoteHold:input=>({allowed:true,quote:{slotId:input.slotId,requestId:input.requestId,signature:'c'.repeat(64)}}),
  study1FormalHoldSlot:input=>{
   const r={reservationId:'RSV_SYNTH_'+uuid(),slotId:input.quote.slotId,status:'HELD',
    holdUntilUtc:new Date(now+600000).toISOString()};
   reservations.push(r);return {held:true,reservationId:r.reservationId};
  },
  study1FormalStatus:()=>({experiment:'E1',reservations:reservations.map(x=>({...x}))}),
  study1FormalWaitlistJoin:input=>{
   const r={reservationId:'RSV_SYNTH_'+uuid(),slotId:input.slotId,status:'WAITLISTED',holdUntilUtc:''};
   reservations.push(r);return {joined:true,reservationId:r.reservationId};
  },
  study1FormalWaitlistClaim:input=>{
   const r=reservations.find(x=>x.reservationId===input.reservationId);
   if(!r||r.status!=='WAITLISTED')return {held:false};
   r.status='HELD';r.holdUntilUtc=new Date(now+600000).toISOString();
   return {held:true,reservationId:r.reservationId};
  },
  study1FormalCancel:input=>{
   const r=reservations.find(x=>x.reservationId===input.reservationId);
   if(!r)return {cancelled:false};
   r.status='CANCELLED';return {cancelled:true};
  },
  study1FormalMove:input=>{
   const r=reservations.find(x=>x.reservationId===input.reservationId);
   if(!r||r.status!=='HELD')return {moved:false};
   r.status='CANCELLED';
   reservations.push({reservationId:'RSV_SYNTH_'+uuid(),slotId:input.newSlotId,
    status:'HELD',holdUntilUtc:r.holdUntilUtc});
   return {moved:true};
  }
 };

 if(withConsent)Object.assign(server,{
  study1FormalConsentBegin:req=>{
   assert.equal(req.emailProof,eProof);
   const r=reservations.find(x=>x.reservationId===req.reservationId);
   if(!r||r.status!=='HELD')throw Error('NOT_HELD');
   return {state:'ISSUED',experiment:'E1',reservationId:r.reservationId,
    token,documentVersion:'V1',documentSha256:pdfSha,researcherPresigned};
  },
  study1FormalConsentOriginalPdf:sessionToken=>{
   assert.equal(sessionToken,token);
   return {available:true,experiment:'E1',version:'V1',sha256:pdfSha,
    title:'SYNTHETIC E1 approved fixture',mime:'application/pdf',
    bytes:sourcePdf.length,base64:sourcePdf.toString('base64')};
  },
  study1FormalConsentStatus:sessionToken=>{
   assert.equal(sessionToken,token);
   return {experiment:'E1',state:consent,version:'V1',sourceSha256:pdfSha,
    researcherPreSigned:researcherPresigned,
    researcherExplanationCompleted:staffExplained,
    explanation:staffExplained?{answer:'研究員已說明研究內容及可撤回權益'}:null,
    signatureAccepted:consent==='SIGNED'||staffConfirmed,
    staffConfirmed,copyAvailable:staffConfirmed,withdrawn};
  },
  study1EConsentSignPdf:req=>{
   assert.equal(req.token,token);assert.equal(req.documentSha,pdfSha);
   assert.equal(req.read,true);assert.equal(req.answerAcknowledged,true);
   if(!staffExplained&&!researcherPresigned)throw Error('RESEARCHER_EXPLANATION_MISSING');
   consent=researcherPresigned?'CONFIRMED':'SIGNED';
   if(researcherPresigned)staffConfirmed=true;
   return {state:consent,experiment:'E1',documentSha256:pdfSha,signedPdfSha256:signedSha,
    taipeiDate,signedAt,researcherPreSigned:researcherPresigned};
  },
  study1EConsentSignedPdfCopy:sessionToken=>{
   assert.equal(sessionToken,token);
   if(!staffConfirmed)throw Error('STAFF_CONFIRM_REQUIRED');
   return {experiment:'E1',version:'V1',sourceSha256:pdfSha,
    signedPdfSha256:signedSha,signedAt,taipeiDate,dualSigned:true,
    participantSignedPdfSha256:researcherPresigned?signedSha:'f'.repeat(64),
    researcherSignedAt:researcherPresigned?null:signedAt,
    researcherTaipeiDate:researcherPresigned?null:taipeiDate,
    researcherPreSigned:researcherPresigned,
    mime:'application/pdf',bytes:signedPdf.length,
    base64:signedPdf.toString('base64')};
  },
  study1EConsentWithdraw:req=>{
   assert.equal(req.token,token);
   assert.equal(req.dataChoice,'CONTACT_STAFF');
   if(!staffConfirmed)throw Error('UNCONFIRMED');
   withdrawn=true;consent='WITHDRAWN';return {state:'WITHDRAWN',recorded:true};
  }
 });
 const rpc={
  withFailureHandler(cb){this.failure=cb;return this;},
  withSuccessHandler(cb){this.success=cb;return this;}
 };
 for(const [name,fn] of Object.entries(server)){
  rpc[name]=payload=>{
   calls.push({name,payload});
   try{const result=fn(payload);rpc.success(result);}
   catch(err){errors.push(String(err.stack||err));rpc.failure?.(err);}
  };
 }
 const ctx={document:doc,window:{turnstile,
  crypto:withConsent?{subtle:crypto.webcrypto.subtle}:undefined,
  google:{script:{run:rpc}}},
  google:{script:{run:rpc}},crypto:{getRandomValues:array=>crypto.randomFillSync(array)},
  Uint8Array,Date,Intl,Array,Object,String,Math,Error,Promise,
  URL:{createObjectURL:()=>('blob:offline:'+uuid()),revokeObjectURL(){}},
  Blob:globalThis.Blob,atob:b64=>Buffer.from(b64,'base64').toString('binary')};
 vm.runInNewContext(formal,ctx,{timeout:4000});
 function click(id){
  const n=node(id),fn=n.handlers.get('click')||n.onclick;
  if(n.disabled||n.hidden||!fn)return false;fn();return true;
 }
 function findButton(name){
  const walk=n=>{
   if(n.kind==='button'&&n.textContent.includes(name))return n;
   for(const child of n.children){const f=walk(child);if(f)return f;}
   return null;
  };
  return walk(node('step-confirm'));
 }
 function act(name){const button=findButton(name);assert.ok(button,'missing '+name);
  button.handlers.get('click')();assert.deepEqual(errors,[]);}
 function enter(){
  assert.equal(click('chooseE1'),true);
  for(const id of ['adult','cycu','noDx','noTreatment','noPractice'])node(id).checked=true;
  node('formalName').value='合成申請者';node('formalEmail').value='synthetic@example.org';
  turnstile.config.callback('SYNTHETIC_TURNSTILE_TOKEN_123456789');
  assert.equal(click('screenNext'),true);
  assert.equal(click('otpSend'),true);
  node('otpInput').value='12345678';
  assert.equal(click('otpVerify'),true);
  assert.deepEqual(errors,[]);
  assert.equal(node('step-slots').hidden,false);
  assert.equal(calls.some(x=>x.name==='study1FormalV05Slots'),true);
 }
 return {enter,click,node,act,findButton,slots,reservations,calls,errors,S1,S2,
  staffExplain:()=>{staffExplained=true;consent='EXPLAINED';},
  staffConfirm:()=>{staffConfirmed=true;consent='CONFIRMED';},
  isWithdrawn:()=>withdrawn,
  pdfSha,signedSha};
}
test('FORMAL browser: original E1 V05 quote -> HELD -> V08 MOVE -> CANCEL, no DEMO commands',()=>{
 const h=simulate();h.enter();
 assert.equal(h.node('hold').disabled,false);
 assert.equal(h.click('hold'),true);
 assert.equal(h.reservations.length,1);
 assert.equal(h.node('step-confirm').hidden,false);
 assert.equal(h.reservations[0].status,'HELD');
 h.act('改至選定E1場次');
 assert.equal(h.reservations.length,2);
 assert.equal(h.reservations[0].status,'CANCELLED');
 assert.equal(h.reservations[1].status,'HELD');
 assert.equal(h.reservations[1].slotId,h.S2);
 h.act('取消此暫留／候補');
 assert.equal(h.reservations[1].status,'CANCELLED');
 assert.equal(h.node('step-slots').hidden,false);
 assert.equal(h.calls.some(x=>/UnifiedPreview|SIMULATED/.test(x.name)),false);
 assert.deepEqual(h.errors,[]);
});
test('FORMAL browser: full E1 V05 slot -> WAITLISTED -> V08 claim, never auto-books',()=>{
 const h=simulate('full');h.enter();
 assert.equal(h.node('hold').disabled,false);
 assert.equal(h.click('hold'),true);
 assert.equal(h.reservations.length,1);
 assert.equal(h.reservations[0].status,'WAITLISTED');
 assert.equal(h.node('step-confirm').hidden,false);
 h.act('按候補順位檢查可否領取名額');
 assert.equal(h.reservations[0].status,'HELD');
 assert.equal(h.node('step-confirm').hidden,false);
 assert.deepEqual(h.errors,[]);
});

test('FORMAL consent-last browser synthetic: HELD -> actual PDF SHA -> staff explanation -> ink -> signed PDF -> staff copy -> withdrawal',async()=>{
 const h=simulate(undefined,true);
 h.enter();assert.equal(h.click('hold'),true);
 h.act('核對本人暫留並進入最後知情同意');
 // Async browser WebCrypto digest must settle before any consent action.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.node('step-consent').hidden,false);
 assert.equal(h.node('officialPdfDownload').hidden,false);
 assert.equal(h.node('finish').disabled,true);
 assert.equal(h.calls.some(x=>x.name==='study1EConsentSignPdf'),false);
 const findIn=(root,term)=>{
  const search=n=>{
   if(n.kind==='button'&&n.textContent.includes(term))return n;
   for(const c of n.children){const f=search(c);if(f)return f;}
   return null;
  };
  return search(h.node(root));
 };
 const refresh=findIn('step-consent','更新研究人員說明');
 assert.ok(refresh);
 h.staffExplain();refresh.handlers.get('click')();
 assert.equal(h.node('finish').disabled,true,'no signature/affirmative check yet');
 const canvas=h.node('visitorSignaturePreview');
 canvas.handlers.get('pointerdown')({clientX:20,clientY:20,pointerId:1});
 canvas.handlers.get('pointermove')({clientX:60,clientY:70,pointerId:1});
 canvas.handlers.get('pointerup')({clientX:60,clientY:70,pointerId:1});
 h.node('readPdf').checked=true;
 h.node('readPdf').handlers.get('change')();
 h.node('agree').checked=true;
 h.node('agree').handlers.get('change')();
 assert.equal(h.node('finish').disabled,false);
 assert.equal(h.click('finish'),true);
 assert.ok(h.calls.some(x=>x.name==='study1EConsentSignPdf'));
 assert.equal(h.node('finish').disabled,true);
 h.staffConfirm();refresh.handlers.get('click')();
 // WebCrypto SHA-256 is truly asynchronous in the VM, not guaranteed to
 // settle after a single event-loop turn on a busy CI runner.
 for(let i=0;i<40&&h.node('officialSignedPdfResult').hidden;i++)
  await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(h.node('officialSignedPdfResult').hidden,false);
 assert.equal(h.node('officialSignedPdfDownload').hidden,false);
 assert.equal(h.node('officialSignedPdfSha').textContent,h.signedSha);
 assert.equal(h.node('officialPdfSha').textContent,h.pdfSha);
 // §70-S.23: independent read-only Reservations verification never
 // converts an online dual-signed PDF into a fictitious booked seat.
 assert.equal(h.reservations[0].status,'HELD');
 assert.match(h.node('status').textContent,/仍為HELD暫留/);
 assert.ok(h.calls.some(x=>x.name==='study1FormalStatus'));
 // A distinct verified CONFIRMED reservation may be reported as booked.
 h.reservations[0].status='CONFIRMED';
 refresh.handlers.get('click')();
 for(let i=0;i<40&&!/正式預約均已獨立核實/.test(h.node('status').textContent);i++)
  await new Promise(resolve=>setTimeout(resolve,5));
 assert.match(h.node('status').textContent,/正式預約均已獨立核實/);
 const withdrawal=findIn('step-consent','撤回已確認');
 assert.ok(withdrawal);
 const area=withdrawal;
 // The textarea is a sibling of the withdrawal button, inside its parent box.
 const box=h.node('step-consent').children.find(x=>x.children.some(y=>y===area));
 assert.ok(box);
 const label=box.children.find(x=>x.kind==='label');
 const reason=label.children.find(x=>x.kind==='textarea');
 reason.value='研究參與者希望撤回同意';
 withdrawal.handlers.get('click')();
 assert.equal(h.isWithdrawn(),true);
 assert.equal(h.calls.some(x=>/UnifiedPreview|SIMULATED_SIGN_ONLY/.test(x.name)),false);
 assert.deepEqual(h.errors,[]);
});

// Latest operational decision does not eliminate staff Q&A evidence: it only
// removes the old 15-minute duration as a hard timer for online e-consent.
test('§70-S.23 consent is online-only without a 15-minute countdown or booking shortcut',()=>{
 assert.match(html,/請閱讀研究者事先完成簽名/);
 assert.match(formal,/researcherPresigned/);
 assert.match(formal,/研究者已先簽署完整PDF/);
 assert.match(formal,/a dual-signed PDF is NOT a booking confirmation/);
 assert.match(formal,/rpc\('study1FormalStatus',state\.emailProof,booking/);
});

test('§70-S.24 MVP: researcher presigns source before upload; participant signs once without staff second signature',async()=>{
 const h=simulate(undefined,true,true);h.enter();h.click('hold');
 h.act('核對本人暫留並進入最後知情同意');
 for(let i=0;i<40&&h.node('officialPdfDownload').hidden;i++)
  await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(h.node('officialPdfDownload').hidden,false);
 assert.equal(h.calls.some(c=>c.name==='study1EConsentSignPdf'),false);
 const canvas=h.node('visitorSignaturePreview');
 canvas.handlers.get('pointerdown')({clientX:20,clientY:20,pointerId:1});
 canvas.handlers.get('pointermove')({clientX:60,clientY:40,pointerId:1});
 canvas.handlers.get('pointerup')({clientX:60,clientY:40,pointerId:1});
 h.node('readPdf').checked=true;h.node('readPdf').handlers.get('change')();
 h.node('agree').checked=true;h.node('agree').handlers.get('change')();
 assert.equal(h.node('finish').disabled,false);
 assert.equal(h.click('finish'),true);
 for(let i=0;i<40&&h.node('officialSignedPdfDownload').hidden;i++)
  await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(h.node('officialSignedPdfDownload').hidden,false);
 assert.ok(h.calls.some(c=>c.name==='study1EConsentSignPdf'));
 assert.equal(h.calls.some(c=>c.name==='study1EConsentConfirmPdf'),false);
 assert.deepEqual(h.errors,[]);
});
