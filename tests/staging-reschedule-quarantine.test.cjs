'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('legacy staging reschedule remains quarantined outside deployable gas files', () => {
  const legacy = read('staging/held-reschedule-20261029.gs');
  assert.match(legacy, /function\s+rescheduleHold\s*\(/);
  const gasDir = path.join(root, 'gas');
  const sourceFiles = fs.readdirSync(gasDir).filter(name => /\.(?:js|gs)$/.test(name));
  assert.ok(sourceFiles.length > 0);
  for (const name of sourceFiles) {
    const source = fs.readFileSync(path.join(gasDir, name), 'utf8');
    assert.doesNotMatch(source, /\bfunction\s+rescheduleHold\s*\(/,
      'unreviewed staging reschedule API imported into gas/' + name);
  }
});

test('legacy staging schema is incompatible with the canonical UTC booking schema', () => {
  const legacy = read('staging/held-reschedule-20261029.gs');
  const canonical = read('gas/BookingCore.js');
  assert.match(legacy, /held\.hold_until\b/);
  assert.match(legacy, /target\.start_at\b/);
  assert.match(legacy, /r\.status\s*===\s*'FINALIZING'/);
  for (const field of ['hold_until_utc', 'start_at_utc', 'updated_at_utc']) {
    assert.ok(canonical.includes("'" + field + "'"), 'canonical field missing: ' + field);
  }
  assert.doesNotMatch(canonical, /'FINALIZING'/);
});

test('only closed internal reschedule preflight is present; intake remains disabled', () => {
  const safe = read('gas/BookingReschedulePreflight.js');
  const website = read('gas/Website.js');
  assert.match(safe, /function\s+bookingReschedulePreflight_\s*\(/);
  assert.doesNotMatch(safe, /\.setValues\s*\(|\.appendRow\s*\(|\.setValue\s*\(/);
  assert.match(website, /function\s+listSlots\(\)\s*\{\s*return\s+\[\];\s*\}/);
  assert.match(website, /function\s+holdSlot\(\)\s*\{\s*return\s+rejectIntake_\(\);\s*\}/);
});
