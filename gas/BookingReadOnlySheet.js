/**
 * Study 1: INTERNAL read-only operations workbook adapter.
 * This module does not invoke SpreadsheetApp itself; the caller injects an
 * opener, and no public Website.js endpoint calls these functions.
 * Do not expose raw snapshots to clients: Reservations contains private IDs.
 * This is not a transactional snapshot or a production booking integration.
 */
var BOOKING_READ_MAX_ROWS_ = 10000; // operational resource guard, not REC policy

/** Defensive copy of sheet cell values. Never retain mutable Date references. */
function bookingReadOnlyCopyCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var time = value.getTime();
    if (!Number.isFinite(time)) throw new Error('預約快照含無效日期，已拒絕讀取。');
    return new Date(time);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error('預約快照含非預期資料型別，已拒絕讀取。');
}

/** Compare complete tab values, including private fields, without logging them. */
function bookingReadOnlySameTab_(a, b) {
  var left = [a.headers].concat(a.rows), right = [b.headers].concat(b.rows);
  if (left.length !== right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (left[i].length !== right[i].length) return false;
    for (var j = 0; j < left[i].length; j++) {
      var x = left[i][j], y = right[i][j];
      var dx = Object.prototype.toString.call(x) === '[object Date]';
      var dy = Object.prototype.toString.call(y) === '[object Date]';
      if (dx !== dy) return false;
      if (dx ? x.getTime() !== y.getTime() : x !== y) return false;
    }
  }
  return true;
}


function bookingReadOnlyTab_(book, name, expected) {
  if (!book || typeof book.getSheetByName !== 'function') {
    throw new Error('預約工作簿讀取介面不合法。');
  }
  var tab = book.getSheetByName(name);
  if (!tab || typeof tab.getLastRow !== 'function' ||
      typeof tab.getLastColumn !== 'function' ||
      typeof tab.getRange !== 'function') {
    throw new Error('必要的預約工作表不存在。');
  }
  var lastRow = tab.getLastRow(), lastCol = tab.getLastColumn();
  if (!Number.isSafeInteger(lastRow) || lastRow < 1 ||
      !Number.isSafeInteger(lastCol) || lastCol !== expected.length ||
      lastRow - 1 > BOOKING_READ_MAX_ROWS_) {
    throw new Error('預約工作表維度或欄位異常，已拒絕讀取。');
  }
  var head = tab.getRange(1, 1, 1, expected.length).getValues();
  if (!Array.isArray(head) || head.length !== 1 ||
      !Array.isArray(head[0]) || head[0].length !== expected.length) {
    throw new Error('預約工作表標題列格式不合法。');
  }
  bookingAssertSchema_(head[0], expected);
  var count = lastRow - 1;
  var rows = count ? tab.getRange(2, 1, count, expected.length).getValues() : [];
  if (!Array.isArray(rows) || rows.length !== count ||
      rows.some(function(row) {
        return !Array.isArray(row) || row.length !== expected.length;
      })) {
    throw new Error('預約工作表資料列格式不合法。');
  }
  return {headers: head[0].map(bookingReadOnlyCopyCell_),
    rows: rows.map(function(row) {return row.map(bookingReadOnlyCopyCell_);})};
}

/** Only the pre-approved 828 operations workbook may be opened. */
function bookingReadOnlySnapshot_(openSpreadsheet) {
  if (typeof openSpreadsheet !== 'function' ||
      typeof SITE_RESOURCES_ === 'undefined' ||
      SITE_RESOURCES_.operations !== '1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ') {
    throw new Error('預約資料來源尚未完成核對。');
  }
  var book = openSpreadsheet(SITE_RESOURCES_.operations);
  if (!book || typeof book.getId !== 'function' ||
      book.getId() !== SITE_RESOURCES_.operations) {
    throw new Error('預約工作簿識別碼不一致。');
  }
  // Two passes detect changes while separately reading Slots and Reservations.
  // This is only a best-effort drift guard, NOT a transactional snapshot:
  // an A->B->A change or a writer after pass two can still escape detection.
  var first = {
    slots: bookingReadOnlyTab_(book, 'Slots', BOOKING_SLOT_HEADERS_),
    reservations: bookingReadOnlyTab_(book, 'Reservations', BOOKING_RESERVATION_HEADERS_)
  };
  var second = {
    slots: bookingReadOnlyTab_(book, 'Slots', BOOKING_SLOT_HEADERS_),
    reservations: bookingReadOnlyTab_(book, 'Reservations', BOOKING_RESERVATION_HEADERS_)
  };
  if (!bookingReadOnlySameTab_(first.slots, second.slots) ||
      !bookingReadOnlySameTab_(first.reservations, second.reservations)) {
    throw new Error('預約快照讀取期間資料發生變動，已拒絕提供名額。');
  }
  return first;
}

