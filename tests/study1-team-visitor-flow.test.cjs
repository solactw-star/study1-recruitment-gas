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
const zlib=require('node:zlib');
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
const byteBuffer=v=>typeof v==='string'?Buffer.from(v,'utf8'):Buffer.from(v.map(x=>x&255));
const asBlob=v=>({getBytes:()=>[...byteBuffer(v)].map(x=>x>127?x-256:x),
 getDataAsString:()=>byteBuffer(v).toString('utf8')});
const fixtureUtilities={
 newBlob:v=>asBlob(v),
 gzip:b=>asBlob(zlib.gzipSync(byteBuffer(b.getBytes()))),
 ungzip:b=>asBlob(zlib.gunzipSync(byteBuffer(b.getBytes()))),
 base64Encode:bytes=>byteBuffer(bytes).toString('base64'),
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
  setProperty:(key,value)=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1','STUDY1_B01_OWNER_LAYOUT_V1'].includes(key));writes++;store.set(key,value);},
  deleteProperty:key=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1','STUDY1_B01_OWNER_LAYOUT_V1'].includes(key));store.delete(key);}
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
  style:{setProperty(){}},classList:{toggle(){},add(){},remove(){},contains(){return false;}},focus(){},scrollTop:0,
  addEventListener(type,handler){this.handlers[type]=handler;},
  setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},
  append(...els){for(const e of els)this.appendChild(e);},
  appendChild(el){this.children.push(el);
   if(this.tagName==='select'&&this.children.length===1&&!this.value)this.value=el.value;
   return el;
  },
  replaceChildren(...els){this.children=[...els];if(this.tagName==='select')
   this.value=this.children.length?this.children[0].value:'';
  },
  querySelector(selector){
   if(selector==='h2,h3')return {textContent:this.id};
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
 const profileTabs=[...html.matchAll(/<button[^>]*data-b04-tab="([^"]+)"[^>]*>/g)].map(m=>{
  const node=element('b04-tab-'+m[1],'button');node.dataset.b04Tab=m[1];return node;
 });
 const teamNav=[...html.matchAll(/<button\b[^>]*data-team-target="([^"]+)"[^>]*>/g)].map((m,i)=>{
  const n=element('nav-'+i,'button');n.dataset.teamTarget=m[1];
  const sub=/data-b02-target="([^"]+)"/.exec(m[0]);if(sub)n.dataset.b02Target=sub[1];
  return n;
 });
 const b02Tabs=[...html.matchAll(/<button\b[^>]*data-b02-tab="([^"]+)"[^>]*>/g)].map((m,i)=>{
  const n=element('b02-tab-'+i,'button');n.dataset.b02Tab=m[1];return n;
 });
 const teamSections=['b01Module','b09Module','calendarModule','b05Module','profileModule',
 'b11Module','teamExperimentModule','teamCopyModule','teamSlotsModule','teamWeeksModule',
 'b03Module','b06Module','b07Module','b08Module','b10Module','consentVersionsModule',
 'b12Module','teamApprovalModule'].filter(id=>ids.has(id)).map(id=>ids.get(id));
 const get=id=>{const e=ids.get(id);assert.ok(e,'Unknown element '+kind+': '+id);return e;};
 const query=selector=>{
  if(selector==='#slotRows [data-slot-id]')
   return get('slotRows').children.filter(x=>x.dataset.slotId);
  if(selector==='#weekRows [data-week]')
   return get('weekRows').children.filter(x=>x.dataset.week);
  if(selector==='.step')return [...ids.values()].filter(x=>x.id.startsWith('step-'));
  if(selector==='#progress span')return progress;
  if(selector==='[data-b04-tab]')return profileTabs;
  if(selector==='[data-team-target]')return teamNav;
  if(selector==='[data-b02-tab]')return b02Tabs;
  if(selector==='#teamMain > section.panel')return teamSections;
  throw Error('Unmocked querySelectorAll '+selector);
 };
 return {ids,get,doc:{getElementById:get,createElement:tag=>element('',tag),
  querySelectorAll:query,addEventListener(){}}};
}
function page(server,kind,options={}){
 const html=kind==='team'?teamHtml:demoHtml;
 const {ids,get,doc}=documentFor(html,kind),calls=[],failures=[];
 let success=null,failure=null,initialOwnerRead=false;
 const pendingOwnerReads=[],ownerReplyHistory=[],commandReplyHistory=[],commandAttemptHistory=[],pendingCommandReplies=[];
 const rpc={
  withSuccessHandler(fn){success=fn;return this;},
  withFailureHandler(fn){failure=fn;return this;},
  study1UnifiedPreviewGet(){calls.push('READ');
   const onSuccess=success,onFailure=failure;
   ownerReplyHistory.push({success:onSuccess,failure:onFailure});
   const deliver=()=>{
    try{const view=server.read();onSuccess(view);}
    catch(e){failures.push(String(e.message||e));onFailure(e);}
   };
   if(options.deferOwnerReads&&initialOwnerRead)pendingOwnerReads.push(deliver);
   else deliver();
   initialOwnerRead=true;
  },
  study1UnifiedB01LayoutGet(){calls.push('B01_GET');
   try{success(JSON.parse(JSON.stringify(server.ctx.study1UnifiedB01LayoutGet())));}
   catch(e){failures.push(String(e.message||e));failure(e);}
  },
  study1UnifiedB01LayoutSave(c){calls.push('B01_SAVE');
   try{success(JSON.parse(JSON.stringify(server.ctx.study1UnifiedB01LayoutSave(c))));}
   catch(e){failures.push(String(e.message||e));failure(e);}
  },
  study1UnifiedB12AuditPage(q){calls.push('B12_READ');
   try{success(JSON.parse(JSON.stringify(server.ctx.study1UnifiedB12AuditPage(q))));}
   catch(e){failures.push(String(e.message||e));failure(e);}
  },
  study1UnifiedB06Command(c){calls.push('B06_'+c.action);
   try{success(JSON.parse(JSON.stringify(server.ctx.study1UnifiedB06Command(c))));}
   catch(e){failures.push(String(e.message||e));failure(e);}
  },
  study1UnifiedPreviewCommand(c){calls.push(c.action);
   commandAttemptHistory.push(JSON.parse(JSON.stringify(c)));
   const onSuccess=success,onFailure=failure;
   try{
    const result=JSON.parse(JSON.stringify(server.ctx.study1UnifiedPreviewCommand(c)));
    // Run original GAS immediately, defer only the browser reply for races.
    const deliver=()=>onSuccess(result);
    commandReplyHistory.push({command:JSON.parse(JSON.stringify(c)),
     success:onSuccess,failure:onFailure,result});
    if(options.deferCommandReplies&&['MOVE','CANCEL'].includes(c.action))
     pendingCommandReplies.push(deliver);
    else deliver();
   }catch(e){failures.push(String(e.message||e));onFailure(e);}
  }
 };
 const context=vm.createContext({document:doc,google:{script:{run:rpc}},
  Date:options.Date||Date,Math,JSON,String,Object,Number,Array,Set,Map,Error,confirm:()=>true});
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
 return {kind,ids,get,click,change,set,calls,failures,context,pendingOwnerReads,
  ownerReplyHistory,commandReplyHistory,commandAttemptHistory,pendingCommandReplies,
  deliverOwnerRead(){assert.ok(pendingOwnerReads.length,'no pending OWNER GET');pendingOwnerReads.shift()();},
  deliverCommandReply(){assert.ok(pendingCommandReplies.length,'no pending command reply');pendingCommandReplies.shift()();}};
}
const closed=server=>{
 assert.equal(server.store.get('OPEN'),'false');
 assert.equal(server.store.get('CONSENT_READY'),'false');
 const expected=['CONSENT_READY','OPEN'];
 if(server.store.has('STUDY1_UNIFIED_FIXTURE_V1'))expected.push('STUDY1_UNIFIED_FIXTURE_V1');
 if(server.store.has('STUDY1_B06_TASKS_V1'))expected.push('STUDY1_B06_TASKS_V1');
 if(server.store.has('STUDY1_B01_OWNER_LAYOUT_V1'))expected.push('STUDY1_B01_OWNER_LAYOUT_V1');
 assert.deepEqual([...server.store.keys()].sort(),expected.sort());
 assert.equal(server.held,false);
 const view=server.read();
 assert.equal(view.open,false);assert.equal(view.consentReady,false);
 assert.equal(view.formalReadiness.activationAllowed,false);
 assert.equal(view.formalPorts.activated,false);
 assert.equal(view.policy.consent.E1.approval,'PENDING');
 assert.equal(view.policy.consent.E2.approval,'PENDING');
};
test('OWNER fail-closed read-only diagnostic identifies derived-vs-top-level mismatch, never exports data',()=>{
 const srv=server(),team=page(srv,'team'),original=srv.ctx.study1UnifiedPreviewGet;
 const before=srv.writes;
 srv.ctx.study1UnifiedPreviewGet=()=>{const x=original();x.waitlist.summary.total.total++;return x;};
 team.click('refresh');
 assert.match(team.get('status').textContent,/B03_WAITLIST_SUMMARY/);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=()=>{const x=original();x.recruitment.E1.year=2025;return x;};
 team.click('refresh');
 assert.match(team.get('status').textContent,/TOP_LEVEL_SHAPE_OR_SAFETY/);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=original;team.click('refresh');
 assert.equal(team.get('saveModes').disabled,false);
 closed(srv);
});

test('Cross-page: E2 defaults to 2027 coming soon; owner GET loads GUI and visitor without writes',()=>{
 const s=server(),before=s.writes;
 const team=page(s,'team'),visitor=page(s,'visitor');
 assert.deepEqual(team.calls,['READ','B01_GET']);assert.deepEqual(visitor.calls,['READ']);
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

test('Malformed owner team save success cannot falsely show saved or keep editing enabled',()=>{
 const s=server(),team=page(s,'team'),before=s.writes;
 s.ctx.study1UnifiedPreviewCommand=()=>({mode:'TEST',open:false,consentReady:false,
  formalReadiness:{activationAllowed:false},recruitment:{
   E1:{year:2026,mode:'DEMO_OPEN'},E2:{year:2027,mode:'COMING_SOON'}}});
 team.set('modeE1','COMING_SOON');team.click('saveModes');
 assert.match(team.get('status').textContent,/無法核實.*拒絕操作/);
 assert.doesNotMatch(team.get('status').textContent,/已儲存/);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(s.writes,before);
 closed(s);
});
test('Malformed visitor action success stops the synthetic flow and never enables selections',()=>{
 const s=server(),visitor=page(s,'visitor'),before=s.writes;
 s.ctx.study1UnifiedPreviewCommand=()=>({mode:'BROKEN'});
 visitor.click('chooseE1');
 assert.match(visitor.get('status').textContent,/回應無法驗證.*重新載入/);
 assert.equal(visitor.get('chooseE1').disabled,true);
 assert.equal(visitor.get('chooseE2').disabled,true);
 assert.equal(s.writes,before);
 closed(s);
});


test('B02 team GUI creates and persists a synthetic session through the shared RPC, then reloads it',()=>{
 const srv=server(),team=page(srv,'team');
 team.click('calNew');
 team.set('calEditTitle','模擬完整行事曆測試');
 team.set('calEditWhen','2028-02-21T10:00');
 team.set('calEditCapacity','3');
 team.set('calEditMinutes','90');
 team.set('calEditPlace','虛構研究教室');
 team.set('calRepeat','1');
 const form=team.get('calForm');
 assert.equal(typeof form.handlers.submit,'function');
 form.handlers.submit({preventDefault(){}});
 assert.ok(team.calls.includes('ADMIN_B02_SLOT'));
 assert.equal(srv.read().slots.some(s=>s.when==='2028-02-21 10:00'&&s.capacity===3),true);
 assert.equal(srv.read().b02.history.at(-1).action,'CREATE');
 const reload=page(srv,'team');
 assert.equal(reload.get('calDescription').textContent.includes('個符合條件的虛構場次'),true);
 assert.equal(srv.read().open,false);
 assert.equal(srv.read().consentReady,false);
});


test('B04 complete participant page works through original team GUI and preserves corrected note after reload',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});
 const team=page(srv,'team');
 const entry=team.get('entries').children[0];
 assert.ok(entry);
 const profileBtn=entry.children.find(x=>x.textContent==='開啟完整資料（B04）');
 assert.ok(profileBtn);
 profileBtn.handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 assert.match(team.get('profileHeading').textContent,/SIM-001.*實驗一/);
 assert.equal(team.get('profileSummary').children.length,8);
 const tabs=[...team.context.document.querySelectorAll('[data-b04-tab]')];
 assert.equal(tabs.length,8);
 const admin=tabs.find(x=>x.dataset.b04Tab==='admin');
 admin.handlers.click();
 assert.equal(team.get('profileNoteForm').hidden,false);
 team.set('profileNote','研究助理確認的虛構行政備註');
 team.set('profileReason','修正先前記載內容');
 const form=team.get('profileNoteForm');
 assert.equal(typeof form.handlers.submit,'function');
 form.handlers.submit({preventDefault(){}});
 assert.equal(team.failures.length,0);
 assert.ok(team.calls.includes('ADMIN_B04_NOTE'));
 assert.equal(srv.read().b04.notes['SIM-001'],'研究助理確認的虛構行政備註');
 assert.equal(srv.read().b04.history[0].actor,'OWNER');
 assert.equal(srv.read().open,false);
 const audit=tabs.find(x=>x.dataset.b04Tab==='audit');
 audit.handlers.click();
 assert.match(team.get('profileTabBody').children[0].textContent,/操作歷程/);
 team.click('profileBack');
 assert.equal(team.get('profileModule').hidden,true);
 const reload=page(srv,'team');
 reload.get('entries').children[0].children.find(x=>x.textContent==='開啟完整資料（B04）').handlers.click();
 const latest=[...reload.context.document.querySelectorAll('[data-b04-tab]')].find(x=>x.dataset.b04Tab==='admin');
 latest.handlers.click();
 assert.equal(reload.get('profileNote').value,'研究助理確認的虛構行政備註');
 closed(srv);
});


test('B03 list and kanban share the SAME participants, filters, and return-to-board position',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E2'});
 const writes=srv.writes;
 const team=page(srv,'team');
 assert.equal(team.get('entries').children.length,2,'initial list is the same application array');
 assert.match(team.get('bookingSummary').textContent,/顯示 2／共 2 筆/);
 team.set('b03Experiment','E1');team.change('b03Experiment');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children[0].textContent,/SIM-001.*實驗一/);
 team.click('b03BoardMode');
 assert.equal(team.get('b03Board').hidden,false);
 assert.equal(team.get('b03ListView').hidden,true);
 assert.equal(team.get('b03Board').children.length,1,'only E1 board group is shown');
 const columns=team.get('b03Board').children[0].children.find(x=>x.className==='b03Columns');
 assert.equal(columns.children.length,6);
 const card=columns.children[0].children.find(x=>x.dataset.participantId==='SIM-001');
 assert.ok(card,'the same E1 participant appears in the board');
 card.handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 team.click('profileBack');
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('b03Board').hidden,false,'board filter and view survive B04 return');
 assert.equal(team.get('b03Experiment').value,'E1');
 team.click('b03ListMode');
 assert.equal(team.get('entries').children.length,1);
 team.set('b03Search','SIM-999');team.get('b03Search').handlers.input();
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('b03Empty').hidden,false);
 team.click('b03Clear');
 assert.equal(team.get('entries').children.length,2);
 assert.equal(team.get('b03Empty').hidden,true);
 team.set('b03Sort','ID_DESC');team.change('b03Sort');
 assert.match(team.get('entries').children[0].children[0].textContent,/SIM-002/);
 assert.equal(srv.writes,writes,'B03 viewing, filtering and B04 navigation do not mutate source');
 closed(srv);
});



test('P1 B03 readback reconciles B02 attendance and B04 booking under one owner TEST revision',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E2'});
 const original=srv.read,team=page(srv,'team'),writes=srv.writes;
 team.set('b03Experiment','E1');team.change('b03Experiment');
 team.click('b03BoardMode');
 const firstCalls=team.calls.filter(x=>x==='READ').length;
 team.click('b03Reconcile');
 assert.equal(team.calls.filter(x=>x==='READ').length,firstCalls+1);
 assert.match(team.get('b03ReconcileStatus').textContent,/虛構代碼 2 筆/);
 assert.equal(team.get('b03Board').hidden,false,'board and E1 filter survive readback');
 assert.equal(team.get('b03Experiment').value,'E1');
 assert.equal(srv.writes,writes,'readback does not write fixture');
 // A simulated newer GET snapshot must propagate identical B02 attendance
 // into the B03 board and B04 booking tab, with no other data store.
 srv.read=()=>{
  const d=original(),a=d.applications.find(x=>x.experiment==='E1'),
   slot=d.slots.find(x=>x.experiment==='E1');
  a.slotId=slot.id;a.phase='CONFIRMED';d.revision++;
  d.b02.attendance[a.id]={attendance:'PRESENT',progress:'PARTIAL',note:''};
  return d;
 };
 team.click('b03Reconcile');
 assert.match(team.get('b03ReconcileStatus').textContent,/已登錄出席 1 筆/);
 const group=team.get('b03Board').children[0];
 const columns=group.children.find(x=>x.className==='b03Columns');
 const btn=columns.children.flatMap(x=>x.children).find(x=>x.dataset.participantId==='SIM-001');
 assert.match(btn.textContent,/已出席/);
 btn.handlers.click();
 const bookingTab=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 bookingTab.handlers.click();
 assert.match(team.get('profileTabBody').children.map(x=>x.textContent).join(' '),/預約出席/);
 assert.match(team.get('profileSummary').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/已出席/);
 assert.equal(srv.writes,writes);
 srv.read=original;closed(srv);
});

test('P1 B03 readback refuses cross-experiment booking drift, clears stale B04/B03 and recovers',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const realRead=srv.read,team=page(srv,'team'),writes=srv.writes;
 const bad=realRead();bad.applications[0].slotId='SIM-SLOT-E2-Z';
 srv.read=()=>bad;
 team.click('b03Reconcile');
 assert.match(team.get('b03ReconcileStatus').textContent,/不一致/);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('b03Board').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('b03Reconcile').disabled,true);
 assert.equal(srv.writes,writes);
 srv.read=()=>{throw Error('OWNER revoked');};
 team.click('refresh');
 assert.match(team.get('b03ReconcileStatus').textContent,/清空/);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(srv.writes,writes);
 srv.read=realRead;team.click('refresh');
 assert.equal(team.get('entries').children.length,1,'only a fresh safe GET restores listing');
 assert.equal(team.get('b03Reconcile').disabled,false);
 assert.equal(srv.writes,writes);
 closed(srv);
});


test('P1 B04 note correction needs a second OWNER GET and updates B03 latest order after reload',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});srv.command('START',{experiment:'E2'});
 const team=page(srv,'team'),writes=srv.writes;
 team.set('b03Sort','UPDATED_DESC');team.change('b03Sort');
 team.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 const admin=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='admin');admin.handlers.click();
 team.set('profileNote','TEST 行政資料第一次更正');
 team.set('profileReason','原測試資料補充更正');
 const start=team.calls.length;
 team.get('profileNoteForm').handlers.submit({preventDefault(){}});
 assert.deepEqual(team.calls.slice(start).filter(x=>x!=='B01_GET'),['ADMIN_B04_NOTE','READ'],
  'one command followed by exactly one independent original GAS GET');
 assert.equal(srv.writes,writes+1,'exactly one TEST fixture write');
 assert.match(team.get('profileMessage').textContent,/獨立回讀確認/);
 assert.match(team.get('b03ReconcileStatus').textContent,/B03清單與看板最近更新同步/);
 assert.equal(team.get('entries').children[0].dataset.participantId,'SIM-001',
  'updated E1 note sorts before unchanged E2');
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/最近更新/);
 team.click('profileBack');team.click('b03BoardMode');
 const groups=team.get('b03Board').children;
 const column=groups[0].children.find(x=>x.className==='b03Columns');
 const card=column.children.flatMap(c=>c.children).find(x=>x.dataset.participantId==='SIM-001');
 assert.match(card.textContent,/最近更新 20/,'B03 board exposes the same saved timestamp');
 const reopened=page(srv,'team');
 reopened.set('b03Sort','UPDATED_DESC');reopened.change('b03Sort');
 assert.equal(reopened.get('entries').children[0].dataset.participantId,'SIM-001');
 reopened.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 [...reopened.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='admin').handlers.click();
 assert.equal(reopened.get('profileNote').value,'TEST 行政資料第一次更正');
 assert.match(reopened.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/原測試資料補充更正/);
 closed(srv);
});
test('P1 stale B04 owner tab refuses CAS, clears B03/B04 and never auto-replays',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const a=page(srv,'team'),b=page(srv,'team');
 const openAdmin=t=>{
  t.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
  [...t.context.document.querySelectorAll('[data-b04-tab]')]
   .find(x=>x.dataset.b04Tab==='admin').handlers.click();
 };
 openAdmin(a);openAdmin(b);
 a.set('profileNote','第一個視窗的行政更正');a.set('profileReason','先更新原始資料');
 a.get('profileNoteForm').handlers.submit({preventDefault(){}});
 const rev=srv.read().revision,writes=srv.writes;
 b.set('profileNote','舊視窗不應覆蓋');b.set('profileReason','另一份舊版更正');
 const before=b.calls.length;
 b.get('profileNoteForm').handlers.submit({preventDefault(){}});
 assert.deepEqual(b.calls.slice(before),['ADMIN_B04_NOTE'],'no automatic retry/GET on stale command');
 assert.equal(srv.writes,writes);assert.equal(srv.read().revision,rev);
 assert.equal(srv.read().b04.notes['SIM-001'],'第一個視窗的行政更正');
 assert.equal(b.get('entries').children.length,0);assert.equal(b.get('profileModule').hidden,true);
 assert.equal(b.get('profileSaveNote').disabled,true);
 assert.match(b.get('b03ReconcileStatus').textContent,/版本競寫/);
 b.click('refresh');assert.equal(b.get('entries').children.length,1);
 assert.equal(srv.writes,writes);closed(srv);
});
test('P1 B04 post-commit OWNER GET denial is uncertain and fail closed, no second write',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const realRead=srv.read,team=page(srv,'team');
 team.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 [...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='admin').handlers.click();
 team.set('profileNote','已提交但回讀遭撤權');team.set('profileReason','測試授權撤銷');
 const writes=srv.writes,revision=realRead().revision;
 srv.read=()=>{throw Error('OWNER revoked');};
 const start=team.calls.length;
 team.get('profileNoteForm').handlers.submit({preventDefault(){}});
 assert.deepEqual(team.calls.slice(start),['ADMIN_B04_NOTE','READ']);
 assert.equal(srv.writes,writes+1);assert.equal(srv.ctx.study1UnifiedPreviewGet().revision,revision+1);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.match(team.get('b03ReconcileStatus').textContent,/結果不明/);
 assert.doesNotMatch(team.get('b03ReconcileStatus').textContent,/已獨立回讀/);
 srv.read=realRead;team.click('refresh');
 assert.equal(team.get('entries').children.length,1);
 assert.equal(srv.writes,writes+1,'refresh is read-only, no command replay');
 closed(srv);
});
test('P1 B04 rejects forged success audit and never claims independent readback',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const team=page(srv,'team'),realCommand=srv.ctx.study1UnifiedPreviewCommand;
 team.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 [...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='admin').handlers.click();
 team.set('profileNote','真正的備註');team.set('profileReason','檢查返回歷程');
 const writes=srv.writes;
 srv.ctx.study1UnifiedPreviewCommand=(c)=>{
  const result=realCommand(c);
  if(c.action==='ADMIN_B04_NOTE')result.b04.history.at(-1).after='假造更正';
  return result;
 };
 const before=team.calls.length;
 team.get('profileNoteForm').handlers.submit({preventDefault(){}});
 assert.deepEqual(team.calls.slice(before),['ADMIN_B04_NOTE'],'must reject before independent GET');
 assert.equal(srv.writes,writes+1);assert.equal(team.get('entries').children.length,0);
 assert.match(team.get('b03ReconcileStatus').textContent,/無法證實/);
 srv.ctx.study1UnifiedPreviewCommand=realCommand;
 team.click('refresh');assert.equal(team.get('entries').children.length,1);
 assert.equal(srv.writes,writes+1);closed(srv);
});


test('P1 B03 recent-source filter unifies real B02 ATTEND, B04 correction and B04 timeline (TEST)',()=>{
 const srv=server();
 v08ConfirmedVisitor_(srv);
 srv.command('START',{experiment:'E2'});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:''});
 srv.command('ADMIN_B04_NOTE',{id:'SIM-002',note:'虛構行政確認備註',reason:'模擬來源整理'});
 const writes=srv.writes,team=page(srv,'team');
 assert.equal(team.get('entries').children.length,2);
 team.set('b03Sort','UPDATED_DESC');team.change('b03Sort');
 team.set('b03UpdateSource','B02');team.change('b03UpdateSource');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-001']);
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/B02出席／施測更正/);
 team.click('b03BoardMode');
 const e1=team.get('b03Board').children.find(x=>x.children[0].textContent.includes('實驗一'));
 const card=e1.children.find(x=>x.className==='b03Columns').children
  .flatMap(x=>x.children).find(x=>x.dataset.participantId==='SIM-001');
 assert.match(card.textContent,/B02出席／施測更正/);
 card.handlers.click();
 const audit=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');
 audit.handlers.click();
 const details=team.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' ');
 assert.match(details,/出席與施測更新（B02／B04）/);
 assert.match(details,/PRESENT \/ PARTIAL/);
 team.click('profileBack');
 team.set('b03UpdateSource','B04');team.change('b03UpdateSource');
 assert.deepEqual(team.get('b03Board').children.flatMap(g=>g.children.filter(x=>x.className==='b03Columns'))
  .flatMap(g=>g.children).flatMap(x=>x.children).filter(x=>x.dataset.participantId)
  .map(x=>x.dataset.participantId),['SIM-002']);
 team.click('b03ListMode');
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/B04行政備註更正/);
 team.click('b03Reconcile');
 assert.equal(team.get('b03UpdateSource').value,'B04','source filter survives verified GET');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-002']);
 team.set('b03UpdateSource','NONE');team.change('b03UpdateSource');
 assert.equal(team.get('entries').children.length,0);
 team.click('b03Clear');assert.equal(team.get('b03UpdateSource').value,'ALL');
 assert.equal(team.get('entries').children.length,2);
 assert.equal(srv.writes,writes,'source filter, board and audit are read-only');
 closed(srv);
});

test('P1 B02 unchanged attendance confirmation has provenance but does not fabricate a B04 correction',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PENDING',progress:'NOT_STARTED',note:''});
 const source=srv.read();
 assert.equal(source.b04.history.filter(h=>h.id==='SIM-001').length,0);
 assert.equal(source.b02.history.at(-1).action,'ATTEND');
 const team=page(srv,'team'),writes=srv.writes;
 team.set('b03UpdateSource','B02');team.change('b03UpdateSource');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/B02出席重新確認/);
 team.get('entries').children[0].children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 const audit=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');
 audit.handlers.click();
 assert.match(team.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/B02出席狀態重新確認/);
 assert.equal(srv.writes,writes);
 closed(srv);
});

test('P1 B03 provenance guard rejects orphan B02 attendance event and divergent last B04 value',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:''});
 const normal=srv.read,team=page(srv,'team'),writes=srv.writes;
 const forged=normal();forged.b04.history.at(-1).after='ABSENT / COMPLETE';
 srv.read=()=>forged;
 team.click('b03Reconcile');
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('b03Board').children.length,0);
 assert.equal(team.get('b03Reconcile').disabled,true);
 assert.match(team.get('b03ReconcileStatus').textContent,/不一致/);
 srv.read=()=>{const d=normal();d.b02.history.at(-1).ids=['SIM-999'];return d;};
 team.click('refresh');assert.equal(team.get('entries').children.length,0);
 srv.read=normal;team.click('refresh');
 assert.equal(team.get('entries').children.length,1);
 assert.equal(srv.writes,writes,'no unsafe source is written back or auto-repaired');
 closed(srv);
});


/* P1 B02-B attendance edit reuses original calendar PERSON panel. */
function p1B02PersonPanel_(team,id='SIM-001'){
 const row=team.get('entries').children.find(x=>x.dataset.participantId===id);
 assert.ok(row,'original B03 participant row exists');
 row.children.find(x=>/開啟完整資料/.test(x.textContent)).handlers.click();
 team.click('profileCalendar');
 assert.equal(team.get('calPersonDetail').hidden,false);
 assert.match(team.get('calPersonTitle').textContent,new RegExp(id));
}
test('P1 B02 attendance writes once then independently GETs B03 board and B04 audit state',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team'),before=srv.writes;
 p1B02PersonPanel_(team);
 team.set('b03Sort','UPDATED_DESC');team.change('b03Sort');
 team.set('calAttendance','PRESENT');
 team.set('calProgress','PARTIAL');
 team.set('calNote','模擬出席紀錄');
 const from=team.calls.length;
 team.click('calSavePerson');
 assert.deepEqual(team.calls.slice(from).filter(x=>x!=='B01_GET'),['ADMIN_B02_ATTEND','READ']);
 assert.equal(srv.writes,before+1,'exactly one owner-only synthetic write');
 assert.match(team.get('calStatusMessage').textContent,/獨立回讀確認/);
 assert.match(team.get('b03ReconcileStatus').textContent,/B03清單看板、B04出席及有限歷程同來源同步/);
 const state=srv.read();
 assert.equal(state.b02.attendance['SIM-001'].attendance,'PRESENT');
 assert.equal(state.b02.attendance['SIM-001'].progress,'PARTIAL');
 assert.equal(state.b02.attendance['SIM-001'].note,'模擬出席紀錄');
 assert.equal(state.b04.history.at(-1).field,'attendanceAndProgress');
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/B02出席／施測更正/);
 team.click('b03BoardMode');
 const card=team.get('b03Board').children.flatMap(g=>g.children)
  .filter(x=>x.className==='b03Columns').flatMap(g=>g.children)
  .flatMap(g=>g.children).find(x=>x.dataset.participantId==='SIM-001');
 assert.ok(card);assert.match(card.textContent,/已出席/);
 assert.match(card.textContent,/B02出席／施測更正/);
 card.handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 booking.handlers.click();
 const bookingGrid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 const bookingValues=bookingGrid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' ');
 assert.match(bookingValues,/已出席/);
 assert.match(bookingValues,/部分完成/);
 const research=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='research');
 research.handlers.click();
 const researchGrid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 const researchValues=researchGrid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' ');
 assert.match(researchValues,/模擬出席紀錄/);
 const timeline=team.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' ');
 assert.match(timeline,/出席與施測更新（B02／B04）/);
 assert.match(timeline,/模擬出席紀錄/);
 assert.equal(srv.writes,before+1,'cross-page views do not create another write');
 closed(srv);
});
test('P1 B02 identical attendance confirmation has B02 event but no invented B04 correction',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team'),before=srv.writes;
 p1B02PersonPanel_(team);
 const at=team.calls.length;
 team.click('calSavePerson');
 assert.deepEqual(team.calls.slice(at).filter(x=>x!=='B01_GET'),['ADMIN_B02_ATTEND','READ']);
 assert.equal(srv.writes,before+1);
 const state=srv.read();
 assert.equal(state.b02.history.at(-1).action,'ATTEND');
 assert.equal(state.b04.history.length,0);
 assert.match(team.get('calStatusMessage').textContent,/獨立回讀確認/);
 assert.match(team.get('entries').children[0].children.at(-1).textContent,/B02出席重新確認/);
 closed(srv);
});
test('P1 B02 two-owner-tab stale CAS clears B03 and B04 without automatic retry',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const first=page(srv,'team'),stale=page(srv,'team');
 p1B02PersonPanel_(first);p1B02PersonPanel_(stale);
 first.set('calAttendance','PRESENT');
 first.set('calProgress','PARTIAL');
 first.click('calSavePerson');
 const currentRev=srv.read().revision,writes=srv.writes;
 stale.set('calAttendance','ABSENT');stale.set('calProgress','NOT_STARTED');
 const from=stale.calls.length;stale.click('calSavePerson');
 assert.deepEqual(stale.calls.slice(from),['ADMIN_B02_ATTEND'],'no GET or retry on rejected stale CAS');
 assert.equal(srv.writes,writes);assert.equal(srv.read().revision,currentRev);
 assert.equal(srv.read().b02.attendance['SIM-001'].attendance,'PRESENT');
 assert.equal(stale.get('entries').children.length,0);
 assert.equal(stale.get('profileModule').hidden,true);
 assert.equal(stale.get('calPersonDetail').hidden,true);
 assert.equal(stale.get('calSavePerson').disabled,true);
 assert.match(stale.get('calStatusMessage').textContent,/CAS版本競寫/);
 stale.click('refresh');
 assert.equal(stale.get('entries').children.length,1);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 B02 independent GET OWNER revocation leaves write uncertain and never resubmits',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team'),read=srv.read;
 p1B02PersonPanel_(team);
 team.set('calAttendance','LATE');team.set('calProgress','IN_PROGRESS');
 const before=srv.writes,rev=read().revision;
 srv.read=()=>{throw Error('OWNER source revoked');};
 const from=team.calls.length;team.click('calSavePerson');
 assert.deepEqual(team.calls.slice(from),['ADMIN_B02_ATTEND','READ']);
 assert.equal(srv.writes,before+1);
 assert.equal(srv.ctx.study1UnifiedPreviewGet().revision,rev+1);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('calPersonDetail').hidden,true);
 assert.match(team.get('calStatusMessage').textContent,/OWNER撤權/);
 assert.doesNotMatch(team.get('calStatusMessage').textContent,/獨立回讀確認/);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('entries').children.length,1);
 assert.equal(srv.writes,before+1);
 closed(srv);
});
test('P1 B02 forged success audit is rejected before GET; original GAS source remains recoverable',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team'),real=srv.ctx.study1UnifiedPreviewCommand;
 p1B02PersonPanel_(team);
 team.set('calAttendance','PRESENT');team.set('calProgress','COMPLETE');
 const before=srv.writes;
 srv.ctx.study1UnifiedPreviewCommand=command=>{
  const result=real(command);
  if(command.action==='ADMIN_B02_ATTEND')result.b04.history.at(-1).after='ABSENT / NOT_STARTED';
  return result;
 };
 const from=team.calls.length;team.click('calSavePerson');
 assert.deepEqual(team.calls.slice(from),['ADMIN_B02_ATTEND']);
 assert.equal(srv.writes,before+1);
 assert.equal(team.get('entries').children.length,0);
 assert.match(team.get('calStatusMessage').textContent,/回應不可信/);
 srv.ctx.study1UnifiedPreviewCommand=real;team.click('refresh');
 assert.equal(team.get('entries').children.length,1);
 assert.equal(srv.writes,before+1);
 closed(srv);
});

test('B05 is reachable from existing calendar, shows original session and returns without writes',()=>{
 const srv=server(),before=srv.writes;
 const team=page(srv,'team');
 team.set('calExperiment','ALL');team.set('calStatus','ALL');team.set('calSearch','');
 team.set('calView','day');team.set('calDate','2027-01-05');team.change('calDate');
 const findDeep=(root,fn)=>{
  if(fn(root))return root;
  for(const child of root.children||[]){const match=findDeep(child,fn);if(match)return match;}
  return null;
 };
 const card=findDeep(team.get('calBoard'),x=>x.dataset&&x.dataset.sessionId==='SIM-SLOT-E1-A');
 assert.ok(card,JSON.stringify({error:'calendar contains original first E1 session',
  calendarDate:team.get('calDate').value,view:team.get('calView').value,
  description:team.get('calDescription').textContent,
  slots:srv.read().slots.map(s=>({id:s.id,when:s.when})),
  cells:team.get('calBoard').children.map(c=>({date:c.children?.[0]?.textContent,
   childCount:c.children?.length,
   ids:c.children?.map(x=>x.dataset?.sessionId||x.textContent?.slice(0,45))}))}));
 card.handlers.click();
 const button=findDeep(team.get('calSessionDetail'),x=>x.textContent==='研究現場與結案（B05）');
 assert.ok(button,'B02 existing session panel has a B05 entry');
 button.handlers.click();
 assert.equal(team.get('b05Module').hidden,false);
 assert.match(team.get('b05Heading').textContent,/SIM-SLOT-E1-A/);
 assert.equal(team.get('b05Summary').children.length,8);
 assert.equal(team.get('b05Close').disabled,true,'future session cannot close prematurely');
 assert.match(team.get('b05Checks').textContent,/不能提前結案/);
 team.click('b05Back');
 assert.equal(team.get('b05Module').hidden,true);
 assert.equal(srv.writes,before,'open and return must not write research data');
 closed(srv);
});


