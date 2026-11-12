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
  // Google Range.getValues() represents blank cells as empty strings, not null.
  // Reject null instead of silently treating it as a missing optional event.
  if (typeof value === 'string' || typeof value === 'boolean') return value;
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


/**
 * getValues() returns calculated results, not the underlying formulas.
 * Reject formula-bearing cells in both headers and data (including history),
 * since dynamic/external formulas undermine a stable booking snapshot.
 * Fail closed if the read-only formula inspection API is unavailable.
 */
function bookingReadOnlyRejectFormulas_(range, rowCount, colCount) {
  if (!range || typeof range.getFormulas !== 'function') {
    throw new Error('預約公式檢查不可用，已拒絕讀取。');
  }
  var formulas = range.getFormulas();
  // Array.prototype.some() skips sparse array holes. A malformed injected
  // formula grid must not bypass the fail-closed formula inspection.
  if (!Array.isArray(formulas) || formulas.length !== rowCount) {
    throw new Error('預約工作表包含公式或公式檢查格式異常，已拒絕讀取。');
  }
  for (var i = 0; i < rowCount; i++) {
    if (!Object.prototype.hasOwnProperty.call(formulas, i) ||
        !Array.isArray(formulas[i]) || formulas[i].length !== colCount) {
      throw new Error('預約工作表包含公式或公式檢查格式異常，已拒絕讀取。');
    }
    for (var j = 0; j < colCount; j++) {
      if (!Object.prototype.hasOwnProperty.call(formulas[i], j) ||
          formulas[i][j] !== '') {
        throw new Error('預約工作表包含公式或公式檢查格式異常，已拒絕讀取。');
      }
    }
  }
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
  var headRange = tab.getRange(1, 1, 1, expected.length);
  bookingReadOnlyRejectFormulas_(headRange, 1, expected.length);
  var head = headRange.getValues();
  if (!Array.isArray(head) || head.length !== 1 ||
      !Array.isArray(head[0]) || head[0].length !== expected.length) {
    throw new Error('預約工作表標題列格式不合法。');
  }
  // Copy immediately: subsequent injected API callbacks must not mutate
  // the values that this pass actually observed.
  var stableHead = head[0].map(bookingReadOnlyCopyCell_);
  // Recheck after values: formulas may change between separate API reads.
  bookingReadOnlyRejectFormulas_(headRange, 1, expected.length);
  if (!Array.isArray(head) || head.length !== 1 ||
      !Array.isArray(head[0]) || head[0].length !== expected.length) {
    throw new Error('預約工作表標題列格式不合法。');
  }
  bookingAssertSchema_(stableHead, expected);
  var count = lastRow - 1;
  var rows = [];
  if (count) {
    var dataRange = tab.getRange(2, 1, count, expected.length);
    bookingReadOnlyRejectFormulas_(dataRange, count, expected.length);
    rows = dataRange.getValues();
    // getValues() normally returns dense rectangular arrays. An injected or
    // malformed sparse grid must not silently turn a missing optional cell
    // into undefined and pass the availability integrity checks.
    if (!Array.isArray(rows) || rows.length !== count) {
      throw new Error('預約工作表資料列格式不合法。');
    }
    for (var i = 0; i < count; i++) {
      if (!Object.prototype.hasOwnProperty.call(rows, i) ||
          !Array.isArray(rows[i]) || rows[i].length !== expected.length) {
        throw new Error('預約工作表資料列格式不合法。');
      }
      for (var j = 0; j < expected.length; j++) {
        if (!Object.prototype.hasOwnProperty.call(rows[i], j)) {
          throw new Error('預約工作表資料列格式不合法。');
        }
      }
    }
    // Preserve the first observed values before getFormulas/getLastRow can
    // mutate shared Date references or cell arrays in injected adapters.
    rows = rows.map(function(row) {return row.map(bookingReadOnlyCopyCell_);});
    // Best-effort guard against formula insertion during the value read.
    bookingReadOnlyRejectFormulas_(dataRange, count, expected.length);
  }
  // Detect a transient append/delete or column edit during this tab read.
  // A later identical second pass alone cannot detect an A -> B -> A drift.
  // This remains best-effort, not an atomic Google Sheets snapshot.
  if (tab.getLastRow() !== lastRow || tab.getLastColumn() !== lastCol) {
    throw new Error('預約工作表讀取期間維度發生變動，已拒絕提供名額。');
  }
  return {headers: stableHead, rows: rows};
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
    // For a CANCELLED record, a recorded cancellation cannot precede its
    // recorded confirmation. Do not require either optional timestamp.
    if (row[3] === BOOKING_STATUS_.cancelled &&
        confirmed !== null && cancelled !== null && cancelled < confirmed) {
      throw new Error('預約取消時間早於確認時間，已拒絕提供名額。');
    }
    // The recorded lifecycle must agree with its event timestamps. A
    // confirmed reservation with cancellation evidence cannot be counted
    // as an active seat; a held/expired row cannot have terminal events.
    // This only rejects contradictory evidence, without requiring optional
    // timestamps or choosing an unapproved transition policy.
    if (((row[3] === BOOKING_STATUS_.hold ||
           row[3] === BOOKING_STATUS_.expired ||
           row[3] === BOOKING_STATUS_.waitlisted) &&
          (confirmed !== null || cancelled !== null)) ||
        (row[3] === BOOKING_STATUS_.confirmed && cancelled !== null)) {
      throw new Error('預約狀態與事件時間不一致，已拒絕提供名額。');
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
        row[3] !== BOOKING_STATUS_.expired &&
        row[3] !== BOOKING_STATUS_.waitlisted) {
      throw new Error('預約狀態非標準值，已拒絕提供名額。');
    }
  });
}

