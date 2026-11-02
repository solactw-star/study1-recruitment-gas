'use strict';
// End-to-end-shaped sandbox contract: real AdminConsole inline JS + real AdminSandbox
// functions with an in-memory GAS adapter. No live Google account or research data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const serverSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const clientHTML=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const scripts=[...clientHTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('Expected exactly one inline admin client script');
const clientSource=scripts[0][1];
const IDs=['title','intro','eligibility','questions','slots','template','pdf','revision','save','reload','status'];
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
  adminSaveSandboxConfig(config,rev){calls.push('save');try{success(srv.ctx.adminSaveSandboxConfig(config,rev));}catch(e){failure(e);}}
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
test('Anonymous caller cannot render editable admin settings or write data',()=>{
 const s=server(''),ui=client(s);
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
