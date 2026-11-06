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
