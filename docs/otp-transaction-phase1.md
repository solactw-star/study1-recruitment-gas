# Study 1：OTP 單次使用交易核心（2026-10-29，僅封閉測試）

## 來源與實際核對
- 828 研究室 Google Drive 帳號 `solac.tw@gmail.com`，唯一 GAS 專案 `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`，當次 Drive metadata：僅 owner、未公開分享；**本輪未取得遠端 GAS 原始碼即時雜湊，不宣稱 remote drift 已通過**。
- 828 研究室營運 Sheet `SystemConfig` 再次唯讀核對：`OPEN=false`、`CONSENT_READY=false`、`CONTACT_EMAIL=lily4318@cycu.edu.tw`。
- 私人 GitHub `main` 本輪開始 HEAD `f3e035980d07dc660fff656d6851d689eaa2c679`，CI 23/23 通過。
- `staging/held-reschedule-20261029` 與 main 分岔（ahead 3/behind 5），**未合併、未覆寫或誤認為已部署**。

## 新增封閉功能
`gas/OtpTransaction.js` 的 `otpVerifyOnceLocked_(request, adapters)` 只提供內部交易協調邏輯：
1. 必須先取得**跨使用者**共用的 script lock，未取得立即拒絕；所有狀態讀取均在鎖內。
2. 重新核對 `Verification` 工作表標題、唯一 challenge ID、申請者 ID、電子郵件與驗證用途；未知或重複 challenge 一律拒絕。
3. 沿用已測試的 `otpEvaluateVerification_`，檢查 HMAC、時效、單次使用及錯誤次數。
4. 只對可評估的驗證碼產生一筆 F:G（`attempts`、`used_at_utc`）更新要求；寫入後**再次讀取並核對**，才可能回傳 `verified=true`。
5. 公開結果不暴露 challenge、申請者、email、OTP 或簽章；普通拒絕一律回傳 `REJECTED`，不提供帳號存在性資訊。
6. 所有路徑以 `finally` 釋放鎖；鎖、寫入或讀回失敗即拒絕，避免錯誤聲稱驗證成功。

`tests/otp-transaction.test.cjs` 使用完全虛構資料及記憶體內的 lock/store，測試重放、五次失敗、身分不符、過期、重複 challenge、鎖失敗、寫入與讀回故障及資料最小化。

## 仍待完成，**不得對外使用**
- 目前只使用注入的**離線測試 adapters**，沒有任何 `SpreadsheetApp` 真實寫入；未在 GAS 執行實際併發測試。
- 實際 adapter 需使用 `LockService.getScriptLock()`，而非 `getUserLock()` 或在獨立 Web App 可能為 null 的 `getDocumentLock()`；每筆 F:G 寫入使用單一 `setValues([[attempts,usedAt]])`，`SpreadsheetApp.flush()` 後再讀回。
- 所有 OTP 建立、重發、驗證及取消的程式都必須遵循同一 script lock；Google Sheets 手動編輯或其他獨立程式不受這把鎖約束，故**不能聲稱資料庫具完整交易原子性**。
- 發碼 CSPRNG、跨 challenge 的帳號層級失敗次數與速率限制、寄件限制、寄件失敗處理、存取授權、隱私告知、正式核准 REC 問題與 PDF 簽署尚未完成。
- 電子郵件 OTP **僅作為電子郵件控制權確認**，不能視為研究參與者真實身分驗證或 NIST 定義的多因素驗證。
- 原有 `Website.js` 公開 `requestOtp()`、`verifyOtp()`、`holdSlot()`、`submitConsent()` 等全部維持拒絕，`SystemConfig` 不變。

## 官方文件
- Google Apps Script LockService（web app 的 document lock 可能為 null）：
  https://developers.google.com/apps-script/reference/lock/lock-service
- Google Apps Script Range.setValues / SpreadsheetApp.flush：
  https://developers.google.com/apps-script/reference/spreadsheet/range
  https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app
- NIST SP 800-63B（一次性、10 分鐘內、帳號層級速率限制；Email 非 MFA）：
  https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP REST Security Cheat Sheet（每次請求伺服端檢查工作流程狀態）：
  https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

**本輪只提交 GitHub 程式與測試，不執行 clasp push --force、不寄送郵件、不收真實個資、不部署。**
