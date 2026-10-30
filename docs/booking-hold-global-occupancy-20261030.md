# Study 1 — Closed booking hold global occupancy guard (2026-10-30)

The internal `bookingHoldOnceLocked_` kernel previously computed the requested slot's availability but could still append a hold when an **unrelated** slot was already overbooked or a CANCELLED slot still held a live booking. The sanitized read-only adapter already rejects these inconsistencies, but the separate hold transaction did not.

The new `bookingHoldAssertGlobalOccupancy_` checks **all slots** before append and after readback while the injected script-wide lock is held. Any slot with more active HELD/CONFIRMED bookings than capacity blocks the entire operation. An active booking on a CANCELLED slot also blocks. CLOSED slots may retain valid existing bookings; expired HELD rows are not counted. Errors do not disclose applicant IDs.

The change adds four fictional, in-memory Node tests for unrelated overcapacity, cancelled-slot live bookings, closed-slot history, and expired holds. It does **not** connect to live Sheets, perform writes, open public endpoints, or establish a transactional database guarantee. The existing 15-minute hold candidate and statuses remain unapproved. A lock cannot stop manual Sheet edits or external writers.

Official basis:
- OWASP Business Logic Security: https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html
- OWASP Input Validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- Google Apps Script LockService: https://developers.google.com/apps-script/reference/lock/lock-service

Production remains blocked pending source-drift comparison, researcher approval, current REC consent documents, controlled adapter integration, and separate explicit authorization. Do not deploy, synchronize GAS, or change OPEN=false / CONSENT_READY=false.
