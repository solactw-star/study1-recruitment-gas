/** Disabled V08 synthetic capability contract; no routes, notifications or storage. */
const STUDY1_V08_ENABLED_ = false;
function study1V08Guard_(record, input, now, hash, equalDigest) {
  if (STUDY1_V08_ENABLED_ !== false) throw Error('V08 activation requires separate approval');
  if (!record || !input || !Number.isSafeInteger(now) || now < 0 ||
      typeof hash !== 'function' || typeof equalDigest !== 'function' ||
      typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(input.token))
    return {ok:false,reason:'INVALID'};
  if (record.status !== 'ISSUED' || !Number.isSafeInteger(record.expiresAt) ||
      now >= record.expiresAt || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== record.revision)
    return {ok:false,reason:'UNAVAILABLE'};
  if (!/^SIM-[0-9]{3,}$/.test(input.applicationId || '') ||
      !['E1','E2'].includes(input.experiment) || !['MOVE','CANCEL'].includes(input.action) ||
      record.applicationId !== input.applicationId || record.experiment !== input.experiment ||
      !Array.isArray(record.actions) || !record.actions.includes(input.action))
    return {ok:false,reason:'UNAVAILABLE'};
  const digest=hash(input.token);
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) ||
      typeof record.tokenSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.tokenSha256) ||
      equalDigest(digest,record.tokenSha256) !== true)
    return {ok:false,reason:'UNAVAILABLE'};
  return {ok:true,expectedRevision:record.revision};
}
function study1V08ConsumePlan_(record,input,now,hash,equalDigest) {
  const checked=study1V08Guard_(record,input,now,hash,equalDigest);
  if (!checked.ok) return checked;
  if (record.revision >= Number.MAX_SAFE_INTEGER) return {ok:false,reason:'UNAVAILABLE'};
  // A plan is NOT a commit. Real adapter requires server-side lock, CAS and readback.
  return {ok:true,expectedRevision:checked.expectedRevision,
    next:{...record,status:'CONSUMED',revision:record.revision+1,consumedAt:now}};
}

/**
 * Disabled synthetic-only atomic consumption adapter.
 * Caller MUST supply a real exclusive server-side lock and durable CAS store.
 * A successful CAS is not a booking mutation; this consumes only the capability.
 * An uncertain write/readback MUST remain UNKNOWN, never auto-retry.
 */
function study1V08ConsumeAtomic_(input, now, adapter) {
  if (STUDY1_V08_ENABLED_ !== false) throw Error('V08 activation requires separate approval');
  if (!adapter || typeof adapter.withExclusiveLock !== 'function' ||
      typeof adapter.read !== 'function' || typeof adapter.compareAndSwap !== 'function' ||
      typeof adapter.hash !== 'function' || typeof adapter.equalDigest !== 'function')
    return {ok:false,reason:'ADAPTER_UNAVAILABLE'};
  try {
    let callbackCount = 0;
    let callbackResult;
    const lockedResult = adapter.withExclusiveLock(function() {
      callbackCount++;
      if (callbackCount !== 1) return {ok:false,reason:'UNKNOWN_NO_RETRY'};
      callbackResult = consumeUnderLock();
      return callbackResult;
    });
    function consumeUnderLock() {
      const record=adapter.read(input && input.applicationId);
      const plan=study1V08ConsumePlan_(record,input,now,adapter.hash,adapter.equalDigest);
      if (!plan.ok) return {ok:false,reason:plan.reason};
      const wrote=adapter.compareAndSwap(input.applicationId,plan.expectedRevision,plan.next);
      if (wrote !== true) return {ok:false,reason:'CONFLICT_OR_UNKNOWN'};
      // Verify the exact committed state before acknowledging consumption.
      const saved=adapter.read(input.applicationId);
      if (!saved || saved.status !== 'CONSUMED' ||
          saved.revision !== plan.next.revision ||
          saved.consumedAt !== now ||
          saved.tokenSha256 !== record.tokenSha256 ||
          saved.applicationId !== record.applicationId ||
          saved.experiment !== record.experiment ||
          !Array.isArray(saved.actions) ||
          saved.actions.length !== plan.next.actions.length ||
          saved.actions.some((action,index)=>action !== plan.next.actions[index]) ||
          saved.expiresAt !== record.expiresAt)
        return {ok:false,reason:'UNKNOWN_READBACK'};
      return {ok:true,status:'CONSUMED',revision:saved.revision};
    }
    if (callbackCount !== 1 || lockedResult !== callbackResult)
      return {ok:false,reason:'UNKNOWN_NO_RETRY'};
    // A broken lock provider may return without invoking the callback.
    // Never interpret an absent or malformed result as a successful write.
    if (!lockedResult || typeof lockedResult !== 'object' ||
        typeof lockedResult.ok !== 'boolean' ||
        (lockedResult.ok === true && lockedResult.status !== 'CONSUMED'))
      return {ok:false,reason:'UNKNOWN_NO_RETRY'};
    return lockedResult;
  } catch (_) {
    // The write may have committed before a transport/storage failure.
    return {ok:false,reason:'UNKNOWN_NO_RETRY'};
  }
}
