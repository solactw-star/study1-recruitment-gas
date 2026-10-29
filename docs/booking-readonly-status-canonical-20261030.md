# Study 1 — Closed read-only status integrity guard (2026-10-30)

This increment checks **stored** `Slots.status` and `Reservations.status` for exact canonical spelling before offering any sanitized availability. The general booking computation intentionally normalizes case/whitespace; silently accepting a noncanonical persisted value can hide data corruption, so the read-only adapter now fails closed. Every nonblank row is checked, including historical cancelled/expired records and closed slots.

Accepted provisional values are Slots: `OPEN`, `CLOSED`, `CANCELLED`; Reservations: `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`. These are **existing development candidates, not newly approved REC policy**. The change does not infer transition or retention rules.

Offline fictional fixture tests reject lowercased/whitespace-altered statuses, while exact historical and closed values remain supported. No personal data, live SpreadsheetApp calls, sheet writes, OTP, public intake, deployment, or GAS source synchronization. The two-pass read remains non-transactional; the separate lock wrapper only coordinates cooperating writers.

Official guidance:
- OWASP ASVS 5.0, V2 Validation and Business Logic (document expected input structures and consistency): https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md
- Google Apps Script Lock Service (limits of cooperative script-wide locking): https://developers.google.com/apps-script/reference/lock/
