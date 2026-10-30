# Study 1 — Closed HELD cancellation preflight (2026-10-30)

## Scope and evidence
New internal `gas/BookingCancelHoldPreflight.js` and synthetic Node tests in
`tests/booking-cancel-hold-preflight.test.cjs`. This adds a **read-only**
preflight for cancelling an existing **active HELD** reservation only.
The public `cancelHold()` endpoint remains blocked. No participant data,
real Sheets, email, GAS deployment or PDF signatures are involved.

The preflight requires an injected **server-backed** verification and
REC-approved eligibility decision, then validates the complete injected
Slots/Reservations snapshot: exact schema, canonical status values,
UTC timestamp chronology, native numeric capacity, unique reservation
IDs/idempotency keys, orphan references, one active reservation per applicant,
global capacity, cancelled-slot conflicts, and active hold deadlines.
A matching owned, unexpired HELD may return only
`{allowed:true,reason:'LOCKED_RECHECK_REQUIRED'}`; all ordinary
nonmatching or terminal states return a generic rejection. Neither
applicant nor reservation IDs appear in results.

## Explicitly not implemented
This is **not** an actual cancellation transaction. It neither locks nor
updates a row, nor confirms that a cancellation occurred. The production
writer must revalidate trusted identity, current status and the entire
snapshot while holding the shared **script lock**; use a narrowly scoped
write, flush before releasing the lock, then read back and verify all
relevant invariants. Manual/external Sheets writers remain outside
Apps Script locking, so Sheets is not a transactional database.
Cancellation of CONFIRMED reservations is deliberately unsupported
pending researcher/REC-approved policy. No assumption is made about
fees, deadlines or confirmation cancellation rules.

## Official sources
- Google Apps Script LockService and script lock:
  https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Range.getValues()/getFormulas(), typed cells:
  https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP Input Validation Cheat Sheet (server-side syntax/semantics):
  https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP Business Logic Security Cheat Sheet (state/sequence checks):
  https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html

## Safety boundary
828 operations workbook and existing GAS are unchanged.
`SystemConfig.OPEN=false` and `CONSENT_READY=false` remain unchanged.
Before any future live use, verify latest GitHub main/CI, remote GAS drift,
owner permissions, approved REC documents and researcher's explicit approval.
