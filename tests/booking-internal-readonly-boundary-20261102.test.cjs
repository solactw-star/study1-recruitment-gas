'use strict';
// Closed-site regression: internal availability and booking preflight modules
// must remain pure/injected and must not acquire Google services, mutate data,
// or log private reservation snapshots. Synthetic static checks only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readOnlyModules = [
  'gas/BookingReadOnlySheet.js',
  'gas/BookingReadOnlyLock.js',
  'gas/BookingReadOnlyLocked.js',
  'gas/BookingReschedulePreflight.js',
  'gas/BookingCancelHoldPreflight.js'
];
// Ignore comments so that documentation of forbidden APIs does not count as
// an actual invocation. These modules have no template strings or regex
// literals containing comment delimiters.
function executableSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('all closed read-only/preflight modules remain service-free and write-free', () => {
  for (const file of readOnlyModules) {
    const source = executableSource(file);
    assert.doesNotMatch(source,
      /\b(?:SpreadsheetApp|DriveApp|MailApp|GmailApp|CalendarApp|UrlFetchApp|PropertiesService|LockService)\s*\./,
      file + ' unexpectedly invokes a Google service');
    assert.doesNotMatch(source,
      /\.\s*(?:setValue|setValues|appendRow|clearContents|clearContent|deleteRow|deleteRows|insertRowAfter|insertRowsAfter|copyTo|sendEmail|createFile|setProperty|setProperties)\s*\(/,
      file + ' unexpectedly mutates state');
    assert.doesNotMatch(source,
      /\b(?:console|Logger)\s*\.\s*(?:log|info|warn|error)\s*\(/,
      file + ' unexpectedly logs potentially private snapshot data');
  }
});

test('read-only/preflight modules expose no newly callable public GAS functions', () => {
  for (const file of readOnlyModules) {
    const source = executableSource(file);
    for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      assert.ok(match[1].endsWith('_'),
        file + ' introduces a public GAS function: ' + match[1]);
    }
  }
});

test('site public booking and consent entrypoints remain closed', () => {
  const website = fs.readFileSync(path.join(root, 'gas/Website.js'), 'utf8');
  assert.match(website, /function\s+listSlots\(\)\s*\{\s*return\s+\[\];\s*\}/);
  for (const name of ['requestOtp','verifyOtp','holdSlot','cancelHold','submitConsent']) {
    const pattern = new RegExp('function\\s+' + name +
      '\\(\\)\\s*\\{\\s*return\\s+rejectIntake_\\(\\);\\s*\\}');
    assert.match(website, pattern, name + ' is no longer closed');
  }
});
