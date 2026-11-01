# Study 1 OTP — script-lock continuity guard (2026-11-01)

## Finding and change
The closed `otpVerifyOnceLocked_` kernel previously trusted `tryLock(5000) === true` without checking `hasLock()`, and it could acknowledge a verified code after an injected callback released the lock. This is a concurrency integrity issue in the offline adapter contract.

`gas/OtpTransaction.js` now requires the Google Lock API's `hasLock()` and checks actual ownership after acquisition, after the first Verification snapshot, after secret evaluation, after F:G write, and after the readback snapshot. Any loss fails closed, including when the write may already have occurred. `finally` still releases the lock. The change does **not** claim rollback, transactionality, or protection from external Sheets edits.

`tests/otp-transaction.test.cjs` updates its fake lock to match the documented Google API. `tests/otp-lock-continuity-20261101.test.cjs` adds synthetic regression cases for missing/false lock ownership, callback-induced lock loss during first read, secret evaluation, write and readback, plus intact verification and closed public endpoints.

## Limits
No real participant data, email, OTP issuance, live GAS/Sheets access, clasp push or deployment. OTP parameters remain provisional; CSPRNG issuance, trusted server clock pinning, full account-level atomic issuance, live adapter and recovery are still incomplete. `OPEN=false`, `CONSENT_READY=false` and all public OTP endpoints remain closed. An OTP write that precedes a lost lock requires reconciliation rather than an automatic success response.

Official reference: Google Apps Script [LockService](https://developers.google.com/apps-script/reference/lock/lock-service) and [Lock.hasLock()/releaseLock()](https://developers.google.com/apps-script/reference/lock/lock). Google documents `hasLock()` as the way to confirm ownership and recommends flushing pending spreadsheet changes before releasing a lock.
