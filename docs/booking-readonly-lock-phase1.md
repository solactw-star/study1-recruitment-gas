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

**2026-11-01 lock-ownership parity hardening:** The older `BookingReadOnlyLock.js` wrapper now requires `hasLock()` and explicitly checks that it returns `true` after `tryLock()` succeeds. A fake or inconsistent lock cannot open the private workbook; a successfully acquired lock is released in `finally` on this error. This aligns with `BookingReadOnlyLocked.js` without wiring either function to public endpoints. Regression tests cover a missing `hasLock` method and a contradictory `tryLock=true` / `hasLock=false` result. This is a closed fixture-only integrity improvement, not a production lock guarantee.

**2026-11-02 completion-time lock ownership check:** The legacy `BookingReadOnlyLock.js` wrapper now checks `hasLock() === true` **again after** the two-pass Slots/Reservations read and before returning sanitized availability. A lock lost during reading rejects the entire result; `finally` still releases the lock. Added a synthetic regression in `tests/booking-readonly-lock.test.cjs` that drops ownership during the second Reservations header read. CI run [41330692076](https://github.com/solactw-star/study1-recruitment-gas/actions/runs/41330692076) passed **252/252** tests for code/test commit `2ca95a3628e2e0ffc5a43f535002ed0332d29664`. This closes a parity gap with the newer `BookingReadOnlyLocked.js` wrapper; it does **not** make Sheets reads atomic or protect against noncooperating writers. Official basis: [Apps Script Lock.hasLock](https://developers.google.com/apps-script/reference/lock/lock), [OWASP ASVS 5.0.0](https://asvs.owasp.org/). Public intake, live GAS and Sheets remain untouched.
