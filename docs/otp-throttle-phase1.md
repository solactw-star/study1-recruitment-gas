# Study 1：跨 challenge OTP 節流與重送限制（封閉內部核心）

2026-10-29，本輪基準：私人 GitHub main `6860c535e834e88706e619a1b7ac5b32e3bf1b96`，CI run `40855805115` 通過 34/34。828 研究室 Google Drive metadata 再次確認唯一 GAS 專案與兩份正式 Sheets 僅擁有者 `solac.tw@gmail.com`，未公開；`SystemConfig OPEN=false`、`CONSENT_READY=false`。

## 新增的實際程式
- `gas/OtpThrottle.js`：讀取注入的 Verification 快照，依**申請者 ID 或正規化 email 任一相符**合併最近一小時的 challenge 數及嘗試次數。避免同一信箱藉由建立新 challenge 或換 applicant ID 直接重設額度。
- `otpThrottleIssuePreflight_`：僅判定是否具備「在鎖內繼續建立 challenge 的候選資格」，**不預留額度、不發碼、不寄信、不寫入**；真實建立流程須在同一 script lock 內重新檢查並新增資料，才可避免競態。
- `otpThrottleVerifyGate_`：以同一快照判定跨 challenge 嘗試額度。
- `gas/OtpTransaction.js`：在既有 script lock 及讀取最新快照後，**必須先通過帳號級額度檢查**才評估 OTP；拒絕不會寫入或外洩電子郵件。
- `tests/otp-transaction.test.cjs` 載入新的節流依賴；`tests/otp-throttle.test.cjs` 用虛構資料測試跨 challenge、跨 applicant 同 email、同 applicant 換 email、冷卻時間、滾動時間窗、壞資料、無寫入與交易整合。

## 暫定政策，尚未取得正式核准
- 每個 rolling 60 分鐘最多 3 筆 challenge；兩次發碼至少間隔 60 秒；一小時最多 10 次累積驗證嘗試。
- 這些**數值不是 NIST 指定數字**，僅供封閉測試；實際招募前需考慮使用者可及性、研究倫理及防濫用風險，確認後才定案。
- `Verification` 現有 `attempts` 欄位累計每個 challenge 的嘗試次數（含成功一次），跨 challenge 加總採保守計數。
- 現有歷史資料必須保留至少完整節流視窗；清除舊列或使用不同專案、不同鎖可能繞過限額。
- Email OTP 僅證明對信箱的控制權，不是實名身分驗證或 NIST 多因素驗證；NIST 800-63B-4 明確不將 email 視為 out-of-band authentication。

## 未完成，不能啟用
- **未實作安全隨機發碼（CSPRNG）**。Apps Script `Utilities.getUuid()` 官方文件未承諾其可作為安全驗證碼產生器；不能將 `Math.random()` 或未經核實的 UUID 轉換當作安全 OTP。
- 尚無原子性的「節流判定＋建立 challenge」正式 Google Sheets adapter、信件送出與失敗補償、帳號與 IP 節流、濫用防護、正式 REC 招募條件或簽署 PDF。
- 節流仍依賴未受外部改寫的 Verification 歷史紀錄；手動 Sheet 編輯及其他 GAS 專案不受同一把 script lock 約束。
- 公開 `requestOtp()`、`verifyOtp()`、報名、預約與電子同意書全部維持關閉。**沒有執行 clasp push、沒有覆寫 GAS、沒有部署或處理真實個資**。
- 本輪未重新取得 GAS 遠端原始碼 SHA，不能宣稱 remote drift 已通過。

## 官方依據
- NIST SP 800-63B-4：速率限制、一次性、out-of-band email 限制：https://pages.nist.gov/800-63-4/sp800-63b.html
- Google Apps Script LockService（script lock 跨使用者；document lock 在獨立 Web App 可能為 null）：https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Utilities（UUID 文件不保證永久唯一或 CSPRNG 適用性）：https://developers.google.com/apps-script/reference/utilities/utilities
- OWASP Authentication Cheat Sheet：https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
