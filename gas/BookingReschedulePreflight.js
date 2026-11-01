/**
 * Study 1: CLOSED, internal-only reschedule preflight (NO WRITES).
 *
 * Deliberately does not implement the divergent staging rescheduleHold().
 * Uses the currently verified *_utc Sheets schema and existing validation
 * kernels. This is NOT a booking transaction, public endpoint, or approval to
 * mutate a reservation. A real writer must revalidate under the shared script
 * lock and verify the write afterward.
 *
 * The injected eligibility check MUST be backed by server-side identity and
 * REC-approved screening; never accept a client-supplied eligibility flag.
 * Returns no applicant ID, reservation ID, token or private sheet fields.
 */
function bookingReschedulePreflight_(request, adapters) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      !adapters || typeof adapters.readSnapshot !== 'function' ||
      typeof adapters.isVerifiedAndEligible !== 'function') {
    throw new Error('改期檢查介面尚未就緒。');
  }
  var applicantId = bookingId_(request.applicantId);
  var reservationId = bookingId_(request.reservationId);
  var newSlotId = bookingId_(request.newSlotId);
  var now = bookingInstant_(request.nowUtc);
  // Freeze mutable Date/request clock before injected callbacks can alter it.
  var stableNowUtc = new Date(now).toISOString();
  var rejected = {allowed:false, reason:'REJECTED'};
  if (adapters.isVerifiedAndEligible(applicantId) !== true) return rejected;

  // These checks cover the WHOLE snapshot, not just the selected slot.
  // readSnapshot is a trusted, synthetic adapter in tests; it does not open
  // real Sheets. The production adapter must provide its own consistency and
  // lock guarantees before this result can inform a transaction.
  var snapshot = bookingHoldSnapshot_(adapters);
  bookingReadOnlyValidateTemporalCells_(snapshot);
  bookingReadOnlyValidateCanonicalStatuses_(snapshot);
  bookingReadOnlyValidateTextMetadata_(snapshot);
  var available = bookingComputeAvailability_(
    snapshot.slots.rows, snapshot.reservations.rows, stableNowUtc);
  bookingHoldAssertUniqueActiveApplicants_(snapshot.reservations.rows, now);
  bookingHoldAssertGlobalOccupancy_(
    snapshot.slots.rows, snapshot.reservations.rows, now);
  // A live HELD record must not expire after its ORIGINAL slot starts.
  // Otherwise an inconsistent hold could be moved into a later slot and
  // incorrectly appear valid. Check unrelated holds too (whole-workbook
  // fail-closed preflight), but do not treat expired historical holds as live.
  var originalStarts = new Map();
  snapshot.slots.rows.forEach(function(row) {
    if (!bookingBlankRow_(row)) originalStarts.set(row[0], bookingInstant_(row[1]));
  });
  snapshot.reservations.rows.forEach(function(row) {
    if (!bookingBlankRow_(row) && row[3] === BOOKING_STATUS_.hold &&
        bookingHoldActive_(row, now) &&
        bookingInstant_(row[4]) > originalStarts.get(row[2])) {
      throw new Error('有效暫留期限超過原時段開始，拒絕改期預檢。');
    }
  });

  var original = null;
  snapshot.reservations.rows.forEach(function(row) {
    if (!bookingBlankRow_(row) && row[0] === reservationId &&
        row[1] === applicantId) original = row;
  });
  // Only a currently active HELD reservation can be preflighted for moving.
  // This does not authorize changes to CONFIRMED or expired reservations.
  if (!original || original[3] !== BOOKING_STATUS_.hold ||
      !bookingHoldActive_(original, now)) return rejected;

  var target = null;
  snapshot.slots.rows.forEach(function(row) {
    if (!bookingBlankRow_(row) && row[0] === newSlotId) target = row;
  });
  if (!target || target[5] !== BOOKING_STATUS_.slotOpen ||
      bookingInstant_(target[1]) <= now ||
      // Preserve the original expiry; never extend it during a move.
      bookingInstant_(original[4]) > bookingInstant_(target[1])) {
    return rejected;
  }
  if (original[2] === newSlotId) {
    return {allowed:true, reason:'UNCHANGED'};
  }
  if (!available.some(function(slot) {return slot.slotId === newSlotId;})) {
    return rejected;
  }
  // "Allowed" means ONLY that this offline snapshot passes preflight.
  // It is never sufficient to write without a fresh locked recheck.
  return {allowed:true, reason:'LOCKED_RECHECK_REQUIRED'};
}
