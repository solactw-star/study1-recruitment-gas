/**
 * Study 1: CLOSED, read-only cancellation preflight (NO WRITES).
 * Only an active HELD reservation may pass this conservative preflight.
 * Cancellation of CONFIRMED bookings needs separate REC-approved policy.
 * This decision is NOT a cancellation or authorization to mutate Sheets.
 * A future writer must reverify identity and data under a script-wide lock,
 * write/flush, read back and verify the result before reporting success.
 */
function bookingCancelHoldPreflight_(request, adapters) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      !adapters || typeof adapters.readSnapshot !== 'function' ||
      typeof adapters.isVerifiedAndEligible !== 'function') {
    throw new Error('取消暫留檢查介面尚未就緒。');
  }
  var applicantId = bookingId_(request.applicantId);
  var reservationId = bookingId_(request.reservationId);
  var now = bookingInstant_(request.nowUtc);
  // Freeze mutable Date/request clock before injected callbacks can alter it.
  var stableNowUtc = new Date(now).toISOString();
  var rejected = {allowed:false, reason:'REJECTED'};
  // Eligibility must come from a server-backed adapter, never a client flag.
  if (adapters.isVerifiedAndEligible(applicantId) !== true) return rejected;
  var snapshot = bookingHoldSnapshot_(adapters);
  bookingReadOnlyValidateTemporalCells_(snapshot);
  bookingReadOnlyValidateCanonicalStatuses_(snapshot);
  bookingReadOnlyValidateTextMetadata_(snapshot);
  // Validate the entire workbook, including unrelated historical records.
  bookingComputeAvailability_(
    snapshot.slots.rows, snapshot.reservations.rows, stableNowUtc);
  bookingHoldAssertUniqueActiveApplicants_(snapshot.reservations.rows, now);
  bookingHoldAssertGlobalOccupancy_(
    snapshot.slots.rows, snapshot.reservations.rows, now);
  var starts = new Map();
  snapshot.slots.rows.forEach(function(row) {
    if (!bookingBlankRow_(row)) starts.set(row[0], bookingInstant_(row[1]));
  });
  var original = null;
  snapshot.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    // A live hold past its slot start violates the existing hold contract.
    if (row[3] === BOOKING_STATUS_.hold &&
        bookingHoldActive_(row, now) &&
        bookingInstant_(row[4]) > starts.get(row[2])) {
      throw new Error('有效暫留期限超過時段開始，拒絕取消預檢。');
    }
    if (row[0] === reservationId && row[1] === applicantId) original = row;
  });
  if (!original || original[3] !== BOOKING_STATUS_.hold ||
      !bookingHoldActive_(original, now)) return rejected;
  return {allowed:true, reason:'LOCKED_RECHECK_REQUIRED'};
}
