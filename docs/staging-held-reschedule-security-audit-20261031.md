# Study 1 — legacy held-reschedule staging security audit (2026-10-31)

**Disposition: BLOCK / DO NOT MERGE OR DEPLOY.** This is a source-only, non-mutating audit of `staging/held-reschedule-20261029` against `main`. No live participant rows, GAS writes, production Sheets writes, OTP delivery or deployments were used. The old staging branch is preserved unchanged.

## Reproducible baseline

- Audited `main`: `83e178cd30718356be620ce5cb1322681cb6d9bc`.
- Audited legacy branch: `staging/held-reschedule-20261029` at `5798c218b428df89bd8f6c75db33fe17d3829070`.
- GitHub compare `main...staging/held-reschedule-20261029`: **diverged, ahead 3, behind 60**; branch-only files `staging/held-reschedule-20261029.gs` (56 lines) and `staging/held-reschedule-20261029.md` (43 lines). This is **not** a clean candidate for direct merge.
- Current `main` already has **separate, closed** `gas/BookingReschedulePreflight.js` and `gas/BookingCancelHoldPreflight.js` with `*_utc` schema and no public writer. Do not duplicate these modules.
- Source links: [legacy code](https://github.com/solactw-star/study1-recruitment-gas/blob/staging/held-reschedule-20261029/staging/held-reschedule-20261029.gs), [main reschedule preflight](https://github.com/solactw-star/study1-recruitment-gas/blob/main/gas/BookingReschedulePreflight.js), [main schema](https://github.com/solactw-star/study1-recruitment-gas/blob/main/gas/BookingCore.js).

## Blocking findings

| Priority | Evidence in legacy staging code | Risk and required disposition |
| --- | --- | --- |
| P0 — schema drift | Reads `held.hold_until`, `s.start_at`; writes `updated_at`. Verified current Reservations/Slots columns are `hold_until_utc`, `start_at_utc`, `updated_at_utc`. | Undefined dates or wrong logical mapping can invalidate expiry/availability or mutate the wrong field. Reject the old code; future writer must use exact current schema with fail-closed header and width checks. |
| P0 — unsafe write/readback | `patchRow_` performs a whole-row `getValues()` → `setValues()` → `flush()`, without verifying the row identity immediately before mutation or readback after mutation. | Locking only cooperating script executions does not make Sheets a database transaction; a stale row index or external edit can corrupt a reservation. Future writer needs locked fresh snapshot, immutable identity checks, field-scoped update contract, flush and full readback verification; any uncertain result must not report success. |
| P0 — idempotency collision | Checks whether the **selected** reservation reuses its request key for a different slot, but does not reject a `requestKey` already used by another reservation. | A duplicated key makes replay identity ambiguous. Apply workbook-wide uniqueness checks under the same lock before write, and verify afterward. |
| P1 — policy/identity uncertainty | `session_(token)` is used to find an applicant by email; this function itself does not call the current server-backed `isVerifiedAndEligible` gate. | Session validity alone must not be treated as REC-approved screening or a verified booking authorization. The current closed preflight requires the trusted server-side gate; production policy remains unapproved. |
| P1 — incomplete lifecycle consistency | Counts `FINALIZING` in occupancy, while the current provisional schema recognizes `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`. Does not validate all historical status/timestamp evidence before changing the target. | Do not silently normalize incompatible lifecycle vocabularies. Reconcile with approved REC and schema, validate globally, fail closed on contradictory records. |
| P1 — failure/side effect ambiguity | Writes before `audit_('RESCHEDULE_HOLD', ...)`; if audit fails, the reservation may already have changed. No compensating transaction or unambiguous failure status is specified. | Require explicit write/audit failure handling and recovery/incident procedure; no claim of atomicity from `SpreadsheetApp.flush()`. |
| P1 — duplicate function hazard | Legacy file explicitly says its functions belong in `gas/Api.gs` / `gas/Setup.gs` of an **offline ZIP**, not as an additional standalone GAS source. | Never push or copy this staging file directly into the single live GAS project. A manual, backed-up, hash-verified source reconciliation is required before any future source sync. |

## Existing protective coverage (not a staging merge approval)

- `tests/booking-reschedule-preflight.test.cjs` checks the verified `*_utc` schema and rejects legacy `hold_until` / `start_at` headers, disallows public `rescheduleHold`, and tests ownership, expiry, global capacity, duplicate live applicants, target state and no extension of hold.
- `tests/booking-hold-transaction.test.cjs` and the read-only adapter tests exercise global integrity and locked write/readback contracts with **synthetic** fixtures.
- Pending PR #12 already addresses active HELD expiry after slot start in the reschedule preflight. **Do not duplicate that change in this audit.**
- Existing tests are not proof of GAS/Sheets transactional atomicity, production identity verification, email OTP security, or approved consent.

## Acceptance criteria before any future production reschedule

1. Researcher approves REC-compatible status transitions, authorization rules and hold duration. Obtain final approved consent PDF and researcher-presigned reference before any consent flow.
2. Design a new internal, adapter-injected, **locked** reschedule transaction from current `*_utc` schema; do not transplant the old function. Validate verified eligibility, reservation ownership, current HELD and target slot, all historical records and globally unique request key.
3. On write, preserve original expiry; verify exactly one expected reservation changed and all other rows and Slots remain stable. Reject uncertain write results; define audit/recovery semantics and use synthetic race/failure fixtures.
4. Recheck live GAS source/hash and ownership with 828 `solac.tw@gmail.com`, verify fresh backup, complete CI and privacy/REC review. Only after explicit per-operation user authorization consider any GAS write or deployment.
5. Keep `SystemConfig.OPEN=false`, `CONSENT_READY=false`, public OTP/booking/signature endpoints closed until acceptance.

## Official technical basis

- Google Apps Script [LockService](https://developers.google.com/apps-script/reference/lock/lock-service): a script lock serializes cooperating script executions; it does not guarantee exclusion of external Sheets editors.
- Google Apps Script [Range.getValues/getFormulas/setValues](https://developers.google.com/apps-script/reference/spreadsheet/range): typed cell values, formula inspection and whole-range writes require explicit validation.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/): validate authorization and data integrity at trust boundaries.

**Audit outcome:** documented blockers only. No legacy branch merge, live GAS/Sheet mutation, or deployment.
