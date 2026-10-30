# Study 1 — Closed reschedule preflight and staging divergence (2026-10-30)

## Source-of-truth review

Read the current private `main` source, existing read-only/hold kernels and
`staging/held-reschedule-20261029`. The staging branch is **diverged** and
its `rescheduleHold()` is **not** approved for merging or deploying.

Concrete incompatibilities in the staging code versus the current 828
operations workbook:

- Staging reads `hold_until`, `start_at`, and `updated_at`, whereas the
  verified current schema uses `hold_until_utc`, `start_at_utc`, and
  `updated_at_utc`. It must not be assumed to work against current Sheets.
- Staging counts `FINALIZING` reservations, a status absent from the current
  provisional kernel vocabulary (`HELD/CONFIRMED/CANCELLED/EXPIRED`).
- Staging `patchRow_()` rewrites an entire Sheet row. This is not a
  transactional multi-row move and lacks a fresh post-write invariant check.
- Staging uses a session email and live mutation paths; it is not equivalent
  to the closed server-trusted applicant verification and locked write/readback
  contract in the newer `BookingHoldTransaction.js`.

## This increment

Added `gas/BookingReschedulePreflight.js` as an **internal-only**, closed
preflight, deliberately separate from the staging implementation. It accepts
a trusted injected snapshot and a server-backed eligibility callback. It
validates exact current headers, all historical rows, canonical statuses,
UTC chronology, uniqueness of active applicant reservations, and global
occupancy before deciding whether an existing active `HELD` can be moved
to an available `OPEN` future slot without extending its original expiry.
Same-slot requests are no-op decisions; failures are generic and contain no
applicant or reservation identifiers.

It **does not write**, does not acquire a production lock, does not open
Sheets, does not authenticate users, and does not return a reservation ID.
`LOCKED_RECHECK_REQUIRED` is a preflight decision, **not** authorization
to change data. The production writer must obtain the shared script lock,
re-read and validate the latest workbook, make a single carefully reviewed
write, flush, read back, and reject any mismatch. Manual edits and external
writers can still bypass the lock; Sheets is not a transactional database.

Synthetic offline tests cover ownership/verification, expired and terminal
holds, full or closed targets, expiry preservation, corrupted global history,
and old staging header mismatch. No live personal data is used.

## Official references

- Google Apps Script Lock Service:
  https://developers.google.com/apps-script/reference/lock/
- Google Apps Script Range values, types and formulas:
  https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP Input Validation Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP ASVS 5.0:
  https://github.com/OWASP/ASVS/tree/master/5.0/en

## Gates remaining

Fresh remote GAS hash/drift verification, approved REC screening and
reservation policy, actual server identity verification, safe locked
reschedule transaction, Sheets failure/recovery tests, and final consent
PDF/signature/IRB/security approval. Keep `OPEN=false`,
`CONSENT_READY=false`; never run `clasp push --force`, write live Sheets,
or deploy from this change.
