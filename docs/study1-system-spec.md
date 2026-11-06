# Study 1 研究招募與管理系統｜完整介面建置規格 V0.2

> **權責：** 介面功能與 UAT 唯一 GitHub 主規格，固定路徑 `docs/study1-system-spec.md`。Google Drive 文件 `1y9mflKzjzTRnt6CMsGZRSIGETuio77SCSdtHdXL-7WI` 是對應 V0.2 閱讀／行政副本，不是第二份正式主規格。
> **決策基準：** 已確認第 1–67 題之 2026-11-05 V0.2 累積決策摘要；原逐題作答未隨本次 V0.2 原稿逐題附上，因此不得推定未明載的各題答案字母。本檔後述功能／狀態為已確認需求，不代表現有程式已實作。
> **目前最高優先級建置原則（2026-11-05 更新）：** 唯一既有 Study1 網站就是正式系統建置對象；除非使用者另外明確指定，禁止以「測試版／示範版」替代正式級功能，也不建立平行測試網站。可使用虛構資料進行系統驗收，但正式真人資料與招募啟用仍須獨立 REC／權限／個資核准。`OPEN=false`、`CONSENT_READY=false`、`MYSELF`，E2 在 2027 年前不得招募且不得自動開啟；修改程式、GAS 同步及部署須各按當次授權和驗證。

計畫：NSTC 115-2410-H-033-015
日期：2026-11-05
依據：整合功能規格 V0.1、第1～67題最新決策、2026-11-05 GAS／GitHub唯讀功能差距盤點。
文件用途：研究網站介面建置、需求追蹤、使用者功能驗收。
狀態：唯一 GitHub 正式網站系統建置規格（V0.2 持續增修）；B02／B02-A／B02-B 已於 2026-11-05 GAS 第53版完成使用者指定七步人工驗收，其餘模組依實際紀錄分開認定。正式研究啟用與 REC 核准尚未完成；本檔非 REC 文件。
重要：本版保留第13題B、第17題C、第45題A、第46題最終A、第47題A、第48題A及第50～67題整批採用建議值。

## 一、規格分級與共同原則
P0：正式招募、個資、REC及研究原始資料等安全啟用門檻；正式上線前必須核實。
P1：PI／RA 日常核心介面；直接按正式系統規模與實務流程建置，允許用虛構資料驗證，但不得僅做 Demo 或限制為測試用資料模型。
P2：行政效率、統計、文件及設定等管理整合。
「需求已確認」不等於「已實作」；「原始碼具備」不等於「UI驗收通過」；「研究文件已上傳」不等於「REC核准電子簽署」。
PI與RA為平權的研究團隊後台角色；一般授權操作不需互相簽核，高風險操作須預覽影響及再次確認。
操作稽核記錄操作者、時間、原值、新值、原因及結果；原始研究資料和不可竄改系統紀錄不得直接覆寫。
實驗一與實驗二共用系統核心，各自管理研究流程、招募、預約、同意、通知、目標、統計及活動。
後台全域研究範圍可選E1、E2或兩者；各頁臨時切換不修改全域預設；參與者網站顯示範圍另行獨立設定。
顯示實驗不等於開放招募。研究程序固定依核准文件，PI／RA自訂行政工作不得改變正式實驗設計。
保持 OPEN=false、CONSENT_READY=false、MYSELF，實驗二2027年前不招募，到2027年也不會自動開放。
目前所有正式研究、個資、電子簽署與寄送接口均不得因本規格而啟用。

## 二、P0 正式啟用前必要功能
- **P0-01** 招募與實驗安全控制：各實驗獨立顯示／招募控制、研究資格及有效同意門檻、不可繞過的安全檢查。目前正式收件關閉。
- **P0-02** 電子知情同意：核准原版PDF、版本與SHA、閱讀確認、手寫電子簽名（滑鼠／觸控／觸控筆）、清除重簽、簽署證據、簽署副本安全寄送、撤回與重簽程序。目前僅模擬PDF及簽署。
- **P0-03** 安全報名與驗證：電子郵件限時驗證連結、跨裝置安全接續、逾期失效、重新申請限時預約管理連結、防濫用與不洩漏帳號是否存在；正式流程目前受控關閉。
- **P0-04** 正式參與者資料保護：只用核准欄位、PI／RA授權存取、經核准更正、原始資料保護、必要版本歷程；正式資料服務尚未接入。
- **P0-05** 正式通知與文件傳遞：核准郵件來源、範本版本、寄送狀態、有限重試、人工補寄、失敗追蹤、防重複及簽署副本保護；實際寄送目前受控關閉。
- **P0-06** 稽核與治理：完整操作歷程、重要異動確認、存取驗證、資料保存、封存、撤回、復原、正式授權匯出；目前僅部分測試稽核。
P0仍為正式啟用條件；可先在唯一既有正式系統實作正式級介面並用虛構資料驗收，但未經核准不得收集、讀寫真人研究資料或開放對外功能。

## 三、P1 核心介面工作清單
- **P1-01** B02 整合式研究行事曆：日／週／月、實驗、活動、預約狀態、場次及容量、右側面板。前次盤點：未形成完整行事曆。
- **P1-02** B02-A 場次詳細面板：場次設定、參與者與候補、修改異動影響、重複場次。前次盤點：僅部分測試時段／容量。
- **P1-03** B02-B 參與者右側快速面板：出席、施測、同意摘要、完整資料入口。前次盤點：未建置。
- **P1-04** B04 參與者完整資料頁：研究進度摘要、分類分頁、時間軸、完整異動。前次盤點：未建置。
- **P1-05** B05 研究執行：出席、施測進度、各作業完成、部分完成及異常。前次盤點：僅示範報名狀態。
- **P1-06** B05-A 場次結案：自動檢查＋PI／RA人工確認、未完成事項交接、歷史。前次盤點：未建置。
- **P1-07** B03 參與者表格及流程看板：共用資料、搜尋、篩選、排序及完整資料入口。前次盤點：僅部分測試表格。
- **P1-08** V05～V08 完整預約介面：月曆、時段清單、摘要確認、審核、改期、取消、候補、重複場次。前次盤點：部分示範。

## 四、P2 管理整合工作清單
- **P2-01** B06 共用行政待辦：首頁摘要、清單、人工新增、勾選、重新開啟及封存；不得自動產生行政待辦。
- **P2-02** B07 補貼：研究階段、經核准金額、發放狀態、必要憑證及更正。
- **P2-03** B08 通知中心：範本、版本、事件、發送時間、寄送歷程、失敗、有限自動重試與人工補寄。
- **P2-04** B10 文件：正式核准文件版本、適用狀態、來源、提供及簽署歷程。
- **P2-05** B01/B09 首頁統計、研究進度、目標、趨勢、XLSX／CSV。
- **P2-06** B11 系統與網站設定：研究範圍、頁面顯示、各實驗預約、通知、行政、網站預覽與經核准發布。
- **P2-07** B12 稽核檢視與實驗二長期活動：時間軸／行事曆、課程／出席與稽核搜尋、前後值、匯出。
前次盤點為示範或缺少完整功能；後續不能僅憑GitHub測試聲明UI驗收通過。

## 五、後台與參與者頁面地圖
- **B01** 研究總覽：研究進度與當日工作同等重要；可調整卡片順序、顯示、隱藏。
- **B02** 研究行事曆：主要入口，日／週／月、篩選及場次。
- **B03** 參與者管理：表格清單／流程看板；共同資料和條件。
- **B04** 參與者完整資料：研究摘要、分類分頁、完整時間軸。
- **B05** 研究執行與場次結案：出席、施測、行政結案及歷程。
- **B06** 行政待辦：PI／RA共用、全部人工建立。
- **B07** 研究補貼：發放紀錄及憑證。
- **B08** 通知中心：範本、寄送、異常及補寄。
- **B09** 研究統計與報表：人數、階段、目標、趨勢、匯出。
- **B10** 研究文件：核准原文、版本、提供及簽署歷程。
- **B11** 系統與網站設定：後台／參與者端獨立實驗顯示、各實驗規則。
- **B12** 操作稽核：完整歷程、前後差異與適用匯出。
- **V01** 研究資訊；V02 報名及資格；V03 限時郵件驗證；V04 電子同意；V05 月曆及時段；V06 預約摘要；V07 成立或待審核結果；V08 郵件安全連結管理改期與取消。參與者不建立獨立個人管理首頁。

## 六、B02 整合式研究行事曆詳細規格（P1-01）
版面：頂部日期、今天、日／週／月、實驗範圍、搜尋、篩選、新增場次；主區行事曆；狀態圖例；右側場次或參與者面板。
每場顯示：實驗、活動、研究階段、日期、開始與結束、容量、已成立數、剩餘名額、待審核及候補數、場次狀態與適用異常。狀態不能僅以顏色區分。
操作：點空白新增；點場次開場次詳情；點參與者開其快速面板；拖曳移動場次；拖動邊界改時長；日週月切換；查詢已取消及歷史。
點選場次保留目前日期／篩選；切換實驗只改目前頁面，不改全域預設或參與者網站。
畫面狀態：載入中、無結果、正常、更新中、更新失敗、時段衝突、需確認已有預約影響、已取消、已結案。
- **CAL-01** 日週月檢視可切換。
- **CAL-02** 研究及預約狀態篩選正確，且不影響參與者網站設定。
- **CAL-03** 點參與者可開對應右側面板。
- **CAL-04** 拖曳已有人預約場次時，先顯示受影響名單、名額及衝突；確認前不儲存。
- **CAL-05** 手機窄視窗可用等效點選／精確編輯完成操作。

## 七、B02-A 場次詳細面板及異動處理（P1-02）
欄位：場次ID、實驗、正式活動、研究階段、日期、時間、預計時長、容量、已成立、待審核、候補、剩餘名額、預約與出席名單、場次狀態、行政備註、變更歷程。
操作：編輯日期、時間、適用容量與開放狀態；查看名單；處理待審核；查看候補；開參與者快速面板；改期／取消／結案。
已有預約時先預覽原值／新值、受影響名單、候補、衝突；逐名選擇確認後直接改期、請參與者確認新時間、另行安排。未回覆者保持待處理，不視為同意。
取消整個場次：停止新預約、保留原場次及歷史；逐人取消／提供其他時段／人工協助；候補也須處理，未完成者可追蹤。
重複場次可選僅這一次、選取日期及之後全部、整個重複系列未來全部；改動過去歷史禁止覆寫。
場次有預約時不能直接刪除原紀錄。所有重大異動須確認並保留操作者、時間、原值、新值、原因、結果。
驗收：修改／取消不讓既有預約無故消失；候補及衝突處理可追查；重複批次修改預覽所有受影響日期。

## 八、B02-B 參與者右側快速面板（P1-03）
入口：行事曆點選參與者，不取代行事曆主畫面。
頂部：參與者代碼、實驗、目前研究階段；以代碼為主要識別，僅必要時按權限顯示聯絡資料。
預約摘要：本次日期、時段、活動、狀態。
出席狀態：待確認、已出席、遲到、缺席等適用值。
施測摘要：未開始、進行中、部分完成、已完成等適用值。
同意摘要：是否有適用有效同意紀錄及版本，避免顯示不必要敏感資料。
常用操作：確認出席、修改本次整體施測狀態、必要行政備註與原因、查看本次預約、開啟完整資料、返回行事曆原位置。
快速面板不得直接修改原始研究數據。
- **PANEL-01** 點擊後顯示正確參與者。
- **PANEL-02** 出席更新同步在行事曆／完整資料頁顯示。
- **PANEL-03** 人工更正保留原因與前後值稽核。
- **PANEL-04** 開啟完整資料直接進入該參與者資料頁。

## 九、B04 參與者完整資料頁（P1-04）
頂部固定摘要：參與者代碼、實驗、報名資格、電子同意狀態、目前研究階段、研究進度摘要、下一次預約。
分頁1 基本與聯絡：僅經核准欄位與更正歷程。
分頁2 報名資格：報名時間、初審、人工覆核、補件及其歷程。
分頁3 預約出席：預約、候補、出席、改期與取消歷史。
分頁4 研究執行：正式研究階段、作業完成、行政備註及特殊情況。
分頁5 電子同意：核准文件版本、簽署及副本提供紀錄。
分頁6 通知文件：通知、送達狀態、補寄及文件。
分頁7 行政紀錄：經核准補貼、行政更正及歷史。
分頁8 操作歷程：操作者、時間、原值、新值及原因。
時間軸依實驗正式階段顯示報名、資格、同意、活動、出席、作業、結束／退出及重要行政異動。
PI／RA可以調整授權欄位的顯示、順序與分頁，核心研究進度固定保留；自訂呈現不等於新增個資蒐集。
第48題A：共用行政待辦集中在首頁／待辦管理頁，不於參與者詳細頁重複顯示待辦清單。
- **PROFILE-01** 行事曆與名單都能開相同資料頁。
- **PROFILE-02** E1/E2階段獨立。
- **PROFILE-03** 更正行政資料保留原值、時間與原因。
- **PROFILE-04** 舊預約、已簽署文件及研究進度不因改期、更正而消失。
- **PROFILE-05** 可從頂部摘要定位相關分頁與時間軸事件。

## 十、B05 研究現場執行、出席及施測進度（P1-05）
欄位：場次、實驗、研究階段、參與者代碼、預約、出席、整體施測、核准研究作業清單、各作業狀態、適用時間、必要行政備註、特殊情況與未完成原因。
PI／RA從行事曆進場次，選參與者確認出席、更新整體施測、必要時到完整資料頁逐項更新正式作業，再進場次結案。
出席和施測完成必須分離；不得把遲到或缺席直接視為施測完成／未完成的特定結論。
自動更新僅限已驗證的報名、預約等事實事件；出席及需研究人員判斷的階段以PI／RA確認為主。
可自訂行政作業範本；正式研究程序清單依核准版本固定，不得在後台任意修改實驗設計。
不得自動推定缺席可重新施測，不得覆寫已完成的原始研究數據。
- **EXEC-01** 出席／施測可分別更新。
- **EXEC-02** 部分完成不誤認全部完成。
- **EXEC-03** 重新預約符合核准階段資格。
- **EXEC-04** 所有更正留完整可稽核歷程。

## 十一、B05-A 場次行政結案（P1-06）
頁面包含場次資訊、出席及施測統計、逐人狀態、核准必要行政紀錄、未完成事項、交接紀錄、結案確認及歷程。
系統自動檢查已知行政資料，標示漏記及異常；PI／RA可完成必要紀錄，或明確記錄後續交接與需要處理之事項，再人工確認結案。
第46題最終A：系統不得因此自動建立行政待辦；PI／RA可依需要自行建立。
結案只代表當次行政處理，不等於參與者已完成整個研究。
結案後仍可查閱，重新開啟或更正保留原結案歷程。
- **CLOSE-01** 未確認狀態有提示。
- **CLOSE-02** 允許記錄待處理交接，不強制當場完成所有聯絡。
- **CLOSE-03** 必須由PI／RA確認，非時間到自動結案。
- **CLOSE-04** 不自動標示整體研究完成。
- **CLOSE-05** 更正可回溯原結案。

## 十二、B03 參與者表格清單與流程看板（P1-07）
表格欄位：參與者代碼、實驗、報名及資格、目前研究階段、下一預約、進度摘要、最後行政更新；支援搜尋、篩選、排序、開完整資料。
看板依實驗及正式研究階段顯示，不能強迫E1/E2使用同一組階段。
表格及看板共用相同資料與搜尋篩選，不另建平行名單。
若允許看板變更行政狀態，須受到核准研究程序限制，不能僅拖曳就認定施測完成。
- **LIST-01** 兩檢視共用資料。
- **LIST-02** 切換不重建或複製參與者紀錄。
- **LIST-03** 搜尋篩選結果一致。
- **LIST-04** E1/E2研究階段不混用。

## 十三、V05～V08 參與者預約與候補（P1-08／P0門檻）
月曆顯示可預約日期；點選日期顯示活動、時段、開始／結束、預計時長、剩餘名額及必要說明；支援手機觸控。
預約完整確認頁顯示實驗、活動、日期、時間、參與方式、已驗證電子郵件及必要注意，可返回修改授權資料／時段。
提交前重查資格、有效電子同意、名額、預約開放及截止時間、重複與時間衝突。
結果明確區分已成立、待人工審核、時段已滿／失效、資格不符、結果未知或失敗；不得虛報成功。
候補可按實驗／階段／活動設定不開放、自動通知或PI／RA人工處理；順位、資格、回覆期限及遞補方式；候補確認後仍依第25題模式預約，不得超額。
改期／取消規則依實驗設定；期限內參與者可經安全驗證自行處理；逾期或特殊情況提出申請由PI／RA處理。
預約管理入口主要經電子郵件安全連結，不建立個人管理首頁；遺失郵件可輸入原報名信箱申請新限時連結，回覆不得暴露帳號存在與否。
- **BOOK-01** 手機／電腦可用月曆及時段。
- **BOOK-02** 不合資格或缺適用有效同意者不得正式預約。
- **BOOK-03** 不因併發提交超額。
- **BOOK-04** 待審核與已成立不混淆。
- **BOOK-05** 改期、取消、候補保留原始歷程。

## 十四、B01 研究總覽與 B09 統計報表（P2-05）
首頁研究進度與當日工作同等重要。資訊卡：實驗範圍、報名與資格、各階段進度、今日場次、人工未完成待辦、通知異常、經核准目標；卡片順序／顯示可自訂。
統計頁：E1／E2／兩者、研究階段、期間、報名、資格、預約、候補、出席、各階段完成、時間趨勢。
正式研究目標與內部作業目標分別呈現；每一指標清楚顯示分母、單位、時間與排除規則，不把預約人次當唯一參與者人數。
報表支援XLSX與CSV，匯出需顯示資料範圍、欄位、授權與稽核，不能含未授權敏感資料。
驗收：首頁與詳細頁人數一致，切換後台範圍不改參與者網站；統計可核對並正確排除重複計數。

## 十五、B06 共用行政待辦（P2-01）
第45題A、第46題最終A、第47題A、第48題A、第49題整批同意為準：
PI／RA平權共用，全部人工建立，系統不自動新增行政待辦。
只有未完成／已完成兩種狀態，可勾選完成與重新開啟。
不強制負責人或截止日期。
可連結實驗、參與者、預約、場次；集中首頁未完成摘要與待辦管理頁，不在行事曆／參與者詳細頁另外顯示待辦清單。
支援搜尋、篩選、新增、編輯、封存、歷史及完整稽核；封存不清空紀錄。
- **TASK-01** 異常事件不自動建立待辦。
- **TASK-02** 任一PI／RA可完成。
- **TASK-03** 封存仍可查歷程。

## 十六、B07 研究補貼及 B08 通知管理（P2-02／03）
補貼：參與者代碼、實驗、適用研究階段、核准補貼項目、金額、待發放／已發放等適用狀態、日期、憑證、備註與更正歷程。正式額度、資格與憑證依核准文件；管理紀錄不等於網頁付款。
補貼驗收：不因重複操作誤記兩筆，金額與核准方案一致、更正有原值與原因。
通知：按E1/E2管理報名、資格、預約待審核／成立／改期／取消、候補、預約提醒、人工通知與電子同意副本。
範本包含實驗、事件、主旨、本文、版本與預覽，PI／RA可編輯經授權版本。
通知中心包含發送規則、時間／次數、寄送紀錄、錯誤原因、有限重試、人工補寄及稽核。
狀態區分待處理、已交付寄送服務、確認失敗、送達未知；寄送服務接受≠已送達或已閱讀。
通知驗收：不因範本更新覆寫舊寄送內容，失敗不能被顯示成功，重試不得無限重複。正式實際寄送受P0阻擋。

## 十七、B10 研究文件、B11 系統網站設定、B12 稽核（P0／P2）
B10：文件名稱、實驗、類型、版本、適用狀態、正式來源、核准資訊、歷程；支援查看、版本管理、授權提供副本、簽署及通知紀錄。新版不得覆寫舊簽署版本，未核准文件不得標已核准。
B11：後台全域範圍E1／E2／兩者；頁面繼承或臨時切換；參與者網站獨立實驗顯示；各實驗預約時段／容量／確認模式／候補／期限；通知範本與時間；行政工作；經核准網站文字編輯及預覽發布。
- **CONFIG-01** 後台研究範圍切換不開放招募。
- **CONFIG-02** 網站顯示不修改正式收件狀態。
- **CONFIG-03** 行政自訂不改正式研究程序。
- **CONFIG-04** 內容發布前可預覽及核准來源。
B12：操作者、時間、模組、操作類型、資料對象、原值、新值、原因、結果；搜尋、篩選、前後差異、依授權匯出。
資料原則封存而不破壞原始歷史；永久刪除及保存期限按正式程序。
驗收：重要異動可追溯，稽核紀錄不受一般行政編輯改寫。

## 十八、跨頁畫面切換
首頁→今日場次：行事曆對應日期／場次。
首頁→待辦：待辦管理頁或關聯來源。
行事曆→場次：場次側面板。
場次側面板→參與者：右側快速面板。
快速面板→完整資料：該參與者獨立詳細頁。
完整資料→預約歷史：預約分頁及時間軸。
行事曆／場次詳情→結案：場次結案檢查頁。
參與者名單→完整資料：相同參與者資料頁。
參與者月曆→預約確認→預約結果。
通知郵件→限時安全連結驗證→預約管理功能。
跨頁保留適用研究範圍、篩選及返回位置，禁止不同畫面各自儲存不一致的預約／出席／研究進度副本。

