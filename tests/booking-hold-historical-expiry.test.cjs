'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = ['gas/BookingCore.js', 'gas/BookingHoldTransaction.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(source, ctx);

const slotStart = '2026-10-31T09:00:00Z';
function slot() {
  return ['SLOT_B', slotStart, '2026-10-31T10:00:00Z',
    2, 'ROOM', 'CLOSED', 'researcher', '2026-10-29T11:00:00Z'];
}
function historicalHold(expiry, status='HELD') {
  return ['HIST_R', 'PRIVATE_APP', 'SLOT_B', status, expiry,
    'historical-request-key-0002', '2026-10-29T11:00:00Z',
    '', '', ''];
}
function check(rows, now) {
  return ctx.bookingHoldAssertGlobalOccupancy_([slot()], rows, Date.parse(now));
}

test('expired historical HELD past slot start blocks locked booking integrity preflight', () => {
  assert.throws(
    () => check([historicalHold('2026-10-31T09:01:00Z')],
      '2026-11-02T12:00:00Z'),
    error => {
      assert.match(String(error), /暫留期限晚於原時段開始/);
      assert.doesNotMatch(String(error), /PRIVATE_APP|historical-request-key|HIST_R/);
      return true;
    });
});

test('expired historical HELD ending at/before slot start does not consume seats', () => {
  for (const expiry of ['2026-10-31T09:00:00Z', '2026-10-30T09:00:00Z']) {
    assert.doesNotThrow(() => check([historicalHold(expiry)],
      '2026-11-02T12:00:00Z'));
  }
});

test('active late HELD still blocks, but CANCELLED history is not a live hold', () => {
  assert.throws(() => check([historicalHold('2026-10-31T09:01:00Z')],
    '2026-10-29T12:00:00Z'), /暫留期限晚於原時段開始/);
  assert.doesNotThrow(() => check(
    [historicalHold('2026-10-31T09:01:00Z', 'CANCELLED')],
    '2026-11-02T12:00:00Z'));
});