test('B06 original team GUI manually creates, completes, reopens, edits, archives and restores after reload',()=>{
 const srv=server(),before=srv.writes;
 const team=page(srv,'team');
 assert.match(team.get('b06Overview').textContent,/未完成 0/);
 assert.equal(srv.store.has('STUDY1_B06_TASKS_V1'),false,'GET does not write fixture');
 team.set('b06Title','人工整理虛構文件');
 team.set('b06Description','研究行政手動測試，不輸入真人資訊');
 team.set('b06Reason','人工建立行政事項');
 team.get('b06Form').handlers.submit({preventDefault(){}});
 assert.equal(team.failures.length,0);
 assert.ok(team.calls.includes('B06_CREATE'));
 let tasks=srv.read().b06.tasks;
 assert.equal(tasks.length,1);assert.equal(tasks[0].title,'人工整理虛構文件');
 assert.equal(tasks[0].status,'OPEN');
 assert.match(team.get('b06Overview').textContent,/未完成 1/);
 assert.equal(team.get('b06List').children.length,1);
 const actions=()=>team.get('b06List').children[0].children
   .find(el=>el.className==='b06Actions').children;
 const clickAction=label=>{
  const b=actions().find(x=>x.textContent===label);
  assert.ok(b,'B06 action missing '+label);
  b.handlers.click();
 };
 clickAction('勾選完成');
 assert.equal(srv.read().b06.tasks[0].status,'DONE');
 clickAction('重新開啟');
 assert.equal(srv.read().b06.tasks[0].status,'OPEN');
 clickAction('編輯');
 assert.equal(team.get('b06FormHeading').textContent,'編輯 SIM-TASK-000001');
 team.set('b06Title','更新後的虛構文件');
 team.set('b06Reason','研究助理修正欄位');
 team.get('b06Form').handlers.submit({preventDefault(){}});
 assert.equal(srv.read().b06.tasks[0].title,'更新後的虛構文件');
 clickAction('封存');
 assert.equal(srv.read().b06.tasks[0].archived,true);
 assert.equal(team.get('b06List').children.length,0,'archive hidden in active filter');
 team.set('b06Archive','ARCHIVED');team.change('b06Archive');
 assert.equal(team.get('b06List').children.length,1);
 clickAction('還原封存');
 assert.equal(srv.read().b06.tasks[0].archived,false);
 assert.equal(team.get('b06List').children.length,0,'restored item hidden from archived-only filter');
 team.set('b06Archive','ACTIVE');team.change('b06Archive');
 clickAction('查看歷程');
 assert.equal(team.get('b06History').children.length,6);
 assert.match(team.get('b06History').children[0].textContent,/還原封存/);
 const reloaded=page(srv,'team');
 assert.equal(reloaded.get('b06List').children.length,1);
 assert.match(reloaded.get('b06List').children[0].children[0].textContent,/更新後的虛構文件/);
 assert.equal(reloaded.get('b06Overview').textContent.includes('未完成 1'),true);
 assert.ok(srv.writes>=before+6);
 assert.equal(srv.read().revision,0,'B06 never changes old B02-B05 shared revision');
 closed(srv);
});

test('B08 original team UI filters the SAME synthetic notification and safely retries without sending mail',()=>{
 const srv=server();
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false};
 srv.command('START',{experiment:'E1'});
 srv.command('SCREEN',{id:'SIM-001',answers});
 srv.command('OTP_REQUEST',{id:'SIM-001'});
 srv.command('OTP_VERIFY',{id:'SIM-001',code:'00000000'});
 srv.command('HOLD',{id:'SIM-001',slotId:'SIM-SLOT-E1-A'});
 const version=srv.read().policy.consent.E1.version;
 srv.command('CONSENT_REVIEW',{id:'SIM-001',version,sha256:''});
 srv.command('CONSENT',{id:'SIM-001',accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
 srv.command('CONFIRM',{id:'SIM-001'});
 let original=srv.read().notifications[0];
 assert.equal(original.status,'SIM_PENDING');
 assert.equal(original.index,0);
 const initialText=original.text;
 const team=page(srv,'team'),writes=srv.writes;
 assert.equal(team.get('b08List').children.length,1);
 assert.match(team.get('b08Summary').textContent,/待模擬 1/);
 assert.match(team.get('b08List').children[0].children[2].textContent,/僅預覽，未寄送/);
 assert.equal(srv.writes,writes,'filter/render has zero writes');
 team.set('b08Search','non-existing-name');
 team.get('b08Search').handlers.input();
 assert.equal(team.get('b08List').children.length,1);
 assert.match(team.get('b08List').children[0].textContent,/沒有符合/);
 team.set('b08Search','SIM-001');team.get('b08Search').handlers.input();
 assert.equal(team.get('b08List').children.length,1);
 team.set('b08Event','CANCEL');team.change('b08Event');
 assert.match(team.get('b08List').children[0].textContent,/沒有符合/);
 team.set('b08Event','ALL');team.change('b08Event');
 const action=(label)=>{
  const card=team.get('b08List').children[0];
  const controls=card.children.find(el=>el.className==='b06Actions');
  assert.ok(controls,'existing owner-only synthetic action controls');
  const button=controls.children.find(el=>el.textContent===label);
  assert.ok(button,'notification action '+label);
  assert.equal(button.disabled,false);button.handlers.click();
 };
 action('模擬失敗');
 assert.equal(team.failures.length,0);
 assert.ok(team.calls.includes('ADMIN_NOTIFY_ATTEMPT'));
 assert.equal(srv.read().notifications[0].status,'SIM_FAILED');
 assert.equal(srv.read().notifications[0].lastError,'SIMULATED_FAILURE');
 assert.equal(srv.read().notifications[0].attempts,1);
 assert.match(team.get('b08Summary').textContent,/模擬失敗 1/);
 // Editing the shared *current* template cannot overwrite historical content.
 srv.command('ADMIN_EDIT',{title:'測試網站',notice:'僅示範',
  emailTemplate:'新虛構模板，絕不真正寄送'});
 assert.equal(srv.read().notifications[0].text,initialText);
 // Reload because a separate test-owner operation advanced the revision.
 const refreshed=page(srv,'team');
 const card=refreshed.get('b08List').children[0];
 const controls=card.children.find(el=>el.className==='b06Actions');
 const successful=controls.children.find(el=>el.textContent==='模擬交付成功（不寄信）');
 assert.equal(successful.disabled,false);successful.handlers.click();
 assert.equal(refreshed.failures.length,0);
 assert.equal(srv.read().notifications[0].status,'SIM_DELIVERED');
 assert.equal(srv.read().notifications[0].attempts,2);
 assert.equal(srv.read().notifications[0].lastError,null);
 assert.equal(srv.read().notifications[0].text,initialText);
 assert.match(refreshed.get('b08Summary').textContent,/模擬交付成功 1/);
 assert.match(refreshed.get('b08Message').textContent,/沒有寄送真實郵件/);
 assert.equal(refreshed.get('b08List').children[0].children
   .find(el=>el.className==='b06Actions').children.filter(x=>x.tagName==='button')
   .every(x=>x.disabled),true,'no repeated attempt after simulated completion');
 closed(srv);
 assert.equal(srv.store.has('STUDY1_B08_NOTIFICATIONS_V1'),false,
  'B08 uses the single original test fixture; no parallel storage');
});
test('B08 stale version fails closed and does not falsely report a simulated delivery',()=>{
 const srv=server();
 // Prepare a synthetic notification ONLY via existing in-memory TEST fixture.
 srv.command('START',{experiment:'E1'});
 const state=srv.ctx.study1UnifiedRead_();
 state.notifications.push({id:'SIM-001',event:'CONFIRM',
  text:'〔SIM 確認〕虛構通知（僅預覽，未寄送）',
  status:'SIM_PENDING',attempts:0,lastError:null});
 const value=JSON.stringify(state);
 srv.store.set('STUDY1_UNIFIED_FIXTURE_V1',value);
 const a=page(srv,'team'),b=page(srv,'team');
 // Two tabs share the same revision, only first should commit.
 const first=a.get('b08List').children[0].children.find(x=>x.className==='b06Actions').children[0];
 const stale=b.get('b08List').children[0].children.find(x=>x.className==='b06Actions').children[1];
 first.handlers.click();
 assert.equal(srv.read().notifications[0].status,'SIM_FAILED');
 const writes=srv.writes;
 stale.handlers.click();
 assert.match(b.get('b08Message').textContent,/模擬未完成|版本已變更/);
 assert.equal(srv.writes,writes);
 assert.equal(srv.read().notifications[0].status,'SIM_FAILED');
 assert.equal(srv.read().notifications[0].attempts,1);
 closed(srv);
});

test('B09 uses exactly the B01 shared owner TEST snapshot: no new RPC, writes or export',()=>{
 const srv=server();const before=srv.writes;const team=page(srv,'team');
 assert.ok(team.get('b09Metrics').children.length>=10);
 assert.equal(team.get('b09Metrics').children[0].children[1].textContent,
  team.get('b01Cards').children[0].children[1].textContent,
  'all-time application code count agrees with original B01');
 assert.equal(team.get('b09Metrics').children[2].children[1].textContent,
  String(srv.read().slots.length),'calendar total agrees with B02');
 assert.equal(team.get('b09ByExperiment').children.length,2);
 assert.equal(team.get('b09Trend').children.length>=1,true);
 assert.match(team.get('b09Notes').textContent,/沒有跨申請代碼的真人身分去重/);
 assert.match(team.get('b09Notes').textContent,/CSV／XLSX匯出.*未開放/);
 assert.equal(team.calls.filter(x=>x!=='READ'&&x!=='B01_GET').length,0,'report does not call a mutation RPC');
 assert.equal(srv.writes,before);
 assert.equal(srv.store.has('STUDY1_B09_REPORT_V1'),false);
 closed(srv);
});
test('B09 E1/E2 filters, phase, correct eligibility denominator and inclusive session-date filter',()=>{
 const srv=server();
 const add=(exp)=>srv.command('START',{experiment:exp});
 add('E1');add('E1');add('E1');add('E2');
 const original=srv.ctx.study1UnifiedRead_(),slots=original.slots;
 const e1=slots.filter(x=>x.experiment==='E1'),e2=slots.find(x=>x.experiment==='E2');
 assert.equal(e1.length>=2,true);
 const [a,b,c,d]=original.applications;
 Object.assign(a,{phase:'CONFIRMED',eligible:true,slotId:e1[0].id});
 Object.assign(b,{phase:'CONFIRMED',eligible:true,slotId:e1[1].id});
 Object.assign(c,{phase:'CANCELLED',eligible:false,slotId:e1[0].id});
 Object.assign(d,{phase:'CONFIRMED',eligible:true,slotId:e2.id});
 original.b02.attendance[a.id]={attendance:'PRESENT',progress:'COMPLETE',note:''};
 original.b02.attendance[b.id]={attendance:'ABSENT',progress:'PARTIAL',note:''};
 original.b02.attendance[d.id]={attendance:'LATE',progress:'COMPLETE',note:''};
 original.b02.sessions[e1[1].id]={title:'虛構已取消的場次',place:'',
  minutes:90,group:'',status:'CANCELLED'};
 srv.store.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(original));
 const writes=srv.writes,team=page(srv,'team');
 const metric=n=>team.get('b09Metrics').children[n].children[1].textContent;
 assert.equal(metric(0),'4','all-time unique synthetic applications');
 assert.equal(metric(2),'3','only non-cancelled E1+E2 slots');
 assert.equal(metric(3),'2','exclude cancelled application and cancelled session');
 assert.match(metric(4),/^2\/2（100\.0%）/,'confirmed denominator is active slot-related codes');
 assert.match(metric(5),/^2\/2（100\.0%）/,'PRESENT/LATE count, not ABSENT');
 assert.match(metric(6),/^2\/2（100\.0%）/,'COMPLETE means synthetic administrative progress only');
 team.set('b09Scope','E1');team.change('b09Scope');
 assert.equal(team.get('b09ByExperiment').children.length,1);
 assert.equal(metric(0),'3','date filters never silently remove unassigned/all-time applications');
 assert.equal(metric(3),'1','E1 E1-B cancelled session excluded');
 assert.match(metric(1),/^2\/3（66\.7%）/,'eligible evaluated denominator: 3 including failed');
 team.set('b09Start',e1[0].when.slice(0,10));
 team.change('b09Start');
 team.set('b09End',e1[0].when.slice(0,10));
 team.change('b09End');
 assert.equal(metric(0),'3','all-time application count independent of session date');
 assert.equal(metric(2),'1','one selected noncancelled session');
 assert.equal(team.get('b09Trend').children.length,1);
 assert.equal(team.get('b09Trend').children[0].children[0].textContent,e1[0].when.slice(0,10));
 assert.equal(metric(3),'1');
 team.set('b09Phase','INELIGIBLE');team.change('b09Phase');
 assert.equal(metric(0),'0','cancelled application current phase not counted as INELIGIBLE');
 assert.equal(metric(3),'0');
 team.set('b09Phase','CANCELLED');team.change('b09Phase');
 assert.equal(metric(0),'1','phase filter describes current state');
 assert.equal(metric(3),'0','cancelled application excluded from valid session denominator');
 team.click('b09Reset');
 assert.equal(team.get('b09Start').value,'');
 assert.equal(team.get('b09End').value,'');
 assert.equal(team.get('b09Scope').value,'ALL');
 assert.equal(metric(0),'4');
 assert.equal(srv.writes,writes,'all report filters and recomputations are read-only');
 closed(srv);
});
test('B09 malformed date, inverted period, tampered model, and failed authorized read clear stale statistics',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 assert.equal(team.get('b09Metrics').children.length>0,true);
 team.set('b09Start','2027-02-30');team.change('b09Start');
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.match(team.get('b09Status').textContent,/報表已清空/);
 team.set('b09Start','2027-04-01');team.change('b09Start');
 team.set('b09End','2027-03-01');team.change('b09End');
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.match(team.get('b09Status').textContent,/日期/);
 team.click('b09Reset');
 assert.ok(team.get('b09Metrics').children.length>0);
 assert.equal(srv.writes,before);
 // Revoking a previously valid session must clear displayed report values.
 const originalRead=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner denied');};
 const read=team.get('refresh');read.handlers.click();
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.match(team.get('b09Status').textContent,/快照|清空/);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=originalRead;
 closed(srv);
});

test('B09 session-date visualization reuses verified summary without new RPC or writes',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const state=srv.ctx.study1UnifiedRead_(),a=state.applications[0],slot=state.slots.find(x=>x.experiment==='E1');
 Object.assign(a,{phase:'CONFIRMED',eligible:true,slotId:slot.id});
 state.b02.attendance[a.id]={attendance:'PRESENT',progress:'COMPLETE',note:''};
 srv.store.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(state));
 const writes=srv.writes,team=page(srv,'team'),viz=team.get('b09Visual');
 assert.ok(viz.children.length>=1);
 const selected=viz.children.find(day=>day.children[0].textContent.includes(slot.when.slice(0,10)));
 assert.ok(selected,'the linked synthetic slot date appears in visual series');
 assert.equal(selected.children.length,4,'date plus exactly three source-derived metrics');
 assert.match(selected.children[1].children[0].textContent,/未取消場次：\d+ 筆/);
 assert.match(selected.children[2].children[0].textContent,/有效關聯申請代碼：1 筆/);
 assert.match(selected.children[3].children[0].textContent,/施測行政進度完成：1 筆/);
 for(const day of viz.children)for(const line of day.children.slice(1)){
  const fill=line.children[1].children[0];
  assert.ok(/^\d+\.\d%$/.test(fill.style.width));
  assert.ok(parseFloat(fill.style.width)>=0&&parseFloat(fill.style.width)<=100);
  assert.equal(fill.attributes['aria-hidden'],'true');
 }
 assert.equal(team.calls.filter(x=>x!=='READ'&&x!=='B01_GET').length,0);
 assert.equal(srv.writes,writes,'visual report must not change the existing TEST fixture');
 assert.equal(srv.store.has('STUDY1_B09_CHART_V1'),false);
 closed(srv);
});

test('B09 trend graph empties for no session dates and clears on invalid date or denied read',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 assert.ok(team.get('b09Visual').children.length>0);
 team.set('b09Start','2099-01-01');team.change('b09Start');
 assert.equal(team.get('b09Visual').children.length,1);
 assert.match(team.get('b09Visual').children[0].textContent,/沒有可核實的虛構場次日期/);
 team.set('b09Start','2027-02-30');team.change('b09Start');
 assert.equal(team.get('b09Visual').children.length,0);
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.match(team.get('b09Status').textContent,/報表已清空/);
 team.click('b09Reset');
 assert.ok(team.get('b09Visual').children.length>0);
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner revoked');};
 team.click('refresh');
 assert.equal(team.get('b09Visual').children.length,0);
 assert.equal(team.get('b09Trend').children.length,0);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B11 scoped E1 preview compares before/after, writes nothing, then atomically updates original TEST model',()=>{
 const srv=server(),writes=srv.writes,team=page(srv,'team');
 assert.equal(team.get('b11Scope').value,'ALL');
 assert.equal(team.get('b11ModeE1').value,'DEMO_OPEN');
 assert.equal(team.get('b11ModeE2').value,'COMING_SOON');
 assert.equal(team.get('b11Publish').disabled,true);
 team.set('b11Scope','E1');team.change('b11Scope');
 assert.equal(team.get('b11ModeE2').disabled,true,'out-of-scope experiment cannot be changed');
 team.set('b11ModeE1','COMING_SOON');team.change('b11ModeE1');
 assert.equal(team.get('b11Apply').disabled,true,'must preview first');
 team.click('b11Preview');
 assert.equal(team.get('b11Diff').children.length,1);
 const row=team.get('b11Diff').children[0].children;
 assert.match(row[0].textContent,/E1/);
 assert.equal(row[1].textContent,'DEMO_OPEN');
 assert.equal(row[2].textContent,'COMING_SOON');
 assert.match(team.get('b11Demo').textContent,/未發布的TEST預覽/);
 assert.match(team.get('b11Demo').textContent,/正式收件：CLOSED/);
 assert.equal(srv.writes,writes,'preview does not mutate any TEST fixture');
 assert.equal(team.get('b11Apply').disabled,false);
 team.click('b11Apply');
 assert.ok(team.calls.includes('ADMIN_B11_SETTINGS'));
 assert.equal(team.failures.length,0);
 assert.equal(srv.writes,writes+1);
 assert.equal(srv.read().recruitment.E1.mode,'COMING_SOON');
 assert.equal(srv.read().recruitment.E2.mode,'COMING_SOON');
 assert.equal(team.get('b11Diff').children.length,0,'successful commit clears old preview');
 assert.equal(team.get('b11Apply').disabled,true,'old CAS stage cannot be reused');
 assert.match(team.get('b11Status').textContent,/已在原網站回讀虛構設定新版本/);
 assert.equal(page(srv,'visitor').get('chooseE1').disabled,true,
  'existing visitor site reads changed TEST display without opening real intake');
 assert.equal(srv.read().open,false);assert.equal(srv.read().consentReady,false);
 closed(srv);
});
test('B11 combined E1/E2 scope and global text preview are all-or-none, not REC publication',()=>{
 const srv=server(),old=srv.read(),team=page(srv,'team'),writes=srv.writes;
 assert.equal(team.get('b11IncludeSite').checked,false);
 assert.equal(team.get('b11Email').disabled,true,'global site is opt-in');
 team.set('b11ModeE1','HIDDEN');team.change('b11ModeE1');
 team.set('b11ModeE2','DEMO_OPEN');team.change('b11ModeE2');
 team.get('b11IncludeSite').checked=true;team.change('b11IncludeSite');
 assert.equal(team.get('b11Email').disabled,false);
 team.set('b11Title','Study1虛構預覽頁');
 team.get('b11Title').handlers.input();
 team.set('b11Notice','僅測試資料，不開放正式參加');
 team.get('b11Notice').handlers.input();
 team.set('b11Email','虛構通知示範，沒有真實寄送');
 team.get('b11Email').handlers.input();
 team.click('b11Preview');
 assert.equal(team.get('b11Diff').children.length,5,'two experiment modes and three site-copy fields');
 assert.match(team.get('b11Demo').textContent,/Study1虛構預覽頁/);
 assert.match(team.get('b11Revision').textContent,/草稿鎖定原資料修訂版 0/);
 assert.equal(srv.writes,writes);
 team.click('b11Apply');
 const after=srv.read();
 assert.equal(after.revision,old.revision+1);
 assert.equal(after.recruitment.E1.mode,'HIDDEN');
 assert.equal(after.recruitment.E2.mode,'DEMO_OPEN');
 assert.equal(after.recruitment.E2.year,2027);
 assert.equal(after.config.title,'Study1虛構預覽頁');
 assert.equal(after.config.emailTemplate,'虛構通知示範，沒有真實寄送');
 assert.deepEqual(after.definitions,old.definitions,'research/REC wording untouched');
 assert.deepEqual(after.policy,old.policy,'REC and policy never altered');
 assert.equal(srv.writes,writes+1,'all options written as one CAS transaction');
 const reloaded=page(srv,'team');
 assert.equal(reloaded.get('b11ModeE1').value,'HIDDEN');
 assert.equal(reloaded.get('b11ModeE2').value,'DEMO_OPEN');
 assert.equal(reloaded.get('b11Title').value,'Study1虛構預覽頁');
 assert.equal(reloaded.get('b11Publish').disabled,true);
 closed(srv);
});
test('B11 staging invalidation, no-op, stale second tab and denied refresh fail closed',()=>{
 const srv=server(),a=page(srv,'team'),b=page(srv,'team');
 const writes=srv.writes;
 a.click('b11Preview');
 assert.equal(a.get('b11Apply').disabled,true,'no-op cannot be submitted');
 assert.match(a.get('b11Status').textContent,/沒有變更/);
 a.set('b11ModeE1','HIDDEN');a.change('b11ModeE1');a.click('b11Preview');
 assert.equal(a.get('b11Apply').disabled,false);
 // Edits after preview invalidate previously reviewed payload.
 a.set('b11ModeE1','COMING_SOON');a.change('b11ModeE1');
 assert.equal(a.get('b11Apply').disabled,true);
 assert.equal(a.get('b11Diff').children.length,0);
 a.set('b11ModeE1','HIDDEN');a.change('b11ModeE1');a.click('b11Preview');
 b.set('b11ModeE2','HIDDEN');b.change('b11ModeE2');b.click('b11Preview');
 assert.equal(srv.writes,writes);
 a.click('b11Apply');
 assert.equal(srv.read().recruitment.E1.mode,'HIDDEN');
 const written=srv.writes;
 b.click('b11Apply');
 assert.ok(b.failures.some(e=>/版本已變更/.test(e)));
 assert.equal(b.get('b11Apply').disabled,true);
 assert.equal(b.get('b11Preview').disabled,false,'stale conflict automatically rereads the current owner snapshot');
 assert.match(b.get('b11Status').textContent,/已回讀最新OWNER-only TEST來源/);
 assert.equal(b.get('b11Diff').children.length,0);
 assert.equal(b.get('b11ModeE1').value,'HIDDEN');
 assert.equal(b.get('b11ModeE2').value,'COMING_SOON');
 assert.equal(srv.writes,written,'second tab never overwrites first');
 b.click('refresh');
 assert.equal(b.get('b11Preview').disabled,false);
 assert.equal(b.get('b11ModeE1').value,'HIDDEN');
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('synthetic owner denied');};
 b.click('refresh');
 assert.equal(b.get('b11Apply').disabled,true);
 assert.equal(b.get('b11Diff').children.length,0);
 assert.match(b.get('b11Status').textContent,/已清空/);
 assert.equal(srv.writes,written);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});


test('B11 rejects forged success response, then rereads current scoped TEST model without false save',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 const original=srv.ctx.study1UnifiedPreviewCommand;
 team.set('b11Scope','E1');team.change('b11Scope');
 team.set('b11ModeE1','HIDDEN');team.change('b11ModeE1');
 team.click('b11Preview');
 const originalRevision=srv.read().revision;
 assert.equal(team.get('b11Apply').disabled,false);
 srv.ctx.study1UnifiedPreviewCommand=()=>({
  ...srv.read(),revision:originalRevision+1,
  recruitment:{E1:{year:2026,mode:'DEMO_OPEN'},E2:{year:2027,mode:'COMING_SOON'}}
 });
 team.click('b11Apply');
 assert.equal(srv.writes,before,'forged success must never create a synthetic transaction');
 assert.equal(srv.read().revision,originalRevision);
 assert.equal(srv.read().recruitment.E1.mode,'DEMO_OPEN');
 assert.equal(team.get('b11ModeE1').value,'DEMO_OPEN','re-read replaces the unsaved draft');
 assert.equal(team.get('b11Apply').disabled,true);
 assert.equal(team.get('b11Preview').disabled,false);
 assert.match(team.get('b11Status').textContent,/伺服器回應的版本或設定值與已確認草稿不符/);
 assert.match(team.get('b11Status').textContent,/已回讀最新OWNER-only TEST來源/);
 assert.doesNotMatch(team.get('b11Status').textContent,/已在原網站回讀虛構設定新版本/);
 srv.ctx.study1UnifiedPreviewCommand=original;
 closed(srv);
});

test('B11 denied recovery read after CAS error clears B01 and B09 and disables the editor',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 const command=srv.ctx.study1UnifiedPreviewCommand,read=srv.ctx.study1UnifiedPreviewGet;
 team.set('b11ModeE1','COMING_SOON');team.change('b11ModeE1');
 team.click('b11Preview');
 assert.equal(team.get('b11Apply').disabled,false);
 srv.ctx.study1UnifiedPreviewCommand=()=>{throw Error('test concurrent write rejected');};
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner source rejected');};
 team.click('b11Apply');
 assert.equal(srv.writes,before);
 assert.equal(team.get('b11Preview').disabled,true);
 assert.equal(team.get('b11Apply').disabled,true);
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.match(team.get('b11Status').textContent,/無法安全回復B11設定/);
 assert.match(team.get('status').textContent,/管理操作保持鎖定/);
 srv.ctx.study1UnifiedPreviewGet=read;
 srv.ctx.study1UnifiedPreviewCommand=command;
 closed(srv);
});

test('B11 global owner view inherits E1/E2/ALL across B01 B02 B03 B06 B08 B09 with no RPC or mutation',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E2'});
 // Populate existing synthetic fixture in memory; no new provider or storage key.
 const source=srv.ctx.study1UnifiedRead_();
 source.notifications=[
  {id:'SIM-001',event:'CONFIRM',text:'E1虛構通知（僅預覽，未寄送）',status:'SIM_PENDING',attempts:0,lastError:null},
  {id:'SIM-002',event:'CONFIRM',text:'E2虛構通知（僅預覽，未寄送）',status:'SIM_FAILED',attempts:1,lastError:'SIMULATED_FAILURE'}
 ];
 srv.store.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(source));
 const team=page(srv,'team');
 const addTask=(name,exp)=>{
  team.set('b06Title',name);team.set('b06Experiment',exp);
  team.set('b06Reason','人工測試建立任務');
  team.get('b06Form').handlers.submit({preventDefault(){}});
  assert.equal(team.failures.length,0);
 };
 addTask('實驗一虛構工作','E1');
 addTask('實驗二虛構工作','E2');
 addTask('兩個實驗共用工作','ALL');
 team.set('calView','day');team.change('calView');
 team.set('calDate','2027-01-05');team.change('calDate');
 assert.equal(team.get('adminScopeGlobal').value,'ALL');
 assert.deepEqual(['B01','B02','B03','B06','B08','B09'].map(m=>
  team.get('adminScope'+m).value),Array(6).fill('INHERIT'));
 assert.equal(team.get('entries').children.length,2);
 assert.equal(team.get('b06List').children.length,3);
 assert.equal(team.get('b08List').children.length,2);
 assert.equal(team.get('b09ByExperiment').children.length,2);
 const before=srv.writes,oldRevision=srv.read().revision;
 team.set('adminScopeGlobal','E1');team.change('adminScopeGlobal');
 assert.equal(team.get('b01Cards').children[0].children[1].textContent,'1');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children[0].textContent,/實驗一/);
 assert.equal(team.get('b06List').children.length,2,'shared ALL task appears under E1');
 assert.equal(team.get('b06History').children.length,2,'only E1 and shared task history');
 assert.equal(team.get('b08List').children.length,1);
 assert.match(team.get('b08List').children[0].children[0].textContent,/E1/);
 assert.equal(team.get('b09ByExperiment').children.length,1);
 assert.equal(team.get('b09ByExperiment').children[0].children[0].textContent,'E1');
 assert.match(team.get('calDescription').textContent,/1 個符合條件/);
 assert.match(team.get('adminScopeHintB03').textContent,/繼承全域 → E1/);
 team.set('adminScopeGlobal','E2');team.change('adminScopeGlobal');
 assert.equal(team.get('b01Cards').children[0].children[1].textContent,'1');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children[0].textContent,/實驗二/);
 assert.equal(team.get('b06List').children.length,2);
 assert.equal(team.get('b08List').children.length,1);
 assert.match(team.get('b08List').children[0].children[0].textContent,/E2/);
 assert.equal(team.get('b09ByExperiment').children[0].children[0].textContent,'E2');
 assert.match(team.get('calDescription').textContent,/0 個符合條件/,'day E1 date cannot display E2 session');
 team.set('calDate','2027-01-07');team.change('calDate');
 assert.match(team.get('calDescription').textContent,/1 個符合條件/);
 assert.equal(srv.writes,before,'scope switches and ALL six module recomputations are read-only');
 assert.equal(srv.read().revision,oldRevision,'no CAS revision or synthetic research state changes');
 assert.equal(srv.store.has('STUDY1_B11_SCOPE_V1'),false);
 assert.equal(srv.store.get('OPEN'),'false');
 assert.equal(srv.store.get('CONSENT_READY'),'false');
 closed(srv);
});
test('B11 per-module scope override isolates other panels, local filters and reload persistence',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});srv.command('START',{experiment:'E2'});
 const team=page(srv,'team'),before=srv.writes;
 team.set('adminScopeGlobal','E1');team.change('adminScopeGlobal');
 assert.equal(team.get('entries').children.length,1);
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children[0].textContent,/實驗二/);
 assert.equal(team.get('b01Cards').children[0].children[1].textContent,'1','B01 still inherits global E1');
 team.set('adminScopeB09','E2');team.change('adminScopeB09');
 assert.equal(team.get('b09ByExperiment').children.length,1);
 assert.equal(team.get('b09ByExperiment').children[0].children[0].textContent,'E2');
 assert.equal(team.get('b09Scope').value,'ALL','reset local legacy report filter on scope changes');
 team.set('adminScopeB01','ALL');team.change('adminScopeB01');
 assert.equal(team.get('b01Cards').children[0].children[1].textContent,'2','B01 temporary override ALL');
 assert.match(team.get('adminScopeHintB01').textContent,/臨時覆寫 → ALL/);
 team.set('adminScopeB03','INHERIT');team.change('adminScopeB03');
 assert.match(team.get('entries').children[0].children[0].textContent,/實驗一/);
 team.click('refresh');
 assert.equal(team.get('adminScopeGlobal').value,'E1','same browser-page refresh retains temporary display choice');
 assert.equal(team.get('adminScopeB01').value,'ALL');
 assert.equal(team.get('adminScopeB09').value,'E2');
 assert.equal(team.get('b09ByExperiment').children[0].children[0].textContent,'E2');
 assert.equal(team.get('b01Cards').children[0].children[1].textContent,'2');
 const newPage=page(srv,'team');
 assert.equal(newPage.get('adminScopeGlobal').value,'ALL','new browser page does not inherit private session');
 assert.equal(newPage.get('adminScopeB01').value,'INHERIT');
 assert.equal(newPage.get('b09ByExperiment').children.length,2);
 assert.equal(newPage.get('entries').children.length,2);
 assert.equal(srv.writes,before,'no scope persisted in data or browser storage');
 const visitor=page(srv,'visitor');
 assert.equal(visitor.get('chooseE1').disabled,false);
 assert.equal(visitor.get('chooseE2').disabled,true);
 assert.equal(srv.read().recruitment.E1.mode,'DEMO_OPEN');
 assert.equal(srv.read().recruitment.E2.mode,'COMING_SOON');
 closed(srv);
});
test('B11 invalid scope and owner reread denial clear all six displayed panels without writing',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const team=page(srv,'team'),before=srv.writes;
 assert.ok(team.get('b01Cards').children.length);
 assert.ok(team.get('calBoard').children.length);
 assert.equal(team.get('entries').children.length,1);
 team.set('adminScopeB03','DANGEROUS_VALUE');team.change('adminScopeB03');
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b09Metrics').children.length,0);
 for(const id of ['calBoard','entries','b03Board','b06List','b06History','b08List'])
  assert.equal(team.get(id).children.length,0,id+' stale data erased');
 assert.equal(team.get('saveModes').disabled,true,'malformed local filter fail-closes all operations');
 assert.equal(srv.writes,before);
 // Restoring a valid scope requires a fresh owner-verified read.
 team.set('adminScopeB03','INHERIT');team.click('refresh');
 assert.ok(team.get('b01Cards').children.length);
 assert.equal(team.get('entries').children.length,1);
 const saved=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner revoked for synthetic session');};
 team.click('refresh');
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.equal(team.get('calBoard').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('b06List').children.length,0);
 assert.equal(team.get('b08List').children.length,0);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=saved;
 closed(srv);
});
test('B11 forbidden owner and OPEN/CONSENT flags keep all six scoped panels empty',()=>{
 for(const options of [
  {active:'unauthorized@example.invalid'},
  {effective:'unauthorized@example.invalid'},
  {open:'true'},{consent:'true'}
 ]){
  const srv=server(options),team=page(srv,'team');
  assert.ok(team.failures.length>0);
  for(const id of ['b01Cards','b09Metrics','calBoard','entries','b03Board',
   'b06List','b06History','b08List'])assert.equal(team.get(id).children.length,0,id);
  assert.equal(team.get('saveModes').disabled,true);
  assert.equal(srv.writes,0);
  assert.equal(srv.store.has('STUDY1_B11_SCOPE_V1'),false);
 }
});


