# Study 1 — Booking read-only Sheet adapter (phase 1, CLOSED)

Date: 2026-10-29. This is an **internal test-only adapter**, not a public booking endpoint, a production atomic snapshot, or a GAS deployment.

- File: `gas/BookingReadOnlySheet.js`. Inject a spreadsheet opener, pinned to the existing 828 operations workbook ID. Only `Slots` and `Reservations` are read. No write method, email, or participant-facing function is added.
- Fail closed on wrong workbook ID, missing tab, wrong header order/width, malformed rows, excessive rows (10,000 maximum per tab as an operational safety guard), duplicate reservation IDs or idempotency keys, unknown statuses, orphan references and overcapacity.
- The internal raw snapshot **contains applicant IDs** and must never be exposed to client HTML, logs, or untrusted callers. `bookingReadOnlyAvailability_` returns only slot ID, UTC start/end and remaining seats.
- No real participant data in tests. Tests inject in-memory fake spreadsheet objects and assert no writes.
- Existing `Website.js` endpoints remain closed; `listSlots()` returns `[]`, `holdSlot()` refuses. No `SpreadsheetApp.openById` call was executed, and no live Sheet rows were read in this phase.
- **Limitations**: two sequential tab reads are not a consistent multi-tab transaction; not safe for final booking writes. Production booking requires script-wide locking for all writers, fresh locked reread, append+flush+readback, quota/authorization review, privacy/REC approval and a separately authorized GAS sync. Source drift from live GAS was not rehashed in this change.
- The candidate OPEN/HELD/CONFIRMED statuses and hold duration are not researcher-approved policy.

Official sources:
- Google SpreadsheetApp: https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app
- Google Sheet getLastRow/getLastColumn/getRange: https://developers.google.com/apps-script/reference/spreadsheet/sheet
- OWASP input validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
