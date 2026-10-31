# Study 1 — legacy reschedule staging quarantine audit (2026-10-31)

**Scope:** static, read-only comparison of `staging/held-reschedule-20261029.gs` against the current canonical `gas/BookingCore.js`, `gas/BookingHoldTransaction.js`, `gas/BookingReadOnlySheet.js`, and `gas/BookingReschedulePreflight.js`. This is a **quarantine audit**, not a production implementation, merge approval, GAS sync, or proof of transactional consistency. No real participant data was accessed.

## Blocking findings

1. **Schema mismatch (BLOCKER).** The legacy staging function reads `held.hold_until`, `s.start_at`, and writes `updated_at`, whereas the verified 828 operations workbook schema uses `hold_until_utc`, `start_at_utc`, and `updated_at_utc`. Using the staging code against the current Sheet could misinterpret expiry or write the wrong column.
2. **Status vocabulary mismatch (BLOCKER).** Legacy staging treats `FINALIZING` as occupied. The current closed booking kernel's provisional statuses are `OPEN/CLOSED/CANCELLED` for slots and `HELD/CONFIRMED/CANCELLED/EXPIRED` for reservations. Neither set is yet researcher-approved. Do not silently drop or reinterpret an unknown stored status.
3. **Incomplete global integrity checks (BLOCKER).** The legacy function counts only the target slot, does not validate all historical reservation IDs and idempotency keys, orphan references, duplicate active applicants, or contradictions in event chronology. It uses `Number(target.capacity)` rather than requiring the native numeric Sheet cell type. The closed preflight and read-only adapter already contain stricter guards; do not bypass them.
4. **Write/readback and recovery (BLOCKER).** The legacy `patchRow_` writes the entire row via `setValues`, including unrelated cells, then flushes; it does not reread the row and both tabs to verify a stable result, nor does it provide recovery on partial failure. Script-wide locks only serialize cooperating executions in the same script; they do not make Sheets a database transaction or protect against external editors.
5. **Replay semantics and authorization (BLOCKER).** A same-slot request returns success before checking that the supplied request key matches the existing key. The function relies on `requireOpen_` and `session_` without the explicit server-trusted REC eligibility/consent gate required by the newer closed hold kernel. A legacy email session is not equivalent to a completed approved screening and consent process.
6. **Source drift not reverified (BLOCKER).** 828 GAS remote source hash/drift has not been rechecked. No clasp push, deployment, or public API opening is authorized.

## Increment completed in this audit

`tests/staging-reschedule-quarantine.test.cjs` adds CI-enforced regression checks that (a) no unreviewed public `rescheduleHold` function appears in any `gas/*.js` or `gas/*.gs` source file, (b) the canonical `*_utc` field names and current provisional status vocabulary stay explicit, and (c) only the internal, write-free preflight exists while the website's booking endpoints remain closed. The legacy source was reviewed through its separate staging branch; CI deliberately does not depend on files that are absent from `main`. The checks use repository source files only, not live Sheets or personal data.

**Resolution:** keep `staging/held-reschedule-20261029` unmerged. Future implementation should use the verified canonical `*_utc` schema, the latest closed preflight, a single script-wide lock for all cooperating writers, fresh locked validation, explicit approved screening and consent, write/flush/readback checks, failure recovery, and researcher approval before any GAS sync or deployment. Remove or revise this quarantine test only in a separately reviewed change with explicit authorization; it is deliberately a temporary release guard.

Official references:
- Google LockService: https://developers.google.com/apps-script/reference/lock/lock-service
- Google Spreadsheet Range.getValues/getFormulas: https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
