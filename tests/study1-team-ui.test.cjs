'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gate=require('../scripts/study1-gas-backend-allowlist.cjs');
const dir=path.join(__dirname,'../gas');
const html=fs.readFileSync(path.join(dir,'Study1Team.html'),'utf8');
const unified=fs.readFileSync(path.join(dir,'Study1Unified.js'),'utf8');
const website=fs.readFileSync(path.join(dir,'Website.js'),'utf8');
const visitor=fs.readFileSync(path.join(dir,'Study1Visitor.html'),'utf8');
const index=fs.readFileSync(path.join(dir,'Index.html'),'utf8');
const sync=fs.readFileSync(path.join(__dirname,'../scripts/study1-gas-auto-index.cjs'),'utf8');
const flow=fs.readFileSync(path.join(__dirname,'../.github/workflows/study1-gas-auto-index.yml'),'utf8');
// Isolated B01 legacy-KPI tests stub the new independently-tested B07 contract;
// real owner-view integration and malicious-summary rejection are tested in
// study1-team-visitor-flow.test.cjs, never in this isolated KPI harness.
const b07Indicator={textContent:''};
const b07Mock=()=>({total:{total:0},byExperiment:{E1:{total:0},E2:{total:0}}});
const b07CountMock=()=>'';
test('Research team gets GUI forms for experiment state, copy, slots, weeks and summaries, not raw JSON',()=>{
 assert.doesNotThrow(()=>gate.assertTeamHtml(html));
 for(const id of ['modeE1','modeE2','saveModes','saveSite','saveResearch','saveSlots','saveWeeks','slotRows','weekRows','entries'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const action of ['ADMIN_RECRUITMENT','ADMIN_RESEARCH','ADMIN_EDIT','ADMIN_SLOTS','ADMIN_E2_WEEKS'])
  assert.match(html,new RegExp("save\\('"+action+"'"));
 assert.match(html,/study1UnifiedPreviewGet\(\)/);
 assert.match(html,/study1UnifiedPreviewCommand\(\{action,payload,requestId:id,expectedRevision:model\.revision\}\)/);
 assert.doesNotMatch(html,/<textarea[^>]*spellcheck="false"|admin.*Json|JSON\.stringify/);
});
test('Team setting cannot open formal intake and E2 remains in 2027',()=>{
 assert.match(html,/實驗二 · 2027/);
 assert.match(html,/E2:\{year:2027,mode:/);
 assert.match(unified,/E2:\{year:2027,mode:'COMING_SOON'\}/);
 assert.match(unified,/\['DEMO_OPEN','COMING_SOON','HIDDEN'\]/);
 assert.match(unified,/function study1UnifiedValidateRecruitment_/);
 assert.match(unified,/action==='ADMIN_RECRUITMENT'/);
 assert.match(unified,/正式.*CLOSED|All \/exec formal intake endpoints remain CLOSED/);
 assert.match(website,/function requestOtp\(\)\{return rejectIntake_\(\);\}/);
 assert.match(website,/function submitConsent\(\)\{return rejectIntake_\(\);\}/);
});
test('Only the authenticated owner can open the visual research-team management route',()=>{
 assert.match(website,/view==='team'\)\{study1AdminOwnerRequired_\(\);study1SandboxBookingFlags_\(\);/);
 assert.match(website,/HtmlService\.createHtmlOutputFromFile\('Study1Team'\)/);
 assert.match(flow,/'gas\/Study1Team\.html'/);
 assert.match(flow,/main-team-after\.html/);
 assert.match(sync,/deployedTeamHtml!==teamHtml/);
 assert.match(sync,/teamHtmlSha256/);
 assert.match(gate.APPROVED_BACKEND.map(x=>x.name).join(' '),/Study1Team/);
});
test('Formal homepage no longer sends participants to private Demo but preserves original owner-only visitor route',()=>{
 assert.doesNotMatch(index,/\/exec\?view=demo/);
 assert.doesNotMatch(index,/id="consent"/);
 assert.doesNotMatch(index,/研究報名及線上知情同意尚未開放|class="notice"/);
 assert.match(index,/id="apply"/);
 assert.match(index,/目前尚未開放報名/);
 assert.match(html,/\/exec\?view=apply/);
 assert.match(visitor,/\/exec" target="_top"/);
 assert.match(visitor,/--ink:#163341;--sea:#1b7d80/);
 assert.match(visitor,/linear-gradient\(115deg,#f0f9f7,#e4f1ed\)/);
 assert.match(visitor,/預計 2027 年 · 尚未開放報名/);
 assert.match(visitor,/id="stateE2"/);
});
test('Team UI rejects network/unsafe scripts or a missing editor',()=>{
 assert.throws(()=>gate.assertTeamHtml(html+'<script src="https://example.org/exfil.js"></script>'),/Research team UI/);
 assert.throws(()=>gate.assertTeamHtml(html.replace('id="saveModes"','id="missing"')),/Research team UI/);
 assert.throws(()=>gate.assertTeamHtml(html+'<iframe src="x"></iframe>'),/Research team UI/);
});
test('B01 clears previously rendered statistics when owner snapshot is rejected or refresh fails',()=>{
 assert.match(html,/function b01Clear\(reason\)\{\$\('b01Cards'\)\.replaceChildren\(\)/);
 assert.match(html,/model=null;b01Clear\('管理權限或研究安全設定無法核實/);
 assert.match(html,/model=null;b01Clear\('資料載入失敗/);
 assert.match(html,/if\(!safe\)\{b01Clear\('資料或安全設定未核實/);
 assert.match(html,/model\.open===false&&model\.consentReady===false/);
});

test('B01 counts only valid pending attendance and never labels application codes as people',()=>{
 assert.match(html,/const unique=new Set\(applications\.map\(a=>a\.id\)\.filter\(id=>typeof id==='string'&&id\.length>0\)\)/);
 assert.match(html,/申請代碼不代表獨立參與者/);
 assert.match(html,/if\(a\.phase==='CANCELLED'\|\|!a\.slotId\)return false/);
 assert.match(html,/if\(!slot\|\|model\.b02\.sessions\[slot\.id\]\?\.status==='CANCELLED'\)return false/);
 assert.match(html,/return !attendance\|\|attendance\.attendance==='PENDING'/);
 assert.match(html,/未完成人工待辦/);
 assert.match(html,/正式研究目標與完成率：未核准，不計算/);
});

test('B01 derived summary reconciles bookings, attendance, progress and anomalies on synthetic snapshots',()=>{
 const vm=require('node:vm');
 const source=html.slice(html.indexOf('function b01Clear('),html.indexOf('\nfunction load(){',html.indexOf('function b01Clear(')));
 assert.ok(source.startsWith('function b01Clear('),'B01 source extraction must succeed');
 const nodes={b01Cards:{children:[],replaceChildren(){this.children=[];},append(node){this.children.push(node);}},b01Status:{textContent:''},b01B07Consistency:{textContent:''}};
 const document={createElement(tag){return {tag,textContent:'',children:[],append(...parts){this.children.push(...parts);}};}};
 const snapshot={
  mode:'TEST',open:false,consentReady:false,formalReadiness:{activationAllowed:false},
  slots:[{id:'S1',when:'2026-11-06 09:00'},{id:'S2',when:'2026-11-06 10:00'},{id:'S3',when:'2026-11-07 09:00'}],
  applications:[
   {id:'A1',experiment:'E1',phase:'CONFIRMED',slotId:'S1'},
   {id:'A2',experiment:'E1',phase:'CONFIRMED',slotId:'S1'},
   {id:'A3',experiment:'E2',phase:'CONFIRMED',slotId:'S2'},
   {id:'A4',experiment:'E1',phase:'CANCELLED',slotId:'S1'},
   {id:'A5',experiment:'E2',phase:'CONFIRMED',slotId:'MISSING'},
   {id:'A6',experiment:'E1',phase:'HELD',slotId:'S3'},
   {id:'A7',experiment:'E2',phase:'NEW',slotId:null}
  ],
  b02:{sessions:{S1:{status:'OPEN'},S2:{status:'CANCELLED'},S3:{status:'OPEN'}},
   attendance:{A1:{attendance:'PRESENT',progress:'COMPLETE'},A2:{attendance:'PENDING',progress:'PARTIAL'},A3:{attendance:'PRESENT',progress:'COMPLETE'}}},
  b06:{tasks:[{status:'OPEN',archived:false},{status:'DONE',archived:false},{status:'OPEN',archived:true}]}
 };
 const context={document,model:snapshot,b01Layout:{ready:true},Date:class extends Date{static now(){return Date.parse('2026-11-06T00:00:00Z');}},Set,$:id=>nodes[id],b07SummaryVerified_:b07Mock,b07CountText_:b07CountMock};
 vm.createContext(context);vm.runInContext(source+';b01Render();',context);
 const values=Object.fromEntries(nodes.b01Cards.children.map(card=>[card.children[0].textContent,Number(card.children[1].textContent)]));
 assert.equal(values['不重複申請代碼'],7);
 assert.equal(values['預約／申請紀錄'],7);
 assert.equal(values['今日未取消場次'],1);
 assert.equal(values['有效預約待確認出席'],2);
 assert.equal(values['已成立預約紀錄'],2);
 assert.equal(values['出席已確認紀錄'],1);
 assert.equal(values['施測進度完成紀錄'],1);
 assert.equal(values['待釐清的場次關聯'],1);
 assert.equal(values['已取消場次的有效申請'],1);
 assert.equal(values['未完成人工待辦'],1);
 assert.match(nodes.b01Status.textContent,/未核准，不計算/);
 context.model={...snapshot,open:true};vm.runInContext('b01Render()',context);
 assert.equal(nodes.b01Cards.children.length,0,'unsafe reload must erase prior summary');
 assert.match(nodes.b01Status.textContent,/不顯示統計/);
});


test('B01 rejects malformed cross-module snapshots without showing stale cards',()=>{
 const vm=require('node:vm');
 const source=html.slice(html.indexOf('function b01Clear('),html.indexOf('\nfunction load(){',html.indexOf('function b01Clear(')));
 const cards={children:[{old:true}],replaceChildren(){this.children=[];},append(node){this.children.push(node);}};
 const status={textContent:'previous successful snapshot'};
 const context={b01Layout:{ready:true},model:{mode:'TEST',open:false,consentReady:false,formalReadiness:{activationAllowed:false},
  slots:[{id:'S1',when:null}],applications:[{id:'A1',phase:'CONFIRMED'}],
  b02:{sessions:{},attendance:{}},b06:{tasks:[]}},
  $:id=>id==='b01Cards'?cards:id==='b01B07Consistency'?b07Indicator:status,Date,Set,b07SummaryVerified_:b07Mock,b07CountText_:b07CountMock,document:{createElement(){throw Error('unsafe render');}}};
 vm.createContext(context);
 assert.doesNotThrow(()=>vm.runInContext(source+';b01Render();',context));
 assert.equal(cards.children.length,0);
 assert.match(status.textContent,/不顯示統計/);
 context.model.slots=[{id:'S1',when:'2026-11-06 09:00'}];
 context.model.applications=[null];
 assert.doesNotThrow(()=>vm.runInContext('b01Render()',context));
 assert.equal(cards.children.length,0);
 context.model.applications=[{id:'A1',phase:'CONFIRMED'}];
 context.model.b06.tasks=[null];
 assert.doesNotThrow(()=>vm.runInContext('b01Render()',context));
 assert.equal(cards.children.length,0);
});

test('B01 accepts valid Taiwan morning sessions without UTC date rollover',()=>{
 const vm=require('node:vm');
 const source=html.slice(html.indexOf('function b01Clear('),html.indexOf('\nfunction load(){',html.indexOf('function b01Clear(')));
 const cards={children:[],replaceChildren(){this.children=[];},append(n){this.children.push(n);}};
 const status={textContent:''};
 const snapshot={mode:'TEST',open:false,consentReady:false,formalReadiness:{activationAllowed:false},
  slots:[{id:'S1',when:'2026-11-06 00:30'},{id:'S2',when:'2026-11-06 07:30'}],
  applications:[],b02:{sessions:{},attendance:{}},b06:{tasks:[]}};
 const context={model:snapshot,b01Layout:{ready:true},$:id=>id==='b01Cards'?cards:id==='b01B07Consistency'?b07Indicator:status,Date,Set,b07SummaryVerified_:b07Mock,b07CountText_:b07CountMock,
  document:{createElement(tag){return {tag,textContent:'',children:[],append(...items){this.children.push(...items);}};}}};
 vm.createContext(context);
 assert.doesNotThrow(()=>vm.runInContext(source+';b01Render();',context));
 assert.equal(cards.children.length,13,'valid early-morning sessions must render the full summary');
 assert.match(status.textContent,/未核准，不計算/);
});

test('B01 refuses duplicate identifiers and impossible Taiwan dates rather than reporting misleading totals',()=>{
 const vm=require('node:vm');
 const source=html.slice(html.indexOf('function b01Clear('),html.indexOf('\nfunction load(){',html.indexOf('function b01Clear(')));
 const cards={children:[{stale:true}],replaceChildren(){this.children=[];},append(n){this.children.push(n);}};
 const status={textContent:''};
 const snapshot={mode:'TEST',open:false,consentReady:false,formalReadiness:{activationAllowed:false},
  slots:[{id:'S1',when:'2026-11-06 09:00'}],
  applications:[{id:'A1',phase:'CONFIRMED',slotId:'S1'}],
  b02:{sessions:{S1:{status:'OPEN'}},attendance:{}},b06:{tasks:[]}};
 const context={model:snapshot,b01Layout:{ready:true},$:id=>id==='b01Cards'?cards:id==='b01B07Consistency'?b07Indicator:status,Date,Set,b07SummaryVerified_:b07Mock,b07CountText_:b07CountMock,
  document:{createElement(){return {append(){},textContent:''};}}};
 vm.createContext(context);
 for(const changed of [
  {...snapshot,slots:[{id:'S1',when:'2026-02-30 09:00'}]},
  {...snapshot,slots:[{id:'S1',when:'2026-11-06 09:00'},{id:'S1',when:'2026-11-07 09:00'}]},
  {...snapshot,applications:[{id:'A1',phase:'CONFIRMED'},{id:'A1',phase:'CONFIRMED'}]}
 ]){
  cards.children=[{stale:true}];context.model=changed;
  assert.doesNotThrow(()=>vm.runInContext(source+';b01Render();',context));
  assert.equal(cards.children.length,0);
  assert.match(status.textContent,/不顯示統計/);
 }
});
