# Study 1 封閉預約暫留交易核心（2026-10-29）

## 核實來源
- GitHub main 起點：`34b3853b90e2fb917b63c09e9986d43eaa47f544`；上一輪 45/45 CI 成功。
- 828 研究室正式 Operations Sheet：`Slots` 與 `Reservations` 欄位依既有 `BookingCore.js`，未改動。
- 828 研究室 `SystemConfig` 本輪仍為 `OPEN=false`、`CONSENT_READY=false`，研究聯絡信箱 `lily4318@cycu.edu.tw`。
- 828 GAS 專案及兩份工作簿權限均為私人，owner `solac.tw@gmail.com`。
- 唯一正式 GAS 專案遠端 source drift 尚未重新核對雜湊；本次不執行 clasp push。

## 本次增量
- `gas/BookingHoldTransaction.js`：內部 `bookingHoldOnceLocked_` 使用注入式 adapter，要求取得 script-wide lock、鎖內確認申請者已完成伺服器端驗證與正式資格檢查、重新讀取 Slots/Reservations 全快照、保守計算名額、同一申請者僅能有一筆有效預約、重送鍵只能對同一筆有效暫留重送、鎖內寫入後再次讀取確認，finally 釋放鎖。
- `tests/booking-hold-transaction.test.cjs`：完全虛構資料，涵蓋額滿、重送、取消/過期、鎖衝突、錯誤快照、寫入/回讀失敗、無授權及資料損毀。
- 回傳結果僅 `{held,reason}`，不包含個資、預約 ID 或重送鍵。
- 未修改 `Website.js` 公開入口；正式 `holdSlot()` 仍拒絕，`listSlots()` 仍回傳空陣列。

## 重要限制
此版本**僅離線安全測試核心**，不是已部署的預約服務，也不是資料庫級交易。尚未實作正式 Sheet adapter、可靠唯一預約 ID、伺服器端資格驗證來源、寄信、改期取消、資料庫持久寫入補償。所有實際預約寫入者必須共用同一 script-wide lock，寫入必須在鎖內 `SpreadsheetApp.flush()` 後再回讀；若有其他程式/人工直接修改資料表，不能保證跨流程原子性。寫入成功但回讀失敗可能產生「未知結果」，後續應以同一冪等鍵在鎖內重新查核，不能直接重試新鍵。

`15` 分鐘暫留時間是**尚待研究端核准的候選政策**；idempotency key 必須由安全來源產生且與受試者綁定，不可由不可信任的 client 直接控制交易授權。研究一資格條件、PDF、REC 尚待核對。

## 官方依據
- Google Apps Script LockService: https://developers.google.com/apps-script/reference/lock
- Google Apps Script Lock: https://developers.google.com/apps-script/reference/lock/lock （明確要求在釋放鎖前 SpreadsheetApp.flush）
- Google Apps Script SpreadsheetApp: https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app

## 後續
下一輪先重新確認 main 與 staging 分支差異，再考慮安全合併改期功能或建置**唯讀**正式 Sheet adapter；不可自動部署或修改正式資料。

## 2026-11-01 增量：鎖內快照資源上限
- `bookingHoldSnapshot_` 對注入式 Slots 或 Reservations 快照各自限制最多 10,000 筆資料列，超過即在任何完整資料掃描與預約 append 前拒絕。與現有只讀 adapter 的操作上限一致；此為效能與執行時間防護，不是研究招募人數或 REC 規則。
- 新增 `tests/booking-hold-row-limit.test.cjs`，以虛構資料驗證兩表超額、10,000 筆邊界可通過結構預檢，以及鎖內拒絕時不寫入且 finally 釋放鎖。
- 依據：Google Apps Script 執行時間與配額 https://developers.google.com/apps-script/guides/services/quotas ，Google Apps Script 效能最佳實務 https://developers.google.com/apps-script/guides/support/best-practices 。
- 僅封閉測試內核；未連線真實 Sheets、未部署 GAS。此限制不提供真正的交易原子性。
