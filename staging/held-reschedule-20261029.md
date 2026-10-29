# Study 1｜暫時保留時段改選／取消安全增量（2026-10-29）

**狀態：僅離線修訂與測試，尚未讀取既有 GAS 遠端原始碼，禁止直接部署。**

本變更的完整程式、HTML、測試、離線展示及回歸測試結果保存在 `Study1_828網站增量_暫保改選取消_20261029_1714.zip`；ZIP SHA-256：

`5f5faa279a32b0719dcbc0c41b2b57518636ddec4d6924a38dea56873a6acdd0`

此 GitHub 分支保留本輪**待核對增量**，不是遠端 GAS 的原始碼基準，不應自動 push。

## 具體程式變更

- `gas/Api.gs` 新增 `rescheduleHold(token,reservationId,newSlotId,requestKey)`：只有同一報名者的未逾期 `HELD` 可改選；`LockService.getScriptLock()` 內檢查目標名額；新時段滿額或無效時保留原時段；不延長保留期限；重送同一改期請求不重複寫入。
- `gas/Setup.gs` 新增 `patchRow_()`：在既有鎖內一次更新同列的多個欄位，保留未映射的未知欄位。
- `gas/Index.html`／`gas/Client.html`：加入「改選保留時段」「取消暫時保留」「返回原保留時段」，並重新取得可用名額；返回不會更動原保留。
- `preview.html` 由 `gas/Index.html` + `Styles.html` + `Client.html` 生成，保持純離線展示。
- `tests/check_reschedule.js`：14 類權限、期限、名額、重送與狀態案例，另驗證單列更新保留未知欄位；`tests/check_api.js` 新增關閉時改期拒絕；`tests/browser_smoke.py` 增加改選／取消 UI 流程。

## 離線測試（全部通過）

```text
PASS: eligibility, dual safety gate, OTP gate, email format, closed consent, sheet row index, formula injection, missing-app cancellation, no premature PII persistence.
PASS: 7 idempotency replay / state / changed-slot cases; no writes on rejected replays.
PASS: 14 hold-reschedule state/security scenarios + single-row atomic update preservation; locks released.
PASS: GAS merge preserves unknown remote files, detects conflicting types, validates manifest.
PASS: files parse, contact email updated, preview offline, production locked, consent disabled.
PASS browser smoke: desktop/mobile preview, OTP mock, eligibility, slots, demo hold change/cancel, consent blocked.
```

## 不可跳過的遠端安全驗證

1. 只用 828 研究室 `solac.tw@gmail.com` 授權讀取既有 GAS `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 的完整 `.gs`、`.html`、`appsscript.json`。
2. 完整備份遠端版本，對照本輪修訂，確認沒有遠端未知檔案被刪除或覆蓋；審查差異後才允許合併。
3. 在 GAS 測試環境實際驗證兩人同時搶位、取消、改選、失效重試、Google Sheets 失敗復原。
4. 正式 PDF 簽署、權限、研究倫理及資安驗收完成之前，維持 `OPEN=false`、`CONSENT_READY=false`、`CONSENT_ENGINE_IMPLEMENTED_=false`，不得正式收件。

官方依據：

- Google LockService: https://developers.google.com/apps-script/reference/lock/lock-service
- Google HTML Service: https://developers.google.com/apps-script/guides/html/communication
- Google Apps Script API: https://developers.google.com/apps-script/api/how-tos/manage-projects
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- OWASP ASVS 5.0: https://asvs.owasp.org/
