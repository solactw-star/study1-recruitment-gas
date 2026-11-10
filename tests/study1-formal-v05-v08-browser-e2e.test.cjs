'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const start=html.indexOf("(function(){\n'use strict';\n// This controller reuses");
const end=html.indexOf("\n})();\n\n(function(){",start);
assert.ok(start>0&&end>start,'formal controller must remain inside original IIFE');
const formal=html.slice(start,end+5);
function simulate(available){
 const nodes=new Map(),calls=[],errors=[],reservations=[],uuid=()=>crypto.randomBytes(8).toString('hex');
 const now=Date.now(),S1='SLOT_E1_BROWSER_A_12345678',S2='SLOT_E1_BROWSER_B_12345678';
 const base=[{slotId:S1,startAtUtc:new Date(now+86400000).toISOString(),endAtUtc:new Date(now+90000000).toISOString(),capacity:1,remaining:1,waitlistCount:0,bookable:true},
  {slotId:S2,startAtUtc:new Date(now+172800000).toISOString(),endAtUtc:new Date(now+176400000).toISOString(),capacity:1,remaining:1,waitlistCount:0,bookable:true}];
 const slots=available==='full'?[{...base[0],remaining:0,bookable:false}]:base;
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
 function node(id){if(!nodes.has(id))nodes.set(id,element(id==='slot'?'select':'div',id));return nodes.get(id);}
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
 const ctx={document:doc,window:{turnstile,google:{script:{run:rpc}}},
  google:{script:{run:rpc}},crypto:{getRandomValues:array=>crypto.randomFillSync(array)},
  Uint8Array,Date,Intl,Array,Object,String,Math,Error};
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
 return {enter,click,node,act,findButton,slots,reservations,calls,errors,S1,S2};
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
