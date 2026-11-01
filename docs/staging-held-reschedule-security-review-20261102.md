# Study 1 — Legacy held-reschedule staging security review (2026-11-02)

**Disposition: BLOCK MERGE / BLOCK DEPLOY.** This is a closed-source static review of the existing `staging/held-reschedule-20261029` branch, **not** a change to GAS, Sheets, permissions, live reservations, or recruitment status. Do not import its `staging/held-reschedule-20261029.gs` directly into `gas/`.

## Evidence checked

- `main` at `f6dcc8354d4956c535605879958b1fe4fe79784e` before this review; staging comparison: **diverged, ahead 3 / behind 127** at the time of inspection. Staging contains only `staging/held-reschedule-20261029.gs` and its accompanying `.md` relative to the merge base.
- Current `gas/BookingCore.js` defines `start_at_utc`, `hold_until_utc`, `updated_at_utc`; `gas/BookingReschedulePreflight.js` and `gas/BookingCancelHoldPreflight.js` are internal, read-only, and intentionally do **not** perform rescheduling/cancellation writes.
- 828 operations workbook `1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ` was read **only for SystemConfig A1:B20** during this review: `OPEN=false`, `CONSENT_READY=false`, contact `lily4318@cycu.edu.tw`. No participant rows were read.

## Merge blockers identified in legacy staging

1. **Schema mismatch:** legacy code reads `held.hold_until` and `target.start_at`, and writes `updated_at`, whereas the verified current schema uses `hold_until_utc`, `start_at_utc`, `updated_at_utc`. Do not assume aliases exist; a direct import may misread expiration and corrupt or reject records.
2. **Legacy state vocabulary:** it counts `FINALIZING` as occupied, but the current provisional booking kernel recognizes only `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`. State transitions and eligibility are not REC-approved.
3. **Unsafe broad row rewrite:** `patchRow_` reads the entire row and calls `range.setValues([row])`. This rewrites unchanged cells and has no post-write full-row verification. It must not be deployed before a schema-aware, narrow write with locked readback and failure reconciliation is designed and tested.
4. **Idempotency ambiguity:** `rescheduleHold` replaces `idempotency_key` with a new request key without globally validating key uniqueness or preserving a stable request history. Same-slot success is returned without proving that the request is an authentic replay; replay/collision policy needs a separate design.
5. **Lock/readback gaps:** `waitLock(15000)` is called, but the legacy path does not recheck `hasLock()` around injected reads and writes and does not re-read the updated reservation and global occupancy before claiming success. `finally` release alone is not enough.
6. **Insufficient workbook integrity validation:** it computes capacity from selected rows, without the complete canonical headers, duplicate ID/key, unrelated-slot overcapacity, lifecycle chronology, and whole-workbook consistency checks now present in the closed kernels.

## Safe incremental action

- `tests/staging-reschedule-quarantine.test.cjs` already blocks an unreviewed `rescheduleHold` function from deployable `gas/`. A new regression test now also blocks importing the legacy `patchRow_` row-rewrite helper. This is a **static quarantine check**, not proof that a future reschedule transaction is safe.
- Keep staging isolated. A future implementation should reuse current `*_utc` schema and validation kernels, require verified server-side applicant/REC eligibility, hold a cooperating script-wide lock through fresh reads and narrow write/flush/readback, preserve stable idempotency semantics, and test race/replay/failure compensation using synthetic fixtures.
- Before any live GAS synchronization: obtain a fresh remote GAS source hash/diff and backup, verify CI on the exact reviewed commit, run authorized integration tests, obtain explicit researcher approval. The 2026-10-29 remote ZIP is historical and does not establish current remote drift.

## Official technical references

- Google Apps Script LockService: https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Lock (including SpreadsheetApp.flush before release): https://developers.google.com/apps-script/reference/lock/lock
- OWASP ASVS 5.0.0: https://asvs.owasp.org/

**Safety state:** No GAS/Sheets writes, no clasp push, no deployment, no opening intake or consent. `OPEN=false` and `CONSENT_READY=false` remain unchanged. This review does not modify REC, FAST, QC, or HTML MASTER.
