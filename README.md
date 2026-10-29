# Study 1 招募、預約與電子同意網站

中原大學 828 研究室 Study 1 網站的**私人**程式碼與部署工作區。

## 目前狀態（2026-10-29）

- 連接 GitHub 的帳號：`solactw-star`
- Google Workspace／GAS 擁有帳號：`solac.tw@gmail.com`
- 既有 **唯一 GAS 專案 ID**：`1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`
- 正式研究聯絡信箱：`lily4318@cycu.edu.tw`
- 本儲存庫尚未匯入並核對 GAS 遠端原始碼。
- **目前僅允許讀取與備份，禁止自動 push、版本發布、正式部署或開放受試者收件。**

## 首次備份程序

1. 使用 828 研究室 Google 帳號完成 `clasp login`，將所得的 `~/.clasprc.json` 以 GitHub **Actions repository secret** 名稱 `CLASPRC_JSON` 安全存放。不可提交原始 JSON 或貼到聊天。
2. 前往 **Actions → Backup GAS (read-only) → Run workflow**，手動執行一次。
3. 確認執行成功，下載短期保存的 `study1-gas-remote-backup` artifact，核對是否含完整 `.gs`、`.html` 和 `appsscript.json`。該 artifact 僅供授權的儲存庫人員檢查，**禁止轉為公開**。
4. 未經完整核對和安全審查，不將 artifact 的內容推送回 GAS；正式程式版本管理需在原始碼備份檢查通過後才能啟動。

## 研究資料邊界

- 828 研究室網站工作區：`1hILv03gCFN9VZkNqcFx3fnlwBsKHKdYU`
- 個資及電子同意 Google Sheets：`1gpgWN-mbSF7AuEEeepD4qt4cycpLwT4S60SgixB4SDI`
- 預約及營運 Google Sheets：`1o8BtIgwnBpPjUi89dgWKwh5NK9tq0RDrfYAValGYbnQ`
- 系統安全設定必須維持 `OPEN=false`、`CONSENT_READY=false`，除非全部正式文件與端到端驗證完成且使用者明確核准上線。
- 不得改寫正式 Study 1 HTML MASTER、REC、FAST 或唯一整合 QC 來源資料。

## 官方文件

- [Google Apps Script clasp 指南](https://developers.google.com/apps-script/guides/clasp)
- [Apps Script API 專案內容管理](https://developers.google.com/apps-script/api/how-tos/manage-projects)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/concepts/security/secrets)

> **安全原則**：Google 的 `projects.updateContent` 會取代遠端專案所有原始檔；本儲存庫尚無遠端基準，不得執行任何修改遠端 GAS 的工作流程。
