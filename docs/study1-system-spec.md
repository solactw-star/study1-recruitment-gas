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
