'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..',
  '.github/workflows/manual-source-sync.yml'), 'utf8');

// This workflow can overwrite GAS source. These tests MUST NEVER execute it.
test('dangerous source-sync workflow remains manual-only and least-privileged', () => {
  assert.match(workflow, /^on:\s*\n  workflow_dispatch:\s*\n/m);
  assert.doesNotMatch(workflow,
    /^  (?:push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run|workflow_call):/m);
  assert.match(workflow, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(?:id-token|actions|workflows|deployments): write\s*$/m);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('explicit confirmation, verified baseline, and backup precede any source overwrite', () => {
  const confirmation = workflow.indexOf("I_AUTHORIZE_SOURCE_REPLACEMENT_ONLY' ]; then");
  const tests = workflow.indexOf('npm test');
  const credentials = workflow.indexOf('Missing CLASPRC_JSON secret');
  const fetch = workflow.indexOf('clasp@3 clone');
  const drift = workflow.indexOf('scripts/check-remote-baseline.cjs');
  const backup = workflow.indexOf('actions/upload-artifact@v4');
  const push = workflow.indexOf('clasp@3 push --force');
  assert.ok([confirmation, tests, credentials, fetch, drift, backup, push]
    .every(index => index >= 0));
  assert.ok(confirmation < tests && tests < credentials &&
    credentials < fetch && fetch < drift && drift < backup && backup < push);
  assert.match(workflow, /SCRIPT_ID:\s*1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.doesNotMatch(workflow, /\bclasp(?:@\d+)?\s+deploy\b/i);
});

test('source sync refuses missing secrets and removes temporary credentials', () => {
  assert.match(workflow, /if \[ -z "\$CLASPRC_JSON" \]; then[\s\S]*?exit 1/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /- name: Delete temporary credentials\s*\n\s*if: always\(\)/);
  assert.match(workflow, /rm -f "\$HOME\/\.clasprc\.json"/);
});
