/**
 * Study 1: CLOSED, adapter-injected booking hold transaction test kernel.
 * No live Sheets writes, public endpoints, participant reads, or email.
 * Every writer MUST use the same script-wide lock; Google Sheets is not a
 * transactional database. This is NOT production-ready booking code.
 */
var BOOKING_HOLD_MAX_MS_ = 15 * 60 * 1000; // provisional researcher policy
function bookingHoldKey_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error('預約重送識別碼格式不合法。');
  }
  return value;
}
function bookingHoldSnapshot_(adapter) {
  var s=adapter.readSnapshot();
  if (!s || !s.slots || !s.reservations ||
      !Array.isArray(s.slots.rows) || !Array.isArray(s.reservations.rows)) {
    throw new Error('預約快照格式不合法。');
  }
  bookingAssertSchema_(s.slots.headers,BOOKING_SLOT_HEADERS_);
  bookingAssertSchema_(s.reservations.headers,BOOKING_RESERVATION_HEADERS_);
  // The generic kernel accepts a minimum-width schema, but a locked Sheet
  // transaction must reject extra columns as well as missing columns. A
  // writer using a different layout could otherwise corrupt reservations.
  if (s.slots.headers.length !== BOOKING_SLOT_HEADERS_.length ||
      s.reservations.headers.length !== BOOKING_RESERVATION_HEADERS_.length ||
      s.slots.rows.some(function(row) {
        return !Array.isArray(row) || row.length !== BOOKING_SLOT_HEADERS_.length;
      }) ||
      s.reservations.rows.some(function(row) {
        return !Array.isArray(row) || row.length !== BOOKING_RESERVATION_HEADERS_.length;
      })) {
    throw new Error('預約快照欄位寬度不一致，拒絕預約交易。');
  }
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
  return s;
}
function bookingHoldActive_(row,nowMs) {
  var status=bookingStatus_(row[3]);
  if (status===BOOKING_STATUS_.confirmed) return true;
  if (status===BOOKING_STATUS_.hold) {
    return bookingInstant_(row[4])>nowMs;
  }
  if (status===BOOKING_STATUS_.cancelled || status===BOOKING_STATUS_.expired) return false;
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
  var counts=new Map();
  reservationRows.forEach(function(row) {
    if (bookingBlankRow_(row) || !bookingHoldActive_(row,nowMs)) return;
    var id=bookingId_(row[2]);
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
function bookingHoldOnceLocked_(request,adapters) {
  if (!request || typeof request!=='object' || Array.isArray(request) ||
      !adapters || typeof adapters.getLock!=='function' ||
      typeof adapters.isVerifiedAndEligible!=='function' ||
      typeof adapters.readSnapshot!=='function' ||
      typeof adapters.appendHold!=='function') {
    throw new Error('預約交易介面尚未就緒。');
  }
  bookingId_(request.applicantId);
  bookingId_(request.slotId);
  bookingHoldKey_(request.idempotencyKey);
  var now=bookingInstant_(request.nowUtc);
  var until=bookingInstant_(request.holdUntilUtc);
  if (until<=now || until-now>BOOKING_HOLD_MAX_MS_) {
    throw new Error('暫留有效期限不合法。');
  }
  var lock=adapters.getLock();
  if (!lock || typeof lock.tryLock!=='function' ||
      typeof lock.releaseLock!=='function' || lock.tryLock(5000)!==true) {
    throw new Error('無法取得預約全域交易鎖，已拒絕操作。');
  }
  try {
    if (adapters.isVerifiedAndEligible(request.applicantId)!==true) {
      return {held:false,reason:'REJECTED'};
    }
    var before=bookingHoldSnapshot_(adapters);
    // Full validation of all slot and reservation records fails closed.
    var available=bookingComputeAvailability_(
      before.slots.rows,before.reservations.rows,request.nowUtc);
    bookingHoldAssertUniqueActiveApplicants_(before.reservations.rows,now);
    bookingHoldAssertGlobalOccupancy_(before.slots.rows,before.reservations.rows,now);
    var existing=bookingHoldExistingKey_(before.reservations.rows,request.idempotencyKey);
    if (existing) {
      var replaySlot=before.slots.rows.filter(function(r) {
        return !bookingBlankRow_(r) && r[0]===request.slotId;
      })[0];
      if (existing[1]===request.applicantId &&
          existing[2]===request.slotId &&
          bookingStatus_(existing[3])===BOOKING_STATUS_.hold &&
          bookingHoldActive_(existing,now) &&
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
      if (!bookingBlankRow_(row) && row[1]===request.applicantId &&
          bookingHoldActive_(row,now)) {
        return {held:false,reason:'REJECTED'};
      }
    }
    var chosen=available.filter(function(x){return x.slotId===request.slotId;})[0];
    if (!chosen || until>bookingInstant_(chosen.startAtUtc)) {
      return {held:false,reason:'REJECTED'};
    }
    var oldSlots=bookingHoldFreezeHistory_(before.slots.rows);
    var oldHistory=bookingHoldFreezeHistory_(before.reservations.rows);
    var oldIds=new Set(before.reservations.rows.filter(function(r){
      return !bookingBlankRow_(r);
    }).map(function(r){return r[0];}));
    if (adapters.appendHold({
      applicantId:request.applicantId,slotId:request.slotId,
      idempotencyKey:request.idempotencyKey,nowUtc:request.nowUtc,
      holdUntilUtc:request.holdUntilUtc
    })!==true) {
      throw new Error('預約暫留寫入未確認，拒絕宣稱成功。');
    }
    var after=bookingHoldSnapshot_(adapters);
    bookingComputeAvailability_(after.slots.rows,after.reservations.rows,request.nowUtc);
    bookingHoldAssertUniqueActiveApplicants_(after.reservations.rows,now);
    bookingHoldAssertGlobalOccupancy_(after.slots.rows,after.reservations.rows,now);
    bookingHoldAssertSlotsStable_(oldSlots,after.slots.rows);
    bookingHoldAssertHistoryStable_(oldHistory,after.reservations.rows);
    var newRows=after.reservations.rows.filter(function(r){
      return !bookingBlankRow_(r) && !oldIds.has(r[0]);
    });
    var match=bookingHoldExistingKey_(after.reservations.rows,request.idempotencyKey);
    if (newRows.length!==1 || !match || match!==newRows[0] ||
        match[1]!==request.applicantId || match[2]!==request.slotId ||
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
        bookingHoldCount_(after.reservations.rows,request.slotId,now)>
          bookingCapacity_(before.slots.rows.filter(function(r){
            return !bookingBlankRow_(r) && r[0]===request.slotId;
          })[0][3])) {
      throw new Error('預約寫入後核對失敗，拒絕宣稱成功。');
    }
    return {held:true,reason:'CREATED'};
  } finally {
    lock.releaseLock();
  }
}
