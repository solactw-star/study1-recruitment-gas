# Read-only booking timestamp integrity (closed fixture, 2026-10-30)

The injected internal adapter now checks every populated timestamp cell in Slots.updated_at_utc and Reservations.hold_until_utc / created_at_utc / confirmed_at_utc / cancelled_at_utc / updated_at_utc, including historical CANCELLED and CONFIRMED rows whose timestamps are not otherwise used in capacity arithmetic. It uses the existing strict UTC `bookingInstant_` parser and rejects malformed date strings, non-UTC offsets, non-date types, and calendar rollover dates before any availability is returned. Blank optional lifecycle fields remain permitted; this is **not** a new REC or retention policy.

Closed fake-sheet tests cover malformed historical timestamps, invalid slot update metadata, and valid native Date cells. No private IDs are returned or logged. No real Sheets, GAS deployment, OTP delivery, or participant data are used.

Official references:
- Google Apps Script Range.getValues (String, Number, Boolean, Date): https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP input validation: https://devguide.owasp.org/en/04-design/02-web-app-checklist/05-validate-inputs/
- MDN Date.parse: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse

Remaining: double-read does not guarantee a transaction; metadata semantic order/status consistency requires researcher-approved policy. Public intake remains closed.
