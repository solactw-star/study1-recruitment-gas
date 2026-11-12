'use strict';
// Static WCAG regression for the CLOSED information page. This does not
// substitute for browser, screen-reader or keyboard-only user testing.
// W3C G1: https://www.w3.org/WAI/WCAG21/Techniques/general/G1
// W3C ARIA22: https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'gas/Index.html'), 'utf8');

test('skip link is first interactive element and targets a focusable main landmark', () => {
  const skip = html.match(/<a\s+class="skip"\s+href="#main">[^<]+<\/a>/);
  const main = html.match(/<main\s+id="main"\s+tabindex="-1">/);
  assert.ok(skip, 'visible-on-focus skip link must remain');
  assert.ok(main, 'skip target must accept focus without adding a Tab stop');
  assert.ok(skip.index < html.indexOf('<header'), 'skip link precedes repeated navigation');
  assert.ok(skip.index < main.index, 'skip target follows the skip link');
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /\.skip:focus\{top:8px\}/);
});

test('async closed-state message has an existing polite, atomic status region', () => {
  const status = html.match(/<p\s+id="health"\s+role="status"\s+aria-live="polite"\s+aria-atomic="true">/);
  assert.ok(status, 'entire status should be announced without moving focus');
  assert.ok(status.index < html.indexOf('<script>'), 'status exists before async callback');
  assert.match(html, /\.getPublicConfig\(\)/);
});

test('accessibility fix cannot enable data collection or signing', () => {
  assert.match(html, /<a\s+class="btn"\s+href="https:[^"]+\/exec\?view=apply"\s+target="_top"/);
  assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,0);
  assert.ok(inputs.every(x=>/\bdisabled\b/.test(x)));
  assert.doesNotMatch(html,/id="consentSignature"|initConsentPortal_/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
});