test('B10 uses only the same owner TEST snapshot for E1/E2 draft provenance without writes',()=>{
 const srv=server(),before=srv.writes,team=page(srv,'team');
 const rows=team.get('b10Rows').children;
 assert.equal(rows.length,6,'three draft-source field references for each experiment');
 assert.deepEqual(rows.map(r=>r.children[0].textContent),['E1','E1','E1','E2','E2','E2']);
 assert.ok(rows.some(r=>r.children.some(cell=>/PENDING_REC_APPROVAL_E1/.test(cell.textContent))));
 assert.ok(rows.some(r=>r.children.some(cell=>/PENDING_E2_RULES_V1/.test(cell.textContent))));
 assert.ok(rows.every(r=>r.children.length===5&&r.children.every(c=>c.tagName==='td')));
 assert.match(team.get('b10Status').textContent,/0 筆已核准正式文件/);
 assert.match(team.get('b10Warning').textContent,/不可據此認定REC核准/);
 team.set('b10Experiment','E2');team.change('b10Experiment');
 assert.equal(team.get('b10Rows').children.length,3);
 assert.ok(team.get('b10Rows').children.every(r=>r.children[0].textContent==='E2'));
 team.click('b10Reset');
 assert.equal(team.get('b10Rows').children.length,6);
 assert.equal(team.calls.filter(x=>x!=='READ'&&x!=='B01_GET').length,0,'never call any write RPC');
 assert.equal(srv.writes,before);
 assert.equal(srv.store.has('STUDY1_B10_DOCUMENTS_V1'),false);
 assert.doesNotMatch(teamHtml,/id="b10Download"|id="b10Export"|id="b10Sign"/);
 closed(srv);
});

test('B10 rejects forged approved metadata and inconsistent REC version without modifying source',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const v=original();
  v.governance.documents.E1.approved=true;
  return v;
 };
 team.click('refresh');
 assert.equal(team.get('b10Rows').children.length,0);
 assert.match(team.get('b10Status').textContent,/B10拒絕顯示/);
 assert.match(team.get('b10Status').textContent,/來源一致性|REC狀態/);
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const v=original();
  v.formalReadiness.provenance.E2.recVersion='PENDING_MISMATCHED_VERSION';
  return v;
 };
 team.click('refresh');
 assert.equal(team.get('b10Rows').children.length,0);
 assert.match(team.get('b10Status').textContent,/B10拒絕顯示/);
 srv.ctx.study1UnifiedPreviewGet=original;
 team.click('refresh');
 assert.equal(team.get('b10Rows').children.length,6);
 assert.equal(srv.writes,before);
 closed(srv);
});

test('B10 field with declared SHA stays unverified, and denied owner read clears table',()=>{
 const srv=server(),before=srv.writes,original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const v=original();
  const sha='a'.repeat(64);
  v.governance.documents.E1.declaredSha256=sha;
  v.formalReadiness.provenance.E1.declaredSha256=sha;
  v.policy.consent.E1.sha256=sha;
  return v;
 };
 const team=page(srv,'team');
 assert.equal(team.get('b10Rows').children.length,6);
 const e1Consent=team.get('b10Rows').children[2];
 assert.match(e1Consent.children[3].textContent,/宣稱雜湊（未查核）/);
 assert.doesNotMatch(team.get('b10Status').textContent,/1 筆已核准/);
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner revoked');};
 team.click('refresh');
 assert.equal(team.get('b10Rows').children.length,0);
 assert.match(team.get('b10Status').textContent,/文件來源索引已清空/);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B10 synthetic reference reconciliation shows four groups with correct empty denominators and no writes',()=>{
 const srv=server(),before=srv.writes,team=page(srv,'team');
 assert.equal(team.get('b10Rows').children.length,6,'original six source rows preserved');
 assert.equal(team.get('b10RefRows').children.length,4,'two TEST reference classes per experiment');
 for(const row of team.get('b10RefRows').children){
  assert.equal(row.children.length,6);
  assert.deepEqual(row.children.slice(2).map(x=>x.textContent),['0','0','0','0']);
  assert.equal(row.children[0].tagName,'td');
 }
 assert.match(team.get('b10RefStatus').textContent,/4／4組TEST版本引用/);
 assert.match(team.get('b10RefStatus').textContent,/非正式受試者/);
 assert.equal(srv.writes,before);
 assert.deepEqual(team.calls,['READ','B01_GET']);
 assert.equal(srv.store.has('STUDY1_B10_REFERENCES_V1'),false);
 closed(srv);
});
test('B10 reference comparison counts current TEST version same/different/unrecorded with exact E1 E2 denominators',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E2'});
 const state=srv.ctx.study1UnifiedRead_(),[a,b,c]=state.applications;
 a.screeningVersion=state.policy.screening.mappings.E1.version;
 a.screeningSource='REC_DRAFT_ONLY';
 a.consentVersion=state.policy.consent.E1.version;
 b.screeningVersion='PENDING_E1_LEGACY_RULES_V1';
 b.screeningSource='REC_DRAFT_ONLY';
 b.consentVersion='PENDING_E1_LEGACY_CONSENT_V1';
 b.phase='CANCELLED';
 srv.store.set('STUDY1_UNIFIED_FIXTURE_V1',JSON.stringify(state));
 const team=page(srv,'team'),writes=srv.writes;
 assert.equal(team.get('b10Rows').children.length,6);
 const refs=team.get('b10RefRows').children;
 assert.equal(refs.length,4);
 for(const row of refs.slice(0,2))
  assert.deepEqual(row.children.slice(2).map(x=>x.textContent),['1','1','0','2']);
 for(const row of refs.slice(2))
  assert.deepEqual(row.children.slice(2).map(x=>x.textContent),['0','0','1','1']);
 team.set('b10RefFilter','DIFFERENT');team.change('b10RefFilter');
 assert.equal(team.get('b10RefRows').children.length,2,'only E1 outdated version references');
 assert.match(team.get('b10RefRows').children[0].children[0].textContent,/E1/);
 team.set('b10Experiment','E2');team.change('b10Experiment');
 assert.equal(team.get('b10RefRows').children.length,1,'explicit empty result row, not false formal null history');
 assert.match(team.get('b10RefRows').children[0].children[0].textContent,/沒有符合的虛構引用版號/);
 team.set('b10RefFilter','MISSING');team.change('b10RefFilter');
 assert.equal(team.get('b10RefRows').children.length,2);
 assert.match(team.get('b10RefRows').children[0].children[0].textContent,/E2/);
 assert.equal(team.get('b10Rows').children.length,3);
 team.click('refresh');
 assert.equal(team.get('b10RefRows').children.length,2);
 assert.equal(team.get('b10RefFilter').value,'MISSING');
 const other=page(srv,'team');
 assert.equal(other.get('b10RefRows').children.length,4,'new browser page starts unfiltered');
 team.click('b10Reset');
 assert.equal(team.get('b10Rows').children.length,6);
 assert.equal(team.get('b10RefRows').children.length,4);
 assert.equal(team.get('b10RefFilter').value,'ALL');
 assert.equal(srv.writes,writes,'all filtering is strictly read-only');
 assert.equal(srv.store.get('OPEN'),'false');
 assert.equal(srv.store.get('CONSENT_READY'),'false');
 closed(srv);
});
test('B10 malformed or duplicate TEST application refs fail closed and erase both source and comparison tables',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes,original=srv.ctx.study1UnifiedPreviewGet;
 assert.equal(team.get('b10Rows').children.length,6);
 const one=srv.command('START',{experiment:'E1'});
 assert.equal(one.applications.length,1);
 const tamper=mutate=>{
  srv.ctx.study1UnifiedPreviewGet=()=>{const v=original();mutate(v);return v;};
  team.click('refresh');
  assert.equal(team.get('b10Rows').children.length,0);
  assert.equal(team.get('b10RefRows').children.length,0);
  assert.match(team.get('b10Status').textContent,/B10拒絕顯示/);
  assert.match(team.get('b10RefStatus').textContent,/對照已清空/);
  srv.ctx.study1UnifiedPreviewGet=original;
  team.click('refresh');
  assert.equal(team.get('b10Rows').children.length,6);
 };
 tamper(v=>{v.applications.push({...v.applications[0]});});
 tamper(v=>{v.applications[0].consentVersion='REC_APPROVED';});
 tamper(v=>{v.applications[0].screeningVersion='PENDING_E1_RULES_V1';
   v.applications[0].screeningSource='REC_APPROVED';});
 team.set('b10RefFilter','UNSUPPORTED');
 team.change('b10RefFilter');
 assert.equal(team.get('b10Rows').children.length,0);
 assert.equal(team.get('b10RefRows').children.length,0);
 team.set('b10RefFilter','ALL');
 team.click('refresh');
 assert.equal(team.get('b10RefRows').children.length,4);
 const writes=srv.writes;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner access revoked');};
 team.click('refresh');
 assert.equal(team.get('b10Rows').children.length,0);
 assert.equal(team.get('b10RefRows').children.length,0);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(srv.writes,writes);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B01 owner layout edits only a draft; explicit save persists across reload, scope and fresh owner page',()=>{
 const srv=server(),before=srv.writes,team=page(srv,'team');
 const cards=team.get('b01Cards'),tools=team.get('b01LayoutControls');
 assert.equal(cards.children.length,13);assert.equal(tools.children.length,13);
 const original=cards.children.map(c=>c.children[0].textContent);
 const values=Object.fromEntries(cards.children.map(c=>[c.children[0].textContent,c.children[1].textContent]));
 assert.equal(team.get('b01LayoutSave').disabled,true);
 tools.children[0].children[1].handlers.click(); // hide
 team.get('b01LayoutControls').children[0].children[3].handlers.click(); // move down
 assert.equal(cards.children[0].children[0].textContent,original[1]);
 assert.equal(cards.children[1].hidden,true);
 assert.equal(team.get('b01LayoutSave').disabled,false);
 assert.equal(srv.writes,before,'draft changes never write');
 const separate=page(srv,'team');
 assert.equal(separate.get('b01Cards').children[0].hidden,false);
 assert.equal(separate.get('b01Cards').children[0].children[0].textContent,original[0]);
 team.click('b01LayoutSave');
 assert.equal(srv.writes,before+1,'one atomic non-sensitive preference write');
 assert.match(team.get('b01LayoutStatus').textContent,/已儲存並完成回讀/);
 assert.equal(team.get('b01LayoutSave').disabled,true);
 team.click('refresh');
 assert.equal(cards.children[0].children[0].textContent,original[1]);
 assert.equal(cards.children[1].hidden,true,'saved preference survives main source reload');
 team.set('adminScopeGlobal','E2');team.change('adminScopeGlobal');
 assert.equal(cards.children[0].children[0].textContent,original[1]);
 assert.equal(cards.children[1].hidden,true);
 const valuesAfter=Object.fromEntries(cards.children.map(c=>[c.children[0].textContent,c.children[1].textContent]));
 assert.notEqual(valuesAfter['不重複申請代碼'],undefined);
 assert.equal(srv.store.has('STUDY1_B01_OWNER_LAYOUT_V1'),true);
 const fresh=page(srv,'team');
 assert.equal(fresh.get('b01Cards').children[0].children[0].textContent,original[1]);
 assert.equal(fresh.get('b01Cards').children[1].hidden,true);
 assert.deepEqual(Object.keys(valuesAfter).sort(),Object.keys(values).sort(),'all thirteen metrics still exist');
 team.click('b01LayoutReset');
 assert.deepEqual(cards.children.map(c=>c.children[0].textContent),original);
 assert.ok(cards.children.every(c=>!c.hidden));
 assert.equal(srv.writes,before+1,'reset is draft-only until explicit save');
 team.click('b01LayoutSave');
 assert.equal(srv.writes,before+2);
 const restored=page(srv,'team');
 assert.deepEqual(restored.get('b01Cards').children.map(c=>c.children[0].textContent),original);
 assert.ok(restored.get('b01Cards').children.every(c=>!c.hidden));
 closed(srv);
});
test('B01 stale owner tab is rejected and securely re-reads, never overwriting a newer preference',()=>{
 const srv=server(),a=page(srv,'team'),b=page(srv,'team');
 a.get('b01LayoutControls').children[0].children[1].handlers.click();
 a.click('b01LayoutSave');const after=srv.writes,rev=JSON.parse(srv.store.get('STUDY1_B01_OWNER_LAYOUT_V1')).revision;
 b.get('b01LayoutControls').children[1].children[3].handlers.click();
 b.click('b01LayoutSave');
 assert.equal(srv.writes,after,'stale tab cannot overwrite saved settings');
 assert.ok(b.failures.some(x=>/版本已變更/.test(x)));
 assert.match(b.get('b01LayoutStatus').textContent,/競寫|未確認/);
 assert.equal(b.get('b01Cards').children[0].hidden,true,'stale tab now sees first owner saved value');
 assert.equal(JSON.parse(srv.store.get('STUDY1_B01_OWNER_LAYOUT_V1')).revision,rev);
 assert.equal(b.get('b01LayoutSave').disabled,true);
 const visitor=page(srv,'visitor');
 assert.ok(visitor.calls.every(x=>x==='READ'));
 closed(srv);
});
test('B01 owner denial and unsafe scope clear all cards and disable persisted preference controls',()=>{
 const srv=server(),team=page(srv,'team'),initial=srv.writes;
 team.get('b01LayoutControls').children[0].children[1].handlers.click();
 assert.equal(team.get('b01Cards').children[0].hidden,true);
 team.set('adminScopeGlobal','NOT_A_SCOPE');team.change('adminScopeGlobal');
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b01LayoutControls').children.length,0);
 assert.equal(team.get('b01LayoutReset').disabled,true);
 assert.equal(team.get('b01LayoutSave').disabled,true);
 assert.match(team.get('b01LayoutStatus').textContent,/管理範圍不合法/);
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner access revoked');};
 team.click('refresh');
 assert.equal(team.get('b01LayoutControls').children.length,0);
 assert.equal(team.get('b01LayoutSave').disabled,true);
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(srv.writes,initial);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B07 original owner management page records pending synthetic state without a payment or export',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 srv.command('START',{experiment:'E2'});
 const baseline=srv.writes,team=page(srv,'team');
 assert.equal(team.get('b07Rows').children.length,2);
 assert.equal(team.get('b07History').children.length,1);
 assert.match(team.get('b07Status').textContent,/正式補貼核准／金額／發放：全部未啟用/);
 const e1=team.get('b07Rows').children[0],fields=e1.children[1],
  status=fields.children[0].children[0],reason=fields.children[1].children[0],
  save=fields.children[2];
 assert.equal(status.value,'SOURCE_PENDING');
 assert.equal(reason.value,'SOURCE_CHECK');
 assert.equal(save.disabled,false);
 assert.equal(srv.writes,baseline,'view cannot write source');
 status.value='DOCUMENTS_PENDING';status.handlers.change();
 reason.value='DOCUMENT_CHECK';save.handlers.click();
 assert.equal(srv.writes,baseline+1);
 assert.equal(srv.read().b07.reviews['SIM-001'].status,'DOCUMENTS_PENDING');
 assert.equal(srv.read().b07.history.length,1);
 assert.equal(team.get('b07History').children.length,1);
 assert.match(team.get('status').textContent,/未記錄任何正式補貼發放/);
 assert.equal(team.calls.includes('ADMIN_B07_REVIEW'),true);
 assert.doesNotMatch(teamHtml,/id="b07Pay"|id="b07Amount"|id="b07Export"|id="b07Receipt"/);
 team.set('b07Experiment','E2');team.change('b07Experiment');
 assert.equal(team.get('b07Rows').children.length,1);
 assert.match(team.get('b07Rows').children[0].children[0].textContent,/SIM-002/);
 team.click('b07Reset');
 assert.equal(team.get('b07Rows').children.length,2);
 team.set('adminScopeGlobal','E1');team.change('adminScopeGlobal');
 assert.equal(team.get('b07Rows').children.length,1);
 assert.equal(srv.writes,baseline+1);
 closed(srv);
});

test('B07 CAS stale second owner tab automatically rereads authoritative state, never replays',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const a=page(srv,'team'),b=page(srv,'team');
 const aFields=a.get('b07Rows').children[0].children[1];
 aFields.children[0].children[0].value='SOURCE_PENDING';
 aFields.children[2].handlers.click();
 const current=srv.read().revision,writes=srv.writes;
 const bFields=b.get('b07Rows').children[0].children[1];
 bFields.children[0].children[0].value='DOCUMENTS_PENDING';
 bFields.children[0].children[0].handlers.change();
 bFields.children[1].children[0].value='DOCUMENT_CHECK';
 bFields.children[2].handlers.click();
 assert.equal(srv.read().revision,current,'stale tab cannot create B07 event');
 assert.equal(srv.writes,writes);
 assert.equal(b.get('b07Rows').children.length,1);
 assert.match(b.get('status').textContent,/提交結果未確認/);
 assert.equal(b.get('b07Rows').children[0].children[1].children[0].children[0].value,'SOURCE_PENDING');
 assert.equal(b.get('b07History').children.length,1);
 assert.ok(b.calls.filter(x=>x==='READ').length>=2);
 closed(srv);
});

test('B07 spoofed formal approval or denied owner read clears pending-only viewer without writes',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const team=page(srv,'team'),before=srv.writes;
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const s=original();
  s.b07.reviews['SIM-001']={actor:'OWNER',status:'PAID',
   at:'2026-11-06T12:00:00.000Z'};
  return s;
 };
 team.click('refresh');
 assert.equal(team.get('b07Rows').children.length,0);
 assert.match(team.get('b07Status').textContent,/拒絕顯示/);
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner revoked');};
 team.click('refresh');
 assert.equal(team.get('b07Rows').children.length,0);
 assert.equal(team.get('saveModes').disabled,true);
 assert.match(team.get('b07Status').textContent,/B07資料已清空/);
 assert.equal(srv.writes,before);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B07 original owner page exposes four independent E1/E2 TEST stage items and records before/after',()=>{
 const srv=server();
 srv.command('START',{experiment:'E1'});srv.command('START',{experiment:'E2'});
 const writes=srv.writes,team=page(srv,'team');
 const rows=team.get('b07ItemRows');
 assert.equal(rows.children.length,4);
 assert.match(rows.children[0].children[0].textContent,/SIM-001.*單次研究.*未記錄/);
 assert.match(rows.children[1].children[0].textContent,/SIM-002.*前測.*未記錄/);
 assert.match(rows.children[2].children[0].textContent,/SIM-002.*八週介入.*未記錄/);
 assert.match(rows.children[3].children[0].textContent,/SIM-002.*後測.*未記錄/);
 assert.equal(srv.writes,writes,'item rendering must never write');
 const fields=rows.children[1].children[1];
 const state=fields.children[0].children[0],
  reason=fields.children[1].children[0],save=fields.children[2];
 state.value='PI_REVIEW_PENDING';state.handlers.change();
 reason.value='PI_REVIEW_REQUEST';save.handlers.click();
 assert.equal(srv.writes,writes+1);
 const read=srv.read(),item=read.b07.itemReviews['SIM-002:PRETEST'];
 assert.equal(item.status,'PI_REVIEW_PENDING');
 assert.deepEqual(Object.keys(read.b07.itemReviews),['SIM-002:PRETEST']);
 assert.equal(read.b07.itemHistory[0].from,'UNRECORDED');
 assert.equal(read.b07.itemHistory[0].to,'PI_REVIEW_PENDING');
 assert.equal(read.b07.itemHistory[0].reason,'PI_REVIEW_REQUEST');
 assert.equal(team.get('b07ItemHistory').children.length,1);
 assert.equal(team.calls.includes('ADMIN_B07_ITEM_REVIEW'),true);
 assert.doesNotMatch(teamHtml,/id="b07Amount"|id="b07Pay"|id="b07Receipt"/);
 team.set('b07Experiment','E1');team.change('b07Experiment');
 assert.equal(team.get('b07ItemRows').children.length,1);
 team.click('b07Reset');assert.equal(team.get('b07ItemRows').children.length,4);
 team.set('adminScopeGlobal','E2');team.change('adminScopeGlobal');
 assert.equal(team.get('b07ItemRows').children.length,3);
 assert.equal(srv.writes,writes+1);
 closed(srv);
});
test('B07 item update rejects stale competing owner page, rereads latest stage and never retries',()=>{
 const srv=server();srv.command('START',{experiment:'E2'});
 const a=page(srv,'team'),b=page(srv,'team');
 const fieldsA=a.get('b07ItemRows').children[0].children[1];
 const fieldAState=fieldsA.children[0].children[0];
 fieldAState.value='SOURCE_PENDING';fieldAState.handlers.change();
 fieldsA.children[2].handlers.click();
 const current=srv.read().revision,writes=srv.writes;
 const fieldsB=b.get('b07ItemRows').children[0].children[1];
 const fieldBState=fieldsB.children[0].children[0];
 fieldBState.value='DOCUMENTS_PENDING';fieldBState.handlers.change();
 fieldsB.children[1].children[0].value='DOCUMENT_CHECK';
 fieldsB.children[2].handlers.click();
 assert.equal(srv.read().revision,current);
 assert.equal(srv.writes,writes);
 assert.equal(b.get('b07ItemRows').children[0].children[1].children[0].children[0].value,
  'SOURCE_PENDING');
 assert.equal(b.get('b07ItemHistory').children.length,1);
 assert.ok(b.calls.filter(x=>x==='READ').length>=2);
 closed(srv);
});
test('B07 forged cross-experiment stage or owner read failure removes all stage rows',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});
 const team=page(srv,'team'),writes=srv.writes;
 const orig=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const data=orig();
  data.b07.itemReviews['SIM-001:POSTTEST']={status:'SOURCE_PENDING',actor:'OWNER',
   at:'2026-11-06T12:00:00.000Z'};
  return data;
 };
 team.click('refresh');
 assert.equal(team.get('b07ItemRows').children.length,0);
 assert.equal(team.get('b07Rows').children.length,0);
 assert.match(team.get('b07Status').textContent,/拒絕顯示/);
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('OWNER revoked');};
 team.click('refresh');
 assert.equal(team.get('b07ItemRows').children.length,0);
 assert.equal(team.get('saveModes').disabled,true);
 assert.equal(srv.writes,writes);
 srv.ctx.study1UnifiedPreviewGet=orig;closed(srv);
});

test('B07 B01 B09 B12 TEST status reconciliation, scopes and forged-count rejection',()=>{
 const srv=server();srv.command('START',{experiment:'E1'});srv.command('START',{experiment:'E2'});
 const writes=srv.writes,team=page(srv,'team');
 assert.equal(team.get('b01Cards').children.length,13);
 assert.match(team.get('b01B07Consistency').textContent,/項目4.*尚未記錄4/);
 assert.match(team.get('b09B07Consistency').textContent,/項目4.*尚未記錄4/);
 const fields=team.get('b07ItemRows').children[1].children[1];
 fields.children[0].children[0].value='PI_REVIEW_PENDING';
 fields.children[0].children[0].handlers.change();
 fields.children[1].children[0].value='PI_REVIEW_REQUEST';
 fields.children[2].handlers.click();
 assert.equal(srv.writes,writes+1);
 assert.match(team.get('b01B07Consistency').textContent,/待PI查核1.*尚未記錄3/);
 assert.match(team.get('b09B07Consistency').textContent,/待PI查核1.*尚未記錄3/);
 team.set('adminScopeB01','E1');team.change('adminScopeB01');
 assert.match(team.get('b01B07Consistency').textContent,/項目1.*尚未記錄1/);
 team.set('adminScopeB09','E2');team.change('adminScopeB09');
 assert.match(team.get('b09B07Consistency').textContent,/項目3.*待PI查核1.*尚未記錄2/);
 team.set('b12ModuleFilter','B07');team.set('b12Result','ALL');
 team.set('b12Limit','10');team.set('b12Sort','DESC');
 team.click('b12SearchButton');
 assert.equal(team.get('b12List').children.length,1);
 assert.match(team.get('b12Coverage').textContent,/B07.*1／最多32筆/);
 assert.match(team.get('b12Coverage').textContent,/項目4.*待PI查核1/);
 assert.equal(srv.writes,writes+1,'cross-module reads do not write');
 const orig=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{
  const d=orig();d.b07Summary.total.piReviewPending+=1;return d;
 };
 team.click('refresh');
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b09Metrics').children.length,0);
 assert.equal(team.get('b07ItemRows').children.length,0);
 assert.match(team.get('b01B07Consistency').textContent,/未核實/);
 assert.equal(srv.writes,writes+1);
 srv.ctx.study1UnifiedPreviewGet=orig;closed(srv);
});

test('B01 preference endpoint revocation clears cached cards even when main TEST source still reads',()=>{
 const srv=server(),team=page(srv,'team'),writes=srv.writes;
 team.get('b01LayoutControls').children[0].children[1].handlers.click();
 const original=srv.ctx.study1UnifiedB01LayoutGet;
 srv.ctx.study1UnifiedB01LayoutGet=()=>{throw Error('OWNER layout access revoked');};
 team.click('refresh');
 assert.equal(team.get('b01Cards').children.length,0);
 assert.equal(team.get('b01LayoutControls').children.length,0);
 assert.equal(team.get('b01LayoutSave').disabled,true);
 assert.equal(team.get('b01LayoutReset').disabled,true);
 assert.match(team.get('b01LayoutStatus').textContent,/權限失效|讀取失敗/);
 assert.equal(srv.writes,writes);
 srv.ctx.study1UnifiedB01LayoutGet=original;
 team.click('refresh');
 assert.equal(team.get('b01Cards').children.length,13);
 assert.ok(team.get('b01Cards').children.every(x=>!x.hidden));
 assert.equal(team.get('b01LayoutSave').disabled,true);
 closed(srv);
});

function v07VerifiedVisitor_(srv,options){
 const v=page(srv,'visitor',options);
 v.click('chooseE1');
 for(const id of ['adult','cycu','noDx','noTreatment','noPractice'])v.get(id).checked=true;
 v.click('screenNext');v.click('otpSend');v.click('otpPaste');v.click('otpVerify');
 assert.equal(srv.read().applications[0].phase,'VERIFIED');
 assert.equal(v.get('hold').disabled,false);
 return v;
}
test('V07 network timeout AFTER committed synthetic HOLD shows source current state but never retries',()=>{
 const srv=server(),v=v07VerifiedVisitor_(srv),start=srv.writes;
 const original=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  const applied=original(c);
  if(c.action==='HOLD')throw Error('synthetic timeout after commit');
  return applied;
 };
 v.click('hold');
 assert.equal(srv.read().applications[0].phase,'HELD');
 assert.equal(srv.writes,start+1,'exactly one committed synthetic HOLD');
 assert.match(v.get('v07Result').textContent,/已有暫留|已有暫留或後續進度/);
 assert.match(v.get('v07Result').textContent,/無法證明剛才那次提交成功/);
 assert.equal(v.get('hold').disabled,true);
 assert.equal(v.get('v07Rescan').disabled,false);
 assert.equal(v.calls.filter(c=>c==='HOLD').length,1);
 const before=srv.writes;
 v.click('v07Rescan');
 assert.equal(srv.writes,before,'rescan is readonly; cannot replay');
 assert.equal(v.get('v07Rescan').disabled,true);
 assert.equal(v.get('hold').disabled,true,'already HELD cannot HOLD again');
 assert.equal(v.calls.filter(c=>c==='HOLD').length,1);
 assert.equal(srv.store.get('OPEN'),'false');
 assert.equal(srv.store.get('CONSENT_READY'),'false');
 srv.ctx.study1UnifiedPreviewCommand=original;closed(srv);
});
test('V07 timeout BEFORE write stays unknown and locks all actions until explicit readonly rescan',()=>{
 const srv=server(),v=v07VerifiedVisitor_(srv),start=srv.writes;
 const original=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action==='HOLD')throw Error('synthetic timeout with no commit');
  return original(c);
 };
 v.click('hold');
 assert.equal(srv.read().applications[0].phase,'VERIFIED');
 assert.equal(srv.writes,start);
 assert.match(v.get('v07Result').textContent,/結果未知/);
 assert.doesNotMatch(v.get('v07Result').textContent,/已成立虛構預約/);
 assert.equal(v.get('hold').disabled,true);
 assert.equal(v.get('chooseE1').disabled,true);
 assert.equal(v.get('v07Rescan').disabled,false);
 assert.equal(v.calls.filter(c=>c==='HOLD').length,1);
 v.click('v07Rescan');
 assert.equal(srv.writes,start);
 assert.equal(v.get('hold').disabled,false,'fresh verified user-initiated rescan unlocks');
 assert.equal(v.calls.filter(c=>c==='HOLD').length,1);
 srv.ctx.study1UnifiedPreviewCommand=original;closed(srv);
});
test('V07 loss of owner authority on recovery clears all booking actions without guessing a result',()=>{
 const srv=server(),v=v07VerifiedVisitor_(srv),start=srv.writes;
 const write=srv.ctx.study1UnifiedPreviewCommand,read=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action==='HOLD')throw Error('synthetic ambiguous error');
  return write(c);
 };
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner access revoked');};
 v.click('hold');
 assert.equal(v.get('hold').disabled,true);
 assert.equal(v.get('confirm').disabled,true);
 assert.equal(v.get('chooseE1').disabled,true);
 assert.match(v.get('v07Result').textContent,/狀態未知/);
 assert.equal(v.get('v07Rescan').disabled,false);
 assert.equal(srv.writes,start);
 srv.ctx.study1UnifiedPreviewGet=read;
 srv.ctx.study1UnifiedPreviewCommand=write;
 closed(srv);
});


/* P1-02 B02-A cancellation preflight tests use the original team UI and
 * original GAS TEST source, never a separate research or financial store. */
function cancelTestSession_(team,id='SIM-SLOT-E1-A'){
 const date={'SIM-SLOT-E1-A':'2027-01-05','SIM-SLOT-E1-B':'2027-01-06',
  'SIM-SLOT-E2-A':'2027-01-07','SIM-SLOT-E2-B':'2027-01-08'}[id];
 team.set('calExperiment','ALL');team.set('calStatus','ALL');team.set('calSearch','');
 team.set('calView','day');team.set('calDate',date);team.change('calDate');
 const find=(root,condition)=>{
  if(condition(root))return root;
  for(const n of root.children||[]){const found=find(n,condition);if(found)return found;}
  return null;
 };
 const card=find(team.get('calBoard'),node=>node.dataset?.sessionId===id);
 assert.ok(card,'calendar contains original synthetic session '+id);
 card.handlers.click();
 const cancel=find(team.get('calSessionDetail'),node=>node.textContent==='核對取消場次影響');
 assert.ok(cancel,'B02-A must offer impact review instead of direct cancellation');
 cancel.handlers.click();
 return team.get('calCancelReview');
}



/* Same original GAS transitions, two genuine synthetic bookings for E1-A
 * (capacity=2). No direct edits to fixture bytes, test data or backend state. */
function p1TwoConfirmedSameSlot_(srv){
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false};
 for(let n=1;n<=2;n++){
  const id='SIM-'+String(n).padStart(3,'0');
  srv.command('START',{experiment:'E1'});
  srv.command('SCREEN',{id,answers});
  srv.command('OTP_REQUEST',{id});
  srv.command('OTP_VERIFY',{id,code:'00000000'});
  srv.command('HOLD',{id,slotId:'SIM-SLOT-E1-A'});
  const version=srv.read().policy.consent.E1.version;
  srv.command('CONSENT_REVIEW',{id,version,sha256:''});
  srv.command('CONSENT',{id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
  srv.command('CONFIRM',{id});
 }
 const apps=srv.read().applications;
 assert.deepEqual(apps.map(x=>x.id),['SIM-001','SIM-002']);
 assert.ok(apps.every(x=>x.phase==='CONFIRMED'&&x.slotId==='SIM-SLOT-E1-A'));
}
function p1CancelBoth_(srv){
 const team=page(srv,'team');
 const review=cancelTestSession_(team);
 assert.equal(review.hidden,false);
 assert.match(team.get('calCancelSummary').textContent,/關聯 2 筆.*已成立 2/);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀確認/);
 return team;
}

/* Test actual original GAS transitions: two confirmed synthetic bookings on
 * E1-A, a third confirmed booking on E1-B, independent B02 attendance,
 * then genuine B02-A two-step cancellations. No direct fixture mutation. */
function p1CancelledTwoSlotsWithMixedAttendance_(srv){
 p1TwoConfirmedSameSlot_(srv);
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false},id='SIM-003';
 srv.command('START',{experiment:'E1'});
 srv.command('SCREEN',{id,answers});
 srv.command('OTP_REQUEST',{id});
 srv.command('OTP_VERIFY',{id,code:'00000000'});
 srv.command('HOLD',{id,slotId:'SIM-SLOT-E1-B'});
 const version=srv.read().policy.consent.E1.version;
 srv.command('CONSENT_REVIEW',{id,version,sha256:''});
 srv.command('CONSENT',{id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
 srv.command('CONFIRM',{id});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:'A場已出席'});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-002',attendance:'ABSENT',progress:'NOT_STARTED',note:'A場缺席'});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-003',attendance:'LATE',progress:'COMPLETE',note:'B場遲到行政完成'});
 const before=srv.read(),team=page(srv,'team');
 for(const slotId of ['SIM-SLOT-E1-A','SIM-SLOT-E1-B']){
  cancelTestSession_(team,slotId);
  team.get('calCancelAck').checked=true;team.change('calCancelAck');team.click('calCancelCommit');
  assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀確認/);
 }
 assert.deepEqual(srv.read().applications,before.applications,'cancel does not mutate individual bookings');
 assert.deepEqual(srv.read().b02.attendance,before.b02.attendance,'cancel does not alter attendance');
 assert.deepEqual(srv.read().b04.history,before.b04.history,'cancel never invents B04 changes');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-B'].status,'CANCELLED');
 return team;
}

/* Cross-experiment comparison is TEST-only: use the original GAS transition
 * path for one real synthetic E1 record and one E2 record, then original B02
 * double-confirm session cancellation. E2 remains formally CLOSED. */
