'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','gas','Index.html'),'utf8');
const expected=['main','home','about','apply','contact','apply','about'];
const source=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(source,'closed info page should have one inline script');
function harness(reduceMotion=false){
 const anchors=expected.map(id=>({
  id,handler:null,getAttribute(name){assert.equal(name,'href');return '#'+id;},
  addEventListener(name,handler){assert.equal(name,'click');this.handler=handler;}
 }));
 const targets=Object.fromEntries([...new Set(expected)].map(id=>{
  const attr=id==='main'?{'tabindex':'-1'}:{};
  const target={id,attrs:attr,scrollOptions:null,focusOptions:null,
   hasAttribute(key){return Object.prototype.hasOwnProperty.call(this.attrs,key);},
   setAttribute(key,value){this.attrs[key]=value;},
   focus(options){this.focusOptions=options;},
   scrollIntoView(options){this.scrollOptions=options;}
  };
  return [id,target];
 }));
 const status={textContent:''};
 const context={
  document:{
   querySelectorAll(selector){assert.equal(selector,'a[href^="#"]');return anchors;},
   getElementById(id){return id==='health'?status:targets[id]||null;}
  },
  window:{matchMedia(query){assert.equal(query,'(prefers-reduced-motion: reduce)');return {matches:reduceMotion};}}
 };
 vm.runInNewContext(source[1],context,{timeout:1500});
 function click(link,extras={}){
  const event={button:0,defaultPrevented:false,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,
   preventDefault(){this.defaultPrevented=true;},...extras};
  link.handler(event);
  return event;
 }
 return {anchors,targets,click,status};
}
test('Seven anchor href targets exclude the standalone consent panel',()=>{
 const all=[...html.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>/g)].map(m=>m[1]);
 assert.deepEqual(all,expected);
 for(const id of new Set(expected)) assert.match(html,new RegExp('\\bid="'+id+'"'));
 assert.match(html,/<base target="_top">/);
});
test('All seven navigation links remain in the iframe, focus the destination and scroll locally',()=>{
 const h=harness();
 for(const a of h.anchors){
  const event=h.click(a);
  assert.equal(event.defaultPrevented,true,'must prevent _top navigation');
  assert.equal(h.targets[a.id].attrs.tabindex,'-1');
  assert.equal(h.targets[a.id].focusOptions.preventScroll,true);
  assert.equal(h.targets[a.id].scrollOptions.behavior,'smooth');
  assert.equal(h.targets[a.id].scrollOptions.block,'start');
 }
 assert.match(html,/main\[id\],section\[id\]\{scroll-margin-top:90px\}/);
});
test('Reduced-motion preference disables animated scrolling',()=>{
 const h=harness(true);
 assert.equal(h.click(h.anchors[0]).defaultPrevented,true);
 assert.equal(h.targets.main.scrollOptions.behavior,'auto');
});
test('Modified and nonprimary clicks retain native navigation behavior',()=>{
 for(const mod of [{button:1},{button:2},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{defaultPrevented:true}]){
  const h=harness();
  const event=h.click(h.anchors[0],mod);
  assert.equal(event.defaultPrevented,!!mod.defaultPrevented);
  assert.equal(h.targets.main.scrollOptions,null);
 }
});
test('Latest user-authorized website contact details are shown',()=>{
 assert.match(html,/研究計畫聯絡人：賴詩潔/);
 assert.match(html,/mailto:lily4318@cycu\.edu\.tw/);
 assert.doesNotMatch(html,/mailto:psy\.shihchieh@gmail\.com/);
 assert.match(html,/tel:\+88632563414/);
 assert.match(html,/03-256-3414/);
 assert.doesNotMatch(html,/03-264-3414/);
 assert.match(html,/研究計畫主持人：葉理豪/);
 assert.doesNotMatch(html,/葉理豪副教授/);
 assert.match(html,/mailto:lhyeh@cycu\.edu\.tw/);
 assert.match(html,/tel:\+88632653413/);
 assert.match(html,/03-265-3413/);
 assert.doesNotMatch(html,/03-264-3413/);
 assert.match(html,/mailto:lily4318@cycu\.edu\.tw/);
});
test('Contact and navigation improvement does not activate intake or signing',()=>{
 assert.match(html,/exec\?view=apply/);
 assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,0);
  assert.ok(inputs.every(x=>/\bdisabled\b/.test(x)));
  assert.doesNotMatch(html,/id="consentSignature"|initConsentPortal_/);
 assert.doesNotMatch(html,/<script[^>]+src=/i);
});
