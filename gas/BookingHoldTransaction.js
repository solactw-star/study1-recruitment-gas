/**
 * Study 1: CLOSED, adapter-injected booking hold transaction test kernel.
 * No live Sheets writes, public endpoints, participant reads, or email.
 * Every writer MUST use the same script-wide lock; Google Sheets is not a
 * transactional database. This is NOT production-ready booking code.
 */
var BOOKING_HOLD_MAX_MS_ = 15 * 60 * 1000; // provisional researcher policy
var BOOKING_HOLD_MAX_ROWS_ = 10000; // operational safety bound, not REC policy
function bookingHoldKey_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error('預約重送識別碼格式不合法。');
  }
  return value;
}
/**
 * Refuse noncanonical stored statuses and non-native slot capacities BEFORE
 * any locked write. The pure availability kernel intentionally accepts some
 * caller normalization, but a Sheet writer must not repair corrupt storage
 * silently. These are existing provisional enums, not new REC policy.
 */
function bookingHoldAssertCanonicalStorage_(snapshot) {
  snapshot.slots.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (typeof row[3] !== 'number' ||
        !Number.isSafeInteger(row[3]) || row[3] < 1) {
      throw new Error('時段容量儲存格型別不合法，拒絕預約交易。');
    }
    if (row[5] !== BOOKING_STATUS_.slotOpen &&
        row[5] !== 'CLOSED' && row[5] !== BOOKING_STATUS_.cancelled) {
      throw new Error('時段狀態非標準值，拒絕預約交易。');
    }
    [4,6].forEach(function(index) {
      if (typeof row[index] !== 'string') {
        throw new Error('時段文字欄位型別不合法，拒絕預約交易。');
      }
    });
    // Mirror the read-only adapter: even an unrelated CLOSED/CANCELLED
    // slot's populated update metadata must be a valid UTC instant.
    // Do not invent a required timestamp for currently blank cells.
    if (row[7] !== '' && row[7] != null) bookingInstant_(row[7]);
  });
  snapshot.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (row[3] !== BOOKING_STATUS_.hold &&
        row[3] !== BOOKING_STATUS_.confirmed &&
        row[3] !== BOOKING_STATUS_.cancelled &&
        row[3] !== BOOKING_STATUS_.expired &&
        row[3] !== BOOKING_STATUS_.waitlisted) {
      throw new Error('預約狀態非標準值，拒絕預約交易。');
    }
  });
}
/** Reject sparse injected snapshot arrays before any capacity decision or write.
 * Array.some/forEach skip missing outer indices, and row.length does not
 * detect missing inner cells. Google getValues() is normally dense, but a
 * malformed adapter must never silently omit a reservation.
 */
function bookingHoldDenseRows_(rows, width) {
  for (var i=0; i<rows.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(rows,i) ||
        !Array.isArray(rows[i]) || rows[i].length!==width) return false;
    for (var j=0; j<width; j++) {
      if (!Object.prototype.hasOwnProperty.call(rows[i],j)) return false;
    }
  }
  return true;
}
/**
 * Range.getValues() never returns null/undefined or arbitrary objects.
 * A malformed injected writer snapshot must not accept cells that the
 * independent read-only adapter rejects. Do not stringify or log values.
 */