function p1CrossExperimentCancelledSlots_(srv){
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false};
 for(const [experiment,slotId] of [
  ['E1','SIM-SLOT-E1-A'],['E2','SIM-SLOT-E2-A']]){
  srv.command('START',{experiment});
  const id='SIM-'+String(srv.read().applications.length).padStart(3,'0');
  srv.command('SCREEN',{id,answers});
  srv.command('OTP_REQUEST',{id});
  srv.command('OTP_VERIFY',{id,code:'00000000'});
  srv.command('HOLD',{id,slotId});
  const version=srv.read().policy.consent[experiment].version;
  srv.command('CONSENT_REVIEW',{id,version,sha256:''});
  srv.command('CONSENT',{id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
  srv.command('CONFIRM',{id});
 }
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',
  progress:'PARTIAL',note:'E1模擬出席'});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-002',attendance:'LATE',
  progress:'COMPLETE',note:'E2模擬遲到'});
 const before=srv.read(),team=page(srv,'team');
 for(const slotId of ['SIM-SLOT-E1-A','SIM-SLOT-E2-A']){
  cancelTestSession_(team,slotId);
  team.get('calCancelAck').checked=true;team.change('calCancelAck');
  team.click('calCancelCommit');
  assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀確認/);
 }
 assert.deepEqual(srv.read().applications,before.applications);
 assert.deepEqual(srv.read().b02.attendance,before.b02.attendance);
 assert.deepEqual(srv.read().b04.history,before.b04.history);
 return team;
}
function p1CompareE1E2_(team){
 team.set('cancelQueueCompareA','SIM-SLOT-E1-A');team.change('cancelQueueCompareA');
 team.set('cancelQueueCompareB','SIM-SLOT-E2-A');team.change('cancelQueueCompareB');
 assert.deepEqual(team.get('cancelQueueCompareCards').children.map(x=>x.dataset.sessionId),
  ['SIM-SLOT-E1-A','SIM-SLOT-E2-A']);
}
function p1CompareBridge_(team,side){
 const card=team.get('cancelQueueCompareCards').children[side];
 assert.ok(card,'expected comparison card side '+side);
 const b=card.children.find(x=>x.tagName==='button'&&/獨立GET核對B03/.test(x.textContent));
 assert.ok(b,'comparison offers original owner GET bridge');
 b.handlers.click();
}
test('P1 E1/E2 cancelled A/B comparison independently GETs B03 and opens correct B04 scope',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes;
 assert.equal(srv.read().mode,'TEST');
 assert.equal(srv.read().open,false);
 assert.equal(srv.read().consentReady,false);
 assert.equal(srv.read().formalReadiness.activationAllowed,false);
 p1CompareE1E2_(team);
 assert.match(team.get('cancelQueueCompareDelta').textContent,/B−A僅人數差｜原關聯 0/);
 assert.match(team.get('cancelQueueCompareStatus').textContent,/SIM-SLOT-E1-A vs B SIM-SLOT-E2-A/);
 assert.match(team.get('cancelQueueCompareCards').children[0].children.map(x=>x.textContent).join(' '),
  /E1.*已出席 1.*部分完成 1/);
 assert.match(team.get('cancelQueueCompareCards').children[1].children.map(x=>x.textContent).join(' '),
  /E2.*遲到 1.*行政完成 1/);
 const n=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(n).filter(x=>x!=='B01_GET'),['READ'],'one independent owner GET, no commands');
 assert.match(team.get('cancelQueueCompareStatus').textContent,/獨立GET核對 E2/);
 assert.equal(team.get('b03Search').value,'SIM-SLOT-E2-A');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-002']);
 team.click('b03BoardMode');
 const board=team.get('b03Board').children.flatMap(x=>x.children)
  .filter(x=>x.className==='b03Columns').flatMap(x=>x.children)
  .flatMap(x=>x.children).filter(x=>x.dataset.participantId);
 assert.deepEqual(board.map(x=>x.dataset.participantId),['SIM-002']);
 assert.match(board[0].textContent,/遲到.*已完成/);
 team.get('entries').children[0].children
  .find(x=>x.tagName==='button'&&/完整資料/.test(x.textContent)).handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 booking.handlers.click();
 assert.match(team.get('profileTabBody').children
  .flatMap(x=>x.children||[]).flatMap(x=>x.children||[]).map(x=>x.textContent).join(' '),
  /SIM-SLOT-E2-A/);
 const research=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='research');
 research.handlers.click();
 assert.match(team.get('profileTabBody').children
  .flatMap(x=>x.children||[]).flatMap(x=>x.children||[]).map(x=>x.textContent).join(' '),
  /E2模擬遲到/);
 team.click('profileBack');
 assert.equal(srv.writes,writes,'cross-experiment B03/B04 inspection strictly read-only');
 closed(srv);
});
test('P1 B03 E1-only scope blocks E2 A/B bridge and B04 queue without changing B02 scope',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes;
 p1CompareE1E2_(team);
 team.set('adminScopeB03','E1');team.change('adminScopeB03');
 assert.equal(team.get('adminScopeB02').value,'INHERIT');
 assert.equal(team.get('cancelQueueMatrix').children.length,2,'B02 ALL retains both E1/E2 counts');
 assert.equal(team.get('cancelQueueCompareCards').children.length,2);
 assert.match(team.get('cancelQueueCompareCards').children[1].children.map(x=>x.textContent).join(' '),
  /B03／B04本頁範圍 E1.*跨頁定位將拒絕/);
 const b03Search=team.get('b03Search').value,n=team.calls.length;
 p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(n),[],'no RPC on denied cross-page navigation');
 assert.equal(team.get('b03Search').value,b03Search);
 assert.match(team.get('cancelQueueCompareStatus').textContent,/跨頁檢視拒絕.*E2.*B03本頁範圍 E1/);
 const queue=team.get('cancelQueueRows').children.find(x=>x.dataset.participantId==='SIM-002');
 assert.ok(queue,'B02 keeps its own E2 row');
 queue.children.at(-1).children[0].handlers.click();
 assert.equal(team.get('profileModule').hidden,true,'out-of-B03-scope E2 B04 must remain closed');
 assert.match(team.get('cancelQueueStatus').textContent,/B04跨頁檢視拒絕/);
 const first=team.calls.length;p1CompareBridge_(team,0);
 assert.deepEqual(team.calls.slice(first).filter(x=>x!=='B01_GET'),['READ']);
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-001']);
 assert.equal(team.get('adminScopeB03').value,'E1');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 E1/E2 A/B B02 scope restriction clears disallowed E2 and cannot be bypassed by manual selection',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes;
 p1CompareE1E2_(team);
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,1);
 assert.equal(team.get('cancelQueueCompareB').value,'NONE');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.some(x=>x.dataset.participantId==='SIM-002'),false);
 team.set('cancelQueueCompareB','SIM-SLOT-E2-A');team.change('cancelQueueCompareB');
 assert.equal(team.get('cancelQueueCompareB').value,'NONE');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 team.set('adminScopeB02','E2');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,1);
 assert.equal(team.get('cancelQueueCompareA').value,'NONE');
 assert.equal(team.get('cancelQueueRows').children.some(x=>x.dataset.participantId==='SIM-001'),false);
 // Explicit B02 local ALL is still view scope, not true PI/RA authorization.
 team.set('adminScopeGlobal','E1');team.change('adminScopeGlobal');
 team.set('adminScopeB02','ALL');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 p1CompareE1E2_(team);
 const n=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(n),[],'global E1 inherited B03 refuses E2');
 assert.equal(team.get('adminScopeGlobal').value,'E1');
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 const from=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(from).filter(x=>x!=='B01_GET'),['READ']);
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-002']);
 assert.equal(team.get('adminScopeGlobal').value,'E1','bridge never broadens GLOBAL');
 assert.equal(team.get('adminScopeB03').value,'E2','existing explicit view override retained');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 E1/E2 A/B compare independent owner GET failure clears B02/B03/B04 and restores read-only',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes,read=srv.read;
 p1CompareE1E2_(team);
 srv.read=()=>{throw Error('OWNER revoked after comparison');};
 const n=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(n),['READ']);
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('cancelQueueCompareA').disabled,true);
 assert.equal(srv.writes,writes);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueCompareCards').children.length,2);
 assert.equal(srv.writes,writes);
 closed(srv);
});

test('P1 in-flight independent OWNER GET rejects B02 scope switch and safely redraws current E1 only',()=>{
 const srv=server();p1CrossExperimentCancelledSlots_(srv);
 const team=page(srv,'team',{deferOwnerReads:true}),writes=srv.writes;
 p1CompareE1E2_(team);
 const from=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(from).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.pendingOwnerReads.length,1);
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 team.deliverOwnerRead();
 assert.match(team.get('cancelQueueCompareStatus').textContent,/範圍或A\/B選取曾切換.*取消舊跨頁定位/);
 assert.equal(team.get('cancelQueueMatrix').children.length,1,'current B02 E1 only');
 assert.equal(team.get('cancelQueueCompareB').value,'NONE','E2 selection cannot be restored');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.equal(team.get('b03Search').value,'','old E2 ID cannot target B03');
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(srv.writes,writes,'no cross-experiment write or replay');
 closed(srv);
});
test('P1 in-flight B03 E1/ALL/E1 ABA scope change invalidates stale A/B GET without loosening B04',()=>{
 const srv=server();p1CrossExperimentCancelledSlots_(srv);
 const team=page(srv,'team',{deferOwnerReads:true}),writes=srv.writes;
 p1CompareE1E2_(team);p1CompareBridge_(team,1);
 assert.equal(team.pendingOwnerReads.length,1);
 team.set('adminScopeB03','E1');team.change('adminScopeB03');
 team.set('adminScopeB03','ALL');team.change('adminScopeB03');
 team.deliverOwnerRead();
 assert.match(team.get('cancelQueueCompareStatus').textContent,/曾切換.*取消舊跨頁定位/);
 assert.equal(team.get('cancelQueueCompareCards').children.length,2,'B02 remains ALL');
 assert.equal(team.get('b03Search').value,'','do not silently locate old E2 under ABA');
 assert.equal(team.get('profileModule').hidden,true);
 // A stale E2 participant callback must remain blocked after B03 scope narrows.
 const row=team.get('entries').children.find(x=>x.dataset.participantId==='SIM-002');
 const oldButton=row.children.find(x=>x.tagName==='button'&&/完整資料/.test(x.textContent));
 team.set('adminScopeB03','E1');team.change('adminScopeB03');
 oldButton.handlers.click();
 assert.equal(team.get('profileModule').hidden,true,'old E2 B04 callback rejected');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 independent GET with concurrent GAS revision shows safe newer snapshot, not stale B03 positioning',()=>{
 const srv=server();p1CrossExperimentCancelledSlots_(srv);
 const team=page(srv,'team',{deferOwnerReads:true}),writes=srv.writes;
 p1CompareE1E2_(team);p1CompareBridge_(team,1);
 assert.equal(team.pendingOwnerReads.length,1);
 // Existing backend deliberately forbids editing attendance on a CANCELLED slot.
 // Simulate a legitimate concurrent revision via the original CLOSED-site TEST settings CAS.
 srv.command('ADMIN_RECRUITMENT',{settings:{
  E1:{year:2026,mode:'COMING_SOON'},E2:{year:2027,mode:'COMING_SOON'}
 }});
 team.deliverOwnerRead();
 assert.match(team.get('cancelQueueCompareStatus').textContent,/修訂版改變.*舊A\/B定位未執行/);
 assert.equal(team.get('b03Search').value,'');
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(srv.writes,writes+1,'only the independent competing TEST command wrote');
 closed(srv);
});
test('P1 post-write cancel independently GETs after B02/B03 scope change and safely restores current scope',()=>{
 const srv=server();p1TwoConfirmedSameSlot_(srv);
 const team=page(srv,'team',{deferOwnerReads:true}),writes=srv.writes;
 cancelTestSession_(team);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 assert.equal(team.pendingOwnerReads.length,1,'one cancellation write awaiting separate OWNER GET');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED','GAS CAS wrote once');
 team.set('adminScopeB02','E2');team.change('adminScopeB02');
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 team.deliverOwnerRead();
 assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀核實.*範圍曾切換.*安全恢復/);
 assert.equal(team.get('calSessionDetail').children.length,0,'E1 session not reopened in E2');
 assert.equal(team.get('cancelQueueMatrix').children.length,0,'E2 has no cancelled slot');
 assert.equal(team.get('profileModule').hidden,true,'never reopens stale B04');
 assert.equal(srv.writes,writes+1,'no replay or double cancellation');
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,1,'safe manual E1 switch shows verified cancel');
 assert.equal(srv.writes,writes+1);
 closed(srv);
});

/* True original GAS TEST transitions, not fixture-patching: E1 hold at clock T,
 * E2 hold at T+15m after E1 expiry. Both original B02 cancellations preserve
 * phase, holdUntil, attendance and B04 history. Clock is VM-only. */
function p1CancelledMixedHoldsE1E2_(srv){
 const clock={now:Date.now()};
 class HoldClock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=HoldClock;
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false};
 const hold=(exp,slotId)=>{
  srv.command('START',{experiment:exp});
  const id='SIM-'+String(srv.read().applications.length).padStart(3,'0');
  srv.command('SCREEN',{id,answers});
  srv.command('OTP_REQUEST',{id});
  srv.command('OTP_VERIFY',{id,code:'00000000'});
  srv.command('HOLD',{id,slotId});
  return srv.read().applications.find(a=>a.id===id);
 };
 const e1=hold('E1','SIM-SLOT-E1-A');
 assert.equal(e1.phase,'HELD');
 clock.now=e1.holdUntil+1;
 const e2=hold('E2','SIM-SLOT-E2-A');
 assert.equal(e2.phase,'HELD');
 assert.equal(srv.read().applications[0].holdExpired,true);
 assert.equal(srv.read().applications[1].holdExpired,false);
 const old=srv.read(),team=page(srv,'team',{Date:HoldClock});
 for(const slot of ['SIM-SLOT-E1-A','SIM-SLOT-E2-A']){
  cancelTestSession_(team,slot);
  team.get('calCancelAck').checked=true;team.change('calCancelAck');
  team.click('calCancelCommit');
  assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀確認/);
 }
 assert.deepEqual(srv.read().applications,old.applications,'cancellation preserves pending holds');
 assert.deepEqual(srv.read().b02.attendance,old.b02.attendance);
 assert.deepEqual(srv.read().b04.history,old.b04.history);
 return {team,clock,HoldClock};
}
test('P1 E1 expired vs E2 active holds compare B02 A/B, filter and B03/B04 one original source',()=>{
 const srv=server(),{team}=p1CancelledMixedHoldsE1E2_(srv),writes=srv.writes;
 p1CompareE1E2_(team);
 const cards=team.get('cancelQueueCompareCards').children;
 assert.equal(cards.length,2);
 assert.match(cards[0].children.map(x=>x.textContent).join(' '),/E1.*暫留：有效 0｜逾期 1/);
 assert.match(cards[1].children.map(x=>x.textContent).join(' '),/E2.*暫留：有效 1｜逾期 0/);
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId).length,2);
 team.set('cancelQueueHoldFilter','EXPIRED');team.change('cancelQueueHoldFilter');
 assert.deepEqual(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId)
  .map(x=>x.dataset.participantId),['SIM-001']);
 team.set('cancelQueueHoldFilter','ACTIVE');team.change('cancelQueueHoldFilter');
 assert.deepEqual(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId)
  .map(x=>x.dataset.participantId),['SIM-002']);
 team.set('cancelQueueHoldFilter','ALL');team.change('cancelQueueHoldFilter');
 assert.equal(team.get('cancelQueueMatrix').children.length,2,'matrix denominator unaffected by filter');
 p1CompareBridge_(team,0);
 assert.equal(team.get('b03Search').value,'SIM-SLOT-E1-A');
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),/暫留已逾期/);
 team.get('entries').children[0].children.find(x=>x.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 booking.handlers.click();
 const details=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 assert.match(details.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),
  /暫留已逾期.*是（依本頁回讀時間）/);
 team.click('profileBack');
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 p1CompareBridge_(team,1);
 assert.equal(team.get('b03Search').value,'SIM-SLOT-E2-A');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-002']);
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),/有效暫留/);
 assert.equal(srv.writes,writes,'A/B, B03 and B04 are only owner GET/filter');
 closed(srv);
});
test('P1 in-flight E2 active→expired without CAS invalidates stale A/B to B03 and restores time-specific read-only state',()=>{
 const srv=server(),{clock,HoldClock}=p1CancelledMixedHoldsE1E2_(srv);
 const team=page(srv,'team',{Date:HoldClock,deferOwnerReads:true}),writes=srv.writes;
 p1CompareE1E2_(team);
 const n=team.calls.length;p1CompareBridge_(team,1);
 assert.deepEqual(team.calls.slice(n).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.pendingOwnerReads.length,1);
 clock.now=srv.read().applications[1].holdUntil+1;
 team.deliverOwnerRead();
 assert.match(team.get('cancelQueueCompareStatus').textContent,/有效／逾期暫留分類或期限已跨界.*拒絕舊A\/B跨頁定位/);
 assert.equal(team.get('b03Search').value,'');
 assert.match(team.get('cancelQueueMatrix').children[1].children.map(x=>x.textContent).join(' '),/暫留：有效 0｜逾期 1/);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(srv.writes,writes,'temporal GET does not send a command');
 closed(srv);
});
test('P1 cancelled E2 active-hold B04 stale link and already-open tab fail closed on expiry, fresh GET safely recovers',()=>{
 const srv=server(),{team,clock}=p1CancelledMixedHoldsE1E2_(srv),writes=srv.writes;
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 const row=team.get('cancelQueueRows').children.find(x=>x.dataset.participantId==='SIM-002');
 const full=row.children.at(-1).children[0];
 full.handlers.click();assert.equal(team.get('profileModule').hidden,false);
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 clock.now=srv.read().applications[1].holdUntil+1;
 booking.handlers.click();
 assert.equal(team.get('profileModule').hidden,true,'old open B04 closes when cutoff passes');
 assert.equal(team.get('profileTabBody').children.length,0,'no stale full records remain');
 full.handlers.click();
 assert.equal(team.get('profileModule').hidden,true,'stale queue closure cannot re-open B04');
 assert.match(team.get('cancelQueueStatus').textContent,/暫留期限已跨界.*拒絕舊B04入口/);
 const calls=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(calls).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.get('cancelQueueRows').children.find(x=>x.dataset.participantId==='SIM-002').dataset.holdKind,'EXPIRED');
 const nowRow=team.get('cancelQueueRows').children.find(x=>x.dataset.participantId==='SIM-002');
 nowRow.children.at(-1).children[0].handlers.click();
 assert.equal(team.get('profileModule').hidden,false,'new owner GET allows scoped read-only B04');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 forged pending hold expiry or cross-experiment slot fails complete B02/B03/B04 source closed',()=>{
 const srv=server(),{team}=p1CancelledMixedHoldsE1E2_(srv),writes=srv.writes,read=srv.read;
 team.set('adminScopeB03','E1');team.change('adminScopeB03');
 const row=team.get('cancelQueueRows').children.find(x=>x.dataset.participantId==='SIM-001');
 row.children.at(-1).children[0].handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 srv.read=()=>{const d=read();d.applications[0].holdUntil='forged-expiry';return d;};
 team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('profileTabBody').children.length,0);
 srv.read=()=>{const d=read();d.applications[1].slotId='SIM-SLOT-E1-A';return d;};
 team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId).length,2);
 assert.equal(srv.writes,writes);
 closed(srv);
});

/* B02 has a genuine 12-event ring, not a complete historical event store.
 * All 13 follow-up changes are original locked ADMIN_B02_SLOT transactions;
 * no test fixture patch, new external storage, or administrator side effects. */
test('P1 E1/E2 cancelled slots retain current status after true 12-entry B02 history truncation, with B03/B04 evidence limits',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),initial=srv.read();
 const target=initial.slots.find(x=>x.id==='SIM-SLOT-E1-B');
 assert.ok(target,'original E1-B slot exists; B02.sessions metadata may be absent for unedited slots');
 const meta=initial.b02.sessions[target.id]||{minutes:120,place:''};
 assert.equal(initial.b02.history.filter(x=>x.action==='CANCEL').length,2);
 for(let i=0;i<13;i++)srv.command('ADMIN_B02_SLOT',{
  operation:'UPDATE',slotId:target.id,experiment:target.experiment,
  when:target.when,capacity:target.capacity,minutes:meta.minutes,
  title:'有限歷程更新'+String(i).padStart(2,'0'),place:meta.place,
  scope:'ONE',repeatCount:1
 });
 const d=srv.read(),writes=srv.writes;
 assert.equal(d.b02.history.length,12);
 assert.equal(d.b02.history.some(h=>h.action==='CANCEL'),false,'genuine ring trimmed earlier cancellation');
 assert.equal(d.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(d.b02.sessions['SIM-SLOT-E2-A'].status,'CANCELLED');
 assert.deepEqual(d.applications,initial.applications,'B02 history rotation leaves linked bookings intact');
 assert.deepEqual(d.b02.attendance,initial.b02.attendance);
 assert.deepEqual(d.b04.history,initial.b04.history);
 team.click('refresh');
 assert.deepEqual(team.get('cancelQueueMatrix').children.map(x=>x.dataset.sessionId),
  ['SIM-SLOT-E1-A','SIM-SLOT-E2-A']);
 assert.match(team.get('cancelQueueMatrix').children[0].children.map(x=>x.textContent).join(' '),
  /近期B02有限歷程未保留取消事件，可能已截斷/);
 assert.match(team.get('cancelQueueMatrix').children[1].children.map(x=>x.textContent).join(' '),
  /可能已截斷/);
 p1CompareE1E2_(team);
 assert.match(team.get('cancelQueueCompareCards').children[0].children.map(x=>x.textContent).join(' '),
  /可能已截斷/);
 assert.equal(team.get('cancelQueueRows').children.length,2);
 team.get('cancelQueueRows').children[0].children.at(-1).children[2].handlers.click();
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),
  /可能已截斷/);
 team.get('entries').children[0].children.find(x=>x.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 booking.handlers.click();
 const fields=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 assert.match(fields.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),
  /取消來源歷程.*可能已截斷/);
 assert.match(team.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),
  /B02有限歷程截斷提示/);
 assert.equal(srv.writes,writes,'all admin cross-page reconciliation remains read only');
 closed(srv);
});
test('P1 retained B02 cancellation provenance is explicit but bounded and never claims complete audit',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes;
 const cards=team.get('cancelQueueMatrix').children;
 assert.match(cards[0].children.map(x=>x.textContent).join(' '),
  /近期B02有限歷程保留取消事件 1 筆/);
 assert.match(cards[1].children.map(x=>x.textContent).join(' '),
  /無可重建的完整更正前後值/);
 p1CompareE1E2_(team);
 assert.match(team.get('cancelQueueCompareCards').children[1].children.map(x=>x.textContent).join(' '),
  /近期B02有限歷程保留取消事件/);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 B02 bounded event forgery, cross-experiment slot IDs and B04 before/after discontinuity all clear old B02/B03/B04',()=>{
 const srv=server(),team=p1CrossExperimentCancelledSlots_(srv),writes=srv.writes,read=srv.read;
 team.get('cancelQueueRows').children[0].children.at(-1).children[0].handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 const reject=mutate=>{
  srv.read=()=>{const d=read();mutate(d);return d;};
  team.click('refresh');
  assert.equal(team.get('cancelQueueMatrix').children.length,0);
  assert.equal(team.get('cancelQueueRows').children.length,0);
  assert.equal(team.get('entries').children.length,0);
  assert.equal(team.get('profileModule').hidden,true);
  assert.equal(team.get('profileTabBody').children.length,0);
 };
 reject(d=>{d.b02.history.at(-1).action='UNRECOGNIZED';});
 reject(d=>{d.b02.history.at(-1).ids=['SIM-SLOT-E1-A','SIM-SLOT-E2-A'];});
 reject(d=>{d.b02.history.at(-1).at='invalid-time';});
 reject(d=>{d.b02.history.push(...Array(13).fill(d.b02.history.at(-1)));});
 reject(d=>{d.b04.history.at(-1).actor='FORGED';});
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueRows').children.length,2);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 genuine B04 30-entry trim preserves latest note and rejects discontinuous retained entries without inventing missing history',()=>{
 const srv=server(),v=v07VerifiedVisitor_(srv);v.click('hold');
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const slot='SIM-SLOT-E1-A';
 for(let i=0;i<31;i++)srv.command('ADMIN_B04_NOTE',{
  id:'SIM-001',note:'備註'+String(i).padStart(2,'0'),reason:'純測試人工更正'
 });
 const d=srv.read(),writes=srv.writes;
 assert.equal(d.b04.history.length,30,'actual legacy 30 event ring');
 assert.notEqual(d.b04.history[0].before,'','oldest retained event is not initial write');
 assert.equal(d.b04.notes['SIM-001'],'備註30');
 team.click('refresh');
 assert.match(team.get('cancelQueueMatrix').children[0].children.map(x=>x.textContent).join(' '),
  /近期B02有限歷程保留取消事件/);
 team.get('cancelQueueRows').children[0].children.at(-1).children[0].handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');
 booking.handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 const read=srv.read;
 srv.read=()=>{const forged=read();forged.b04.history[1].before='不連續的前值';return forged;};
 team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children.length,1);
 assert.equal(team.get('cancelQueueRows').children[0].dataset.sessionId,slot);
 assert.equal(srv.writes,writes);
 closed(srv);
});

test('P1 B02 two cancelled sessions compare real mixed attendance/progress counts and B03/B04 without writes',()=>{
 const srv=server(),team=p1CancelledTwoSlotsWithMixedAttendance_(srv),writes=srv.writes;
 const matrix=team.get('cancelQueueMatrix'),rows=team.get('cancelQueueRows');
 assert.equal(matrix.children.length,2);assert.equal(rows.children.length,3);
 const names=rows.children.filter(x=>x.dataset.participantId).map(x=>x.dataset.participantId);
 assert.deepEqual(names,['SIM-001','SIM-002','SIM-003']);
 const a=matrix.children[0].children.map(x=>x.textContent).join(' '),
  b=matrix.children[1].children.map(x=>x.textContent).join(' ');
 assert.match(a,/原關聯 2 筆/);assert.match(a,/已出席 1.*缺席 1/);
 assert.match(a,/未開始 1.*部分完成 1/);
 assert.match(b,/原關聯 1 筆/);assert.match(b,/遲到 1/);
 assert.match(b,/行政完成 1（非研究完成）/);
 team.set('cancelQueueCompareA','SIM-SLOT-E1-A');team.change('cancelQueueCompareA');
 team.set('cancelQueueCompareB','SIM-SLOT-E1-B');team.change('cancelQueueCompareB');
 const cards=team.get('cancelQueueCompareCards');
 assert.equal(cards.children.length,2);
 assert.deepEqual(cards.children.map(x=>x.dataset.sessionId),['SIM-SLOT-E1-A','SIM-SLOT-E1-B']);
 assert.match(cards.children[0].children.map(x=>x.textContent).join(' '),/原關聯 2 筆.*已出席 1.*缺席 1.*部分完成 1/);
 assert.match(cards.children[1].children.map(x=>x.textContent).join(' '),/原關聯 1 筆.*遲到 1.*行政完成 1/);
 const delta=team.get('cancelQueueCompareDelta').textContent;
 assert.match(delta,/B−A僅人數差｜原關聯 -1/);
 assert.match(delta,/待人工核對 -1/);
 assert.match(delta,/已出席 -1.*遲到 \+1.*缺席 -1/);
 assert.match(delta,/未開始 -1.*部分完成 -1.*行政完成 \+1/);
 assert.match(team.get('cancelQueueCompareStatus').textContent,/原GAS純TEST修訂版/);
 cards.children[1].children.at(-1).handlers.click();
 assert.equal(team.get('cancelQueueSlot').value,'SIM-SLOT-E1-B');
 assert.deepEqual(rows.children.filter(x=>x.dataset.participantId).map(x=>x.dataset.participantId),['SIM-003']);
 assert.equal(team.get('cancelQueueCompareCards').children.length,2,
  'narrowing per-person list must not alter comparison denominators');
 const single=rows.children.find(x=>x.dataset.participantId==='SIM-003');
 assert.match(single.children.map(x=>x.textContent).join(' '),/遲到.*已完成/);
 // Existing B03 list/board and B04 research tab still show SAME person values.
 team.set('b03Attendance','LATE');team.change('b03Attendance');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-003']);
 team.click('b03BoardMode');
 const board=team.get('b03Board').children.flatMap(x=>x.children)
  .filter(x=>x.className==='b03Columns').flatMap(x=>x.children)
  .flatMap(x=>x.children).filter(x=>x.dataset.participantId);
 assert.deepEqual(board.map(x=>x.dataset.participantId),['SIM-003']);
 assert.match(board[0].textContent,/遲到.*已完成/);
 single.children.at(-1).children[0].handlers.click();
 const tab=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='research');tab.handlers.click();
 const grid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 assert.match(grid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),
  /B場遲到行政完成/);
 team.click('profileBack');
 const from=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(from).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.get('cancelQueueCompareCards').children.length,2,'owner readback preserves valid A/B selection');
 assert.match(team.get('cancelQueueCompareDelta').textContent,/原關聯 -1/);
 assert.equal(srv.writes,writes,'comparison, B03/B04 and source GET are strictly read-only');
 closed(srv);
});
test('P1 cancelled two-slot comparison resets on identical slot, manual clear and B02 scope change',()=>{
 const srv=server(),team=p1CancelledTwoSlotsWithMixedAttendance_(srv),writes=srv.writes;
 team.set('cancelQueueCompareA','SIM-SLOT-E1-A');team.change('cancelQueueCompareA');
 team.set('cancelQueueCompareB','SIM-SLOT-E1-A');team.change('cancelQueueCompareB');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.match(team.get('cancelQueueCompareStatus').textContent,/不可拿同一取消場次/);
 team.set('cancelQueueCompareB','SIM-SLOT-E1-B');team.change('cancelQueueCompareB');
 assert.equal(team.get('cancelQueueCompareCards').children.length,2);
 team.click('cancelQueueCompareClear');
 assert.equal(team.get('cancelQueueCompareA').value,'NONE');
 assert.equal(team.get('cancelQueueCompareB').value,'NONE');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 team.set('cancelQueueCompareA','SIM-SLOT-E1-A');team.change('cancelQueueCompareA');
 team.set('cancelQueueCompareB','SIM-SLOT-E1-B');team.change('cancelQueueCompareB');
 team.set('adminScopeB02','E2');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueCompareA').value,'NONE');
 assert.equal(team.get('cancelQueueCompareB').value,'NONE');
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.some(x=>x.dataset.participantId),false);
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueCompareCards').children.length,0,
  'old out-of-scope comparison never silently reappears');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 cancelled two-slot comparison rejects forged B04 post-value and recovers with single owner GET',()=>{
 const srv=server(),team=p1CancelledTwoSlotsWithMixedAttendance_(srv);
 team.set('cancelQueueCompareA','SIM-SLOT-E1-A');team.change('cancelQueueCompareA');
 team.set('cancelQueueCompareB','SIM-SLOT-E1-B');team.change('cancelQueueCompareB');
 const writes=srv.writes,read=srv.read;
 assert.equal(team.get('cancelQueueCompareCards').children.length,2);
 srv.read=()=>{const d=read();d.b04.history.at(-1).after='ABSENT / COMPLETE';return d;};
 const from=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(from),['READ']);
 assert.equal(team.get('cancelQueueCompareCards').children.length,0);
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('cancelQueueCompareA').disabled,true);
 assert.match(team.get('cancelQueueCompareStatus').textContent,/清除|清空|無法/);
 assert.equal(srv.writes,writes);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(team.get('cancelQueueCompareCards').children.length,2);
 assert.equal(srv.writes,writes);
 closed(srv);
});

test('P1 B02 cancelled two-person session matrix independently reconciles divergent attendance/progress across B03/B04',()=>{
 const srv=server();p1TwoConfirmedSameSlot_(srv);
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',
  progress:'PARTIAL',note:'虛構第一位出席'});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-002',attendance:'ABSENT',
  progress:'NOT_STARTED',note:'虛構第二位缺席'});
 const before=srv.read(),team=p1CancelBoth_(srv),writes=srv.writes;
 const matrix=team.get('cancelQueueMatrix'),rows=team.get('cancelQueueRows');
 assert.equal(matrix.children.length,1);
 const card=matrix.children[0];
 assert.equal(card.dataset.sessionId,'SIM-SLOT-E1-A');
 const summary=card.children.map(x=>x.textContent).join(' ');
 assert.match(summary,/原關聯 2 筆｜待人工核對 2｜僅保留歷程 0/);
 assert.match(summary,/已出席 1.*缺席 1/);
 assert.match(summary,/未開始 1.*部分完成 1/);
 assert.equal(rows.children.length,2);
 assert.deepEqual(rows.children.map(x=>x.dataset.participantId),['SIM-001','SIM-002']);
 assert.match(rows.children[0].children.map(x=>x.textContent).join(' '),/已出席.*部分完成.*虛構第一位出席/);
 assert.match(rows.children[1].children.map(x=>x.textContent).join(' '),/缺席.*未開始.*虛構第二位缺席/);
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.deepEqual(srv.read().applications,before.applications,'cancellation preserves both booking records');
 assert.deepEqual(srv.read().b02.attendance,before.b02.attendance,'cancellation preserves each attendance and progress');
 assert.deepEqual(srv.read().b04.history,before.b04.history,'cancellation does not invent B04 corrections');
 // Read-only filtering never changes the per-session total (denominator).
 team.set('cancelQueueAttendance','PRESENT');team.change('cancelQueueAttendance');
 assert.deepEqual(rows.children.filter(x=>x.dataset.participantId).map(x=>x.dataset.participantId),['SIM-001']);
 assert.match(matrix.children[0].children.map(x=>x.textContent).join(' '),/已出席 1.*缺席 1/);
 team.set('cancelQueueProgress','NOT_STARTED');team.change('cancelQueueProgress');
 assert.equal(rows.children.some(x=>x.dataset.participantId),false);
 team.set('cancelQueueAttendance','ALL');team.change('cancelQueueAttendance');
 assert.deepEqual(rows.children.filter(x=>x.dataset.participantId).map(x=>x.dataset.participantId),['SIM-002']);
 team.click('cancelQueueClear');
 assert.equal(rows.children.length,2);
 team.set('b03Attendance','ABSENT');team.change('b03Attendance');
 assert.deepEqual(team.get('entries').children.map(x=>x.dataset.participantId),['SIM-002']);
 team.click('b03BoardMode');
 const board=team.get('b03Board').children.flatMap(g=>g.children)
  .filter(x=>x.className==='b03Columns').flatMap(g=>g.children)
  .flatMap(g=>g.children).filter(x=>x.dataset.participantId);
 assert.deepEqual(board.map(x=>x.dataset.participantId),['SIM-002']);
 assert.match(board[0].textContent,/缺席.*未開始/);
 team.set('b03Attendance','ALL');team.change('b03Attendance');
 for(const id of ['SIM-001','SIM-002']){
  const row=team.get('cancelQueueRows').children.find(x=>x.dataset.participantId===id);
  row.children.at(-1).children[0].handlers.click();
  const tab=[...team.context.document.querySelectorAll('[data-b04-tab]')]
   .find(x=>x.dataset.b04Tab==='research');
  tab.handlers.click();
  const grid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
  const values=grid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' ');
  assert.match(values,new RegExp(id==='SIM-001'?'虛構第一位出席':'虛構第二位缺席'));
  assert.match(values,new RegExp(id==='SIM-001'?'已出席':'缺席'));
  team.click('profileBack');
 }
 const n=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(n).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.get('cancelQueueMatrix').children.length,1);
 assert.equal(team.get('cancelQueueRows').children.length,2);
 assert.equal(srv.writes,writes,'every matrix filter, B03/B04 visit and GET is read-only');
 closed(srv);
});
test('P1 cancelled multi-person session selector preserves one-slot denominator and resets safely across scope',()=>{
 const srv=server();p1TwoConfirmedSameSlot_(srv);
 const team=p1CancelBoth_(srv),writes=srv.writes;
 // Cancel other unoccupied E1-B under original backend after the first cancellation.
 const second=cancelTestSession_(team,'SIM-SLOT-E1-B');
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-B'].status,'CANCELLED');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.match(team.get('cancelQueueMatrix').children[1].children.map(x=>x.textContent).join(' '),/原關聯 0 筆/);
 team.get('cancelQueueMatrix').children[0].children.at(-1).handlers.click();
 assert.equal(team.get('cancelQueueSlot').value,'SIM-SLOT-E1-A');
 assert.deepEqual(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId)
  .map(x=>x.dataset.participantId),['SIM-001','SIM-002']);
 const before=team.calls.length,nowWrites=srv.writes;
 team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(before).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.get('cancelQueueSlot').value,'SIM-SLOT-E1-A');
 assert.equal(team.get('cancelQueueRows').children.filter(x=>x.dataset.participantId).length,2);
 team.set('adminScopeB02','E2');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueSlot').value,'ALL','hidden E1 slot cannot survive E2 scope');
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.some(x=>x.dataset.participantId),false);
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueMatrix').children.length,2);
 assert.equal(srv.writes,nowWrites);
 assert.ok(srv.writes>=writes);
 closed(srv);
});
test('P1 two-person cancelled matrix rejects forged cross-page B04 attendance and clears stale summaries',()=>{
 const srv=server();p1TwoConfirmedSameSlot_(srv);
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:''});
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-002',attendance:'ABSENT',progress:'NOT_STARTED',note:''});
 const team=p1CancelBoth_(srv),writes=srv.writes,orig=srv.read;
 assert.equal(team.get('cancelQueueMatrix').children.length,1);
 srv.read=()=>{const d=orig();d.b04.history.at(-1).after='PRESENT / COMPLETE';return d;};
 const n=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(n),['READ']);
 assert.equal(team.get('cancelQueueMatrix').children.length,0);
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('cancelQueueRefresh').disabled,true);
 assert.equal(srv.writes,writes);
 srv.read=orig;team.click('refresh');
 assert.equal(team.get('cancelQueueMatrix').children.length,1);
 assert.equal(team.get('cancelQueueRows').children.length,2);
 assert.equal(srv.writes,writes);
 closed(srv);
});

