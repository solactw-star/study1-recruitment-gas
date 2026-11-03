'use strict';
// End-to-end-shaped sandbox contract: real AdminConsole inline JS + real AdminSandbox
// functions with an in-memory GAS adapter. No live Google account or research data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const serverSource=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
const clientHTML=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
const scripts=[...clientHTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1)throw Error('Expected exactly one inline admin client script');
const clientSource=scripts[0][1];
const IDs=['title','intro','eligibility','questions','slots','template','pdf','revision','save','check','reload','status','slotNumber','slotLoad','slotStart','slotLocation','slotCapacity','slotApply','slotAdd','slotRemove','selftest','selftestResult','questionNumber','questionLoad','questionText','questionRequired','questionApply','questionAdd','questionRemove','exportConfig','importConfig','portableJson','bookingRefresh','bookingList','bookingCapacity','bookingCapacityTable','bookingTable','bookingFilterStatus','bookingFilterSlot','bookingFilterCode','bookingFilterSummary','bookingFeedback','bookingExisting','bookingCode','bookingSlotId','bookingRequest','bookingCreate','bookingMove','bookingCancel'];
function server(active='solac.tw@gmail.com',effective='solac.tw@gmail.com',defaultClosed=true){
 const props=new Map(),locks={held:false,count:0};
 const store={getProperty:key=>props.has(key)?props.get(key):(defaultClosed&&['OPEN','CONSENT_READY'].includes(key)?'false':null),setProperty:(key,v)=>{
  assert.ok(['STUDY1_SANDBOX_ADMIN_CONFIG_V1','STUDY1_SANDBOX_SELFTEST_V1','STUDY1_SANDBOX_BOOKINGS_V1'].includes(key),'Only isolated properties');
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
function client(srv,options={}){
 const dom=new Map(IDs.map(id=>[id,{value:'',disabled:id==='save',textContent:'',className:'',children:[],handlers:{},
  replaceChildren(...nodes){this.children=nodes;},
  addEventListener(type,listener){this.handlers[type]=listener;}}]));
 const calls=[];
 let success=()=>{},failure=()=>{};
 const api={
  withSuccessHandler(cb){success=cb;return api;},
  withFailureHandler(cb){failure=cb;return api;},
  adminGetSandboxConfig(){calls.push('get');let response;
   try{response=options.configReply?options.configReply():srv.ctx.adminGetSandboxConfig();}
   catch(e){failure(e);return;}
   // Browser success callback exceptions do not become GAS failure callbacks.
   success(response);
  },
  adminSaveSandboxConfig(config,rev){calls.push('save');try{success(srv.ctx.adminSaveSandboxConfig(config,rev));}catch(e){failure(e);}},
  adminValidateSandboxConfig(config){calls.push('check');let response;
   try{response=options.validateReply?options.validateReply(config):srv.ctx.adminValidateSandboxConfig(config);}
   catch(e){failure(e);return;}
   success(response);
  },
  adminRunSandboxSelfTest(){calls.push('selftest');try{success(srv.ctx.adminRunSandboxSelfTest());}catch(e){failure(e);}},
  adminGetTestBookings(){calls.push('booking-read');try{success(srv.ctx.adminGetTestBookings());}catch(e){failure(e);}},
  adminChangeTestBooking(data){calls.push('booking-write');try{success(srv.ctx.adminChangeTestBooking(data));}catch(e){failure(e);}}
 };
 const confirms=[];
 const ctx=vm.createContext({document:{getElementById:id=>dom.get(id),createElement:tag=>({tagName:tag,value:'',textContent:'',className:'',disabled:false,children:[],handlers:{},replaceChildren(...nodes){this.children=nodes;},addEventListener(type,listener){this.handlers[type]=listener;}})},window:{confirm:message=>{confirms.push(message);return true}},google:{script:{run:api}},JSON,String,Number,Error,Date,Math});
 vm.runInContext(clientSource,ctx,{timeout:1000});
 return {el:id=>dom.get(id),calls,confirms,change:id=>{const e=dom.get(id);e.handlers.change();},input:id=>{const e=dom.get(id);e.handlers.input();},click:id=>{const e=dom.get(id);assert.equal(e.disabled,false,'Disabled: '+id);e.handlers.click();}};
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
test('Malformed GAS settings success payload invalidates stale revision, blocks saves and allows reload recovery',()=>{
 const s=server();let bad=false;
 const ui=client(s,{configReply:()=>bad?
  {mode:'SANDBOX_ONLY',open:false,consentReady:false,config:null}:
  s.ctx.adminGetSandboxConfig()});
 assert.equal(ui.el('save').disabled,false);
 assert.equal(ui.el('revision').textContent,'0');
 bad=true;ui.click('reload');
 assert.equal(ui.el('save').disabled,true);
 assert.equal(ui.el('exportConfig').disabled,true);
 assert.equal(ui.el('reload').disabled,false);
 assert.equal(ui.el('revision').textContent,'—');
 assert.match(ui.el('status').textContent,/回傳無效/);
 assert.equal(s.props.size,0,'Malformed reply must not persist any settings');
 bad=false;ui.click('reload');
 assert.equal(ui.el('save').disabled,false);
 assert.equal(ui.el('revision').textContent,'0');
 assert.match(ui.el('status').textContent,/已載入隔離測試資料/);
});
test('Malformed nested GAS settings cannot enable stale saves; a fresh verified reload recovers',()=>{
  const s=server();let invalid=0;
  const ui=client(s,{configReply:()=>{
    const response=s.ctx.adminGetSandboxConfig();
    if(invalid===1)response.config.screeningQuestions=[null];
    if(invalid===2)response.config.testSlots=[{id:'test_slot_1',start:'2027-01-01T10:00',location:'〔測試〕研究室 A',capacity:'2'}];
    return response;
  }});
  for(const variant of [1,2]){
    invalid=variant;ui.click('reload');
    assert.equal(ui.el('save').disabled,true,'Nested invalid response must block writes');
    assert.equal(ui.el('exportConfig').disabled,true);
    assert.equal(ui.el('reload').disabled,false);
    assert.equal(ui.el('revision').textContent,'—');
    assert.match(ui.el('status').textContent,/回傳無效/);
    assert.equal(s.props.size,0);
    invalid=0;ui.click('reload');
    assert.equal(ui.el('save').disabled,false,'Verified reload restores editing');
    assert.equal(ui.el('revision').textContent,'0');
  }
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
 const s=server();s.props.set('OPEN','false');s.props.set('CONSENT_READY','false');
 const ui=client(s);
 ui.click('selftest');
 assert.deepEqual(ui.calls,['get','selftest']);
 assert.match(ui.el('selftestResult').textContent,/PASS（GAS 真實執行）/);
 assert.match(ui.el('selftestResult').textContent,/暫存測試資料已清理/);
 assert.match(ui.el('selftestResult').textContent,/清理後再度核實/);
 assert.match(ui.el('selftestResult').textContent,/隔離預約交易驗證/);
 assert.match(ui.el('selftestResult').textContent,/建立虛構預約/);
 assert.match(ui.el('selftestResult').textContent,/取消後容量回復/);
 assert.equal(s.props.size,2);
 assert.equal(s.props.get('OPEN'),'false');
 assert.equal(s.props.get('CONSENT_READY'),'false');
});
test('Browser self-test is disabled when closed flags are not confirmed; never claims live PASS',()=>{
 const s=server('solac.tw@gmail.com','solac.tw@gmail.com',false),ui=client(s);
 assert.deepEqual(ui.calls,['get']);
 assert.equal(ui.el('selftest').disabled,true);
 assert.match(ui.el('status').textContent,/關閉旗標/);
 assert.doesNotMatch(ui.el('selftestResult').textContent,/PASS/);
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

test('Owner may export saved sandbox configuration to portable JSON without any write',()=>{
 const srv=server(),ui=client(srv);
 ui.el('title').value='〔測試〕未儲存草稿';
 ui.click('exportConfig');
 const pack=JSON.parse(ui.el('portableJson').value);
 assert.equal(pack.format,'STUDY1_SANDBOX_EXPORT_V1');
 assert.equal(pack.config.studyTitle,'〔測試〕Study 1 招募設定');
 assert.equal(Object.hasOwn(pack.config,'revision'),false);
 assert.equal(Object.hasOwn(pack.config,'OPEN'),false);
 assert.equal(srv.props.size,0);
});
test('Valid portable JSON imports only into draft after backend validation and requires explicit save',()=>{
 const srv=server(),ui=client(srv);
 ui.click('exportConfig');
 const pack=JSON.parse(ui.el('portableJson').value);
 pack.config.studyTitle='〔測試〕從備份匯入';
 ui.el('portableJson').value=JSON.stringify(pack);
 ui.click('importConfig');
 assert.deepEqual(ui.calls,['get','check']);
 assert.equal(ui.el('title').value,'〔測試〕從備份匯入');
 assert.equal(ui.el('revision').textContent,'0');
 assert.equal(srv.props.size,0);
 ui.click('save');
 assert.equal(srv.props.size,1);
 assert.equal(client(srv).el('title').value,'〔測試〕從備份匯入');
});
test('Portable import rejects live flags and malformed JSON before RPC or property write',()=>{
 const srv=server(),ui=client(srv),original=ui.el('title').value;
 ui.el('portableJson').value='{"format":"STUDY1_SANDBOX_EXPORT_V1","config":{"OPEN":true}}';
 ui.click('importConfig');
 assert.deepEqual(ui.calls,['get']);
 assert.equal(ui.el('title').value,original);
 ui.el('portableJson').value='not JSON';
 ui.click('importConfig');
 assert.deepEqual(ui.calls,['get']);
 assert.equal(srv.props.size,0);
});
test('Portable import server rejects malicious test slot dates without changing the draft',()=>{
 const srv=server(),ui=client(srv),original=ui.el('slots').value;
 ui.click('exportConfig');
 const pack=JSON.parse(ui.el('portableJson').value);
 pack.config.testSlots[0].start='2027-02-30T10:00';
 ui.el('portableJson').value=JSON.stringify(pack);
 ui.click('importConfig');
 assert.deepEqual(ui.calls,['get','check']);
 assert.equal(ui.el('slots').value,original);
 assert.match(ui.el('status').textContent,/遭伺服器拒絕/);
 assert.equal(srv.props.size,0);
});
test('Non-owner cannot export or import sandbox configuration',()=>{
 const ui=client(server('visitor@example.com','solac.tw@gmail.com'));
 assert.equal(ui.el('exportConfig').disabled,true);
 assert.equal(ui.el('importConfig').disabled,true);
});

test('Admin owner can query isolated test bookings through real page RPC',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');const ui=client(srv);
 ui.click('bookingRefresh');
 assert.deepEqual(ui.calls,['get','booking-read']);
 assert.match(ui.el('bookingList').textContent,/test_slot_1/);
 assert.match(ui.el('bookingList').textContent,/剩餘 2/);
 assert.equal(srv.props.size,2);
});
test('Booking UI creates, reads and cancels TST-only record without formal data',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');const ui=client(srv);
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCode').value,'TST-001');
 assert.equal(ui.el('bookingSlotId').value,'test_slot_1');
 ui.click('bookingCreate');
 assert.match(ui.el('bookingList').textContent,/TST-001/);
 assert.equal(srv.props.size,3);
 assert.equal(ui.el('bookingExisting').value,'TST-001');
 ui.click('bookingCancel');
 assert.match(ui.el('bookingList').textContent,/已取消/);
 assert.equal(JSON.parse(srv.props.get('STUDY1_SANDBOX_BOOKINGS_V1')).bookings[0].status,'CANCELLED');
});
test('Anonymous user sees disabled sandbox booking controls and cannot call server RPC',()=>{
 const srv=server('visitor@example.com','solac.tw@gmail.com'),ui=client(srv);
 for(const k of ['bookingRefresh','bookingCreate','bookingMove','bookingCancel'])
   assert.equal(ui.el(k).disabled,true);
 assert.throws(()=>srv.ctx.adminGetTestBookings(),/拒絕存取/);
 assert.equal(srv.props.size,0);
});

test('Booking interface shows capacity cards and selects available slots without entering IDs',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);ui.click('bookingRefresh');
 assert.equal(ui.el('bookingSlotId').children.length,1);
 assert.match(ui.el('bookingSlotId').children[0].textContent,/剩 2\/2/);
 assert.equal(ui.el('bookingCapacity').children.length,1);
 assert.match(ui.el('bookingCapacity').children[0].textContent,/已預約 0 \/ 2/);
 assert.equal(ui.el('bookingCode').value,'TST-001');
 assert.equal(ui.el('bookingMove').disabled,true);
 assert.equal(ui.el('bookingCancel').disabled,true);
});
test('Researcher action requests visible confirmation before any isolated booking RPC',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);ui.click('bookingRefresh');ui.click('bookingCreate');
 assert.equal(ui.confirms.length,1);
 assert.match(ui.confirms[0],/建立 TST-001/);
 assert.deepEqual(ui.calls,['get','booking-read','booking-write']);
 assert.equal(ui.el('bookingCode').value,'TST-002');
 assert.equal(ui.el('bookingExisting').value,'TST-001');
 assert.equal(ui.el('bookingRequest').value,'');
});
test('Capacity cards update and create disables when synthetic slot is full',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);ui.click('bookingRefresh');
 ui.click('bookingCreate');ui.click('bookingCreate');
 assert.equal(ui.el('bookingCreate').disabled,true);
 assert.match(ui.el('bookingCapacity').children[0].textContent,/已額滿/);
 assert.equal(ui.el('bookingCapacity').children[0].className,'slot-card full');
 assert.equal(ui.el('bookingExisting').children.length,2);
});
test('Selecting a test reservation controls move and cancel availability',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);ui.click('bookingRefresh');ui.click('bookingCreate');
 assert.equal(ui.el('bookingCancel').disabled,false);
 assert.equal(ui.el('bookingMove').disabled,true);
 ui.click('bookingCancel');
 assert.equal(ui.el('bookingCancel').disabled,true);
 assert.equal(ui.el('bookingExisting').children.length,0);
 assert.match(ui.el('bookingList').textContent,/已取消/);
});
test('Booking UI does not use user PII, rendered HTML injection or exposed idempotency editor',()=>{
 const h=fs.readFileSync(path.join(__dirname,'../gas/AdminConsole.html'),'utf8');
 assert.match(h,/id="bookingRequest" type="hidden"/);
 assert.match(h,/readonly autocomplete="off"/);
 assert.doesNotMatch(h,/\.innerHTML\s*=/);
 assert.match(h,/window\.confirm/);
});

