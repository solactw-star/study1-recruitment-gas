/**
 * Study 1: CLOSED, internal-only approved PDF byte-integrity preflight.
 *
 * No Drive/Sheets access, PDF editing, signature collection, or public API.
 * The expected SHA-256 MUST come from an independently verified, researcher-
 * approved PDF reference; never from the participant or the file being tested.
 * Inject a trusted readPdfBytes() and SHA-256 digestBytes() adapter. For GAS,
 * the latter can call Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
 * bytes) after separate approval. This is NOT a PDF parser or signature check.
 */
function consentPdfIntegrityPreflight_(approvedSha256, readPdfBytes, digestBytes) {
  // Validate the independent trust anchor before reading any document bytes.
  if (typeof approvedSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(approvedSha256)) {
    throw new Error('核准同意書 SHA-256 基準值尚未核實。');
  }
  if (typeof readPdfBytes !== 'function' ||
      typeof digestBytes !== 'function') {
    throw new Error('同意書位元組與 SHA-256 檢查介面尚未就緒。');
  }
  var bytes = readPdfBytes();
  // Apps Script Blob.getBytes() returns Byte[]. Signed Java bytes are valid.
  // 20 MiB is a provisional operational memory guard, NOT an IRB file policy.
  if (!Array.isArray(bytes) || bytes.length < 8 ||
      bytes.length > 20 * 1024 * 1024) {
    throw new Error('同意書位元組資料格式或大小不合法。');
  }
  for (var i = 0; i < bytes.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(bytes, i) ||
        !Number.isInteger(bytes[i]) || bytes[i] < -128 || bytes[i] > 255) {
      throw new Error('同意書位元組資料不完整或不合法。');
    }
  }
  // Basic PDF signature check only; this cannot prove that a PDF is safe,
  // complete, readable, or IRB-approved. Exact hash is the integrity gate.
  if ([37, 80, 68, 70, 45].some(function(value, index) {
    return (bytes[index] & 255) !== value;
  })) {
    throw new Error('同意書不是預期的 PDF 位元組格式。');
  }
  var digest = digestBytes(bytes.slice());
  if (!Array.isArray(digest) || digest.length !== 32) {
    throw new Error('同意書 SHA-256 摘要格式不合法。');
  }
  var actual = '';
  for (var j = 0; j < 32; j++) {
    if (!Object.prototype.hasOwnProperty.call(digest, j) ||
        !Number.isInteger(digest[j]) ||
        digest[j] < -128 || digest[j] > 255) {
      throw new Error('同意書 SHA-256 摘要格式不合法。');
    }
    actual += ('0' + (digest[j] & 255).toString(16)).slice(-2);
  }
  if (actual !== approvedSha256) {
    throw new Error('同意書位元組與獨立核准基準雜湊不一致，已拒絕使用。');
  }
  // Never return raw PDF, applicant IDs, signing tokens, or audit details.
  return {ok: true};
}
