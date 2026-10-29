# Study 1 預約核心：第一階段內部計算

## 已核實來源
828 研究室在 2026-10-29 當次 Google Sheets 的**實際標題列**：

- Operations `Slots`: `slot_id`, `start_at_utc`, `end_at_utc`, `capacity`, `location_code`, `status`, `created_by`, `updated_at_utc`。
- Operations `Reservations`: `reservation_id`, `applicant_id`, `slot_id`, `status`, `hold_until_utc`, `idempotency_key`, `created_at_utc`, `confirmed_at_utc`, `cancelled_at_utc`, `updated_at_utc`。
- `SystemConfig` 當次 `OPEN=false`、`CONSENT_READY=false`。

## 本次加入的功能
- `gas/BookingCore.js` 以**純計算**驗證時段與預約資料格式、判斷暫留是否過期、保守計算剩餘名額，僅回傳時段 ID／UTC 時間／剩餘席位。
- 遇到重複時段、非法日期、未知預約狀態、遺失對應時段、格式不完整，一律中止計算，不宣稱尚有名額。
- `bookingVerifySheetHeaders_()` 可供研究人員在 GAS 編輯器中手動執行，僅讀取兩張工作表第一列標題，**不讀真實參與者資料、不寫資料**。
- 以上函式以尾端 `_` 限制從 HTML Service `google.script.run` 直接呼叫。既有公開 `listSlots()` 固定回傳空陣列；`holdSlot()`、`cancelHold()` 仍拒絕收件。

## 仍待研究端確認的設計（不得當作正式值）
`OPEN`、`CLOSED`、`CANCELLED` 時段狀態，以及 `HELD`、`CONFIRMED`、`CANCELLED`、`EXPIRED` 預約狀態目前只是**開發候選列舉值**；原始 Sheet 提供欄位名稱，尚未提供正式狀態對照與已核准預約規則。

## 下一階段之前的必要確認
- 完整報名資格條件與問題文字，必須逐項核對正式 REC／核准招募資料，不能自行補入。
- 預約流程須具原子性容量檢查、ScriptLock／DocumentLock、冪等處理、取消權限、寄信失敗補償與日誌去識別。
- 對外開放時段之前要明確確認 `SystemConfig` 與網站後端開關、公開存取權限、重放攻擊防護及正式電子同意 PDF 的版次。
- **目前不執行 Pilot、不收任何真實個資，網站正式報名與電子簽署一律關閉。**

## 驗證方式
`npm test` 執行測試。測試資料完全虛構，沒有任何真實參與者資料或核准結果。
