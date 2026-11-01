# Closed hold transaction — mid-callback script-lock continuity (2026-11-01)

## Finding
The closed booking hold kernel already checked `hasLock()` immediately after a successful `tryLock()`, but an injected eligibility, snapshot or append callback could release the shared script lock after that initial check. A later append or success response could then occur without verified ownership.

## Change
`gas/BookingHoldTransaction.js` adds a fail-closed ownership check immediately after server eligibility, the first snapshot, the append, and the write-readback snapshot, plus a final pre-append check. Any callback that drops the lock causes an exception, not a successful hold response. `finally` still calls `releaseLock()`. No rollback is claimed: if a writer has already appended before losing the lock, the record must be reconciled; this guard prevents falsely acknowledging success.

`tests/booking-hold-lock-continuity-20261101.test.cjs` uses synthetic rows to cover eligibility loss, loss during initial read, append loss, readback loss and an intact successful hold. It also asserts no applicant ID or idempotency key appears in error messages and the public hold endpoint remains closed.

## Official references
- Google Apps Script [Lock class](https://developers.google.com/apps-script/reference/lock/lock) — `tryLock`, `hasLock`, `releaseLock`.
- Google Apps Script [LockService](https://developers.google.com/apps-script/reference/lock/lock-service) — script-wide lock.
- [OWASP ASVS](https://asvs.owasp.org/) — defensive server-side controls and secure failure.

## Limitations
This is a closed, injected test kernel, **not** a real Sheets transaction or a production guarantee. A GAS script lock only coordinates cooperating executions of the same project; external writers, manual edits and writes after lock release remain outside its scope. No real participant rows, GAS source sync, Google Sheet write, OAuth expansion, deployment, OTP, or consent signing occurred. The production append adapter, REC approval, authoritative remote source drift and consent gates remain unresolved. `OPEN=false` and `CONSENT_READY=false` must remain unchanged.
