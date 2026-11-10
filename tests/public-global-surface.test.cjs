'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// GAS makes global functions without a trailing underscore callable from
// HTML Service clients. An accidentally imported staging function can become
// a new public server entrypoint even if Website.js itself remains closed.
// This is a CLOSED-site allowlist, not an approval to deploy these sources.
const gasDir = path.join(__dirname, '..', 'gas');
const approvedPublicFunctions = [
  'adminGetSandboxConfig', 'adminSaveSandboxConfig', 'adminValidateSandboxConfig', 'adminRunSandboxSelfTest', 'adminGetTestBookings', 'adminChangeTestBooking', 'study1ConsentVersionList', 'study1ConsentVersionUpload', 'study1ConsentVersionSelect', 'study1ConsentVersionPublication',
  'study1EConsentIssue','study1EConsentExplain','study1EConsentConfirm','study1EConsentOwnerList','study1EConsentOwnerWithdraw',
  'study1EConsentAvailability','study1EConsentSession','study1EConsentSign',
  'study1EConsentSignPdf','study1EConsentSignedPdfCopy',
  'study1EConsentCopy','study1EConsentWithdraw', // owner / fixed-capability authenticated endpoints, each gated
  // strictly owner-authorized, sandbox-only
  'study1UnifiedPreviewGet', 'study1UnifiedPreviewCommand', 'study1UnifiedPreviewSelfTest', 'study1UnifiedB06Command', 'study1UnifiedB12AuditPage', 'study1UnifiedB01LayoutGet', 'study1UnifiedB01LayoutSave', // owner-only shared formal workflow TEST adapter; NOT public enrollment
  'cancelHold', 'doGet', 'getPublicConfig', 'getPublicConsentDocument', 'holdSlot', 'listSlots',
  'myFunction', // preserved original GAS placeholder; not a collection API
  'requestOtp', 'submitConsent', 'verifyOtp',
  'study1ParticipantReadiness','study1ParticipantBegin','study1ParticipantSendOtp','study1ParticipantVerifyOtp','study1ParticipantEmailStatus'
].sort();

test('all GAS source files expose only the reviewed closed-site global functions', () => {
  const files = fs.readdirSync(gasDir)
    .filter(name => /\.(?:js|gs)$/.test(name)).sort();
  assert.ok(files.length > 0, 'no GAS source files found');

  const context = vm.createContext({});
  for (const name of files) {
    const source = fs.readFileSync(path.join(gasDir, name), 'utf8');
    vm.runInContext(source, context, { filename: name, timeout: 1500 });
    // Also guard top-level lexical arrow/function declarations that may not
    // appear among enumerable properties of the VM global object.
    for (const match of source.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/gm)) {
      assert.ok(match[1].endsWith('_'),
        'unreviewed top-level callable declaration in ' + name + ': ' + match[1]);
    }
  }
  assert.equal(typeof context.runClosedChecks, 'undefined',
    'property-writing closed checks must not be a client-callable function');
  assert.equal(typeof context.runClosedChecks_, 'function',
    'researcher-only closed checks remain available to internal tests');
  const exposed = Object.keys(context)
    .filter(name => typeof context[name] === 'function' && !name.endsWith('_'))
    .sort();
  assert.deepEqual(exposed, approvedPublicFunctions,
    'unreviewed callable GAS entrypoint added or reviewed endpoint removed');
});

test('staging reschedule and private booking kernels are not callable globals', () => {
  const sources = fs.readdirSync(gasDir)
    .filter(name => /\.(?:js|gs)$/.test(name))
    .map(name => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /\bfunction\s+(?:rescheduleHold|patchRow_)\s*\(/,
    'unreviewed legacy staging implementation imported into deployable GAS');
  assert.match(sources, /function\s+bookingReschedulePreflight_\s*\(/);
  assert.match(sources, /function\s+bookingReadOnlyAvailability_\s*\(/);
});