function bookingHoldAssertNativeCells_(rows) {
  rows.forEach(function(row) {
    row.forEach(function(value) {
      var type = typeof value;
      if (type === 'string' || type === 'boolean' ||
          (type === 'number' && Number.isFinite(value))) return;
      if (Object.prototype.toString.call(value) === '[object Date]' &&
          Number.isFinite(value.getTime())) return;
      throw new Error('預約快照含非預期儲存格型別，拒絕預約交易。');
    });
  });
}
function bookingHoldSnapshot_(adapter) {
  var s=adapter.readSnapshot();
  if (!s || !s.slots || !s.reservations ||
      !Array.isArray(s.slots.rows) || !Array.isArray(s.reservations.rows)) {
    throw new Error('預約快照格式不合法。');
  }
  // Mirror the read-only adapter's 10,000-row resource ceiling before
  // scanning potentially attacker-controlled injected snapshot arrays.
  // This is an operational fail-closed limit, not an enrollment policy.
  if (s.slots.rows.length > BOOKING_HOLD_MAX_ROWS_ ||
      s.reservations.rows.length > BOOKING_HOLD_MAX_ROWS_) {
    throw new Error('預約快照資料列超過安全上限，拒絕預約交易。');
  }
  bookingAssertSchema_(s.slots.headers,BOOKING_SLOT_HEADERS_);
  bookingAssertSchema_(s.reservations.headers,BOOKING_RESERVATION_HEADERS_);
  // The generic kernel accepts a minimum-width schema, but a locked Sheet
  // transaction must reject extra columns as well as missing columns. A
  // writer using a different layout could otherwise corrupt reservations.
  if (s.slots.headers.length !== BOOKING_SLOT_HEADERS_.length ||
      s.reservations.headers.length !== BOOKING_RESERVATION_HEADERS_.length ||
      !bookingHoldDenseRows_(s.slots.rows, BOOKING_SLOT_HEADERS_.length) ||
      !bookingHoldDenseRows_(s.reservations.rows, BOOKING_RESERVATION_HEADERS_.length)) {
    throw new Error('預約快照欄位寬度不一致，拒絕預約交易。');
  }
  // Reject fully blank rows inside a supplied data extent. Silently skipping
  // a missing slot/reservation can undercount occupied seats. This mirrors the
  // read-only adapter's structural guard; an empty tab is still allowed.
  if (s.slots.rows.some(bookingBlankRow_) ||
      s.reservations.rows.some(bookingBlankRow_)) {
    throw new Error('預約快照存在內部空白資料列，拒絕預約交易。');
  }
  bookingHoldAssertCanonicalStorage_(s);
  // Check all historical keys, not just the key of this request. A duplicate
  // unrelated key makes replay identity ambiguous and must block new writes.
  var ids=new Set(), keys=new Set();
  s.reservations.rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (!Array.isArray(row) || row.length<BOOKING_RESERVATION_HEADERS_.length) {
      throw new Error('預約資料列不完整。');
    }
    var id=bookingId_(row[0]);
    if (ids.has(id)) throw new Error('重複預約識別碼，拒絕操作。');
    ids.add(id);
    bookingId_(row[1]);
    var key=bookingHoldKey_(row[5]);
    if (keys.has(key)) throw new Error('重複預約請求識別碼，拒絕操作。');
    keys.add(key);
  });
  // Validate lifecycle evidence before replay or append, including history.
  bookingHoldAssertLifecycleEvents_(s.reservations.rows);
  // Run after semantic checks so established field-specific error messages
  // remain stable; reject null/undefined and non-native injected cells that
  // the read-only Sheet adapter also refuses, before any append.
  bookingHoldAssertNativeCells_(s.slots.rows);
  bookingHoldAssertNativeCells_(s.reservations.rows);
  return s;
}
/**
 * Closed hold transaction integrity guard. Do not accept an active booking
 * contradicted by confirmation/cancellation evidence, or malformed historical
 * event timestamps. Optional event timestamps remain optional; no new REC
 * lifecycle transition policy is inferred.
 */
