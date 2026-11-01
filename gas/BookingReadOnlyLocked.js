/**
 * Study 1 INTERNAL, CLOSED, lock-coordinated read-only availability preflight.
 *
 * The caller MUST inject LockService.getScriptLock (the SAME script-wide lock
 * used by every cooperating booking writer). A user/document lock is NOT an
 * acceptable substitute. This module deliberately has no public endpoint and
 * never opens a spreadsheet, reads personal data, or writes on its own.
 *
 * A script lock only serializes cooperating executions of this GAS project.
 * Manual edits, other scripts, external APIs and changes after lock release
 * are NOT covered. The underlying two-pass Sheet reader is still best-effort,
 * NOT a database transaction or a guarantee of a bookable seat.
 */
function bookingReadOnlyAvailabilityWithScriptLock_(getScriptLock, openSpreadsheet, nowUtc) {
  if (typeof getScriptLock !== 'function' ||
      typeof openSpreadsheet !== 'function') {
    throw new Error('預約只讀鎖定介面尚未就緒。');
  }
  // Capture a validated primitive before any injected callback can mutate
  // the caller's Date. Do not attempt a lock or open a workbook on bad input.
  var nowMs = bookingInstant_(nowUtc);
  var stableNowUtc = new Date(nowMs).toISOString();
  var lock = getScriptLock();
  if (!lock || typeof lock.tryLock !== 'function' ||
      typeof lock.releaseLock !== 'function' ||
      typeof lock.hasLock !== 'function') {
    throw new Error('預約全域只讀鎖介面不合法。');
  }
  if (lock.tryLock(5000) !== true) {
    throw new Error('無法取得預約全域只讀鎖，已拒絕提供名額。');
  }
  try {
    // Verify acquisition explicitly; never read under an unlocked adapter.
    if (lock.hasLock() !== true) {
      throw new Error('預約全域只讀鎖狀態不一致，已拒絕提供名額。');
    }
    var availability = bookingReadOnlyAvailability_(openSpreadsheet, stableNowUtc);
    // A callback may release the shared lock while the two-pass read is
    // running. Never acknowledge the result without checking ownership again.
    // This detects loss at the boundary, not uncooperative external edits.
    if (lock.hasLock() !== true) {
      throw new Error('預約全域只讀鎖於讀取期間失效，已拒絕提供名額。');
    }
    return availability;
  } finally {
    // No SpreadsheetApp.flush(): this path never writes. Release on every
    // success or failure, including schema/data-integrity exceptions.
    lock.releaseLock();
  }
}
