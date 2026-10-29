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
  var lock = getScriptLock();
  if (!lock || typeof lock.tryLock !== 'function' ||
      typeof lock.releaseLock !== 'function') {
    throw new Error('預約讀取鎖介面不合法。');
  }
  // No workbook access before acquiring the shared script-wide lock.
  if (lock.tryLock(5000) !== true) {
    throw new Error('無法取得預約讀取鎖，已拒絕提供名額。');
  }
  try {
    return bookingReadOnlyAvailability_(openSpreadsheet, nowUtc);
  } finally {
    lock.releaseLock();
  }
}