test('P1 cancelled-session queue derives linked booking and attendance, filters, and opens B02/B03/B04 without writes',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:'虛構出席交接'});
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const writes=srv.writes,rev=srv.read().revision,queue=team.get('cancelQueueRows');
 assert.equal(queue.children.length,1);
 const row=queue.children[0];
 assert.equal(row.dataset.participantId,'SIM-001');
 assert.equal(row.dataset.reviewKind,'REVIEW');
 assert.match(row.children.map(x=>x.textContent).join(' '),/預約成立仍關聯已取消場次，待人工核對/);
 assert.match(row.children.map(x=>x.textContent).join(' '),/已出席.*部分完成/);
 assert.match(row.children.map(x=>x.textContent).join(' '),/虛構出席交接/);
 assert.match(team.get('cancelQueueStatus').textContent,/關聯 1 筆（待人工核對 1、僅保留歷程 0）/);
 team.set('cancelQueueFilter','HISTORY');team.change('cancelQueueFilter');
 assert.equal(queue.children.some(x=>x.dataset.participantId),false);
 team.set('cancelQueueFilter','REVIEW');team.change('cancelQueueFilter');
 assert.equal(queue.children[0].dataset.participantId,'SIM-001');
 team.set('cancelQueueSearch','SIM-999');team.get('cancelQueueSearch').handlers.input();
 assert.equal(queue.children.some(x=>x.dataset.participantId),false);
 team.click('cancelQueueClear');
 assert.equal(queue.children[0].dataset.participantId,'SIM-001');
 const actions=queue.children[0].children.at(-1).children;
 actions[0].handlers.click();
 assert.equal(team.get('profileModule').hidden,false);
 assert.match(team.get('profileSummary').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/已出席/);
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 const bookingGrid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 assert.match(bookingGrid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/預約成立仍關聯已取消場次，待人工核對/);
 team.click('profileBack');
 assert.equal(team.get('profileModule').hidden,true);
 actions[2].handlers.click();
 assert.equal(team.get('b03Search').value,'SIM-001');
 assert.equal(team.get('entries').children.length,1);
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),/場次 已取消（個別預約未取消，待人工處理）/);
 actions[1].handlers.click();
 assert.equal(team.get('calStatus').value,'CANCELLED');
 assert.match(team.get('calSessionDetail').children.map(x=>x.textContent).join(' '),/已取消/);
 const n=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(n).filter(x=>x!=='B01_GET'),['READ']);
 assert.equal(team.get('cancelQueueRows').children[0].dataset.participantId,'SIM-001');
 assert.match(team.get('cancelQueueStatus').textContent,new RegExp('修訂版 '+rev));
 assert.equal(srv.writes,writes,'filters and all source navigation are view-only');
 closed(srv);
});
test('P1 cancelled-session queue classifies individually cancelled booking as history, never as human completed',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 assert.equal(srv.read().applications[0].phase,'CANCELLED');
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const writes=srv.writes,rows=team.get('cancelQueueRows');
 assert.equal(rows.children[0].dataset.reviewKind,'HISTORY');
 assert.match(rows.children[0].children.map(x=>x.textContent).join(' '),/個別申請已取消，僅保留歷程（非人工核結）/);
 assert.match(team.get('cancelQueueStatus').textContent,/待人工核對 0、僅保留歷程 1/);
 team.set('cancelQueueFilter','REVIEW');team.change('cancelQueueFilter');
 assert.equal(rows.children.some(x=>x.dataset.participantId),false);
 team.set('cancelQueueFilter','HISTORY');team.change('cancelQueueFilter');
 assert.equal(rows.children[0].dataset.participantId,'SIM-001');
 const actions=rows.children[0].children.at(-1).children;
 actions[2].handlers.click();
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),/個別關聯僅保留歷程/);
 actions[0].handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 const grid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 assert.match(grid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),/個別關聯僅保留歷程，未判定人工完成/);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 cancelled-session queue follows B02 owner scope and refuses cross-scope B03 navigation',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const writes=srv.writes;
 team.set('adminScopeB02','E2');team.change('adminScopeB02');
 assert.match(team.get('cancelQueueStatus').textContent,/B02本頁範圍 E2.*關聯 0/);
 assert.equal(team.get('cancelQueueRows').children.some(x=>x.dataset.participantId),false);
 team.set('adminScopeB02','E1');team.change('adminScopeB02');
 assert.equal(team.get('cancelQueueRows').children[0].dataset.participantId,'SIM-001');
 team.set('adminScopeB03','E2');team.change('adminScopeB03');
 const n=team.get('cancelQueueRows').children[0].children.at(-1).children;
 n[2].handlers.click();
 assert.match(team.get('cancelQueueStatus').textContent,/B03本頁範圍不含此實驗/);
 assert.equal(team.get('b03Search').value,'');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 cancelled-session queue independent GET denial clears source, stays read-only and recovers',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const writes=srv.writes,read=srv.read;
 srv.read=()=>{throw Error('OWNER revoked');};
 const n=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(n),['READ']);
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('profileModule').hidden,true);
 assert.equal(team.get('cancelQueueRefresh').disabled,true);
 assert.match(team.get('cancelQueueStatus').textContent,/清空|清除/);
 assert.equal(srv.writes,writes);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children[0].dataset.participantId,'SIM-001');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 cancelled-session queue rejects forged cross-experiment booking snapshot on GET',()=>{
 const srv=server();v08ConfirmedVisitor_(srv);
 const team=page(srv,'team');
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 team.click('calCancelCommit');
 const writes=srv.writes,read=srv.read;
 srv.read=()=>{const d=read();d.applications[0].slotId='SIM-SLOT-E2-A';return d;};
 const n=team.calls.length;team.click('cancelQueueRefresh');
 assert.deepEqual(team.calls.slice(n),['READ']);
 assert.equal(team.get('cancelQueueRows').children.length,0);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('cancelQueueRefresh').disabled,true);
 assert.equal(srv.writes,writes);
 srv.read=read;team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children[0].dataset.participantId,'SIM-001');
 closed(srv);
});

test('P1 B02 cancel independently GETs B03 board and B04 booking without cancelling a held attendee',()=>{
 const srv=server(),visitor=v07VerifiedVisitor_(srv);
 visitor.click('hold');
 srv.command('ADMIN_B02_ATTEND',{id:'SIM-001',attendance:'PRESENT',progress:'PARTIAL',note:'模擬當日出席'});
 const original=srv.read(),team=page(srv,'team'),before=srv.writes;
 team.set('b03Booking','BOOKED');team.change('b03Booking');
 team.click('b03BoardMode');
 const preview=cancelTestSession_(team);
 assert.equal(preview.hidden,false);
 assert.match(team.get('calCancelRows').children[0].textContent,/SIM-001.*已出席/);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 const callAt=team.calls.length;team.click('calCancelCommit');
 assert.deepEqual(team.calls.slice(callAt).filter(x=>x!=='B01_GET'),['ADMIN_B02_SLOT','READ']);
 assert.equal(srv.writes,before+1,'single original GAS CAS write');
 const fresh=srv.read(),beforeApp=original.applications.find(x=>x.id==='SIM-001');
 assert.equal(fresh.b02.sessions[beforeApp.slotId].status,'CANCELLED');
 assert.equal(fresh.applications.find(x=>x.id==='SIM-001').slotId,beforeApp.slotId);
 assert.equal(fresh.applications.find(x=>x.id==='SIM-001').phase,beforeApp.phase);
 assert.equal(fresh.b02.attendance['SIM-001'].attendance,'PRESENT');
 assert.equal(fresh.b02.attendance['SIM-001'].progress,'PARTIAL');
 assert.equal(fresh.b02.attendance['SIM-001'].note,'模擬當日出席');
 assert.equal(fresh.b04.history.length,original.b04.history.length,'B04 audit untouched by B02 session cancellation');
 assert.equal(fresh.notifications.length,0);
 assert.match(team.get('calStatusMessage').textContent,/取消已獨立回讀確認/);
 assert.match(team.get('b03ReconcileStatus').textContent,/原個別預約與出席保留 1 筆/);
 assert.equal(team.get('b03Booking').value,'BOOKED');
 assert.equal(team.get('b03Board').hidden,false,'B03 board mode retained');
 const card=team.get('b03Board').children.flatMap(g=>g.children)
  .filter(x=>x.className==='b03Columns').flatMap(g=>g.children)
  .flatMap(g=>g.children).find(x=>x.dataset.participantId==='SIM-001');
 assert.ok(card);assert.match(card.textContent,/場次已取消｜原預約保留，待人工處理/);
 assert.match(card.textContent,/已出席/);
 card.handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 const grid=team.get('profileTabBody').children.find(x=>x.className==='b04Fields');
 const labelValues=grid.children.map(x=>x.children.map(y=>y.textContent).join('：')).join(' ');
 assert.match(labelValues,/場次已取消/);
 assert.match(labelValues,/原個別預約與出席保留，待人工處理/);
 assert.match(labelValues,/預約流程.*暫留預約/);
 assert.match(team.get('profileTimeline').children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' '),
  /B02場次取消（原預約保留）/);
 assert.equal(srv.writes,before+1,'B03 board and B04 readback remain read-only');
 team.click('profileBack');team.click('b03ListMode');
 assert.match(team.get('entries').children[0].children.map(x=>x.textContent).join(' '),/場次 已取消（個別預約未取消，待人工處理）/);
 closed(srv);
});
test('P1 B02 cancellation without linked participants records one event and independent owner GET',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 cancelTestSession_(team);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 const n=team.calls.length;team.click('calCancelCommit');
 assert.deepEqual(team.calls.slice(n).filter(x=>x!=='B01_GET'),['ADMIN_B02_SLOT','READ']);
 assert.equal(srv.writes,before+1);
 assert.match(team.get('calStatusMessage').textContent,/原個別預約與出席保留 0 筆/);
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(srv.read().b02.history.at(-1).action,'CANCEL');
 closed(srv);
});
test('P1 B02 cancelled session second OWNER tab stale CAS fails closed and never retries',()=>{
 const srv=server(),a=page(srv,'team'),b=page(srv,'team');
 for(const t of [a,b]){cancelTestSession_(t);t.get('calCancelAck').checked=true;t.change('calCancelAck');}
 a.click('calCancelCommit');
 const rev=srv.read().revision,writes=srv.writes,n=b.calls.length;
 b.click('calCancelCommit');
 assert.deepEqual(b.calls.slice(n),['ADMIN_B02_SLOT'],'rejected stale CAS must not auto-read/retry');
 assert.equal(srv.writes,writes);assert.equal(srv.read().revision,rev);
 assert.equal(b.get('entries').children.length,0);
 assert.equal(b.get('calBoard').children.length,0);
 assert.equal(b.get('profileModule').hidden,true);
 assert.equal(b.get('calCancelCommit').disabled,true);
 assert.match(b.get('calStatusMessage').textContent,/取消結果尚未確認/);
 b.click('refresh');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1 B02 cancellation write followed by OWNER GET denial is uncertain and never replayed',()=>{
 const srv=server(),team=page(srv,'team'),read=srv.read;
 cancelTestSession_(team);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 const before=srv.writes,rev=read().revision;
 srv.read=()=>{throw Error('OWNER source revoked');};
 const n=team.calls.length;team.click('calCancelCommit');
 assert.deepEqual(team.calls.slice(n),['ADMIN_B02_SLOT','READ']);
 assert.equal(srv.writes,before+1);
 assert.equal(srv.ctx.study1UnifiedPreviewGet().revision,rev+1);
 assert.equal(team.get('entries').children.length,0);
 assert.equal(team.get('calBoard').children.length,0);
 assert.equal(team.get('calCancelCommit').disabled,true);
 assert.match(team.get('calStatusMessage').textContent,/OWNER回讀失敗或撤權/);
 assert.doesNotMatch(team.get('calStatusMessage').textContent,/獨立回讀確認/);
 srv.read=read;team.click('refresh');
 assert.equal(srv.writes,before+1);
 assert.equal(team.get('b03Reconcile').disabled,false);
 closed(srv);
});
test('P1 B02 cancellation rejects tampered post-write booking association before declaring success',()=>{
 const srv=server(),visitor=v07VerifiedVisitor_(srv);visitor.click('hold');
 const team=page(srv,'team'),real=srv.ctx.study1UnifiedPreviewCommand;
 cancelTestSession_(team);team.get('calCancelAck').checked=true;team.change('calCancelAck');
 const before=srv.writes,n=team.calls.length;
 srv.ctx.study1UnifiedPreviewCommand=command=>{
  const d=real(command);
  if(command.action==='ADMIN_B02_SLOT'&&command.payload.operation==='CANCEL')
   d.applications[0].slotId='SIM-SLOT-E2-A';
  return d;
 };
 team.click('calCancelCommit');
 assert.deepEqual(team.calls.slice(n),['ADMIN_B02_SLOT'],'reject forged response, no subsequent GET');
 assert.equal(srv.writes,before+1,'a single write may have succeeded, no retry');
 assert.equal(team.get('entries').children.length,0);
 assert.match(team.get('calStatusMessage').textContent,/取消結果無法證實/);
 srv.ctx.study1UnifiedPreviewCommand=real;team.click('refresh');
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-A');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(srv.writes,before+1);
 closed(srv);
});

test('B02-A explicit cancellation preflight lists linked synthetic holds and writes only after acknowledgement',()=>{
 const srv=server(),visitor=page(srv,'visitor');
 visitor.click('chooseE1');
 for(const id of ['adult','cycu','noDx','noTreatment','noPractice'])visitor.get(id).checked=true;
 visitor.click('screenNext');visitor.click('otpSend');
 visitor.click('otpPaste');visitor.click('otpVerify');visitor.click('hold');
 assert.equal(srv.read().applications[0].phase,'HELD');
 const team=page(srv,'team'),before=srv.writes,slot='SIM-SLOT-E1-A';
 const box=cancelTestSession_(team,slot);
 assert.equal(box.hidden,false);
 assert.match(team.get('calCancelSummary').textContent,/關聯 1 筆.*有效暫留 1/);
 assert.equal(team.get('calCancelRows').children.length,1);
 assert.match(team.get('calCancelRows').children[0].textContent,/SIM-001.*有效暫留/);
 assert.equal(team.get('calCancelCommit').disabled,true,'ack must be explicit');
 assert.equal(srv.writes,before,'preview must remain read only');
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 assert.equal(team.get('calCancelCommit').disabled,false);
 team.click('calCancelCommit');
 assert.equal(srv.writes,before+1,'one original GAS CAS commit');
 const after=srv.read(),app=after.applications[0];
 assert.equal(after.b02.sessions[slot].status,'CANCELLED');
 assert.equal(app.phase,'HELD','session cancellation must not silently cancel linked booking');
 assert.equal(app.slotId,slot,'booking source association is preserved');
 assert.equal(after.notifications.length,0,'no email/notification is manufactured');
 assert.equal(after.b02.history.at(-1).action,'CANCEL');
 assert.equal(team.get('calCancelReview').hidden,true);
 assert.equal(team.get('calCancelCommit').disabled,true);
 team.click('refresh');
 assert.equal(srv.read().b02.sessions[slot].status,'CANCELLED');
 assert.equal(srv.store.get('OPEN'),'false');
 assert.equal(srv.store.get('CONSENT_READY'),'false');
 closed(srv);
});
test('B02-A preview cancellation and abort are read-only; external revision invalidates impact',()=>{
 const srv=server(),team=page(srv,'team'),writes=srv.writes;
 assert.equal(cancelTestSession_(team).hidden,false);
 assert.match(team.get('calCancelRows').children[0].textContent,/尚無關聯虛構申請/);
 team.click('calCancelBack');
 assert.equal(team.get('calCancelReview').hidden,true);
 assert.equal(srv.writes,writes);
 assert.equal(cancelTestSession_(team).hidden,false);
 // A concurrent original-GAS TEST revision invalidates this old preview on reload.
 srv.command('START',{experiment:'E1'});
 const afterOtherWrite=srv.writes;
 assert.equal(afterOtherWrite,writes+1);
 team.click('refresh');
 assert.equal(team.get('calCancelReview').hidden,true);
 assert.equal(team.get('calCancelCommit').disabled,true);
 assert.match(team.get('calStatusMessage').textContent,/取消預覽已失效/);
 assert.equal(srv.writes,afterOtherWrite,'preview and refresh must not write');
 assert.equal((srv.read().b02.sessions['SIM-SLOT-E1-A']?.status||'OPEN'),'OPEN');
 closed(srv);
});
test('B02-A stale second owner tab cannot cancel after another owner revision and requires new preview',()=>{
 const srv=server(),a=page(srv,'team'),b=page(srv,'team');
 cancelTestSession_(a);
 a.get('calCancelAck').checked=true;a.change('calCancelAck');
 assert.equal(a.get('calCancelCommit').disabled,false);
 b.set('modeE1','COMING_SOON');b.click('saveModes');
 assert.equal(srv.read().recruitment.E1.mode,'COMING_SOON');
 const w=srv.writes;
 a.click('calCancelCommit');
 assert.equal(srv.writes,w,'GAS CAS must reject stale cancel');
 assert.equal((srv.read().b02.sessions['SIM-SLOT-E1-A']?.status||'OPEN'),'OPEN');
 assert.equal(a.get('calCancelCommit').disabled,true);
 assert.match(a.get('calStatusMessage').textContent,/取消結果尚未確認/);
 a.click('refresh');
 assert.equal(a.get('calCancelReview').hidden,true);
 assert.equal((srv.read().b02.sessions['SIM-SLOT-E1-A']?.status||'OPEN'),'OPEN');
 closed(srv);
});
test('B02-A changing management scope or losing OWNER source clears cancellation impact and blocks write',()=>{
 const srv=server(),team=page(srv,'team'),w=srv.writes;
 cancelTestSession_(team);
 team.set('adminScopeGlobal','E2');team.change('adminScopeGlobal');
 assert.equal(team.get('calCancelReview').hidden,true);
 assert.equal(team.get('calCancelCommit').disabled,true);
 assert.equal(srv.writes,w);
 team.set('adminScopeGlobal','ALL');team.change('adminScopeGlobal');
 cancelTestSession_(team);
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('OWNER authority revoked');};
 team.click('refresh');
 assert.equal(team.get('calCancelReview').hidden,true);
 assert.equal(team.get('calCancelCommit').disabled,true);
 assert.equal(srv.writes,w);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

/* P1-08 V08: independent owner-only TEST in-session modification preflight.
 * The Draft #90 token contract is deliberately not used or merged. */
function v08ConfirmedVisitor_(srv,options){
 const v=v07VerifiedVisitor_(srv,options);
 v.click('hold');
 assert.equal(srv.read().applications[0].phase,'HELD');
 v.click('confirm'); // §70-S: independent pre-signature booking review
 v.get('readPdf').checked=true;v.change('readPdf');
 v.click('review');
 v.get('agree').checked=true;v.change('agree');
 v.click('finish');
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 return v;
}
/* P1-08 real original-GAS TEST queue: confirmed seats, two FIFO candidates,
 * manual owner promotion, time expiry, no mail/REC/new ScriptProperties key. */
function waitlistFillConfirmed_(srv){
 const answers={adult:true,cycu:true,diagnosed:false,treatment:false,
  frequentPractice:false,joinedE1:false};
 for(let n=1;n<=2;n++){
  const id='SIM-'+String(n).padStart(3,'0');
  srv.command('START',{experiment:'E1'});
  srv.command('SCREEN',{id,answers});
  srv.command('OTP_REQUEST',{id});
  srv.command('OTP_VERIFY',{id,code:'00000000'});
  srv.command('HOLD',{id,slotId:'SIM-SLOT-E1-A'});
  const version=srv.read().policy.consent.E1.version;
  srv.command('CONSENT_REVIEW',{id,version,sha256:''});
  srv.command('CONSENT',{id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
  srv.command('CONFIRM',{id});
 }
 assert.equal(srv.read().slots.find(x=>x.id==='SIM-SLOT-E1-A').remaining,0);
}
function waitlistVerifiedVisitor_(srv,options){
 const v=page(srv,'visitor',options);
 v.click('chooseE1');v.click('screenNext');v.click('otpSend');
 v.click('otpPaste');v.click('otpVerify');
 const app=srv.read().applications.at(-1);
 assert.equal(app.phase,'VERIFIED');assert.equal(app.eligible,true);
 return {v,id:app.id};
}
/* P1-08 §70-B original GAS TEST hierarchical scope rules; no REC or email. */
function policyChange_(srv,experiment,level,mode,{stage=null,slotId=null}={}){
 return srv.command('ADMIN_WAITLIST_POLICY',{experiment,level,stage,slotId,mode});
}
/* P1-08 §70-C: real original GAS writes; five B02/B03/B04/B09/B12
 * views consume a single strictly checked current-state summary, not an event. */
function waitlistNodeText_(n){return [n.textContent,...n.children.map(waitlistNodeText_)].join(' ');}
test('P1-08 B02 B03 B04 B09 and B12 reconcile a genuine FIFO WAITING record without fictitious bookings',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const person=waitlistVerifiedVisitor_(srv);person.v.click('v08WaitJoin');
 const data=srv.read(),total=data.waitlist.summary.total;
 assert.equal(total.WAITING,1);assert.equal(total.OFFERED,0);
 assert.equal(total.ACCEPTED,0);assert.equal(total.total,1);
 assert.equal(data.waitlist.summary.byStage['E1:SINGLE_SESSION'].WAITING,1);
 assert.equal(data.waitlist.summary.byExperiment.E2.total,0);
 assert.equal(data.applications.find(a=>a.id===person.id).phase,'VERIFIED');
 const team=page(srv,'team'),reads=srv.writes;
 const b02=team.get('waitlistStatus').textContent;
 assert.match(b02,/等待1，邀請待處理0，已接受0，逾期0，退出0/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/等待順位 1/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/不計入原B09已成立預約/);
 const row=team.get('entries').children.find(x=>x.dataset.participantId===person.id);
 assert.ok(row);
 assert.match(waitlistNodeText_(row),/候補現況.*等待順位/);
 row.children.find(x=>x.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');
 booking.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTabBody')),/候補目前狀態.*等待順位/);
 const audit=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');
 audit.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTimeline')),/目前候補狀態（非稽核事件）/);
 const before=srv.read().b06.revision;
 const b12=srv.ctx.study1UnifiedB12AuditPage({
  after:'',expectedB06Revision:before,expectedFixtureRevision:srv.read().revision,
  limit:30,module:'WAITLIST',result:'CURRENT_SNAPSHOT',search:'',snapshotHash:'',sort:'DESC'});
 assert.equal(b12.total,1);assert.equal(b12.items.length,1);
 assert.equal(b12.items[0].action,'WAITING');
 assert.equal(b12.items[0].historical,false);
 assert.equal(b12.items[0].at,null);
 assert.equal(b12.items[0].result,'CURRENT_SNAPSHOT');
 assert.equal(b12.coverage.waitlistSummary.total.WAITING,1);
 assert.equal(b12.coverage.complete,false);
 assert.ok(b12.coverage.warnings.some(w=>w.code==='WAITLIST_CURRENT_ONLY'));
 team.set('b12ModuleFilter','WAITLIST');team.change('b12ModuleFilter');
 team.set('b12Result','CURRENT_SNAPSHOT');team.change('b12Result');
 team.set('b12Limit','10');team.set('b12Sort','DESC');
 team.click('b12SearchButton');
 assert.match(waitlistNodeText_(team.get('b12List')),/CURRENT_TEST_WAITLIST_ONLY/);
 assert.match(team.get('b12Coverage').textContent,/不是完整稽核歷程/);
 assert.equal(srv.writes,reads,'cross-module views and B12 are read-only');
 closed(srv);
});
test('P1-08 B09 scoped and date-filtered waitlist snapshot never changes booked/attendance metrics',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const p=waitlistVerifiedVisitor_(srv);p.v.click('v08WaitJoin');
 const team=page(srv,'team'),base=waitlistNodeText_(team.get('b09Metrics'));
 assert.match(base,/期間已成立預約/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/合計 1 個虛構候補代碼/);
 team.set('b09Scope','E2');team.click('b09Apply');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/合計 0 個虛構候補代碼/);
 team.set('b09Scope','E1');
 team.set('b09Start','2027-02-01');team.set('b09End','2027-02-28');team.click('b09Apply');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/合計 0 個虛構候補代碼/);
 team.set('b09Start','2027-01-05');team.set('b09End','2027-01-05');team.click('b09Apply');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/合計 1 個虛構候補代碼/);
 assert.match(team.get('b09Notes').textContent,/候補另依其原始場次日期統計/);
 closed(srv);
});
test('P1-08 source tampering of shared status counts, slot stage or audit snapshot must reject B02 B03 B04 B09 B12',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const p=waitlistVerifiedVisitor_(srv);p.v.click('v08WaitJoin');
 const team=page(srv,'team'),read=srv.read,writes=srv.writes;
 const corrupt=change=>{
  srv.read=()=>{const d=read();change(d);return d;};
  team.click('refresh');
  assert.equal(team.get('waitlistRows').children.length,0);
  assert.equal(team.get('waitlistAdvance').disabled,true);
  assert.equal(team.get('entries').children.length,0);
  assert.equal(team.get('profileModule').hidden,true);
  assert.equal(team.get('b09Metrics').children.length,0);
  assert.equal(team.get('b09WaitlistSummary').children.length,0);
 };
 corrupt(d=>{d.waitlist.summary.total.WAITING=0;});
 corrupt(d=>{d.waitlist.summary.bySlot[0].counts.ACCEPTED=1;});
 corrupt(d=>{d.waitlist.summary.byStage['E1:SINGLE_SESSION'].WAITING=7;});
 corrupt(d=>{d.waitlist.summary.bySlot[0].stage='POSTTEST';});
 srv.read=read;team.click('refresh');
 assert.equal(team.get('waitlistRows').children.length,1);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1-08 TEST source starts with E1 manual and E2 closed with no guessed stage or mail',()=>{
 const srv=server(),v=srv.read();
 assert.equal(v.waitlist.settings.experiments.E1,'MANUAL_TEST');
 assert.equal(v.waitlist.settings.experiments.E2,'CLOSED');
 assert.equal(v.waitlist.settings.stages['E1:SINGLE_SESSION'],'INHERIT');
 assert.equal(v.waitlist.slotPolicies.filter(p=>p.experiment==='E1').length,2);
 assert.ok(v.waitlist.slotPolicies.filter(p=>p.experiment==='E1')
  .every(p=>p.stage==='SINGLE_SESSION'&&p.mode==='MANUAL_TEST'&&p.mail==='DISABLED'&&p.approved===false));
 assert.ok(v.waitlist.slotPolicies.filter(p=>p.experiment==='E2')
  .every(p=>p.stage===null&&p.mode==='CLOSED'&&p.mail==='DISABLED'));
 assert.equal(v.recruitment.E2.mode,'COMING_SOON');
 assert.equal(srv.writes,0);closed(srv);
});
test('P1-08 original B02 policy controls save experiment, stage and activity, and V05 rejects closed queue without mail',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const candidate=waitlistVerifiedVisitor_(srv),team=page(srv,'team'),
  originalNotices=srv.read().notifications.length;
 assert.equal(team.get('waitPolicyLevel').value,'EXPERIMENT');
 assert.equal(team.get('waitPolicyExperiment').value,'E1');
 team.set('waitPolicyMode','CLOSED');
 const writes=srv.writes;team.click('waitPolicySave');
 assert.equal(srv.writes,writes+1);
 assert.equal(srv.read().waitlist.settings.experiments.E1,'CLOSED');
 assert.match(team.get('waitPolicyStatus').textContent,/獨立GET核實/);
 candidate.v.click('v08WaitRefresh');
 assert.equal(candidate.v.get('v08WaitJoin').disabled,true);
 assert.throws(()=>srv.command('WAITLIST_JOIN',{id:candidate.id,slotId:'SIM-SLOT-E1-A'}),/候補僅限|尚未|開放/);
 team.set('waitPolicyMode','MANUAL_TEST');team.click('waitPolicySave');
 assert.equal(srv.read().waitlist.settings.experiments.E1,'MANUAL_TEST');
 team.set('waitPolicyLevel','STAGE');team.change('waitPolicyLevel');
 assert.equal(team.get('waitPolicyStage').value,'SINGLE_SESSION');
 team.set('waitPolicyMode','CLOSED');team.click('waitPolicySave');
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E1-A').mode,'CLOSED');
 candidate.v.click('v08WaitRefresh');
 assert.equal(candidate.v.get('v08WaitJoin').disabled,true);
 team.set('waitPolicyMode','INHERIT');team.click('waitPolicySave');
 team.set('waitPolicyLevel','ACTIVITY');team.change('waitPolicyLevel');
 assert.equal(team.get('waitPolicyActivity').value,'SIM-SLOT-E1-A');
 team.set('waitPolicyMode','CLOSED');team.click('waitPolicySave');
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E1-A').mode,'CLOSED');
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E1-B').mode,'MANUAL_TEST');
 candidate.v.click('v08WaitRefresh');
 assert.equal(candidate.v.get('v08WaitJoin').disabled,true);
 team.set('waitPolicyMode','INHERIT');team.click('waitPolicySave');
 candidate.v.click('v08WaitRefresh');
 assert.equal(candidate.v.get('v08WaitJoin').disabled,false);
 assert.equal(srv.read().notifications.length,originalNotices);
 closed(srv);
});
test('P1-08 CLOSED parent always overrides child, unknown E2 stage stays CLOSED until explicit OWNER binding',()=>{
 const srv=server();
 policyChange_(srv,'E2','EXPERIMENT','MANUAL_TEST');
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E2-A').mode,'CLOSED');
 policyChange_(srv,'E2','ACTIVITY','MANUAL_TEST',{stage:'PRETEST',slotId:'SIM-SLOT-E2-A'});
 let policies=srv.read().waitlist.slotPolicies;
 assert.equal(policies.find(x=>x.slotId==='SIM-SLOT-E2-A').stage,'PRETEST');
 assert.equal(policies.find(x=>x.slotId==='SIM-SLOT-E2-A').mode,'MANUAL_TEST');
 assert.equal(policies.find(x=>x.slotId==='SIM-SLOT-E2-B').stage,null);
 assert.equal(policies.find(x=>x.slotId==='SIM-SLOT-E2-B').mode,'CLOSED');
 policyChange_(srv,'E2','STAGE','CLOSED',{stage:'PRETEST'});
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E2-A').mode,'CLOSED');
 policyChange_(srv,'E2','STAGE','INHERIT',{stage:'PRETEST'});
 policyChange_(srv,'E2','EXPERIMENT','CLOSED');
 assert.equal(srv.read().waitlist.slotPolicies.find(x=>x.slotId==='SIM-SLOT-E2-A').mode,'CLOSED');
 assert.equal(srv.read().recruitment.E2.mode,'COMING_SOON','configuration is not recruitment approval');
 assert.equal(srv.read().notifications.length,0);
 closed(srv);
});
test('P1-08 active FIFO entries block TEST policy closure or stage reassignment without partial write',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const v=waitlistVerifiedVisitor_(srv);
 v.v.click('v08WaitJoin');const before=srv.read(),writes=srv.writes;
 const reject=(exp,level,mode,opts,pattern)=>{
  assert.throws(()=>policyChange_(srv,exp,level,mode,opts),pattern);
  assert.equal(srv.writes,writes);assert.equal(srv.read().revision,before.revision);
  assert.equal(srv.read().waitlist.entries[0].status,'WAITING');
 };
 reject('E1','EXPERIMENT','CLOSED',{},/不可關閉/);
 reject('E1','STAGE','CLOSED',{stage:'SINGLE_SESSION'},/不可關閉/);
 reject('E1','ACTIVITY','CLOSED',{stage:'SINGLE_SESSION',slotId:'SIM-SLOT-E1-A'},/不可關閉/);
 assert.throws(()=>policyChange_(srv,'E1','ACTIVITY','MANUAL_TEST',
  {stage:'PRETEST',slotId:'SIM-SLOT-E1-A'}),/活動|階段/);
 assert.throws(()=>policyChange_(srv,'E1','EXPERIMENT','AUTO_NOTIFY'),/自動通知|不合法/);
 assert.throws(()=>policyChange_(srv,'E2','ACTIVITY','MANUAL_TEST',
  {stage:'PRETEST',slotId:'SIM-SLOT-E1-A'}),/活動|階段/);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1-08 forged policy stage/activity/effective-mode projections clear original B02/B03/B04 and block editing',()=>{
 const srv=server(),team=page(srv,'team'),read=srv.read,writes=srv.writes;
 assert.equal(team.get('waitPolicySave').disabled,false);
 const bad=modify=>{
  srv.read=()=>{const d=read();modify(d);return d;};
  team.click('refresh');
  assert.equal(team.get('waitPolicySave').disabled,true);
  assert.equal(team.get('waitlistRows').children.length,0);
  assert.equal(team.get('entries').children.length,0);
  assert.equal(team.get('profileModule').hidden,true);
  assert.match(team.get('waitPolicyStatus').textContent,/來源|矛盾|鎖定/);
 };
 bad(d=>{d.waitlist.settings.experiments.E1='AUTO_NOTIFY';});
 bad(d=>{d.waitlist.slotPolicies[0].mode='MANUAL_TEST';d.waitlist.settings.experiments.E1='CLOSED';});
 bad(d=>{d.waitlist.settings.activities['SIM-SLOT-E2-A']={stage:'SINGLE_SESSION',mode:'MANUAL_TEST'};});
 bad(d=>{d.waitlist.slotPolicies[2].stage='PRETEST';});
 srv.read=read;team.click('refresh');
 assert.equal(team.get('waitPolicySave').disabled,false);
 assert.equal(srv.writes,writes);
 closed(srv);
});
test('P1-08 full slot offers FIFO queue in real V05, with read-only candidate status and no automatic email',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv),prior=srv.read().notifications.length;
 assert.equal(first.v.get('v08WaitJoin').disabled,false);
 assert.equal(first.v.get('v08WaitSlot').value,'SIM-SLOT-E1-A');
 first.v.click('v08WaitJoin');
 assert.equal(srv.read().waitlist.entries[0].id,first.id);
 assert.equal(srv.read().waitlist.entries[0].status,'WAITING');
 assert.equal(first.v.get('hold').disabled,true,'active queue cannot bypass ranking');
 assert.match(first.v.get('v08WaitStatus').textContent,/等待第 1 位/);
 const second=waitlistVerifiedVisitor_(srv);
 second.v.click('v08WaitJoin');
 const rows=srv.read().waitlist.entries;
 assert.deepEqual(rows.map(x=>[x.id,x.rank,x.status]),[
  ['SIM-003',1,'WAITING'],['SIM-004',2,'WAITING']]);
 assert.equal(srv.read().notifications.length,prior,'joining does not send or simulate mail');
 assert.equal(srv.store.has('STUDY1_WAITLIST_TEST_V1'),false);
 closed(srv);
});
test('P1-08 owner manual expiry advances to next ranked offer, then V08 accepts only live offer into existing hold',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv,{Date:Clock});
 first.v.click('v08WaitJoin'); // first original-GAS CAS must complete before another tab reads the revision
 const second=waitlistVerifiedVisitor_(srv,{Date:Clock});
 second.v.click('v08WaitJoin');
 const notices=srv.read().notifications.length;
 srv.command('CANCEL',{id:'SIM-001'}); // one seat; never a queue promotion
 const team=page(srv,'team',{Date:Clock});
 assert.equal(team.get('waitlistSlot').value,'SIM-SLOT-E1-A');
 assert.equal(team.get('waitlistAdvance').disabled,false);
 const before=srv.writes;
 team.click('waitlistAdvance');
 assert.equal(srv.writes,before+1,'exactly one original locked command');
 assert.equal(team.calls.filter(x=>x==='WAITLIST_ADVANCE').length,1);
 assert.equal(srv.read().waitlist.entries[0].status,'OFFERED');
 assert.equal(srv.read().waitlist.entries[1].status,'WAITING');
 assert.equal(srv.read().slots.find(x=>x.id==='SIM-SLOT-E1-A').remaining,0,
  'offer reserves the free seat, prevents unqueued HOLD');
 assert.equal(srv.read().notifications.length,notices+1,'only existing synthetic cancellation notice');
 first.v.click('v08WaitRefresh');
 assert.equal(first.v.get('v08WaitAccept').disabled,false);
 const offered=srv.read().waitlist.entries[0];
 assert.equal(offered.expiresAt-offered.offeredAt,600000);
 clock.now=offered.expiresAt+1;
 first.v.click('v08WaitRefresh');
 assert.equal(first.v.get('v08WaitAccept').disabled,true,'expired offer cannot be accepted');
 assert.throws(()=>srv.command('WAITLIST_ACCEPT',{id:'SIM-003'}),/逾期|過期/);
 assert.equal(srv.read().waitlist.entries[0].status,'OFFERED',
  'read and attempted expired accept never automatically promote');
 team.click('refresh');
 assert.equal(team.get('waitlistAdvance').disabled,false);
 const preAdvance=srv.writes;
 team.click('waitlistAdvance');
 assert.equal(srv.writes,preAdvance+1,'one atomic expire and next offer');
 const queue=srv.read().waitlist.entries;
 assert.deepEqual(queue.map(x=>x.status),['EXPIRED','OFFERED']);
 assert.equal(queue[0].closedAt,clock.now);
 second.v.click('v08WaitRefresh');
 assert.equal(second.v.get('v08WaitAccept').disabled,false);
 const preAccept=srv.writes;
 second.v.click('v08WaitAccept');
 assert.equal(srv.writes,preAccept+1);
 const after=srv.read();
 assert.equal(after.waitlist.entries[1].status,'ACCEPTED');
 assert.equal(after.applications.find(a=>a.id===second.id).phase,'HELD');
 assert.equal(after.applications.find(a=>a.id===second.id).slotId,'SIM-SLOT-E1-A');
 assert.equal(after.applications.find(a=>a.id===second.id).signatureDemo,false);
 assert.equal(after.notifications.length,notices+1,'accept creates no mail or invented confirmation');
 assert.equal(after.slots.find(x=>x.id==='SIM-SLOT-E1-A').remaining,0);
 assert.equal(second.v.get('step-confirm').hidden,false,'§70-S: must review booking before synthetic consent');
 closed(srv);
});
test('P1-08 queue CAS, duplicate joining, cross-E1/E2 attempt, auto-promotion and manual withdrawal all guarded',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const third=waitlistVerifiedVisitor_(srv);
 const oldRevision=srv.read().revision;
 third.v.click('v08WaitJoin');
 const writes=srv.writes;
 assert.throws(()=>srv.command('WAITLIST_JOIN',{id:third.id,slotId:'SIM-SLOT-E1-A'}),/候補|已額滿/);
 assert.throws(()=>srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'}),/無逾期邀請|名額/);
 assert.throws(()=>srv.command('WAITLIST_JOIN',{id:third.id,slotId:'SIM-SLOT-E2-A'}),/候補/);
 assert.throws(()=>srv.command('WAITLIST_ACCEPT',{id:third.id}),/邀請/);
 assert.throws(()=>srv.command('WAITLIST_DECLINE',{id:third.id},oldRevision),/版本已變更/);
 assert.equal(srv.writes,writes);
 assert.equal(srv.read().waitlist.entries[0].status,'WAITING');
 third.v.click('v08WaitDecline');
 assert.equal(srv.read().waitlist.entries[0].status,'DECLINED');
 assert.equal(srv.read().waitlist.entries[0].closedAt>0,true);
 assert.equal(third.v.get('v08WaitAccept').disabled,true);
 assert.equal(srv.read().applications.find(a=>a.id===third.id).phase,'VERIFIED');
 closed(srv);
});
test('P1-08 malformed queue, cross-experiment references and forged rank fail closed on both V05 and B02 owner',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const third=waitlistVerifiedVisitor_(srv);
 third.v.click('v08WaitJoin');
 const read=srv.read,writes=srv.writes,team=page(srv,'team');
 const bad=mutate=>{
  srv.read=()=>{const out=read();mutate(out);return out;};
  team.click('refresh');
  assert.equal(team.get('waitlistRows').children.length,0);
  assert.equal(team.get('waitlistAdvance').disabled,true);
  assert.match(team.get('waitlistStatus').textContent,/清空|無法/);
 };
 bad(s=>{s.waitlist.entries[0].experiment='E2';});
 bad(s=>{s.waitlist.entries[0].rank=900;});
 bad(s=>{s.waitlist.entries[0].expiresAt=NaN;});
 srv.read=read;team.click('refresh');
 assert.equal(team.get('waitlistRows').children.length,1);
 assert.equal(srv.writes,writes,'rejected views and rescan never write');
 closed(srv);
});

