# Locked booking hold: canonical Sheet storage guard (2026-10-31)

## Scope
Closed/internal `bookingHoldOnceLocked_` test kernel only. No live Sheets,
GAS deployment, email, eligibility policy, or public endpoint changes.

## Finding
`bookingComputeAvailability_` intentionally normalizes status case and can
parse a text capacity such as `"2"`. The read-only Sheet preflight already
rejects these storage anomalies, but the *locked writer* previously accepted
them in its injected snapshot. This could allow an unrelated malformed slot
or historical reservation to coexist with a newly appended hold.

## Change
`bookingHoldAssertCanonicalStorage_` validates **all** Slots and Reservations
rows before an append, even rows unrelated to the requested slot:

- Slot capacity must be a native, safe, positive integer (not a string or checkbox).
- Slot status must be exactly `OPEN`, `CLOSED`, or `CANCELLED`.
- Reservation status must be exactly `HELD`, `CONFIRMED`,
  `CANCELLED`, or `EXPIRED`.
- Optional slot `location_code` and `created_by` remain optional, but must
  be text cells (empty text is accepted).

Failures are generic and do not expose applicant IDs, keys, or other private
row contents. This reuses **provisional** existing enum values; it does not
approve any REC policy or change eligibility.

## Evidence
`tests/booking-hold-transaction.test.cjs` adds synthetic cases for
case/whitespace drift in both status columns, text/checkbox/noninteger
capacity, nontext metadata, and legitimate empty text metadata.
The repository's CI must pass before considering this increment verified.

## Official references
- Google Apps Script LockService:
  https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Lock (flush before releasing for actual Sheets writes):
  https://developers.google.com/apps-script/reference/lock/lock
- OWASP ASVS 5.0 (application security verification):
  https://asvs.owasp.org/

## Remaining limitations
This is **not** a live Sheet adapter, atomic Google Sheets transaction,
authorization check, production reservation system, or deployment.
A script-wide lock only coordinates callers using that same lock; manual
edits and external writers can still race. Remote GAS source drift/hash
remains unverified. Formal intake and consent must remain closed.
