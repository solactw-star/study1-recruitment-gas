'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..','gas');
const source = fs.readFileSync(path.join(root,'Website.js'),'utf8');
const html = fs.readFileSync(path.join(root,'Index.html'),'utf8');
function harness() {
  const props = new Map([['OTHER_SETTING','keep-me']]);
  const ctx = {
    console:{log(){}},
    PropertiesService:{getScriptProperties(){return {
      setProperties(values,removeOthers){assert.equal(removeOthers,false);for(const [k,v] of Object.entries(values)) props.set(k,v);},
      getProperty(key){return props.get(key);}
    };}},
    HtmlService:{createHtmlOutputFromFile(name){
      assert.equal(name,'Index');
      return {getContent(){return html;},setTitle(){return this;},addMetaTag(){return this;}};
    }}
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'Website.js',timeout:1500});
  return {ctx,props};
}
test('Public configuration discloses no private resources and is closed',()=>{
  const {ctx}=harness(), cfg=ctx.getPublicConfig();
  assert.equal(cfg.open,false);
  assert.equal(cfg.consentReady,false);
  assert.equal(cfg.contact,'lily4318@cycu.edu.tw');
  assert.deepEqual(Object.keys(cfg).sort(),['consentReady','contact','mode','open']);
});
test('All current participant collection entrypoints fail closed',()=>{
  const {ctx}=harness();
  for(const name of ['requestOtp','verifyOtp','holdSlot','cancelHold','submitConsent','setOpen_']){
    assert.throws(()=>ctx[name](),/尚未開放/,name);
  }
  assert.equal(ctx.listSlots().length,0);
});
test('Closed initialization retains unrelated GAS properties',()=>{
  const {ctx,props}=harness(),result=ctx.runClosedChecks_();
  assert.equal(result.ok,true);
  assert.equal(props.get('OPEN'),'false');
  assert.equal(props.get('CONSENT_READY'),'false');
  assert.equal(props.get('OTHER_SETTING'),'keep-me');
});
test('The information-only HTML has no intake or external scripts',()=>{
  assert.match(html,/mailto:lily4318@cycu\.edu\.tw/);
  assert.match(html,/exec\?view=apply/);
  assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,0);
  assert.doesNotMatch(html,/id="consentSignature"|id="consentSubmit"|initConsentPortal_/);
  assert.doesNotMatch(html,/<script[^>]+\bsrc\s*=/i);
});
test('GAS manifest restricts access to the deploying account',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
  const clasp=JSON.parse(fs.readFileSync(path.join(root,'.clasp.json'),'utf8'));
  assert.equal(manifest.timeZone,'Asia/Taipei');
  assert.equal(manifest.runtimeVersion,'V8');
  assert.equal(manifest.webapp.access,'MYSELF');
  assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');
  assert.equal(clasp.scriptId,'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z');
});
test('Original source manifest is preserved for remote drift detection',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs','remote-baseline-20261029.json'),'utf8'));
  assert.equal(data.gasProjectId,'1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z');
  assert.deepEqual(Object.keys(data.files).sort(),['.clasp.json','Website.js','Index.html','appsscript.json','程式碼.js'].sort());
  for(const v of Object.values(data.files)){assert.ok(v.bytes>0);assert.match(v.sha256,/^[a-f0-9]{64}$/);}
});

test('§70-S public research introduction explains consent-last without any signature widget',()=>{
  assert.doesNotMatch(html,/id="consent"/);
  assert.doesNotMatch(html,/知情同意是報名最後的步驟/);
  for(const word of ['id="apply"','id="about"','id="contact"',
   '目前尚未開放報名']){
   assert.ok(html.includes(word),'missing information-only flow '+word);
  }
  assert.doesNotMatch(html,/id="consentSignature"|id="consentSubmit"|initConsentPortal_/);
  assert.doesNotMatch(html,/<(?:input|canvas|iframe|form|textarea)\b/i);
  const {ctx}=harness();
  assert.throws(()=>ctx.submitConsent({signature:'real',name:'person'}),/尚未開放/);
  assert.throws(()=>ctx.requestOtp({email:'real@example.com'}),/尚未開放/);
});