test('P1-08 V08 reschedule is read-only until explicit acknowledgement then commits exactly one TEST MOVE',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 const original=srv.read().applications[0].slotId;
 const desired=v.get('moveSlot').value;
 assert.notEqual(desired,original);
 const before=srv.writes,noticeCount=srv.read().notifications.length;
 v.click('move');
 assert.equal(v.get('v08ManageReview').hidden,false);
 assert.match(v.get('v08Action').textContent,/改期/);
 assert.match(v.get('v08From').textContent,/SIM-SLOT-E1-A/);
 assert.match(v.get('v08To').textContent,new RegExp(desired));
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(srv.writes,before,'viewing a draft does not mutate bookings');
 v.get('v08Ack').checked=true;v.change('v08Ack');
 assert.equal(v.get('v08Commit').disabled,false);
 v.click('v08Commit');
 assert.equal(srv.writes,before+1,'one original GAS transaction');
 assert.equal(srv.read().applications[0].slotId,desired);
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 assert.equal(srv.read().notifications.length,noticeCount+1,'synthetic notice history only');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 closed(srv);
});
test('P1-08 V08 cancel requires separate source-bound confirmation and preserves booking history',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv),before=srv.writes;
 const slot=srv.read().applications[0].slotId,noticeCount=srv.read().notifications.length;
 v.click('cancel');
 assert.equal(v.get('v08ManageReview').hidden,false);
 assert.match(v.get('v08To').textContent,/保留申請與場次歷史/);
 assert.equal(v.get('v08Commit').disabled,true);
 v.click('v08Back');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(srv.writes,before,'abandoning cannot cause cancellation');
 v.click('cancel');
 v.get('v08Ack').checked=true;v.change('v08Ack');
 v.click('v08Commit');
 assert.equal(srv.read().applications[0].phase,'CANCELLED');
 assert.equal(srv.read().applications[0].slotId,slot);
 assert.equal(srv.writes,before+1);
 assert.equal(srv.read().notifications.length,noticeCount+1,'no real mail is sent');
 assert.equal(v.get('cancel').disabled,true);
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 closed(srv);
});
test('P1-08 V08 forged E2 target and changed target invalidate review without writes',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv),before=srv.writes;
 const valid=v.get('moveSlot').value;
 v.set('moveSlot','SIM-SLOT-E2-A');
 v.click('move');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.match(v.get('status').textContent,/無法核實/);
 assert.equal(srv.writes,before);
 v.set('moveSlot',valid);
 v.click('move');
 assert.equal(v.get('v08ManageReview').hidden,false);
 v.set('moveSlot','SIM-SLOT-E2-A');
 v.change('moveSlot');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(srv.writes,before);
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 closed(srv);
});
test('P1-08 V08 stale second-tab revision fails original GAS CAS and V07 never auto-replays MOVE',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv),team=page(srv,'team');
 const slot=srv.read().applications[0].slotId;
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 team.set('modeE1','COMING_SOON');team.click('saveModes');
 const before=srv.writes;
 v.click('v08Commit');
 assert.equal(srv.writes,before,'stale synthetic MOVE is rejected');
 assert.equal(srv.read().applications[0].slotId,slot);
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('move').disabled,true,'uncertain write locks controls');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.get('v07Rescan').disabled,false,'only explicit GET can unlock');
 v.click('v07Rescan');
 assert.equal(srv.writes,before,'recheck must not replay the write');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 closed(srv);
});
test('P1-08 V08 owner revocation after preview clears all change controls with no unsafe re-submit',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv),before=srv.writes;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 const oldWrite=srv.ctx.study1UnifiedPreviewCommand;
 const oldRead=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action==='CANCEL')throw Error('owner permission revoked');
  return oldWrite(c);
 };
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner read forbidden')};
 v.click('v08Commit');
 assert.equal(srv.writes,before);
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('cancel').disabled,true);
 assert.match(v.get('v07Result').textContent,/狀態未知/);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 srv.ctx.study1UnifiedPreviewCommand=oldWrite;
 srv.ctx.study1UnifiedPreviewGet=oldRead;
 closed(srv);
});

/* V08 short-lived in-page TEST draft: no PR #90 capability token, link or mail. */
test('V08 owner-only TEST MOVE draft at exact two-minute boundary becomes unusable without RPC or booking mutation',()=>{
 const srv=server(),clock={now:Date.now()};
 class PreviewClock extends Date{static now(){return clock.now;}}
 const v=v08ConfirmedVisitor_(srv,{Date:PreviewClock}),before=srv.writes;
 const current=srv.read().applications[0];
 v.click('move');
 assert.equal(v.get('v08ManageReview').hidden,false);
 assert.match(v.get('v08ManageStatus').textContent,/2分鐘/);
 v.get('v08Ack').checked=true;v.change('v08Ack');
 assert.equal(v.get('v08Commit').disabled,false);
 clock.now+=120000;
 v.click('v08Commit');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.match(v.get('status').textContent,/預覽過期|逾期/);
 assert.equal(srv.writes,before,'client rejects old review without any new GAS request');
 assert.equal(srv.read().applications[0].slotId,current.slotId);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,0);
 closed(srv);
});
test('V08 CANCEL draft expires before acknowledgement, and page discards it without sending commands',()=>{
 const srv=server(),clock={now:Date.now()};
 class PreviewClock extends Date{static now(){return clock.now;}}
 const v=v08ConfirmedVisitor_(srv,{Date:PreviewClock}),before=srv.writes;
 v.click('cancel');
 assert.equal(v.get('v08ManageReview').hidden,false);
 clock.now+=120001;
 v.get('v08Ack').checked=true;v.change('v08Ack');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(srv.writes,before);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,0);
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 closed(srv);
});
test('V08 local clock rollback invalidates reviewed TEST change; explicit fresh preview still works',()=>{
 const srv=server(),clock={now:Date.now()};
 class PreviewClock extends Date{static now(){return clock.now;}}
 const v=v08ConfirmedVisitor_(srv,{Date:PreviewClock}),before=srv.writes;
 v.click('cancel');
 v.get('v08Ack').checked=true;v.change('v08Ack');
 assert.equal(v.get('v08Commit').disabled,false);
 clock.now--;
 v.click('v08Commit');
 assert.equal(v.get('v08ManageReview').hidden,true);
 assert.equal(srv.writes,before);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,0);
 // A newly reviewed cancellation using an internally consistent clock can
 // still use the original GAS state machine; no permanent silent unlocking.
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 v.click('v08Commit');
 assert.equal(srv.read().applications[0].phase,'CANCELLED');
 assert.equal(srv.writes,before+1);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 assert.equal(v.get('v08Commit').disabled,true);
 closed(srv);
});

/* B02-A P1 edit preflight is separate from the previous cancellation review.
 * Only original owner-only TEST UI + real unified server are used. */
function b02EditReview_(team,slotId='SIM-SLOT-E1-A',date='2027-01-05'){
 team.set('calExperiment','ALL');team.set('calStatus','ALL');team.set('calSearch','');
 team.set('calView','day');team.set('calDate',date);team.change('calDate');
 const find=(root,condition)=>{
  if(condition(root))return root;
  for(const n of root.children||[]){const found=find(n,condition);if(found)return found;}
  return null;
 };
 const card=find(team.get('calBoard'),node=>node.dataset?.sessionId===slotId);
 assert.ok(card,'B02 calendar shows existing synthetic slot '+slotId);
 card.handlers.click();
 const edit=find(team.get('calSessionDetail'),node=>node.textContent==='編輯場次');
 assert.ok(edit,'B02 original panel opens real edit form');
 edit.handlers.click();
 return ()=>{
  const form=team.get('calForm');
  assert.equal(typeof form.handlers.submit,'function');
  form.handlers.submit({preventDefault(){}});
  return team.get('calEditReview');
 };
}
test('B02-A edit impact preview and back are zero-write; acknowledgement commits one original GAS update',()=>{
 const srv=server(),team=page(srv,'team'),before=srv.writes;
 const review=b02EditReview_(team);
 team.set('calEditCapacity','3');team.change('calEditCapacity');
 const box=review();
 assert.equal(box.hidden,false);
 assert.match(team.get('calEditSummary').textContent,/受影響 1 場/);
 assert.match(team.get('calEditRows').children[0].textContent,/容量 2 → 3/);
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(srv.writes,before);
 team.click('calEditBack');assert.equal(team.get('calEditReview').hidden,true);
 assert.equal(srv.writes,before,'back never writes');
 review();
 team.get('calEditAck').checked=true;team.change('calEditAck');
 assert.equal(team.get('calEditCommit').disabled,false);
 team.click('calEditCommit');
 assert.equal(srv.writes,before+1);
 assert.equal(srv.read().slots.find(x=>x.id==='SIM-SLOT-E1-A').capacity,3);
 assert.equal(srv.read().b02.history.at(-1).action,'UPDATE');
 assert.equal(team.get('calEditReview').hidden,true);
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(srv.read().notifications.length,0,'edit does not send real or simulated mail');
 closed(srv);
});
test('B02-A edit preview lists linked synthetic reservations and refuses silent movement',()=>{
 const srv=server(),visitor=page(srv,'visitor');
 visitor.click('chooseE1');
 for(const id of ['adult','cycu','noDx','noTreatment','noPractice'])visitor.get(id).checked=true;
 visitor.click('screenNext');visitor.click('otpSend');visitor.click('otpPaste');
 visitor.click('otpVerify');visitor.click('hold');
 const team=page(srv,'team'),before=srv.writes,review=b02EditReview_(team);
 team.set('calEditCapacity','3');team.change('calEditCapacity');
 assert.equal(review().hidden,false);
 assert.ok(team.get('calEditRows').children.some(x=>/SIM-001.*有效暫留/.test(x.textContent)));
 assert.equal(srv.writes,before);
 team.click('calEditBack');
 team.set('calEditWhen','2027-01-05T11:00');team.change('calEditWhen');
 assert.equal(review().hidden,true,'linked historical booking cannot be moved directly');
 assert.equal(srv.writes,before);
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-A');
 closed(srv);
});
test('B02-A series edit lists every affected slot, commits once and never alters booking identities',()=>{
 const srv=server();
 const create={operation:'CREATE',slotId:'',experiment:'E1',title:'另一虛構系列',
  when:'2028-02-07 10:00',capacity:2,minutes:90,place:'模擬實驗室',repeatCount:2,scope:'ONE'};
 const saved=srv.command('ADMIN_B02_SLOT',create),ids=saved.b02.history.at(-1).ids;
 const team=page(srv,'team'),before=srv.writes,review=b02EditReview_(team,ids[0],'2028-02-07');
 team.set('calScope','SERIES');team.change('calScope');
 team.set('calEditTitle','調整後系列名稱');team.change('calEditTitle');
 assert.equal(review().hidden,false);
 assert.match(team.get('calEditSummary').textContent,/受影響 2 場/);
 assert.equal(team.get('calEditRows').children.length,2);
 assert.equal(srv.writes,before);
 team.get('calEditAck').checked=true;team.change('calEditAck');
 team.click('calEditCommit');
 assert.equal(srv.writes,before+1);
 for(const id of ids)assert.equal(srv.read().b02.sessions[id].title,'調整後系列名稱');
 assert.equal(srv.read().b02.history.at(-1).ids.length,2);
 closed(srv);
});
test('B02-A edit invalidates draft on changed input, scope change, competing revision and revoked owner read',()=>{
 const srv=server(),team=page(srv,'team'),baseline=srv.writes,review=b02EditReview_(team);
 team.set('calEditCapacity','3');team.change('calEditCapacity');
 review();
 team.get('calEditAck').checked=true;team.change('calEditAck');
 assert.equal(team.get('calEditCommit').disabled,false);
 team.set('calEditCapacity','4');team.change('calEditCapacity');
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(team.get('calEditReview').hidden,true);
 assert.equal(srv.writes,baseline);
 review();
 team.set('adminScopeGlobal','E2');team.change('adminScopeGlobal');
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(team.get('calEditReview').hidden,true);
 team.set('adminScopeGlobal','ALL');team.change('adminScopeGlobal');
 b02EditReview_(team)();
 srv.command('START',{experiment:'E1'});const afterWrite=srv.writes;
 team.click('refresh');
 assert.equal(team.get('calEditReview').hidden,true);
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(srv.writes,afterWrite);
 b02EditReview_(team)();
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('owner revoked');};
 team.click('refresh');
 assert.equal(team.get('calEditReview').hidden,true);
 assert.equal(team.get('calEditCommit').disabled,true);
 assert.equal(srv.writes,afterWrite);
 srv.ctx.study1UnifiedPreviewGet=original;
 closed(srv);
});

test('B02-A stale second owner tab never overwrites edited TEST session and does not retry CAS',()=>{
 const srv=server(),a=page(srv,'team'),b=page(srv,'team');
 const review=b02EditReview_(a);
 a.set('calEditCapacity','4');a.change('calEditCapacity');
 assert.equal(review().hidden,false);
 a.get('calEditAck').checked=true;a.change('calEditAck');
 assert.equal(a.get('calEditCommit').disabled,false);
 b.set('modeE1','COMING_SOON');b.click('saveModes');
 const revision=srv.read().revision,writes=srv.writes;
 a.click('calEditCommit');
 assert.equal(srv.writes,writes,'stale edit cannot commit or auto-replay');
 assert.equal(srv.read().revision,revision);
 assert.equal(srv.read().slots.find(x=>x.id==='SIM-SLOT-E1-A').capacity,2);
 assert.match(a.get('calStatusMessage').textContent,/編輯結果尚未確認/);
 assert.equal(a.get('calEditCommit').disabled,true);
 a.click('refresh');
 assert.equal(a.get('calEditReview').hidden,true);
 assert.equal(srv.writes,writes);
 closed(srv);
});


/* §70-D unresolved FIFO is original B02/legacy editor capacity and calendar
 * arbitration under the SAME existing ScriptLock/CAS fixture. Pure TEST only. */
function waitlistB02Payload_(srv,operation,extra={}){
 const view=srv.read(),slot=view.slots.find(x=>x.id==='SIM-SLOT-E1-A');
 const meta=view.b02.sessions[slot.id]||{};
 return {operation,slotId:slot.id,experiment:slot.experiment,
  title:meta.title||'虛構候補場次',when:slot.when,capacity:slot.capacity,
  minutes:meta.minutes||120,place:meta.place||'',repeatCount:1,scope:'ONE',...extra};
}
test('P1-08 §70-D B02 cancel, legacy reschedule/removal, capacity and FIFO priority share one verified TEST source',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv);first.v.click('v08WaitJoin');
 const second=waitlistVerifiedVisitor_(srv);second.v.click('v08WaitJoin');
 const before=srv.read(),noticeCount=before.notifications.length;
 const team=page(srv,'team'),writes=srv.writes;
 const review=cancelTestSession_(team);
 assert.equal(review.hidden,false);
 assert.match(team.get('calCancelSummary').textContent,/候補未結 2 筆/);
 assert.match(waitlistNodeText_(team.get('calCancelRows')),/FIFO 1.*WAITING/);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 assert.equal(team.get('calCancelCommit').disabled,true,'pending WAITING denies cancel despite acknowledgement');
 assert.match(team.get('calCancelStatus').textContent,/禁止取消/);
 assert.throws(()=>srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL')),/WAITING|OFFERED/);
 assert.equal(srv.writes,writes,'server refusal and B02 review do not write');
 const moved=srv.read().slots.map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}));
 moved[0].when='2027-02-05 10:00';
 assert.throws(()=>srv.command('ADMIN_SLOTS',{slots:moved}),/候補現況/);
 assert.throws(()=>srv.command('ADMIN_SLOTS',{slots:srv.read().slots.filter(x=>x.id!=='SIM-SLOT-E1-A').map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}))}),/候補現況/);
 const widened=srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'UPDATE',{capacity:3}));
 assert.equal(widened.slots.find(x=>x.id==='SIM-SLOT-E1-A').capacity,3);
 assert.deepEqual(srv.read().waitlist.entries.map(e=>e.status),['WAITING','WAITING']);
 const newcomer=waitlistVerifiedVisitor_(srv),beforeHold=srv.writes;
 assert.throws(()=>srv.command('HOLD',{id:newcomer.id,slotId:'SIM-SLOT-E1-A'}),/已額滿|時段/);
 assert.equal(srv.writes,beforeHold,'capacity increase cannot let new HOLD skip queued FIFO');
 const revBeforeOffer=srv.read().revision;
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 const offered=srv.read();
 assert.equal(offered.waitlist.entries[0].status,'OFFERED');
 assert.equal(offered.waitlist.entries[1].status,'WAITING');
 assert.equal(offered.waitlist.summary.bySlot.find(x=>x.slotId==='SIM-SLOT-E1-A').counts.OFFERED,1);
 const reserved=srv.writes;
 assert.throws(()=>srv.command('ADMIN_B02_SLOT',
  waitlistB02Payload_(srv,'UPDATE',{capacity:2})),/有效候補邀請|容量/);
 const shrink=offered.slots.map(({id,experiment,when,capacity})=>({id,experiment,when,capacity}));shrink[0].capacity=2;
 assert.throws(()=>srv.command('ADMIN_SLOTS',{slots:shrink}),/邀請保留|容量/);
 assert.throws(()=>srv.command('ADMIN_B02_SLOT',
  waitlistB02Payload_(srv,'UPDATE',{capacity:4}),revBeforeOffer),/版本已變更/);
 assert.equal(srv.writes,reserved,'all rejected capacity/CAS races have zero writes');
 assert.deepEqual(srv.read().waitlist.entries.map(e=>e.status),['OFFERED','WAITING']);
 const fresh=page(srv,'team');
 assert.match(fresh.get('waitlistStatus').textContent,/等待1，邀請待處理1/);
 assert.match(waitlistNodeText_(fresh.get('b09WaitlistSummary')),/候補/);
 assert.equal(srv.read().notifications.length,noticeCount,'no email or artificial offer notification');
 closed(srv);
});
test('P1-08 §70-D expired OFFERED remains pending for B02 cancellation until explicit OWNER advance; B12 retains only snapshot',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv,{Date:Clock});first.v.click('v08WaitJoin');
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'UPDATE',{capacity:3}));
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 const offer=srv.read().waitlist.entries[0];
 assert.equal(offer.status,'OFFERED');
 clock.now=offer.expiresAt+1;
 const stale=srv.read(),before=srv.writes;
 assert.equal(stale.waitlist.entries[0].status,'OFFERED','GET never silently expires');
 assert.equal(stale.waitlist.entries[0].expiredOffer,true);
 assert.throws(()=>srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL')),/WAITING|OFFERED/);
 assert.equal(srv.writes,before);
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 assert.equal(srv.read().waitlist.entries[0].status,'EXPIRED');
 const notifications=srv.read().notifications.length;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const data=srv.read();
 assert.equal(data.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(data.waitlist.entries[0].status,'EXPIRED');
 assert.equal(data.waitlist.summary.byExperiment.E1.EXPIRED,1);
 assert.equal(data.notifications.length,notifications,'B02 cancellation and expiry produce no new notice');
 const audit=srv.ctx.study1UnifiedB12AuditPage({
  after:'',expectedB06Revision:data.b06.revision,expectedFixtureRevision:data.revision,
  limit:30,module:'WAITLIST',result:'CURRENT_SNAPSHOT',search:'',snapshotHash:'',sort:'DESC'});
 assert.equal(audit.items.length,1);
 assert.equal(audit.items[0].action,'EXPIRED');
 assert.equal(audit.items[0].historical,false);
 assert.equal(audit.coverage.waitlistSummary.total.EXPIRED,1);
 const team=page(srv,'team');
 assert.match(team.get('waitlistStatus').textContent,/逾期1/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/候補/);
 closed(srv);
});
test('P1-08 §70-D stale B02 cancel tab loses CAS to FIFO JOIN, clears old cross-module view and never replays',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const stale=page(srv,'team');
 cancelTestSession_(stale);
 stale.get('calCancelAck').checked=true;stale.change('calCancelAck');
 assert.equal(stale.get('calCancelCommit').disabled,false);
 const first=waitlistVerifiedVisitor_(srv);first.v.click('v08WaitJoin');
 const now=srv.read(),writes=srv.writes,n=stale.calls.length;
 stale.click('calCancelCommit');
 assert.equal(srv.writes,writes,'stale second-tab cancellation cannot overwrite FIFO JOIN');
 assert.equal(srv.read().revision,now.revision);
 assert.equal(srv.read().waitlist.entries[0].status,'WAITING');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A']?.status||'OPEN','OPEN');
 assert.equal(stale.calls.slice(n).filter(x=>x==='ADMIN_B02_SLOT').length,1);
 assert.equal(stale.get('calCancelCommit').disabled,true);
 assert.match(stale.get('calStatusMessage').textContent,/取消結果尚未確認/);
 stale.click('refresh');
 assert.equal(cancelTestSession_(stale).hidden,false);
 stale.get('calCancelAck').checked=true;stale.change('calCancelAck');
 assert.equal(stale.get('calCancelCommit').disabled,true,'fresh FIFO-aware review blocks cancellation');
 closed(srv);
});


/* §70-E original TEST owner pre-cancel, no real mail, no live-data adapter.
 * Source: original GAS/Team/Visitor DOM VM with shared CAS and FIFO. */
const resolveNode_=(team,id)=>{
 const queue=team.get('waitlistRows');
 const row=queue.children.find(x=>x.children.some(n=>n.textContent.includes(id)));
 return row?.children.find(n=>n.dataset.waitlistResolveId===id)||null;
};
const resolvePayload_=(id,status,slotId='SIM-SLOT-E1-A')=>({
 ack:'OWNER_TEST_PRE_CANCEL_REVIEWED',expectedStatus:status,id,
 reason:'TEST_SESSION_CANCELLATION',slotId
});
test('P1-08 §70-E OWNER resolves WAITING one by one in original FIFO, then B02 cancels; B09/B12 retain distinct current status',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv);first.v.click('v08WaitJoin');
 const second=waitlistVerifiedVisitor_(srv);second.v.click('v08WaitJoin');
 const before=srv.read(),notices=before.notifications.length,team=page(srv,'team');
 assert.ok(resolveNode_(team,first.id));
 assert.equal(resolveNode_(team,second.id),null,'later FIFO cannot be closed first');
 assert.throws(()=>srv.command('ADMIN_WAITLIST_RESOLVE',
  resolvePayload_(second.id,'WAITING')),/FIFO/);
 const a=srv.writes;
 resolveNode_(team,first.id).handlers.click();
 assert.equal(srv.writes,a+1,'one exact locked write and independent GET read');
 assert.equal(team.calls.filter(x=>x==='ADMIN_WAITLIST_RESOLVE').length,1);
 assert.deepEqual(team.calls.filter(x=>x==='ADMIN_WAITLIST_RESOLVE'||x==='READ').slice(-2),
  ['ADMIN_WAITLIST_RESOLVE','READ'],'independent OWNER GET follows one write');
 assert.equal(srv.read().waitlist.entries[0].status,'OWNER_CLOSED');
 assert.equal(srv.read().waitlist.entries[1].status,'WAITING');
 assert.equal(srv.read().waitlist.entries[0].rank,0);
 assert.equal(srv.read().waitlist.summary.total.OWNER_CLOSED,1);
 assert.equal(srv.read().waitlist.summary.byStage['E1:SINGLE_SESSION'].OWNER_CLOSED,1);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/OWNER人工結束 1/);
 first.v.click('v08WaitRefresh');
 assert.match(first.v.get('v08WaitStatus').textContent,/OWNER人工結束/);
 assert.ok(resolveNode_(team,second.id));
 const b=srv.writes;resolveNode_(team,second.id).handlers.click();
 assert.equal(srv.writes,b+1);assert.equal(srv.read().waitlist.summary.total.OWNER_CLOSED,2);
 assert.equal(srv.read().waitlist.summary.total.WAITING,0);
 assert.equal(srv.read().notifications.length,notices,'no mail or simulated notification');
 const review=cancelTestSession_(team);
 assert.equal(review.hidden,false);
 assert.match(team.get('calCancelSummary').textContent,/候補未結 0 筆/);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 assert.equal(team.get('calCancelCommit').disabled,false);
 team.click('calCancelCommit');
 assert.equal(srv.read().b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(srv.read().waitlist.summary.total.OWNER_CLOSED,2);
 const data=srv.read();
 const audit=srv.ctx.study1UnifiedB12AuditPage({
  after:'',expectedB06Revision:data.b06.revision,expectedFixtureRevision:data.revision,
  limit:30,module:'WAITLIST',result:'CURRENT_SNAPSHOT',search:'',snapshotHash:'',sort:'DESC'});
 assert.equal(audit.items.length,2);
 assert.ok(audit.items.every(e=>e.action==='OWNER_CLOSED'&&e.historical===false&&
  e.at===null&&e.provenance==='CURRENT_TEST_WAITLIST_ONLY'));
 assert.equal(audit.coverage.waitlistSummary.total.OWNER_CLOSED,2);
 closed(srv);
});
test('P1-08 §70-E live OFFERED never revoked; expired OFFERED manually closes without auto-promotion before FIFO waiting',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv,{Date:Clock});first.v.click('v08WaitJoin');
 const second=waitlistVerifiedVisitor_(srv,{Date:Clock});second.v.click('v08WaitJoin');
 srv.command('CANCEL',{id:'SIM-001'});
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 const offered=srv.read().waitlist.entries[0],n=srv.read().notifications.length;
 const one=page(srv,'team',{Date:Clock});
 assert.equal(resolveNode_(one,first.id),null,'live OFFERED has no closure control');
 const before=srv.writes;
 assert.throws(()=>srv.command('ADMIN_WAITLIST_RESOLVE',
  resolvePayload_(first.id,'OFFERED')),/有效期限/);
 assert.throws(()=>srv.command('ADMIN_WAITLIST_RESOLVE',
  resolvePayload_(second.id,'WAITING')),/邀請/);
 assert.equal(srv.writes,before);
 clock.now=offered.expiresAt+1;one.click('refresh');
 assert.ok(resolveNode_(one,first.id),'expired OFFERED can close exactly once');
 resolveNode_(one,first.id).handlers.click();
 const after=srv.read();
 assert.equal(after.waitlist.entries[0].status,'EXPIRED');
 assert.equal(after.waitlist.entries[1].status,'WAITING','no automatic next offer');
 assert.equal(after.waitlist.summary.total.OFFERED,0);
 assert.equal(after.waitlist.summary.total.EXPIRED,1);
 assert.equal(after.waitlist.summary.total.WAITING,1);
 assert.equal(after.notifications.length,n);
 assert.throws(()=>srv.command('ADMIN_B02_SLOT',
  waitlistB02Payload_(srv,'CANCEL')),/WAITING|OFFERED/);
 assert.ok(resolveNode_(one,second.id));
 resolveNode_(one,second.id).handlers.click();
 assert.deepEqual(srv.read().waitlist.entries.map(e=>e.status),['EXPIRED','OWNER_CLOSED']);
 const audit=srv.ctx.study1UnifiedB12AuditPage({
  after:'',expectedB06Revision:srv.read().b06.revision,expectedFixtureRevision:srv.read().revision,
  limit:30,module:'WAITLIST',result:'CURRENT_SNAPSHOT',search:'',snapshotHash:'',sort:'DESC'});
 assert.deepEqual(audit.items.map(e=>e.action).sort(),['EXPIRED','OWNER_CLOSED']);
 assert.ok(audit.items.every(e=>e.historical===false&&e.at===null));
 closed(srv);
});
test('P1-08 §70-E stale B02 close CAS, forged status and owner readback refusal fail closed without replay',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const first=waitlistVerifiedVisitor_(srv);first.v.click('v08WaitJoin');
 const stale=page(srv,'team'),second=waitlistVerifiedVisitor_(srv);
 second.v.click('v08WaitJoin');
 const version=srv.read().revision,writes=srv.writes,n=stale.calls.length;
 assert.ok(resolveNode_(stale,first.id));
 resolveNode_(stale,first.id).handlers.click();
 assert.equal(srv.writes,writes);
 assert.equal(srv.read().revision,version);
 assert.deepEqual(stale.calls.slice(n).filter(c=>c==='ADMIN_WAITLIST_RESOLVE'),
  ['ADMIN_WAITLIST_RESOLVE'],'stale request is never replayed');
 assert.equal(stale.get('waitlistRows').children.length,0);
 const fresh=page(srv,'team');
 const origin=srv.read;
 srv.read=()=>{const v=origin();v.waitlist.entries[0].status='OWNER_CLOSED';
  v.waitlist.entries[0].closedAt=null;v.waitlist.summary.total.OWNER_CLOSED=1;return v;};
 fresh.click('refresh');
 assert.equal(fresh.get('waitlistRows').children.length,0);
 srv.read=origin;fresh.click('refresh');
 const original=srv.ctx.study1UnifiedPreviewGet;
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('OWNER GET revoked');};
 const curWrites=srv.writes,requestCount=fresh.calls.length;
 resolveNode_(fresh,first.id).handlers.click();
 assert.equal(srv.writes,curWrites+1,'single write may have succeeded');
 assert.deepEqual(fresh.calls.slice(requestCount).filter(c=>c==='ADMIN_WAITLIST_RESOLVE'),
  ['ADMIN_WAITLIST_RESOLVE']);
 assert.equal(fresh.get('waitlistRows').children.length,0);
 assert.equal(fresh.get('profileModule').hidden,true);
 srv.ctx.study1UnifiedPreviewGet=original;
 assert.equal(srv.read().waitlist.entries[0].status,'OWNER_CLOSED');
 closed(srv);
});


/* §70-F: same original TEST GAS/Team/Visitor VM. Postcancel is a derived
 * CURRENT-only projection; never mutate booking or invent full audit events. */