/**
 * Validate native numeric capacity and text-typed slot metadata without inventing required-field rules.
 * Google getValues() returns empty strings for blank cells. A checkbox,
 * numeric cell, or Date in location_code/created_by indicates schema drift.
 * This check does not expose or log stored values.
 */
function bookingReadOnlyValidateTextMetadata_(snapshot) {
  snapshot.slots.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    // Sheets getValues() distinguishes numeric cells from text. Do not
    // silently coerce a text capacity such as '2' into a valid seat count.
    if (typeof row[3] !== 'number' || !Number.isSafeInteger(row[3]) || row[3] < 1) {
      throw new Error('時段容量儲存格必須是正整數數值，已拒絕提供名額。');
    }
    [4, 6].forEach(function(index) {
      if (typeof row[index] !== 'string') {
        throw new Error('時段文字欄位資料型別不合法，已拒絕提供名額。');
      }
    });
  });
}

/**
 * Sanitized internal-only availability preflight.
 * Duplicate IDs/keys and overcapacity block the entire result, rather than
 * silently offering seats in an inconsistent workbook.
 */
function bookingReadOnlyAvailability_(openSpreadsheet, nowUtc) {
  // Freeze the caller-supplied clock before invoking an injected opener.
  // A Date is mutable: a callback must not shift the hold-expiry boundary
  // between the caller's preflight and the availability calculation.
  var now = bookingInstant_(nowUtc);
  var stableNowUtc = new Date(now).toISOString();
  var snapshot = bookingReadOnlySnapshot_(openSpreadsheet);
  // getLastRow() omits trailing blank rows. A fully blank row *within*
  // the returned data extent is a structural gap; silently skipping it
  // could conceal a missing reservation when computing available seats.
  // This is an integrity guard, not a REC policy or a recovery mechanism.
  [snapshot.slots.rows, snapshot.reservations.rows].forEach(function(rows) {
    if (rows.some(bookingBlankRow_)) {
      throw new Error('預約工作表存在內部空白資料列，已拒絕提供名額。');
    }
  });
  bookingReadOnlyValidateTemporalCells_(snapshot);
  bookingReadOnlyValidateCanonicalStatuses_(snapshot);
  bookingReadOnlyValidateTextMetadata_(snapshot);
  var result = bookingComputeAvailability_(
    snapshot.slots.rows, snapshot.reservations.rows, stableNowUtc);
  var capacity = new Map(), slotStarts = new Map(), slotStatuses = new Map(),
      occupied = new Map(), ids = new Set(), keys = new Set(),
      activeApplicants = new Set();
  snapshot.slots.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    var slotId = bookingId_(row[0]);
    capacity.set(slotId, bookingCapacity_(row[3]));
    slotStarts.set(slotId, bookingInstant_(row[1]));
    slotStatuses.set(slotId, row[5]);
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
    // EXPIRED must not release a seat before a recorded hold deadline.
    // A premature EXPIRED state could otherwise make a live hold appear free.
    // Only check a populated deadline; do not invent a mandatory history field.
    if (status === BOOKING_STATUS_.expired &&
        row[4] !== '' && row[4] != null &&
        bookingInstant_(row[4]) > now) {
      throw new Error('預約標記過期但暫留期限尚未到達，已拒絕提供名額。');
    }
    var active = status === BOOKING_STATUS_.confirmed ||
      (status === BOOKING_STATUS_.hold && bookingInstant_(row[4]) > now);
    // The hold transaction requires expiry <= slot start. Check historical
    // expired HELD rows too, even though they do not consume a seat.
    if (status === BOOKING_STATUS_.hold &&
        bookingInstant_(row[4]) > slotStarts.get(slot)) {
      throw new Error('有效暫留到期時間晚於時段開始，已拒絕提供名額。');
    }
    if (active) {
      // A cancelled slot must not retain a live reservation. A CLOSED slot
      // may retain existing bookings, so only CANCELLED is rejected here.
      if (slotStatuses.get(slot) === BOOKING_STATUS_.cancelled) {
        throw new Error('已取消時段仍有有效預約，已拒絕提供名額。');
      }
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
