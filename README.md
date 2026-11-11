# Study 1 招募、預約與電子同意網站（828 研究室）

私人 GitHub 原始碼儲存庫；正式 GAS 專案仍為 **1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z**，擁有帳號為 **solac.tw@gmail.com**。

## 現行私人測試部署（截至 2026-11-03 的核實快照）

- **原 GAS 專案與私人 Web App 不變**：原 Script ID 為 `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`；原 `/exec` Deployment ID 為 `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`，版本化部署權限維持 `MYSELF`，未開放公開招募。
- **限定來源自動同步已運作**：`.github/workflows/study1-gas-auto-index.yml` 只在 `main` 推送其列明的 GAS、測試或同步程式路徑時執行；先檢查 CI、原 GAS 完整備份與競寫狀態，再只更新核准的 `Index`、`Website`、`AdminSandbox`、`AdminConsole`，同 ID 部署後回讀 SHA256。**單獨修改 `README.md` 不符合該工作流程的 `push.paths`，不會觸發 GAS 同步**。
- **最新核實快照**：私人 GitHub `main=864106915543d97a2b7031ee4874fe72da0a9a26`；[CI 381/381 PASS](https://github.com/solactw-star/study1-recruitment-gas/actions/runs/41596133886)；[GAS 原 `/exec` v31，`SYNC_VERIFIED=true`](https://github.com/solactw-star/study1-recruitment-gas/actions/runs/41596133947)，完整 SHA256 為 `28764132dae9a80b8f96c1a1991456153323e031aed14a6d2adfb8f4b75f9166`。更新前完整備份保存在 828 私人 Drive，File ID `1DyK4XxkujVjCoA92B7r2WoKdX3fros5P`。
- 使用者已提供原私人 GAS 後台 **8 項設定＋6 項虛構預約自我測試 PASS** 及 `OPEN=false`、`CONSENT_READY=false` 的 Script Properties 截圖。該截圖不能單獨證實新版 v31 已執行相同測試，也不等於獨立 Google 執行日誌稽核。
- **正式研究收件仍關閉**：公開 OTP、真人預約、同意書電子簽署入口均拒絕執行。現行部署僅供關閉研究資訊頁及研究室隔離測試後台；不得從歷史備份或 CI PASS 推論已核准正式開放。未來版本須以當次 `main`、Actions、GAS /exec 及原備份回讀重新核對。

## 初始歷史基準（2026-10-29；非現行部署狀態）

- 已以 GitHub Actions **唯讀**讀取 GAS 原始碼；來源備份執行編號 `40848488750`。
- 已比對四個 GAS 程式/設定檔的檔名與 SHA-256，將五個原始檔（包含 `.clasp.json`）保留至 `gas/`；原始備份長期存放於 828 Drive。
- `npm test`：不需要任何 OAuth 權限即可對目前「關閉招募」網站進行安全測試。
- `test.yml`：GitHub 提交或 PR 時執行安全測試，不進行部署。
- `manual-source-sync.yml`：**僅支援人工觸發**、需輸入指定確認字串，先讀取最新遠端 GAS 並核對原始碼雜湊，備份後才允許同步程式。**尚未執行，不會產生網站部署網址**。
- 不允許直接從 GitHub 自動更新公開 Web App 部署；正式報名／電子簽署仍關閉。

## 開發與測試

```bash
npm test
```

所有 Apps Script 程式放在 `gas/`，`gas/.clasp.json` 指定原有 GAS 專案。切勿上傳 `.clasprc.json`、OAuth token、參與者資料、真實簽署 PDF 到 GitHub。

初始來源雜湊參照 `docs/remote-baseline-20261029.json`，作為 2026-10-29 的歷史核對基準。GAS API 更新仍會**取代整個專案的原始碼**；初始同步當時要求遠端與備份完全相同。現行經核准的私人同步則以最新遠端全檔備份、核准來源範圍、競寫檢查、同 ID 部署及完整回讀為防護條件，不以初始基準檔冒充最新遠端狀態。

> **注意**：原始基準文件需永久保留以利追溯；後續每次 GAS 更新仍須依現行核准流程重新取得並審核遠端狀態、備份與回讀。不可略過驗證或自行修改基準讓失敗通過。

## PR #133 完整提交前驗證（2026-11-11）

為避免程式與測試分次提交觸發中間失敗 CI，在本機完成**整套功能、測試及文件**後，先執行：

```bash
npm run verify:pr
```

此指令執行全部原有及新增安全測試，要求**至少 891 項全部通過、0 失敗、0 略過**，再執行原 `gas/Website.js` 語法檢查與 Git 空白字元檢查；不可用 `--skip`、`continue-on-error` 或局部測試替代。PR 的 GitHub Actions 使用**完全相同的命令**，仍對每次 PR 提交留下真實 PASS/FAIL 紀錄。這不會停止 GitHub 的失敗 Email；減少未完成中間提交才可減少不必要失敗通知。

選用本機 Git 提交前自動檢查（**不會自動修改使用者機器設定**）：

```bash
git config --local core.hooksPath .githooks
```

啟用後的 `.githooks/pre-commit` 在每次 commit 前拒絕仍有未暫存修改的工作樹，並執行完整預檢；先將相依程式、測試及文件一併 stage。對直接使用 GitHub API 的工作者，本機 hook 不會生效，因此應先在完整來源工作樹通過上述預檢，再採**同一筆原子 commit**，不要對同一功能逐檔 commit。

此流程不合併 main、不修改 GAS 部署、不更動 `OPEN=false` 或 `CONSENT_READY=false`，也不改實驗二或非 MVP 功能。

## 研究邊界

- 828 Google Drive 工作區：`1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU`
- 個資與同意 Google Sheet：`1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI`
- 時段與營運 Google Sheet：`1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ`
- 研究聯絡信箱：`lily4318@cycu.edu.tw`
- 必須保留關閉狀態 `OPEN=false`、`CONSENT_READY=false`。
- 不修改 Study 1 正式 HTML MASTER、REC、FAST、QC 等正式研究資料。

## 官方參考文件

- https://developers.google.com/apps-script/guides/clasp
- https://developers.google.com/apps-script/api/how-tos/manage-projects
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
