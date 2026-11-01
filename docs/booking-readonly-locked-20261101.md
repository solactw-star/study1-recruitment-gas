# Study 1 — closed script-lock-coordinated read-only availability (2026-11-01)

## Scope
Added `gas/BookingReadOnlyLocked.js` and `tests/booking-readonly-locked.test.cjs`. This is a **new internal-only wrapper** around the existing two-pass read-only adapter, not a replacement of the existing adapter, and not a public booking endpoint. It uses a caller-injected `getScriptLock` provider and spreadsheet opener. The provider MUST return the **same script-wide lock** used by all cooperating booking writers (Google Apps Script `LockService.getScriptLock()`). Do not inject a document or user lock.

The wrapper validates and freezes the supplied UTC clock before callbacks; refuses missing/malformed lock interfaces, contention, or inconsistent `hasLock()`; reads both Slots and Reservations while the acquired lock is held; releases in `finally` even on schema, formula, or data-integrity errors. It never logs raw reservation rows or writes data. Test fixtures are invented and contain no actual participant information.

## Official sources
- Google Apps Script Lock Service: https://developers.google.com/apps-script/reference/lock
- Google Apps Script Lock class (`tryLock`, `hasLock`, `releaseLock`): https://developers.google.com/apps-script/reference/lock/lock
- Google Apps Script Range (`getValues`, `getFormulas`): https://developers.google.com/apps-script/reference/spreadsheet/range
- OWASP ASVS 5.0.0: https://asvs.owasp.org/

## Limits and release gate
- A script lock coordinates only **cooperating executions within this GAS project**. Manual Sheet edits, independent scripts, direct Sheets API writers, and edits after lock release can still invalidate a result. Two-pass comparison is **not** a database transaction or reservation guarantee.
- No live `LockService` or `SpreadsheetApp` call was made in this phase. This wrapper is not called by a public endpoint. The locked writer's real Sheet adapter, authenticated eligibility, research screening, CSPRNG, approved hold policy, consent PDF and security/IRB acceptance remain separate prerequisites.
- Do not deploy, enable intake, change `SystemConfig`, write Sheets, or run `clasp push --force` without explicit researcher authorization and remote source drift verification.
- Tests exercise acquired/denied/inconsistent lock, error cleanup, malformed schema, frozen mutable Date clock, no private fields in output and closed endpoints. Use the latest Actions run for CI evidence; **a commit alone does not establish passing CI**.

## Data ownership and protected resources
Only private GitHub `solactw-star/study1-recruitment-gas`; official GAS and operations Sheet remain owned by `solac.tw@gmail.com`. This change did not modify GAS, Google Sheets, REC, FAST, QC, HTML MASTER, or staging reschedule branch.