## 十九、主要業務狀態與一致性
報名：待審核、符合資格、不符合資格、待補件、撤回等適用狀態。
電子同意：尚未完成、待驗證、有效完成、依程序撤回或需重新同意。
預約：待審核、已成立、已取消、改期待確認。
候補：候補中、已通知、待回覆、已遞補、已結束。
出席：待確認、已出席、遲到、缺席。
施測：未開始、進行中、部分完成、已完成。
場次：開放、已結束待結案、已結案、已取消。
行政待辦：僅未完成、已完成。
通知：待處理、已交付寄送服務、確認失敗、送達狀態未知。
此為介面概念狀態群，正式資料代碼須核對研究核准程序後決定；資料衝突或伺服器結果無法核實時，禁止顯示假成功。

## 二十、使用者功能驗收清單 UAT-01～15
- **UAT-01** 行事曆檢視：切換日／週／月、實驗及預約狀態；顯示正確、保留篩選。
- **UAT-02** 新增場次：在行事曆空白建立；時間、活動、容量及結果正確。
- **UAT-03** 修改已預約場次：拖曳時先呈現受影響預約、候補與衝突，不直接靜默修改。
- **UAT-04** 快速面板：點場次參與者，開對應正確資料。
- **UAT-05** 完整資料：側面板進獨立詳細頁，研究階段、分頁及時間軸一致。
- **UAT-06** 現場出席：出席與施測分離，缺席／部分完成／更正歷程正確。
- **UAT-07** 場次結案：檢查缺漏、行政交接、PI／RA確認，結案不等研究完成。
- **UAT-08** 名單與看板：切換後資料與篩選一致，不複製紀錄。
- **UAT-09** 預約月曆：選時段、確認及結果，區分成立、待審核與失敗。
- **UAT-10** 改期及候補：不超額、不遺失原歷史，未回覆不算接受。
- **UAT-11** 行政待辦：人工建立、兩狀態、勾選、重開、封存；不自動建立。
- **UAT-12** 通知及文件：虛構通知失敗、版本與提供紀錄，無假成功。
- **UAT-13** 統計：查核報名、進度及人數分母正確。
- **UAT-14** 實驗設定：後台及參與者端範圍獨立；不影響正式招募。
- **UAT-15** 安全關閉：未授權正式操作被阻擋，不建立真人研究資料。
在唯一既有正式系統的授權介面進行實際人類 UI 操作；正式收件未核准前只使用虛構資料驗收，不另建測試系統。自動測試通過不能替代實際 UI 驗收。

## 二十一、批次建置順序及完成標準
批次1：B02行事曆、場次詳情、右側參與者面板、B04詳細資料、B03清單與看板。完成標準：以虛構資料從行事曆進該參與者完整資料再返回，資料一致。
批次2：B05出席與施測、正式作業展示、異常與結案、完整歷程。完成標準：虛構完整場次能確認出席、部分完成及行政結案，而不誤判研究完成。
批次3：V05～V08月曆、預約確認、審核、改期、取消、候補及重複場次。完成標準：虛構資料操作完整且不超額、不遺失歷史。
批次4：B06待辦、B07補貼、B08通知、B09統計、B10文件、B11設定、B12稽核。完成標準：PI／RA可管理授權行政資料與查詢紀錄。
批次5：正式研究功能接合：限時電子郵件驗證、正式PDF、有效手寫電子同意及副本、正式資料權限、通知、保存、撤回與端到端安全驗證。僅在REC與相關正式授權具備後進行。
每項狀態須區分：尚未建置／部分建置／已建置待UI驗收／UI驗收通過／正式啟用受阻／正式可啟用。
驗收記錄版本、頁面、使用的虛構資料、操作步驟、預期及實際結果、阻塞與修正。

## 二十二、正式來源與真正未決事項
待核對最新正式研究計畫、實驗一／二研究程序、REC核准同意書、報名資格／欄位、補貼金額、保存與刪除規定，以及GAS正式部署／權限實況。
P0待核：電子簽署是否核准、身分驗證及法律／REC程序、同意書原PDF／SHA與保存、副本寄送方式、不可使用電子簽署時替代程序。
P1待核：各實驗正式活動、場次時長、容量、可預約天數、截止時間、改期限制、候補回覆期限、重測／退出及結案必要清單。
P2待核：主要KPI與分母、報表欄位、通知提醒時間／次數、正式補貼憑證、保留及封存期限。
系統安全：PI／RA帳號驗證、停權／恢復、存取稽核及保存政策。
以上資料未經正式來源核實前，不可自行補定數值或降低門檻。

## 二十三、同步聲明與文件權責
本文件是網站系統 V0.2 為基準的唯一正式建置與驗收規格，持續由 GitHub main 增量維護；不是 REC、研究計畫或正式同意書核准版本。
正式主規格位置為私人 GitHub `solactw-star/study1-recruitment-gas` 的 `docs/study1-system-spec.md`；Google Docs 原 ID `1y9mflKzjzTRnt6CMsGZRSIGETuio77SCSdtHdXL-7WI` 僅為閱讀／行政副本，應標示對應 commit；不得建立平行正式規格。
每次變更須以當次使用者授權與 GitHub 主規格為準；文件更新不授權順帶修改 GAS、REC、FAST、QC、MASTER、正式 Sheets、正式招募或電子同意開關。GitHub commit、GAS 同步、實際 UI 驗收及正式啟用須分開回讀驗證。
目前正式網站完整UI驗收與正式功能接合尚未完成；OPEN=false、CONSENT_READY=false、MYSELF、E2 2027年前不招募之限制維持。

## 二十四、Q1–Q67 最新決策來源追溯與規格驗收邊界

- 本主檔逐章保留 V0.2 的 P0/P1/P2 分級、B01–B12／V01–V08 頁面地圖、欄位、操作、狀態、跨頁一致性、UAT-01～15 與批次建置順序；屬第 1–67 題最新已確認方案的可實作整合結果。
- V0.2 明確列出的原題錨點：**Q13=B、Q17=C、Q45=A、Q46=最終A、Q47=A、Q48=A、Q49整批同意、Q50–Q67整批採用建議值**；其中 Q46 最終 A 為「全部行政待辦人工建立」，不得回退至自動生成待辦的舊方案。
- 其餘 Q1–Q44 的原始各題選項字母並未逐題呈現在此 V0.2 雲端稿。採用本文已明載之整合需求（如 E1/E2、PI/RA 平權、參與者無帳戶首頁、電子郵件限時安全連結、同意先於正式預約、場次與參與者詳情、人工出席／研究執行、報表及稽核），不得從未載明之答案字母推導額外權限或程序。
- **不得倒推正式核准。** 任何與 REC、真實資料存取、付款、電子簽署、寄送、保存期限、部署有關的未核實條件，維持 P0 阻塞；UI 驗收必須是真人操作實際介面，GitHub CI 通過不能代替 `UI_VERIFIED` 或 `FORMAL_READY`。
- GitHub 修訂完成後，此 GitHub 路徑是系統規格唯一正式主檔；Drive 閱讀副本應記錄對應 commit SHA 與版本。如兩端未同步，以 GitHub `main` 版本為網站規格依據，並明確標記副本版本差異。

## 二十五、整模組交付與三輪自主驗收（2026-11-05最新使用者決策）

**使用者驗收導向的交付方法；優先於過往零碎功能／工程後台先行驗收方式。** 不改變 P0、REC、資料保護與既有安全門檻。

1. **一次交付一個可使用模組：** 先完成單模組的主要畫面、資料讀寫／儲存、必要操作、成功及失敗狀態、跨頁一致、桌面／手機操作。不要每完成一個按鈕或後台測試就要求使用者驗收；盡量在本次授權及安全範圍內完整建置。第一個交付模組為 **B02 整合式研究行事曆**，包含依賴的 B02-A 場次面板、B02-B 參與者快速面板；其後 B04、B03 各自獨立驗收。既有可用程式與測試直接沿用，不重造系統。
2. **「完成」必須能直接操作：** 具使用者可到達的實際介面入口及可重現虛構資料，新增／編輯／查詢／更新／返回／重新載入有正確結果。只有設計圖、GitHub 原始碼、CI通過、後端RPC或模擬驗證不等於模組完成；不能把尚未實際檢查的畫面稱為可使用或 UI_VERIFIED。
3. **三輪自主驗收（以實際介面操作為準）：** 第1輪正常主流程（建立、開場次／參與者面板、更新及儲存、返回）；第2輪跨頁資料一致、重載後保留、手機窄畫面／鍵盤；第3輪容量／時段衝突、取消保留歷史、失敗／權限／安全關閉狀態。只修復可重現且會影響使用或資料正確性的問題；修復後重跑受影響流程；已通過且未受影響部分不重複「為找bug而找bug」。三輪均須有可稽核的測試版本、環境、操作與結果。CI只作輔助，不能替代瀏覽器實際操作。
4. **不可跳過限制：** 若因 GAS `MYSELF` 或缺少獲授權瀏覽器／測試部署而不能做真正UI操作，標 `UI_ACCEPTANCE_BLOCKED`，說明阻塞並保留已完成成果；不可虛稱三輪完成，也不可要求使用者替代內部工程除錯。正式 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`，E2 2027 前不得招募且不可因年份到達自動開放。GitHub程式編輯、GAS同步、GAS部署須分別取得適用授權；任何新分支／測試不得自行觸發未授權部署。
5. **僅三輪自驗通過後提出一個模組的使用者驗收：** 提供實際可開啟的測試網址（必須是已驗證的正確版本及授權對象）、虛構測試資料、5–8個簡短且逐步可操作的步驟，明確寫要點哪裡、畫面應顯示什麼、可在何處提出調整。避免程式碼、後台API、JSON與工程術語。不同模組不可混在同一份驗收表。
6. **每次使用者驗收提供可點選回報與自由文字欄：** 單選「全部可正常使用／可使用但需要調整／有功能無法使用／無法開啟或無權限／暫不驗收」，另附可不填的補充意見文字區，提交後明確記錄對應模組與版本；使用者指出問題時僅針對可重現問題修正，再重新提交該模組驗收，不能未經確認就擴大需求。
7. **完成狀態分離：** `IMPLEMENTED`=已建立與測試；`SELF_UI_3PASS`=三輪實際UI操作有證據；`USER_UAT_PASSED`=使用者回報通過；`GAS_SYNC_VERIFIED`、`FORMAL_READY` 另行認定。未取得的狀態不可由排程或CI自行推定。

**下一步接續：** 先檢查 `main`、此主規格、工作流程及既有程式；集中交付 B02 模組，避免以技術測試數或多個微小PR作為對使用者的完成證明。

## 二十六、直接建置正式系統與 B02 人工驗收結案（2026-11-05 最新明確決策）

### 26.1 正式系統唯一建置目標（高優先級，取代過去預設 Demo／隔離版本做法）

1. **一律直接建置現有正式 Study1 網站**：GitHub `solactw-star/study1-recruitment-gas` 與既有 GAS Script／部署為唯一正式系統；除非使用者**另行明確要求建立測試系統**，不得主動建立平行網站、平行正式後台或將正式功能僅建在獨立 Demo。
2. **正式級實作，而非形式展示**：所有已核定頁面、資料契約、欄位、查詢、儲存、出席／施測、改期、取消、權限、持久化、歷史、容量／併發及手機操作，應以日後可供真實研究營運的規模與穩定性為交付標準。程式可以使用虛構資料測試，但不能以「目前只是測試用」省略正式需要的功能或合理容量。每個模組要能實際操作並完成單模組驗收。
3. **儲存模型要可轉正式營運，不得以測試上限當正式規格**：現存 TEST fixture 的 8 個時段、8 筆申請、40 筆請求歷程、ScriptProperties 單筆容量與模擬角色／同意／預約流程，是歷史實作限制，**不是使用者核准的正式營運容量**。後續針對受影響模組以受核准的正式資料結構與存取控制逐步替換；不得自行假設每場容量、預約量、保存期限或 REC 程序的正式數值。已建且可用的 B02 介面優先增量升級，避免推倒重做。
4. **「正式系統建置」與「真人研究啟用」完全分開**：正式產品程式可在原系統增量建置和用虛構資料驗收；在適用 REC、個資、帳號權限、同意文件、實際資料連接與部署安全門檻全部確認前，`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、不得蒐集或寫入真人研究資料、不得對外招募或寄送真實通知；E2 在 2027 年前不得招募且日期到達也不會自動開放。上述限制不表示系統應永遠停留在 Demo。
5. **不擴大任務範圍**：維持已核准 P0／P1／P2 與 B01–B12／V01–V08，按優先序一次完整交付一個模組。必要的工程測試是內部品質管制，不另建使用者要測的「測試系統」。未授權的 GAS 同步／部署與正式資料寫入仍不得執行。
6. **使用者導向驗收**：先完成程式及可實際操作的介面自驗，只有可重現錯誤才修復；再提供單一模組 step-by-step 操作、可點選結果及自由文字意見。不得讓使用者反覆驗工程後台。未實際完成三輪自主瀏覽器操作時，不能回填 `SELF_UI_3PASS=true`；使用者親自驗收有證據則可獨立記 `USER_UAT_PASSED=true`。

### 26.2 B02 人工驗收結果與目前界線

- `MODULE=B02`（含 B02-A 場次面板、B02-B 參與者快速面板）；GitHub 合併 `main` commit `d420edb4cd15c3a759a71bb7e04815d017aaee97`，同一原 GAS Script／原 `/exec` 已同步第 **53 版**；同步回讀 SHA256 `ad06da6836d26121ff8753f10acdfeceaf225929919c615739df201f9dcfd5d9`。
- 使用者於第52版首次人工驗收：步驟1開啟、2切換、3新增、7手機／窄畫面正常；步驟4編輯、5參與者狀態儲存、6取消因 `ScriptProperties` 容量不足失敗。第53版修正後，使用者**明確確認剛剛的測試全部正常**，因此記 `USER_UAT_PASSED=true`（限已操作的七步 B02 介面功能，不推定其他 B04／B03 或正式研究活動已通過）。
- 第53版針對容量問題的內部 CI **468 通過、0 失敗**，已回讀原 GAS 同 ID 同部署版本／SHA；使用者認可實際操作。獨立三輪自主瀏覽器驗收仍無獲核實的全部操作證據，故 `SELF_UI_3PASS` **不得宣稱已通過**。更不能由 B02 UAT 推定 `FORMAL_READY`。
- **下階段正式系統技術負債**：B02 現有實作使用 owner-only `Study1Unified` TEST fixture 和既有限制；已排除本次單筆容量錯誤，但**不能視為正式研究資料量、權限、REC 流程及個資資料庫已就緒**。接續應以最新使用者決策評估並增量正式化儲存與模組，而非另開 Demo 網站。

## 二十七、B04 參與者完整資料頁實作接續點（2026-11-05）

**模組範圍與來源**：在現有正式 Study1 網站同一原 GAS Script、同一 `/exec?view=team` 之研究團隊頁面增量建置 B04，不建立第二套網站。B04 主畫面提供固定參與者摘要、八個分頁（基本與聯絡、報名資格、預約出席、研究執行、電子同意、通知文件、行政紀錄、操作歷程）、研究／操作時間軸，從 B02-B 快速面板或原管理清單進入並保留原場次返回途徑；手機窄畫面採自適應布局。

**既有正式系統的當次交付功能**：B04 與 B02 共用原有參與者、場次、預約、出席、施測及可核實之通知資料；不創造重複參與者資料副本。行政備註更正必填原因，在同一既有資料鎖及版本檢查下記錄原值、新值、時間與 OWNER 角色；B02 出席／施測新異動也會形成 B04 近期稽核紀錄。舊資料採非寫入式補足空 B04 欄位的讀取遷移，保留原有紀錄。資料欄位無來源者應顯示「未記錄／尚未核准」，不可推定為0、已寄送、已簽署、已完成或具有效 REC。

**建置及部署驗證**：PR #55 已合併至 GitHub main 程式 commit `7535d500090b362caa70ce3bbc81457896fb802b`，變更 `gas/Study1Team.html`、`gas/Study1Unified.js`、`scripts/study1-gas-backend-allowlist.cjs` 及兩份關聯測試；自動與跨模組回歸 **473 PASS／0 FAIL**。GitHub Actions GAS 同 ID 同原 `/exec` 部署由 **第53版升至第54版**，回讀 `SYNC_VERIFIED=true`，SHA256 `557e668a0d1b1eea6ac97258055105491b467efa7b93a01e4cf0f08771996e50`，部署權限 `MYSELF` 保留。回讀證據：`https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42004536763`；無其他GAS網站或新部署ID。

**狀態必須分離**：`IMPLEMENTED=true`（B04原系統UI及授權範圍內的行政更正）；`GAS_SYNC_VERIFIED=true`（原第54版）；`CI_PASS=473/473`；**`SELF_UI_3PASS=NOT_VERIFIED`**（缺少可操作 owner GAS 網頁之三輪實際瀏覽器操作證據）；**`USER_UAT_PASSED=NOT_YET`**（B04 尚未取得使用者回報）；**`FORMAL_READY=false`**（無 REC、正式個資與同意功能核准證據）。B02 的使用者七步通過不可轉移認定為 B04 通過。

