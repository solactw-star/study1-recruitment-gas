'use strict';
// End-to-end-shaped sandbox contract: real AdminConsole inline JS + real AdminSandbox
// functions with an in-memory GAS adapter. No live Google account or research data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const serverSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const clientHTML=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const scripts=[...clientHTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('Expected exactly one inline admin client script');
const clientSource=scripts[0][1];
const IDs=['title','intro','eligibility','questions','slots','template','pdf','revision','save','check','reload','status'];
function server(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const props=new Map(),locks={held:false,count:0};
 const store={getProperty:key=>props.get(key)||null,setProperty:(key,v)=>{
  assert.equal(key,'STUDY1_SANDBOX_ADMIN_CONFIG_V1','Must not change live properties');
  props.set(key,v);
 }};
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
  adminValidateSandboxConfig(config){calls.push('check');try{success(srv.ctx.adminValidateSandboxConfig(config));}catch(e){failure(e);}}
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
