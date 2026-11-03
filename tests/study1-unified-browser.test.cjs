'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const gasDir=path.join(__dirname,'../gas');
const serverCode=fs.readFileSync(path.join(gasDir,'AdminSandbox.js'),'utf8')+'\n'+fs.readFileSync(path.join(gasDir,'Study1Unified.js'),'utf8');
const html=fs.readFileSync(path.join(gasDir,'Study1Unified.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('One unified application script required');
const src=scripts[0][1],ids=[...new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]))];
function harness(){
 const props=new Map([['OPEN','false'],['CONSENT_READY','false']]);let locked=false,writes=0;
 const p={getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');writes++;props.set(k,v)},
  deleteProperty:k=>{assert.equal(k,'STUDY1_UNIFIED_FIXTURE_V1');props.delete(k)}};
 const lock={tryLock:()=>{assert.equal(locked,false);locked=true;return true},releaseLock:()=>{assert.equal(locked,true);locked=false;}};
 const backend=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'}),getEffectiveUser:()=>({getEmail:()=> 'solac.tw@gmail.com'})},
  PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>lock},Date,JSON,Object,Array,Set,Map,Number,String,Error});
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