/**
 * Validate every populated timestamp column, including metadata that does not
 * affect capacity. A malformed historical row must not be silently ignored.
 * Empty optional lifecycle fields are allowed; REC policy is not inferred here.
 */
function bookingReadOnlyValidateTemporalCells_(snapshot) {
  function check(rows, columns) {
    rows.forEach(function(row) {
      if (bookingBlankRow_(row)) return;
      columns.forEach(function(index) {
        var value = row[index];
        if (value !== '' && value != null) bookingInstant_(value);
      });
    });
  }
  check(snapshot.slots.rows, [7]); // updated_at_utc
  check(snapshot.reservations.rows, [4, 6, 7, 8, 9]);
  // Semantic chronology guard: valid UTC cells may still contradict each other.
  // Optional fields stay optional; no status/retention/REC policy is inferred.
  snapshot.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    function optionalInstant(index) {
      return row[index] === '' || row[index] == null ? null : bookingInstant_(row[index]);
    }
    var created = optionalInstant(6), confirmed = optionalInstant(7),
        cancelled = optionalInstant(8), updated = optionalInstant(9),
        holdUntil = optionalInstant(4);
    if (created !== null && [holdUntil, confirmed, cancelled, updated].some(function(ms) {
      return ms !== null && ms < created;
    })) {
      throw new Error('預約時間先後順序不合法，已拒絕提供名額。');
    }
    if (updated !== null && [confirmed, cancelled].some(function(ms) {
      return ms !== null && ms > updated;
    })) {
      throw new Error('預約時間先後順序不合法，已拒絕提供名額。');
    }
  });
}

/**
 * Fail closed on noncanonical stored status values. The general booking
 * kernel normalizes case/whitespace for callers, but a read-only integrity
 * check must not silently repair inconsistent Sheet records. This adds no
 * new lifecycle policy; it checks only the existing provisional vocabulary.
 */
function bookingReadOnlyValidateCanonicalStatuses_(snapshot) {
  snapshot.slots.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (row[5] !== BOOKING_STATUS_.slotOpen &&
        row[5] !== 'CLOSED' && row[5] !== BOOKING_STATUS_.cancelled) {
      throw new Error('時段狀態非標準值，已拒絕提供名額。');
    }
  });
  snapshot.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (row[3] !== BOOKING_STATUS_.hold &&
        row[3] !== BOOKING_STATUS_.confirmed &&
        row[3] !== BOOKING_STATUS_.cancelled &&
        row[3] !== BOOKING_STATUS_.expired) {
      throw new Error('預約狀態非標準值，已拒絕提供名額。');
    }
  });
}

/**
 * Sanitized internal-only availability preflight.
 * Duplicate IDs/keys and overcapacity block the entire result, rather than
 * silently offering seats in an inconsistent workbook.
 */
function bookingReadOnlyAvailability_(openSpreadsheet, nowUtc) {
  var snapshot = bookingReadOnlySnapshot_(openSpreadsheet);
  bookingReadOnlyValidateTemporalCells_(snapshot);
  bookingReadOnlyValidateCanonicalStatuses_(snapshot);
  var now = bookingInstant_(nowUtc);
  var result = bookingComputeAvailability_(
    snapshot.slots.rows, snapshot.reservations.rows, nowUtc);
  var capacity = new Map(), occupied = new Map(), ids = new Set(), keys = new Set(),
      activeApplicants = new Set();
  snapshot.slots.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    capacity.set(bookingId_(row[0]), bookingCapacity_(row[3]));
  });
  snapshot.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    var id = bookingId_(row[0]), applicant = bookingId_(row[1]);
    var slot = bookingId_(row[2]), key = bookingHoldKey_(row[5]);
    if (ids.has(id) || keys.has(key)) {
      throw new Error('預約識別碼或重送鍵重複，已拒絕提供名額。');
    }
    ids.add(id); keys.add(key);
    var status = bookingStatus_(row[3]);
    var active = status === BOOKING_STATUS_.confirmed ||
      (status === BOOKING_STATUS_.hold && bookingInstant_(row[4]) > now);
    if (active) {
      // A single applicant cannot own two live holds/confirmed bookings.
      // Detect historical corruption before any availability is offered.
      if (activeApplicants.has(applicant)) {
        throw new Error('同一申請者存在多筆有效預約，已拒絕提供名額。');
      }
      activeApplicants.add(applicant);
      occupied.set(slot, (occupied.get(slot) || 0) + 1);
    }
  });
  occupied.forEach(function(n, slot) {
    if (n > capacity.get(slot)) {
      throw new Error('預約人數超出時段容量，已拒絕提供名額。');
    }
  });
  return result; // slotId / UTC time / remaining only; no applicant IDs.
}