function bookingHoldAssertLifecycleEvents_(rows) {
  rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    var status=bookingStatus_(row[3]);
    // Validate populated hold expiry, creation and update cells even for
    // CANCELLED/EXPIRED history. A corrupt ignored field must not permit a
    // new write; blank optional cells remain allowed by provisional policy.
    [4,6,9].forEach(function(index) {
      if (row[index]!=='' && row[index]!=null) bookingInstant_(row[index]);
    });
    var confirmed=row[7]!=='' && row[7]!=null;
    var cancelled=row[8]!=='' && row[8]!=null;
    if (confirmed) bookingInstant_(row[7]);
    if (cancelled) bookingInstant_(row[8]);
    if (((status===BOOKING_STATUS_.hold || status===BOOKING_STATUS_.expired ||
          status===BOOKING_STATUS_.waitlisted) && (confirmed || cancelled)) ||
        (status===BOOKING_STATUS_.confirmed && cancelled)) {
      throw new Error('預約狀態與事件時間不一致，拒絕預約交易。');
    }
    var createdAt=row[6]===''||row[6]==null?null:bookingInstant_(row[6]);
    var confirmedAt=confirmed?bookingInstant_(row[7]):null;
    var cancelledAt=cancelled?bookingInstant_(row[8]):null;
    var updatedAt=row[9]===''||row[9]==null?null:bookingInstant_(row[9]);
    // Mirror the read-only integrity guard: a recorded hold expiry cannot
    // predate creation, including on CANCELLED/EXPIRED history. This is a
    // chronology check, not a new required-field or hold-duration policy.
    var holdUntilAt=row[4]===''||row[4]==null?null:bookingInstant_(row[4]);
    if (createdAt!==null && holdUntilAt!==null && holdUntilAt<createdAt) {
      throw new Error('預約暫留期限早於建立時間，拒絕預約交易。');
    }
    if ((createdAt!==null && [confirmedAt,cancelledAt,updatedAt].some(function(t){
          return t!==null && t<createdAt;
        })) ||
        (updatedAt!==null && [confirmedAt,cancelledAt].some(function(t){
          return t!==null && t>updatedAt;
        })) ||
        (status===BOOKING_STATUS_.cancelled && confirmedAt!==null &&
         cancelledAt!==null && cancelledAt<confirmedAt)) {
      throw new Error('預約歷程時間先後順序不一致，拒絕預約交易。');
    }
  });
}
function bookingHoldActive_(row,nowMs) {
  var status=bookingStatus_(row[3]);
  if (status===BOOKING_STATUS_.confirmed) return true;
  if (status===BOOKING_STATUS_.hold) {
    return bookingInstant_(row[4])>nowMs;
  }
  if (status===BOOKING_STATUS_.cancelled || status===BOOKING_STATUS_.expired ||
      status===BOOKING_STATUS_.waitlisted) return false;
  throw new Error('未知預約狀態，拒絕操作。');
}
/**
 * Reject a corrupted snapshot with multiple live reservations for one applicant,
 * including unrelated applicants and exact-key replays. Do not reveal IDs.
 * This is an integrity check, not a new eligibility or hold-duration policy.
 */
function bookingHoldAssertUniqueActiveApplicants_(rows,nowMs) {
  var active = new Set();
  rows.forEach(function(row) {
    if (bookingBlankRow_(row) || !bookingHoldActive_(row,nowMs)) return;
    var applicant = bookingId_(row[1]);
    if (active.has(applicant)) {
      throw new Error('同一申請者存在多筆有效預約，拒絕預約交易。');
    }
    active.add(applicant);
  });
}
/**
 * A successful append must not hide a concurrent edit/deletion of a
 * pre-existing reservation. Compare every historical field without logging
 * private values. IDs are checked for uniqueness by bookingHoldSnapshot_.
 * This is a best-effort readback check, not a Sheets transaction.
 */