**待核正式營運能力**：目前同一系統仍以既有 8 筆時段／8 筆虛構申請、40 筆交易歷史與有限 ScriptProperties 作未啟用真人研究前的驗證來源。這**不是正式研究容量核准、完整參與者稽核資料庫或 PI／RA 雙角色驗收**。使用者已決定正式系統優先，後續必須直接在此原系統增量完成正式級可擴充資料服務與權限；在 REC／資料存取授權之前不得直接接入或寫入真人個資、有效同意書、原始作業數據、實際補貼與真實通知。維持 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`，E2 2027年前不招募且不自動開放。

**下一步**：提供單一 B04 頁面之 step-by-step 使用者操作驗收，逐項回報可用、需調整、無法使用或未測試；收到真實問題才在同一原網站修復並回歸。B03 未另獲授權前不在此輪直接建置。

## 二十八、持續建置與延後使用者人工驗收（2026-11-05 最新明確決策）

**本節為最新工作流決策，優先於第25節「每模組完成即邀請使用者驗收」、第26節「驗收後才接下一批」及第27節「B04 未驗收不得進入 B03」等舊進度門檻；原章節保留作歷史來源與原始UAT規格，但相關等待條件已失效。**

1. **持續執行，不停在使用者驗收關卡**：使用者目前無法開網頁，明確要求助理持續完成整套 Study1 系統；**除非使用者主動說要驗收，不主動要求開網站、回報測試結果、批准每一個模組，或因 B04 等未取得人工UAT而停工**。完成可行的功能開發、內部驗證及安全同步後，標記 `USER_UAT_PENDING_BY_USER_REQUEST`，將缺少真人UI驗收的證據如實標 `SELF_UI_3PASS=NOT_VERIFIED`，直接從下一個符合授權與安全條件的模組續作。
2. **既有自動化負責跨對話持續推進**：沿用原網站每小時排程 `6ae2e4049ac48191b4e5ae8972bf5cc3`，不新增平行排程與網站；每輪自動查最新GitHub main、正式主規格、相關程式與PR、workflow、最近同步／部署／測試證據和競寫。根據真實進度擇一項最重要的可完成工作，直接執行而非只是重複提出方案；需要超過一輪時，以 GitHub 原路徑／適當分支與進度接續點延續。禁止宣稱排程會不間斷執行：排程以平台實際頻率、配額、權限與執行結果為準。
3. **工作範圍是整套已確認系統，而不只是B02／B04**：以主規格P0安全先行、P1必要營運、P2後續管理的既有排序，依序改善正式資料架構與容量、B03名單／看板、B04完整資料、B02行事曆及關聯場次、B05研究施測、B01/B06～B12、V01～V08與相關共用服務。確切順序每輪依依賴、可行性、安全與最新main調整；一次集中完成一個可用模組的大批次，不為新版本重做已通過且未受影響的B02。
4. **正式系統唯一來源及部署**：僅使用 `solactw-star/study1-recruitment-gas` 的現有正式程式與原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`；**不得另建Demo、平行網站或自訂部署**。程式可在 Git 分支保護開發／測試，但此舉不代表新建測試系統。提交前核對GitHub Actions觸發路徑、競寫、備份；原GAS同ID同步、部署與版本SHA、權限及功能回讀須依當次授權和實際證據認定，失敗不得標完成。
5. **內部品質驗收不中斷**：仍須執行適用的單元、整合、UI互動模擬、跨頁／重載、手機版、容量、錯誤與安全回歸；能合法操作獲授權owner瀏覽器才可宣稱真實三輪UI自驗，不能拿CI代替。發現可重現問題即最小修復並回驗；缺少owner實際瀏覽器時明確標 `UI_ACCEPTANCE_BLOCKED`，但不妨礙處理其他安全可行模組。
6. **嚴守正式研究啟用門檻**：直接建置正式級系統不等於招募／真人資料／正式電子同意核准。持續 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`，E2在2027年前不招募且年份到達也不自動開放；無 REC／個資／正式數據讀寫／通知核准時，只能用虛構驗證資料，不能蒐集或更動真人資料、發真信、正式簽署、付款或擅自變更REC、國科會計畫、RIF FAST/QC/MASTER。
7. **僅在使用者主動提出驗收時集中提供 UAT**：依當時實際部署與已完成模組，提供逐模組step-by-step操作、每步可點選「正常／需調整／無法使用／未測試」、自由文字意見欄；不以從未完成的人工驗收冒稱 `USER_UAT_PASSED`。B02使用者既有七步驗收通過維持不變；B04待驗收不再阻擋B03等模組續作。
8. **每輪正式接續紀錄**：列出 `TASK_DOMAIN`、最新main commit／blob／GAS版本SHA、已完成內容、CI與真UI狀態、修改清單、`NEXT_ACTION`、`BLOCKERS`、`WRITE_OWNER`、`SYNC_STATUS`；只增量修改需要更新的正式來源或網站專責進度，Context或閱讀副本不可取代GitHub主規格。

**最新接續點**：B02已由使用者驗收通過；B04原GAS第54版已成功同步、473項CI通過，但使用者暫時無法開啟網頁，其UAT尚未執行。下一輪不等待B04驗收，優先核對並接續B03及正式級共用資料／容量相關依賴，擇最可安全完成者直接建置。待使用者主動要求驗收時才整合可點選的人工驗收流程。

## 二十九、B03正式網站整合成果與下一輪接續（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`；`MODULE=B03`（參與者名單與流程看板，P1-07）；來源為私人GitHub `solactw-star/study1-recruitment-gas/main`，**沿用原 `gas/Study1Team.html`、`Study1Unified` 資料視圖、原 GAS Script及既有 `/exec`，沒有另建網站或獨立名單資料庫**。
- `COMPLETED`：在原研究團隊管理頁加入參與者搜尋（代碼／場次）、實驗、資格、行政階段、出席與預約篩選、代碼／預約時間／最近已留存異動排序、表格清單／E1與E2分區行政流程看板。兩視圖使用**同一份**原有應用資料與相同篩選；可從清單或看板進入 B04 完整資料，返回後保留看板視圖與篩選。手機窄畫面具自適應表格／水平捲動看板。
- `ROLE_SAFETY`：看板階段是可核實的行政／施測進度彙整，不把已預約等同研究完成、不以拖曳直接更動正式研究階段，也不自行新增真人資料、編造REC資格、同意或通知。未解除 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2不自動招募。
- `SOURCE_COMMIT=700334e51efab36fe27c2bd0460c07f961b807f8`；PR #56 已合併 `main`，改動 `gas/Study1Team.html` 及 `tests/study1-team-visitor-flow.test.cjs`。首次測試發現初始篩選預設值導致空白名單，已最小修正；最終 GitHub Actions `42024306284` **474測試全通過／0失敗**。原 GAS 自動同步執行 `42024537324` 成功，`GAS_DEPLOY_VERSION=55`，`GAS_SHA256=25b12df0df08831bd5f6834df9aad408242091d954fa8100350221b7eb09fdc0`，原部署ID與 `MYSELF` 保留，日誌 `SYNC_VERIFIED=true`。
- `LAST_VERIFIED_STEP`：GitHub main合併、CI與 GAS 同ID第55版部署回讀；`IMPLEMENTED=true`（原網站 B03 程式及模擬流程），`GAS_SYNC_VERIFIED=true`，`SELF_UI_3PASS=NOT_VERIFIED`（沒有獲授權 owner GAS 真實瀏覽器三輪操作證據），`USER_UAT_PASSED=NOT_YET`（依第28節暫緩、**不得據此中斷建置**），`FORMAL_READY=false`。
- `BLOCKERS`：原 `Study1Unified` 仍為有限虛構資料與 ScriptProperties 保存機制，既有8筆時段／8筆申請及歷史上限不能作為正式營運容量，PI／RA正式權限、真人資料、有效同意、完整歷史與REC仍須按權責核准；缺 owner 瀏覽器時不能宣稱實際UI驗收。這些阻塞與安全門檻維持，但不阻止其他獲授權的正式系統功能建置。
- `NEXT_ACTION`：既有每小時建置排程依最新 `main` 讀取規格第28、29節，優先改善共用持久化資料／可擴充容量與 B05場次施測執行、B06人工待辦或其餘符合既定P0/P1/P2依賴的模組；**每輪執行一個安全可完成的實質開發批次**，保留未受影響的B02、B04，不在使用者主動要求前提出人工UAT。
- `WRITE_OWNER`：網站專責原GitHub／原GAS同步工作流程；`SYNC_STATUS`：第55版同ID同步已驗證，真人UI／正式啟用未驗證。

## 三十、B05研究現場執行及B05-A行政結案（2026-11-05 接續點）

- `TASK_DOMAIN=Study1 recruitment website`、`MODULE=B05/B05-A`，正式工作來源仍是私人 `solactw-star/study1-recruitment-gas/main`、原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 及原 `/exec`。沒有建立第二套網站／部署。
- `COMPLETED`：在既有 `gas/Study1Team.html` 中加入 B05 場次現場執行頁，可由 B02 行事曆場次與 B04 研究執行分頁進出，保留來源返回；顯示場次摘要、參與者、出席及施測統計，透過原 `ADMIN_B02_ATTEND` 分別儲存逐人出席／施測及行政備註，與 B02/B04 共用資料，不建立重複名單。B05-A 顯示未記錄出席／未完成施測之待處理數、交接欄、人工結案與重新開啟。未解事項須填交接才能結案，未開始場次不得提前結案，取消／已結案場次不得重複結案；重開須有原因，保留操作時間、OWNER、原狀態、新狀態及交接歷程。結案不代表研究完成，也不自動建立行政待辦／通知。
- `SAFETY`：結案／取消場次的出席及施測更新由前後端雙重阻擋；若需更正，須先經授權重新開啟並留下歷程。正式實驗逐項作業、分數及原始資料在未核對最新有效 REC 程序前只顯示未授權接入，不擅自新增正式程序或填入假資料。未修改正式研究 Sheets、REC、RIF FAST/QC/MASTER。持續 `OPEN=false`、`CONSENT_READY=false`、原 `/exec` `MYSELF`、E2不自動招募。
- `SOURCE_COMMIT=b95d171705a6578d5b876b5012fc33efcf042614`，PR #57 已合併main；涉及 `gas/Study1Unified.js`、`gas/Study1Team.html`、安全白名單及相關測試。最終 GitHub CI **479 PASS／0 FAIL**；GAS同ID自動同步 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42031085979` 回讀 `SYNC_VERIFIED=true`、原 `/exec` **版本56**、SHA256 `f73b92363941c09e8271c2de4f03f7e0608dad2d745c8ba2a10e9a8801d138b7`、正式部署存取權限 `MYSELF` 保留。同步前 HEAD manifest 出現 `ANYONE_ANONYMOUS`，不可與有效版本化部署的 `MYSELF` 混淆。
- `LAST_VERIFIED_STEP`：main來源、479項回歸測試及GAS同ID第56版部署回讀。`IMPLEMENTED=true`（B05行政介面及具體安全操作）；`GAS_SYNC_VERIFIED=true`；`SELF_UI_3PASS=NOT_VERIFIED`（owner權限的真正三輪瀏覽器操作未執行）；`USER_UAT_PASSED=NOT_YET`（依使用者決策延後，不停工）；`FORMAL_READY=false`。
- `BLOCKERS`：現有 `Study1Unified` 仍使用有限的 ScriptProperties 合成資料，8筆場次、8筆申請、40筆請求及有限歷程為技術限制，**不是正式營運容量**。正式大量資料庫、PI／RA角色、完整稽核、核准施測清單、重新施測規則、本人同意與通知／補貼均須依 REC／資料權責進行授權核驗；不得因已完成行政 UI 認定可施測真人。
- `NEXT_ACTION`：每小時續建排程先讀最新main與第28–30節，優先增量改善正式級持久化／可擴充容量、角色與行政稽核；可並行評估既有 P1/P2 依賴較低的 B06人工待辦及 V05–V08 參與者預約管理。依最重要安全可行工作交付，不等 B03／B04／B05 人工驗收，也不自行啟動正式研究。
- `WRITE_OWNER`：網站正式Repository原程式路徑／原 GAS 安全同步工作流程；`SYNC_STATUS`：第56版同步已驗證，人工UI及REC正式啟用尚未驗證。

## 三十一、原網站資料一致性、可擴充儲存契約與稽核建置（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`，版本基礎為主規格第28–30節與原正式Repository `solactw-star/study1-recruitment-gas/main`。**唯一既有 GAS Script 與 `/exec` 保留；沒有建立平行網站、資料庫、正式 Sheet 或使用者須操作的測試系統。**
- `IMPLEMENTED`（原系統現行儲存安全）：在 `gas/Study1Unified.js` 的既有合成資料交易路徑下，維持同一 `STUDY1_UNIFIED_FIXTURE_V1` ScriptProperties key、原有全域 ScriptLock、修訂版本鎖、請求ID重複辨識、gzip及寫後回讀。新增**提交前的意外值漂移偵測**及**寫入／回讀失敗後在同一鎖內嘗試恢復原始位元組並確認回復**；回復不成功時拒絕回報成功並明確標示不可確定的資料狀態。成功路徑不搬遷、不重設原資料；B02–B05共用資料不另存副本。
- `IMPLEMENTED`（未連接正式資料的可擴充核心契約）：增量加入純資料服務的 `STUDY1_STORAGE_CONTRACT_V1`，具有樂觀版號CAS、請求冪等、以 SHA256 串接的稽核事件與目前資料摘要檢查、衝突拒絕、穩定游標及每頁最多100筆的查詢；使用**1,275筆虛構資料**驗證分頁演算法。此核心不讀寫正式資料、Sheets、Drive、Mail，也沒有啟動真正的服務供應端；SHA鏈屬篡改／一致性檢測，不等於加密簽章或REC核准稽核。
- **清楚保留容量與正式啟用未完成狀態**：現役 owner-only 合成資料仍受 ScriptProperties 單值容量及原有8場次／8申請／40請求上限拘束。可分頁的程式契約≠已建立正式持久化資料庫；1,275筆純記憶體測試≠可儲存1,275筆正式參與者。尚缺經核准的持久化provider、索引／交易併發、真正可跨期間保存的不可變更稽核、保留刪除政策、PI／RA權限、REC核准與真實owner網頁操作。正式資料服務未核准前保持fail-closed，不新增正式Sheet或真人資料，也不得自行設定正式容量。
- `SOURCE_COMMIT=e72fe651ad938c6db9978a636c20c7f4b25ad14c`；PR #58 已合併，變更僅 `gas/Study1Unified.js`、`scripts/study1-gas-backend-allowlist.cjs`、`tests/study1-storage-consistency.test.cjs`。GitHub完整回歸與安全檢查 **483 PASS／0 FAIL**；同原GAS自動同步 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42034448347` 回讀 `SYNC_VERIFIED=true`；原 `/exec` **第57版**；SHA256 `93ad7968e256f0d1ca1ea81301a20e065cdb78fcb50e53f98cd8885fab6c176d`；有效部署權限 `MYSELF` 保留（同步前 HEAD manifest 仍顯示 `ANYONE_ANONYMOUS`，不等於正式部署開放）。
- `LAST_VERIFIED_STEP=GitHub main code, CI 483/483, original GAS version 57 and SHA deployment readback`。`GAS_SYNC_VERIFIED=true`；`PRODUCTION_STORAGE_CONNECTED=false`；`CAPACITY_FORMAL_VERIFIED=false`；`SELF_UI_3PASS=NOT_VERIFIED`（無獲授權owner瀏覽器實際操作證據）；`USER_UAT_PASSED=NOT_YET`（依第28節延後、非後續建置阻塞）；`FORMAL_READY=false`。維持 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2 2027年前不招募且不自動開放。
- `NEXT_ACTION`：從最新main讀取正式系統權責與當次REC／核准文件後，先確定正式儲存系統的唯一資料權威、讀寫權限、資料版本與跨表交易需求；**沒有正式資料寫入授權時只能持續完成不接入真人資料的架構／安全模組及其他已授權P1/P2功能**。下輪建議B06人工行政待辦或補完資料保存層的無外部副作用測試；不使用ScriptProperties測試上限作正式規格、不進行未授權部署。
- `WRITE_OWNER=GitHub main code and existing GAS sync workflow`；`BLOCKERS=REC/data storage authorization, formal capacity, live UI/roles`；`SYNC_STATUS=version57 verified; formal persistent store blocked`。

## 三十二、B06人工行政待辦原網站整合與第58版部署接續（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`；正式主規格仍為 `docs/study1-system-spec.md`，B06以第十五節、第28–31節及「第46題最終A：全部待辦人工建立」為依據。**本次只在既有研究團隊頁面與原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 開發，沒有另設網站、部署或正式研究資料庫。**
- `COMPLETED`：B06具獨立「人工行政待辦」頁面與首頁未完成／已完成摘要，手動建立、編輯、僅 `OPEN/DONE` 兩種工作狀態、勾選完成、重新開啟、封存／還原封存、關鍵字搜尋、完成及封存狀態篩選、E1/E2範圍篩選；PI/RA負責人與截止日期均可留空；可連到已存在的虛構實驗、參與者、預約及場次。歷程保留每次操作、操作者、原因、時間及完整前後值，不以封存清除歷史。B02／B05執行或異常**不會自動建立待辦**。
- `STORAGE`：原GAS的owner-only虛構B06資料改用同一ScriptProperties服務內原ID的模組專屬 `STUDY1_B06_TASKS_V1` key、獨立B06修訂版與請求去重、ScriptLock、防競寫及回讀失敗時原值回復，**不消耗B02–B05既有40筆請求上限、不建立平行網站或正式Sheets**。B06稽核紀錄為SHA256串接與最新狀態校驗，僅屬有限儲存區的完整性檢查；交易與筆數仍受Apps Script key和腳本容量限制，非正式永久不可變更稽核庫。此模組不讀寫真人個資、不寄真信、沒有啟動正式PI/RA雙角色帳號。
- `SOURCE_COMMIT=97f4bfdd121a5a45f753b5e5a3c17d64238b269e`；PR #59已合併 `main`，增量變更 `gas/Study1Unified.js`、`gas/Study1Team.html`、`scripts/study1-gas-backend-allowlist.cjs` 與三個測試檔。最終主分支CI與GAS同步流程**489項全通過、0失敗**。原GAS自動同步run `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42039131465` 回讀 `SYNC_VERIFIED=true`；原部署ID、`/exec`、`MYSELF`保留，**部署第58版**，SHA256 `392cf0917894a1e3e3d2f15f86812c1d172f6e0c95a3d32f8232338840a4e4d2`。
- `LAST_VERIFIED_STEP`：GitHub main commit、完整CI和原GAS第58版同ID部署SHA／權限回讀。`IMPLEMENTED=true`（原網站B06行政操作及虛構資料）；`GAS_SYNC_VERIFIED=true`；`SELF_UI_3PASS=NOT_VERIFIED`（無授權owner瀏覽器真正三輪UI操作證據）；`USER_UAT_PASSED=NOT_YET`（使用者明確延後，不阻塞其他模組）；`FORMAL_READY=false`。維持 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`及E2不自動招募；同步前HEAD manifest所顯示 `ANYONE_ANONYMOUS` 並非有效版本化部署的權限。
- `BLOCKERS`：真實PI/RA雙角色核准與稽核權限、正式資料庫及容量、保存與刪除政策、真人研究REC同意，以及實際owner瀏覽器操作驗收均未完成；B06目前關聯預約以原虛構申請代碼表示，正式預約獨立ID待核准資料模型再統一。B06的本次完成不代表正式資料接入或既有容量瓶頸全面解決。
- `NEXT_ACTION`：既有每小時自動續建需先重讀最新main及第28–32節，選下一個不需正式資料授權且可安全實作之P0/P1/P2模組（例如B01首頁統計、B07行政補貼介面或B08通知管理的封閉操作；實際依最新規格依賴排序），或增量改善正式儲存／角色權限之無外部副作用程式。不得自動解除招募、修改正式研究資料或主動要求人工UAT。
- `WRITE_OWNER=GitHub main + existing original GAS auto-sync workflow`；`SYNC_STATUS=GAS v58 verified; formal research data and real UI blocked`。

## 三十三、資料保存稽核與 PI／RA 未授權角色防護（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`；本次由最新 `main=2bc9ae47270a46ccafa7e41800013193815d751e` 起查，直接加固唯一原正式Repository、原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 和既有 `/exec`，不建立平行系統。
- `COMPLETED`（僅合成資料與授權邊界）：`gas/Study1Unified.js` 的 provider-neutral 虛構資料儲存契約稽核新增請求指紋綁定、每筆 UPSERT 之前態雜湊連續性、角色標籤／事件形狀／時間戳檢驗，虛構分頁拒絕未標記的非合成資料。既有 B06 待辦新增事件稽核請求指紋，回讀檢核前後值連續性；保留舊 B06 事件格式的相容讀取，不清除已有歷程。
- `ROLE_SAFETY`：新增伺服器端 owner-only synthetic role guard，原 Apps Script active/effective owner 驗證與 `OPEN=false`、`CONSENT_READY=false` 检查仍必須通過。純測試資料中的 `actor=PI/RA` 僅為合成標籤，不是登入身分，不發給PI／RA帳號與正式讀寫權限；正式權限、個資、通知及儲存 provider 維持 `FORMAL_BLOCKED`。有效部署權限 `MYSELF`，E2不自動招募。
- `SOURCE_COMMIT=8b5784b9a674108c2654a98a3b810b620217473d`；PR #60 合併 main，修改四檔：`gas/Study1Unified.js`、`scripts/study1-gas-backend-allowlist.cjs`、`tests/study1-storage-consistency.test.cjs`、`tests/study1-b06-tasks.test.cjs`。測試共 **492 PASS／0 FAIL**；PR CI `42047146069`、main CI `42047325911`。
- `GAS_SYNC_VERIFIED=true`：原 GAS 同ID安全同步 run `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42047326011` 成功，寫入前完整備份 Drive ID `1p8VSV0e6p7k8FhSIxeZg30giuHjr-z8M`，原 remote HEAD SHA256 `392cf0917894a1e3e3d2f15f86812c1d172f6e0c95a3d32f8232338840a4e4d2`，原 `/exec` 更新至**版本59**，完整回讀 `SYNC_VERIFIED=true`，SHA256 `14fe7133b0f9960153bf6d606160f869291013ceb0babd039fe8f5154fd3e550`，原部署 ID 與 `MYSELF` 保留。前置 HEAD manifest 的 `ANYONE_ANONYMOUS` 並非有效版本化部署的權限。
- `LAST_VERIFIED_STEP=main commit, 492/492 CI, original GAS V59 SHA256 and MYSELF deployment readback`。`SELF_UI_3PASS=NOT_VERIFIED`（尚無 owner 真正瀏覽器操作）、`USER_UAT_PENDING_BY_USER_REQUEST=true`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`；不可拿合成稽核 SHA 鏈當作永久不可竄改外部稽核，亦不可拿純分頁契約當作實際正式容量。
- `BLOCKERS`：PI／RA核准身分與撤權機制、正式持久化provider／容量／保存刪除規則、不可變稽核保管、真人資料與正式 REC 授權、獨立UI操作驗收。未授權項目持續阻擋，不主動要求使用者立即驗收。
- `NEXT_ACTION`：先重讀最新 main 與本節接續，選取無真人資料副作用的正式保存／稽核安全測試或其他已授權功能增量建置；若要接正式資料／真PI-RA帳號須先取得權責與授權，不可自行解除安全限制。
- `WRITE_OWNER=GitHub main + existing original GAS auto-sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 三十四、合成儲存欄位安全與稽核時間序／原 GAS V60 同ID回讀（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`，依正式規格第31–33節的未完成安全工作，從 `main=4a848371006aea2958c6ae5fcc171e5d23aff29b` 開始，僅增量修改既有正式Repository `solactw-star/study1-recruitment-gas` 的合成資料儲存契約與測試。沒有建立其他網站／資料庫，沒有讀寫真人研究資料或正式Sheet。
- `COMPLETED`（資料保存防護）：`gas/Study1Unified.js` 的尚未接正式provider之 `STUDY1_STORAGE_CONTRACT_V1`，在虛構紀錄新增、既有資料核驗及分頁讀取時，僅接受 `id,source,status` 三欄，並限制 `status` 為大寫測試狀態代碼；僅帶 `source=SYNTHETIC_ONLY` 不能讓額外email／phone／contact等欄位通過。新增契約交易結果的寫出前整體稽核驗證；不更動既有 ScriptProperties 或 B02–B06 資料格式。
- `COMPLETED`（操作稽核）：核驗事件序列的ISO時間不可倒退；即使單獨重新計算變造事件SHA256，也不能讓倒退時間通過。原有請求指紋、前後列摘要、版本鏈及B06歷史相容性保留。此為**純合成資料的一致性檢查，不是外部永久不可竄改稽核庫或加密簽章**。
- `ROLE_SAFETY`：原GAS仍只允許已驗證owner進入虛構測試資料路徑；PI／RA在純資料契約的actor欄是測試標籤，**不是正式身分**。真實PI／RA授權、撤權、審計匯出、正式資料存取仍拒絕，`FORMAL_BLOCKED`。沒有新增任何PI／RA真人帳號。
- `SOURCE_PR=62`（已合併）; `SOURCE_COMMIT=677a5eae2fdcc20a9012fe7bc5ee85ab1f0c9406`；僅變更 `gas/Study1Unified.js`、`tests/study1-storage-consistency.test.cjs`。PR CI `42049271368` 與main CI `42049473603` 均成功；完整回歸測試 `494 PASS/0 FAIL`。
- `GAS_SYNC_VERIFIED=true`：同一原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、同一原版本化 `/exec` 部署。GitHub原有自動同步run `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42049473642` 成功，預寫入完整備份 Drive ID `19fyfquzCake1wAnzbeZ7VimEvVaZ3W4Z`；原遠端HEAD SHA256 `14fe7133b0f9960153bf6d606160f869291013ceb0babd039fe8f5154fd3e550`。更新後原 `/exec` 第**60版**，完整回讀 `SYNC_VERIFIED=true`，SHA256 `3abc50614a29537bc91285c980dbe8579f4e0ecdbfa7af5bf81ad507d9b6cbcc`，有效權限 `MYSELF` 保留；遠端未部署HEAD中的 `ANYONE_ANONYMOUS` 不可等同實際版本化部署授權。
- `LAST_VERIFIED_STEP=GitHub main code, 494/494 CI, GAS V60 same-ID SHA256 and MYSELF readback`。獨立狀態：`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`PRODUCTION_STORAGE_CONNECTED=false`、`CAPACITY_FORMAL_VERIFIED=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`USER_UAT_PASSED=NOT_YET`（使用者要求暫不要求人工驗收）、`FORMAL_READY=false`。
- `BLOCKERS`：經核准的真人研究資料保存提供者／版本與容量、PI／RA正式身分與撤權、存取及稽核權限、REC／有效文件、保存刪除與外部不可變稽核、owner真正瀏覽器操作。合成分頁測試仍非正式容量驗收；目前既有 owner-only 資料上限不能作正式容量承諾。維持 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、實驗二2027年前不招募且屆時不自動開放。
- `NEXT_ACTION`：先核對當次最新main與部署紀錄，繼續現有原網站可不接觸真人資料的權限邊界、失敗復原、合成資料稽核或P1/P2功能；正式持久化、PI／RA真人授權與對外招募需另行驗證REC及權責，不得自動解除阻擋。不要求使用者本輪人工驗收。
- `WRITE_OWNER=GitHub existing main + original GAS workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 三十五、原網站合成資料快照分頁／競寫安全恢復與原 GAS V61 回讀（2026-11-05）

