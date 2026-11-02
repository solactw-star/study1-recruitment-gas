'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../gas/AdminSandbox.js'),'utf8');
function setup(active='solac.tw@gmail.com',effective='solac.tw@gmail.com'){
 const store=new Map(),locks={held:false};
 const p={
  getProperty:k=>k==='OPEN'||k==='CONSENT_READY'?'false':store.has(k)?store.get(k):null,
  setProperty:(k,v)=>{assert.ok(['STUDY1_SANDBOX_ADMIN_CONFIG_V1','STUDY1_SANDBOX_BOOKINGS_V1'].includes(k));store.set(k,v)},
  deleteProperty:k=>{assert.equal(k,'STUDY1_SANDBOX_SELFTEST_V1');store.delete(k)}
 };
 const s=vm.createContext({PropertiesService:{getScriptProperties:()=>p},
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locks.held)return false;locks.held=true;return true;},releaseLock:()=>{locks.held=false;}})},
  JSON,Number,String,Array,Object,Set,Date,Error
 });
 vm.runInContext(src,s,{timeout:1200});
 return {s,store,locks};
}
const req=(action,code,slot,id,rev)=>({action,bookingCode:code,slotId:slot,requestId:'REQ-'+id,expectedRevision:rev});
test('Only owner may list, create, move or cancel synthetic bookings',()=>{
 const {s,store}=setup('visitor@example.com');
 assert.throws(()=>s.adminGetTestBookings(),/拒絕存取/);
 assert.throws(()=>s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','unauth001',0)),/拒絕存取/);
 assert.equal(store.size,0);
});
test('First load returns isolated slots with capacity, no booking writes',()=>{
 const {s,store}=setup(),view=s.adminGetTestBookings();
 assert.equal(view.mode,'SANDBOX_ONLY');
 assert.equal(view.open,false);assert.equal(view.consentReady,false);
 assert.equal(view.revision,0);assert.equal(view.slots[0].remaining,2);
 assert.equal(store.size,0);
});
test('Create and retry same idempotency marker never double-book',()=>{
 const {s,store}=setup(),payload=req('CREATE','TST-001','test_slot_1','create001',0);
 const saved=s.adminChangeTestBooking(payload);
 assert.equal(saved.slots[0].booked,1);assert.equal(saved.revision,1);
 const repeated=s.adminChangeTestBooking(payload);
 assert.equal(repeated.deduplicated,true);assert.equal(repeated.slots[0].booked,1);
 assert.equal(store.size,1);
});
test('Capacity is checked within lock and stale revision fails closed',()=>{
 const {s}=setup();
 const a=s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 assert.throws(()=>s.adminChangeTestBooking(req('CREATE','TST-002','test_slot_1','stale0001',0)),/重新讀取 revision/);
 const b=s.adminChangeTestBooking(req('CREATE','TST-002','test_slot_1','create002',a.revision));
 assert.equal(b.slots[0].remaining,0);
 assert.throws(()=>s.adminChangeTestBooking(req('CREATE','TST-003','test_slot_1','create003',b.revision)),/容量已滿/);
 assert.equal(s.adminGetTestBookings().revision,2);
});
test('Move checks target capacity; cancellation releases capacity; repeat cancellation is idempotent',()=>{
 const {s}=setup();
 const a=s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 let config=JSON.parse(JSON.stringify(s.adminGetSandboxConfig().config));delete config.schemaVersion;delete config.revision;
 config.testSlots.push({id:'test_slot_2',start:'2027-01-02T10:00',location:'〔測試〕實驗室 B',capacity:1});
 s.adminSaveSandboxConfig(config,0);
 const moved=s.adminChangeTestBooking(req('MOVE','TST-001','test_slot_2','move00001',a.revision));
 assert.equal(moved.slots[0].booked,0);assert.equal(moved.slots[1].booked,1);
 const cancelled=s.adminChangeTestBooking(req('CANCEL','TST-001',null,'cancel001',moved.revision));
 assert.equal(cancelled.slots[1].remaining,1);
 const repeat=s.adminChangeTestBooking(req('CANCEL','TST-001',null,'cancel001',moved.revision));
 assert.equal(repeat.deduplicated,true);
 assert.throws(()=>s.adminChangeTestBooking(req('MOVE','TST-001','test_slot_1','move00002',cancelled.revision)),/只有仍有效/);
});
test('No PII fields, unknown request IDs, changed idempotency payload or active intake',()=>{
 const {s,store}=setup();const create=req('CREATE','TST-001','test_slot_1','create001',0);
 assert.throws(()=>s.adminChangeTestBooking({...create,email:'person@example.com'}),/核准欄位/);
 assert.throws(()=>s.adminChangeTestBooking({...create,bookingCode:'研究參與者'}),/格式不符/);
 s.adminChangeTestBooking(create);
 assert.throws(()=>s.adminChangeTestBooking({...create,bookingCode:'TST-002'}),/對應不同操作/);
 assert.equal(store.size,1);
});
test('Booking ledger deliberately uses only a separate property namespace',()=>{
 const {s,store}=setup();const main=s.adminGetSandboxConfig();
 s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 assert.equal(store.has('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),false);
 assert.equal(store.has('STUDY1_SANDBOX_BOOKINGS_V1'),true);
 assert.equal(s.adminGetSandboxConfig().config.revision,main.config.revision);
});

test('Config update cannot orphan ACTIVE synthetic bookings or shrink below occupancy',()=>{
 const {s,store,locks}=setup();
 const first=s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 s.adminChangeTestBooking(req('CREATE','TST-002','test_slot_1','create002',first.revision));
 const draft=JSON.parse(JSON.stringify(s.adminGetSandboxConfig().config));
 delete draft.schemaVersion;delete draft.revision;
 const originalBooking=store.get('STUDY1_SANDBOX_BOOKINGS_V1');
 const orphan={...draft,testSlots:[]};
 assert.throws(()=>s.adminSaveSandboxConfig(orphan,0),/已有有效測試預約/);
 const reduced=JSON.parse(JSON.stringify(draft));
 reduced.testSlots[0].capacity=1;
 assert.throws(()=>s.adminSaveSandboxConfig(reduced,0),/容量調低於已預約數/);
 assert.equal(store.get('STUDY1_SANDBOX_BOOKINGS_V1'),originalBooking);
 assert.equal(store.has('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),false);
 assert.equal(s.adminGetSandboxConfig().config.revision,0);
 assert.equal(locks.held,false);
});
test('Capacity edits are allowed after cancellation releases active test occupancy',()=>{
 const {s,store}=setup();
 const first=s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 const second=s.adminChangeTestBooking(req('CREATE','TST-002','test_slot_1','create002',first.revision));
 s.adminChangeTestBooking(req('CANCEL','TST-002',null,'cancel002',second.revision));
 const draft=JSON.parse(JSON.stringify(s.adminGetSandboxConfig().config));
 delete draft.schemaVersion;delete draft.revision;
 draft.testSlots[0].capacity=1;
 const before=store.get('STUDY1_SANDBOX_BOOKINGS_V1');
 const saved=s.adminSaveSandboxConfig(draft,0);
 assert.equal(saved.config.revision,1);
 assert.equal(saved.config.testSlots[0].capacity,1);
 assert.equal(store.get('STUDY1_SANDBOX_BOOKINGS_V1'),before);
 const view=s.adminGetTestBookings();
 assert.equal(view.slots[0].booked,1);
 assert.equal(view.slots[0].remaining,0);
 assert.equal(view.slots[0].overCapacity,false);
});

test('Active synthetic booking pins its slot date and location until cancellation',()=>{
 const {s,store,locks}=setup();
 const first=s.adminChangeTestBooking(req('CREATE','TST-001','test_slot_1','create001',0));
 const initial=JSON.parse(JSON.stringify(s.adminGetSandboxConfig().config));
 delete initial.schemaVersion;delete initial.revision;
 const originalBookings=store.get('STUDY1_SANDBOX_BOOKINGS_V1');
 for(const [field,value] of [['start','2027-01-03T11:00'],['location','〔測試〕新實驗室']]){
  const changed=JSON.parse(JSON.stringify(initial));changed.testSlots[0][field]=value;
  assert.throws(()=>s.adminSaveSandboxConfig(changed,0),/不能直接變更時段日期或地點/);
  assert.equal(store.has('STUDY1_SANDBOX_ADMIN_CONFIG_V1'),false);
  assert.equal(store.get('STUDY1_SANDBOX_BOOKINGS_V1'),originalBookings);
  assert.equal(locks.held,false);
 }
 const grown=JSON.parse(JSON.stringify(initial));grown.testSlots[0].capacity=3;
 assert.equal(s.adminSaveSandboxConfig(grown,0).config.revision,1);
 s.adminChangeTestBooking(req('CANCEL','TST-001',null,'cancel001',first.revision));
 const released=JSON.parse(JSON.stringify(grown));
 released.testSlots[0].start='2027-01-03T11:00';
 released.testSlots[0].location='〔測試〕新實驗室';
 const saved=s.adminSaveSandboxConfig(released,1);
 assert.equal(saved.config.revision,2);
 assert.equal(saved.config.testSlots[0].start,'2027-01-03T11:00');
 assert.equal(saved.config.testSlots[0].location,'〔測試〕新實驗室');
 assert.equal(s.adminGetTestBookings().bookings[0].status,'CANCELLED');
 assert.equal(locks.held,false);
});
