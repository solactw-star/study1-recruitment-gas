'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const crypto=require('node:crypto');
const fixtureUtilities={
 Charset:{UTF_8:'UTF-8'},
 DigestAlgorithm:{SHA_256:'SHA_256'},
 base64Decode:b64=>[...Buffer.from(b64,'base64')].map(b=>b>127?b-256:b),
 computeDigest:(alg,bytes)=>{assert.equal(alg,'SHA_256');
  return [...crypto.createHash('sha256')
   .update(Buffer.from(bytes.map(x=>x<0?x+256:x))).digest()].map(b=>b>127?b-256:b);},
 computeHmacSha256Signature:(payload,secret)=>[...crypto.createHmac('sha256',secret)
  .update(payload,'utf8').digest()].map(b=>b>127?b-256:b)
};
const gasDir=path.join(__dirname,'../gas');
const serverCode=fs.readFileSync(path.join(gasDir,'OtpCore.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'BookingCore.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'OtpThrottle.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'OtpTransaction.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'BookingHoldTransaction.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'Study1FixtureAdapter.js'),'utf8')+'\n'+
 fs.readFileSync(path.join(gasDir,'AdminSandbox.js'),'utf8')+'\n'+fs.readFileSync(path.join(gasDir,'Study1Unified.js'),'utf8');
const html=fs.readFileSync(path.join(gasDir,'Study1Unified.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('One unified application script required');
const src=scripts[0][1],ids=[...new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]))];
function harness(){
 const props=new Map([['OPEN','false'],['CONSENT_READY','false']]);let locked=false,writes=0;
 const p={getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');writes++;props.set(k,v)},
  deleteProperty:k=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');props.delete(k)}};
 const lock={tryLock:()=>{assert.equal(locked,false);locked=true;return true},releaseLock:()=>{assert.equal(locked,true);locked=false;},hasLock:()=>locked};
 const backend=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})},
  PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>lock},Utilities:fixtureUtilities,Date,JSON,Object,Array,Set,Map,Number,String,Error});
 vm.runInContext(serverCode,backend,{timeout:2000});
 const dom=new Map();
 function element(id){
  return {id,value:'',disabled:false,checked:false,textContent:'',className:'',children:[],handlers:{},
   addEventListener(type,fn){this.handlers[type]=fn;},
   replaceChildren(...els){this.children=[...els];},
   append(el){this.children.push(el)}};
 }
 for(const id of ids)dom.set(id,element(id));
 dom.get('study').value='E1';dom.get('signature').value='SIMULATED_SIGN_ONLY';
 let success=()=>{},failure=()=>{};const calls=[];
 const rpc={
  withSuccessHandler(fn){success=fn;return rpc;},
  withFailureHandler(fn){failure=fn;return rpc;},
  study1UnifiedPreviewGet(){
   calls.push('READ');try{success(backend.study1UnifiedPreviewGet())}catch(e){failure(e)}
  },
  study1UnifiedPreviewCommand(data){
   calls.push(data.action);try{success(backend.study1UnifiedPreviewCommand(data))}catch(e){failure(e)}
  },
  study1UnifiedPreviewSelfTest(){
   calls.push('SELF_TEST');try{success(backend.study1UnifiedPreviewSelfTest())}catch(e){failure(e)}
  }};
 const front=vm.createContext({document:{getElementById:id=>dom.get(id),createElement:()=>element('dynamic')},
  google:{script:{run:rpc}},Date,Math,JSON,String,Object,Number,Set,
  confirm:()=>true});
 vm.runInContext(src,front,{timeout:2000});
 function click(id){const el=dom.get(id);assert.ok(el,'Missing '+id);assert.equal(el.disabled,false,'Disabled '+id);assert.ok(el.handlers.click,'No click handler '+id);el.handlers.click();}
 const read=()=>JSON.parse(JSON.stringify(backend.study1UnifiedPreviewGet()));
 return {props,dom,click,calls,read,backend,get writes(){return writes},get locked(){return locked},set:(id,value)=>{dom.get(id).value=value},check:(id,value)=>{dom.get(id).checked=value}};
}
test('Actual single-site browser UI takes E1 from screening through test OTP, hold, consent, confirmation, reschedule and cancellation',()=>{
 const h=harness();
 assert.deepEqual(h.calls,['READ']);
 h.click('start');assert.equal(h.read().applications[0].phase,'STARTED');
 for(const id of ['adult','cycu','noDx','noTherapy','noPractice','noE1'])h.check(id,true);
 h.click('screen');assert.equal(h.read().applications[0].phase,'SCREENED');
 h.click('otpRequest');assert.equal(h.read().applications[0].phase,'OTP_SENT');
 h.set('otp','00000000');h.click('otpVerify');assert.equal(h.read().applications[0].phase,'VERIFIED');
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');assert.equal(h.read().applications[0].phase,'HELD');
 h.click('reviewConsent');assert.ok(h.read().applications[0].consentReviewedAt);
 h.check('agree',true);h.click('consent');assert.equal(h.read().applications[0].phase,'CONSENTED');
 h.click('confirm');assert.equal(h.read().applications[0].phase,'CONFIRMED');
 h.set('slot','SIM-SLOT-E1-B');h.click('move');assert.equal(h.read().applications[0].slotId,'SIM-SLOT-E1-B');
 h.click('cancel');assert.equal(h.read().applications[0].phase,'CANCELLED');
 assert.deepEqual(h.calls,['READ','START','SCREEN','OTP_REQUEST','OTP_VERIFY','HOLD','CONSENT_REVIEW','CONSENT','CONFIRM','MOVE','CANCEL']);
 assert.equal(h.dom.get('bookingCreate'),undefined,'No separate sandbox booking widget on the unified page');
 assert.match(h.dom.get('summary').textContent,/CANCELLED/);
 assert.ok(h.dom.get('notifications').children.length>=3);
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
 assert.equal(h.locked,false);
});
test('Unified browser reuses the same server for E2 eligibility and its own test REC version',()=>{
 const h=harness();h.set('study','E2');h.click('start');
 for(const id of ['adult','cycu','noDx','noTherapy','noPractice'])h.check(id,true);
 h.check('noE1',false);h.click('screen');assert.equal(h.read().applications[0].phase,'INELIGIBLE');
 assert.equal(h.dom.get('otpRequest').disabled,true);
 h.click('start'); // another E2 synthetic application, same site and server
 assert.equal(h.dom.get('application').value,'SIM-002','New application must be selected');
 h.check('noE1',true);h.click('screen');
 h.click('otpRequest');h.set('otp','00000000');h.click('otpVerify');
 h.set('slot','SIM-SLOT-E2-A');h.click('hold');
 assert.match(h.dom.get('consentVersion').textContent,/PENDING_REC_APPROVAL_E2/);
 assert.equal(h.read().applications[1].phase,'HELD');
});
test('Unified admin changes the SAME configuration model shown to participant preview',()=>{
 const h=harness();
 h.set('adminTitleField','〔測試〕完整網站');h.set('adminNotice','這是虛構資料測試');
 h.set('adminEmail','〔測試〕通知文字，不會寄送');
 h.click('adminSave');
 assert.equal(h.read().config.title,'〔測試〕完整網站');
 assert.equal(h.dom.get('adminTitleField').value,'〔測試〕完整網站');
 assert.equal(h.props.size,3);
 assert.equal(h.locked,false);
});
test('If closed flags change, unified GUI fails closed on refresh and keeps local operations disabled',()=>{
 const h=harness();
 h.props.set('OPEN','true');
 h.click('refresh');
 assert.equal(h.dom.get('start').disabled,true);
 assert.equal(h.dom.get('screen').disabled,true);
 assert.match(h.dom.get('status').textContent,/無法讀取/);
 assert.equal(h.props.size,2);
});

