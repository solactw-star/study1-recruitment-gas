# Booking read-only chronology integrity (closed fixture, 2026-10-30)

This incremental guard validates **semantic order** among populated UTC timestamps in every Reservations row, including cancelled/expired history. It rejects a populated hold expiry, confirmation, cancellation or last update that predates a populated creation timestamp; it also rejects a confirmation/cancellation timestamp after a populated last update. A date can be syntactically valid yet semantically inconsistent.

Missing optional timestamps remain allowed, and equal timestamps and native Date cells remain accepted. This does not introduce a REC eligibility rule, enforce a state transition, mandate lifecycle columns, or set a retention policy. Errors contain no applicant/reservation identifiers. It does not read real applicant data.

Test fixtures are entirely fictional and run with a fake injected Sheets adapter. No live Sheets write, public endpoint, OTP, GAS push or deployment. The two-pass read is best-effort drift detection, **not** a transactional snapshot; A→B→A or writes after the second pass remain possible.

Official sources:
- OWASP Input Validation Cheat Sheet (syntax and semantic consistency): https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- Google Apps Script Range.getValues (Date and primitive cell types): https://developers.google.com/apps-script/reference/spreadsheet/range#getvalues
- MDN Date.parse (date parsing semantics): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse

Remaining: researcher-approved lifecycle state requirements, genuine single-lock production transaction integration, remote GAS drift/hash verification, and consent/REC approvals. Public intake remains closed.
