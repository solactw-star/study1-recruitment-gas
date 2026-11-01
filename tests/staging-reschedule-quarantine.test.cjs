'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('unreviewed public reschedule API is absent from deployable GAS sources', () => {
  const gasDir = path.join(root, 'gas');
  const sourceFiles = fs.readdirSync(gasDir).filter(name => /\.(?:js|gs)$/.test(name));
  assert.ok(sourceFiles.length > 0);
  for (const name of sourceFiles) {
    const source = fs.readFileSync(path.join(gasDir, name), 'utf8');
    assert.doesNotMatch(source, /\bfunction\s+rescheduleHold\s*\(/,
      'unreviewed legacy reschedule API imported into gas/' + name);
  }
});

test('canonical UTC booking schema and provisional status set stay explicit', () => {
  const canonical = read('gas/BookingCore.js');
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

// The unreviewed staging helper rewrites an entire row via setValues(),
// including cells it did not intend to change. Do not import it into the
// deployable GAS tree before schema-aware, locked, post-write verification.
test('legacy staging patchRow helper stays quarantined from deployable GAS', () => {
  const gasDir = path.join(root, 'gas');
  const sourceFiles = fs.readdirSync(gasDir).filter(name => /\.(?:js|gs)$/.test(name));
  for (const name of sourceFiles) {
    const source = fs.readFileSync(path.join(gasDir, name), 'utf8');
    assert.doesNotMatch(source, /\bfunction\s+patchRow_\s*\(/,
      'unreviewed legacy staging patchRow helper imported into gas/' + name);
  }
});


// The isolated 2026-10-29 staging implementation uses old non-_utc field
// aliases and an unapproved FINALIZING state. Blocking the exact legacy API
// name alone is insufficient: copying its logic under a renamed function
// could bypass that guard and misread production rows.
const LEGACY_BOOKING_FIELD_ACCESS =
  /(?:\.\s*(?:hold_until|start_at|updated_at)\b|\[\s*['"`](?:hold_until|start_at|updated_at)['"`]\s*\])/;
const UNAPPROVED_FINALIZING_STATE = /['"`]FINALIZING['"`]/;

test('legacy staging field aliases and FINALIZING state stay outside deployable GAS', () => {
  const gasDir = path.join(root, 'gas');
  const files = fs.readdirSync(gasDir).filter(name => /\.(?:js|gs)$/.test(name));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = fs.readFileSync(path.join(gasDir, name), 'utf8');
    assert.doesNotMatch(source, LEGACY_BOOKING_FIELD_ACCESS,
      'legacy non-UTC booking field access in gas/' + name);
    assert.doesNotMatch(source, UNAPPROVED_FINALIZING_STATE,
      'unapproved legacy reservation status in gas/' + name);
  }
});

test('quarantine patterns detect the actual legacy access shape without blocking canonical UTC', () => {
  for (const source of [
    'held.hold_until', 'target.start_at', 'row.updated_at',
    "row['hold_until']", 'row["start_at"]', "row['updated_at']"
  ]) assert.match(source, LEGACY_BOOKING_FIELD_ACCESS);
  assert.match("status === 'FINALIZING'", UNAPPROVED_FINALIZING_STATE);
  for (const source of [
    'held.hold_until_utc', 'target.start_at_utc', 'row.updated_at_utc',
    "row['hold_until_utc']", "status === 'CONFIRMED'"
  ]) {
    assert.doesNotMatch(source, LEGACY_BOOKING_FIELD_ACCESS);
    assert.doesNotMatch(source, UNAPPROVED_FINALIZING_STATE);
  }
});