- `TASK_DOMAIN=Study1 recruitment website`；`SOURCE_MAIN=93b334a6b7add41c8d0ca03b89a2175ce41c56fa`（承接第31–34節與原GAS V60後最新正式來源），在現有正式Repository及原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`／原 `/exec` 增量改善；未建立平行網站或持久化資料庫。
- `COMPLETED`：`gas/Study1Unified.js` 的**僅虛構資料** provider-neutral 分頁契約，在修訂版號之外新增完整排序列 SHA256 `snapshotHash` 綁定；續頁必須提供前頁快照雜湊且游標必須存在，不接受同版號內容漂移、非法游標及非 `SYNTHETIC_ONLY`／未核准資料欄位。每頁上限100；以5,000筆虛構資料完成50頁全量巡覽。這是純記憶體分頁契約，非正式持久化資料庫容量。
- `COMPLETED`：原 `STUDY1_UNIFIED_FIXTURE_V1` 與 `STUDY1_B06_TASKS_V1` 的單一ScriptProperties key、全域ScriptLock、CAS、請求ID冪等及資料／稽核歷史沿用不變。寫入或回讀失敗時，只有目前屬於本交易候選位元組才允許同鎖恢復原位元組；若觀察到其他寫入者的不符值，**不覆蓋**並回傳狀態不明／競寫阻擋。未與ScriptLock協作的外部寫入仍非真正交易隔離，不能宣稱已消除所有競寫。
- `TESTS`：涵蓋分頁5000筆／50頁、跨頁順序、非法游標、同版號快照漂移、未授權欄位、純資料契約的版本／重播拒絕、原合成資料寫入前後例外、B06寫後異常與外部競寫模擬、恢復後原值、鎖釋放、超出單一ScriptProperty安全容量即拒絕寫入，以及既有安全與功能回歸。PR #61、GitHub Actions `42050574882` 與合併後 CI `42050759703`：**500 PASS／0 FAIL**。
- `SOURCE_COMMIT=05c940d941dc32ffab3ea2e338659782eec071dd`，PR #61合併main，改動僅 `gas/Study1Unified.js`、`tests/study1-storage-consistency.test.cjs`、`tests/study1-b06-tasks.test.cjs`、`scripts/study1-gas-backend-allowlist.cjs`。已保留主分支先前V60合成欄位白名單、稽核時間先後順序驗證，未以較舊分支覆蓋。
- `GAS_SYNC_VERIFIED=true`：原 GAS 同ID同步 run `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42050759783` 完成原資料完整備份，Drive備份ID `12P2jq5DhhD3JY-kdYnf4sGJGgaFEwECc`；遠端原HEAD SHA256 `3abc50614a29537bc91285c980dbe8579f4e0ecdbfa7af5bf81ad507d9b6cbcc`，原部署從V60更新至**V61**，`SYNC_VERIFIED=true`，完整SHA256 `14597565825cb53b7e5ef5e3ebc9495d5c8cfa131f67fe61c5b3f64a148acd85`，原部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 及有效 `MYSELF` 權限保留；原GAS其他檔案依安全同步工作流保留。
- `SAFETY`：`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2不自動招募；正式PI／RA真帳號、REC電子同意、正式資料讀寫、OTP／寄信、付款／通知與正式資料匯出一律 `FORMAL_BLOCKED`。本輪無真人資料、正式Sheets、REC或研究規則寫入。
- `LAST_VERIFIED_STEP=main code merge, 500/500 CI, original GAS V61 /exec SHA256 + permission readback`；`SELF_UI_3PASS=NOT_VERIFIED`；`USER_UAT_PENDING_BY_USER_REQUEST=true`；`PRODUCTION_STORAGE_CONNECTED=false`；`CAPACITY_FORMAL_VERIFIED=false`；`FORMAL_READY=false`。
- `BLOCKERS`：正式資料provider、核准容量與交易一致性、真正不可改寫的長期稽核／保存刪除政策、PI／RA身份權限與撤權、REC及真實owner瀏覽器操作驗收。
- `NEXT_ACTION`：下一輪先核對最新main及原GAS版本，選擇無真人資料副作用的儲存／稽核安全測試或已授權模組續建；未獲權責授權，不接正式Sheet、不放行正式持久化或公開招募。
- `WRITE_OWNER=GitHub main + original GAS same-ID sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; UI_AND_FORMAL_DATA_BLOCKED`。

## 三十六、B06稽核事件回放與原GAS備份綁定／原 GAS V62 同ID核實（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website`；本輪核對 `main=0514045a6c2cf03295b8a5894ec8ddb4a248357c` 與主規格第31–35節，僅修改現有私人GitHub正式Repository與原GAS安全同步流程，未建立平行網站／資料庫／部署。相鄰B01 PR #63 仍為獨立未合併工作；本輪不改其HTML與測試檔。
- `COMPLETED`（合成資料狀態／稽核）：既有 `gas/Study1Unified.js` 的B06核驗增加完整歷程事件轉移安全檢查：`CREATE/EDIT/COMPLETE/REOPEN/ARCHIVE/RESTORE` 的前後狀態及合法操作、每筆歷史快照欄位、`SIM-TASK` 建立序號與 `next` 計數一致、事件時間順序、建立時間及更新時間。模擬主機時鐘倒退時，B06新增操作時間釘住上一事件時點，避免產生倒退的合法寫入。原有 ScriptLock、預寫入版號、冪等請求、同鎖恢復、原值原位元組與不覆蓋非協作競寫者安全行為維持，`STUDY1_B06_TASKS_V1` 與 `STUDY1_UNIFIED_FIXTURE_V1` 原key不變。
- `COMPLETED`（GAS程式備份一致性）：原既有 `scripts/study1-gas-auto-index.cjs` 在 `prepare` 和 `apply` 增設 `assertBackupBinding`：備份對應的完整GAS `original.files` 必須與準備時記錄的 `remoteSha256` 相符；已建立的私人Drive備份SHA256必須等於**本輪預寫入快照原文（不含後加backup指標）**之SHA256，且部署ID／前版本要相同。即使另一輪Drive備份本身SHA有效，也不得冒用為當輪備份繼續覆寫。這是**GAS原始碼及部署狀態備份驗證，不是正式研究資料、參與者個資、Sheet或災難復原備份驗證**。
- `TESTS`：新增合成資料測試，涵蓋B06計數器漂移、非法歷史欄位、偽造狀態轉移、事件倒退但重新計算鏈結SHA、主機時鐘倒退；以及GAS前置備份對錯誤HEAD內容、錯誤備份SHA、錯誤部署版本的拒絕。PR #64 CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42187372326`、合併後 main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42187530049` 均完成，`504 PASS/0 FAIL`。沒有用CI取代真實瀏覽器驗收。
- `SOURCE_COMMIT=1569697d7f487c2a67cb8794713670b6f5f8c025`；PR #64 已合併main；僅變更 `gas/Study1Unified.js`、`scripts/study1-gas-auto-index.cjs`、`tests/study1-b06-tasks.test.cjs`、`tests/study1-gas-auto-index.test.cjs`。沒有修改B01 PR #63、REC、實驗研究材料、真人資料或任何正式Sheet。
- `GAS_SYNC_VERIFIED=true`：既有同ID自動同步run `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42187529754` 完整成功，私人828 Drive預寫入程式快照備份ID `1HpPsyZOnYVH3dB_hp_em9rMgyGkLm8ZK`，原GAS遠端HEAD SHA256 `14597565825cb53b7e5ef5e3ebc9495d5c8cfa131f67fe61c5b3f64a148acd85`，更新後HEAD及原 `/exec` **V62** SHA256 `35029993f95a876240e0ff0b59eafc1e3d539710e81706867ed16a5ef4acc82d`；`SYNC_VERIFIED=true`，原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 與有效權限 `MYSELF` 保留。原未部署HEAD manifest之 `ANYONE_ANONYMOUS` 不等於正式版本化 `/exec` 開放。
- `LAST_VERIFIED_STEP=main code/CI 504 of 504 and original GAS V62 exact-ID SHA and MYSELF readback`；`MAIN_SYNC_VERIFIED=true`（程式），`GAS_SYNC_VERIFIED=true`（同ID遠端），`SELF_UI_3PASS=NOT_VERIFIED`，`USER_UAT_PENDING_BY_USER_REQUEST=true`，`PRODUCTION_STORAGE_CONNECTED=false`，`FORMAL_READY=false`。本輪沒有真人網站操作驗收或正式研究啟用授權，故不要求使用者驗收，也不宣稱介面完成。
- `BLOCKERS`：仍缺正式資料provider與容量、跨多key真正原子交易／一致性、經核准的參與者資料備份與恢復、不可改寫的長期稽核、REC與身分權限／撤權、保存刪除規範。當次程式碼稽核SHA鏈是**一致性偵測而非可信外部簽章**；不因此放行正式PI／RA權限、正式Sheet或寄信。
- `NEXT_ACTION`：按最新main核對其他PR與競寫，續做未授權資料無外部副作用的安全驗證與原網站模組；如要正式資料備份／真PI／RA權限，先取得REC及資料治理核准。維持 `OPEN=false`、`CONSENT_READY=false`、有效部署 `MYSELF`、E2於2027年前不招募且不自動開放。
- `WRITE_OWNER=original GitHub main + same-ID GAS safe auto-sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 三十七、B12操作稽核唯讀查詢、失敗診斷與原GAS V63回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B12 audit`，以2026-11-06當次驗證之最新正式主分支與第17、31–36節為依據。僅增量修改唯一原Repository `solactw-star/study1-recruitment-gas`、原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`及原`/exec`。本輪沒有建立平行網站、資料表、B12 ScriptProperties key、正式資料庫或資料搬遷；保存原B02–B06歷程與現有模式。
- `COMPLETED`（B12來源驗證）：`gas/Study1Unified.js` 新增**唯讀合成稽核查詢投影**，在回傳前完整核查B06現有SHA256鏈、請求指紋、現有待辦的前後態、操作類型及時間順序；沿用第36節較嚴的B06回放規則，不重建或改寫歷史。B04管理與B05結案的原有**有限近期歷程**依欄位／場次核對相鄰前後值與目前虛構資料；區別標示`BOUNDED_LEGACY_HISTORY`，**不聲稱這些紀錄具完整SHA鏈或長期永久性**。B06標`SHA256_CHAIN_VERIFIED`，也不等於有外部數位簽章。
- `COMPLETED`（查詢分頁及介面）：原`gas/Study1Team.html`新增B12專區，按模組B04／B05／B06／B08、結果及關鍵字查詢，顯示操作者、時間、操作、資料對象、原因、結果、原值／新值與來源驗證級別。後端`study1UnifiedB12AuditPage`由原Apps Script active/effective owner、`OPEN=false`、`CONSENT_READY=false`、ScriptLock及兩個既有資料key的讀前／讀後位元組一致性保護。每頁最多30筆；游標與SHA256全量快照、篩選及雙資料修訂版本綁定；錯誤游標／競寫／未核准查詢欄位直接拒絕。
- `COMPLETED`（異常與失敗）：既有虛構通知的`SIM_FAILED`僅作`CURRENT_SNAPSHOT_ONLY`顯示，明標**目前失敗狀態而非具時間的歷史事件**。B06與統一虛構交易被拒絕時，產生不含原操作payload／理由文字／聯絡資訊的分類`STUDY1_B12_DIAGNOSTIC_V1`執行記錄（例如版本衝突、容量拒絕、資料狀態不明）；不在B06或B12歷史內虛構「已提交事件」。這些執行記錄**未配置長期不可變外部稽核庫／保存保證**；本輪不因此假稱失敗已永久稽核入庫。
- `EXPORT_DENIED`：原正式adapter `exportAudit`持續`FORMAL_BLOCKED`；B12匯出只存在私有拒絕函式，不暴露新的client可呼叫匯出endpoint，不提供CSV／下載按鈕。PI／RA名稱仍僅為虛構測試標籤，並非登入授權；僅核准owner可查閱隔離虛構資料。
- `SOURCE_PR=65`（已合併）；`SOURCE_COMMIT=92a3a26e61db266dcf817eaeba262d0c8f1d8609`；增量修改`gas/Study1Unified.js`、`gas/Study1Team.html`、`scripts/study1-gas-backend-allowlist.cjs`、`tests/public-global-surface.test.cjs`並新增唯一專責測試`tests/study1-b12-audit.test.cjs`。隔離PR CI `42188643755`、合併main CI `42188905559`均通過**513 PASS／0 FAIL**；已保留V62原有B06回放與預寫入備份約束。測試含SHA變造、B04/B05連續性、雙revision快照分頁、失敗快照來源標示、拒絕操作遮蔽診斷、惡意查詢、未授權身分／開關、寫入次數維持0及新增GAS client端點白名單。
- `GAS_SYNC_VERIFIED=true`：沿用既有workflow `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42188905561`，完整原GAS預寫入備份Drive ID `1vnY0Te7RWnUeag6-a9kUUVfWYzn5ZhDm`；原遠端HEAD SHA256 `35029993f95a876240e0ff0b59eafc1e3d539710e81706867ed16a5ef4acc82d`，核對原部署`AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`由**V62→V63**，`DEPLOYMENT_AFTER_UPDATE=63`且`SYNC_VERIFIED=true`；完整GAS HEAD SHA256 `0767992c93cf1e08223c1dfdec0577e40ce5bd7857e3f0700f5f0e98e2b6602e`。原Script ID、版本化`/exec`和有效`MYSELF`權限均保留（未部署HEAD manifest中的`ANYONE_ANONYMOUS`不等同實際版本化部署存取權）。
- `SAFETY`：仍為`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2不自動招募；正式資料提供者、真正PI／RA登入與撤權、REC電子同意、真實郵件、正式匯出及真人研究資料均未開放。不讀寫正式研究Sheets、正式REC或實際參與者資訊。
- `LAST_VERIFIED_STEP=main code merge, 513/513 CI, same-ID original GAS V63 version+SHA256+MYSELF readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`PRODUCTION_STORAGE_CONNECTED=false`、`B12_FORMAL_IMMUTABLE_AUDIT=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`USER_UAT_PENDING_BY_USER_REQUEST=true`、`FORMAL_READY=false`。
- `BLOCKERS`：未有核准之跨期間不可變稽核保存服務、完整B02–B11正式行為歷史、真PI／RA授權與撤權、法定保存／刪除及REC核准、外部資料provider／正式容量、原owner實際瀏覽器操作驗證。B12目前只投影可驗證的隔離來源，不把短期／未保存診斷當成正式完整稽核。
- `NEXT_ACTION`：每輪先查最新main、原部署及並行排程，持續改善仍不接觸真人資料的B12跨模組操作來源一致性或其他已核准B01–B12功能；要接正式長期稽核、真實資料或匯出必須另有REC／資料權責核准。依使用者決策不要求本輪人工驗收。
- `WRITE_OWNER=GitHub main + original GAS safe-sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; FORMAL_AUDIT_AND_REAL_UI_BLOCKED`。

## 三十八、B12稽核時間排序方向與快照一致性／原 GAS V64 回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B12 audit`；延續第十七、三十一至三十七節，原系統B12核心已由其他並行寫入者PR #65併入main及V63同步，具來源完整性、B04/B05有限前後態、B06 SHA鏈、B08虛構失敗快照與匯出拒絕。本輪偵測並行寫入競合後**沒有合併過時的重複B12 PR #66**：該PR已關閉且未合併，防止蓋掉最新main。本輪僅從當次最新main `8240b15b59e618e9bf28c7c08c53958f90d57370` 增量補強原B12時間排序，不另建第二套B12或修改歷史儲存結構。
- `COMPLETED`：`gas/Study1Team.html` 的原B12篩選列新增「最新在前／最早在前」切換，變更排序時清除舊游標並要求重新查詢。後端 `study1B12AuditPage_` 僅允許 `ASC/DESC`，按照事件既有時間與固定ID次序排序；SHA256快照計算增綁排序方向，若把降冪續頁游標用於升冪查詢，則`快照已變更`拒絕，防止跨方向漏筆或重複。原有不帶sort的舊呼叫維持升冪相容，避免破壞既有頁面或測試。
- `SCOPE`：只修改 `gas/Study1Unified.js`、`gas/Study1Team.html` 與唯一既有 `tests/study1-b12-audit.test.cjs`；不更動源稽核內容、B02–B06的 ScriptProperties keys、PI／RA授權、正式匯出、資料保留政策或新建資料服務。原B06 SHA驗證與B04/B05短期有限歷程及B08 `CURRENT_SNAPSHOT_ONLY` 警示完全沿用。
- `TESTS`：PR #67 CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42189579549` 及合併main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42189682427` 均成功，**514 PASS／0 FAIL**；新增12筆B06合成事件ASC／DESC、兩頁續讀、原升冪相容、跨方向快照拒絕、非法方向拒絕及UI控制項連接測試。這是虛構資料與模擬介面測試，不是實際 owner 瀏覽器驗收。
- `SOURCE_PR=67`（已合併）；`SOURCE_COMMIT=7dbe18d9f288f2b0b412864822bbe8d4aee2f1df`；程式及測試在原GitHub main，沒有平行正式網站。
- `GAS_SYNC_VERIFIED=true`：既有原GAS同ID同步工作流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42189682199` 成功，原程式完整預寫入備份Drive ID `10fd02atXWeJpew4DPXZxm6CQ8FjTutZR`；遠端原HEAD SHA256 `0767992c93cf1e08223c1dfdec0577e40ce5bd7857e3f0700f5f0e98e2b6602e`，新HEAD SHA256 `39e7049a6885d42882a6b7bff00db2f666476eb7de93ec292970a5f5edf16734`。同原部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 原 `/exec` **V63 → V64**，回讀 `DEPLOYMENT_AFTER_UPDATE=64`、`SYNC_VERIFIED=true`；有效部署權限 `MYSELF` 與原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 保留。未部署GAS HEAD manifest 的 `ANYONE_ANONYMOUS` 不是本次有效部署的權限。備份僅為GAS程式快照，**不是正式研究資料的備份**。
- `LAST_VERIFIED_STEP=main code 514/514 CI and original GAS V64 SHA256 MYSELF readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B12_READONLY_IMPLEMENTED=true`、`B12_FORMAL_IMMUTABLE_AUDIT=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`USER_UAT_PENDING_BY_USER_REQUEST=true`、`FORMAL_READY=false`。
- `BLOCKERS`：完整正式資料來源／可擴充持久化、跨期間不可改寫稽核、經授權真人PI／RA識別及撤權、合規的匯出／保存刪除、有效REC核准及真實owner瀏覽器三輪操作均未完成。本輪不解除 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2 2027年前不得招募且不自動開放；正式Sheet、真人資料、郵件及同意均未接觸。
- `NEXT_ACTION`：依下輪最新main、工作流程及競寫重新核對原網站待辦；可繼續安全可行的B12跨模組來源一致性與完整性測試，或其他已授權B01–B12功能。未獲REC及資料權責之前，正式資料、稽核匯出及真人PI／RA權限持續fail-closed；不要求使用者本輪驗收。
- `WRITE_OWNER=GitHub main + same original GAS safe sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; FORMAL_AUDIT_AND_REAL_UI_BLOCKED`。

