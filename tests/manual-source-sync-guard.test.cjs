'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const workflow=fs.readFileSync(path.join(base,'.github/workflows/manual-source-sync.yml'),'utf8');
const script=fs.readFileSync(path.join(base,'scripts/study1-gas-head-only-sync.cjs'),'utf8');
const backup=fs.readFileSync(path.join(base,'scripts/study1-gas-drive-backup.cjs'),'utf8');
const api=fs.readFileSync(path.join(base,'scripts/study1-gas-index-preview.cjs'),'utf8');
// SOURCE-ONLY test. NEVER invoke workflow_dispatch or authenticating main().

test('manual HEAD-only source sync remains manual-only and least-privileged',()=>{
 assert.match(workflow,/^on:\s*\n  workflow_dispatch:\s*\n/m);
 assert.doesNotMatch(workflow,
  /^  (?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run|workflow_call):/m);
 assert.match(workflow,/^permissions:\s*\n  contents: read\s*$/m);
 assert.doesNotMatch(workflow,/^\s+(?:id-token|actions|workflows|deployments): write\s*$/m);
 assert.match(workflow,/group:\s*study1-gas-source-sync/);
 assert.match(workflow,/cancel-in-progress:\s*false/);
});
test('new manual flow requires explicit approval, reviewed SHA, baseline, tests, backup, CAS, exactly one HEAD write',()=>{
 const pos=[
  workflow.indexOf('test "$HEAD_ONLY_CONFIRMATION" = I_AUTHORIZE_PR133_HEAD_ONLY_SYNC'),
  workflow.indexOf('npm run verify:pr'),
  workflow.indexOf('test -n "$CLASPRC_JSON"'),
  workflow.indexOf('scripts/study1-gas-head-only-sync.cjs prepare'),
  workflow.indexOf('git fetch origin fix/consent-last-preserve-wizard-20261110'),
  workflow.indexOf('scripts/study1-gas-head-only-sync.cjs apply')];
 assert.ok(pos.every(x=>x>=0),'missing required safety step');
 assert.ok(pos.every((n,i)=>i===0||n>pos[i-1]),'must verify in safe order');
 assert.match(workflow,/test "\$REVIEWED_PR_SHA" = "\$GITHUB_SHA"/);
 assert.match(workflow,/test "\$EXPECTED_REMOTE_SHA256" = 972cb7ceb617776ca161d283dd05e8f1d38b73b90afc68071b79eeffba25a611/);
 assert.match(script,/1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z|SID=core\.SCRIPT_ID/);
 assert.match(script,/Array\.isArray\(files\)&&files\.length===27/);
 assert.match(script,/JSON\.stringify\(changes\.sort\(\)\)===JSON\.stringify\(CHANGED\)/);
 assert.match(script,/core\.digest\(full\)===TARGET/);
 assert.match(script,/same_\(before,await observe_\(api\),true\)/);
 assert.match(script,/same_\(s\.before,state,true\)/);
 assert.match(script,/verifyDriveBackupPrivate/);
 assert.match(script,/HEAD_SYNC_UNKNOWN_NO_RETRY_NO_ROLLBACK/);
 assert.equal((script.match(/api\.putContent\(/g)||[]).length,1);
 for(const forbidden of ['api.createVersion(','api.putDeployment(','api.createDeployment(',
  'api.deleteDeployment(','clasp push'])assert.ok(!script.includes(forbidden));
 assert.doesNotMatch(workflow,/(?:@google\/clasp|clasp\s+(?:push|deploy)|actions\/upload-artifact)/);
});
test('missing OAuth is refused, backup ACL must be OWNER-only, credentials and runner snapshot wiped',()=>{
 assert.match(workflow,/test -n "\$CLASPRC_JSON" \|\| \{/);
 assert.match(workflow,/umask 077/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/rm -f "\$RUNNER_TEMP\/\.clasprc\.json"/);
 assert.match(workflow,/rm -f "\$RUNNER_TEMP\/study1-pr133-head-only-prewrite\.json"/);
 assert.match(backup,/async function verifyPrivate/);
 assert.match(backup,/meta\.shared===false/);
 assert.match(backup,/meta\.permissions\.length===1/);
 assert.match(backup,/meta\.permissions\[0\]\.role==='owner'/);
 assert.match(api,/verifyDriveBackupPrivate:/);
 assert.doesNotMatch(workflow,/^  push:/m);
});