function bookingHoldFreezeHistory_(rows) {
  return rows.map(function(row) {
    if (!Array.isArray(row)) return row;
    return row.map(function(value) {
      if (Object.prototype.toString.call(value) === '[object Date]') {
        var ms = value.getTime();
        if (!Number.isFinite(ms)) {
          throw new Error('預約歷史時間資料不合法，拒絕操作。');
        }
        return new Date(ms);
      }
      return value;
    });
  });
}
function bookingHoldAssertHistoryStable_(beforeRows, afterRows) {
  var original = new Map();
  beforeRows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    original.set(row[0], row);
  });
  afterRows.forEach(function(row) {
    if (bookingBlankRow_(row) || !original.has(row[0])) return;
    var old = original.get(row[0]);
    if (row.length !== old.length) {
      throw new Error('預約寫入期間既有資料變動，拒絕宣稱成功。');
    }
    for (var i = 0; i < old.length; i++) {
      var a = old[i], b = row[i];
      var aDate = Object.prototype.toString.call(a) === '[object Date]';
      var bDate = Object.prototype.toString.call(b) === '[object Date]';
      if (aDate !== bDate ||
          (aDate ? !Number.isFinite(a.getTime()) ||
            !Number.isFinite(b.getTime()) || a.getTime() !== b.getTime()
            : a !== b)) {
        throw new Error('預約寫入期間既有資料變動，拒絕宣稱成功。');
      }
    }
    original.delete(row[0]);
  });
  if (original.size) {
    throw new Error('預約寫入期間既有資料變動，拒絕宣稱成功。');
  }
}
/**
 * The append is only allowed to add a reservation, not silently change Slots.
 * Compare every pre-existing slot cell, including optional metadata and Date
 * values, before claiming success. This is a best-effort lock readback guard,
 * not a transactional guarantee against external Sheet editors.
 */
function bookingHoldAssertSlotsStable_(beforeRows, afterRows) {
  if (beforeRows.length !== afterRows.length ||
      beforeRows.filter(function(r){return !bookingBlankRow_(r);}).length !==
      afterRows.filter(function(r){return !bookingBlankRow_(r);}).length) {
    throw new Error('預約寫入期間時段資料變動，拒絕宣稱成功。');
  }
  bookingHoldAssertHistoryStable_(beforeRows, afterRows);
}
function bookingHoldExistingKey_(rows,key) {
  var found=null;
  rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (row[5]===key) {
      if (found) throw new Error('重複預約請求識別碼，拒絕操作。');
      found=row;
    }
  });
  return found;
}
function bookingHoldCount_(rows,slotId,nowMs) {
  var count=0;
  rows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    if (row[2]===slotId && bookingHoldActive_(row,nowMs)) count++;
  });
  return count;
}
/**
 * A locally available seat does not justify writing into a globally
 * inconsistent workbook. Check every slot, including CLOSED/CANCELLED slots,
 * while the shared script lock is held. Never expose applicant IDs.
 * This is a fail-closed integrity check, not an approval of slot policy.
 */
function bookingHoldAssertGlobalOccupancy_(slotRows,reservationRows,nowMs) {
  var counts=new Map(), slotStarts=new Map();
  slotRows.forEach(function(row) {
    if (!bookingBlankRow_(row)) {
      slotStarts.set(bookingId_(row[0]),bookingInstant_(row[1]));
    }
  });
  reservationRows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    var id=bookingId_(row[2]);
    // A prematurely EXPIRED hold is inconsistent history: the read-only
    // adapter rejects it, so the locked writer must not release its seat
    // and append elsewhere. Blank historical deadlines remain optional.
    if (row[3]===BOOKING_STATUS_.expired &&
        row[4]!=='' && row[4]!=null &&
        bookingInstant_(row[4])>nowMs) {
      throw new Error('預約標記過期但暫留期限尚未到達，拒絕預約交易。');
    }
    // Check ALL HELD records, including historical expired holds. Otherwise
    // the locked writer could accept corruption already rejected by the
    // read-only availability adapter. Do not treat expired holds as occupied.
    if (row[3]===BOOKING_STATUS_.hold &&
        bookingInstant_(row[4])>slotStarts.get(id)) {
      throw new Error('有效暫留期限晚於原時段開始，拒絕預約交易。');
    }
    if (!bookingHoldActive_(row,nowMs)) return;
    counts.set(id,(counts.get(id)||0)+1);
  });
  slotRows.forEach(function(row) {
    if (bookingBlankRow_(row)) return;
    var id=bookingId_(row[0]), count=counts.get(id)||0;
    if (count>bookingCapacity_(row[3])) {
      throw new Error('既有時段預約超出容量，拒絕預約交易。');
    }
    if (bookingStatus_(row[5])===BOOKING_STATUS_.cancelled && count>0) {
      throw new Error('已取消時段仍有有效預約，拒絕預約交易。');
    }
  });
}
/**
 * request: server-trusted {applicantId,slotId,idempotencyKey,nowUtc,holdUntilUtc}
 * adapters:
 *   getLock() -> script-wide lock with tryLock/releaseLock
 *   isVerifiedAndEligible(applicantId) -> true only after server-side
 *       verification and REC-approved screening (not implemented here)
 *   readSnapshot() -> fresh {slots:{headers,rows},reservations:{headers,rows}}
 *   appendHold({applicantId,slotId,idempotencyKey,nowUtc,holdUntilUtc})
 *       -> true ONLY after a single-row append and flush; secure unique
 *       reservation ID generation belongs to this UNIMPLEMENTED adapter.
 *
 * All calls and readbacks happen while locked. Result deliberately excludes
 * participant identifiers, request key, reservation ID and private details.
 */
