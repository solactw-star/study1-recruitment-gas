# Closed hold transaction: verify script lock ownership (2026-11-01)

The injected booking hold kernel previously trusted `tryLock(5000) === true` without checking `hasLock()`. A faulty adapter could reach eligibility and a booking append without verified ownership.

`bookingHoldOnceLocked_` now requires `tryLock`, `hasLock` and `releaseLock`; checks `hasLock() === true` inside `try/finally` before any eligibility/data access; and fails closed on missing API, false ownership, or exceptions. All synthetic fixtures were updated. New tests verify lock release and no data access on failures. No real Sheets, GAS, participant data, OTP or deployment are involved.

Official references: [Google Lock](https://developers.google.com/apps-script/reference/lock/lock), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service), [OWASP ASVS 5.0](https://asvs.owasp.org/).

A script lock only serializes cooperating executions of the same GAS project. External writers/manual edits remain outside its protection. This is a closed test kernel, not production booking or IRB approval. `OPEN=false` and `CONSENT_READY=false` are unchanged. Remote GAS hash/drift has not been revalidated.
