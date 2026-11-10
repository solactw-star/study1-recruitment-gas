'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../gas/Study1Visitor.html'),'utf8');
const start=html.indexOf("(function(){\n'use strict';\n// This controller reuses");
const end=html.indexOf("\n})();\n\n(function(){",start);
assert.ok(start>0&&end>start,'original single visitor formal branch missing');
const script=html.slice(start,end+5);
function simulate(readiness){
 const nodes=new Map(),queries=new Map(),calls=[],rendered=[],errors=[];
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   id,hidden:id==='formalHumanCheck',disabled:false,textContent:'',value:'',
   checked:false,onclick:null,handlers:new Map(),
   addEventListener(type,fn){this.handlers.set(type,fn)}
  });
  return nodes.get(id);
 }
 const doc={
  body:{dataset:{siteMode:'FORMAL'}},
  head:{appendChild:el=>{if(el.onload)el.onload();return el}},
  getElementById:node,
  querySelector:sel=>{
   if(!queries.has(sel))queries.set(sel,{hidden:false,textContent:'',value:''});
   return queries.get(sel);
  },
  createElement:kind=>({kind,src:'',async:false,onload:null,onerror:null})
 };
 const server={
  study1ParticipantReadiness:()=>readiness,
  study1ParticipantBegin:req=>({
   accepted:true,created:true,applicantId:'APP_CLOSED_TEST_12345678',
   screeningId:'SCR_CLOSED_TEST_12345678',phase:'PENDING_EMAIL'}),
  study1ParticipantSendOtp:req=>({
   sent:true,reason:'ISSUED',challengeId:'CHL_CLOSED_TEST_12345678'}),
  study1ParticipantVerifyOtp:req=>({
   verified:true,reason:'EMAIL_CONTROL_ONLY',emailProof:{
    version:1,signature:'a'.repeat(64),applicantId:req.applicantId,
    challengeId:req.challengeId,screeningId:req.screeningId}}),
  study1ParticipantEmailStatus:req=>({
   emailVerified:true,eligibilitySource:'PARTICIPANT_SELF_REPORT',applicationState:'SELF_REPORTED_ELIGIBLE_EMAIL_VERIFIED',
   reservationState:'NOT_AUTHORIZED',consentState:'NOT_SIGNED'}),
  study1FormalV05Slots:req=>({experiment:'E1',slots:[]})
 };
 const runner={
  withFailureHandler(cb){this.failure=cb;return this},
  withSuccessHandler(cb){this.success=cb;return this}
 };
 for(const [method,fn] of Object.entries(server)){
  runner[method]=request=>{
   calls.push({method,request});
   try{this.success?.(fn(request));}catch(err){throw err;}
  };
 }
 // Avoid relying on the test's "this" binding in a dynamically composed RPC.
 for(const [method,fn] of Object.entries(server)){
  runner[method]=request=>{
   calls.push({method,request});
   try{runner.success(fn(request))}catch(error){errors.push(String(error?.stack||error));runner.failure?.(error)}
  };
 }
 const turnstile={
  render:(selector,options)=>{
   rendered.push({selector,options});
   return 'OFFLINE_WIDGET_ONLY';
  },
  reset:widget=>{rendered.push({reset:widget})}
 };
 const ctx={document:doc,window:{turnstile,google:{script:{run:runner}}},
  google:{script:{run:runner}},
  crypto:{getRandomValues:arr=>crypto.randomFillSync(arr)},Uint8Array,
  Array,Object,String,Boolean,Number,Math,Error};
 vm.runInNewContext(script,ctx,{timeout:4000});
 function click(id){
  const n=node(id);
  if(n.disabled||n.hidden)return false;
  const f=n.handlers.get('click');
  if(!f)return false;
  f();return true;
 }
 return {node,queries,click,calls,rendered,errors,script};
}
test('Synthetic browser: closed gate prevents any applicant PII or CAPTCHA request',()=>{
 const s=simulate({ready:false,reason:'REGISTRATION_NOT_OPEN'});
 assert.equal(s.node('chooseE1').disabled,true);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.equal(s.node('formalName').disabled,true);
 assert.equal(s.node('formalHumanCheck').hidden,true);
 assert.equal(s.click('chooseE1'),false);
 assert.equal(s.calls.filter(q=>q.method!=='study1ParticipantReadiness').length,0);
 assert.match(s.node('status').textContent,/尚未開放正式報名/);
});
test('Synthetic browser: gated seven-stage E1 intake -> human token -> email proof -> pending review',()=>{
 const s=simulate({ready:true,experiment:'E1',
  siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 assert.equal(s.node('chooseE1').disabled,false);
 assert.equal(s.node('chooseE2').disabled,true);
 assert.equal(s.rendered[0].selector,'#formalTurnstile');
 assert.equal(s.rendered[0].options.action,'study1_e1_apply');
 assert.equal(s.node('formalHumanCheck').hidden,false);
 assert.equal(s.click('chooseE1'),true);
 assert.equal(s.node('step-screen').hidden,false);
 for(const key of ['adult','cycu','noDx','noTreatment','noPractice'])
  s.node(key).checked=true;
 s.node('formalName').value='合成申請者';
 s.node('formalEmail').value='synthetic.e1@example.org';
 s.node('formalPhone').value='';
 assert.equal(s.click('screenNext'),true);
 assert.match(s.node('status').textContent,/人機驗證/);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
 s.rendered[0].options.callback('SYNTHETIC_HUMAN_TOKEN_PROVIDED_BY_WIDGET');
 assert.equal(s.click('screenNext'),true);
 const begun=s.calls.find(x=>x.method==='study1ParticipantBegin');
 assert.equal(begun.request.experiment,'E1');
 assert.equal(begun.request.email,'synthetic.e1@example.org');
 assert.equal(begun.request.humanToken,'SYNTHETIC_HUMAN_TOKEN_PROVIDED_BY_WIDGET');
 assert.equal(s.node('step-otp').hidden,false);
 assert.equal(s.click('otpSend'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantSendOtp'),true);
 assert.equal(s.node('otpInputWrap').hidden,false);
 s.node('otpInput').value='24681357';
 assert.equal(s.click('otpVerify'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantVerifyOtp'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantEmailStatus'),true);
 assert.equal(s.calls.some(x=>x.method==='study1FormalV05Slots'),true,JSON.stringify({calls:s.calls.map(x=>x.method),errors:s.errors}));
 assert.equal(s.node('step-slots').hidden,false);
 assert.equal(s.node('hold').disabled,true,'no verified formal slot to book');
 assert.equal(s.node('step-consent').hidden,true,'no remote PDF signature ahead of independent identity');
 assert.match(s.node('status').textContent,/目前沒有已核實可選的E1場次/);
 assert.equal(s.calls.some(x=>/UnifiedPreview|SIMULATED/.test(x.method)),false);
});
test('Synthetic browser: Turnstile token expires and cannot be implicitly reused',()=>{
 const s=simulate({ready:true,experiment:'E1',
  siteKey:'OFFLINE_REVIEWED_SITEKEY_ABCDEFGHIJK'});
 s.click('chooseE1');s.rendered[0].options.callback('HUMAN_TOKEN_INITIAL');
 s.rendered[0].options['expired-callback']();
 assert.equal(s.click('screenNext'),true);
 assert.equal(s.calls.some(x=>x.method==='study1ParticipantBegin'),false);
});
