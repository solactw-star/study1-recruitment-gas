/**
 * Study 1 booking availability kernel. Internal only: every function ends with _.
 * Pure validation/computation; no participant reads, emails, locks, reservations
 * or other writes. Public Website.js endpoints remain deliberately CLOSED.
 *
 * Database column names were confirmed against the existing 828 Google Sheets.
 * The status vocabulary below is PROVISIONAL, pending researcher approval.
 */
var BOOKING_SLOT_HEADERS_ = Object.freeze([
  'slot_id','start_at_utc','end_at_utc','capacity',
  'location_code','status','created_by','updated_at_utc'
]);
var BOOKING_RESERVATION_HEADERS_ = Object.freeze([
  'reservation_id','applicant_id','slot_id','status','hold_until_utc',
  'idempotency_key','created_at_utc','confirmed_at_utc',
  'cancelled_at_utc','updated_at_utc'
]);
var BOOKING_STATUS_ = Object.freeze({
  slotOpen: 'OPEN', hold: 'HELD', confirmed: 'CONFIRMED',
  cancelled: 'CANCELLED', expired: 'EXPIRED', waitlisted: 'WAITLISTED'
});
function bookingAssertSchema_(headers, expected) {
  if (!Array.isArray(headers) || headers.length < expected.length) {
    throw new Error('預約資料表欄位不足，已拒絕使用。');
  }
  for (var i=0; i<expected.length; i++) {
    if (headers[i] !== expected[i]) {
      throw new Error('預約資料表欄位與已核實的結構不一致，已拒絕使用。');
    }
  }
  return true;
}
function bookingId_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('時段識別碼格式不正確。');
  }
  return value;
}
function bookingInstant_(value) {
  var ms;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    ms = value.getTime();
  } else {
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
      throw new Error('時間必須是 UTC ISO 8601。');
    }
    ms = Date.parse(value);
    if (Number.isFinite(ms) && new Date(ms).toISOString().slice(0,19) !== value.slice(0,19)) {
      throw new Error('時間日期不合法。');
    }
  }
  if (!Number.isFinite(ms)) throw new Error('時間日期不合法。');
  return ms;
}
function bookingCapacity_(value) {
  var n = typeof value === 'number' ? value :
    (typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('預約時段容量不合法。');
  return n;
}
function bookingStatus_(value) {
  if (typeof value !== 'string') throw new Error('預約狀態值不合法。');
  var status = value.trim().toUpperCase();
  if (!status || !/^[A-Z_]+$/.test(status)) throw new Error('預約狀態值不合法。');
  return status;
}
function bookingBlankRow_(row) {
  return Array.isArray(row) && row.every(function(v) {return v === '' || v == null;});
}
/**
 * Determine remaining capacity using separately supplied, trusted internal
 * row arrays. Unknown/malformed reservation data blocks the result rather
 * than accidentally making occupied seats available.
 *
 * No real participant data should be passed to unit tests.
 * Returns only slot identifiers, UTC times and remaining seat counts.
 */
function bookingComputeAvailability_(slotRows, reservationRows, nowUtc) {
  if (!Array.isArray(slotRows) || !Array.isArray(reservationRows)) {
    throw new Error('預約資料格式不合法。');
  }
  var now = bookingInstant_(nowUtc);
  var slots = new Map();
  slotRows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (!Array.isArray(row) || row.length < BOOKING_SLOT_HEADERS_.length) {
      throw new Error('時段資料欄位不完整。');
    }
    var id = bookingId_(row[0]);
    if (slots.has(id)) throw new Error('發現重複的時段識別碼。');
    var start = bookingInstant_(row[1]);
    var end = bookingInstant_(row[2]);
    if (end <= start) throw new Error('時段起訖時間不合法。');
    var capacity = bookingCapacity_(row[3]);
    var status = bookingStatus_(row[5]);
    if (status !== BOOKING_STATUS_.slotOpen && status !== 'CLOSED' && status !== 'CANCELLED') {
      throw new Error('未知時段狀態，拒絕提供名額。');
    }
    slots.set(id,{id:id,start:start,end:end,capacity:capacity,occupied:0,status:status});
  });
  reservationRows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (!Array.isArray(row) || row.length < BOOKING_RESERVATION_HEADERS_.length) {
      throw new Error('預約資料欄位不完整。');
    }
    // Do not log or return applicant_id, email, idempotency_key or other PII.
    var slotId = bookingId_(row[2]);
    var slot = slots.get(slotId);
    // An orphaned reservation is a consistency fault, not a free seat.
    if (!slot) throw new Error('預約記錄參照不存在的時段。');
    var status = bookingStatus_(row[3]);
    if (status === BOOKING_STATUS_.cancelled || status === BOOKING_STATUS_.expired ||
        status === BOOKING_STATUS_.waitlisted) return;
    if (status === BOOKING_STATUS_.confirmed) {slot.occupied++;return;}
    if (status === BOOKING_STATUS_.hold) {
      // Expired holds do not consume capacity; missing/invalid expiries block.
      if (bookingInstant_(row[4]) > now) slot.occupied++;
      return;
    }
    throw new Error('未知預約狀態，拒絕提供名額。');
  });
  var results=[];
  slots.forEach(function(slot) {
    var remaining=slot.capacity-slot.occupied;
    if (slot.status===BOOKING_STATUS_.slotOpen && slot.start > now && remaining > 0) {
      results.push({slotId:slot.id,startAtUtc:new Date(slot.start).toISOString(),
        endAtUtc:new Date(slot.end).toISOString(),remaining:remaining});
    }
  });
  results.sort(function(a,b) {
    return a.startAtUtc.localeCompare(b.startAtUtc) || a.slotId.localeCompare(b.slotId);
  });
  return results;
}
/** Read column headings ONLY, for a researcher-run schema preflight.
 * Not a booking operation. Ends in _ to prevent client-side invocation.
 */
function bookingVerifySheetHeaders_() {
  // Important: this function intentionally never changes any spreadsheet.
  var operations=SpreadsheetApp.openById(SITE_RESOURCES_.operations);
  [['Slots',BOOKING_SLOT_HEADERS_],['Reservations',BOOKING_RESERVATION_HEADERS_]].forEach(function(pair) {
    var tab=operations.getSheetByName(pair[0]);
    if (!tab) throw new Error('預約工作表不存在。');
    var headers=tab.getRange(1,1,1,pair[1].length).getValues()[0];
    bookingAssertSchema_(headers,pair[1]);
  });
  return {ok:true,readOnly:true,tabsChecked:2};
}
