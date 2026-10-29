# Study 1 信箱驗證 OTP：純內部安全核心（未對外啟用）

## 正式欄位基準
2026-10-29 重新核對 828 研究室個資/同意書 Google Sheet `Verification` 第一列：
`challenge_id`, `applicant_id`, `purpose`, `otp_hmac`, `expires_at_utc`, `attempts`, `used_at_utc`, `email`, `created_at_utc`。

當次也再次核對時段營運 Sheet 的 `SystemConfig`：
`OPEN=false`、`CONSENT_READY=false`、`CONTACT_EMAIL=lily4318@cycu.edu.tw`。

## 本輪新增
- `gas/OtpCore.js` 提供驗證表標題檢查、HMAC-SHA256 計算、雜湊字串固定時間風格比對、到期／重放／嘗試上限判定。
- HMAC 綁定 challenge ID、applicant ID、用途及驗證碼；**不持久保存明碼**。
- 回傳值只包含判定、候選嘗試次數及候選已使用時間；不輸出電子郵件、簽章、OTP、金鑰或任何個人識別碼。
- `tests/otp.test.cjs` 使用完全虛構的測試資料及 Node.js 的 HMAC 模擬 GAS Utilities，包含不正確碼、已到期、重複使用、嘗試上限、時間與欄位異常等安全情境。
- 原有 `Website.js`、`Index.html`、`appsscript.json` 未更動；`requestOtp()` 與 `verifyOtp()` 仍拒絕所有呼叫。

## 暫定、尚未核准的 OTP 政策
- 8 位數數字碼、10 分鐘有效、每筆 challenge 最多 5 次嘗試。
- 驗證用途 `EMAIL_VERIFICATION` 為程式開發暫定值，原始欄位尚未提供正式列舉值。
- 正式 OTP 必須由**密碼學安全隨機數產生器**生成；本輪未實作發碼，避免使用弱隨機來源。
- `otpEvaluateVerification_` 僅提供「擬議」欄位更新結果；**尚未加入 LockService、原子性驗證與更新、發信速率限制、帳號節流、發送失敗重試、寄信或真實 Google Sheet 寫入**。
- 任何正式流程必須在鎖內重新讀取對應 challenge，核對權限與狀態，連同嘗試數與一次性使用時間原子性更新；不得把本純函式的傳回值直接當作已完成電子郵件驗證證據。
- 不得把錯誤狀態或電子郵件是否存在的差異回傳公開使用者介面。

## 來源
- Google Apps Script Utilities `computeHmacSha256Signature` 官方文件：
  https://developers.google.com/apps-script/reference/utilities/utilities
- OWASP Multifactor Authentication Cheat Sheet，OTP 應短時效、限次、一次性、不可記錄明碼：
  https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html

研究網站仍禁止正式招募與電子簽署；不執行 Pilot。後續須依核准 REC 文件與使用者明確授權才可開始真實收件。