/** A cooperating adapter must not drop the script lock during a callback. */
function bookingHoldAssertLockStillHeld_(lock) {
  if (lock.hasLock() !== true) {
    throw new Error('預約全域交易鎖在執行期間失效，拒絕宣稱成功。');
  }
}
function bookingHoldOnceLocked_(request,adapters) {
  if (!request || typeof request!=='object' || Array.isArray(request) ||
      !adapters || typeof adapters.getLock!=='function' ||
      typeof adapters.isVerifiedAndEligible!=='function' ||
      typeof adapters.readSnapshot!=='function' ||
      typeof adapters.appendHold!=='function') {
    throw new Error('預約交易介面尚未就緒。');
  }
  // Capture and normalize trusted request fields before invoking any adapter.
  // Injected callbacks must not be able to change the checked identity, slot,
  // idempotency key or clock instants between validation and append/readback.
  var applicantId=bookingId_(request.applicantId);
  var slotId=bookingId_(request.slotId);
  var key=bookingHoldKey_(request.idempotencyKey);
  var now=bookingInstant_(request.nowUtc);
  var until=bookingInstant_(request.holdUntilUtc);
  var nowUtc=new Date(now).toISOString();
  var holdUntilUtc=new Date(until).toISOString();
  if (until<=now || until-now>BOOKING_HOLD_MAX_MS_) {
    throw new Error('暫留有效期限不合法。');
  }
  var lock=adapters.getLock();
  if (!lock || typeof lock.tryLock!=='function' ||
      typeof lock.releaseLock!=='function' ||
      typeof lock.hasLock!=='function') {
    throw new Error('預約全域交易鎖介面不合法，已拒絕操作。');
  }
  if (lock.tryLock(5000)!==true) {
    throw new Error('無法取得預約全域交易鎖，已拒絕操作。');
  }
  try {
    // Verify actual script-lock ownership before reading or writing.
    if (lock.hasLock()!==true) {
      throw new Error('預約全域交易鎖狀態不一致，已拒絕操作。');
    }
    var eligible=adapters.isVerifiedAndEligible(applicantId);
    bookingHoldAssertLockStillHeld_(lock);
    if (eligible!==true) {
      return {held:false,reason:'REJECTED'};
    }
    var before=bookingHoldSnapshot_(adapters);
    bookingHoldAssertLockStillHeld_(lock);
    // Full validation of all slot and reservation records fails closed.
    var available=bookingComputeAvailability_(
      before.slots.rows,before.reservations.rows,nowUtc);
    bookingHoldAssertUniqueActiveApplicants_(before.reservations.rows,now);
    bookingHoldAssertGlobalOccupancy_(before.slots.rows,before.reservations.rows,now);
    var existing=bookingHoldExistingKey_(before.reservations.rows,key);
    if (existing) {
      var replaySlot=before.slots.rows.filter(function(r) {
        return !bookingBlankRow_(r) && r[0]===slotId;
      })[0];
      if (existing[1]===applicantId &&
          existing[2]===slotId &&
          bookingStatus_(existing[3])===BOOKING_STATUS_.hold &&
          bookingHoldActive_(existing,now) &&
          // The same idempotency key cannot acknowledge a different expiry.
          // A retry may use a newer nowUtc, but the original expiry is fixed.
          bookingInstant_(existing[4])===until &&
          replaySlot && bookingStatus_(replaySlot[5])===BOOKING_STATUS_.slotOpen &&
          bookingInstant_(replaySlot[1])>now &&
          bookingInstant_(existing[4])<=bookingInstant_(replaySlot[1])) {
        return {held:true,reason:'REPLAY'};
      }
      return {held:false,reason:'REJECTED'};
    }
    // One active hold or confirmed booking per applicant; avoid duplicates.
    for (var i=0;i<before.reservations.rows.length;i++) {
      var row=before.reservations.rows[i];
      if (!bookingBlankRow_(row) && row[1]===applicantId &&
          bookingHoldActive_(row,now)) {
        return {held:false,reason:'REJECTED'};
      }
    }
    var chosen=available.filter(function(x){return x.slotId===slotId;})[0];
    if (!chosen || until>bookingInstant_(chosen.startAtUtc)) {
      return {held:false,reason:'REJECTED'};
    }
    var oldSlots=bookingHoldFreezeHistory_(before.slots.rows);
    var oldHistory=bookingHoldFreezeHistory_(before.reservations.rows);
    var oldIds=new Set(before.reservations.rows.filter(function(r){
      return !bookingBlankRow_(r);
    }).map(function(r){return r[0];}));
    // No append may begin if an injected reader or authorization adapter
    // has released the shared script lock after its initial acquisition.
    bookingHoldAssertLockStillHeld_(lock);
    if (adapters.appendHold({
      applicantId:applicantId,slotId:slotId,
      idempotencyKey:key,nowUtc:nowUtc,
      holdUntilUtc:holdUntilUtc
    })!==true) {
      throw new Error('預約暫留寫入未確認，拒絕宣稱成功。');
    }
    // An append that released the lock is not safe to acknowledge; the
    // operation may already have written, so report failure for reconciliation.
    bookingHoldAssertLockStillHeld_(lock);
    var after=bookingHoldSnapshot_(adapters);
    bookingHoldAssertLockStillHeld_(lock);
    bookingComputeAvailability_(after.slots.rows,after.reservations.rows,nowUtc);
    bookingHoldAssertUniqueActiveApplicants_(after.reservations.rows,now);
    bookingHoldAssertGlobalOccupancy_(after.slots.rows,after.reservations.rows,now);
    bookingHoldAssertSlotsStable_(oldSlots,after.slots.rows);
    bookingHoldAssertHistoryStable_(oldHistory,after.reservations.rows);
    var newRows=after.reservations.rows.filter(function(r){
      return !bookingBlankRow_(r) && !oldIds.has(r[0]);
    });
    var match=bookingHoldExistingKey_(after.reservations.rows,key);
    if (newRows.length!==1 || !match || match!==newRows[0] ||
        match[1]!==applicantId || match[2]!==slotId ||
        bookingStatus_(match[3])!==BOOKING_STATUS_.hold ||
        bookingInstant_(match[4])!==until ||
        // A newly created HELD row must record the transaction's server time
        // and must not already carry confirmation/cancellation events.
        bookingInstant_(match[6])!==now ||
        // An optional update timestamp must be a valid UTC instant and
        // cannot precede the newly recorded creation time. A malformed
        // readback must never be acknowledged as a successful hold.
        (match[9] !== '' && match[9] != null &&
          bookingInstant_(match[9]) < now) ||
        (match[7] !== '' && match[7] != null) ||
        (match[8] !== '' && match[8] != null) ||
        bookingHoldCount_(after.reservations.rows,slotId,now)>
          bookingCapacity_(before.slots.rows.filter(function(r){
            return !bookingBlankRow_(r) && r[0]===slotId;
          })[0][3])) {
      throw new Error('預約寫入後核對失敗，拒絕宣稱成功。');
    }
    return {held:true,reason:'CREATED'};
  } finally {
    lock.releaseLock();
  }
}
