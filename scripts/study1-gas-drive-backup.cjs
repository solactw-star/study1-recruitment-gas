'use strict';
// Persistent, private 828 Drive backup gate. Fail closed if OAuth lacks Drive scope.
const crypto=require('node:crypto');
const FOLDER='1O6j7PQWMNUbb_a6cWHegy7lBZPMQ0Hiu';
const OWNER='solac.tw@gmail.com';
const sha256=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
function ensure(ok,msg){if(!ok)throw Error(msg)}
async function request(fetcher,token,url,options={}) {
 const response=await fetcher(url,{
  ...options,
  headers:{...options.headers,Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(30000)
 });
 ensure(response.ok,'828 private Drive backup API failed HTTP '+response.status);
 return response;
}
async function verify(fetcher,token,id,expectedHash) {
 ensure(/^[A-Za-z0-9_-]{20,}$/.test(id),'Invalid backup Drive file ID');
 const base='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id);
 const meta=await (await request(fetcher,token,base+'?fields=id,name,mimeType,parents,owners(emailAddress)')).json();
 ensure(meta.id===id&&meta.mimeType==='application/json'&&
  Array.isArray(meta.parents)&&meta.parents.includes(FOLDER)&&
  Array.isArray(meta.owners)&&meta.owners.some(o=>o.emailAddress===OWNER),
  'Backup is not in the verified private 828 workspace');
 const bytes=await (await request(fetcher,token,base+'?alt=media')).text();
 ensure(sha256(bytes)===expectedHash,'Drive backup readback SHA256 mismatch');
 return {id,sha256:expectedHash};
}
async function create(fetcher,token,snapshot) {
 ensure(snapshot&&snapshot.scriptId==='1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z'&&
  Array.isArray(snapshot.original?.files),'Backup must contain the full verified GAS HEAD');
 const bytes=JSON.stringify(snapshot,null,2),hash=sha256(bytes);
 const boundary='study1-'+crypto.randomBytes(12).toString('hex');
 const metadata={name:'Study1_GAS_prewrite_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+hash.slice(0,12)+'.json',
  mimeType:'application/json',parents:[FOLDER]};
 const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
  JSON.stringify(metadata)+'\r\n--'+boundary+
  '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+bytes+
  '\r\n--'+boundary+'--\r\n';
 const response=await request(fetcher,token,
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,owners(emailAddress)',
  {method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const created=await response.json();
 ensure(typeof created.id==='string','Drive backup create did not return an ID');
 return verify(fetcher,token,created.id,hash);
}
module.exports={FOLDER,OWNER,sha256,verify,create};
