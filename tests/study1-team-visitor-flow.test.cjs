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
  setProperty:(key,value)=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1'].includes(key));writes++;store.set(key,value);},
  deleteProperty:key=>{assert.ok(['STUDY1_UNIFIED_FIXTURE_V1','STUDY1_B06_TASKS_V1'].includes(key));store.delete(key);}
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
  style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},focus(){},scrollTop:0,
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
 const profileTabs=[...html.matchAll(/<button[^>]*data-b04-tab="([^"]+)"[^>]*>/g)].map(m=>{
  const node=element('b04-tab-'+m[1],'button');node.dataset.b04Tab=m[1];return node;
 });
 const get=id=>{const e=ids.get(id);assert.ok(e,'Unknown element '+kind+': '+id);return e;};
 const query=selector=>{
  if(selector==='#slotRows [data-slot-id]')
   return get('slotRows').children.filter(x=>x.dataset.slotId);
  if(selector==='#weekRows [data-week]')
   return get('weekRows').children.filter(x=>x.dataset.week);
  if(selector==='.step')return [...ids.values()].filter(x=>x.id.startsWith('step-'));
  if(selector==='#progress span')return progress;
  if(selector==='[data-b04-tab]')return profileTabs;
  throw Error('Unmocked querySelectorAll '+selector);
 };
 return {ids,get,doc:{getElementById:get,createElement:tag=>element('',tag),
  querySelectorAll:query,addEventListener(){}}};
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
  study1UnifiedB06Command(c){calls.push('B06_'+c.action);
   try{success(JSON.parse(JSON.stringify(server.ctx.study1UnifiedB06Command(c))));}
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
 const expected=['CONSENT_READY','OPEN'];
 if(server.store.has('STUDY1_UNIFIED_FIXTURE_V1'))expected.push('STUDY1_UNIFIED_FIXTURE_V1');
 if(server.store.has('STUDY1_B06_TASKS_V1'))expected.push('STUDY1_B06_TASKS_V1');
 assert.deepEqual([...server.store.keys()].sort(),expected.sort());
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
 assert.equal(team.calls.filter(x=>x!=='READ').length,0,'report does not call a mutation RPC');
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
 assert.equal(team.calls.filter(x=>x!=='READ').length,0);
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
