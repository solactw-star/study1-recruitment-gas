'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'gas/ConsentPdfIntegrity.js'), 'utf8');
const pdf = Array.from(Buffer.from('%PDF-1.7\nfictional-test-only\n%%EOF\n'));
pdf.push(-1); // Signed Byte[] representation, as may be returned by GAS.
function sha(bytes) {
  return crypto.createHash('sha256')
    .update(Buffer.from(bytes.map(x => x & 255))).digest('hex');
}
function digest(bytes) {
  return Array.from(crypto.createHash('sha256')
    .update(Buffer.from(bytes.map(x => x & 255))).digest())
    .map(x => x > 127 ? x - 256 : x);
}
function check(expected, read = () => pdf.slice(), hash = digest) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.consentPdfIntegrityPreflight_(expected, read, hash);
}
test('independent approved SHA-256 matches exact PDF bytes, including signed bytes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(check(sha(pdf)))), {ok: true});
});
test('one changed byte is rejected; error contains no PDF content', () => {
  const changed = pdf.slice();
  changed[9] ^= 1;
  assert.throws(() => check(sha(pdf), () => changed), err => {
    assert.match(String(err), /雜湊不一致/);
    assert.doesNotMatch(String(err), /fictional-test-only/);
    return true;
  });
});
test('unverified trust anchor fails before any byte read or digest call', () => {
  for (const invalid of ['', '0'.repeat(63), 'A'.repeat(64), null, 42]) {
    let reads = 0, hashes = 0;
    assert.throws(() => check(invalid, () => {reads++; return pdf;},
      () => {hashes++; return digest(pdf);}), /基準值/);
    assert.equal(reads, 0);
    assert.equal(hashes, 0);
  }
});
test('missing trusted dependencies and invalid PDF bytes fail closed', () => {
  assert.throws(() => check(sha(pdf), null), /介面/);
  assert.throws(() => check(sha(pdf), () => pdf, null), /介面/);
  for (const bad of [
    [], 'not bytes', [1, 2, 3, 4, 5, 6, 7, 8],
    [...pdf.slice(0, 10), 256, ...pdf.slice(11)],
    [...pdf.slice(0, 10), -129, ...pdf.slice(11)],
    [...pdf.slice(0, 10), 1.5, ...pdf.slice(11)],
    [...pdf.slice(0, 10), null, ...pdf.slice(11)],
    Array(20 * 1024 * 1024 + 1)
  ]) {
    assert.throws(() => check(sha(pdf), () => bad));
  }
  const sparse = pdf.slice();
  delete sparse[8];
  assert.throws(() => check(sha(pdf), () => sparse), /位元組/);
});
test('malformed or non-SHA-256 digest fails closed', () => {
  for (const bad of [[], Array(32), Array(31).fill(0),
    [...Array(31).fill(0), 256],
    [...Array(31).fill(0), -129],
    [...Array(31).fill(0), 1.25],
    [...Array(31).fill(0), null],
    '0'.repeat(64)]) {
    assert.throws(() => check(sha(pdf), () => pdf, () => bad), /摘要/);
  }
});
test('preflight does not open any public intake or perform live I/O', () => {
  const site = fs.readFileSync(path.join(root, 'gas/Website.js'), 'utf8');
  assert.match(site, /function submitConsent\(\)\{return rejectIntake_\(\);\}/);
  assert.doesNotMatch(source, /DriveApp|SpreadsheetApp|MailApp|GmailApp|UrlFetchApp|Logger|console\.log/);
  assert.match(source, /function consentPdfIntegrityPreflight_\(/);
});