## 三十九、B12跨B02–B06來源對照與有限歷程完整性／原 GAS V65 同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B12 synthetic audit`。本輪先讀取當時正式 GitHub `main=178a1cca6825e8cab1c7d9968d7d87310d0b8ef6`、原 `docs/study1-system-spec.md` 第31–38節、原 GAS V64同步狀態與開發中 PR #63。僅增量改既有 `gas/Study1Unified.js`、`gas/Study1Team.html`、`tests/study1-b12-audit.test.cjs`；不建立平行網站、額外GAS、B12資料key、Google Sheet或研究資料提供者。
- `COMPLETED`（B02原始事件）：原B12目前僅投影B04/B05/B06與虛構B08失敗現況，本輪納入既有 `b02.history` 最近至多12筆操作的**唯讀投影**，辨識來源 `BOUNDED_EVENT_ONLY`，驗證其虛構動作類型、SIM代碼與ISO時間。B02原事件僅保留`at/action/ids`，未保存欄位前後值，B12僅顯示操作類別、時間與受影響代碼，`before=null`，**不得虛構完整差異或將已截斷部分說成未發生**。原B04最多30筆與B05最多32筆均為有限歷程，B06仍依第36節執行完整SHA256鏈與前後狀態驗證。
- `COMPLETED`（跨來源差異檢查）：原B02的 `ADMIN_CLOSE/ADMIN_REOPEN` 與B05 `CLOSE/REOPEN` 依**相同虛構場次及同一事件時間**核對動作；兩份仍保留之事件若對應操作類型明確互相矛盾，直接拒絕查詢。額外統計B02↔B05鏡像是否配對、B04 `attendanceAndProgress` ↔B02 `ATTEND` 是否可查到對照；B02出席操作如未更動原值，依既有程式本就**不會新增B04更動歷程**，故僅列為「目前無法證實鏡像」，不是已確認遺漏。沒有自動新增稽核事件、待辦或更改原資料。
- `COMPLETED`（覆蓋警示）：回傳 `coverage.scope=BOUNDED_SYNTHETIC_SNAPSHOT`、各模組保留筆數及上限、配對計數與理由清楚的提醒。B02/B04/B05達保留上限時提示較早紀錄可能被截斷；找不到鏡像時為 `MIRROR_NOT_FOUND` 人工對照提醒，不當作確定刪除或竄改。新增覆蓋資訊也納入SHA256查詢快照；保留原B12多頁排序方向、篩選與雙revision的綁定，避免舊游標跨資料版本延用。
- `UI`：原 `gas/Study1Team.html` B12來源下拉選單加入「B02行事曆」，同頁呈現各來源保留筆數及可理解的覆蓋提示，不用額外頁面、匯出或下載；以`textContent`呈現提示避免插入HTML。不改動既有OWNER身分驗證與稽核匯出拒絕。
- `TESTS`：新增五項虛構測試，驗證B02/B04/B05正常配對、矛盾閉鎖、歷程達12筆上限及欠缺鏡像時的非確定性提示、同版號來源漂移的續頁拒絕、出席無改值情境、非法來源代碼／時間與正式匯出拒絕。PR #68首輪為**518 PASS、1 FAIL**（漏列B02查詢白名單），已在同PR修正後重新全部驗證：PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42199696937` **519 PASS／0 FAIL**，合併後 main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42199832304` **519 PASS／0 FAIL**。CI不等於真實網頁使用者操作驗收。
- `SOURCE_PR=68`（已合併）／`SOURCE_COMMIT=d297eff932bcf65da58479a0464ddd3264531aa7`。合併前確認最新main、PR head及全部CI一致，不覆蓋並行B01 PR #63；程式只更動上述三個原有檔案。
- `GAS_SYNC_VERIFIED=true`：原同ID安全同步 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42199832131` 完整成功。預寫入GAS原碼與部署快照Drive備份ID `1QfA6saeuucC1S9cwuZPYUa8DGiWs0ZfX`；更新前遠端HEAD SHA256 `39e7049a6885d42882a6b7bff00db2f666476eb7de93ec292970a5f5edf16734`；更新後HEAD SHA256 `f6242b2b265b705a4af0c686f8e29b09700ebe9c515e5bce63b55daf00db1147`。原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`、原 `/exec` 保留，**V64→V65**，`DEPLOYMENT_AFTER_UPDATE=65` 與 `SYNC_VERIFIED=true`；有效版本化部署仍為 `MYSELF`（未部署HEAD manifest出現 `ANYONE_ANONYMOUS` 不代表現行 `/exec` 已開放）。該備份僅為程式與部署快照，不是正式研究資料備份。
- `LAST_VERIFIED_STEP=main CI 519/519; original GAS V65 readback SHA256 and MYSELF`。獨立狀態：`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`B12_FORMAL_IMMUTABLE_AUDIT=false`、`FORMAL_READY=false`。此輪沒有正式真人頁面／資料讀寫或使用者實際操作驗收。
- `BLOCKERS`：歷史B02/B04/B05採限量截斷保留，不能推得未保存的前後值及永久完整歷史；正式不可改寫稽核、法定保存／刪除政策、PI／RA真正身分與撤權、正式研究資料來源、REC與實際網頁操作未核准或未驗證。仍維持`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、實驗二2027年前不招募且不自動開放，真人研究資料和正式匯出持續阻擋。
- `NEXT_ACTION`：下輪讀最新main與並行PR/排程，評估B02↔B04／B05歷程邊界的無副作用對照測試或其他原網站未完成的合成資料安全功能；正式長期稽核、真實PI／RA授權及資料匯出先核對REC和權責，不自行實施。
- `WRITE_OWNER=original GitHub main + same original GAS safe auto-sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; FORMAL_AUDIT_AND_REAL_UI_BLOCKED`。

