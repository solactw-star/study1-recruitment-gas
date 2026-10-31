# Study 1｜封閉改期 staging 安全審查（2026-10-31）

**結論：BLOCK / 不得合併或部署。** 本次僅審查私人分支 `staging/held-reschedule-20261029` 的 `staging/held-reschedule-20261029.gs`；沒有修改正式 GAS、Sheets、REC、FAST、QC、HTML MASTER，也沒有開放收件。所有執行證據來自記憶體中的**虛構資料、假工作表、假 LockService**，不是正式預約資料。

## 已核實基準

- 2026-10-31 21:11（臺灣時間）讀取 GitHub：main HEAD `d69609c38d1465375576b8d4c62c9181c4a61c66`；staging HEAD `5798c218b428df89bd8f6c75db33fe17d3829070`。比較為 **diverged、staging ahead 3 / behind 85**，僅 staging 下兩個檔案是分支相對共同祖先的增量；不可把整個 staging branch 合併覆蓋 main。
- 828 研究室的 GAS ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、operations Sheet ID `1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ`、備份 ZIP ID `1NSKVnqBSvMUkKz5IwncKnOkvYzj1M0Mp` 仍顯示私人 owner `solac.tw@gmail.com`。唯讀 `SystemConfig` 顯示 `OPEN=false`、`CONSENT_READY=false`。**本次未取得最新 GAS 遠端原始碼 hash/drift，不能宣稱來源同步。**

## 封閉動態驗證：實際執行 staging 原函式（mocked）

從 staging branch 讀取原始 `.gs` 程式，將 `rescheduleHold` / `patchRow_` 放入隔離 JS 執行環境，以虛構 `APP_A`、`SLOT_OLD`、`SLOT_NEW`、記憶體陣列、假 `LockService` / `SpreadsheetApp.flush` / `audit_` 驗證。沒有呼叫真實 Google 服務。

| 案例 | 假資料條件 | 實際結果 | 審查 |
| --- | --- | --- | --- |
| A：改到即將開始的時段 | 原 HELD 到期還有 15 分鐘；目標時段 5 分鐘後開始、容量足夠 | `ok:true`、`writes:1`、`finalSlot:SLOT_NEW` | **高優先**：目標時段開始早於原暫留到期，未阻擋；缺少 `hold_until <= target.start_at`。 |
| B：稽核寫入失敗 | 新時段合法；`patchRow_` 已寫入；假 `audit_` 拋出例外 | 函式拋錯，卻 `writes:1`、`finalSlot:SLOT_NEW` | **高優先**：部分成功，呼叫者不知道改期已發生；未設計可恢復稽核或交易補償／重讀確認。 |
| C：同時段不同重送鍵 | `held.slot_id === newSlotId`，但傳入不同 `requestKey` | `ok:true`、`writes:0`、`audits:0` | **中優先**：同時段直接成功，沒有確認此次請求是否與原鍵相同；需先定義 no-op / replay 合約。 |

## 靜態整合風險

1. staging 以 `hold_until`、`start_at`、`updated_at` 為欄位名稱；現行 main 已核對的工作簿欄位是 `hold_until_utc`、`start_at_utc`、`updated_at_utc`。**不可假設相容**，需依真實 `tableHeader_` 映射核實。
2. staging 容許 `FINALIZING`；main 的封閉 BookingCore 候選狀態沒有此值。合併前必須明確審查跨版本狀態轉移，不能靜默忽略。
3. staging 改期直接覆寫 `idempotency_key`，未保留先前改期請求的不可變紀錄。若同一 reservation 多次改期，歷史鍵與重送語義可能無法稽核。
4. `patchRow_` 讀整列再 `setValues` 寫整列，僅靠本 GAS 的 script lock 無法排除其他直接 Sheet 編輯器修改；而且寫後沒有重讀驗證。這是非交易式 Sheets 的既有限制，**不可聲稱原子性**。
5. 此 staging 函式的 `requireOpen_()` 是舊 ZIP 介面，不能取代 main `Website.js` 已固定關閉的公開端點；不可將它接到正式公開 API。

## 封閉修正與驗收條件（未實作、不得視為通過）

- 先以現行 main 的欄位／狀態模型重寫或轉接改期內核，**保留原預約不變**直至所有條件與鎖內新鮮快照檢查通過。
- 增加目標時段開始時間不得早於暫留到期的檢查；同時確認 `now < hold_until <= newSlot.start`、目標仍 OPEN、全域容量與同申請者唯一有效預約。
- 明確區分相同請求的重送、同時段 no-op、同鍵不同參數、改期後再改期；採用可稽核且不可被覆寫抹除的重送／歷程設計，並檢查失敗回復。
- 使用同一 script-wide lock，鎖內檢查及寫後回讀；對 `audit_` 失敗／Sheet 寫入失敗／超時設計可恢復狀態，不得將部分成功誤報為完整成功。
- 補充虛構 fixture：A/B/C 三案、不同申請者搶最後一席、跨表漂移、重送、逾期、取消、跨版本欄位及狀態差異；通過 CI 後才考慮獨立測試環境驗收。正式 GAS 同步與對外部署均須另行取得使用者明確授權。

## 官方依據與限制

- Google Apps Script [LockService](https://developers.google.com/apps-script/reference/lock) / [Lock](https://developers.google.com/apps-script/reference/lock/lock)：script-wide lock 能序列化**配合相同鎖的程式執行**；官方亦要求對 Sheets 寫入在釋放鎖前 flush。
- Google Apps Script [Quotas](https://developers.google.com/apps-script/guides/services/quotas)：執行、並行、服務配額可中斷流程，故必須考慮部分成功與恢復。
- GitHub branch compare: `main...staging/held-reschedule-20261029`；原碼：`staging/held-reschedule-20261029.gs`。

**安全狀態：僅封閉審查；正式收件、OTP、電子同意書簽署均未開放。**
