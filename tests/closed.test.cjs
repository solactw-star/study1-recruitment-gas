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
  assert.match(html,/disabled type="button"/);
  assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,4);assert.ok(inputs.every(x=>/\bdisabled\b/.test(x)));
  assert.match(html,/id="consentSubmit"/);
  assert.match(html,/consentEl\('consentSubmit'\)\.disabled=true/);
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

test('Public official consent product shows full published PDF and protected unsigned signature steps',()=>{
  assert.match(html,/id="consent"/);
  assert.match(html,/完整閱讀研究文件，再決定是否同意/);
  for(const text of ['完整 PDF','研究人員說明與答疑','核對版本並親自簽署',
   '取得副本／撤回','目前尚未開放線上簽署']){
   assert.ok(html.includes(text),'missing consent step '+text);
  }
  assert.match(html,/getPublicConsentDocument\(exp\)/);
  assert.match(html,/crypto\.subtle\.digest\('SHA-256',bytes\)/);
  assert.doesNotMatch(html,/view=demo|Demo|純TEST|虛構|示範 PDF|00000000/);
  assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,4);
  assert.ok(inputs.every(x=>/\bdisabled\b/.test(x)));
  assert.match(html,/consentEl\('consentSubmit'\)\.disabled=true/);
  const {ctx}=harness();
  assert.throws(()=>ctx.submitConsent({signature:'real',name:'person'}),/尚未開放/);
  assert.throws(()=>ctx.requestOtp({email:'real@example.com'}),/尚未開放/);
 });