function rowsOf(ui,id){
 const root=ui.el(id),table=root.children[0];
 if(!table||table.tagName!=='table')return [];
 return table.children[1].children;
}
test('Capacity table shows each slot with booked, remaining, and a grounded status',()=>{
 const s=server();s.props.set('OPEN','false');s.props.set('CONSENT_READY','false');
 const ui=client(s);ui.click('bookingRefresh');
 const rows=rowsOf(ui,'bookingCapacityTable');
 assert.equal(rows.length,1);
 assert.equal(rows[0].children[2].textContent,'0 / 2');
 assert.equal(rows[0].children[3].textContent,'2');
 assert.equal(rows[0].children[4].textContent,'尚有名額');
 ui.click('bookingCreate');ui.click('bookingCreate');
 const full=rowsOf(ui,'bookingCapacityTable');
 assert.equal(full[0].children[2].textContent,'2 / 2');
 assert.equal(full[0].children[4].textContent,'額滿');
});
test('Booking table filters by status and test code without GAS writes',()=>{
 const s=server();s.props.set('OPEN','false');s.props.set('CONSENT_READY','false');
 const ui=client(s);ui.click('bookingRefresh');ui.click('bookingCreate');ui.click('bookingCreate');ui.click('bookingCancel');
 const before=ui.calls.length,rev=JSON.parse(s.props.get('STUDY1_SANDBOX_BOOKINGS_V1')).revision;
 assert.equal(rowsOf(ui,'bookingTable').length,2);
 ui.el('bookingFilterStatus').value='ACTIVE';ui.change('bookingFilterStatus');
 assert.equal(rowsOf(ui,'bookingTable').length,1);
 assert.equal(rowsOf(ui,'bookingTable')[0].children[2].textContent,'有效');
 ui.el('bookingFilterStatus').value='CANCELLED';ui.change('bookingFilterStatus');
 assert.equal(rowsOf(ui,'bookingTable').length,1);
 assert.equal(rowsOf(ui,'bookingTable')[0].children[2].textContent,'已取消');
 ui.el('bookingFilterStatus').value='ALL';ui.change('bookingFilterStatus');
 ui.el('bookingFilterCode').value='TST-002';ui.input('bookingFilterCode');
 assert.equal(rowsOf(ui,'bookingTable').length,1);
 assert.equal(rowsOf(ui,'bookingTable')[0].children[0].textContent,'TST-002');
 assert.equal(ui.calls.length,before);
 assert.equal(JSON.parse(s.props.get('STUDY1_SANDBOX_BOOKINGS_V1')).revision,rev);
});
test('Row select chooses an existing synthetic booking without requiring manual code',()=>{
 const s=server();s.props.set('OPEN','false');s.props.set('CONSENT_READY','false');
 const ui=client(s);ui.click('bookingRefresh');ui.click('bookingCreate');ui.click('bookingCreate');
 assert.equal(ui.el('bookingExisting').value,'TST-001');
 const action=rowsOf(ui,'bookingTable')[1].children[3].children[0];
 assert.equal(action.textContent,'選取操作');
 action.handlers.click();
 assert.equal(ui.el('bookingExisting').value,'TST-002');
 assert.equal(ui.el('bookingCancel').disabled,false);
 assert.match(ui.el('bookingFeedback').textContent,/已選取 TST-002/);
});
test('No matching test bookings gives accessible empty state and preserves CLOSED mode',()=>{
 const s=server();s.props.set('OPEN','false');s.props.set('CONSENT_READY','false');
 const ui=client(s);ui.click('bookingRefresh');
 assert.match(ui.el('bookingTable').children[0].textContent,/目前沒有任何隔離測試預約/);
 ui.click('bookingCreate');
 ui.el('bookingFilterCode').value='TST-999';ui.input('bookingFilterCode');
 assert.match(ui.el('bookingTable').children[0].textContent,/沒有符合篩選條件/);
 assert.match(ui.el('bookingFilterSummary').textContent,/顯示 0 \/ 1/);
 assert.equal(s.props.get('OPEN'),'false');
 assert.equal(s.props.get('CONSENT_READY'),'false');
});
test('Unauthenticated session cannot use booking table filters or read data',()=>{
 const s=server('visitor@example.com','solac.tw@gmail.com'),ui=client(s);
 for(const id of ['bookingFilterStatus','bookingFilterSlot','bookingFilterCode'])
   assert.equal(ui.el(id).disabled,true);
 assert.equal(s.props.size,0);
});
test('Malformed successful booking reply fails closed, reports the problem and permits safe re-read',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCreate').disabled,false);
 const originalRead=srv.ctx.adminGetTestBookings;
 srv.ctx.adminGetTestBookings=()=>({mode:'SANDBOX_ONLY',open:false,consentReady:false,
  revision:'corrupt-revision',slots:[],bookings:[]});
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingRefresh').disabled,false);
 assert.equal(ui.el('bookingCreate').disabled,true);
 assert.equal(ui.el('bookingMove').disabled,true);
 assert.equal(ui.el('bookingCancel').disabled,true);
 assert.match(ui.el('bookingFeedback').textContent,/回傳格式錯誤/);
 assert.match(ui.el('bookingList').textContent,/未取得有效/);
 assert.equal(ui.el('bookingTable').children.length,0);
 assert.equal(ui.el('bookingCapacityTable').children.length,0);
 assert.equal(srv.props.size,2,'Invalid reply must never write GAS properties');
 srv.ctx.adminGetTestBookings=originalRead;
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCreate').disabled,false,'Real readback must recover the UI');
 assert.match(ui.el('bookingList').textContent,/test_slot_1/);
});


