# Study 1 — Closed approved-consent PDF byte-integrity preflight (2026-11-01)

This increment adds **only** `gas/ConsentPdfIntegrity.js` and fictional offline tests. It does **not** obtain or approve an IRB PDF, verify a researcher signature, sign a document, create a participant copy, write to Drive/Sheets, connect a public GAS endpoint, or deploy a website.

`consentPdfIntegrityPreflight_(approvedSha256, readPdfBytes, digestBytes)` requires an **independently verified, researcher-controlled SHA-256** reference before reading bytes. It accepts a trusted Blob.getBytes-style Byte[] and a trusted SHA-256 digest adapter, rejects malformed/sparse/signed-byte-out-of-range inputs, rejects mismatched bytes, and returns only `{ok:true}` on success. The basic `%PDF-` signature check is only a sanity check, **not** a PDF safety or content validation. A 20 MiB operational memory guard is provisional, not an IRB policy.

In a separately reviewed GAS integration, the trusted digest adapter may use `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)`. It must hash the **exact bytes** of the independently approved reference, not PDF text, converted blobs, or a user-uploaded reference hash. Do not obtain the expected hash from the same untrusted candidate being checked. Do not use a client-supplied SHA as an authorization token.

Offline tests: known Node SHA-256 vector over a fictional PDF-like byte fixture; signed Java Byte[] values; one-byte mutation; invalid or absent independent anchor; malformed PDF bytes/digest; no live services or public intake. These tests establish only the closed preflight contract, **not** a real GAS cryptographic integration, PDF structural validation, document signature authenticity, electronic consent compliance, or IRB acceptance.

Official references:
- Google Apps Script Blob.getBytes: https://developers.google.com/apps-script/reference/base/blob
- Google Apps Script Utilities.computeDigest (SHA_256): https://developers.google.com/apps-script/reference/utilities/utilities
- OWASP File Upload Cheat Sheet (file signature alone insufficient): https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP ASVS 5.0.0: https://asvs.owasp.org/

**Blocked before any live consent workflow:** current IRB-approved complete five-page PDF, independent approved SHA-256, researcher-pre-signed baseline, signed-PDF preservation/verification design, privacy and audit retention review, OAuth/security acceptance, fresh remote GAS source drift check, and separate explicit authorization to sync/deploy. Keep `OPEN=false`, `CONSENT_READY=false`, and all public collection/signature endpoints closed.
