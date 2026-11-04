'use strict';
/**
 * Browser-shaped E1/E2 site-management acceptance.
 * Executes real Study1Team.html and Study1Visitor.html inline scripts
 * against the SAME real Study1Unified GAS state machine in a VM.
 * No GAS account/session/browser navigation, real Sheets, emails, REC or PII.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const gasDir=path.join(__dirname,'../gas');
const backendSource=[
 'OtpCore.js','BookingCore.js','OtpThrottle.js','OtpTransaction.js',
 'BookingHoldTransaction.js','Study1FixtureAdapter.js','AdminSandbox.js','Study1Unified.js'
].map(name=>fs.readFileSync(path.join(gasDir,name),'utf8')).join('\n');
const teamHtml=fs.readFileSync(path.join(gasDir,'Study1Team.html'),'utf8');
const demoHtml=fs.readFileSync(path.join(gasDir,'Study1Visitor.html'),'utf8');
const scriptOf=html=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,'one inline site script, no network scripts');
 return scripts[0][1];
};
const fixtureUtilities={
 Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'SHA_256'},
 base64Decode:b64=>[...Buffer.from(b64,'base64')].map(n=>n>127?n-256:n),
 computeDigest:(algorithm,bytes)=>{
  assert.equal(algorithm,'SHA_256');
  return [...crypto.createHash('sha256').update(Buffer.from(bytes.map(n=>n<0?n+256:n))).digest()].map(n=>n>127?n-256:n);
 },
 computeHmacSha256Signature:(data,secret)=>[...crypto.createHmac('sha256',secret)
  .update(data,'utf8').digest()].map(n=>n>127?n-256:n)
};
function server({active='solac.tw@gmail.com',effective='solac.tw@gmail.com',open='false',consent='false'}={}){
 const store=new Map([['OPEN',open],['CONSENT_READY',consent]]);
 let writes=0,lockHeld=false,requests=0;
 const props={
  getProperty:key=>store.has(key)?store.get(key):null,
  setProperty:(key,value)=>{assert.equal(key,'STUDY1_UNIFIED_FIXTURE_V1');writes++;store.set(key,value);},
  deleteProperty:key=>{assert.equal(key,'STUDY1_UNIFIED_FIXTURE_V1');store.delete(key);}
 };
 const mutex={
  tryLock:()=>{assert.equal(lockHeld,false);lockHeld=true;return true;},
  releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;},
  hasLock:()=>lockHeld
 };
 const ctx=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>mutex},
  Utilities:fixtureUtilities,Date,JSON,Object,Array,String,Number,Set,Map,Error
 });
 vm.runInContext(backendSource,ctx,{timeout:3000});
 const clone=x=>JSON.parse(JSON.stringify(x));
 const read=()=>clone(ctx.study1UnifiedPreviewGet());
 const command=(action,payload,revision=read().revision)=>{
  const c={action,payload,expectedRevision:revision,
   requestId:'REQ-SIM-ACCEPT_'+String(++requests).padStart(9,'0')};
  return clone(ctx.study1UnifiedPreviewCommand(c));
 };
 return {ctx,read,command,store,get writes(){return writes},get held(){return lockHeld}};
}
/** Minimal semantic DOM: real input values, click/change handlers, editable
 * team slot/week rows, enabled/hidden states and select option behaviour. */