test('Malformed nested booking RPC payloads fail closed without stranding the refresh UI',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);
 const originalRead=srv.ctx.adminGetTestBookings;
 const badReplies=[
  {revision:0,slots:[null],bookings:[]},
  {revision:0,slots:[{id:'test_slot_1',start:'2027-01-01T10:00',location:'A',
    capacity:2,booked:0,remaining:'2',overCapacity:false}],bookings:[]},
  {revision:0,slots:[],bookings:[null]},
  {revision:0,slots:[],bookings:[{code:'TST-001',slotId:'test_slot_1',status:'UNKNOWN'}]}
 ];
 for(const bad of badReplies){
  ui.click('bookingRefresh');
  assert.equal(ui.el('bookingCreate').disabled,false);
  srv.ctx.adminGetTestBookings=()=>({mode:'SANDBOX_ONLY',open:false,consentReady:false,...bad});
  ui.click('bookingRefresh');
  assert.equal(ui.el('bookingRefresh').disabled,false,'Owner must be able to recover');
  for(const id of ['bookingCreate','bookingMove','bookingCancel'])
    assert.equal(ui.el(id).disabled,true,id+' must be fail-closed');
  assert.match(ui.el('bookingFeedback').textContent,/回傳格式錯誤/);
  assert.equal(ui.el('bookingTable').children.length,0);
  assert.equal(ui.el('bookingCapacity').children.length,0);
  assert.equal(srv.props.size,2,'Malformed replies must not mutate GAS state');
  srv.ctx.adminGetTestBookings=originalRead;
 }
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCreate').disabled,false);
});
test('Failed booking refresh invalidates stale capacity and revision while allowing retry',()=>{
 const srv=server();srv.props.set('OPEN','false');srv.props.set('CONSENT_READY','false');
 const ui=client(srv);
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCreate').disabled,false);
 const originalRead=srv.ctx.adminGetTestBookings;
 srv.ctx.adminGetTestBookings=()=>{throw Error('SIMULATED_READ_UNAVAILABLE');};
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingRefresh').disabled,false,'Owner can retry a failed read');
 for(const id of ['bookingCreate','bookingMove','bookingCancel'])
   assert.equal(ui.el(id).disabled,true,id+' cannot use stale revision or capacity');
 assert.match(ui.el('bookingFeedback').textContent,/SIMULATED_READ_UNAVAILABLE/);
 assert.match(ui.el('bookingFeedback').textContent,/停用舊預約操作/);
 assert.match(ui.el('bookingList').textContent,/未取得有效/);
 assert.equal(ui.el('bookingTable').children.length,0);
 assert.equal(ui.el('bookingCapacityTable').children.length,0);
 assert.equal(srv.props.size,2,'Failure must not write any GAS properties');
 srv.ctx.adminGetTestBookings=originalRead;
 ui.click('bookingRefresh');
 assert.equal(ui.el('bookingCreate').disabled,false,'Fresh successful read restores controls');
 assert.match(ui.el('bookingList').textContent,/test_slot_1/);
});
test('Malformed GAS draft-check success reply never claims validated and disables stale save',()=>{
 const s=server();
 let invalid=true;
 const ui=client(s,{validateReply:draft=>invalid?
  {mode:'SANDBOX_ONLY',open:false,consentReady:false,config:null}:
  s.ctx.adminValidateSandboxConfig(draft)});
 assert.equal(ui.el('save').disabled,false);
 ui.el('title').value='〔測試〕不接受虛假驗證回覆';
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查未通過/);
 assert.doesNotMatch(ui.el('status').textContent,/檢查通過；變更尚未儲存/);
 assert.equal(ui.el('save').disabled,true);
 assert.equal(ui.el('reload').disabled,false);
 assert.equal(s.props.size,0,'Malformed validation result must not persist data');
 invalid=false;
 ui.click('reload');
 ui.click('check');
 assert.match(ui.el('status').textContent,/檢查通過/);
 assert.equal(ui.el('save').disabled,false);
});
test('Malformed GAS import validation success reply never applies an unverified draft',()=>{
 const s=server(),ui=client(s,{validateReply:()=>({mode:'SANDBOX_ONLY',
  open:false,consentReady:false,config:{studyTitle:'〔測試〕缺少驗證欄位'}})});
 const original=ui.el('title').value;
 ui.click('exportConfig');
 const pack=JSON.parse(ui.el('portableJson').value);
 pack.config.studyTitle='〔測試〕不得匯入';
 ui.el('portableJson').value=JSON.stringify(pack);
 ui.click('importConfig');
 assert.equal(ui.el('title').value,original,'Unverified draft must not be applied');
 assert.match(ui.el('status').textContent,/匯入已拒絕/);
 assert.equal(ui.el('save').disabled,true);
 assert.equal(ui.el('reload').disabled,false);
 assert.equal(s.props.size,0);
 ui.click('reload');
 assert.equal(ui.el('save').disabled,false,'A verified config read restores the UI');
});

test('Owner-only unified participant preview HTML route preserves CLOSED public routing',()=>{
 const s=routeHarness();
 assert.equal(s.ctx.doGet({parameter:{view:'preview'}}).name,'Study1Unified');
 assert.deepEqual(s.htmlCalls,['Study1Unified']);
 assert.equal(s.props.size,0);
 const guest=routeHarness('','solac.tw@gmail.com');
 assert.throws(()=>guest.ctx.doGet({parameter:{view:'preview'}}),/拒絕存取/);
 assert.deepEqual(guest.htmlCalls,[]);
 assert.equal(guest.ctx.doGet({parameter:{view:'home'}}).name,'Index');
});
