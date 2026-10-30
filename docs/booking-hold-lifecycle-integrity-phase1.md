# Closed booking hold: lifecycle evidence integrity guard (2026-10-31)

Scope: **internal, adapter-injected test kernel only**. This is not a production booking adapter, an approved REC lifecycle policy, or a Google Sheets transaction.

The existing read-only availability adapter already rejected status/event contradictions. The separate locked hold transaction previously checked occupancy but could still append when unrelated historical rows had contradictory lifecycle evidence. This increment calls `bookingHoldAssertLifecycleEvents_` for every reservation row **inside the acquired script-wide lock**, on both pre-append and post-append snapshots.

It rejects: HELD/EXPIRED rows carrying confirmation or cancellation timestamps; CONFIRMED rows carrying a cancellation timestamp; malformed populated confirmation/cancellation timestamps even in CANCELLED history. Blank optional timestamps remain accepted. No real participant data is read; tests use synthetic rows and verify no append, lock release, and non-disclosure in error text. This does not validate all temporal chronology; additional checks and transactional Sheets integration remain future work.

References: Google LockService https://developers.google.com/apps-script/reference/lock/lock-service ; Google Range.getValues() https://developers.google.com/apps-script/reference/spreadsheet/range . These docs describe script-wide locking and native Sheets cell types, not full ACID transaction guarantees.

No change to Website.js public endpoints, GAS project, real Sheets, REC/FAST/QC/HTML MASTER, access controls, or deployment. OPEN=false and CONSENT_READY=false remain the required gates.
