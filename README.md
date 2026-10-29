# Study 1 招募、預約與電子同意網站（828 研究室）

私人 GitHub 原始碼儲存庫；正式 GAS 專案仍為 **1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z**，擁有帳號為 **solac.tw@gmail.com**。

## 最新完成狀態（2026-10-29）

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

初始來源雜湊參照 `docs/remote-baseline-20261029.json`。因為 GAS API 的更新會**取代整個專案的原始碼**，第一次同步必須在遠端仍與備份完全相同時才可以執行；若任何遠端檔案有變動，工作流程會自動停止，不擅自覆寫。

> **注意**：原始基準文件需永久保留以利追溯，若之後確實修改並同步 GAS，必須重新取得並審核新的遠端基準，再設計後續部署流程；不可略過檢查或自行更新基準讓失敗通過。

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