function element(id='',tagName='div'){
 return {id,tagName,dataset:{},handlers:{},children:[],value:'',textContent:'',className:'',
  checked:false,disabled:false,hidden:false,href:'',type:'',attributes:{},
  addEventListener(type,handler){this.handlers[type]=handler;},
  setAttribute(name,value){this.attributes[name]=value;},
  append(...els){for(const e of els)this.appendChild(e);},
  appendChild(el){this.children.push(el);
   if(this.tagName==='select'&&this.children.length===1&&!this.value)this.value=el.value;
   return el;
  },
  replaceChildren(...els){this.children=[...els];if(this.tagName==='select')
   this.value=this.children.length?this.children[0].value:'';
  },
  querySelector(selector){
   const m=selector.match(/^\[data-role="([a-z]+)"\]$/);
   assert.ok(m,'Unmocked row selector '+selector);
   return this.children.find(x=>x.dataset.role===m[1])||null;
  }
 };
}
function documentFor(html,kind){
 const ids=new Map();
 for(const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){
  const [full,tag,id]=match;
  assert.equal(ids.has(id),false,'duplicate id '+id);
  const node=element(id,tag.toLowerCase());
  if(/\bchecked(?:\s|>|=)/.test(full))node.checked=true;
  if(/\bdisabled(?:\s|>|=)/.test(full))node.disabled=true;
  if(/\bhidden(?:\s|>|=)/.test(full))node.hidden=true;
  ids.set(id,node);
 }
 const progress=[...Array(6)].map(()=>element('progress-span','span'));
 const get=id=>{const e=ids.get(id);assert.ok(e,'Unknown element '+kind+': '+id);return e;};
 const query=selector=>{
  if(selector==='#slotRows [data-slot-id]')
   return get('slotRows').children.filter(x=>x.dataset.slotId);
  if(selector==='#weekRows [data-week]')
   return get('weekRows').children.filter(x=>x.dataset.week);
  if(selector==='.step')return [...ids.values()].filter(x=>x.id.startsWith('step-'));
  if(selector==='#progress span')return progress;
  throw Error('Unmocked querySelectorAll '+selector);
 };
 return {ids,get,doc:{getElementById:get,createElement:tag=>element('',tag),
  querySelectorAll:query}};
}
function page(server,kind){
 const html=kind==='team'?teamHtml:demoHtml;
 const {ids,get,doc}=documentFor(html,kind),calls=[],failures=[];
 let success=null,failure=null;
 const rpc={
  withSuccessHandler(fn){success=fn;return this;},
  withFailureHandler(fn){failure=fn;return this;},
  study1UnifiedPreviewGet(){calls.push('READ');
   try{const view=server.read();success(view);}
   catch(e){failures.push(String(e.message||e));failure(e);}
  },
  study1UnifiedPreviewCommand(c){calls.push(c.action);
   try{
    const result=server.ctx.study1UnifiedPreviewCommand(c);
    // GAS serialization: break cross-VM object identity.
    success(JSON.parse(JSON.stringify(result)));
   }catch(e){failures.push(String(e.message||e));failure(e);}
  }
 };
 const context=vm.createContext({document:doc,google:{script:{run:rpc}},
  Date,Math,JSON,String,Object,Number,Array,Set,Map,Error,confirm:()=>true});
 vm.runInContext(scriptOf(html),context,{timeout:3000});
 const click=id=>{
  const node=get(id);
  assert.equal(node.disabled,false,kind+': disabled '+id);
  assert.equal(typeof node.handlers.click,'function',kind+': no click '+id);
  node.handlers.click();
 };
 const change=id=>{
  const node=get(id);assert.equal(typeof node.handlers.change,'function',kind+': no change '+id);
  node.handlers.change();
 };
 const set=(id,value)=>{get(id).value=value;};
 return {kind,ids,get,click,change,set,calls,failures,context};
}
const closed=server=>{
 assert.equal(server.store.get('OPEN'),'false');
 assert.equal(server.store.get('CONSENT_READY'),'false');
 assert.deepEqual([...server.store.keys()].sort(),
   server.store.has('STUDY1_UNIFIED_FIXTURE_V1')?
    ['CONSENT_READY','OPEN','STUDY1_UNIFIED_FIXTURE_V1']:['CONSENT_READY','OPEN']);
 assert.equal(server.held,false);
 const view=server.read();
 assert.equal(view.open,false);assert.equal(view.consentReady,false);
 assert.equal(view.formalReadiness.activationAllowed,false);
 assert.equal(view.formalPorts.activated,false);
 assert.equal(view.policy.consent.E1.approval,'PENDING');
 assert.equal(view.policy.consent.E2.approval,'PENDING');
};
test('Cross-page: E2 defaults to 2027 coming soon; owner GET loads GUI and visitor without writes',()=>{
 const s=server(),before=s.writes;
 const team=page(s,'team'),visitor=page(s,'visitor');
 assert.deepEqual(team.calls,['READ']);assert.deepEqual(visitor.calls,['READ']);
 assert.equal(team.get('modeE1').value,'DEMO_OPEN');
 assert.equal(team.get('modeE2').value,'COMING_SOON');
 assert.equal(visitor.get('chooseE1').disabled,false);
 assert.equal(visitor.get('chooseE2').disabled,true);
 assert.match(visitor.get('stateE2').textContent,/2027 年.*尚未開放報名/);
 assert.equal(s.read().recruitment.E2.year,2027);
 assert.equal(s.writes,before);
 closed(s);
});
test('Cross-page: real team Save button persists TEST settings; reopening visitor reflects E1/E2 modes',()=>{
 const s=server();
 const team=page(s,'team');
 team.set('modeE1','COMING_SOON');team.set('modeE2','COMING_SOON');
 team.click('saveModes');
 assert.equal(team.failures.length,0);
 assert.match(team.get('status').textContent,/已儲存/);
 assert.equal(s.read().recruitment.E1.mode,'COMING_SOON');
 const closedVisitor=page(s,'visitor');
 assert.equal(closedVisitor.get('chooseE1').disabled,true);
 assert.equal(closedVisitor.get('chooseE2').disabled,true);
 assert.equal(s.read().recruitment.E2.mode,'COMING_SOON');
 closed(s);
});
test('Cross-page: team toggles E2 demo only; new visitor view enables synthetic E2, not formal recruitment',()=>{
 const s=server(),team=page(s,'team');
 team.set('modeE2','DEMO_OPEN');team.click('saveModes');
 assert.equal(s.read().recruitment.E2.mode,'DEMO_OPEN');
 let visitor=page(s,'visitor');
 assert.equal(visitor.get('chooseE2').disabled,false);
 visitor.click('chooseE2');
 assert.equal(s.read().applications[0].experiment,'E2');
 assert.equal(s.read().applications[0].phase,'STARTED');
 // The visitor started a new synthetic application, advancing the shared revision.
 // Reload the team editor before saving to avoid overwriting concurrent changes.
 team.click('refresh');
 team.set('modeE2','COMING_SOON');team.click('saveModes');
 assert.equal(team.failures.length,0);
 visitor=page(s,'visitor');
 assert.equal(visitor.get('chooseE2').disabled,true);
 assert.match(visitor.get('stateE2').textContent,/2027 年.*尚未開放/);
 closed(s);
});
test('Cross-page: GUI research/site text save appears after visitor reload; no data outside TEST fixture',()=>{
 const s=server(),team=page(s,'team');
 team.set('siteTitle','〔SIM〕記憶與身體感覺報名');
 team.set('siteNotice','〔SIM〕老師展示專用，不接收真人資料');
 team.click('saveSite');
 assert.equal(s.read().config.title,'〔SIM〕記憶與身體感覺報名');
 assert.equal(s.read().config.notice,'〔SIM〕老師展示專用，不接收真人資料');
 team.set('e1Label','〔SIM〕實驗一記憶研究');
 team.set('e2Label','〔SIM〕實驗二（2027）');
 team.click('saveResearch');
 const visitor=page(s,'visitor');
 assert.equal(visitor.get('visitorHeroTitle').textContent,'〔SIM〕記憶與身體感覺報名');
 assert.equal(visitor.get('siteNoticeText').textContent,'〔SIM〕老師展示專用，不接收真人資料');
 assert.equal(visitor.get('nameE1').textContent,'〔SIM〕實驗一記憶研究');
 assert.equal(visitor.get('nameE2').textContent,'〔SIM〕實驗二（2027）');
 closed(s);
});
test('Cross-page: editing slot capacity and E2 weekly plan uses actual team inputs and reloads',()=>{
 const s=server(),team=page(s,'team');
 const rows=team.get('slotRows').children;
 assert.equal(rows.length,4);
 const e1=rows.find(r=>r.dataset.slotId==='SIM-SLOT-E1-A');
 assert.ok(e1);
 e1.querySelector('[data-role="capacity"]').value='3';
 team.click('saveSlots');
 assert.equal(s.read().slots.find(x=>x.id==='SIM-SLOT-E1-A').capacity,3);
 const week=team.get('weekRows').children[0];
 week.querySelector('[data-role="date"]').value='2027-03-04';
 week.querySelector('[data-role="notes"]').value='〔SIM〕研究團隊暫定週次';
 team.click('saveWeeks');
 assert.equal(s.read().e2Operations.weeks[0].date,'2027-03-04');
 const reloaded=page(s,'team');
 assert.equal(reloaded.get('weekRows').children[0].querySelector('[data-role="notes"]').value,
  '〔SIM〕研究團隊暫定週次');
 const visitor=page(s,'visitor');
 visitor.click('chooseE1');
 const application=s.read().applications[0];
 assert.equal(application.experiment,'E1');
 for(const id of ['adult','cycu','noDx','noTreatment','noPractice'])visitor.get(id).checked=true;
 visitor.click('screenNext');visitor.click('otpSend');
 assert.equal(visitor.get('otpInputWrap').hidden,false);
 visitor.click('otpPaste');visitor.click('otpVerify');
 const slots=visitor.get('slot').children;
 assert.ok(slots.some(x=>x.value==='SIM-SLOT-E1-A'&&/3 個名額/.test(x.textContent)));
 closed(s);
});
test('Two owner GUI tabs: stale revision fails closed without overwriting the first saved change',()=>{
 const s=server(),one=page(s,'team'),two=page(s,'team');
 one.set('modeE1','COMING_SOON');one.click('saveModes');
 const rev=s.read().revision;
 two.set('modeE2','HIDDEN');two.click('saveModes');
 assert.equal(two.failures.length,1);
 assert.match(two.get('status').textContent,/版本已變更/);
 assert.equal(s.read().revision,rev);
 assert.equal(s.read().recruitment.E2.mode,'COMING_SOON');
 two.click('refresh');
 two.set('modeE2','HIDDEN');two.click('saveModes');
 assert.equal(s.read().recruitment.E2.mode,'HIDDEN');
 const visitor=page(s,'visitor');
 assert.equal(visitor.get('chooseE2').hidden,true);
 closed(s);
});
test('Unauthorized identity and changed OPEN flag deny both GUI reads/writes with no fixture writes',()=>{
 for(const params of [{active:'unauthorized@example.invalid'}, {open:'true'}]){
  const s=server(params),before=s.writes;
  const t=page(s,'team'),v=page(s,'visitor');
  assert.ok(t.failures.length>=1);
  assert.ok(v.failures.length>=1);
  assert.equal(t.get('saveModes').disabled,true);
  assert.equal(s.store.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
  assert.equal(s.writes,before);
  assert.equal(v.get('chooseE1').disabled,true);
  assert.equal(v.get('chooseE2').disabled,true);
  assert.equal(s.store.has('STUDY1_UNIFIED_FIXTURE_V1'),false);
 }
});
