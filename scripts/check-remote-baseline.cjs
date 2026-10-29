'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [dir,manifestFile]=process.argv.slice(2);
if(!dir||!manifestFile){console.error('Need remote directory and baseline JSON');process.exit(2);}
const baseline=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
if(baseline.gasProjectId!=='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z') throw Error('Wrong GAS project');
const expected=Object.keys(baseline.files).filter(n=>n!=='.clasp.json').sort();
const actual=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&x.name!=='.clasp.json').map(x=>x.name).sort();
if(JSON.stringify(actual)!==JSON.stringify(expected)) throw Error('Remote file set changed. Stop with no write.');
for(const name of expected){
  const bytes=fs.readFileSync(path.join(dir,name));
  if(bytes.length!==baseline.files[name].bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==baseline.files[name].sha256)
    throw Error('Remote GAS source differs from verified original: '+name+'. Stop with no write.');
}
console.log('Remote GAS source matches verified original; source-sync guard passed.');