## 四十、B08虛構通知管理中心及原 GAS V66 同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B08 notification (P2-03)`；`MODULE=B08`。接續第28–39節當次最新核實進度；原 B02–B06已有功能，B12近期已增量部署至V65，B01另有未合併的Draft PR #63，因此本輪選取與兩者職責不衝突、已有原始虛構通知來源及既有伺服器狀態轉移可沿用的 B08。正式主來源仍為 `solactw-star/study1-recruitment-gas/main`；原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原 `/exec` 部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`。
- `COMPLETED`（原資料源／不搬遷）：僅將 `gas/Study1Unified.js` 原有owner-only TEST view的通知截取範圍由最近6筆擴至**既有上限15筆**，使用原本 `STUDY1_UNIFIED_FIXTURE_V1` 的 `notifications`、原絕對索引及 `ADMIN_NOTIFY_ATTEMPT`，不建立新資料 key、通知表、分離式通知服務或第二套正式網站。原有場次、申請、稽核、冪等請求、版本CAS、ScriptLock及資料模式維持；15筆是現有ScriptProperties的虛構模式容量**不是正式研究通知容量**。
- `COMPLETED`（原研究團隊網頁B08）：`gas/Study1Team.html` 原網站新增B08通知中心及導覽，實際可依虛構代碼／文字、E1或E2、確認／改期／取消與狀態搜尋篩選，查看當時產生的通知文字快照、目前失敗代碼 `SIMULATED_FAILURE`、重試計次、結果與操作按鈕。按鈕沿用owner-only `study1UnifiedPreviewCommand` 的 `ADMIN_NOTIFY_ATTEMPT`，可人工選擇`FAIL`或`SIM_OK`（**僅虛構交付，絕未寄信**）；當已標`SIM_DELIVERED`或達3次模擬上限即停用。各操作由伺服器核對原索引、版本與請求去重、關閉旗標及owner身份，成功後回讀原共享TEST模型；競寫／失敗不顯示已成功。沒有自動建立B06待辦、寄送排程、匯出、CSV下載或正式對外寄送端點。
- `SOURCE_RETENTION`：舊通知的原生成文字不會因目前範本被修改而改寫，UI以`textContent`安全呈現；缺正式範本版本核准、收件服務追蹤、交付／送達證據、保存刪除規則及合規容量。本輪沒有增設假版本、偽造寄送成功或臆測收件狀態。`SIM_DELIVERED`只能解讀為**模擬流程結果**，不是實際郵件已送達／已讀，正式通知仍為`DISABLED`。
- `TESTS`：新增並沿用既有整合瀏覽器模擬與統一GAS狀態機測試，驗證原團隊B08篩選與空結果、原訊息快照、失敗到模擬成功的操作、2次計數、完成後不得重試、範本更新保留舊通知、雙頁籤版本衝突阻擋且寫入次數不變、原有15筆全量TEST通知視圖、無新的 ScriptProperties key、無真實寄信、P0正式開關維持關閉；保留其他B01–B12、網站安全和原GAS同步回歸。PR #69 CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42200684674` 與合併後 main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42200815135`：**522 PASS／0 FAIL**。這是自動化GUI模擬，不是假裝已完成owner真人瀏覽器3輪操作。
- `SOURCE_PR=69`（已合併）；`SOURCE_COMMIT=c187cd6659b6bdca102bd867681968ac35e40ff0`。本輪僅更新既有 `gas/Study1Unified.js`、`gas/Study1Team.html`、`scripts/study1-gas-backend-allowlist.cjs`、`tests/study1-team-visitor-flow.test.cjs`及`tests/study1-unified.test.cjs`；沒有新增任何程式檔、正式資料表、獨立首頁或部署。合併前比對最新main，自原開發基準的並行主分支更新僅為正式規格文件，沒有以較舊 B12 程式覆蓋最新V65成果。
- `GAS_SYNC_VERIFIED=true`：原GitHub既有安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42200815116` 成功，當次完整原GAS程式預寫入備份Drive ID `170MCri64kQwK-2Y9Vuf9jifmUqoYqajG` 已核實；原遠端HEAD SHA256 `f6242b2b265b705a4af0c686f8e29b09700ebe9c515e5bce63b55daf00db1147`。同一原部署 `/exec` 由**V65→V66**、回讀`DEPLOYMENT_AFTER_UPDATE=66`及`SYNC_VERIFIED=true`；新完整GAS HEAD SHA256 `a969696e184b44e16d46f404477008a56037ae945053c7e22d5f2fef07d3dff3`；有效存取權`MYSELF`、原Script ID和原部署ID均保留。未部署HEAD manifest顯示`ANYONE_ANONYMOUS`並不等於本次實際版本化`/exec`權限；已按原workflow保存原本`MYSELF`。此備份為程式快照，不是研究參與者資料備份。
- `SAFETY`：繼續`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2不自動開放招募；無正式REC文件／Sheet／真人資料／正式補貼／真實電子同意／對外郵件寫入，也未啟用真正PI／RA角色或匯出。原網站整合新B08 GUI不構成正式通知服務已獲核准。
- `LAST_VERIFIED_STEP=PR #69 merge + 522/522 main CI + same-ID original GAS V66 /exec full SHA + permission readback`；`MAIN_SYNC_VERIFIED=true`；`GAS_SYNC_VERIFIED=true`；`B08_SYNTHETIC_CONSOLE_IMPLEMENTED=true`；`REAL_EMAIL_ENABLED=false`；`PRODUCTION_STORAGE_CONNECTED=false`；`CAPACITY_FORMAL_VERIFIED=false`；`SELF_UI_3PASS=NOT_VERIFIED`；`USER_UAT_PENDING_BY_USER_REQUEST=true`；`FORMAL_READY=false`。
- `BLOCKERS`：經核准的真人通知用途／REC範本與實際寄送、送達／失敗服務證據、版本與保存規則、正式身分／角色權限及撤權、跨期限正式資料provider及容量、原owner瀏覽器實際驗收。不得以成功模擬`SIM_DELIVERED`／522項CI推論真人可招募或真實郵件已送達。
- `NEXT_ACTION`：先重新讀最新 main、原GAS和既有排程／PR競寫，再選其他尚未完成、無真人資料副作用的P1／P2模組（例如B09純虛構數據統計或B11安全設計的只讀設定），不要和B01 Draft PR #63或B12他輪開發覆蓋。B08如要加入正式範本版本、寄送與保存，必須先核對有效REC／資料治理授權；不得自行解除正式開關。依第28節不要求使用者現在人工驗收。
- `WRITE_OWNER=GitHub main + original GAS backup/same-ID safety sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十一、B01原網站唯讀研究總覽及原GAS V67同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B01 overview (P2-05 read-only portion)`；先讀當次GitHub最新main、正式規格至第40節、舊B01 Draft PR #63（`head=55c2e8fa18ab60d05dd3fa76b3cad6763fc979a7`，基於舊`main=0514045a6c2cf03295b8a5894ec8ddb4a248357c`）、其他開放PR及原GAS V66狀態。B08由並行寫入者於PR #69先完成並合併main，故本輪**不再建立第二個B08或覆蓋該檔**。舊B01 PR #63仍為未合併草稿；選擇從新main `c187cd6659b6bdca102bd867681968ac35e40ff0` 選擇性移植其可驗證B01內容到唯一原正式網站，未直接合併舊分支、未改PR #63。
- `COMPLETED`：`gas/Study1Team.html` 現有研究團隊導覽與B02行事曆上方新增`B01`唯讀研究總覽。**全部指標只使用已核准OWNER可讀之同一份現有隔離TEST快照，不新增資料服務或寫入**。13個易懂的卡片涵蓋不重複**申請代碼**（非獨立真人受試者數）、申請／預約紀錄總數、場次紀錄、台灣當日未取消場次、有效預約待確認出席、未完成人工待辦、兩實驗分別有效申請、已成立預約、出席已確認、施測行政進度完成、需人工釐清的無效場次關聯、已取消場次仍有有效申請等數值。日期按臺灣時區解讀；不能由行政進度推定正式研究完成或已達核准招募目標，**正式目標及完成率未核准故不計算**。本輪沒有B09 CSV/XLSX匯出或正式長期趨勢報表。
- `FAIL_CLOSED`：若owner回傳未符合 `TEST/OPEN=false/CONSENT_READY=false/formalReadiness.activationAllowed=false`、場次或申請格式損壞、重複ID或不合法日期，立即清空B01既有卡片；讀取失敗亦清空，避免顯示過期成功數據。其他B02–B06、B08、B12皆保留，原研究室網站無新endpoint、ScriptProperties key、公開收件或正式資料讀取。
- `SOURCE_PR=70`（已合併）；`SOURCE_COMMIT=765dcdeebee517fe3f06b2c37f7f7be3d62df836`；僅修改原`gas/Study1Team.html`與既有`tests/study1-team-ui.test.cjs`。取自舊B01 PR #63安全邊界的6項測試與同源實作，於現行main增量合併；PR #63未合併、草稿保留待工作流後續釐清，不得再把其舊程式版面覆蓋新main。
- `TESTS`：PR #70完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42201252247` 成功 `528 PASS／0 FAIL`；合併後main完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42201363708` 再通過 **528 PASS／0 FAIL**。測試涵蓋B01錯誤來源/失敗清空、計數與辨識邏輯、B02/B06交叉摘要、台灣日期凌晨跨UTC日界、重複ID與非法日期拒絕；仍為程式及模擬GUI測試，不是原owner實際瀏覽器三輪驗收。
- `GAS_SYNC_VERIFIED=true`：使用同一原GitHub安全同步工作流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42201363736`，更新前原GAS完整程式/部署備份Drive ID `1HwBFo4UvX1Pyr9MzmAIugcOgaLh1LuxD`，更新前遠端完整HEAD SHA256 `a969696e184b44e16d46f404477008a56037ae945053c7e22d5f2fef07d3dff3`；更新後完整HEAD SHA256 `12ed254a9141b5f65ecdb378c6b995efa642e03e30902ff95bd4fe8a092993f4`。同一原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 和既有部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 均保留；原`/exec` **V66→V67**、`DEPLOYMENT_AFTER_UPDATE=67`、`SYNC_VERIFIED=true`；正式版本化部署有效存取權仍為 `MYSELF`，未部署的HEAD manifest若標 `ANYONE_ANONYMOUS` 不代表現行 `/exec` 公開。備份為GAS程式快照，**不是參與者正式研究資料備份**。
- `SAFETY`：`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2 2027年前不招募且不自動開放；正式REC、核准同意、真人研究資料、Gmail／Sheets、正式研究目標與完成率、真正PI／RA登入與撤權以及任何正式匯出均未變更或啟用。
- `LAST_VERIFIED_STEP=PR #70 merged + main CI 528/528 + original GAS V67 same-ID /exec SHA/permission readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B01_SYNTHETIC_OVERVIEW_IMPLEMENTED=true`、`SELF_UI_3PASS=NOT_VERIFIED`、`FORMAL_READY=false`、`PRODUCTION_STORAGE_CONNECTED=false`。
- `BLOCKERS`：B01/B09正式研究目標與完成率、核准真人資料來源、跨期間趨勢、報表匯出、持久稽核、經核准PI/RA帳號與撤權、REC及owner真人瀏覽器操作驗證尚未完成。既有Draft PR #63已由本輪主站B01安全移植覆蓋功能，但**PR仍開啟；禁止將舊版本當作最新版直接合併**。
- `NEXT_ACTION`：下輪先查GitHub最新main/PR及同ID GAS實際部署，續做不依賴真人資料的B09純虛構唯讀趨勢或B11設定安全預覽，或補測B01跨模組安全計數；正式匯出、真人資料及REC操作必須另行核准。本輪依使用者指示不要求人工驗收。
- `WRITE_OWNER=GitHub main + same original GAS backup/safe-sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十二、B09虛構資料統計報表／分母去重與場次日期篩選及原GAS V68回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B09 statistics (P2-05)`。本輪核對當時最新正式GitHub `main=0c458799cd19714003c7fc9eda2bc9b0c81242b2`、正式規格第14、28–41節、現有B01–B08/B12實作、原GAS V67與開放Draft PR #63（未授權直接合併過時分支）。保留原正式Repository `solactw-star/study1-recruitment-gas`、原 GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原版本化 `/exec` 部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`；不新增平行網站、正式資料庫、Sheet、GAS公開端點或ScriptProperties key。
- `COMPLETED`（原主站B09介面）：在**原** `gas/Study1Team.html` 新增B09研究統計報表專區、導覽、E1/E2/合併範圍、**目前申請階段**下拉篩選、臺灣場次起迄日期（含端點）、清除篩選及重新計算。由現有OWNER可讀的單一`study1UnifiedPreviewGet`隔離TEST快照衍生唯讀指標與兩張表：按實驗彙整及按場次日期的序列。與B01研究總覽、B02行事曆、B03名單、B04出席與管理、B05場次進度、B06人工待辦、B08通知現況共用既有資料，未發出額外寫入RPC；不自行新增對真人的角色、報名或電子同意。
- `ACCOUNTING`（正式統計限制與明確分母）：既有申請紀錄只有**目前** `phase`／`eligible`、虛構申請代碼與場次關聯，**沒有可用來篩選報名日期或回放歷史階段完成時間的可靠原始欄位**。因此「全期申請代碼／初篩結果」僅依實驗及目前階段條件計算、**不套用場次日期**；日期區間只限制`slots.when`（臺灣本地場次日）及關聯的虛構預約／出席／施測狀態，趨勢標為**場次日期分布而非報名時間趨勢**。初篩通過率的分母為已有布林資格結果的申請代碼；已成立預約、出席（PRESENT/LATE）及行政施測完成比例的分母為日期範圍內**未取消申請且關聯未取消場次**的申請代碼；未登記出席不當作ABSENT，行政進度COMPLETE不等於正式研究完成。分母0時顯示未計比例而非除零。單個代碼在同一來源快照最多計一次；重複申請ID、跨實驗錯誤場次關聯、異常資格／狀態／日期直接拒絕計算，不作默默去重掩蓋錯誤。
- `UNAVAILABLE_NOT_ZERO`：即使虛構申請代碼不重複，仍**不能跨不同代碼辨識是否同一真人**；不將代碼數當作獨立受試者。正式研究目標、樣本完成率、報名時間趨勢、候補人數、已核准報表／正式CSV或XLSX匯出、真人身分去重及跨期持久化均**尚無足夠正式來源或授權**，不以虛構零值偽造。B06未完成待辦、B08模擬通知失敗只作與當前快照一致的**現況指標**，不受場次日期和申請階段限制；不把模擬通知視為真實交付、送達或已讀。
- `FAIL_CLOSED`：B09在客戶端原owner-only TEST快照驗證`mode=TEST`、`OPEN=false`、`CONSENT_READY=false`、`formalReadiness.activationAllowed=false`、`formalPorts.activated=false`、虛構代碼/實驗/場次日期/目前階段/出席與施測欄位的完整性及唯一性；不合法日期、起日大於迄日、來源資料損毀或重新載入失敗均清空既有報表，避免過期統計數值留存。UI以`textContent`呈現，不新增外連、下載、發信或正式資料接合，維持B01–B12其他功能。
- `SOURCE_PR=71`（已合併）／`SOURCE_COMMIT=a6ae48e848f43720b7443645f2e1850f336fbe68`。只變更原`gas/Study1Team.html`、`scripts/study1-gas-backend-allowlist.cjs`和`tests/study1-team-visitor-flow.test.cjs`；主分支更新前核對競寫狀態，保留B01最新整合與B12既有來源稽核。PR CI首輪`42202419986`為**530 PASS／1 FAIL**，唯一失敗為拒絕讀取測試後忘記恢復VM的mock函式；已修正測試隔離，無業務邏輯修改，重跑PR完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42202516565`及main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42202647190`，皆 **531 PASS／0 FAIL**。測試涵蓋與B01原首頁／B02時段總數核對、E1／E2／合計、申請與資格分母、取消申請與取消場次、PRESENT/LATE／COMPLETE、包含起迄的臺灣場次日期、目前階段條件、非法日期／錯誤來源、權限撤回時清空以及全程無新增TEST資料寫入。CI及瀏覽器形狀的VM測試**不是原owner實際瀏覽器驗收**。
- `GAS_SYNC_VERIFIED=true`：沿用既有同ID安全工作流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42202647253`，原GAS完整程式與部署預寫入備份Drive ID `1qiTqDFQNLQ9wnvXp8ACE3oLL6rOtMGWs` 已核實；遠端原HEAD SHA256 `12ed254a9141b5f65ecdb378c6b995efa642e03e30902ff95bd4fe8a092993f4`。在同一原Script、同一原版本化`/exec`部署安全更新**V67→V68**，回讀`DEPLOYMENT_AFTER_UPDATE=68`、`SYNC_VERIFIED=true`、完整新HEAD SHA256 `20c24bf4c5a426920faa0f19fe9835f9c11fdbdb9c81446fa325d22658c32883`；有效存取權`MYSELF`保留。未部署HEAD manifest中`ANYONE_ANONYMOUS`並不代表實際已部署的`/exec`開放。備份僅為原GAS程式與部署配置，不是正式研究參與者資料備份。
- `SAFETY`：繼續`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2 2027年前不招募且到2027年不自動開放；未讀寫正式研究Sheet、真人資料、正式REC、正式通知、付款或核准同意；不啟用真PI／RA權限、不開放CSV／XLSX或其他資料匯出。
- `LAST_VERIFIED_STEP=PR #71 main code merge + 531/531 CI + original GAS V68 same-ID full SHA /exec permission readback`；`MAIN_SYNC_VERIFIED=true`；`GAS_SYNC_VERIFIED=true`；`B09_SYNTHETIC_REPORT_IMPLEMENTED=true`；`SELF_UI_3PASS=NOT_VERIFIED`；`USER_UAT_PENDING_BY_USER_REQUEST=true`；`PRODUCTION_STORAGE_CONNECTED=false`；`CAPACITY_FORMAL_VERIFIED=false`；`FORMAL_READY=false`。
- `BLOCKERS`：經核准的正式資料provider／容量及完整跨期註冊時間、真人身分唯一鍵、候補來源、研究目標與正式階段完成定義、CSV/XLSX匯出與角色授權、不可改寫稽核、有效REC及真正owner瀏覽器UI操作。未獲正式研究權責與核准不可將TEST報表升級為真人統計。
- `NEXT_ACTION`：先重新核實最新GitHub main、PR、工作流、原部署與競寫，接續未涉及真人資料的B11設定預覽或其他P1/P2功能；如擴充B09，先補來源可證實的階段分類、經核准的正式資料日期與分母，再處理真正報名趨勢與匯出。維持既有每小時排程職責，不新增平行任務或要求使用者立即人工驗收。
- `WRITE_OWNER=GitHub main + original GAS safe-sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十三、B09場次日期視覺比較與原GAS V69同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B09 synthetic trends`。依當次GitHub最新main `5ed6f4bc9a81e93691cc6e3c6a6b0b3a2e6fb3e5`、原正式規格第31–42節及並行PR核實：B09主模組已由另一輪PR #71合併main且原GAS V68同ID同步成功，因此本輪未再複製B09統計或建立平行系統。僅在原有 B09 增加同一組安全快照的可視化分布，保留第42節全部指標定義、分母與限制。
- `COMPLETED`：原 `gas/Study1Team.html` B09日期分布表下方新增**按臺灣場次日期的橫條比較圖**，直接使用原 `b09Compute_(model,scope,phase,start,end)` 已驗證的 `result.trend`，每個日期以三筆有明確文字標籤的原生DOM橫條表示「未取消場次」「有效關聯虛構申請代碼」「施測行政進度完成」。條長依**所顯示日期數值中的最大筆數**相對縮放，文字直接保留原筆數，不是正式研究目標或完成率；資料缺乏可核實場次日期時顯示缺資料，而不是推斷沒有申請或補0。B01與B09沿用同一 OWNER-only TEST 快照，沒有新增任何GAS RPC、ScriptProperties key、歷史日期來源、統計表或下載匯出。
- `FAIL_CLOSED`：B09來源驗證失敗、起迄日期格式不合法或反向、撤銷授權/讀取失敗時，除原統計卡片與兩張表以外，**新增圖像也會立即清空**，不保留過期成功圖表。圖表使用`textContent`及DOM建立、數值與日期均來自原B09經驗證資料，橫條設`aria-hidden`而完整數值可供輔助技術讀取；不新增外部圖表程式庫、外連、傳輸或副作用。
- `SOURCE_PR=72`（已合併）／`SOURCE_COMMIT=9d00bd5f84b1862ddf4ab3ad774e3da10f7a6b61`。變更僅原 `gas/Study1Team.html`、既有 `tests/study1-team-visitor-flow.test.cjs`；保留B01／B02–B06／B08／B12原功能，沒有修改B01過期草稿PR #63或任何正式研究資料。
- `TESTS`：新增兩項同一原GAS狀態機的瀏覽器形狀模擬測試，核對場次日期、三種原來源計數、有數字的無障礙文字、橫條範圍、不發任何寫入RPC、不新增資料key；空日期範圍顯示證據不足、非法日期及owner讀取失敗清除圖表。PR #72 CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42203343617`、合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42203466407` 均成功，**533 PASS／0 FAIL**。這是自動化測試，不代表實際owner瀏覽器三輪UAT完成。
- `GAS_SYNC_VERIFIED=true`：沿用原安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42203466414`，先備份原GAS完整程式及版本化部署快照至私人Drive ID `1XYzO3HxLr8PwToOFg5nBkEkymIohTwx0`；更新前原遠端完整HEAD SHA256 `20c24bf4c5a426920faa0f19fe9835f9c11fdbdb9c81446fa325d22658c32883`，更新後HEAD SHA256 `250da7c29286753ef11434466736e84e4501e29336271269db54a49ee10c300c`。同一原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、同一 `/exec` deployment ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`，版本**V68→V69**、`DEPLOYMENT_AFTER_UPDATE=69`、`SYNC_VERIFIED=true`。有效版本化部署權限仍為`MYSELF`，原HEAD未部署manifest顯示`ANYONE_ANONYMOUS`不是公開`/exec`的證據。此Drive備份是程式及部署快照**不是研究資料備份**。
- `SAFETY`：維持`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2在2027年前不招募且屆時不自動開放；未開放正式統計目標、正式研究完成率、註冊時間趨勢、真實參與者身份去重、CSV/XLSX或其他正式匯出、真人資料、REC、Sheet、Gmail、PI／RA真正帳號與撤權及正式部署對外收件。
- `LAST_VERIFIED_STEP=PR #72 merge; main CI 533/533; same original GAS V69 HEAD/deployment SHA + MYSELF full readback`。獨立驗證狀態：`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B09_SYNTHETIC_TREND_VISUAL_IMPLEMENTED=true`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：尚無合法的報名時間或跨期個人記錄、研究目標/正式完成定義、核准真人資料provider、PI／RA正式授權與撤權、正式匯出、原研究網站實際owner三輪瀏覽器驗收。圖像使用合成TEST資料，不得被當作實驗二已開放或招募成果。
- `NEXT_ACTION`：下輪先讀最新GitHub main、PR、排程與原部署狀態，再處理B11純合成系統設定預覽、B09更多可信來源健全性測試或其他不需REC正式資料授權的核心缺口。不直接合併舊B01草稿，禁止未授權真人資料或正式匯出，不要求使用者此輪驗收。
- `WRITE_OWNER=GitHub main + original GAS same-ID safe-sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十四、B11虛構設定範圍、前後差異預覽、原子版本鎖與GAS V70回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B11 settings (P2)`；以當次GitHub正式main `df9117470bc110f135d7d822dd6c52d2f4bf1c96`、規格第17、28–43節、B01–B09及B12既有主站程式、開放PR及原GAS V69核實後續作。唯一正式來源仍為 `solactw-star/study1-recruitment-gas/main`，沿用原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 與原版本化`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`。沒有建立第二個網站、資料庫、Sheets、ScriptProperties key或正式對外端點。
- `COMPLETED`（B11原網頁）：原 `gas/Study1Team.html` 新增研究團隊owner-only的B11系統設定專區、E1／E2／兩者管理範圍、對應虛構顯示模式、可另行勾選的全站虛構文案（主標題／提示／測試通知範本）、送出前**逐欄原值與草稿新值差異**、未發布展示預覽、鎖定當次修訂版及明確的`TEST`套用動作。管理範圍只決定B11**本次草稿更新的實驗顯示欄位**；例如選E1不改E2，選E2不改E1；全站文案必須獨立勾選並明示會影響兩者。空差異不產生交易；編輯後舊預覽失效；失敗、角色撤回或資料讀取不安全時清空預覽並拒絕套用。原參與者Demo網站讀取同一TEST設定快照，但管理範圍切換本身**不改參與者顯示或正式收件狀態**。
- `COMPLETED`（原交易與嚴格版本鎖）：在既有`gas/Study1Unified.js` TEST狀態機允許唯一新內部操作`ADMIN_B11_SETTINGS`，欄位僅`scope,modes,site,release='TEST_ONLY'`；只允許E1/E2對應顯示模式及選擇性全站虛構文案，禁止額外欄位、非TEST發布、超長或不安全文字、無變化交易及不屬所選實驗之修改。跨實驗模式與全站TEST文案在**同一次既有owner校驗、`OPEN=false`／`CONSENT_READY=false`、ScriptLock、`expectedRevision` CAS、request ID去重、寫後回讀及異常恢復**下更新原`STUDY1_UNIFIED_FIXTURE_V1`一個key及一個修訂版。沿用原B02–B09與B12資料模型、REC草稿及研究流程不變。原`ADMIN_EDIT`、`ADMIN_RECRUITMENT`等既有TEST編輯器保留，不把B11預覽錯當已完成全部舊介面工作流的統一前置門檻。
- `PUBLICATION_BLOCK`：B11正式發布按鈕持續disabled且沒有真實公開發布RPC；新增**無法透過HTML client直接呼叫的私有**`study1UnifiedB11FormalPublish_`一律拋出未經REC／權責核准拒絕。原研究政策、正式招募、正式資料、真正PI／RA帳號與郵件均維持關閉。B11本輪所謂「套用」只代表虛構TEST資料更新；**不是正式研究網站內容核准或對外發布**。保留原允許的測試展示設定及B11在更廣範圍的設計需求。
- `TESTS`：新增原伺服器狀態機與既有瀏覽器形狀整合模擬，測E1選擇性修改不碰E2、E1/E2＋全站TEST文字一筆原子提交與一次修訂、前後欄位比較／預覽不寫入、修訂版綁定、預覽後改稿失效、雙頁籤CAS競寫阻擋及強制重新讀取、無修改拒絕、惡意額外欄位／不核准發布字樣拒絕、OWNER身份和旗標安全及既有B01–B09／B12回歸。PR #73首輪CI `42204839168` 為**526 PASS／13 FAIL**，原因是私有B11函式未列入原GAS安全白名單，以及B11原碼排列影響既有B01測試擷取。保留原B01測試的區段契約並將新私有拒絕函式納入嚴格白名單後，PR完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42205048404` 與合併後main完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42205215031` 均**539 PASS／0 FAIL**。僅為VM模擬及自動測試，不能充當原owner真瀏覽器三輪UI驗收。
- `SOURCE_PR=73`（已合併）；`SOURCE_COMMIT=b660dbce64fb476af01f6f7d548d600fc7d09976`。只修改原`gas/Study1Team.html`、`gas/Study1Unified.js`、`scripts/study1-gas-backend-allowlist.cjs`及兩個既有測試`tests/study1-team-visitor-flow.test.cjs`、`tests/study1-unified.test.cjs`。合併前比對latest main與PR head/CI，未覆蓋B09 V69。並行B11 PR #74因基於舊main與PR #73重疊，已被其他寫入者標示`SUPERSEDED`並關閉且未合併；不可用舊PR #74覆寫本版。
- `GAS_SYNC_VERIFIED=true`：原 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42205215277` 首輪在任何GAS寫入前，因**私人Drive程式備份API HTTP 502**而安全阻擋，沒有跳過備份或錯誤宣稱V70已上線。在main及遠端部署未變時重試該run第2次，完整CI再獲**539 PASS／0 FAIL**，完成原GAS完整預寫入備份Drive ID `1gheYtft9x5XCfJTrr8QU799lela-b0Yi`；遠端更新前完整HEAD SHA256 `250da7c29286753ef11434466736e84e4501e29336271269db54a49ee10c300c`。原`/exec` **V69→V70**，回讀`DEPLOYMENT_AFTER_UPDATE=70`且`SYNC_VERIFIED=true`，新版完整HEAD SHA256 `48ce73da2aad57fe0fc1d9617684454218faac7c0ee0f0b5be63f666e9e84672`。同一原GAS Script及部署ID不變，有效部署權`MYSELF`保留；遠端HEAD manifest顯示`ANYONE_ANONYMOUS`不代表現行版本化`/exec`對外公開。該備份為GAS**程式**快照而非正式研究參與者資料備份。
- `SAFETY`：`OPEN=false`、`CONSENT_READY=false`、`MYSELF`，實驗二2027年前不招募且不自動開放；正式REC、真實個資Sheets、通知寄送、正式補貼、電子簽署、研究計畫與RIF刺激檔均未修改。此輪不接真人資料、不發信、不部署其他ID、不要求人工驗收。
- `LAST_VERIFIED_STEP=PR #73 merged + 539/539 main CI + original GAS V70 /exec HEAD SHA/permission full readback`；`MAIN_SYNC_VERIFIED=true`；`GAS_SYNC_VERIFIED=true`；`B11_TEST_DRAFT_PREVIEW_AND_ATOMIC_APPLY=true`；`B11_FORMAL_PUBLISH_ALLOWED=false`；`SELF_UI_3PASS=NOT_VERIFIED`；`USER_UAT_PENDING_BY_USER_REQUEST=true`；`FORMAL_READY=false`；`PRODUCTION_STORAGE_CONNECTED=false`。
- `BLOCKERS`：B11尚未將管理範圍擴充成**所有後台頁面繼承或臨時覆寫的全域研究範圍**；本輪B11 scope只用於集中設定草稿，不能宣稱第17節全部跨模組範圍需求已完成。真正經REC核准的網站文案版本／審核來源、正式發布流程、完整B11權限、正式資料provider／容量、PI／RA帳號及撤權和原owner真瀏覽器驗收均未完成。
- `NEXT_ACTION`：下輪先核對latest main、PR/排程寫入者與原GAS實際部署狀態，可將B11目前模組內scope安全擴充至**B01/B02/B03/B06/B08/B09共用後台範圍繼承與局部覆寫**的唯讀篩選（不變動正式收件或真實研究範圍）；或接續其他已核准且無真人資料副作用的P1/P2功能。任何正式REC核准文案、對外發布或資料接合都須另經權責驗證，不能自行放行。依第28節不要求本輪人工驗收。
- `WRITE_OWNER=GitHub main + original GAS backup-and-verify workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; LIVE_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十五、B11提交回讀核驗、版本競寫自動復原與原GAS V71同ID驗證（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B11 safe recovery`；本輪讀原GitHub main、正式規格第31–43節、B11及所有並行PR和部署。最初獨立開發的PR #74以舊main `df9117470bc110f135d7d822dd6c52d2f4bf1c96` 為基底，雖取得538 PASS／0 FAIL但在合併競寫檢查時發現另一寫入者已將更完整的B11 PR #73併入main `b660dbce64fb476af01f6f7d548d600fc7d09976`，所以**PR #74已關閉且未合併，無GAS部署**，未將過期後端或前端覆蓋主站。沿用第44節的B11 E1/E2/ALL選擇性TEST草稿、一次原子CAS與正式發布硬性拒絕；從最新main再建原路徑最小增量PR #75。
- `COMPLETED`（原B11前端提交驗證）：原 `gas/Study1Team.html` 的B11明確確認後，除原後端CAS、ScriptLock、owner及關閉閘門外，額外驗證回應為原 `mode=TEST`、`OPEN=false`、`CONSENT_READY=false`、正式端點未啟用、資料修訂版正好增加一次，**新資料中本次核准修改的E1／E2示範顯示及全站文案必須逐欄等於預覽草稿**；未在scope內的另一實驗顯示、各實驗固定年份及未勾選全站設定時的原文案也必須保持原值。版本或任一欄位不一致都不能顯示成功。
- `COMPLETED`（競寫／不確定提交結果的恢復）：原GAS拒絕提交、CAS競寫、版本衝突、異常成功回應或原資料安全校驗失敗後，立即清除舊預覽、**不自動重送／不重用舊request ID**，自動透過原OWNER-only `study1UnifiedPreviewGet` 再取得權威隔離TEST快照；若安全回讀成功，重設B11草稿與修訂版並告知先核對新值再預覽。**若連回讀都失敗，則清除B01／B09摘要與B11差異、鎖住後台編輯並顯示錯誤**；不能因模擬成功或暫時離線推定資料已保存。原後端沒有擴充真正PI／RA權限、正式資料、Gmail或研究同意書，原`ADMIN_B11_SETTINGS`的原子修改範圍不變。
- `CODE_SCOPE`：僅變更原 `gas/Study1Team.html` 及原 `tests/study1-team-visitor-flow.test.cjs`，無新JS／HTML正式檔、外部服務、GAS入口、ScriptProperties key及新部署。測試新增假造成功回應但沒有寫入、CAS競寫後自動回讀權威資料、回讀遭拒時不再允許操作及清除顯示，並更新既有B11雙分頁競寫測試。PR #75 `https://github.com/solactw-star/study1-recruitment-gas/pull/75` 已併入main；`SOURCE_COMMIT=733ceae23f5445d6403c49c6abb6890719357cf6`。
- `TESTS`：PR #75 CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42205964226` 及合併後 main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42206096590` 均成功，**541 PASS／0 FAIL**。這只是使用虛構資料的後端與瀏覽器形狀VM整合測試，`SELF_UI_3PASS=NOT_VERIFIED`，不宣稱已完成原OWNER真實瀏覽器操作驗收。
- `GAS_SYNC_VERIFIED=true`：沿用原安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42206096401`，寫入前完整GAS原始碼和部署配置私人Drive備份ID `18R1XrQhkoChhMGc1dU8y4rYmwA-__Tot`，遠端原HEAD SHA256 `48ce73da2aad57fe0fc1d9617684454218faac7c0ee0f0b5be63f666e9e84672`；新HEAD SHA256 `e21988e9ea316b8fa50fb47566d688793417964f8d2c4377a7cfc2afaa313f0c`。同一原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、同一原`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`，正式版本**V70→V71**，完整回讀`DEPLOYMENT_AFTER_UPDATE=71`、`SYNC_VERIFIED=true`、有效存取權限仍`MYSELF`。未部署的HEAD manifest可能帶`ANYONE_ANONYMOUS`，不可誤認等同現行版本化部署；備份是程式快照，不是正式研究資料的備份。
- `SAFETY`：保持`OPEN=false`、`CONSENT_READY=false`、有效部署`MYSELF`及E2在2027年前不招募且2027年不自動開放。正式REC、真人Sheet、同意、通知寄送、PI／RA登入與撤權、CSV/XLSX匯出、正式內容發布及RIF研究資料均未修改。本輪**沒有**真人資料讀寫或正式招募權限。
- `LAST_VERIFIED_STEP=PR #75 main merge + 541/541 CI + GAS V71 SHA/deployment/MYSELF same-ID readback`；獨立狀態`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B11_AUTO_RECOVERY_IMPLEMENTED=true`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：B11只實作原OWNER-only TEST管理範圍、草稿預覽及失敗回復；跨所有後台模組的全域範圍繼承、正式網站發布、REC核准文案、核准真人資料provider、不可改寫稽核及真正PI／RA授權仍未完成；正式前需要原owner實際網站操作驗證，但依使用者指示**本輪不要求驗收**。
- `NEXT_ACTION`：下輪重新讀最新main、排程競寫、原GAS版本與正式規格；可持續做不依賴真人資料的B11跨模組安全範圍顯示、B01/B09模擬安全一致性或其它未完成P1/P2，但未取得獨立授權前保持正式操作阻擋。勿重新合併已關閉的PR #74或修改正式研究來源。
- `WRITE_OWNER=original GitHub main + same-ID GAS safe sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十六、B11跨六模組後台全域範圍繼承、臨時覆寫與原GAS V72同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B11 global owner admin-view scope (P2)`。本輪從最新原GitHub main `e370bfd4c91ad295eeb8d62dfcbb21962a496ad8`、正式規格第17、28–45節、B01/B02/B03/B06/B08/B09現有原碼、B11 V71安全恢復、既有排程與PR競寫核對後增量修改。原唯一正式程式庫 `solactw-star/study1-recruitment-gas`、GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 均不變。過時的B01 Draft PR #63仍不得直接合併覆蓋。
- `COMPLETED`（B11全域OWNER後台範圍）：在原 `gas/Study1Team.html` 管理頁面頂端加入`adminScopeGlobal`三選項`ALL／E1／E2`，並在**B01總覽、B02行事曆、B03名單及看板、B06待辦、B08虛構通知、B09統計報表**各設`INHERIT／ALL／E1／E2`頁面臨時覆寫與實際生效範圍文字。預設繼承全域ALL；全域變更時會同步刷新六模組，個別覆寫只改本頁，未覆寫的其餘頁面仍繼承全域。原模組既有日期、階段、搜尋等細項篩選再額外套用於有效範圍；範圍變更重設舊「實驗」細項篩選，避免假性沒有資料。整組檢視選擇只存在同一OWNER瀏覽器記憶體內：在**同頁**重新向原GAS讀取TEST快照保留選擇，另開新管理頁面初始化為ALL；完全不寫入ScriptProperties、地方儲存、正式資料表或任何GAS新RPC。
- `MODULE_ALIGNMENT`：B01在完整資料先行驗證後，按實驗彙整申請代碼、場次和B06相關待辦；B02行事曆僅顯示符合有效範圍的場次，切換範圍會關閉舊場次／個人面板，避免舊E2畫面殘留E1檢視；B03清單與看板使用同一過濾結果，並在範圍變更時關閉B04舊資料面板；B06在單一E1或E2視圖納入該實驗及`ALL`共通待辦，其他實驗專屬待辦及所屬稽核事件不出現在目前視圖，切換範圍時清除舊編輯／歷程選定；B08仍先全面驗證通知來源及原絕對索引，之後僅顯示目前實驗的虛構通知、失敗及模擬狀態計數，不移動原通知或假造送達；B09在原有可信分母及臺灣場次日期計算上套用有效範圍，舊頁內實驗細項篩選若與有效範圍衝突則清空而非編造比例。B01/B09/B06跨模組數值均依相同OWNER-only TEST快照，不將虛構代碼數當作獨立真人受試者。
- `SECURITY_BOUNDARY`：本輪範圍是**介面可視資料的暫時篩選，不是身分授權或資料存取隔離**。伺服器仍以原OWNER身份、`OPEN=false`、`CONSENT_READY=false`、ScriptLock及交易CAS分別決定操作權限；未開放真正PI／RA、範圍型角色權限或真人資料。只修改原研究室管理網站的前端及同步原GAS程式，**不修改**`gas/Study1Unified.js`狀態機、TEST／正式資料模型、招募設定、REC、研究計畫、電子同意、正式網站展示選項或對外寄信與匯出。原B11 TEST-only設定差異預覽與原子CAS提交保持獨立；管理範圍切換**不等於**B11修改實驗顯示設定，也不對正式參與者網站產生變更。
- `FAIL_CLOSED`：範圍值不合法時拒絕並清除原六模組資料、B01／B09數據，停用當前修改權直到再核對OWNER快照；原GAS身份拒絕、關閉旗標不符或重新載入失敗時清空B02行事曆、B03名單/看板、B06待辦及有限歷程、B08通知，連同既有B01/B09及B11預覽一併清空，不保留錯誤成功畫面。B02／B03舊頁面模態視圖於scope切換時關閉；不得因純前端scope繼承推論正式保密分級或授權已完成。
- `SOURCE_PR=76`（已合併）；`SOURCE_COMMIT=06382a8b8fbb9830d291de5e47884f913d087c70`。僅變更原`gas/Study1Team.html`、原`scripts/study1-gas-backend-allowlist.cjs`、原`tests/study1-team-visitor-flow.test.cjs`，未動原GAS backend、其他正式資料或未授權舊PR。PR首次完整CI `42207717960`為**544 PASS／1 FAIL**，係B02 browser-shaped測試對未初始化的場次狀態select得到空字串；修正原B02 selector空值預設ALL後，PR完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42207862488`及合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42208075163` 都**545 PASS／0 FAIL**。測試涵蓋六模組全域E1/E2/ALL繼承、B01/B09跨模組計數、B02臺灣場次日、B03清單看板一致、B06`ALL`共通事項與稽核隔離、B08通知來源索引、單頁覆寫彼此獨立、同頁重新讀取保留選擇、全新頁面重設ALL、使用者頁面原E1/E2示範顯示及關閉狀態不變、範圍異常或owner/有效身分拒絕/正式旗標變更後清空、不額外資料寫入。這些只是CI及瀏覽器形狀VM模擬，**不是原OWNER實際瀏覽器3次驗收**。
- `GAS_SYNC_VERIFIED=true`：使用既有原同ID安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42208075060`，原GAS完整程式與部署在寫入前已私人備份至Drive ID `1piXseel9MHSCi1pWjfwaRinGBrO8bRNg`。原遠端完整HEAD SHA256 `e21988e9ea316b8fa50fb47566d688793417964f8d2c4377a7cfc2afaa313f0c`，新HEAD SHA256 `7edb5b8a6d5d02aa70260ee43be699d32f1b2487a35f2873dcfa47c010554434`；原版本化`/exec`**V71→V72**、回讀`DEPLOYMENT_AFTER_UPDATE=72`、`SYNC_VERIFIED=true`，原部署ID及Script ID保留，正式有效存取權`MYSELF`不變。原HEAD manifest顯示`ANYONE_ANONYMOUS`不等於已部署`/exec`公開。備份為程式快照，**非正式研究資料備份**。
- `SAFETY`：持續`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2 2027年前不招募且達2027也不自動開放。沒有真人資料、正式Sheet、REC／研究計畫、正式通知、正式補貼、電子簽署、正式匯出或RIF刺激檔改動。
- `LAST_VERIFIED_STEP=PR #76 main merge + 545/545 CI + original GAS V72 /exec complete SHA/effective MYSELF readback`；`MAIN_SYNC_VERIFIED=true`；`GAS_SYNC_VERIFIED=true`；`B11_GLOBAL_SCOPE_SIX_MODULES_VERIFIED_SYNTHETIC=true`；`SELF_UI_3PASS=NOT_VERIFIED`；`USER_UAT_PENDING_BY_USER_REQUEST=true`；`FORMAL_READY=false`；`PRODUCTION_STORAGE_CONNECTED=false`。
- `BLOCKERS`：此UI檢視範圍仍不是已核准真正PI／RA角色與逐實驗權限隔離；缺經REC核准正式內容審核／發布、正式儲存provider與容量、完整稽核保存、正式人員權限／撤權、OWNER真人瀏覽器操作測試及正式研究啟用門檻。本輪不要求使用者立即人工驗收；既有每小時安全建置排程不變。
- `NEXT_ACTION`：新一輪需重讀最新main與當時並行PR、工作流及部署；可接續B10正式研究文件的**無真人資料索引與核准狀態展示**（不得捏造REC核准）、B11其他尚未完成的跨模組無副作用設定功能、或B09/B12來源一致性加固。受REC／真人身分／資料服務限制的模組繼續阻擋。
- `WRITE_OWNER=GitHub main + original GAS same-ID safety backup/sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十七、B10虛構研究文件版本及REC來源狀態唯讀檢視／原GAS V73回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B10 read-only document provenance (P2-04)`。本輪先核對原GitHub main `9f0b458bb980419fa8ba6525e9cc2dc804a98d8d`、唯一正式規格至第46節、其他開放PR、每小時排程及最近CI和原GAS V72同步證據；排程最近一輪只關閉過期且未合併的B01 PR #63，沒有改當時main/GAS。本輪未重複已完成的B11六模組範圍，也未將過期離線Demo分支合併。選擇尚未具集中檢視介面的B10研究文件類型索引，**只用原OWNER-only合成TEST快照**，不接觸任何真人或實際REC附件。
- `COMPLETED`（原網站B10最小功能）：在唯一原 `gas/Study1Team.html` 加入B10導覽和研究文件來源／狀態面板；允許E1/E2/ALL本頁唯讀篩選，共展示6筆**欄位參照**：各實驗初篩規則對照、研究介紹草稿及同意書版本參照。顯示各來源`PENDING`版號、明確的`REC_DRAFT_ONLY`與缺少核准文件／原始PDF／預簽及正式提供簽署歷程。這些不是6份已取得的原始文件；沒有杜撰正式文件名、連結、核准時間、版本歷史或原始PDF內容。
- `PROVENANCE_FAIL_CLOSED`：從既有 `study1UnifiedPreviewGet` 回傳而非新增RPC；先確認`mode=TEST`、`OPEN=false`、`CONSENT_READY=false`、`formalPorts.activated=false`、`formalReadiness.mode=FORMAL_BLOCKED`、`activationAllowed=false`、`governance.access=828_OWNER_ONLY`、`realData=NEVER_COLLECTED`與`subjectExport=FORMAL_BLOCKED`，再逐一比對`policy.consent`、`policy.screening.mappings`、`governance.documents`、`formalReadiness.provenance`及`definitions`的E1/E2來源、待核版號與宣稱雜湊。只要來源身分、版號、核准狀態或任一正式位元組／文件ID證據宣稱不一致，拒絕展示並清空B10資料。**有宣稱SHA也只顯示未查核，不把SHA格式正確視為已核准**。全程DOM `textContent`建立，未加入PDF讀取、提供副本、下載、電子簽署、刪除、發布或匯出按鈕。
- `CODE_SCOPE`：只修改原 `gas/Study1Team.html`、原 `scripts/study1-gas-backend-allowlist.cjs`與原 `tests/study1-team-visitor-flow.test.cjs`；未動原`Study1Unified.js`後端、正式資料模型、任何GAS權限或ScriptProperties key。新增後舊B01程式擷取與來源清除順序的既有測試一度失敗，透過調整B10程式區段及維持原B01失敗清除契約修正，**不繞過安全測試**。
- `SOURCE_PR=77`（已合併）／`SOURCE_COMMIT=39823b7c223438fc29cbe1b369e5a979dc6da749`。PR首次CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42210162125` 為**543 PASS／5 FAIL**（舊B01模擬測試區段契約影響），修正後PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42210316403`與合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42210457695` 均成功，**548 PASS／0 FAIL**。新增三項模擬測試：E1/E2只讀篩選、偽裝核准與來源版本互相矛盾的拒絕、已填宣稱雜湊但未核對與OWNER讀取拒絕後清空；均不是原OWNER真實瀏覽器三輪驗收。
- `GAS_SYNC_VERIFIED=true`：原同ID安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42210457774` 成功，原GAS完整HEAD及部署寫入前私人備份Drive ID `1JBBcJKZSo2HwkOOlYmzIpEw09mD09HbK`；舊HEAD SHA256 `7edb5b8a6d5d02aa70260ee43be699d32f1b2487a35f2873dcfa47c010554434`，新HEAD SHA256 `cd69b199f0374596c59e96359659cef7985390b16f9a88701ee9a8f1bb7c3508`。原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原版本化`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 均保留，**V72→V73**，`DEPLOYMENT_AFTER_UPDATE=73`、`SYNC_VERIFIED=true`、有效存取權仍為`MYSELF`。遠端未部署HEAD manifest可能標`ANYONE_ANONYMOUS`，不可誤認已將實際`/exec`公開。此備份為程式／部署快照，**不是REC或研究資料備份**。
- `SAFETY`：正式研究仍`OPEN=false`、`CONSENT_READY=false`、`MYSELF`，E2 2027年前不招募且到2027年也不自動開放；正式REC原檔、研究計畫、真人PI/RA權限、個資Sheets、通知、電子同意、簽署、補貼、正式文件核准、歷史版本或匯出皆未動。未核對真正最新有效REC來源前，B10只代表**已有合成資料版本欄位的待核狀態**，不代表核准文件管理、正式來源同步或正式研究準備完成。
- `LAST_VERIFIED_STEP=PR #77 main merge + 548/548 CI + same original GAS V73 /exec SHA/MYSELF readback`。各狀態獨立：`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B10_SYNTHETIC_PROVENANCE_VIEW=true`、`B10_FORMAL_DOCUMENT_ACCESS=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：沒有讀取真正有效REC原始位元組、核准範圍及簽署者版本記錄；B10正式歷史版本管理、授權提供副本、電子簽署與通知稽核尚未完成且受核准阻擋。真實PI／RA角色及撤權、正式儲存provider、長期稽核與實際OWNER瀏覽器驗收仍未完成。依使用者指示，本輪不要求人工驗收、不順便修改其他研究領域的正式來源。
- `NEXT_ACTION`：下輪重新核對最新main、排程及原部署；續做B01/B09與B10或B12源頭的無真人資料一致性核查、或其他純OWNER合成資料P1/P2安全功能。B10正式文件歷程、REC來源與批准後發布不得在無獨立授權下啟動。保持排程原時間及原職責。
- `WRITE_OWNER=GitHub main + original GAS same-ID backup/sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十八、B10虛構申請引用版號對照、正確分母與原GAS V74同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B10 P2 synthetic reference-version reconciliation`。依當次正式GitHub `main=07fb17e751199853b031394bc30cfd08d1c321ba`、唯一正式系統規格第28–47節、B01–B12原程式和CI、開放PR與原GAS V73成功部署回讀後續作。本輪無REC、正式個資、研究計畫或RIF刺激變更。唯一正式程式庫仍為`solactw-star/study1-recruitment-gas`，原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`及原`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`保留。
- `COMPLETED`：原`gas/Study1Team.html`內B10保留既有E1/E2各3類共6筆`REC_DRAFT_ONLY`來源／版本欄位與全部待核安全門檻，新增同頁**只讀**的「目前虛構申請引用版號對照」表，範圍為E1、E2各自「初篩規則」與「同意版本欄位」兩類，共4組。以`policy.screening.mappings`及`policy.consent`當前TEST草稿版號，比較原OWNER授權TEST快照中`applications.screeningVersion`及`applications.consentVersion`。每組列出**相同／不同／未記錄**及原始分母；只有當前字串對照，並非正式REC有效性、歷史版本變更、同意書實際閱覽或簽署證據。
- `DENOMINATOR_AND_SCOPE`：各實驗分母為**該實驗所有目前不重複的虛構申請代碼**，包含目前已取消申請；版號只取`PENDING_...`形式的TEST欄位，無值記未記錄，不補0為已審或同意。每個`SIM-###`代碼需全域唯一，拒絕重複識別碼、違規實驗、申請階段、格式及沒有`REC_DRAFT_ONLY`的初篩引用來源。不同版號表示**目前兩欄字串不一致**，不代表REC違規或真實受試者不符合條件；不同虛構申請代碼不能視為不同真人。研究介紹草稿沒有與申請分開保存的獨立引用版本，因此**不製造「0次引用／歷史完成」數值**。分母0時仍顯示「0筆虛構代碼」，不是估計真人總數。
- `UI_AND_FAILURE`：於原B10新增`ALL／有不同版號／有引用／有未記錄`的臨時篩選，與現有E1/E2選擇交集。條件無匹配時顯示說明行，而不是宣稱沒有正式文件；同頁重新讀取OWNER快照可保留篩選，新管理頁預設全部。篩選不新增RPC、GAS key或寫入，所有資料均來自同一個既有TEST快照。任何虛構引用來源、原REC provenance或篩選值不合法，以及OWNER讀取／安全門檻失效時，**清空原B10六筆索引與新增引用對照兩表**，不保留錯誤或過期核准顯示。
- `SOURCE_PR=78`（已合併）／`SOURCE_COMMIT=9326d2da011c90aa443476a7c8f90de523e48fb3`；只增量更動原`gas/Study1Team.html`、原`scripts/study1-gas-backend-allowlist.cjs`及原`tests/study1-team-visitor-flow.test.cjs`。不修改GAS後端邏輯、資料欄位或其他模組。新增3組瀏覽器形狀整合測試，核對零申請的四組空分母、E1/E2正確比對含取消申請、版號不同及未記錄的計數、篩選交集／同頁刷新／新頁初始化、無寫入、重複識別碼／不合法版本／來源偽造／OWNER撤權後清空及原B01–B12回歸。PR完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42213971083`、main完整CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42214083876`均**551 PASS／0 FAIL**。
- `GAS_SYNC_VERIFIED=true`：依原同ID安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42214083814`，原GAS完整程式／部署在寫入前完成私人Drive備份，備份Drive ID `1kIwifwnqHkvWIMrAP5yNS837Di17bqNq`；原遠端HEAD SHA256 `cd69b199f0374596c59e96359659cef7985390b16f9a88701ee9a8f1bb7c3508`，新HEAD SHA256 `a49c7a682de78cf1485f8c287da2afc85917dce2ff075d208e974e3d1c8357b8`。原Script ID及原版本化部署ID不變，`DEPLOYMENT_BEFORE_UPDATE=73`、`DEPLOYMENT_AFTER_UPDATE=74`，`SYNC_VERIFIED=true`；有效`/exec`權限仍為**MYSELF**。未部署GAS HEAD manifest中的`ANYONE_ANONYMOUS`不代表已部署`/exec`對外開放；私人備份僅是程式／部署，並非正式研究資料備份。
- `SAFETY`：持續`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2於2027年前不招募且不因年份到達而自動開放。沒有讀寫真人資料、正式Sheet、REC／計畫、正式同意、真實郵件、補貼、簽署或資料匯出；B10依然不是正式文件管理庫。未獲核准原REC來源與原始位元組驗證，不得將TEST版本相同比對當成REC核准。
- `LAST_VERIFIED_STEP=PR #78 merged + 551/551 main CI + original GAS V74 /exec full SHA and MYSELF readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B10_TEST_REFERENCE_RECONCILIATION=true`；`SELF_UI_3PASS=NOT_VERIFIED`、`USER_UAT_PENDING_BY_USER_REQUEST=true`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：實際REC原始文件、核准紀錄、版本歷史與正式同意程序未連接；沒有正式PI／RA角色、跨期不可改寫稽核、真實資料provider／容量及owner實際瀏覽器UI驗收。此輪純TEST版本引用對照未解決正式簽署與來源核驗權責，不能升級為正式文件處理。
- `NEXT_ACTION`：下輪重讀最新main、開放PR（本輪後發現與本次三檔無重疊的B01 PR #79仍待各自測試／競寫核實）、每小時排程與部署，選擇B12稽核或B01/B09來源一致性的下一個安全子模組；實際REC、PI／RA及真人個資資料服務仍待正式授權。不要求使用者於本輪人工驗收。
- `WRITE_OWNER=GitHub main + original GAS safety backup/sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; LIVE_UI_AND_FORMAL_DATA_BLOCKED`。

