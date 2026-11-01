# Study 1 — Closed booking preflight clock pinning (2026-11-01)

**Scope:** internal-only `bookingReschedulePreflight_` and `bookingCancelHoldPreflight_`. No live GAS/Sheets writes, no real applicant data, no deployment, and no new public endpoints.

## Finding and correction

Both preflights validated `request.nowUtc` into a numeric `now`, but later passed the **original** `request.nowUtc` to `bookingComputeAvailability_` *after* calling injected `isVerifiedAndEligible` and `readSnapshot`. An injected callback could mutate a Date object or replace the request property. This created two different time boundaries in one decision, potentially making a still-active target hold appear expired during a reschedule preflight.

Each preflight now freezes `stableNowUtc = new Date(now).toISOString()` immediately after validating the supplied clock and passes only that immutable string to the availability kernel. Its existing numeric `now` remains the single boundary for other active-hold checks. This is a closed preflight consistency fix, not a reservation transaction or REC policy change.

## Evidence

- Modified: `gas/BookingReschedulePreflight.js` (commit `4ebac8321ffb078138b9787c4bae83b2d4525872`).
- Modified: `gas/BookingCancelHoldPreflight.js` (commit `1629f9298089ad593004b8ef707680dfb5425486`).
- Added: `tests/booking-preflight-clock-pinning-20261101.test.cjs` (commit `8273a467794b2bc23fa2f5c6b069f41eeb36b59b`).
- Synthetic regression cases: Date mutated during eligibility callback; request.nowUtc replaced during snapshot callback; target capacity=1 with another applicant's active hold; observed availability clock stays at the original validated instant; no real Sheet writes.
- GitHub Actions: https://github.com/solactw-star/study1-recruitment-gas/actions/runs/41260219214 — completed success, **215/215 tests passed**, 0 failed, at commit `8273a467794b2bc23fa2f5c6b069f41eeb36b59b`.

## Boundaries and remaining work

This is only an internal, injected-adapter preflight. It does not guarantee an atomic cross-tab snapshot, prove real-world capacity consistency, or authorize any cancellation/reschedule. Production still needs a shared script-wide lock for cooperating writers, fresh locked revalidation, audited writes, readback, an approved REC workflow, latest remote GAS hash/drift check, and separately authorized source sync. The diverged `staging/held-reschedule-20261029` branch must remain unmerged. Keep `OPEN=false` and `CONSENT_READY=false`.

Official references:
- Google Apps Script Range.getValues (Date values, cell types): https://developers.google.com/apps-script/reference/spreadsheet/range
- Google Apps Script LockService: https://developers.google.com/apps-script/reference/lock
- OWASP Input Validation Cheat Sheet (type/semantic validation and untrusted internal sources): https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
