# Study 1 — Closed booking read-lock preflight (2026-10-30)

This is an **internal, offline-tested** guard; it does not connect to a real Google Sheet, deploy a GAS project, or open registration/consent. The new `gas/BookingReadOnlyLock.js` exposes only `bookingReadOnlyAvailabilityWithLock_`, which delegates to the existing sanitized `bookingReadOnlyAvailability_` **after** a caller-injected lock has been acquired.

The trusted GAS integration, if later separately approved, must inject a getter returning **the same script-wide lock** used by every booking writer (not a user/document lock). On lock contention or an invalid lock interface the function refuses to open the workbook. It releases an acquired lock in `finally` even if schema or snapshot validation fails. The lock is never released if acquisition failed.

Tests in `tests/booking-readonly-lock.test.cjs` use fictional in-memory Sheets and a fake lock to check acquisition-before-read, contention, invalid dependency, lock exceptions, release on failure, sanitized output, and closed public endpoints. No production adapter has been connected.

**Important limits:** a Google Apps Script script lock only coordinates cooperating executions of that script. It does not stop direct spreadsheet edits, other Apps Script projects, Sheets API writers, changes after releasing the lock, or every possible A→B→A change. The underlying two-pass read remains best-effort. Neither this wrapper nor its tests establishes a serializable snapshot or safe write transaction. Do not wire it to public `listSlots()` until full REC, security, and researcher acceptance.

Official references:
- Google Apps Script LockService / script lock: https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Lock.tryLock / releaseLock: https://developers.google.com/apps-script/reference/lock/lock
- Google Apps Script Sheet.getRange/getLastRow: https://developers.google.com/apps-script/reference/spreadsheet/sheet
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

Remaining: production writer coordination, current remote GAS source hash/drift, official consent PDF and IRB validation, researcher-approved policies, and a separately authorized sync/deployment. `OPEN=false` and `CONSENT_READY=false` must remain unchanged.