const p108AcceptedConfirmed_=(srv)=>{
 waitlistFillConfirmed_(srv);
 const a=waitlistVerifiedVisitor_(srv);a.v.click('v08WaitJoin');
 srv.command('CANCEL',{id:'SIM-001'}); // synthetic booking cancellation only
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 assert.equal(srv.read().waitlist.entries[0].status,'OFFERED');
 a.v.click('v08WaitRefresh');a.v.click('v08WaitAccept');
 assert.equal(srv.read().applications.find(x=>x.id===a.id).phase,'HELD');
 const version=srv.read().policy.consent.E1.version;
 srv.command('CONSENT_REVIEW',{id:a.id,version,sha256:''});
 srv.command('CONSENT',{id:a.id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
 srv.command('CONFIRM',{id:a.id});
 assert.equal(srv.read().applications.find(x=>x.id===a.id).phase,'CONFIRMED');
 return a;
};
const p108B12_=(srv,module='ALL')=>srv.ctx.study1UnifiedB12AuditPage({
 after:'',expectedB06Revision:srv.read().b06.revision,
 expectedFixtureRevision:srv.read().revision,limit:30,
 module,result:'ALL',search:'',snapshotHash:'',sort:'DESC'
});
test('P1-08 §70-F accepted TEST invitation becomes CONFIRMED, B02 cancels but preserves original booking, attendance and B03/B04/B09/B12 boundaries',()=>{
 const srv=server(),a=p108AcceptedConfirmed_(srv);
 const before=srv.read(),original=before.waitlist.entries[0];
 const noticeCount=before.notifications.length;
 const team=page(srv,'team'),review=cancelTestSession_(team);
 assert.equal(review.hidden,false);
 assert.equal(team.get('calCancelCommit').disabled,true);
 team.get('calCancelAck').checked=true;team.change('calCancelAck');
 assert.equal(team.get('calCancelCommit').disabled,false);
 team.click('calCancelCommit');
 const view=srv.read(),slot=view.postCancel.bySlot.find(x=>x.slotId==='SIM-SLOT-E1-A');
 assert.equal(view.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(slot.acceptedOrigins.length,1);
 assert.deepEqual(slot.acceptedOrigins[0],{
  id:a.id,seq:1,originalSlotId:'SIM-SLOT-E1-A',
  currentSlotId:'SIM-SLOT-E1-A',phase:'CONFIRMED'});
 assert.equal(slot.linked,3,'includes confirmed and cancelled individual applications as historical association');
 assert.equal(slot.linkedConfirmed,2);
 assert.equal(slot.linkedCancelled,1);
 assert.equal(slot.pendingQueue,0);
 assert.equal(slot.retainedCancelEvents,1);
 assert.equal(view.waitlist.entries[0].status,'ACCEPTED');
 assert.equal(view.waitlist.entries[0].slotId,original.slotId);
 assert.equal(view.waitlist.entries[0].seq,original.seq);
 assert.equal(view.waitlist.entries[0].offeredAt,original.offeredAt);
 assert.equal(view.waitlist.entries[0].closedAt,original.closedAt);
 assert.equal(view.applications.find(x=>x.id===a.id).phase,'CONFIRMED',
  'administrative slot cancellation does not silently cancel participant');
 assert.equal(view.notifications.length,noticeCount,'no phantom cancellation mail');
 assert.equal(view.slots.find(x=>x.id==='SIM-SLOT-E1-A').remaining,0);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原B02已取消 SIM-SLOT-E1-A.*原候補接受 1/);
 assert.match(team.get('b09Metrics').children.map(waitlistNodeText_).join(' '),/期間已成立預約/);
 assert.match(waitlistNodeText_(team.get('cancelQueueMatrix')),/原候補接受 1/);
 assert.equal(team.get('cancelQueueStatus').textContent.includes('待人工核對'),true);
 const profile=team.get('entries').children.find(x=>x.dataset.participantId===a.id);
 assert.ok(profile);
 profile.children.find(x=>x.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTabBody')),/接受候補原始場次.*SIM-SLOT-E1-A/);
 assert.match(waitlistNodeText_(team.get('profileTabBody')),/場次取消後關聯/);
 const audit=p108B12_(srv);
 assert.deepEqual(JSON.parse(JSON.stringify(audit.coverage.postCancelSummary)),view.postCancel,
  'VM B12 audit and GAS serialized owner view share the same source values');
 assert.equal(audit.coverage.complete,false);
 assert.ok(audit.items.some(e=>e.module==='B02'&&e.action==='CANCEL'&&
  e.provenance==='BOUNDED_EVENT_ONLY'&&e.historical===true));
 const queue=p108B12_(srv,'WAITLIST');
 assert.equal(queue.items.length,1);
 assert.equal(queue.items[0].action,'ACCEPTED');
 assert.equal(queue.items[0].after.slotId,'SIM-SLOT-E1-A');
 assert.equal(queue.items[0].historical,false);
 closed(srv);
});
test('P1-08 §70-F confirmed booking MOVE keeps original accepted FIFO source; cancelling original does not cancel current booking or corrupt B09 denominator',()=>{
 const srv=server(),a=p108AcceptedConfirmed_(srv);
 const original=srv.read().waitlist.entries[0],notices=srv.read().notifications.length;
 srv.command('MOVE',{id:a.id,slotId:'SIM-SLOT-E1-B'});
 const moved=srv.read();
 assert.equal(moved.applications.find(x=>x.id===a.id).slotId,'SIM-SLOT-E1-B');
 assert.equal(moved.waitlist.entries[0].slotId,'SIM-SLOT-E1-A');
 assert.equal(moved.waitlist.entries[0].status,'ACCEPTED');
 assert.equal(moved.notifications.length,notices+1,'only old synthetic MOVE notice');
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const view=srv.read(),old=view.postCancel.bySlot.find(x=>x.slotId==='SIM-SLOT-E1-A');
 assert.equal(old.acceptedOrigins.length,1);
 assert.equal(old.acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(old.acceptedOrigins[0].originalSlotId,'SIM-SLOT-E1-A');
 assert.equal(old.linked,2);
 assert.equal(old.linkedConfirmed,1);
 assert.equal(view.waitlist.summary.total.ACCEPTED,1);
 assert.equal(view.waitlist.entries[0].closedAt,original.closedAt);
 assert.equal(view.applications.find(x=>x.id===a.id).phase,'CONFIRMED');
 assert.equal(view.slots.find(x=>x.id==='SIM-SLOT-E1-B').bookable,true);
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/已改期 1/);
 assert.match(waitlistNodeText_(team.get('cancelQueueMatrix')),/接受後移往他場次 1/);
 const entry=team.get('entries').children.find(x=>x.dataset.participantId===a.id);
 assert.ok(entry);entry.children.find(x=>x.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTabBody')),/接受候補原始場次.*SIM-SLOT-E1-A/);
 const audit=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');audit.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTimeline')),/原接受邀請場次已取消/);
 const b12=p108B12_(srv,'WAITLIST');
 assert.equal(b12.items[0].after.slotId,'SIM-SLOT-E1-A');
 assert.equal(b12.coverage.postCancelSummary.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 closed(srv);
});
test('P1-08 §70-F forged postcancel current snapshot and B12 bounded coverage fail closed; no booking or queue mutation',()=>{
 const srv=server(),a=p108AcceptedConfirmed_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const baseline=srv.read(),writes=srv.writes,read=srv.read;
 const team=page(srv,'team');
 const bad=mutate=>{
  srv.read=()=>{const d=read();mutate(d);return d;};
  team.click('refresh');
  assert.equal(team.get('entries').children.length,0);
  assert.equal(team.get('cancelQueueRows').children.length,0);
  assert.equal(team.get('waitlistRows').children.length,0);
  assert.equal(team.get('b12List').children.length,0);
  srv.read=read;team.click('refresh');
 };
 bad(d=>{d.postCancel.bySlot[0].linkedConfirmed++;});
 bad(d=>{d.postCancel.bySlot[0].acceptedOrigins[0].currentSlotId='SIM-SLOT-E2-A';});
 bad(d=>{d.waitlist.entries[0].slotId='SIM-SLOT-E2-A';});
 assert.equal(srv.writes,writes);
 assert.deepEqual(srv.read().postCancel,baseline.postCancel);
 assert.deepEqual(srv.read().waitlist.entries,baseline.waitlist.entries);
 const audit=p108B12_(srv,'WAITLIST');
 assert.equal(audit.coverage.postCancelSummary.mode,'CURRENT_CANCELLED_TEST_ONLY');
 assert.equal(audit.coverage.postCancelSummary.completeHistory,false);
 assert.equal(audit.coverage.postCancelSummary.mailSent,false);
 assert.equal(audit.items[0].provenance,'CURRENT_TEST_WAITLIST_ONLY');
 closed(srv);
});


/* §70-G: original GAS/Team/Visitor only. No real participant, email, REC,
 * persistent review decision or fabricated historical event. */
const postCancelPersonAnswers_={adult:true,cycu:true,diagnosed:false,
 treatment:false,frequentPractice:false,joinedE1:false};
function postCancelPerson_(srv,phase){
 srv.command('START',{experiment:'E1'});
 const id=srv.read().applications.at(-1).id;
 srv.command('SCREEN',{id,answers:postCancelPersonAnswers_});
 srv.command('OTP_REQUEST',{id});
 srv.command('OTP_VERIFY',{id,code:'00000000'});
 srv.command('HOLD',{id,slotId:'SIM-SLOT-E1-A'});
 if(['CONSENTED','CONFIRMED'].includes(phase)){
  const version=srv.read().policy.consent.E1.version;
  srv.command('CONSENT_REVIEW',{id,version,sha256:''});
  srv.command('CONSENT',{id,accepted:true,version,signature:'SIMULATED_SIGN_ONLY'});
 }
 if(phase==='CONFIRMED')srv.command('CONFIRM',{id});
 if(phase==='CANCELLED')srv.command('CANCEL',{id});
 assert.equal(srv.read().applications.find(a=>a.id===id).phase,phase);
 return id;
}
test('P1-08 §70-G B02 cancelled slot retains per-person CONFIRMED HELD CONSENTED CANCELLED, B04 attendance and B09/B12 bounded current provenance',()=>{
 const srv=server(),slot='SIM-SLOT-E1-A';
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'UPDATE',{capacity:5}));
 const ids=['CONFIRMED','HELD','CONSENTED','CANCELLED']
  .map(phase=>postCancelPerson_(srv,phase));
 srv.command('ADMIN_B02_ATTEND',{id:ids[0],attendance:'PRESENT',
  progress:'COMPLETE',note:'TEST_ONLY'});
 const before=srv.read(),n=before.notifications.length,history=before.b04.history.length;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const d=srv.read(),source=d.postCancel.bySlot.find(x=>x.slotId===slot);
 assert.equal(source.linkedRecords.length,4);
 assert.deepEqual(source.linkedRecords.map(x=>x.phase),
  ['CONFIRMED','HELD','CONSENTED','CANCELLED']);
 assert.deepEqual(source.linkedRecords.map(x=>x.id),ids);
 assert.deepEqual(source.linkedRecords.map(x=>[x.attendance,x.progress]),[
  ['PRESENT','COMPLETE'],['PENDING','NOT_STARTED'],
  ['PENDING','NOT_STARTED'],['PENDING','NOT_STARTED']]);
 assert.equal(source.linkedRecords[0].originalAcceptedSlotId,null);
 assert.equal(source.linkedRecords[1].holdUntil,d.applications.find(a=>a.id===ids[1]).holdUntil);
 assert.equal(source.linkedRecords[2].holdUntil,d.applications.find(a=>a.id===ids[2]).holdUntil);
 assert.deepEqual([source.linked,source.linkedConfirmed,source.linkedHoldOrConsented,
  source.linkedCancelled,source.linkedAttendanceRecorded,source.linkedProgressComplete],
  [4,1,2,1,1,1]);
 assert.equal(d.b04.history.length,history,'B02 cancellation does not write B04 history');
 assert.equal(d.notifications.length,n,'B02 session cancellation does not notify anyone');
 assert.equal(d.b02.attendance[ids[0]].progress,'COMPLETE');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('cancelQueueMatrix')),/逐筆來源/);
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/CONFIRMED.*B02出席 PRESENT.*施測 COMPLETE/);
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/CONSENTED.*暫留到期來源/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/逐筆核對/);
 assert.match(waitlistNodeText_(team.get('entries')),/取消場次逐筆來源/);
 const profile=team.get('entries').children.find(c=>c.dataset.participantId===ids[0]);
 profile.children.find(c=>c.tagName==='button').handlers.click();
 const booking=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='booking');booking.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTabBody')),/已取消場次個別核對.*CONFIRMED/);
 const audit=p108B12_(srv,'B02');
 assert.equal(audit.coverage.postCancelSummary.bySlot[0].linkedRecords.length,4);
 assert.equal(audit.coverage.postCancelSummary.completeHistory,false);
 assert.ok(audit.items.some(x=>x.action==='CANCEL'&&x.provenance==='BOUNDED_EVENT_ONLY'));
 assert.equal(audit.items.some(x=>x.action==='PERSON_REVIEW_COMPLETED'),false);
 const writes=srv.writes;
 assert.throws(()=>srv.command('ADMIN_B02_ATTEND',{id:ids[0],
  attendance:'ABSENT',progress:'NOT_STARTED',note:'TEST'}),/取消|結案/);
 assert.throws(()=>srv.command('HOLD',{id:ids[1],slotId:slot}),/尚未|取消|時段/);
 assert.equal(srv.writes,writes,'cancelled B02 cannot alter attendance or renew slot');
 closed(srv);
});
test('P1-08 §70-G cancelled B02 manual TEST booking MOVE/CANCEL requires fresh revision; no automatic repair or invented history',()=>{
 const srv=server();waitlistFillConfirmed_(srv);
 const before=srv.read(),noticeCount=before.notifications.length,prior=before.revision;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const cancelled=srv.read(),savedHistory=cancelled.b02.history.length;
 assert.equal(cancelled.postCancel.bySlot[0].linkedConfirmed,2);
 const writes=srv.writes;
 assert.throws(()=>srv.command('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'},prior),/版本已變更/);
 assert.throws(()=>srv.command('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E2-A'}),/時段|實驗|已額滿/);
 assert.equal(srv.writes,writes);
 assert.equal(srv.read().postCancel.bySlot[0].linkedConfirmed,2,'no auto-move after cancellation');
 srv.command('MOVE',{id:'SIM-001',slotId:'SIM-SLOT-E1-B'});
 const moved=srv.read(),row=moved.postCancel.bySlot[0];
 assert.equal(row.linked,1);
 assert.equal(row.linkedRecords[0].id,'SIM-002');
 assert.equal(moved.applications.find(a=>a.id==='SIM-001').phase,'CONFIRMED');
 assert.equal(moved.applications.find(a=>a.id==='SIM-001').slotId,'SIM-SLOT-E1-B');
 assert.equal(moved.b02.history.length,savedHistory,'MOVE never invents B02 cancellation history');
 assert.equal(moved.notifications.length,noticeCount+1,'existing synthetic MOVE notice only; no real email');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原B02已取消/);
 assert.match(waitlistNodeText_(team.get('cancelQueueMatrix')),/原關聯 1 筆/);
 srv.command('CANCEL',{id:'SIM-002'}); // explicit single synthetic booking CANCEL
 const after=srv.read();
 assert.equal(after.postCancel.bySlot[0].linkedRecords[0].phase,'CANCELLED');
 assert.equal(after.postCancel.bySlot[0].linkedCancelled,1);
 assert.equal(after.postCancel.bySlot[0].linkedConfirmed,0);
 assert.equal(after.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(after.b02.history.length,savedHistory,'no fake B02 event for individual CANCEL');
 assert.equal(after.notifications.length,noticeCount+2,'simulated booking events only');
 assert.equal(p108B12_(srv).coverage.postCancelSummary.bySlot[0].linkedRecords[0].phase,
  'CANCELLED');
 closed(srv);
});
test('P1-08 §70-G per-person postcancel forgery and hold expiry boundary fail closed; no automatic status writes',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'UPDATE',{capacity:4}));
 const id=postCancelPerson_(srv,'CONSENTED');
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const baseline=srv.read(),writeCount=srv.writes,read=srv.read;
 const team=page(srv,'team',{Date:Clock});
 const corrupt=mutate=>{
  srv.read=()=>{const data=read();mutate(data);return data;};
  team.click('refresh');
  assert.equal(team.get('entries').children.length,0);
  assert.equal(team.get('cancelQueueRows').children.length,0);
  assert.equal(team.get('b09WaitlistSummary').children.length,0);
  assert.equal(team.get('b12List').children.length,0);
  srv.read=read;team.click('refresh');
 };
 corrupt(d=>{d.postCancel.bySlot[0].linkedRecords[0].phase='CONFIRMED';});
 corrupt(d=>{d.postCancel.bySlot[0].linkedRecords[0].holdUntil+=10000;});
 corrupt(d=>{d.postCancel.bySlot[0].linkedRecords[0].progress='COMPLETE';});
 corrupt(d=>{d.postCancel.bySlot[0].linkedRecords[0].originalAcceptedSlotId='SIM-SLOT-E2-A';});
 assert.equal(srv.writes,writeCount);
 const hold=baseline.applications.find(a=>a.id===id).holdUntil;
 clock.now=hold+1;team.click('refresh');
 assert.equal(srv.read().applications.find(a=>a.id===id).phase,'CONSENTED',
  'expiry is not automatic cancellation or audit completion');
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/暫留已逾期.*僅保留歷程/);
 const writes=srv.writes;
 assert.throws(()=>srv.command('CANCEL',{id}),/只有有效|已取消|逾期/);
 assert.equal(srv.writes,writes);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.bySlot[0].linkedRecords[0].phase,
  'CONSENTED');
 assert.equal(srv.read().postCancel.bySlot[0].linkedRecords[0].holdUntil,hold);
 closed(srv);
});


/* §70-H: server-pinned cancelled hold edge, accepted FIFO origin and old
 * revision races. Original GAS transition + original Team/Visitor DOM VM. */
test('P1-08 §70-H expired ACCEPTED hold cannot be rebooked onto a different slot after B02 cancellation; original FIFO and bounded B12 remain unchanged',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 waitlistFillConfirmed_(srv);
 const person=waitlistVerifiedVisitor_(srv,{Date:Clock});
 person.v.click('v08WaitJoin');
 srv.command('CANCEL',{id:'SIM-001'});
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 person.v.click('v08WaitRefresh');
 person.v.click('v08WaitAccept');
 const accepted=srv.read(),oldEntry=accepted.waitlist.entries[0];
 const hold=accepted.applications.find(a=>a.id===person.id).holdUntil;
 assert.equal(oldEntry.status,'ACCEPTED');
 assert.equal(oldEntry.slotId,'SIM-SLOT-E1-A');
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 clock.now=hold+1;const before=srv.read(),writes=srv.writes,
  notifications=before.notifications.length;
 assert.throws(()=>srv.command('HOLD',{id:person.id,slotId:'SIM-SLOT-E1-B'}),
  /已接受候補暫留到期不能跨場次續留/);
 assert.throws(()=>srv.command('HOLD',{id:person.id,slotId:'SIM-SLOT-E1-A'}),
  /取消|時段/);
 assert.throws(()=>srv.command('MOVE',{id:person.id,slotId:'SIM-SLOT-E1-B'}),
  /已確認/);
 assert.throws(()=>srv.command('CANCEL',{id:person.id}),/有效|逾期/);
 assert.equal(srv.writes,writes,'all rejected owner/visitor commands leave one fixture untouched');
 const after=srv.read(),a=after.applications.find(x=>x.id===person.id),
  origin=after.postCancel.bySlot.find(s=>s.slotId==='SIM-SLOT-E1-A');
 assert.equal(a.phase,'HELD','no automatic expire, close, move or replay');
 assert.equal(a.slotId,'SIM-SLOT-E1-A');
 assert.equal(a.holdUntil,hold);
 assert.equal(after.notifications.length,notifications);
 assert.equal(after.waitlist.entries[0].status,'ACCEPTED');
 assert.equal(after.waitlist.entries[0].seq,oldEntry.seq);
 assert.equal(after.waitlist.entries[0].closedAt,oldEntry.closedAt);
 assert.equal(origin.acceptedOrigins[0].phase,'HELD');
 assert.equal(origin.linkedRecords.find(x=>x.id===person.id).originalAcceptedSlotId,
  'SIM-SLOT-E1-A');
 const team=page(srv,'team',{Date:Clock});
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/暫留已逾期.*僅保留歷程/);
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1/);
 const audit=p108B12_(srv,'WAITLIST');
 assert.equal(audit.items[0].action,'ACCEPTED');
 assert.equal(audit.items[0].historical,false);
 assert.equal(audit.items[0].at,null);
 assert.equal(audit.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-H B02/B03/B04 expired hold uses GAS owner GET cutoff; client-clock skew and boundary crossing clear stale queue without writes',()=>{
 const srv=server(),clock={server:Date.now(),offset:0};
 class ServerClock extends Date{static now(){return clock.server;}}
 class ClientClock extends Date{static now(){return clock.server+clock.offset;}}
 srv.ctx.Date=ServerClock;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'UPDATE',{capacity:4}));
 const id=postCancelPerson_(srv,'CONSENTED');
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const hold=srv.read().applications.find(a=>a.id===id).holdUntil;
 const team=page(srv,'team',{Date:ClientClock}),writes=srv.writes;
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/有效暫留仍關聯已取消場次/);
 // Server GET is still before expiry; a device clock already after expiry
 // must not recategorize this as independently verified HISTORY.
 clock.offset=hold-clock.server+1;
 team.click('refresh');
 assert.equal(team.get('cancelQueueRows').children.length,0,
  'stale boundary is cleared instead of silently changing original snapshot classification');
 assert.match(team.get('cancelQueueStatus').textContent,/重新|清空|暫留|來源/);
 assert.equal(srv.writes,writes);
 // At exact server expiry, the original application phase remains CONSENTED
 // while current review classification becomes historical, not OWNER closed.
 clock.server=hold;clock.offset=0;
 team.click('refresh');
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/暫留已逾期.*僅保留歷程/);
 const d=srv.read();
 assert.equal(d.applications.find(a=>a.id===id).phase,'CONSENTED');
 assert.equal(d.postCancel.bySlot[0].linkedRecords[0].holdUntil,hold);
 assert.equal(d.postCancel.bySlot[0].linkedRecords[0].phase,'CONSENTED');
 assert.equal(p108B12_(srv).coverage.postCancelSummary.bySlot[0].linkedRecords[0].phase,
  'CONSENTED');
 assert.equal(srv.writes,writes,'time progression has no synthetic write or notification');
 closed(srv);
});
test('P1-08 §70-H cancelled original ACCEPTED source survives explicit MOVE then CANCEL; stale CAS and B02/B04/B09/B12 provenance resist replay',()=>{
 const srv=server(),person=p108AcceptedConfirmed_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const original=srv.read(),oldRevision=original.revision,
  oldQueue=original.waitlist.entries[0],notices=original.notifications.length,
  history=original.b02.history.length,b04History=original.b04.history.length;
 const rejected=srv.writes;
 assert.throws(()=>srv.command('MOVE',{id:person.id,slotId:'SIM-SLOT-E2-A'}),/時段|實驗/);
 assert.throws(()=>srv.command('CANCEL',{id:person.id},oldRevision-1),/版本已變更/);
 assert.equal(srv.writes,rejected);
 srv.command('MOVE',{id:person.id,slotId:'SIM-SLOT-E1-B'});
 const moved=srv.read();
 assert.equal(moved.waitlist.entries[0].slotId,oldQueue.slotId);
 assert.equal(moved.waitlist.entries[0].closedAt,oldQueue.closedAt);
 assert.equal(moved.postCancel.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(moved.postCancel.bySlot[0].acceptedOrigins[0].phase,'CONFIRMED');
 const writes=srv.writes;
 assert.throws(()=>srv.command('CANCEL',{id:person.id},oldRevision),/版本已變更/);
 assert.throws(()=>srv.command('MOVE',{id:person.id,slotId:'SIM-SLOT-E1-A'}),/取消|時段/);
 assert.equal(srv.writes,writes,'stale cancellation or reopening cannot change accepted FIFO or booking');
 srv.command('CANCEL',{id:person.id});
 const result=srv.read(),e=result.waitlist.entries[0],
  row=result.postCancel.bySlot[0];
 assert.equal(result.applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.equal(result.applications.find(a=>a.id===person.id).slotId,'SIM-SLOT-E1-B');
 assert.equal(e.status,'ACCEPTED');
 assert.deepEqual([e.slotId,e.seq,e.offeredAt,e.closedAt],
  [oldQueue.slotId,oldQueue.seq,oldQueue.offeredAt,oldQueue.closedAt]);
 assert.equal(row.acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(row.acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(row.linkedRecords.some(x=>x.id===person.id),false,
  'cancelled original remains only original accepted provenance after MOVE');
 assert.equal(result.b02.history.length,history,'individual operations cannot fabricate B02 cancellation events');
 assert.equal(result.b04.history.length,b04History);
 assert.equal(result.notifications.length,notices+2,'old synthetic MOVE/CANCEL notices only');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.match(waitlistNodeText_(team.get('entries')),/候補現況/);
 const entry=team.get('entries').children.find(x=>x.dataset.participantId===person.id);
 assert.ok(entry);entry.children.find(x=>x.tagName==='button').handlers.click();
 const auditTab=[...team.context.document.querySelectorAll('[data-b04-tab]')]
  .find(x=>x.dataset.b04Tab==='audit');auditTab.handlers.click();
 assert.match(waitlistNodeText_(team.get('profileTimeline')),/原接受邀請場次已取消/);
 const audit=p108B12_(srv,'WAITLIST');
 assert.equal(audit.items[0].action,'ACCEPTED');
 assert.equal(audit.items[0].at,null);
 assert.equal(audit.items[0].historical,false);
 assert.equal(audit.coverage.postCancelSummary.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(audit.coverage.postCancelSummary.bySlot[0].retainedCancelEvents,1);
 closed(srv);
});


/* §70-I: deliver the accepted-offer confirmation through the ACTUAL original
 * Visitor DOM, so the V08 participant screen has the latest CONFIRMED state. */
function p108ConfirmedInVisitor_(srv,options){
 waitlistFillConfirmed_(srv);
 const person=waitlistVerifiedVisitor_(srv,options);
 person.v.click('v08WaitJoin');
 srv.command('CANCEL',{id:'SIM-001'});
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 person.v.click('v08WaitRefresh');person.v.click('v08WaitAccept');
 person.v.click('confirm'); // §70-S: pre-signature reservation summary
 person.v.get('readPdf').checked=true;person.v.change('readPdf');
 person.v.click('review');
 person.v.get('agree').checked=true;person.v.change('agree');
 person.v.click('finish');
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CONFIRMED');
 assert.equal(person.v.get('v08Refresh').disabled,false);
 return person;
}

/* §70-I: V08 user-visible, confirmed-only move from B02 canceled source;
 * original GAS CAS, independent owner readback and capped B12 provenance. */
test('P1-08 §70-I V08 can explicitly MOVE an accepted CONFIRMED TEST booking after original B02 CANCELLED, only with OWNER refresh and independent post-write GET',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 const original=srv.read(),priorQueue=original.waitlist.entries[0],
  priorHistory=original.b02.history.length,notices=original.notifications.length;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const cancelled=srv.read(),v=person.v;
 assert.equal(cancelled.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(v.get('v08Refresh').disabled,false);
 const before=srv.writes;
 v.click('v08Refresh');
 assert.equal(srv.writes,before,'manual V08 GET must be read-only');
 assert.match(v.get('v07Result').textContent,/重新讀取/);
 assert.equal(v.get('move').disabled,false);
 assert.equal(v.get('moveSlot').value,'SIM-SLOT-E1-B');
 const readCount=v.calls.filter(x=>x==='READ').length;
 v.click('move');
 assert.equal(v.get('v08ManageReview').hidden,false,'canceled origin allowed with bounded source');
 assert.match(v.get('v08From').textContent,/SIM-SLOT-E1-A/);
 assert.match(v.get('v08To').textContent,/SIM-SLOT-E1-B/);
 assert.equal(srv.writes,before);
 v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.calls.filter(x=>x==='READ').length,readCount+1,
  'successful original TEST CAS MOVE is followed by a separate owner GET');
 assert.match(v.get('v07Result').textContent,/獨立GET核對TEST改期/);
 assert.equal(srv.writes,before+1);
 const moved=srv.read(),entry=moved.waitlist.entries[0],orig=moved.postCancel.bySlot[0];
 assert.equal(moved.applications.find(a=>a.id===person.id).slotId,'SIM-SLOT-E1-B');
 assert.equal(moved.applications.find(a=>a.id===person.id).phase,'CONFIRMED');
 assert.deepEqual([entry.status,entry.slotId,entry.seq,entry.offeredAt,entry.closedAt],
  [priorQueue.status,priorQueue.slotId,priorQueue.seq,priorQueue.offeredAt,priorQueue.closedAt]);
 assert.equal(orig.acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(orig.acceptedOrigins[0].phase,'CONFIRMED');
 assert.equal(orig.linkedRecords.some(a=>a.id===person.id),false);
 assert.equal(moved.b02.history.length,priorHistory+1);
 assert.equal(moved.notifications.length,notices+1,'only simulated MOVE notice, no email');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 const b12=p108B12_(srv,'WAITLIST');
 assert.equal(b12.items[0].historical,false);
 assert.equal(b12.items[0].at,null);
 assert.equal(b12.coverage.postCancelSummary.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-I V08 CANCEL after accepted-offer MOVE requires one original CAS and independent GET; preserves canceled-source FIFO and bounded history',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const before=srv.read(),writes=srv.writes,reads=v.calls.filter(x=>x==='READ').length,
  q=before.waitlist.entries[0],history=before.b02.history.length;
 v.click('cancel');assert.equal(v.get('v08ManageReview').hidden,false);
 v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 assert.equal(srv.writes,writes+1);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 assert.equal(v.calls.filter(x=>x==='READ').length,reads+1);
 assert.match(v.get('v07Result').textContent,/獨立GET核對TEST個別取消/);
 const after=srv.read(),a=after.applications.find(x=>x.id===person.id);
 assert.equal(a.phase,'CANCELLED');
 assert.equal(a.slotId,'SIM-SLOT-E1-B');
 assert.equal(after.b02.sessions['SIM-SLOT-E1-A'].status,'CANCELLED');
 assert.equal(after.b02.history.length,history,'individual cancellation is not a new B02 event');
 assert.deepEqual([after.waitlist.entries[0].slotId,after.waitlist.entries[0].seq,
  after.waitlist.entries[0].closedAt],[q.slotId,q.seq,q.closedAt]);
 assert.equal(after.postCancel.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(after.postCancel.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 assert.equal(after.postCancel.bySlot[0].completeHistory,undefined);
 const audit=p108B12_(srv);
 assert.equal(audit.coverage.postCancelSummary.completeHistory,false);
 assert.equal(audit.coverage.postCancelSummary.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('cancel').disabled,true);
 closed(srv);
});
test('P1-08 §70-I V08 successful CAS but OWNER GET revoked is UNKNOWN, fail-closed and never replays MOVE',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 const before=srv.writes,originalGet=srv.ctx.study1UnifiedPreviewGet;
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewGet=()=>{throw Error('OWNER GET revoked after commit');};
 v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewGet=originalGet;
 assert.equal(srv.writes,before+1,'one original TEST MOVE may already have committed');
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-B');
 assert.deepEqual(v.calls.filter(x=>x==='MOVE'),['MOVE']);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08Refresh').disabled,true);
 assert.match(v.get('status').textContent,/GET|禁止重送|無法核對/);
 assert.equal(v.get('v08ManageReview').hidden,true);
 closed(srv);
});
test('P1-08 §70-I accepted-source spoofed on postwrite GET invalidates successful V08 CAS without a second command',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const savedRead=srv.read,writes=srv.writes;
 srv.read=()=>{
  const d=savedRead();
  d.postCancel.bySlot[0].acceptedOrigins[0].phase='CANCELLED';
  return d;
 };
 v.click('v08Commit');
 srv.read=savedRead;
 assert.equal(srv.writes,writes+1);
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CONFIRMED');
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('move').disabled,true);
 assert.match(v.get('status').textContent,/GET|禁止重送/);
 const owner=page(srv,'team');
 assert.match(waitlistNodeText_(owner.get('b09WaitlistSummary')),/已改期 1/);
 closed(srv);
});
test('P1-08 §70-I GAS requestId duplicate MOVE/CANCEL is idempotent, conflicting fingerprint or stale CAS rejected without extra simulated notices',()=>{
 const srv=server(),person=p108AcceptedConfirmed_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const entry=srv.read().waitlist.entries[0],oldRev=srv.read().revision;
 const mover={action:'MOVE',payload:{id:person.id,slotId:'SIM-SLOT-E1-B'},
  requestId:'REQ-SIM-POSTCANCEL_MOVE_001',expectedRevision:oldRev};
 const first=JSON.parse(JSON.stringify(srv.ctx.study1UnifiedPreviewCommand(mover)));
 const writes=srv.writes,notices=srv.read().notifications.length;
 assert.equal(first.revision,oldRev+1);
 const dup=JSON.parse(JSON.stringify(srv.ctx.study1UnifiedPreviewCommand(mover)));
 assert.equal(dup.deduplicated,true);
 assert.equal(srv.writes,writes);
 assert.equal(srv.read().notifications.length,notices);
 assert.throws(()=>srv.ctx.study1UnifiedPreviewCommand({...mover,
  payload:{id:person.id,slotId:'SIM-SLOT-E1-A'}}),/請求識別碼/);
 assert.throws(()=>srv.ctx.study1UnifiedPreviewCommand({...mover,
  requestId:'REQ-SIM-POSTCANCEL_MOVE_STALE'}),/版本已變更/);
 assert.equal(srv.writes,writes);
 const cancel={action:'CANCEL',payload:{id:person.id},
  requestId:'REQ-SIM-POSTCANCEL_CANCEL_001',expectedRevision:srv.read().revision};
 const beforeCancel=srv.writes;
 srv.ctx.study1UnifiedPreviewCommand(cancel);
 assert.equal(srv.writes,beforeCancel+1);
 const noExtra=srv.writes,nCancel=srv.read().notifications.length;
 const duplicateCancel=srv.ctx.study1UnifiedPreviewCommand(cancel);
 assert.equal(duplicateCancel.deduplicated,true);
 assert.equal(srv.writes,noExtra);
 assert.equal(srv.read().notifications.length,nCancel);
 assert.throws(()=>srv.ctx.study1UnifiedPreviewCommand({...cancel,
  requestId:'REQ-SIM-POSTCANCEL_CANCEL_STALE'}),/版本已變更/);
 const after=srv.read();
 assert.equal(after.applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.equal(after.waitlist.entries[0].slotId,entry.slotId);
 assert.equal(after.waitlist.entries[0].seq,entry.seq);
 assert.equal(after.waitlist.entries[0].closedAt,entry.closedAt);
 assert.equal(after.postCancel.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(p108B12_(srv,'WAITLIST').items[0].historical,false);
 closed(srv);
});


/* §70-J: two real interface tabs share one original GAS, immutable accepted
 * origin, bounded-history content and replay causality. Never use real data. */
test('P1-08 §70-J two tabs: stale second OWNER CAS rejected, newer second-tab write makes first V08 independent GET fail closed without replay',()=>{
 const srv=server(),options={deferOwnerReads:false},
  person=p108ConfirmedInVisitor_(srv,options);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;
 v.click('v08Refresh');
 const team=page(srv,'team'); // second browser tab begins at the same revision
 const before=srv.writes,oldAccept=srv.read().waitlist.entries[0];
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 options.deferOwnerReads=true;
 v.click('v08Commit'); // server CAS succeeds; delayed GET not yet delivered
 assert.equal(srv.writes,before+1);
 assert.equal(v.pendingOwnerReads.length,1);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(srv.read().applications.find(a=>a.id===person.id).slotId,'SIM-SLOT-E1-B');
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before+1,'stale second browser tab cannot write across first CAS');
 assert.match(team.get('status').textContent,/版本已變更/);
 team.click('refresh');
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before+2,'second tab may make an explicit fresh-revision TEST edit');
 assert.equal(srv.read().recruitment.E2.mode,'HIDDEN');
 const revisionAfterSecond=srv.read().revision;
 v.deliverOwnerRead(); // independent owner GET sees a newer revision
 assert.equal(srv.writes,before+2);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('move').disabled,true,'first tab cannot claim its old response is the latest current source');
 assert.equal(v.get('v08Commit').disabled,true);
 assert.match(v.get('status').textContent,/GET|禁止重送|來源無法核對/);
 assert.equal(srv.read().revision,revisionAfterSecond);
 assert.equal(srv.read().waitlist.entries[0].slotId,oldAccept.slotId);
 assert.equal(srv.read().waitlist.entries[0].seq,oldAccept.seq);
 assert.equal(srv.read().waitlist.entries[0].closedAt,oldAccept.closedAt);
 const current=page(srv,'team');
 assert.match(waitlistNodeText_(current.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 const audit=p108B12_(srv,'WAITLIST');
 assert.equal(audit.items[0].historical,false);
 assert.equal(audit.items[0].at,null);
 assert.equal(audit.coverage.postCancelSummary.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 closed(srv);
});
test('P1-08 §70-J same requestId deduplicated true is not causal evidence of this V08 click, even when phase/revision match',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 const original=srv.ctx.study1UnifiedPreviewCommand,
  before=srv.writes,notices=srv.read().notifications.length;
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=command=>{
  if(command.action!=='MOVE')return original(command);
  const first=original(command);
  assert.equal(first.deduplicated,false);
  const repeated=original(command);
  assert.equal(repeated.deduplicated,true);
  return repeated; // simulate delayed/replayed network acknowledgment
 };
 v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=original;
 assert.equal(srv.writes,before+1,'same request ID wrote just once');
 assert.equal(srv.read().notifications.length,notices+1);
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-B');
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08Refresh').disabled,true);
 assert.match(v.get('status').textContent,/重複requestId|因果|未確認/);
 assert.doesNotMatch(v.get('v07Result').textContent,/已獨立GET核對TEST改期/);
 assert.equal(v.get('v08ManageReview').hidden,true);
 closed(srv);
});
test('P1-08 §70-J same-length forged B02/B04 bounded history or original FIFO joinedAt after successful TEST CAS fails independent GET',()=>{
 for(const kind of ['B02','B04','FIFO']){
  const srv=server(),person=p108ConfirmedInVisitor_(srv);
  // One retained B04 administrative source as well as original B02 events.
  srv.command('ADMIN_B04_NOTE',{id:person.id,note:'虛構來源紀錄',reason:'TEST_SOURCE'});
  srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
  const v=person.v;v.click('v08Refresh');
  v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
  const before=srv.writes,rawRead=srv.read,
   beforeEvents=rawRead().b02.history,
   beforeB04=rawRead().b04.history;
  assert.ok(beforeEvents.length>0&&beforeB04.length>0);
  srv.read=()=>{
   const d=rawRead();
   if(d.applications.find(a=>a.id===person.id).slotId==='SIM-SLOT-E1-B'){
    if(kind==='B02')d.b02.history[0].action='FORGED_ACTION_SAME_LENGTH';
    if(kind==='B04')d.b04.history[0].reason='FORGED_REASON_SAME_LENGTH';
    if(kind==='FIFO')d.waitlist.entries[0].joinedAt+=1;
   }
   return d;
  };
  v.click('v08Commit');
  srv.read=rawRead;
  const source=srv.read();
  assert.equal(srv.writes,before+1,kind+' only one original TEST MOVE');
  assert.equal(source.applications.find(a=>a.id===person.id).slotId,'SIM-SLOT-E1-B');
  assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
  assert.equal(v.get('move').disabled,true,kind+' fake history/origin must not claim verified success');
  assert.match(v.get('status').textContent,/GET|禁止重送/);
  assert.deepEqual(source.b02.history,beforeEvents,'never persist the forged B02 view');
  assert.deepEqual(source.b04.history,beforeB04,'never persist the forged B04 view');
  assert.equal(source.waitlist.entries[0].status,'ACCEPTED');
  const team=page(srv,'team');
  assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
  const b12=p108B12_(srv,'WAITLIST');
  assert.equal(b12.items[0].historical,false);
  assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
  closed(srv);
 }
});
test('P1-08 §70-J cancellation with original ACCEPTED source and bounded B02/B04 event provenance remains one CAS/one independent GET',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B04_NOTE',{id:person.id,note:'虛構核對',reason:'TEST_NOTE'});
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');v.click('move');
 v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const moved=srv.read(),b02=JSON.parse(JSON.stringify(moved.b02.history)),
  b04=JSON.parse(JSON.stringify(moved.b04.history)),
  q=JSON.parse(JSON.stringify(moved.waitlist.entries[0])),
  before=srv.writes,reads=v.calls.filter(x=>x==='READ').length;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 assert.equal(srv.writes,before+1);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 assert.equal(v.calls.filter(x=>x==='READ').length,reads+1);
 assert.match(v.get('v07Result').textContent,/獨立GET核對TEST個別取消/);
 const d=srv.read();
 assert.deepEqual(d.b02.history,b02);
 assert.deepEqual(d.b04.history,b04);
 assert.deepEqual(d.waitlist.entries[0],q);
 assert.equal(d.postCancel.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 assert.equal(d.postCancel.bySlot[0].acceptedOrigins[0].currentSlotId,'SIM-SLOT-E1-B');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});


/* §70-K: UNKNOWN is a causal state, not a booking phase. A manual owner GET
 * must not authorize replay of an ambiguous V08 MOVE/CANCEL requestId. */
test('P1-08 §70-K duplicate requestId V08 MOVE remains UNKNOWN after repeated explicit owner-only rescans; no second CAS or phantom notice',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv);
 const native=srv.ctx.study1UnifiedPreviewCommand,
  before=srv.writes,notices=srv.read().notifications.length;
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(cmd.action!=='MOVE')return native(cmd);
  assert.equal(native(cmd).deduplicated,false);
  return native(cmd); // same exact command/ID returns only current view
 };
 v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(srv.writes,before+1);
 assert.equal(srv.read().notifications.length,notices+1);
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-B');
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v07Rescan').disabled,false);
 const firstRead=v.calls.filter(x=>x==='READ').length,confirmed=srv.writes;
 v.click('v07Rescan');
 assert.equal(v.calls.filter(x=>x==='READ').length,firstRead+1);
 assert.equal(srv.writes,confirmed,'rescan is read-only, no new request ID');
 assert.equal(v.get('move').disabled,true,'UNKNOWN stays locked even after second valid GET');
 assert.equal(v.get('cancel').disabled,true);
 assert.equal(v.get('v08Refresh').disabled,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.match(v.get('v07Result').textContent,/此次操作因果結果尚未確認/);
 assert.match(v.get('status').textContent,/因果仍未知/);
 assert.doesNotMatch(v.get('v07Result').textContent,/已獨立GET核對TEST改期/);
 assert.equal(v.get('v07Rescan').disabled,false,'a further explicit readonly rescan is allowed');
 v.click('v07Rescan');
 assert.equal(srv.writes,confirmed);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('move').disabled,true);
 closed(srv);
});
test('P1-08 §70-K ambiguous CANCEL after accepted FIFO, B02 cancellation and explicit MOVE recovers current state read-only but retains UNKNOWN causal lock',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const q=srv.read().waitlist.entries[0],b02=JSON.parse(JSON.stringify(srv.read().b02.history)),
  before=srv.writes,notices=srv.read().notifications.length;
 const native=srv.ctx.study1UnifiedPreviewCommand;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(cmd.action!=='CANCEL')return native(cmd);
  assert.equal(native(cmd).deduplicated,false);
  return native(cmd);
 };
 v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(srv.writes,before+1);
 assert.equal(srv.read().notifications.length,notices+1);
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.match(v.get('v07Result').textContent,/只能|因果結果尚未確認/);
 assert.equal(v.get('v07Rescan').disabled,false);
 const prior=srv.writes;
 v.click('v07Rescan');
 assert.equal(srv.writes,prior);
 assert.equal(v.get('cancel').disabled,true);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08Refresh').disabled,true);
 assert.match(v.get('v07Result').textContent,/目前狀態.*已取消/);
 assert.match(v.get('v07Result').textContent,/無法證明剛才那次提交成功/);
 const d=srv.read();
 assert.equal(d.waitlist.entries[0].slotId,q.slotId);
 assert.equal(d.waitlist.entries[0].seq,q.seq);
 assert.equal(d.waitlist.entries[0].joinedAt,q.joinedAt);
 assert.equal(d.waitlist.entries[0].closedAt,q.closedAt);
 assert.deepEqual(d.b02.history,b02);
 assert.equal(d.postCancel.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 const b12=p108B12_(srv,'WAITLIST');
 assert.equal(b12.items[0].historical,false);
 assert.equal(b12.items[0].at,null);
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-K two-tab updates while UNKNOWN recovery GET is deferred: later revision shown, older rollback source fails closed without replay',()=>{
 const srv=server(),opts={deferOwnerReads:false},v=v08ConfirmedVisitor_(srv,opts),
  team=page(srv,'team');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const native=srv.ctx.study1UnifiedPreviewCommand;
 opts.deferOwnerReads=true;
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(cmd.action!=='MOVE')return native(cmd);
  const first=native(cmd);assert.equal(first.deduplicated,false);
  return native(cmd);
 };
 const start=srv.writes;
 v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(v.pendingOwnerReads.length,1,'UNKNOWN owner GET is pending, no auto resend');
 assert.equal(srv.writes,start+1);
 assert.equal(v.get('v07Rescan').disabled,true);
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,start+1,'old owner tab CAS rejected');
 team.click('refresh');
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,start+2);
 const committed=srv.read(),revision=committed.revision,readCount=v.calls.filter(x=>x==='READ').length;
 v.deliverOwnerRead(); // first unknown read returns the newer true revision
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v07Rescan').disabled,false);
 assert.match(v.get('v07Result').textContent,/此次操作因果結果尚未確認/);
 v.click('v07Rescan');
 assert.equal(v.pendingOwnerReads.length,1);
 const read=srv.read;
 srv.read=()=>{const d=read();d.revision=revision-1;return d;};
 v.deliverOwnerRead(); // stale/out-of-order older owner source cannot be applied
 srv.read=read;
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(srv.writes,start+2,'no repeat MOVE or cancel after stale GET');
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.match(v.get('status').textContent,/修訂版回退|無法核實|已停止操作/);
 assert.equal(v.calls.filter(x=>x==='READ').length,readCount+1);
 assert.equal(srv.read().revision,revision);
 assert.equal(srv.read().applications[0].slotId,'SIM-SLOT-E1-B');
 assert.equal(srv.read().recruitment.E2.mode,'HIDDEN');
 const b12=p108B12_(srv);
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-K prior HELD/CONSENTED expiry and original ACCEPTED FIFO cannot be unlocked by V08 UNKNOWN rescans',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 waitlistFillConfirmed_(srv);
 const person=waitlistVerifiedVisitor_(srv,{Date:Clock});
 person.v.click('v08WaitJoin');
 srv.command('CANCEL',{id:'SIM-001'});
 srv.command('WAITLIST_ADVANCE',{slotId:'SIM-SLOT-E1-A'});
 person.v.click('v08WaitRefresh');person.v.click('v08WaitAccept');
 const hold=srv.read().applications.find(a=>a.id===person.id).holdUntil,
  original=srv.read().waitlist.entries[0];
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 clock.now=hold+1;
 const before=srv.writes;
 assert.throws(()=>srv.command('HOLD',{id:person.id,slotId:'SIM-SLOT-E1-B'}),/已接受候補暫留到期/);
 assert.throws(()=>srv.command('MOVE',{id:person.id,slotId:'SIM-SLOT-E1-B'}),/已確認/);
 assert.throws(()=>srv.command('CANCEL',{id:person.id}),/逾期|只有有效/);
 assert.equal(srv.writes,before);
 const a=srv.read().applications.find(x=>x.id===person.id);
 assert.equal(a.phase,'HELD');
 assert.equal(a.holdUntil,hold);
 assert.equal(a.slotId,'SIM-SLOT-E1-A');
 const e=srv.read().waitlist.entries[0];
 assert.deepEqual([e.status,e.slotId,e.seq,e.joinedAt,e.closedAt],
  [original.status,original.slotId,original.seq,original.joinedAt,original.closedAt]);
 const team=page(srv,'team',{Date:Clock});
 assert.match(waitlistNodeText_(team.get('cancelQueueRows')),/暫留已逾期.*僅保留歷程/);
 const b12=p108B12_(srv,'WAITLIST');
 assert.equal(b12.items[0].historical,false);
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});