## 四十九、B01管理頁13張卡片順序與顯示自訂／原GAS V75同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B01 P2-05 dashboard layout`。先核對當次最新原GitHub main `07fb17e751199853b031394bc30cfd08d1c321ba`、正式規格第14與31–47節、並行PR、每小時排程及原GAS V73；規格第14節仍要求B01資訊卡可調順序、顯示／隱藏，而原站13張唯讀卡均固定。使用者明確授權繼續未需REC／真人資料的最小增量；因此只對原OWNER-only TEST管理頁補足卡片介面功能，**不改原指標及資料模型**。
- `CONCURRENCY`：首輪隔離PR #79在原main `07fb17e751199853b031394bc30cfd08d1c321ba` 通過551/551 CI，但另一個合格寫入者已先合併B10 PR #78到main程式 `9326d2da011c90aa443476a7c8f90de523e48fb3`；禁止將PR #79過時的同頁文件覆蓋B10。PR #79因此**關閉而未合併／未部署**；B01選擇性移植到新main後，以PR #80提交，並保留B10來源與核准檢查、原後端及其既有測試。合併前另一寫入者只更新B10規格文件至`f065ebeb7ca9923a148ad8291cedbb4d45dfec53`，PR #80對應三個程式／測試檔沒有修改範圍競爭；核實GitHub可合併及CI全綠後才合併。
- `COMPLETED`：在唯一原 `gas/Study1Team.html` B01研究總覽的13張既有虛構統計卡加入可展開的**逐張顯示／隱藏、上移／下移、恢復預設**控制，提供具體按鈕與無障礙標籤。按鍵只排列或隱藏已由原B01安全來源計算的DOM卡片，**不重新計算分子分母、不修改研究目標、不涉及真人資料、正式匯出或付款**。B11全域E1/E2/ALL及B01本頁覆寫後，卡片內容依安全來源重新計算、順序與可見偏好在目前瀏覽器頁維持；同頁重新讀取亦維持；新開管理頁自動回到原有13卡預設。偏好不使用ScriptProperties、localStorage、cookies、Sheet、新GAS RPC或獨立網站：本輪**沒有跨頁或跨工作階段永久保存卡片排序**，不得宣稱此部分已完成持久化。
- `FAIL_CLOSED`：管理身分／正式關閉旗標無法核實、OWNER讀取失敗、B11管理範圍值不合法或B01資料結構異常時，原B01統計清空，新增排序／顯示控制也清空或停用，避免來源失效仍顯示舊成功卡片。任何卡片來源標籤重複或不一致時拒絕套用舊排序。13張卡的原資料計數與B09統計、B10來源版號、B11虛構設定操作均保持原有安全界線。
- `CODE_SCOPE`：只修改既有`gas/Study1Team.html`、`tests/study1-team-visitor-flow.test.cjs`、`scripts/study1-gas-backend-allowlist.cjs`；未修改GAS backend、REC、正式個資、補貼資料、正式文件、HTML新檔或原GAS部署ID。新增三個VM瀏覽器形狀合成資料測試：卡片排序／隱藏／重設並核對13項數字不變、同頁重載及E1/E2範圍繼承；跨兩個OWNER管理頁互不影響且訪客demo不受影響；無效scope／OWNER拒絕後清空卡片與控件並拒絕任何寫入。
- `SOURCE_PR=80`（已合併）／`SOURCE_COMMIT=deab5733db380df945b5a930d2fd4064b0d61e9c`。安全移植後PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42214502261` 及合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42214663314` 均成功，**554 PASS／0 FAIL**。此為自動化／虛構瀏覽器形狀測試，不代表真正OWNER在原部署頁面完成三輪UI驗收。
- `GAS_SYNC_VERIFIED=true`：沿用原GitHub同ID安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42214663436`，寫入前完整GAS HEAD與部署設定Drive備份ID `1C2dDFZ0WJY-QXIDJrW24gdvTwf1P0-Qv`；舊遠端HEAD SHA256 `a49c7a682de78cf1485f8c287da2afc85917dce2ff075d208e974e3d1c8357b8`、新HEAD SHA256 `972f7fa4b550a3d3d90b4fe7c11e40b6eae7eef61a8be9d72712567bf2539dd1`。同一原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` 與同一版本化`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 保留，**V74→V75**、`DEPLOYMENT_AFTER_UPDATE=75`、`SYNC_VERIFIED=true`，有效存取權仍`MYSELF`。原HEAD manifest的`ANYONE_ANONYMOUS`不等於現行`/exec`對外開放；備份只是程式與部署快照，**不是研究資料備份**。
- `SAFETY`：始終維持`OPEN=false`、`CONSENT_READY=false`、`MYSELF`及E2於2027年前不招募且不自動開放。無正式資料讀寫、核准目標、REC、PI／RA正式存取、研究補貼、真實通知、檔案下載或匯出。B01只有OWNER示範統計，代碼數不等於獨立真人參與者，行政進度不等於核准研究完成。
- `LAST_VERIFIED_STEP=PR #80 merged, main 554/554 CI, GAS V75 same-ID backup+SHA/effective MYSELF+deployment readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B01_INPAGE_LAYOUT_SYNTHETIC=true`、`B01_LAYOUT_PERSISTENCE=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：卡片偏好跨頁或跨工作階段的持久保存尚未建置／授權；正式研究目標與完成率、研究補貼數額與REC適用範圍、正式儲存provider、正式PI／RA權限及三輪真實UI驗收仍未完成。本輪按使用者指示不要求其人工驗收。
- `NEXT_ACTION`：下輪重讀最新main、正式規格、現有PR、排程與原GAS實際版本；可續建B01後台卡片偏好經授權持久化、B07不涉及REC金額的安全行政資料入口或B10/B12純合成來源一致性，但正式金額、個資、真正REC提供、簽署／匯出不得自動啟用。
- `WRITE_OWNER=GitHub main + original GAS same-ID backup/sync workflow`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 五十、B07虛構補貼行政準備與原GAS V76同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / B07 P2-02 synthetic pending-only administrative preparation`。本輪重新讀唯一GitHub正式main `8510c6d9eaa7b15048ddc60c8ca7c7ec810a0fc6`、正式規格§31–49及§16原B07適用需求、並行PR、原GAS V75完整工作流程與每小時排程 `6ae2e4049ac48191b4e5ae8972bf5cc3`（啟用、每小時、最後已核實執行時間2026-11-06T12:10:01Z）。原有B01/B02–B06/B08–B12已有不同程度的虛構流程；B07原站尚無入口。正式補貼金額／核准資格／憑證需依有效REC與權責來源核對，本輪**沒有核實或變更REC**，所以只實作最小可運作的非財務行政準備子集；不預填或推定金額、核准程序及已發放狀態。
- `COMPLETED`：原 `gas/Study1Team.html` 新增B07研究補貼行政準備入口與既有SIM虛構申請的列表，E1／E2／兩者唯讀篩選並受原B11全域可見範圍限制；OWNER可人工選擇 **`SOURCE_PENDING`（核准來源待核）、`DOCUMENTS_PENDING`（必要文件待核）、`PI_REVIEW_PENDING`（待PI人工查核）**，附固定原因種類 `SOURCE_CHECK`、`DOCUMENT_CHECK`、`PI_REVIEW_REQUEST`。這些狀態**全都未核准／未發放**；不是PI簽核，也不承諾正式資料項目、金額、資格、收據或付款程序。沒有未授權PI/RA角色、真人身分、自由輸入私人憑證、正式匯出或發放按鈕。
- `SOURCE_AND_STORAGE`：只在原 `STUDY1_UNIFIED_FIXTURE_V1` 的OWNER-only隔離TEST資料中加入可選 `b07:{reviews:{},history:[]}`；不存在時在舊資料**唯讀遷移**，不設新ScriptProperties key、平行Sheet／GAS或正式財務資料庫。B07每筆只對應既有 `SIM-###`，保存待核enum、OWNER與由原後端時鐘產生的ISO時間；近期變更歷程最多12筆，逐筆記原／新待核狀態與固定原因。**限量歷程不是永久不可竄改稽核鏈**；不宣稱現有B12已納入B07或有完整歷史。
- `OWNER_CAS_AND_FAIL_CLOSED`：原後端 `ADMIN_B07_REVIEW` 拒絕未知代碼、額外amount欄位、`PAID`／`APPROVED`／`DISBURSED`、非法原因及重複無變更操作，逐次驗證限量歷程與目前待核紀錄的一致性；原GAS`study1UnifiedPreviewCommand` 的OWNER驗證、`OPEN=false`、`CONSENT_READY=false`、ScriptLock、預期revision、請求去重、寫入後完整回讀及失敗復原全部保留。GUI僅在回應修訂版增加一次、來源狀態及最近歷程一致才顯示已保存；競寫／結果不確定時不重送舊命令，重新讀原OWNER來源；讀取也遭拒就清空與鎖定後台。舊資料無B07欄位時只讀補空結構，額外異常鍵、篡改核准狀態、錯誤代碼與斷裂歷程均拒絕正式展示。
- `CODE_SCOPE`：只改既有 `gas/Study1Unified.js`、`gas/Study1Team.html`、`scripts/study1-gas-backend-allowlist.cjs`、`tests/study1-unified.test.cjs`、`tests/study1-team-visitor-flow.test.cjs`。沒有更動其他GAS模組、原Script/部署ID、個資Sheet、REC原始資料、RIF刺激、研究預算或正式補貼設定。
- `SOURCE_PR=81`（已合併）／`SOURCE_COMMIT=f0d2e5a068bc70a9763f9fc8a0a18533bd67cff6`。PR首輪CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42217444432` 為 **559 PASS／2 FAIL**（原B01清除順序契約，以及舊fixture跨測試VM物件原型相容性）；已維持原安全校驗並修復，沒有略過測試。第二輪PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42217685039` 和合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42217950873` 均完整成功 **561 PASS／0 FAIL**。測試涵蓋B07只有待核enum、禁止財務／核准狀態／額外金額、重複request去重、原CAS競寫、舊TEST資料唯讀遷移、篡改來源拒絕、近期歷程上限、原站E1/E2篩選、OWNER雙頁競寫回讀及撤權清空。CI與VM形狀測試**不是**原OWNER實際瀏覽器三輪驗收。
- `GAS_SYNC_VERIFIED=true`：唯一原GitHub安全同步工作流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42217950721` 成功；原GAS完整程式及部署更新前已驗證私人Drive備份ID `1k8ckTxRBbupe20GpsczHr5IVo822f1r-`，更新前HEAD SHA256 `972f7fa4b550a3d3d90b4fe7c11e40b6eae7eef61a8be9d72712567bf2539dd1`，更新後HEAD SHA256 `7060df97a425654eb0087c77d14d1646585038a64589827ef3abbf0b5b200d3d`。保留原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、原 `/exec` 部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`；正式版本化部署**V75→V76**，完整回讀 `DEPLOYMENT_AFTER_UPDATE=76`、`SYNC_VERIFIED=true`，**有效部署權限`MYSELF`**，原未部署HEAD manifest為`ANYONE_ANONYMOUS`並不代表正式`/exec`已公開。備份只含GAS程式及部署快照，非正式研究補貼或真人資料備份。
- `SAFETY`：維持`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、實驗二2027年前不招募且不自動開放；沒有正式補貼核准金額、實際發放、財務憑證、個資、REC、正式PI/RA角色、通知寄送、電子同意、CSV/XLSX與匯出操作。B07可保存的只是OWNER虛構行政待核紀錄，絕不等於研究參與者有資格領取或已領取補貼。
- `LAST_VERIFIED_STEP=PR #81 merge + main 561/561 CI + same original GAS V76 backup/SHA/deployment/MYSELF full readback`。`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`B07_PENDING_ONLY_SYNTHETIC=true`、`B07_FORMAL_DISBURSEMENT=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：正式REC核准各實驗補貼金額／階段／資格與憑證、正式補貼交易稽核與重複給付防護、PI／RA真正身分驗證和撤權、正式資料來源及長期稽核保存尚未完成；目前不提供真實金流或已發放標記。按使用者指示本輪不要求人工驗收。
- `NEXT_ACTION`：新一輪先讀最新main、規格、所有並行PR、每小時排程及原GAS再接續；可進行B07與B01/B09/B12的OWNER-only待核狀態來源一致性檢查、純虛構不含金額的錯誤復原，或對其他高優先P1/P2無真人資料子功能做增量。正式補貼、REC與對外權限須另行核准後才能建置。
- `WRITE_OWNER=original GitHub main + same-ID original GAS safe-sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; FORMAL_COMPENSATION_AND_REAL_UI_BLOCKED`。

