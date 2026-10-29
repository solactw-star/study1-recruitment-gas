# Study 1 — read-only booking formula integrity (2026-10-30)

## Scope
Internal, closed-only booking availability preflight. No public endpoint, deployment, real participant data, production Sheet writes, or REC policy change. The only approved operations workbook remains `1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ`.

## Why
Google Apps Script `Range.getValues()` returns the evaluated cell values, whereas `Range.getFormulas()` returns the underlying formulas. A formula can produce a plausible value while depending on volatile or external state. Two equal value reads do not prove that the source cells are literal and stable.

## Implementation
`gas/BookingReadOnlySheet.js` now inspects the complete `Slots` and `Reservations` header/data ranges using `getFormulas()` on **both** snapshot passes. Any nonempty formula, missing API, or malformed formula grid fails closed before availability is returned. This includes cancelled and expired historical rows. The check never logs or returns applicant IDs. All existing two-pass comparison, lock coordination, row caps, and schema checks remain in place.

## Test evidence
`tests/booking-readonly-sheet.test.cjs` adds synthetic formula-bearing header, slot capacity, cancelled-history reservation, and malformed formula-matrix cases. `tests/booking-readonly-lock.test.cjs` adds a synthetic formula corruption case verifying that `finally` releases the lock. GitHub Actions must be checked on the exact final commit before this change is considered green.

## Limits
This is a defensive read guard, **not** a transactional snapshot: a concurrent writer, ABA change, or post-read modification may still escape detection. It does not establish production booking safety or approve the provisional booking statuses. Never run `clasp push --force` or enable intake without separate explicit researcher authorization and fresh GAS source drift/backup review.

## Official reference
Google Apps Script Range: https://developers.google.com/apps-script/reference/spreadsheet/range (`getValues()`, `getFormulas()`).