/* §70-L: explicit new pure-TEST baseline after UNKNOWN. This never
 * retroactively proves old MOVE/CANCEL causality or replays its requestId. */
test('P1-08 §70-L UNKNOWN MOVE recovery requires explicit acknowledgement and two independent matching OWNER GETs; following CANCEL is a new CAS request',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');v.click('move');
 v.get('v08Ack').checked=true;v.change('v08Ack');
 const original=srv.ctx.study1UnifiedPreviewCommand,ids=[],start=srv.writes;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(['MOVE','CANCEL'].includes(c.action))ids.push({action:c.action,id:c.requestId});
  if(c.action==='MOVE'){
   assert.equal(original(c).deduplicated,false);
   return original(c);
  }
  return original(c);
 };
 v.click('v08Commit');
 assert.equal(srv.writes,start+1);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('cancel').disabled,true);
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 assert.equal(v.get('v08UnknownRecover').disabled,true);
 assert.match(v.get('v07Result').textContent,/此次操作因果結果尚未確認/);
 const readStart=v.calls.filter(x=>x==='READ').length;
 const writesBefore=srv.writes,notices=srv.read().notifications.length;
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 assert.equal(v.get('v08UnknownRecover').disabled,false);
 v.click('v08UnknownRecover');
 assert.equal(v.calls.filter(x=>x==='READ').length,readStart+2);
 assert.equal(srv.writes,writesBefore);
 assert.equal(srv.read().notifications.length,notices);
 assert.equal(v.get('v08UnknownBoundary').hidden,true);
 assert.match(v.get('v07Result').textContent,/原MOVE\/CANCEL交易因果仍UNKNOWN/);
 assert.doesNotMatch(v.get('v07Result').textContent,/已獨立GET核對TEST改期/);
 assert.equal(v.get('cancel').disabled,false,'recovery restores new explicit TEST actions from fresh CONFIRMED snapshot');
 const q=srv.read().waitlist.entries[0];
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=original;
 assert.equal(srv.writes,writesBefore+1);
 assert.equal(ids.length,2);
 assert.notEqual(ids[0].id,ids[1].id,'fresh action must not reuse original request ID');
 assert.deepEqual(ids.map(x=>x.action),['MOVE','CANCEL']);
 assert.match(v.get('v07Result').textContent,/已獨立GET核對TEST個別取消/);
 const d=srv.read();
 assert.equal(d.applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.deepEqual([d.waitlist.entries[0].slotId,d.waitlist.entries[0].seq,
  d.waitlist.entries[0].joinedAt,d.waitlist.entries[0].closedAt],
  [q.slotId,q.seq,q.joinedAt,q.closedAt]);
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-L UNKNOWN CANCEL recovery with original cancelled B02/FIFO is read-only and cannot enable operations against CANCELLED person',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const before=srv.read(),q=JSON.parse(JSON.stringify(before.waitlist.entries[0])),
  b02=JSON.parse(JSON.stringify(before.b02.history)),
  orig=srv.ctx.study1UnifiedPreviewCommand;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='CANCEL')return orig(c);
  assert.equal(orig(c).deduplicated,false);
  return orig(c);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=orig;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const count=srv.writes,notices=srv.read().notifications.length,
  readCount=v.calls.filter(x=>x==='READ').length;
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');
 assert.equal(v.calls.filter(x=>x==='READ').length,readCount+2);
 assert.equal(srv.writes,count);
 assert.equal(srv.read().notifications.length,notices);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('cancel').disabled,true);
 assert.match(v.get('v07Result').textContent,/因果仍UNKNOWN/);
 const d=srv.read();
 assert.deepEqual(d.waitlist.entries[0],q);
 assert.deepEqual(d.b02.history,b02);
 assert.equal(d.postCancel.bySlot[0].acceptedOrigins[0].phase,'CANCELLED');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 const b12=p108B12_(srv,'WAITLIST');
 assert.equal(b12.items[0].historical,false);
 assert.equal(b12.items[0].at,null);
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-L concurrent second-tab CAS between first and second recovery GET rejects new baseline, original UNKNOWN remains and no replay',()=>{
 const srv=server(),options={deferOwnerReads:false},v=v08ConfirmedVisitor_(srv,options),
  team=page(srv,'team');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const original=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='MOVE')return original(c);
  assert.equal(original(c).deduplicated,false);return original(c);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=original;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const before=srv.writes;
 options.deferOwnerReads=true;
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');v.click('v08UnknownRecover');
 assert.equal(v.pendingOwnerReads.length,1,'first independent read deferred');
 v.deliverOwnerRead();
 assert.equal(v.pendingOwnerReads.length,1,'second independent read deferred');
 assert.equal(srv.writes,before);
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before,'second stale tab CAS rejected');
 team.click('refresh');team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before+1,'second tab explicitly changed newer GAS revision');
 v.deliverOwnerRead();
 assert.equal(v.pendingOwnerReads.length,0);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(v.get('v08UnknownRecover').disabled,true);
 assert.match(v.get('status').textContent,/兩次獨立GET|拒絕恢復|UNKNOWN/);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(srv.writes,before+1);
 assert.equal(srv.read().recruitment.E2.mode,'HIDDEN');
 const b12=p108B12_(srv);
 assert.equal(b12.coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-L same-revision forged accepted FIFO or bounded B02/B04 sources blocks explicit UNKNOWN recovery without writes',()=>{
 for(const kind of ['FIFO','B02','B04']){
  const srv=server(),person=p108ConfirmedInVisitor_(srv);
  srv.command('ADMIN_B04_NOTE',{id:person.id,note:'原測試證據',reason:'TEST_NOTE'});
  srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
  const v=person.v;v.click('v08Refresh');v.click('move');
  v.get('v08Ack').checked=true;v.change('v08Ack');
  const native=srv.ctx.study1UnifiedPreviewCommand;
  srv.ctx.study1UnifiedPreviewCommand=c=>{
   if(c.action!=='MOVE')return native(c);
   assert.equal(native(c).deduplicated,false);return native(c);
  };
  v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
  assert.equal(v.get('v08UnknownBoundary').hidden,false);
  const originalRead=srv.read,snapshot=originalRead(),start=srv.writes,notices=snapshot.notifications.length;
  v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
  let n=0;
  srv.read=()=>{
   const d=originalRead();n++;
   if(n===2){
    if(kind==='FIFO')d.waitlist.entries[0].joinedAt-=1;
    if(kind==='B02')d.b02.history[0].action='FORGED_SAME_LENGTH';
    if(kind==='B04')d.b04.history[0].reason='FORGED_SAME_LENGTH';
   }
   return d;
  };
  v.click('v08UnknownRecover');srv.read=originalRead;
  assert.equal(n,2,kind+' must attempt two GETs');
  assert.equal(srv.writes,start);
  assert.equal(srv.read().notifications.length,notices);
  assert.equal(v.get('move').disabled,true);
  assert.equal(v.get('v08UnknownRecover').disabled,true);
  assert.match(v.get('status').textContent,/兩次獨立GET|拒絕恢復|UNKNOWN/);
  assert.deepEqual(srv.read().waitlist.entries,snapshot.waitlist.entries);
  assert.deepEqual(srv.read().b02.history,snapshot.b02.history);
  assert.deepEqual(srv.read().b04.history,snapshot.b04.history);
  const team=page(srv,'team');
  assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
  assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
  closed(srv);
 }
});
test('P1-08 §70-L exact HELD holdUntil crossing between explicit recovery GETs rejects old baseline; original accepted FIFO/phase and B12 unchanged',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 const v=v08ConfirmedVisitor_(srv);
 // Second independent HELD participant is a real original GAS TEST fixture.
 const heldId=postCancelPerson_(srv,'HELD'),hold=srv.read().applications.find(a=>a.id===heldId).holdUntil;
 v.click('v08Refresh');v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const native=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='MOVE')return native(c);
  assert.equal(native(c).deduplicated,false);return native(c);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const originalRead=srv.read,before=srv.writes;
 clock.now=hold-1;
 let count=0;
 srv.read=()=>{
  const d=originalRead();count++;
  if(count===1)clock.now=hold;
  return d;
 };
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');srv.read=originalRead;
 assert.equal(count,2);
 assert.equal(srv.writes,before,'hold expiration cannot cause a write or retroactive cancellation');
 assert.equal(v.get('move').disabled,true);
 assert.match(v.get('status').textContent,/兩次獨立GET|拒絕恢復|UNKNOWN/);
 const a=srv.read().applications.find(x=>x.id===heldId);
 assert.equal(a.phase,'HELD');
 assert.equal(a.holdUntil,hold);
 const team=page(srv,'team',{Date:Clock});
 assert.equal(team.get('entries').children.length>=2,true);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});


/* §70-M: invalid post-CAS success is still causal UNKNOWN, duplicated OWNER
 * callbacks are one-shot, and twin same-revision forgeries cannot reset it. */
test('P1-08 §70-M forged success after committed MOVE keeps UNKNOWN across V07 GET; explicit new baseline uses distinct CANCEL requestId and original FIFO',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 const native=srv.ctx.study1UnifiedPreviewCommand,ids=[],before=srv.writes;
 const fifo=JSON.parse(JSON.stringify(srv.read().waitlist.entries[0]));
 const b02=JSON.parse(JSON.stringify(srv.read().b02.history));
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(['MOVE','CANCEL'].includes(cmd.action))ids.push(cmd.requestId);
  const response=native(cmd);
  // The real locked CAS committed, but its returned success is untrustworthy.
  return cmd.action==='MOVE'?{...response,
   formalPorts:{...response.formalPorts,activated:true}}:response;
 };
 v.click('v08Commit');
 assert.equal(srv.writes,before+1);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 assert.match(v.get('v07Result').textContent,/因果結果尚未確認/);
 const noReplay=srv.writes,initialReads=v.calls.filter(x=>x==='READ').length;
 v.click('v07Rescan');
 assert.equal(v.calls.filter(x=>x==='READ').length,initialReads+1);
 assert.equal(srv.writes,noReplay);
 assert.equal(v.get('cancel').disabled,true,'one valid read cannot release UNKNOWN');
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');
 assert.equal(srv.writes,noReplay,'two GETs are read-only');
 assert.equal(v.get('cancel').disabled,false);
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(ids.length,2);
 assert.notEqual(ids[0],ids[1],'new operation never recycles suspect requestId');
 assert.equal(srv.writes,noReplay+1);
 assert.deepEqual(srv.read().waitlist.entries[0],fifo);
 assert.deepEqual(srv.read().b02.history,b02);
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-M mismatched CANCEL success revision after accepted MOVE remains UNKNOWN; double owner GET cannot reopen CANCELLED person',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv),v=person.v;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 v.click('v08Refresh');v.click('move');
 v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const native=srv.ctx.study1UnifiedPreviewCommand,before=srv.writes,
  old=srv.read(),oldEntry=JSON.parse(JSON.stringify(old.waitlist.entries[0]));
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  const result=native(cmd);
  return cmd.action==='CANCEL'?{...result,revision:result.revision+1}:result;
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(srv.writes,before+1,'the cancellation really committed once');
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const noReplay=srv.writes;
 v.click('v07Rescan');
 assert.equal(srv.writes,noReplay);
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');
 assert.equal(srv.writes,noReplay);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('cancel').disabled,true);
 assert.match(v.get('v07Result').textContent,/因果仍UNKNOWN/);
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.deepEqual(srv.read().waitlist.entries[0],oldEntry);
 assert.equal(p108B12_(srv,'WAITLIST').items[0].historical,false);
 closed(srv);
});
test('P1-08 §70-M duplicate first OWNER GET callback cannot fork multiple second reads or bypass second-tab CAS revision',()=>{
 const srv=server(),options={deferOwnerReads:false},
  v=v08ConfirmedVisitor_(srv,options),team=page(srv,'team');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const native=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(cmd.action!=='MOVE')return native(cmd);
  assert.equal(native(cmd).deduplicated,false);
  return native(cmd);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const before=srv.writes;
 options.deferOwnerReads=true;
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');
 assert.equal(v.pendingOwnerReads.length,1);
 const repeatFirst=v.pendingOwnerReads[0];
 v.deliverOwnerRead();
 assert.equal(v.pendingOwnerReads.length,1,'exactly one second GET scheduled');
 repeatFirst(); // forged transport duplicate/out-of-order first success
 assert.equal(v.pendingOwnerReads.length,1,'duplicate first success must be ignored');
 team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before,'second owner tab stale CAS denied');
 team.click('refresh');team.set('modeE2','HIDDEN');team.click('saveModes');
 assert.equal(srv.writes,before+1);
 v.deliverOwnerRead();
 assert.equal(v.pendingOwnerReads.length,0);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08UnknownRecover').disabled,true);
 assert.match(v.get('status').textContent,/拒絕恢復|UNKNOWN|兩次獨立GET/);
 assert.equal(v.calls.filter(x=>x==='MOVE').length,1);
 assert.equal(srv.read().recruitment.E2.mode,'HIDDEN');
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-M identical twin forged OWNER GETs at unchanged revision cannot replace trusted FIFO or bounded B02/B04 source',()=>{
 for(const kind of ['FIFO','B02','B04','NOTICE']){
  const srv=server(),person=p108ConfirmedInVisitor_(srv),v=person.v;
  srv.command('ADMIN_B04_NOTE',{id:person.id,note:'原有限來源',reason:'TEST_NOTE'});
  srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
  v.click('v08Refresh');v.click('move');
  v.get('v08Ack').checked=true;v.change('v08Ack');
  const native=srv.ctx.study1UnifiedPreviewCommand;
  srv.ctx.study1UnifiedPreviewCommand=cmd=>{
   if(cmd.action!=='MOVE')return native(cmd);
   assert.equal(native(cmd).deduplicated,false);
   return native(cmd);
  };
  v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
  const honest=srv.read,source=honest(),before=srv.writes;
  let reads=0;
  srv.read=()=>{
   const d=honest();reads++;
   if(kind==='FIFO')d.waitlist.entries[0].joinedAt-=1;
   if(kind==='B02')d.b02.history[0].action='FORGED_TWIN_SAME_REVISION';
   if(kind==='B04')d.b04.history[0].reason='FORGED_TWIN_SAME_REVISION';
   if(kind==='NOTICE')d.notifications.at(-1).status='SIM_FAILED';
   return d;
  };
  v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
  v.click('v08UnknownRecover');srv.read=honest;
  assert.equal(reads,1,kind+': compare against previous trusted OWNER GET before second GET');
  assert.equal(srv.writes,before);
  assert.equal(v.get('move').disabled,true);
  assert.equal(v.get('v08UnknownRecover').disabled,true);
  assert.match(v.get('status').textContent,/拒絕恢復|UNKNOWN|兩次獨立GET/);
  assert.deepEqual(srv.read().waitlist.entries,source.waitlist.entries);
  assert.deepEqual(srv.read().b02.history,source.b02.history);
  assert.deepEqual(srv.read().b04.history,source.b04.history);
  const team=page(srv,'team');
  assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
  assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
  closed(srv);
 }
});

test('P1-08 §70-M CONSENTED holdUntil exact boundary across two OWNER GETs fails closed without changing synthetic consent or FIFO',()=>{
 const srv=server(),clock={now:Date.now()};
 class Clock extends Date{static now(){return clock.now;}}
 srv.ctx.Date=Clock;
 const v=v08ConfirmedVisitor_(srv);
 const consentId=postCancelPerson_(srv,'CONSENTED');
 const original=srv.read(),record=original.applications.find(a=>a.id===consentId),
  hold=record.holdUntil,noticeCount=original.notifications.length;
 v.click('v08Refresh');
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 const native=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=cmd=>{
  if(cmd.action!=='MOVE')return native(cmd);
  assert.equal(native(cmd).deduplicated,false);
  return native(cmd);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const writes=srv.writes,read=srv.read;
 clock.now=hold-1;
 let count=0;
 srv.read=()=>{
  const d=read();count++;
  if(count===1)clock.now=hold;
  return d;
 };
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');srv.read=read;
 assert.equal(count,2);
 assert.equal(srv.writes,writes,'crossing a CONSENTED holdUntil is not a new write');
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08UnknownRecover').disabled,true);
 assert.match(v.get('status').textContent,/拒絕恢復|UNKNOWN|兩次獨立GET/);
 const after=srv.read().applications.find(a=>a.id===consentId);
 assert.equal(after.phase,'CONSENTED');
 assert.equal(after.holdUntil,hold);
 assert.equal(after.signatureDemo,true);
 assert.equal(srv.read().notifications.length,noticeCount+1,'only original MOVE created a simulated notice');
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});


/* §70-N: same original GAS and browser-shaped OWNER VM, with callbacks
 * intentionally delayed/duplicated. No simulated command replaces GAS CAS. */
test('P1-08 §70-N stale MOVE command ACK and V07 GET callbacks cannot unlock new CANCEL in flight; distinct requestIds and original accepted FIFO remain',()=>{
 const srv=server(),opts={deferCommandReplies:false},person=p108ConfirmedInVisitor_(srv,opts);
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 const v=person.v;v.click('v08Refresh');
 const native=srv.ctx.study1UnifiedPreviewCommand,orig=srv.read();
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='MOVE')return native(c);
  assert.equal(native(c).deduplicated,false);
  return native(c); // the old MOVE is causally UNKNOWN to this OWNER tab
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 const oldAck=v.commandReplyHistory.at(-1),oldRescan=v.ownerReplyHistory.at(-1);
 assert.equal(oldAck.command.action,'MOVE');
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');
 v.click('v08UnknownRecover');
 assert.equal(v.get('cancel').disabled,false);
 opts.deferCommandReplies=true;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 const beforeCancel=srv.writes;
 v.click('v08Commit');
 assert.equal(srv.writes,beforeCancel+1,'new CANCEL GAS CAS already ran');
 assert.equal(v.pendingCommandReplies.length,1);
 const newAck=v.commandReplyHistory.at(-1);
 assert.notEqual(oldAck.command.requestId,newAck.command.requestId);
 const priorReads=v.calls.filter(x=>x==='READ').length;
 oldAck.success(oldAck.result);oldAck.failure(new Error('delayed first MOVE failure'));
 oldRescan.success(orig);oldRescan.failure(new Error('delayed earlier read failure'));
 assert.equal(v.calls.filter(x=>x==='READ').length,priorReads,'stale callbacks cannot schedule another OWNER GET');
 assert.equal(v.get('cancel').disabled,true,'new committed CANCEL remains locked until its reply and GET');
 assert.equal(v.get('v08Commit').disabled,true);
 assert.equal(srv.writes,beforeCancel+1,'no old requestId replay');
 v.deliverCommandReply();
 assert.equal(v.pendingCommandReplies.length,0);
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.equal(srv.read().waitlist.entries[0].status,'ACCEPTED');
 assert.deepEqual([srv.read().waitlist.entries[0].slotId,srv.read().waitlist.entries[0].seq],
  [orig.waitlist.entries[0].slotId,orig.waitlist.entries[0].seq]);
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.equal(p108B12_(srv,'WAITLIST').items[0].historical,false);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-N old independent MOVE OWNER GET success/failure cannot overwrite the locked new CANCEL CAS before its response',()=>{
 const srv=server(),options={deferCommandReplies:false},v=v08ConfirmedVisitor_(srv,options);
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 assert.equal(v.get('cancel').disabled,false);
 const oldGet=v.ownerReplyHistory.at(-1),oldMove=srv.read();
 assert.equal(oldMove.applications[0].phase,'CONFIRMED');
 options.deferCommandReplies=true;
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 const start=srv.writes;v.click('v08Commit');
 assert.equal(srv.writes,start+1);
 assert.equal(v.pendingCommandReplies.length,1);
 const count=v.calls.filter(x=>x==='READ').length;
 oldGet.success(oldMove);oldGet.failure(new Error('replayed old GET denial'));
 assert.equal(v.calls.filter(x=>x==='READ').length,count);
 assert.equal(v.get('cancel').disabled,true,'old GET cannot unlock a newer in-flight transaction');
 assert.equal(v.get('v08Commit').disabled,true);
 v.deliverCommandReply();
 assert.equal(v.calls.filter(x=>x==='CANCEL').length,1);
 assert.equal(srv.read().applications[0].phase,'CANCELLED');
 assert.match(v.get('v07Result').textContent,/獨立GET核對TEST個別取消/);
 closed(srv);
});
test('P1-08 §70-N fresh new requestId after explicit UNKNOWN baseline still loses original GAS CAS to second OWNER tab; second UNKNOWN cannot replay original',()=>{
 const srv=server(),person=p108ConfirmedInVisitor_(srv),v=person.v;
 srv.command('ADMIN_B02_SLOT',waitlistB02Payload_(srv,'CANCEL'));
 v.click('v08Refresh');v.click('move');
 v.get('v08Ack').checked=true;v.change('v08Ack');
 const original=srv.ctx.study1UnifiedPreviewCommand;
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='MOVE')return original(c);
  assert.equal(original(c).deduplicated,false);return original(c);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=original;
 const oldId=v.commandReplyHistory.at(-1).command.requestId;
 const accepted=JSON.parse(JSON.stringify(srv.read().waitlist.entries[0]));
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');v.click('v08UnknownRecover');
 assert.equal(v.get('cancel').disabled,false);
 const tab2=page(srv,'team'); // second OWNER tab has same original revision
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');
 const before=srv.writes;
 tab2.set('modeE2','HIDDEN');tab2.click('saveModes');
 assert.equal(srv.writes,before+1,'other OWNER performed fresh explicit CAS');
 v.click('v08Commit'); // this tab's formerly valid revision is now stale
 const staleId=v.commandAttemptHistory.at(-1).requestId;
 assert.notEqual(staleId,oldId,'old UNKNOWN requestId is never reused');
 assert.equal(srv.writes,before+1,'stale CANCEL did not write or auto-retry');
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CONFIRMED');
 assert.equal(v.get('cancel').disabled,true);
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 v.click('v07Rescan');
 assert.equal(v.get('cancel').disabled,true,'one valid GET remains read-only');
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');v.click('v08UnknownRecover');
 assert.equal(v.get('cancel').disabled,false);
 v.click('cancel');v.get('v08Ack').checked=true;v.change('v08Ack');v.click('v08Commit');
 const finalId=v.commandReplyHistory.at(-1).command.requestId;
 assert.equal(new Set([oldId,staleId,finalId]).size,3);
 assert.equal(srv.writes,before+2,'one final new original GAS CAS');
 assert.equal(srv.read().applications.find(a=>a.id===person.id).phase,'CANCELLED');
 assert.deepEqual(srv.read().waitlist.entries[0],accepted,'original accepted FIFO never re-authored');
 const team=page(srv,'team');
 assert.match(waitlistNodeText_(team.get('b09WaitlistSummary')),/原候補接受 1.*已改期 1/);
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
test('P1-08 §70-N first recovery GET with earlier GAS asOf than prior trusted OWNER snapshot rejects same-revision twin replies with no writes',()=>{
 const srv=server(),v=v08ConfirmedVisitor_(srv),native=srv.ctx.study1UnifiedPreviewCommand;
 v.click('move');v.get('v08Ack').checked=true;v.change('v08Ack');
 srv.ctx.study1UnifiedPreviewCommand=c=>{
  if(c.action!=='MOVE')return native(c);
  assert.equal(native(c).deduplicated,false);return native(c);
 };
 v.click('v08Commit');srv.ctx.study1UnifiedPreviewCommand=native;
 assert.equal(v.get('v08UnknownBoundary').hidden,false);
 const read=srv.read,writes=srv.writes,prev=v.calls.filter(x=>x==='READ').length;
 let reads=0;
 srv.read=()=>{const d=read();d.waitlist.asOf-=1000;reads++;return d;};
 v.get('v08UnknownAck').checked=true;v.change('v08UnknownAck');v.click('v08UnknownRecover');
 srv.read=read;
 assert.equal(reads,1,'reject stale clock before second GET');
 assert.equal(v.calls.filter(x=>x==='READ').length,prev+1);
 assert.equal(srv.writes,writes);
 assert.equal(v.get('move').disabled,true);
 assert.equal(v.get('v08UnknownRecover').disabled,true);
 assert.match(v.get('status').textContent,/兩次獨立GET|拒絕恢復|UNKNOWN/);
 assert.equal(srv.read().applications[0].phase,'CONFIRMED');
 assert.equal(p108B12_(srv).coverage.postCancelSummary.completeHistory,false);
 closed(srv);
});
