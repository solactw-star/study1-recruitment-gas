# Study 1 read-only cross-tab drift guard (phase 2, 2026-10-29)

Internal `bookingReadOnlySnapshot_` now reads **Slots then Reservations twice**, verifies
exact headers, dimensions, and all cell values across both passes, and rejects any
difference before availability is returned. This detects observed concurrent edits
(including slot capacity, reservation status, and private fields) without logging or
returning applicant identifiers. Date values are defensively cloned and compared by
UTC epoch milliseconds, not by object identity or JSON serialization. Invalid dates,
non-finite numbers and unsupported object values fail closed.

All tests use invented fixture data and injected fake sheets; there are **no real
Google Sheets reads or writes** and no GAS deployment. The public site still rejects
intake; `OPEN=false` and `CONSENT_READY=false` must remain unchanged.

**Security boundary:** Double-read comparison is **not** an atomic database
transaction or a guaranteed consistent snapshot. It cannot rule out an ABA change,
a write after the second pass, independent writers, or race conditions between a
read and an eventual booking. The production reservation writer must use a single
script-wide lock and re-check fresh capacity/eligibility inside that lock, and the
team must validate how other Sheet editors are prevented from bypassing it. The
double read also increases read cost; assess Apps Script quotas before deployment.

Official references:
- Google Sheet getLastRow/getLastColumn/getRange:
  https://developers.google.com/apps-script/reference/spreadsheet/sheet
- Google LockService/getScriptLock:
  https://developers.google.com/apps-script/reference/lock/lock-service
- MDN Date/getTime:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime
- OWASP ASVS 5.0.0:
  https://asvs.owasp.org/

This is a closed-fixture safety increment, not approval of any study eligibility,
hold policy, or consent procedure.
