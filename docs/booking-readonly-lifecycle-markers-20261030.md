# Study 1 — read-only reservation lifecycle marker integrity (2026-10-30)

Scope: CLOSED, internal-only `bookingReadOnlyAvailability_`; no public endpoint, Google Sheet write, GAS sync, deployment, or change to REC criteria.

## Failure mode and narrow fix

An imported row may say `HELD` while `confirmed_at_utc` or `cancelled_at_utc` is populated, or say `CONFIRMED` while `cancelled_at_utc` is populated. The old capacity calculation treated these rows as active despite evidence of a later state transition. Such contradictory rows now fail closed **before** availability is returned, even if there are spare seats or the HELD expiry is already past.

This is an integrity assertion against contradictory positive evidence, not a new mandatory timestamp policy: a `CONFIRMED` row without `confirmed_at_utc` is still accepted pending researcher-approved lifecycle rules. A `CANCELLED` row may retain both confirmation and cancellation timestamps (confirmed then cancelled). `EXPIRED` historical rows are unchanged. The existing timestamp validity and chronological checks still apply.

## Changes and verification

- `gas/BookingReadOnlySheet.js`: `bookingReadOnlyValidateLifecycleMarkers_` runs after canonical status and temporal checks, before any result is returned.
- `tests/booking-readonly-sheet.test.cjs`: four contradictory scenarios (including an expired HELD), three accepted historical scenarios, and PII-free exception assertions using fabricated data.
- CI: GitHub Actions `GAS static safety checks` is triggered by the pull request; inspect its final result before merge.
- No real `SpreadsheetApp.openById` or participant row is used. The adapter's two-pass cross-tab read is **not** a transaction and remains unsuitable as a booking-write consistency guarantee.

## Official engineering references

- Google Apps Script `Range.getValues` and `getFormulas`: https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP Application Security Verification Standard 5.0.0 (input/data integrity): https://asvs.owasp.org/
- OWASP Input Validation Cheat Sheet (server-side semantic validation): https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

The OPEN/HELD/CONFIRMED lifecycle vocabulary and hold duration remain provisional until research approval. `OPEN=false`, `CONSENT_READY=false`, and public `listSlots()=[]` must remain unchanged.
