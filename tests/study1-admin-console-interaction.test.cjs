'use strict';
// End-to-end-shaped sandbox contract: real AdminConsole inline JS + real AdminSandbox
// functions with an in-memory GAS adapter. No live Google account or research data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const serverSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const clientHTML=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const scripts=[...clientHTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('Expected exactly one inline admin client script');
const clientSource=scripts[0][1];
const IDs=['title','intro','eligibility','questions','slots','template','pdf','revision','save','check','reload','status','slotNumber','slotLoad','slotStart','slotLocation','slotCapacity','slotApply','slotAdd','slotRemove','selftest','selftestResult','questionNumber','questionLoad','questionText','questionRequired','questionApply','questionAdd','questionRemove'];
function server(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const props=new Map(),locks={held:false,count:0};
 const store={getProperty:key=>props.has(key)?props.get(key):null,setProperty:(key,v)=>{
  assert.ok(['STUDY1_SANDBOX_ADMIN_CONFIG_V1','STUDY1_SANDBOX_SELFTEST_V1'].includes(key),'Only isolated properties');
  props.set(key,v);
 },deleteProperty:key=>{assert.equal(key,'STUDY1_SANDBOX_SELFTEST_V1');props.delete(key);}};
 const ctx=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties:()=>store},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{assert.equal(locks.held,false);locks.held=true;locks.count++;return true;},
   releaseLock:()=>{locks.held=false;}
  })},
  JSON,Array,String,Number,Object,Set,Error
 });
 vm.runInContext(serverSource,ctx,{timeout:1000});
 return {ctx,props,locks};
}
function client(srv){
 const dom=new Map(IDs.map(id=>[id,{value:'',disabled:id==='save',textContent:'',handlers:{},
  addEventListener(type,listener){this.handlers[type]=listener;}}]));
 const calls=[];
 let success=()=>{},failure=()=>{};
 const api={
  withSuccessHandler(cb){success=cb;return api;},
  withFailureHandler(cb){failure=cb;return api;},
  adminGetSandboxConfig(){calls.push('get');try{success(srv.ctx.adminGetSandboxConfig());}catch(e){failure(e);}},
  adminSaveSandboxConfig(config,rev){calls.push('save');try{success(srv.ctx.adminSaveSandboxConfig(config,rev));}catch(e){failure(e);}},
  adminValidateSandboxConfig(config){calls.push('check');try{success(srv.ctx.adminValidateSandboxConfig(config));}catch(e){failure(e);}},
  adminRunSandboxSelfTest(){calls.push('selftest');try{success(srv.ctx.adminRunSandboxSelfTest());}catch(e){failure(e);}}
 };
 const ctx=vm.createContext({document:{getElementById:id=>dom.get(id)},google:{script:{run:api}},JSON,String,Number,Error});
 vm.runInContext(clientSource,ctx,{timeout:1000});
 return {el:id=>dom.get(id),calls,click:id=>{const e=dom.get(id);assert.equal(e.disabled,false,'Disabled: '+id);e.handlers.click();}};
}
test('AdminConsole browser script loads synthetic settings from the actual server handlers',()=>{
 const s=server(),ui=client(s);
 assert.deepEqual(ui.calls,['get']);
 assert.match(ui.el('title').value,/測試/);
 assert.match(ui.el('questions').value,/test_q1/);
 assert.match(ui.el('slots').value,/test_slot_1/);
 assert.equal(ui.el('revision').textContent,'0');
 assert.equal(ui.el('save').disabled,false);
 assert.equal(s.props.size,0,'Reading must not persist anything');
});
test('Edit > save > server readback > independent browser reload uses only isolated property',()=>{
 const s=server(),ui=client(s);
 ui.el('title').value='〔測試〕可編輯研究名稱';
 ui.el('intro').value='〔測試〕研究介紹修訂';
 ui.click('save');
 assert.deepEqual(ui.calls,['get','save']);
 assert.equal(ui.el('revision').textContent,'1');
 assert.equal(s.props.size,1);
 assert.ok(s.props.has('STUDY1_SANDBOX_ADMIN_CONFIG_V1'));
 assert.match(ui.el('status').textContent,/已載入隔離測試資料/);
 const second=client(s);
 assert.equal(second.el('title').value,'〔測試〕可編輯研究名稱');
 assert.equal(second.el('intro').value,'〔測試〕研究介紹修訂');
 assert.equal(second.el('revision').textContent,'1');
 assert.equal(s.locks.held,false);
});
test('Concurrent stale edit fails before any property change; reload recovers revision',()=>{
 const s=server(),first=client(s),stale=client(s);
 first.el('title').value='〔測試〕較新資料';
 first.click('save');
 const saved=s.props.get('STUDY1_SANDBOX_ADMIN_CONFIG_V1');
 stale.el('title').value='〔測試〕不應覆寫的新內容';
 stale.click('save');
 assert.equal(s.props.get('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),saved);
 assert.equal(stale.el('save').disabled,true);
 assert.match(stale.el('status').textContent,/其他工作更新/);
 stale.click('reload');
 assert.equal(stale.el('title').value,'〔測試〕較新資料');
 assert.equal(stale.el('revision').textContent,'1');
 assert.equal(stale.el('save').disabled,false);
});
test('Non-owner execution context cannot render editable admin settings or write data',()=>{
 const s=server('','not-the-owner@example.com'),ui=client(s);
 assert.deepEqual(ui.calls,['get']);
 assert.equal(ui.el('save').disabled,true);
 assert.match(ui.el('status').textContent,/拒絕存取/);
 assert.equal(s.props.size,0);
 assert.equal(s.locks.count,0);
});
test('Invalid editor JSON fails before invoking backend and does not mutate settings',()=>{
 const s=server(),ui=client(s);
 ui.el('questions').value='[invalid JSON';
 ui.click('save');
 assert.deepEqual(ui.calls,['get']);
 assert.equal(s.props.size,0);
 assert.match(ui.el('status').textContent,/格式/);
});

function routeHarness(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const h=server(active,effective),htmlCalls=[];
 const html={createHtmlOutputFromFile:name=>{
  htmlCalls.push(name);
  return {name,setTitle(){return this},addMetaTag(){return this}};
 }};
 h.ctx.HtmlService=html;
 const source=fs.readFileSync(path.join(__dirname,'../gas/Website.js'),'utf8');
 vm.runInContext(source,h.ctx,{timeout:1000});
 return {...h,htmlCalls};
}
test('Actual Website doGet admin route checks identity before rendering AdminConsole',()=>{
 const h=routeHarness();
 const rendered=h.ctx.doGet({parameter:{view:'admin'}});
 assert.equal(rendered.name,'AdminConsole');
 assert.deepEqual(h.htmlCalls,['AdminConsole']);
 assert.equal(h.props.size,0);
});
test('Non-owner execution context stops admin route before HTML is served; public route stays CLOSED',()=>{
 const h=routeHarness('','not-the-owner@example.com');
 assert.throws(()=>h.ctx.doGet({parameter:{view:'admin'}}),/拒絕存取/);
 assert.deepEqual(h.htmlCalls,[]);
 const publicPage=h.ctx.doGet({parameter:{view:'home'}});
 assert.equal(publicPage.name,'Index');
 assert.equal(h.ctx.getPublicConfig().open,false);
 assert.equal(h.ctx.getPublicConfig().consentReady,false);
 assert.equal(h.props.size,0);
});

test('Redacted active email cannot open admin HTML or call its RPCs even if deployer is owner',()=>{
 const h=routeHarness('', 'solac.tw@gmail.com');
 assert.throws(()=>h.ctx.doGet({parameter:{view:'admin'}}),/拒絕存取/);
 assert.deepEqual(h.htmlCalls,[]);
 const ui=client(h);
 assert.equal(ui.el('save').disabled,true);
 assert.match(ui.el('status').textContent,/拒絕存取/);
 assert.equal(h.props.size,0);
});

test('Owner can check unsaved editor changes through real server validation without persistence',()=>{
 const s=server(),ui=client(s);
 ui.el('title').value='〔測試〕僅驗證';
 ui.click('check');
 assert.deepEqual(ui.calls,['get','check']);
 assert.match(ui.el('status').textContent,/檢查通過.*尚未儲存/);
 assert.equal(ui.el('save').disabled,false);
 assert.equal(ui.el('revision').textContent,'0');
 assert.equal(s.props.size,0);
 ui.el('slots').value='[{"id":"test_slot_1","start":"2027-02-30T10:00","location":"測試","capacity":2}]';
 ui.click('check');
 assert.deepEqual(ui.calls,['get','check','check']);
 assert.match(ui.el('status').textContent,/檢查未通過.*時段格式錯誤/);
 assert.equal(ui.el('save').disabled,false);
 assert.equal(s.props.size,0);
});
test('Non-owner cannot use the new unsaved validation RPC',()=>{
 const s=server('visitor@example.com','solac.tw@gmail.com');
 const draft={studyTitle:'〔測試〕非法請求'};
 assert.throws(()=>s.ctx.adminValidateSandboxConfig(draft),/拒絕存取/);
 assert.equal(s.props.size,0);
});

test('Structured slot editor loads existing fixture, edits it and saves through actual owner-gated GAS RPC',()=>{
 const srv=server(),ui=client(srv);
 assert.equal(ui.el('slotStart').value,'2027-01-01T10:00');
 assert.equal(ui.el('slotLocation').value,'〔測試〕研究室 A');
 assert.equal(ui.el('slotCapacity').value,'2');
 ui.el('slotStart').value='2027-03-12T14:30';
 ui.el('slotLocation').value='〔測試〕研究室 B';
 ui.el('slotCapacity').value='5';
 ui.click('slotApply');
 assert.equal(srv.props.size,0,'Applying a draft must not write properties');
 assert.equal(JSON.parse(ui.el('slots').value)[0].capacity,5);
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查通過/);
 assert.equal(srv.props.size,0);
 ui.click('save');
 assert.equal(srv.props.size,1);
 const fresh=client(srv);
 assert.equal(fresh.el('slotStart').value,'2027-03-12T14:30');
 assert.equal(fresh.el('slotLocation').value,'〔測試〕研究室 B');
 assert.equal(fresh.el('slotCapacity').value,'5');
});
test('Structured slot editor adds and removes only synthetic draft rows without writing to live Sheets',()=>{
 const srv=server(),ui=client(srv);
 ui.el('slotStart').value='2027-04-01T09:15';
 ui.el('slotLocation').value='〔測試〕研究室 C';
 ui.el('slotCapacity').value='3';
 ui.click('slotAdd');
 assert.equal(JSON.parse(ui.el('slots').value).length,2);
 assert.equal(JSON.parse(ui.el('slots').value)[1].id,'test_slot_2');
 assert.equal(ui.el('slotNumber').value,'2');
 assert.equal(srv.props.size,0);
 ui.click('slotRemove');
 assert.equal(JSON.parse(ui.el('slots').value).length,1);
 assert.equal(ui.el('slotNumber').value,'1');
 assert.equal(srv.props.size,0);
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查通過/);
});
test('Slot editor refuses malformed drafts and server rejects impossible dates',()=>{
 const srv=server(),ui=client(srv),original=ui.el('slots').value;
 ui.el('slotCapacity').value='0';
 ui.click('slotApply');
 assert.equal(ui.el('slots').value,original);
 assert.match(ui.el('status').textContent,/未套用/);
 ui.el('slotCapacity').value='2';
 ui.el('slotStart').value='2027-02-30T10:00';
 ui.click('slotApply');
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查未通過/);
 assert.equal(srv.props.size,0);
});
test('Redacted active identity disables structured slot controls before any RPC write',()=>{
 const srv=server('','solac.tw@gmail.com'),ui=client(srv);
 for(const id of ['save','check','slotLoad','slotApply','slotAdd','slotRemove'])assert.equal(ui.el(id).disabled,true,id);
 assert.equal(ui.el('reload').disabled,false);
 assert.equal(srv.props.size,0);
});