test('Unified owner browser edits the same slot/policy state and reads minimal audit',()=>{
 const h=harness(),slots=h.read().slots.map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}));
 h.set('adminSlotsJson',JSON.stringify([...slots,{id:'SIM-SLOT-E2-C',experiment:'E2',when:'2027-01-10 12:30',capacity:4}]));
 h.click('adminSlotsSave');assert.equal(h.read().slots.length,5);
 const questions={...h.read().policy.screening.questions,adult:'模擬：已滿十八歲'};
 h.set('adminQuestionsJson',JSON.stringify(questions));h.set('adminConsentE1','PENDING_REC_E1_REV2');
 h.set('adminHashE1','b'.repeat(64));h.click('adminPolicySave');
 assert.equal(h.read().policy.consent.E1.version,'PENDING_REC_E1_REV2');
 assert.equal(h.dom.get('label_adult').textContent,'模擬：已滿十八歲');
 h.click('start');for(const id of ['adult','cycu','noDx','noTherapy','noPractice','noE1'])h.check(id,true);
 h.click('screen');h.click('otpRequest');h.set('otp','00000000');h.click('otpVerify');
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');
 assert.equal(h.dom.get('consentHash').textContent,'b'.repeat(64));
 assert.ok(h.dom.get('audit').children.length>=2);
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('Unified owner browser can reset synthetic acceptance data and start again without changing CLOSED flags',()=>{
 const h=harness();
 h.click('start');assert.equal(h.read().applications.length,1);
 assert.equal(h.dom.get('reviewConsent').disabled,true);
 h.click('adminReset');
 assert.equal(h.read().applications.length,0);
 assert.equal(h.read().revision,0);
 assert.equal(h.dom.get('application').children.length,0);
 assert.equal(h.props.size,2);
 h.click('start');assert.equal(h.read().applications[0].id,'SIM-001');
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('Research copy edited in owner console appears on participant-facing E1/E2 cards, not a separate demo',()=>{
 const h=harness();
 const r=h.read().definitions;
 const research=Object.fromEntries(['E1','E2'].map(exp=>[exp,{
  label:'〔SIM〕'+exp+' 動態研究說明',duration:r[exp].duration,
  procedure:'研究室自訂測試流程 '+exp,compensation:r[exp].compensation}]));
 h.set('adminResearchJson',JSON.stringify(research));h.click('adminResearchSave');
 assert.equal(h.dom.get('definitionTitleE1').textContent,'〔SIM〕E1 動態研究說明');
 assert.match(h.dom.get('definitionTextE2').textContent,/研究室自訂測試流程 E2/);
 assert.equal(h.read().researchApproval,'PENDING');
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('Same owner preview re-holds expired synthetic reservation and hides past slots',()=>{
 const h=harness();h.click('start');
 for(const id of ['adult','cycu','noDx','noTherapy','noPractice','noE1'])h.check(id,true);
 h.click('screen');h.click('otpRequest');h.set('otp','00000000');h.click('otpVerify');
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');
 const state=JSON.parse(h.props.get('STUDY1_UNIFIED_FIXTURE_V1'));
 state.applications[0].holdUntil=Date.now()-1000;
 state.slots[1].when='2020-01-06 14:00';
 h.props.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(state));
 h.click('refresh');
 assert.equal(h.dom.get('hold').disabled,false);
 assert.equal(h.dom.get('consent').disabled,true);
 assert.equal(h.dom.get('cancel').disabled,true);
 assert.match(h.dom.get('reviewStatus').textContent,/逾期/);
 assert.equal(h.dom.get('slot').children.some(x=>x.value==='SIM-SLOT-E1-B'),false);
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');
 assert.equal(h.read().applications[0].holdExpired,false);
 assert.equal(h.read().applications[0].phase,'HELD');
});

test('Unified browser edits screening version and simulates notification retries',()=>{
 const h=harness(),m=JSON.parse(h.dom.get('adminMappingsJson').value);
 m.E1.rules.frequentPractice=null;m.E1.version='PENDING_E1_RULES_V2';
 h.set('adminMappingsJson',JSON.stringify(m));h.click('adminScreeningSave');
 h.click('start');for(const id of ['adult','cycu','noDx','noTherapy','noE1'])h.check(id,true);
 h.check('noPractice',false);h.click('screen');
 assert.equal(h.read().applications[0].phase,'SCREENED');
 assert.match(h.dom.get('screeningVersion').textContent,/PENDING_E1_RULES_V2/);
 h.click('otpRequest');h.set('otp','00000000');h.click('otpVerify');
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');h.click('reviewConsent');
 h.check('agree',true);h.click('consent');h.click('confirm');
 h.set('adminNotificationResult','FAIL');h.click('adminNotificationAttempt');
 assert.equal(h.read().notifications[0].status,'SIM_FAILED');
 h.set('adminNotificationResult','SIM_OK');h.click('adminNotificationAttempt');
 assert.equal(h.read().notifications[0].status,'SIM_DELIVERED');
 assert.equal(h.dom.get('adminNotificationAttempt').disabled,true);
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('Single-site browser shows independent synthetic PDF viewer and PENDING retention governance',()=>{
 const h=harness(),model=h.read();
 assert.equal(model.pdfFixture.approved,false);
 assert.ok(h.dom.get('testPdfLink').href.startsWith('data:application/pdf;base64,'));
 assert.equal(h.dom.get('testPdfHash').textContent,model.pdfFixture.sha256);
 assert.match(h.dom.get('governanceStatus').textContent,/FORMAL_BLOCKED/);
 assert.match(h.dom.get('governanceStatus').textContent,/PENDING/);
 h.click('start');for(const id of ['adult','cycu','noDx','noTherapy','noPractice','noE1'])h.check(id,true);
 h.click('screen');h.click('otpRequest');h.set('otp','00000000');h.click('otpVerify');
 h.set('slot','SIM-SLOT-E1-A');h.click('hold');
 assert.equal(h.dom.get('pdfDemoReview').disabled,false);
 h.click('pdfDemoReview');
 assert.ok(h.read().applications[0].pdfDemoReviewedAt);
 assert.equal(h.dom.get('pdfDemoReview').disabled,true);
 assert.equal(h.read().policy.consent.E1.approval,'PENDING');
 assert.equal(h.read().governance.documents.E1.sourceBytesVerified,false);
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('The owner-only formal readiness panel stays blocked after editing draft PDF metadata',()=>{
 const h=harness();
 assert.match(h.dom.get('formalReadinessStatus').textContent,/FORMAL_BLOCKED/);
 assert.match(h.dom.get('formalReadinessStatus').textContent,/E1_REC_PDF_BYTES/);
 h.set('adminConsentE1','PENDING_E1_DRAFT_V2');
 h.set('adminHashE1','a'.repeat(64));
 h.click('adminPolicySave');
 const status=h.dom.get('formalReadinessStatus').textContent;
 assert.match(status,/PENDING_E1_DRAFT_V2/);
 assert.match(status,/sourceBytesVerified/);
 assert.match(status,/FORMAL_BLOCKED/);
 assert.equal(h.read().formalReadiness.activationAllowed,false);
 assert.equal(h.props.get('OPEN'),'false');
 assert.equal(h.props.get('CONSENT_READY'),'false');
});

test('Unified owner UI invokes read-only GAS whole-site self-test without touching fixture',()=>{
 const h=harness(),writes=h.writes;
 h.click('adminAcceptance');
 assert.equal(h.writes,writes);
 assert.equal(h.calls.at(-1),'SELF_TEST');
 assert.match(h.dom.get('acceptanceStatus').textContent,/OWNER_ONLY_IN_MEMORY/);
 assert.match(h.dom.get('acceptanceStatus').textContent,/FORMAL_BLOCKED/);
 assert.equal(h.props.get('OPEN'),'false');assert.equal(h.props.get('CONSENT_READY'),'false');
 assert.equal(h.locked,false);
});
