/** V08 TEST-only token state-machine contract. No live entry points or persistence.
 * Deliberately NOT wired to doGet, public routing, notifications or production data.
 * Caller must supply a reviewed cryptographic hash and secure storage adapter.
 */
const STUDY1_V08_ENABLED_ = false;
function study1V08Guard_(record, input, now, hash) {
  if (STUDY1_V08_ENABLED_ !== false) throw Error('V08 activation requires separate approval');
  if (!record || !input || !Number.isSafeInteger(now) || now < 0 ||
      typeof hash !== 'function' || typeof input.token !== 'string' ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(input.token)) return {ok:false, reason:'INVALID'};
  if (record.status !== 'ISSUED' || !Number.isSafeInteger(record.expiresAt) ||
      now >= record.expiresAt || !Number.isSafeInteger(record.revision) || record.revision < 1)
    return {ok:false, reason:'UNAVAILABLE'};
  if (!/^SIM-[0-9]{3,}$/.test(input.applicationId || '') ||
      !['E1','E2'].includes(input.experiment) ||
      !['MOVE','CANCEL'].includes(input.action) ||
      record.applicationId !== input.applicationId ||
      record.experiment !== input.experiment ||
      !Array.isArray(record.actions) || !record.actions.includes(input.action))
    return {ok:false, reason:'UNAVAILABLE'};
  // Comparison of digests MUST be constant-time in the eventual approved adapter.
  const digest=hash(input.token);
  if (!/^[a-f0-9]{64}$/.test(digest) || digest !== record.tokenSha256)
    return {ok:false, reason:'UNAVAILABLE'};
  return {ok:true, expectedRevision:record.revision};
}
function study1V08ConsumePlan_(record, input, now, hash) {
  const checked=study1V08Guard_(record,input,now,hash);
  if (!checked.ok) return checked;
  // Pure plan only: never authorizes writes without ScriptLock, CAS, and readback.
  return {ok:true, expectedRevision:checked.expectedRevision,
    next:{...record,status:'CONSUMED',revision:record.revision+1,consumedAt:now}};
}