test('Owner-only browser self-test invokes actual GAS handler and shows PASS only after cleanup',()=>{
 const s=server(),ui=client(s);
 ui.click('selftest');
 assert.deepEqual(ui.calls,['get','selftest']);
 assert.match(ui.el('selftestResult').textContent,/PASS（GAS 真實執行）/);
 assert.match(ui.el('selftestResult').textContent,/暫存測試資料已清理/);
 assert.equal(s.props.size,0);
});
test('Browser self-test with non-owner is blocked; no PASS and no property writes',()=>{
 const s=server('visitor@example.com','solac.tw@gmail.com'),ui=client(s);
 assert.equal(ui.el('selftest').disabled,true);
 assert.equal(s.props.size,0);
});

test('Structured question editor modifies a synthetic eligibility question and saves through owner-only GAS RPC',()=>{
 const srv=server(),ui=client(srv);
 assert.match(ui.el('questionText').value,/測試題/);
 assert.equal(ui.el('questionRequired').checked,true);
 ui.el('questionText').value='〔測試〕新的資格說明問題？';
 ui.el('questionRequired').checked=false;
 ui.click('questionApply');
 assert.equal(srv.props.size,0);
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查通過/);
 ui.click('save');
 assert.equal(srv.props.size,1);
 const next=client(srv);
 assert.equal(next.el('questionText').value,'〔測試〕新的資格說明問題？');
 assert.equal(next.el('questionRequired').checked,false);
 assert.equal(next.el('revision').textContent,'1');
});
test('Question editor can add and remove a synthetic question without touching live research',()=>{
 const srv=server(),ui=client(srv);
 ui.el('questionText').value='〔測試〕第二題';
 ui.el('questionRequired').checked=true;
 ui.click('questionAdd');
 const added=JSON.parse(ui.el('questions').value);
 assert.equal(added.length,2);
 assert.equal(added[1].id,'test_q2');
 assert.equal(added[1].required,true);
 assert.equal(srv.props.size,0);
 ui.click('questionRemove');
 assert.equal(JSON.parse(ui.el('questions').value).length,1);
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查通過/);
 assert.equal(srv.props.size,0);
});
test('Question editor rejects HTML and empty questions before mutation; non-owner controls stay disabled',()=>{
 const srv=server(),ui=client(srv),original=ui.el('questions').value;
 ui.el('questionText').value='<script>alert(1)</script>';
 ui.click('questionApply');
 assert.equal(ui.el('questions').value,original);
 assert.match(ui.el('status').textContent,/未套用/);
 ui.el('questionText').value='  ';
 ui.click('questionAdd');
 assert.equal(ui.el('questions').value,original);
 assert.equal(srv.props.size,0);
 const blocked=client(server('','solac.tw@gmail.com'));
 for(const id of ['questionLoad','questionApply','questionAdd','questionRemove'])assert.equal(blocked.el(id).disabled,true,id);
});
