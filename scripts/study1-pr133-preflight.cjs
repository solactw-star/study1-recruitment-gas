#!/usr/bin/env node
'use strict';
// Run exactly the same complete safety checks locally and on PR CI.
// A failing test, missing test count, skipped test or syntax error blocks push.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const MIN_TESTS=891;
function run(command,args,label){
 process.stdout.write('[Study1 preflight] '+label+'\n');
 const result=spawnSync(command,args,{
  cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,
  shell:process.platform==='win32'&&command==='npm'
 });
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error)throw Error(label+': '+result.error.message);
 if(result.status!==0)throw Error(label+': failed (exit '+result.status+')');
 return String(result.stdout||'')+'\n'+String(result.stderr||'');
}
function count(tap,label){
 const found=tap.match(new RegExp('^[ \\t]*# '+label+'[ \\t]+(\\d+)[ \\t]*$','m'));
 if(!found)throw Error('Cannot verify complete TAP # '+label+' summary; fail closed');
 return Number(found[1]);
}
try{
 run('git',['diff','--check'],'Verify unstaged whitespace');
 run('git',['diff','--cached','--check'],'Verify staged whitespace');
 const tap=run('npm',['test'],'Run ALL original and additional safety tests');
 const total=count(tap,'tests'),passed=count(tap,'pass');
 const failed=count(tap,'fail'),skipped=count(tap,'skipped');
 if(total<MIN_TESTS||passed!==total||failed!==0||skipped!==0)
  throw Error('Full suite required: tests>='+MIN_TESTS+
   ', pass=tests, fail=0, skipped=0; actual '+JSON.stringify({total,passed,failed,skipped}));
 run(process.execPath,['--check','gas/Website.js'],'Preserve original GAS JS syntax check');
 process.stdout.write('[Study1 preflight] VERIFIED_ALL='+total+
  ' FAIL=0 SKIP=0; safe to commit only as a COMPLETE integrated change.\n');
}catch(error){
 console.error('[Study1 preflight] BLOCKED: '+error.message);
 process.exitCode=1;
}