## 五十一、V06虛構預約最後確認與原GAS V77同ID完整回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / P1-08 V06`。本輪先讀原GitHub最新main、唯一正式規格第31–49節、其他並行PR、網站每小時排程與原GAS既有部署；確認B07 PR #81並行修改原後台、測試、backend及allowlist，故**不碰上述同批檔案**，改處理P1-08的V06訪客預約最後確認頁獨立缺口。第13節要求確認實驗、日期時間、參與方式、已驗證聯絡及同意，舊頁只顯示簡短文字與提交按鈕。使用者授權僅OWNER-only合成資料；本次未開放真人預約、真正電子郵件或REC同意。
- `COMPLETED`：在原 `gas/Study1Visitor.html` 的STEP 06既有V06頁面新增明確文字標籤的**研究名稱、臺灣場次日期、開始時間、虛構參與方式／地點、固定`demo.study1@example.invalid`示範信箱（不寄信）、僅虛構同意／非REC正式電子簽署**六欄唯讀最後確認摘要。所有值只由原有`study1UnifiedPreviewGet` OWNER-only TEST快照讀取，沒有輸入真人聯絡資訊。場次地點缺核准資訊時明示未核准，不自行創造正式活動或場地。
- `FAIL_CLOSED`：確認按鈕只在`mode=TEST`、`OPEN=false`、`CONSENT_READY=false`、原正式啟用受阻，且申請為E1/E2的`CONSENTED`、合格虛構角色、已記錄虛構閱覽與簽署、有效未過期hold、暫留同意版號與宣稱SHA等於同一份TEST policy、關聯時段在相同實驗下**唯一且存在**、臺灣日期格式及實際日期有效／在未來、原B02場次非取消非結案、研究顯示名稱有效時，才容許使用原有`CONFIRM`指令。失敗時將六個舊欄位全部替換為「無法核實」，停用確認。原GAS後端仍獨立執行ScriptLock、預期修訂版CAS、容量／暫留與同意及正式關閉閘門；此新增前端核查**不是正式身分驗證或REC核准**。
- `CODE_SCOPE`：僅變更原`gas/Study1Visitor.html`與既有`tests/study1-visitor-demo.test.cjs`，未動原GAS backend、權限、ScriptProperties、研究資料、V02–V05正式流程或任何B07原檔。新確認摘要使用普通DOM `textContent`，沒有新GAS RPC、正式PDF、網路請求、獨立訪客系統、正式簽署或資料匯出。已完成獨立訪客頁模擬測試：六欄來源、正確臺灣日期時間、同意版本與虛構電子郵件標示；過期／欠缺同意、錯誤實驗、重複場次、不可能日期、取消或結案場次、不安全正式旗標均拒絕；無來源時清空並停用最後確認。
- `CONCURRENCY`：原先基底`f0d2e5a068bc70a9763f9fc8a0a18533bd67cff6`已包含B07合併程式；並行B07文件同步在本輪PR #82建立前更新main為`20f7f250a0f2adeaba78ac97d5324b01990dedd4`，僅修改正式規格，故PR #82與當次main具可合併性並於合併前再次核對。未復用或合併過期草稿PR，B07第50節完整保留。
- `SOURCE_PR=82`（已合併）／`SOURCE_COMMIT=a0f08ac130ef88338856d46df5abb0b3d4c66ff8`；PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42218410185`及合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42218577952` 均成功，**564 PASS／0 FAIL**。這是自動化VM與靜態安全測試，並不表示OWNER真人瀏覽器三輪UI驗收、正式V05～V08全流程或正式招募已通過。
- `GAS_SYNC_VERIFIED=true`：沿用原同ID安全流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42218577768`，寫入前完整原GAS HEAD及部署私人Drive備份ID `1y0-h747-Im22btngz_s3K3EEIuksWSkY`，舊HEAD SHA256 `7060df97a425654eb0087c77d14d1646585038a64589827ef3abbf0b5b200d3d`，更新後完整HEAD SHA256 `91dfb24e99d6991f6569a2d15ba6da8e0156372a407b33afbb055520de4d4ded`。同一原Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`、同一原版本化`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s` 保留，**V76→V77**、`DEPLOYMENT_AFTER_UPDATE=77`、`SYNC_VERIFIED=true`；正式有效存取權仍`MYSELF`，HEAD測試manifest`ANYONE_ANONYMOUS`不是已部署`/exec`公開的證據。備份為程式及部署快照，**不是REC或研究資料備份**。
- `SAFETY`：持續`OPEN=false`、`CONSENT_READY=false`、`MYSELF`、E2在2027年前不招募且年份到達也不自動開放。沒有正式REC核准附件、參與者個資、真人信箱、電子簽署、真實名額、候補、正式審核、寄送或匯出；訪客頁仍限原OWNER在關閉網站下操作虛構狀態機。
- `LAST_VERIFIED_STEP=PR #82 merged, main 564/564 CI, original GAS V77 same-ID full SHA/deployment/MYSELF readback`。獨立狀態：`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`V06_TEST_CONFIRMATION_IMPLEMENTED=true`、`P1_V05_V08_FORMAL_READY=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：正式核准連絡信箱與安全驗證、REC文件原始位元組／同意、實際時段與研究活動適用性、正式候補、人工審核與安全郵件連結改期／取消、正式儲存provider及實際OWNER UI三輪驗收尚未完成；不能以這次虛構摘要冒稱P1-08整體完成。依使用者要求本輪不提出人工驗收。
- `NEXT_ACTION`：下輪重新查最新main、正式規格、並行PR、每小時排程與原GAS版本，可續做V05手機友善虛構時段檢視、V07未確定結果提示或B01/B09一致性，但任何正式預約、真人資料、REC同意或通知仍待另外授權與正式核對。
- `WRITE_OWNER=GitHub main + original GAS same-ID safe-sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。

## 五十二、V05手機友善虛構月份與場次選擇／原GAS V79同ID回讀（2026-11-06）

- `TASK_DOMAIN=Study1 recruitment website / P1-08 V05 calendar and slot picker`。本輪核對唯一原GitHub main、正式規格第13、31–51節、全部開放PR、每小時網站建置排程、原GAS版本化部署和安全同步紀錄。原V05只有單一虛構時段下拉選單，缺第13節要求之手機／電腦日期月曆、點日期後顯示時段及可核實場次資訊。本輪只授權OWNER-only TEST合成資料；未取得真人報名、REC文件、正式候補或對外開放授權。
- `COMPLETED`：在**原**`gas/Study1Visitor.html`的V05 STEP 04增量加入七欄月份／日期月曆、上／下個有可核實虛構時段月份導覽、至少44px手機觸控日期按鈕（小螢幕適配）、可用日期及選取狀態的具名`aria-label`／`aria-pressed`、當日可選虛構場次卡片、來源有提供時的活動標題、地點、結束時間與由原GAS計算的剩餘名額；未提供之資料明示缺來源，不自行推定正式時長或核准地點。原有`select#slot`保留給鍵盤／輔助科技，只顯示所選日期合格虛構時段；`HOLD`仍用原`study1UnifiedPreviewCommand`、原預期修訂版CAS和原後端名額安全檢查，不新增操作端點。
- `FAIL_CLOSED`：新的`v05Read_`只從同一原`study1UnifiedPreviewGet` OWNER-only TEST快照讀取，檢查`OPEN=false`、`CONSENT_READY=false`、`formalPorts.activated=false`、`VERIFIED`且合格的虛構申請、對應實驗`DEMO_OPEN`；逐時段核對安全ID且與E1/E2原實驗別一致、不重複、容量與剩餘值皆為合法整數、臺灣日期可解析且與原字串一致、未過期、`bookable`與B02未取消／未結案狀態一致。任何錯誤即清空日期及時段選擇、停用`HOLD`；若只是沒有可核實日期，明確提示證據不足，不把空白解釋成沒有報名者。按`HOLD`前重新核對同日及所選slot，正式後端鎖和重查仍是最後權威。
- `CONCURRENCY`：首輪V05 PR #84以`6eb931de1ee37581ae9959077642b1b4e88a4405`為基準，第一輪CI **566 PASS／1 FAIL** 揭露場次ID與實驗欄位跨E1/E2競爭時應拒絕而非略過；修正後**567 PASS／0 FAIL**。合併前另一個合法寫入者已將B07 PR #83併入main `625cd6e9a1ed8a0df0aa62051b5f698250b089de`，修改共同allowlist與後台，故**關閉PR #84未合併／未部署**。僅移植原V05訪客頁與訪客測試到B07最新版main，將V05安全白名單條目增量加入**最新B07 allowlist**，不覆寫任何B07原條款。新PR #85再次完整測試及競寫預檢才合併。
- `SOURCE_PR=85`（已合併）／`SOURCE_COMMIT=72a0c865b99ad628bae781d197bd55431005d317`；程式範圍僅原`gas/Study1Visitor.html`、原`tests/study1-visitor-demo.test.cjs`、原`scripts/study1-gas-backend-allowlist.cjs`。PR CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42221017195`及合併後main CI `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42221190961`均**574 PASS／0 FAIL**。測試涵蓋響應式月曆、日期切換、正常時段來源、跨實驗ID、無效日期、假造可用或名額、重複時段、取消場次、來源撤權清空、原跨頁操作不退化；這是模擬VM及靜態安全測試，**不代表實際原OWNER瀏覽器三輪UAT**。
- `GAS_SYNC_VERIFIED=true`：原同ID安全同步流程 `https://github.com/solactw-star/study1-recruitment-gas/actions/runs/42221191144`完成。原GAS完整程式HEAD及部署設定寫入前Drive備份ID `18P-35jqMgSd7o3x68owKlNzlsjPrHKCs`，原HEAD SHA256 `d6b123859dee2788075510767d4ac8d77ce322e20313bb96a6ca7cd723e0bd04`、更新後完整HEAD SHA256 `abadcdee82328248e063c2ea6edb87bf32998d0d21bd3481fd9a6939eb2ed128`。同一原GAS Script ID `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z`和同一原版本化`/exec`部署ID `AKfycbyUTQfNBld79rhs3JfNk6j8ZloVOviyVJCV89KAUYlRUi28pN9D7i9XjPRgXTazS4s`保留，**V78→V79**，回讀`DEPLOYMENT_AFTER_UPDATE=79`、`SYNC_VERIFIED=true`，有效部署權限仍`MYSELF`。未部署HEAD manifest記載`ANYONE_ANONYMOUS`不代表原版本化部署對外公開；備份是程式與部署快照，非研究資料備份。
- `SAFETY`：`OPEN=false`、`CONSENT_READY=false`、有效版本化部署`MYSELF`；E2 2027年前不招募，年份到達亦不會自動開放。沒有真人聯絡方式、REC正式電子同意、正式資料寫入、實際名額保留、候補、寄信、研究補貼付款、PDF核准或匯出。B07同輪增加之TEST行政流程維持原安全限制。
- `LAST_VERIFIED_STEP=PR #85 merged + main 574/574 CI + original GAS V79 same-ID backup/HEAD SHA/deployment/MYSELF readback`；`MAIN_SYNC_VERIFIED=true`、`GAS_SYNC_VERIFIED=true`、`V05_SYNTHETIC_MOBILE_CALENDAR_IMPLEMENTED=true`、`P1_V05_V08_FORMAL_READY=false`、`SELF_UI_3PASS=NOT_VERIFIED`、`PRODUCTION_STORAGE_CONNECTED=false`、`FORMAL_READY=false`。
- `BLOCKERS`：V05僅展示來源已存在的虛構時段，尚無正式研究活動／場地／完整時長核准、對外預約、真人信箱、正式REC同意、候補與人工審核、V08安全電子郵件連結，以及實際原OWNER操作UAT；不得將本輪UI建置視為P1-08全模組或正式研究完成。並行B07最新規格版本仍須依當次main正式檔另行追蹤。
- `NEXT_ACTION`：下輪先讀最新GitHub main、正式規格、並行PR／排程及原GAS，再依權責補強V07合成狀態不確定提示、V05跨月份操作回歸或其它P1/P2純TEST缺口。不接收或匯出真人資料、不開放正式研究；依使用者指示不要求本輪人工驗收。
- `WRITE_OWNER=GitHub main + same-original-ID GAS safe-sync`；`SYNC_STATUS=MAIN_SYNC_VERIFIED + GAS_SYNC_VERIFIED; REAL_UI_AND_FORMAL_DATA_BLOCKED`。
