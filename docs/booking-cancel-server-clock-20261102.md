# Study 1 — CLOSED cancellation preflight server clock (2026-11-02)

The internal `bookingCancelHoldPreflight_` previously used `request.nowUtc`, which could become caller-controlled if a future adapter passed through browser data. This could misclassify expired HELD reservations. The function now **requires** `adapters.getServerNowUtc()` and validates/freezes its UTC value before any eligibility or snapshot callbacks. A forged `request.nowUtc` is ignored. Missing/invalid server time fails closed before private reads.

Regression tests cover forged past/future clocks, an expired hold judged by server time, missing/invalid clock dependency, mutation of an injected Date during eligibility, and compatibility with the existing frozen-clock tests. The server clock adapter must itself be trusted, not a pass-through of request data. This is a **closed preflight only**; it neither cancels nor writes a reservation, and it is not a transactional or REC authorization decision. No public endpoints are opened.

Official references: [MDN Date.now](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now), [Google Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service), [OWASP ASVS](https://asvs.owasp.org/).

**Safety:** branch-only review; no GAS/Sheets write, no `clasp push`, no deployment, no permissions changes. `OPEN=false` and `CONSENT_READY=false` remain unchanged. The remote GAS source hash/drift remains unverified.
