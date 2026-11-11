'use strict';
// Closed information-page static regression. Browser/assistive-technology
// verification remains required before release.
// WCAG 2.2 SC 2.5.8: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
// WCAG 2.2 SC 1.4.3: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'gas/Index.html'), 'utf8');

function cssRule(selector) {
  const needle = selector + '{';
  const start = html.indexOf(needle);
  assert.ok(start >= 0, 'missing CSS rule ' + selector);
  const end = html.indexOf('}', start + needle.length);
  assert.ok(end > start, 'unterminated CSS rule ' + selector);
  return html.slice(start + needle.length, end);
}
function channel(hex) {
  const v = parseInt(hex, 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i);
  const digits = hex.length === 4
    ? hex.slice(1).split('').map(x => x + x)
    : hex.slice(1).match(/.{2}/g);
  const [r, g, b] = digits.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}
test('navigation links have 44px-high pointer targets including compact layout', () => {
  const nav = cssRule('nav a');
  assert.match(nav, /display:inline-flex/);
  assert.match(nav, /align-items:center/);
  assert.match(nav, /min-height:44px/);
  assert.match(html, /<nav aria-label="主要導覽">/);
  assert.match(html, /@media\(max-width:600px\)/);
  // The mobile override must not shrink the link target.
  assert.doesNotMatch(html, /@media\(max-width:600px\)[\s\S]*?nav a\{[^}]*min-height:(?:[0-3]?\d)px/);
});
test('decorative Memory & Body label has legible white-on-teal contrast', () => {
  const art = cssRule('.art div');
  const bg = art.match(/(?:^|;)background:(#[0-9a-f]{3,6})(?:;|$)/i);
  const fg = art.match(/(?:^|;)color:(#[0-9a-f]{3,6})(?:;|$)/i);
  assert.ok(bg && fg, 'explicit decorative text colors required');
  assert.ok(contrast(bg[1], fg[1]) >= 4.5, 'decorative label contrast should meet 4.5:1');
  assert.match(html, /<div class="art" aria-hidden="true">/);
});
test('touch-target improvement does not enable intake, tracking or signatures', () => {
  assert.match(html, /<a class="btn" href="https:[^"]+\/exec\?view=apply" target="_top"/);
  assert.doesNotMatch(html,/<(?:form|textarea)\b/i);
  const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(x=>x[0]);
  assert.equal(inputs.length,0);
  assert.ok(inputs.every(x=>/\bdisabled\b/.test(x)));
  assert.doesNotMatch(html,/id="consentSignature"|initConsentPortal_/);
  assert.doesNotMatch(html, /<script[^>]+\bsrc=/i);
  assert.match(html, /mailto:lily4318@cycu\.edu\.tw/);
});
