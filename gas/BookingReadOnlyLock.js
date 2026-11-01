/**
 * Study 1 CLOSED read-only booking preflight, coordinated with script writers.
 *
 * Caller MUST inject a getter for the SAME script-wide lock used by all
 * booking writers (in GAS: function () { return LockService.getScriptLock(); }).
 * This function does not obtain any service, open any Sheet, or expose a public
 * endpoint by itself. It is intentionally not wired to Website.js.
 *
 * Even a script lock cannot protect against manual edits, other scripts,
 * external Sheets API writers, or changes after the lock is released.
 * It is NOT a database transaction and MUST NOT authorize a booking write.
 */
function bookingReadOnlyAvailabilityWithLock_(openSpreadsheet, nowUtc, getScriptLock) {
  if (typeof getScriptLock !== 'function') {
    throw new Error('預約讀取鎖介面尚未就緒。');
  }
  // Pin the caller's clock before any injected lock callback can mutate a Date.
  // The read-only adapter freezes before opening Sheets; the wrapper must
  // also freeze before getScriptLock()/tryLock() side effects.
  var stableNowUtc = new Date(bookingInstant_(nowUtc)).toISOString();
  var lock = getScriptLock();
  if (!lock || typeof lock.tryLock !== 'function' ||
      typeof lock.releaseLock !== 'function' ||
      typeof lock.hasLock !== 'function') {
    throw new Error('預約讀取鎖介面不合法。');
  }
  // No workbook access before acquiring the shared script-wide lock.
  if (lock.tryLock(5000) !== true) {
    throw new Error('無法取得預約讀取鎖，已拒絕提供名額。');
  }
  try {
    // tryLock() success is insufficient if an injected lock reports no ownership.
    // Match the stricter internal script-lock preflight: fail before opening Sheets.
    if (lock.hasLock() !== true) {
      throw new Error('預約讀取鎖狀態不一致，已拒絕提供名額。');
    }
    var availability = bookingReadOnlyAvailability_(openSpreadsheet, stableNowUtc);
    // Detect lock loss during the two-pass read before acknowledging seats.
    // This remains a best-effort check, not a Sheets transaction guarantee.
    if (lock.hasLock() !== true) {
      throw new Error('預約讀取鎖於讀取期間失效，已拒絕提供名額。');
    }
    return availability;
  } finally {
    lock.releaseLock();
  }
}
