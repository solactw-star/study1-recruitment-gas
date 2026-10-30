# Study 1 — Booking read-only Sheet adapter (phase 1, CLOSED)

Date: 2026-10-29. This is an **internal test-only adapter**, not a public booking endpoint, a production atomic snapshot, or a GAS deployment.

- File: `gas/BookingReadOnlySheet.js`. Inject a spreadsheet opener, pinned to the existing 828 operations workbook ID. Only `Slots` and `Reservations` are read. No write method, email, or participant-facing function is added.
- Fail closed on wrong workbook ID, missing tab, wrong header order/width, malformed rows, excessive rows (10,000 maximum per tab as an operational safety guard), duplicate reservation IDs or idempotency keys, unknown statuses, orphan references and overcapacity.
- The internal raw snapshot **contains applicant IDs** and must never be exposed to client HTML, logs, or untrusted callers. `bookingReadOnlyAvailability_` returns only slot ID, UTC start/end and remaining seats.
- No real participant data in tests. Tests inject in-memory fake spreadsheet objects and assert no writes.
- Existing `Website.js` endpoints remain closed; `listSlots()` returns `[]`, `holdSlot()` refuses. No `SpreadsheetApp.openById` call was executed, and no live Sheet rows were read in this phase.
- **Limitations**: two sequential tab reads are not a consistent multi-tab transaction; not safe for final booking writes. Production booking requires script-wide locking for all writers, fresh locked reread, append+flush+readback, quota/authorization review, privacy/REC approval and a separately authorized GAS sync. Source drift from live GAS was not rehashed in this change.
- Additional cell-type integrity guard (2026-10-30): `Slots.capacity` must be a native positive safe integer number from `getValues()`; a text cell such as `'2'` fails closed rather than being silently coerced. This is an adapter storage-integrity check, not a new REC capacity policy. The pure booking kernel remains unchanged.
- Additional consistency check: an active HELD row whose expiry is later than its slot start is rejected. This matches the already-existing closed hold transaction precondition; it does not approve a hold-duration policy. Cancelled history is not treated as a live hold.
- Additional integrity guard (2026-10-30): if a `CANCELLED` slot still has an active `HELD` or `CONFIRMED` reservation, the entire availability response fails closed. Historical `CANCELLED`/`EXPIRED` reservations and expired `HELD` rows do not trigger this rule. A `CLOSED` slot may retain existing reservations; it is not treated as cancelled. This detects inconsistent stored state but does not itself perform cancellation or approve lifecycle policy.
- Verification: the booking-readonly-sheet test file has 26 in-memory V8 harness checks passing after the fixture chronology correction. This is not a native Node test runner or a confirmed GitHub Actions run; verify the full CI separately.
- The candidate OPEN/HELD/CONFIRMED statuses and hold duration are not researcher-approved policy.

Official sources:
- Google SpreadsheetApp: https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app
- Google Sheet getLastRow/getLastColumn/getRange: https://developers.google.com/apps-script/reference/spreadsheet/sheet
- OWASP input validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
