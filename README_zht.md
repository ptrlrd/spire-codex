<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex 標誌" width="200" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README_deu.md">Deutsch</a> ·
  <a href="README_esp.md">Español (ES)</a> ·
  <a href="README_fra.md">Français</a> ·
  <a href="README_ita.md">Italiano</a> ·
  <a href="README_jpn.md">日本語</a> ·
  <a href="README_kor.md">한국어</a> ·
  <a href="README_pol.md">Polski</a> ·
  <a href="README_ptb.md">Português (BR)</a> ·
  <a href="README_rus.md">Русский</a> ·
  <a href="README_spa.md">Español (LA)</a> ·
  <a href="README_tha.md">ไทย</a> ·
  <a href="README_tur.md">Türkçe</a> ·
  <a href="README_zhs.md">简体中文</a> ·
  <a href="README_zht.md">繁體中文</a>
</p>

# Spire Codex

一個全面的 **Slay the Spire 2** 遊戲資料庫與 API，透過逆向工程遊戲檔案建置。支援遊戲隨附的全部 **15 種語言**。

**線上網站**：[spire-codex.com](https://spire-codex.com)

**Steam App ID**：2868840

## 建置方式

Slay the Spire 2 使用 Godot 4 建置，但所有遊戲邏輯都位於 C#/.NET 8 DLL（`sts2.dll`）中，而非 GDScript。資料處理管線如下：

1. **PCK 擷取** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) 會擷取 Godot `.pck` 檔案，以復原圖片、Spine 動畫與本地化資料（約 9,947 個檔案）。

2. **DLL 反編譯** - [ILSpy](https://github.com/icsharpcode/ILSpy) 將 `sts2.dll` 反編譯為約 3,300 個可讀的 C# 原始碼檔案，其中包含所有遊戲模型。

3. **資料剖析** - 22 個以 Python 正規表示式為基礎的剖析器，從反編譯後的 C# 原始碼擷取結構化資料，並將各語言 JSON 輸出至 `data/{lang}/`：
   - **卡牌**：`base(cost, CardType, CardRarity, TargetType)` 建構函式，以及統計值所用的 `DamageVar`、`BlockVar`、`PowerVar<T>`
   - **角色**：`StartingHp`、`StartingGold`、`MaxEnergy`、`StartingDeck`、`StartingRelics`
   - **遺物／藥水**：從 SmartFormat 範本解析的稀有度、池與說明
   - **怪物**：HP 範圍、透過 `AscensionHelper` 進行的進階模式縮放、包含各招式意圖（Attack/Defend/Buff/Debuff/Status/Summon/Heal）的招式狀態機、傷害值、多段命中次數（包括 AscensionHelper 模式）、來自 `AfterAddedToRoom` 的固有能力（42 隻怪物含進階模式變體）、每個招式套用的能力（來自 `PowerCmd.Apply<T>` 的目標與數值）、格擋、治療、遭遇情境（章節、房間類型），以及從 `GenerateMoveStateMachine()` 剖析的**攻擊模式**（112 隻怪物--循環、隨機、條件式、混合）
   - **附魔**：卡牌類型限制、可否堆疊、基於 Amount 的縮放
   - **遭遇**：怪物組成、房間類型（Boss/Elite/Monster）、章節位置、標籤
   - **事件**：多頁決策樹（66 個事件中的 56 個）、含結果的選項、章節位置、解析為顯示名稱的 `StringVar` 模型參照、執行階段計算值（透過 `GetDecipherCost()` 遞增的費用、透過含 `NextInt`／`NextFloat` 的 `CalculateVars` 計算的金幣範圍、完全治療模式），以及來自 `IsAllowed()` 的**前置條件**（25 個事件--金幣、HP、章節、牌組、遺物、藥水條件）
   - **遠古者**：8 位 Ancient NPC，包含稱號、角色專屬對話、遺物提議與肖像圖示
   - **能力**：PowerType（Buff/Debuff）、PowerStackType（Counter/Single）、DynamicVars、說明
   - **紀元／故事**：含解鎖需求的時間軸進度資料
   - **充能球**：被動／激發數值、說明
   - **苦難**：可否堆疊、額外卡牌文字、說明
   - **修改器**：遊玩修改器說明
   - **關鍵字**：卡牌關鍵字定義（Exhaust、Ethereal、Innate 等）
   - **意圖**：含圖示的怪物意圖說明
   - **成就**：解鎖條件、說明、分類、角色關聯，以及來自 C# 原始碼的門檻值（33 項成就）
   - **章節**：Boss 發現順序、遭遇、事件、遠古者、房間數量
   - **進階模式等級**：11 個等級（0–10），說明來自本地化資料
   - **藥水池**：從池類別與紀元參照剖析的角色專屬池
   - **翻譯**：供前端使用的各語言篩選對照表（卡牌類型、稀有度、關鍵字 → 本地化名稱）與 UI 字串（區段標題、說明、角色名稱）

4. **說明解析** - 共用的 `description_resolver.py` 模組會將 SmartFormat 本地化範本（`{Damage:diff()}`、`{Energy:energyIcons()}`、`{Cards:plural:card|cards}`）解析為易讀文字，並保留供前端呈現的富文字標記。執行階段動態變數（例如 `{Card}`、`{Relic}`）會保留為可讀的預留位置。事件中的 `StringVar` 參照（例如 `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`）會透過本地化查詢解析為顯示名稱。

5. **Spine 算繪** - 角色與怪物是 Spine 骨架動畫，而非靜態圖片。無頭 Node.js 算繪器會將待機姿勢組合成 512×512 肖像 PNG。全部 111 隻怪物都有圖片：100 隻由 Spine 骨架算繪、6 隻使用共用骨架別名（Flyconid→flying_mushrooms、Ovicopter→egg_layer、Crusher/Rocket→kaiser_crab），另有 5 隻使用靜態遊戲素材（Doormaker）。此外也會算繪全部 5 名角色（戰鬥、休息處、角色選擇姿勢）、NPC 與背景。以外觀為基礎的變體（Cultists、Bowlbugs、Cubex）會個別算繪。請參閱下方的 [Spine 算繪器](#spine-算繪器)。

6. **圖片** - 從遊戲素材擷取卡牌肖像、遺物／藥水圖示、角色美術、怪物圖像、Ancient 肖像圖示與 Boss 遭遇圖示，並以靜態檔案提供。

7. **變更記錄差異比較** - 差異工具會比較遊戲版本之間的 JSON 資料（透過 git refs 或目錄），追蹤各分類新增／移除／變更的實體，並提供欄位層級差異。變更記錄以 Steam 遊戲版本加上選用的 Codex 修訂編號為鍵值。

## 專案結構

```
spire-codex/
├── backend/                    # FastAPI 後端
│   ├── app/
│   │   ├── main.py             # 應用程式進入點、CORS、GZip、速率限制、靜態檔案
│   │   ├── dependencies.py     # 共用相依項目（語言驗證、語言名稱）
│   │   ├── routers/            # API 端點（25 個以上路由器）
│   │   ├── models/schemas.py   # Pydantic 模型
│   │   ├── services/           # JSON 資料載入（LRU 快取、支援 14 種語言）
│   │   └── parsers/            # C# 原始碼 → JSON 剖析器
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # 關鍵字、意圖、充能球、苦難、修改器、成就（含解鎖條件）
│   │       ├── guide_parser.py          # 含 YAML frontmatter 的 Markdown 指南
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # 將角色池加入藥水
│   │       ├── translation_parser.py    # 為每種語言產生 translations.json
│   │       ├── description_resolver.py   # 共用 SmartFormat 解析器
│   │       ├── parser_paths.py           # 共用路徑設定（測試版可由環境變數覆寫）
│   │       └── parse_all.py              # 協調所有剖析器（15 種語言）
│   ├── static/images/          # 遊戲圖片（未提交）
│   ├── scripts/copy_images.py  # 將圖片從擷取目錄複製至 static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext、BetaVersionContext
│   │   ├── components/         # CardGrid、RichDescription、SearchFilter、
│   │   │                       #   GlobalSearch、Navbar、Footer、LanguageSelector、VersionSelector
│   │   └── ...                 # 頁面：cards、characters、relics、monsters、potions、
│   │                           #   enchantments、encounters、events、powers、timeline、
│   │                           #   reference、images、changelog、about、merchant、compare、
│   │                           #   mechanics/[slug]、guides/[slug]、guides/submit、
│   │                           #   leaderboards、leaderboards/submit、leaderboards/stats、
│   │                           #   runs/[hash]（共用遊玩檢視）
│   │                           #   詳細資料頁：cards/[id]、characters/[id]、relics/[id]、
│   │                           #   monsters/[id]、potions/[id]、enchantments/[id]、
│   │                           #   encounters/[id]、events/[id]、powers/[id]、keywords/[id]、
│   │                           #   acts/[id]、ascensions/[id]、intents/[id]、orbs/[id]、
│   │                           #   afflictions/[id]、modifiers/[id]、achievements/[id]
│   │                           #   i18n：[lang]/... 為 14 種非英語語言鏡像所有路由
│   ├── lib/
│   │   ├── api.ts              # API 用戶端 + TypeScript 介面
│   │   ├── fetch-cache.ts      # 用戶端記憶體內 fetch 快取（5 分鐘 TTL）
│   │   ├── seo.ts              # 共用 SEO 公用程式（stripTags、SITE_URL、SITE_NAME）
│   │   ├── jsonld.ts           # JSON-LD 結構描述建構器（BreadcrumbList、CollectionPage、Article、WebSite、FAQPage）
│   │   ├── ui-translations.ts # 14 種非英語語言的 UI 字串翻譯
│   │   ├── languages.ts       # i18n 設定--14 個語言代碼、hreflang 對應
│   │   └── use-lang-prefix.ts # 建構語言感知 URL 的 Hook
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # 無頭 Spine 骨架算繪器
│   │   ├── render_webgl.mjs     # WebGL 算繪器（單一骨架）--無接縫瑕疵
│   │   ├── render_all_webgl.mjs # WebGL 批次算繪器（所有 .skel 檔案）
│   │   ├── render_gif.mjs      # 動畫算繪器（支援外觀與動畫的 WebP/GIF/APNG）
│   │   ├── render.mjs           # 舊版 canvas 算繪器（有三角形接縫）
│   │   ├── render_all.mjs       # 舊版 canvas 批次算繪器
│   │   ├── render_skins2.mjs    # 外觀變體算繪器
│   │   ├── render_utils.mjs     # 共用 canvas 算繪公用程式
│   │   └── package.json
│   ├── diff_data.py            # 變更記錄差異產生器
│   ├── update.py               # 跨平台更新管線
│   └── deploy.py               # 本機 Docker 建置並推送至 Docker Hub
├── data/                       # 已剖析的 JSON 資料檔案
│   ├── {lang}/                 # 各語言目錄（eng、kor、jpn、fra 等）
│   ├── changelogs/             # 變更記錄 JSON 檔案（以遊戲版本為鍵值）
│   ├── guides/                 # 含 YAML frontmatter 的 Markdown 指南檔案
│   ├── guides.json             # 已剖析的指南資料
│   ├── runs/                   # 已提交的遊玩 JSON 檔案（依玩家雜湊）
│   └── runs.db                 # 舊版 SQLite（已由 MongoDB 取代；保留作為離線備援）
├── extraction/                 # 原始遊戲檔案（未提交）
│   ├── raw/                    # GDRE 擷取的 Godot 專案（穩定版）
│   ├── decompiled/             # ILSpy 輸出（穩定版）
│   └── beta/                   # Steam 測試分支（raw/ + decompiled/）
├── data-beta/                  # 已剖析的測試版資料（版本化：v0.102.0/、v0.103.0/、latest → 符號連結）
├── docker-compose.yml          # 本機開發
├── docker-compose.prod.yml     # 正式環境
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI：lint、型別檢查、祕密掃描、Docker 建置＋推送、SSH 部署
└── .forgejo/workflows/
    └── build.yml               # 保留的 Forgejo CI 備援（以 buildah 為基礎，未啟用）
```

## 公開服務

| 主機 | 用途 |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | 公開網站與同源 API。啟用中的測試頻道位於 `/beta`。 |
| `cdn.spire-codex.com` | 用於遊戲美術、完整卡牌算繪、本地化算繪與封存測試版素材的 Cloudflare R2 物件主機。 |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon 登陸頁面與經 Discord 驗證的工作人員儀表板。機器人使用主要 Codex API。 |
| `analytics.spire-codex.com` | 自架的 Umami 指令碼與儀表板。其 PostgreSQL 資料庫位於私人 Docker 網路上。 |
| `tierlists.spire-codex.com` | 用於產生分級榜預覽圖片的專用 R2 物件主機。 |
| `beta.spire-codex.com` | 已停用的公開主機。Cloudflare 會將請求重新導向至頂層網域上的相同路徑。 |

CDN 與分級榜主機是物件儲存區，而非可瀏覽的網站，因此在任一根路徑看到 `404` 都是預期行為。

## 網站頁面

| 頁面 | 路由 | 說明 |
|---|---|---|
| 首頁 | `/` | 包含實體數量、分類卡片與角色連結的儀表板 |
| 卡牌 | `/cards` | 可篩選的卡牌網格，附對話框詳細資料檢視 |
| 卡牌詳細資料 | `/cards/[id]` | 完整卡牌統計、升級資訊、圖片 |
| 角色 | `/characters` | 角色概覽網格 |
| 角色詳細資料 | `/characters/[id]` | 統計、起始牌組／遺物、引言、NPC 對話樹 |
| 遺物 | `/relics` | 可篩選的遺物網格 |
| 遺物詳細資料 | `/relics/[id]` | 含富文字風味文字的完整遺物資訊 |
| 怪物 | `/monsters` | 含 HP、招式與 Spine 算繪的怪物網格 |
| 怪物詳細資料 | `/monsters/[id]` | HP、含意圖／傷害／能力／格擋的招式、遭遇連結、能力工具提示 |
| 藥水 | `/potions` | 可篩選的藥水網格（稀有度、角色池） |
| 藥水詳細資料 | `/potions/[id]` | 完整藥水資訊 |
| 附魔 | `/enchantments` | 含卡牌類型篩選器的附魔清單 |
| 附魔詳細資料 | `/enchantments/[id]` | 完整附魔資訊 |
| 遭遇 | `/encounters` | 依章節／房間類型排列的遭遇組成 |
| 遭遇詳細資料 | `/encounters/[id]` | 怪物陣容、房間類型、標籤 |
| 事件 | `/events` | 含可展開選項的多頁事件樹 |
| 事件詳細資料 | `/events/[id]` | 完整事件頁面、選項、Ancient 對話 |
| 能力 | `/powers` | 增益、減益與中立能力 |
| 能力詳細資料 | `/powers/[id]` | 能力資訊，以及會套用此能力的卡牌 |
| 關鍵字 | `/keywords` | 卡牌關鍵字清單 |
| 關鍵字詳細資料 | `/keywords/[id]` | 關鍵字說明與可篩選的卡牌網格 |
| 商人 | `/merchant` | 卡牌／遺物／藥水定價、移除卡牌費用、假商人 |
| 比較 | `/compare` | 角色比較中心（10 組配對） |
| 比較詳細資料 | `/compare/[pair]` | 並排角色比較 |
| 開發人員 | `/developers` | API 文件、小工具文件、資料匯出 |
| 展示 | `/showcase` | 社群專案展示區 |
| 時間軸 | `/timeline` | 依時代分組的紀元進度與解鎖需求 |
| 章節詳細資料 | `/acts/[id]` | 某章節的 Boss、遭遇、事件、遠古者 |
| 進階模式詳細資料 | `/ascensions/[id]` | 進階模式等級說明，附上一個／下一個導覽 |
| 意圖詳細資料 | `/intents/[id]` | 意圖圖示、說明 |
| 充能球詳細資料 | `/orbs/[id]` | 充能球圖示、被動／激發說明 |
| 苦難詳細資料 | `/afflictions/[id]` | 苦難說明、可否堆疊 |
| 修改器詳細資料 | `/modifiers/[id]` | 遊玩修改器說明 |
| 成就詳細資料 | `/achievements/[id]` | 成就說明 |
| 徽章 | `/badges` | 全部 25 個遊玩結束徽章，依分級／單一階級／僅限多人遊戲分組 |
| 徽章詳細資料 | `/badges/[id]` | 各階級細目（Bronze / Silver / Gold）、勝利必要條件與多人遊戲旗標、圖示 |
| 機制 | `/mechanics` | 遊戲機制中心--27 個可點擊區段，各自具有 SEO 頁面 |
| 機制詳細資料 | `/mechanics/[slug]` | 卡牌機率、遺物分布、藥水掉落、地圖產生、Boss 池、戰鬥、祕密與冷知識 |
| 指南 | `/guides` | 含搜尋／篩選功能的社群策略指南 |
| 指南詳細資料 | `/guides/[slug]` | 完整指南，含 Markdown 算繪與工具提示小工具 |
| 提交指南 | `/guides/submit` | 指南提交表單（Discord webhook） |
| 排行榜 | `/leaderboards` | 最快勝利與最高進階模式榜單，提供單人／合作與遊戲模式篩選器（standard / daily / Today / custom）。所有篩選狀態都位於 URL 中，因此任何檢視都可分享 |
| 瀏覽遊玩紀錄 | `/runs` | 完整遊玩瀏覽器，含運算式搜尋列（`user:`、`char:`、`asc:` 範圍、`card:`／`relic:` 多值 AND、`version:` 範圍、`mode:`、`result:`、`players:`）、下拉式篩選器、排序及可分享 URL |
| 提交遊玩紀錄 | `/leaderboards/submit` | 拖放 `.run` 上傳，附 Overwolf 伴隨應用程式連結、Steam／Discord 登入以自動關聯遊玩紀錄，以及近期遊玩紀錄 |
| 統計 | `/leaderboards/stats` | 卡牌、遺物、藥水與遭遇的排名表（選取率、勝率、次數）。可依角色／進階模式／結果篩選 |
| 個人檔案 | `/profile` | 已登入使用者的統計（常用卡牌／遺物／藥水、角色細目）、個人最佳紀錄、競爭比較（今日每日排行榜、全球排名、相對社群勝率）與遊玩紀錄管理 |
| 設定 | `/settings` | 帳戶設定：使用者名稱、電子郵件、已連結的 Steam／Discord |
| 共用遊玩紀錄 | `/runs/[hash]` | 遊戲內風格的勝利／失敗摘要，含可點擊的地圖節點圖示、遺物列與迷你卡牌網格 |
| 參考資料 | `/reference` | 所有項目皆可點擊--章節、進階模式、關鍵字、充能球、苦難、意圖、修改器、成就 |
| 圖片 | `/images` | 可瀏覽的遊戲素材，各分類可下載 ZIP |
| 變更記錄 | `/changelog` | 遊戲更新之間的資料差異 |
| 關於 | `/about` | 專案資訊、統計、管線視覺化 |
| 感謝 | `/thank-you` | Ko-fi 支持者與社群貢獻者（從「關於」分離，以便直接連結此頁面） |
| Knowledge Demon | `/knowledge-demon` | Discord 機器人的資訊頁面--斜線指令、管理功能、安裝行動呼籲 |
| 新聞 | `/news` | 鏡像的 Steam 公告摘要；標準連結會返回 Steam，因此是補充而非重複內容 |
| 新聞文章 | `/news/[gid]` | 單篇 Steam 公告，含清理過的 BBCode 本文與 `NewsArticle` JSON-LD |
| 分級榜 | `/tier-list` | 卡牌／遺物／藥水的 Codex Score 分級榜中心（S → F 階級） |
| 分級榜詳細資料 | `/tier-list/[type]` | 單一實體類型的視覺化 S/A/B/C/D/F 列，資料來源為 `/api/runs/scores/{type}` |
| 評分 | `/leaderboards/scoring` | Codex Score 方法頁面--貝葉斯收縮、先驗權重、量表範圍、階級分界 |

## API 端點

所有資料端點都接受選用的 `?lang=` 查詢參數（預設：`eng`）。回應會經過 **GZip 壓縮**，並以 `Cache-Control: public, max-age=300` 快取。

| 端點 | 說明 | 篩選器 |
|---|---|---|
| `GET /api/cards` | 所有卡牌 | `color`、`type`、`rarity`、`keyword`、`search`、`lang` |
| `GET /api/cards/{id}` | 單張卡牌 | `lang` |
| `GET /api/characters` | 所有角色 | `search`、`lang` |
| `GET /api/characters/{id}` | 單一角色（含引言、對話） | `lang` |
| `GET /api/relics` | 所有遺物 | `rarity`、`pool`、`search`、`lang` |
| `GET /api/relics/{id}` | 單一遺物 | `lang` |
| `GET /api/monsters` | 所有怪物 | `type`、`search`、`lang` |
| `GET /api/monsters/{id}` | 單一怪物 | `lang` |
| `GET /api/potions` | 所有藥水 | `rarity`、`pool`、`search`、`lang` |
| `GET /api/potions/{id}` | 單一藥水 | `lang` |
| `GET /api/enchantments` | 所有附魔 | `card_type`、`search`、`lang` |
| `GET /api/enchantments/{id}` | 單一附魔 | `lang` |
| `GET /api/encounters` | 所有遭遇 | `room_type`、`act`、`search`、`lang` |
| `GET /api/encounters/{id}` | 單一遭遇 | `lang` |
| `GET /api/events` | 所有事件 | `type`、`act`、`search`、`lang` |
| `GET /api/events/{id}` | 單一事件 | `lang` |
| `GET /api/powers` | 所有能力 | `type`、`stack_type`、`search`、`lang` |
| `GET /api/powers/{id}` | 單一能力 | `lang` |
| `GET /api/keywords` | 卡牌關鍵字定義 | `lang` |
| `GET /api/keywords/{id}` | 單一關鍵字 | `lang` |
| `GET /api/intents` | 怪物意圖類型 | `lang` |
| `GET /api/intents/{id}` | 單一意圖 | `lang` |
| `GET /api/orbs` | 所有充能球 | `lang` |
| `GET /api/orbs/{id}` | 單一充能球 | `lang` |
| `GET /api/afflictions` | 卡牌苦難 | `lang` |
| `GET /api/afflictions/{id}` | 單一苦難 | `lang` |
| `GET /api/modifiers` | 遊玩修改器 | `lang` |
| `GET /api/modifiers/{id}` | 單一修改器 | `lang` |
| `GET /api/achievements` | 所有成就 | `lang` |
| `GET /api/achievements/{id}` | 單一成就 | `lang` |
| `GET /api/badges` | 所有遊玩結束徽章 | `tiered`、`multiplayer_only`、`requires_win`、`search`、`lang` |
| `GET /api/badges/{id}` | 含階級細目的單一徽章 | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | 個別實體的版本歷程（不區分大小寫、最新優先） | - |
| `GET /api/epochs` | 時間軸紀元 | `era`、`search`、`lang` |
| `GET /api/epochs/{id}` | 單一紀元 | `lang` |
| `GET /api/stories` | 故事項目 | `lang` |
| `GET /api/stories/{id}` | 單一故事 | `lang` |
| `GET /api/acts` | 所有章節 | `lang` |
| `GET /api/acts/{id}` | 單一章節 | `lang` |
| `GET /api/ascensions` | 進階模式等級（0–10） | `lang` |
| `GET /api/ascensions/{id}` | 單一進階模式等級 | `lang` |
| `GET /api/stats` | 所有分類的實體數量 | `lang` |
| `GET /api/languages` | 含顯示名稱的可用語言 | - |
| `GET /api/translations` | 篩選值與 UI 字串的翻譯對照表 | `lang` |
| `GET /api/images` | 含檔案清單的圖片分類。測試版前綴分類接受 `?version=`。 | - |
| `GET /api/images/beta/versions` | 可用的測試版圖片封存版本與 `latest` 符號連結目標 | - |
| `GET /api/images/{category}/download` | 圖片分類的 ZIP 下載。測試版分類接受 `?version=`。 | - |
| `GET /api/changelogs` | 變更記錄摘要（所有版本） | - |
| `GET /api/changelogs/{tag}` | 某版本標籤的完整變更記錄 | - |
| `GET /api/guides` | 社群指南 | `category`、`difficulty`、`tag`、`search` |
| `GET /api/guides/{slug}` | 單一指南（含 Markdown 內容） | - |
| `POST /api/guides` | 提交指南（代理至 Discord） | - |
| `POST /api/runs` | 提交遊玩紀錄（.run 檔案 JSON） | `username` |
| `GET /api/runs/list` | 列出／瀏覽已提交的遊玩紀錄 | `character`、`win`、`username`、`seed`、`build_id`、`build_ids`、`players`、`game_mode`、`ascension`、`ascension_min`、`ascension_max`、`card`、`relic`、`today`、`sort`、`page`、`limit` |
| `GET /api/runs/shared/{hash}` | 依雜湊取得完整遊玩資料（合併資料庫中的 `username`） | - |
| `GET /api/runs/stats` | 彙總社群統計 | `character`、`win`、`ascension`、`game_mode`、`players` |
| `GET /api/runs/leaderboard` | 僅限勝利的排名排行榜 | `category`（`fastest`、`highest_ascension`）、`character`、`players`、`game_mode`、`today`、`page`、`limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | 單一勝利遊玩紀錄在其榜單中的排名 | `category` |
| `GET /api/runs/scores/{type}` | 各實體的 Codex Score（經貝葉斯收縮的勝率分數與 S/A/B/C/D/F 階級） | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | 各遭遇彙總（出現次數、致死率、平均傷害／回合數） | `act`、`room_type`、`multiplayer`、`page`、`limit` |
| `POST /api/runs/claim` | 依雜湊將使用者名稱附加至先前提交的遊玩紀錄 | - |
| `GET /api/runs/versions` | 已提交遊玩紀錄中的不同遊戲版本 | - |
| `GET /api/exports/{lang}` | 單一語言所有實體 JSON 的 ZIP | `lang` |
| `GET /api/news` | Steam 公告與社群新聞（本機封存） | `feed_type`、`feedname`、`tag`、`since`、`search`、`limit`、`offset` |
| `GET /api/news/{gid}` | 單篇新聞文章（原始 HTML／BBCode 本文） | - |
| `GET /api/merchant/config` | 自動擷取的商人定價設定 | - |
| `POST /api/feedback` | 提交意見回饋（代理至 Discord） | - |
| `GET /api/versions` | 由目前使用中資料根目錄公開的版本中繼資料 | - |

**使用者帳戶**（Cookie/JWT 工作階段；使用 Steam 或 Discord 登入）：

| 端點 | 說明 |
|---|---|
| `GET /api/auth/me` | 目前已登入的使用者 |
| `GET /api/auth/steam/redirect` | 開始 Steam OpenID 登入 |
| `GET /api/auth/discord/start` | 開始 Discord OAuth 登入 |
| `POST /api/auth/logout` | 清除工作階段 Cookie |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | 更新個人檔案欄位 |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | 列出、上傳及移除使用者的遊玩紀錄 |
| `GET /api/auth/stats` | 各使用者彙總統計（個人檔案頁面） |
| `GET /api/auth/personal-bests` | 最快單人／合作、最高進階模式、今日與歷來每日紀錄 |
| `GET /api/auth/competitive` | 今日每日排行榜、全球排名、相對社群勝率 |

每個 IP 的速率限制為**每分鐘 60 個請求**。每個 IP 的意見回饋與指南提交限制為**每分鐘 3–5 次**。互動式文件位於 `/docs`（Swagger UI）。

### 本地化

所有遊戲資料皆使用 Slay the Spire 2 自身的本地化檔案，以 15 種語言提供。將 `?lang=` 傳遞至任何資料端點。使用 `?channel=beta` 取得目前啟用的公開測試版資料；封存的測試版圖片集則使用 `?version=`。

| 代碼 | 語言 | 代碼 | 語言 |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**已本地化的內容**：來自遊戲的實體名稱與說明、卡牌類型、稀有度、關鍵字、能力、遭遇、角色名稱、區段標題、本地化路由，以及大多數共用 UI 標籤。

**維持英文的內容**：API 識別碼與結構性篩選值，例如 `room_type`、能力的 `type`／`stack_type` 與 `pool`，以及產品品牌和部分編輯或社群撰寫的內容。

無論語言為何，篩選參數（`type=Attack`、`rarity=Rare`、`keyword=Exhaust`）一律使用英文值--後端會在比對前將其翻譯為本地化對應值。

範例：`GET /api/cards?lang=kor&type=Attack` 會傳回類型為「공격」的韓文卡牌資料；即使參數是英文，仍會正確篩選。

### 富文字格式

文字欄位（`description`、`loss_text`、`flavor`、對話 `text`、選項 `title`／`description`）可能包含從遊戲本地化資料保留的 Godot BBCode 風格標籤：

| 標籤 | 類型 | 範例 | 算繪為 |
|---|---|---|---|
| `[gold]...[/gold]` | 顏色 | `[gold]Enchant[/gold]` | 金色文字 |
| `[red]...[/red]` | 顏色 | `[red]blood[/red]` | 紅色文字 |
| `[blue]...[/blue]` | 顏色 | `[blue]2[/blue]` | 藍色文字 |
| `[green]...[/green]` | 顏色 | `[green]healed[/green]` | 綠色文字 |
| `[purple]...[/purple]` | 顏色 | `[purple]Sharp[/purple]` | 紫色文字 |
| `[orange]...[/orange]` | 顏色 | `[orange]hulking figure[/orange]` | 橙色文字 |
| `[pink]...[/pink]` | 顏色 | - | 粉紅色文字 |
| `[aqua]...[/aqua]` | 顏色 | `[aqua]Ascending Spirit[/aqua]` | 青色文字 |
| `[sine]...[/sine]` | 效果 | `[sine]swirling vortex[/sine]` | 波浪動畫文字 |
| `[jitter]...[/jitter]` | 效果 | `[jitter]CLANG![/jitter]` | 抖動動畫文字 |
| `[b]...[/b]` | 效果 | `[b]bold text[/b]` | 粗體文字 |
| `[i]...[/i]` | 效果 | `[i]whispers[/i]` | 斜體文字 |
| `[energy:N]` | 圖示 | `[energy:2]` | 能量圖示 |
| `[star:N]` | 圖示 | `[star:1]` | 星星圖示 |
| `[Card]`, `[Relic]` | 預留位置 | `[Card]` | 執行階段動態內容（斜體） |

標籤可以巢狀使用：`[b][jitter]CLANG![/jitter][/b]`、`[gold][sine]swirling vortex[/sine][/gold]`。

若直接使用 API，可使用類似 `\[/?[a-z]+(?::\d+)?\]` 的正規表示式移除這些標籤，或在自己的前端中算繪。`description_raw` 欄位（若有）包含尚未解析的 SmartFormat 範本。

## 在本機執行

### 先決條件

- Python 3.10+
- Node.js 20+

### 後端

```bash
python -m venv venv
source venv/bin/activate      # Windows：venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

後端執行於 **http://localhost:8000**。

### 前端

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

前端執行於 **http://localhost:3000**。

### Docker

```bash
docker compose up --build
```

啟動兩項服務（後端位於 8000，前端位於 3000）。

### 環境變數

核心唯讀 API 不需要任何設定。下列選用功能會由環境變數啟用（設定於後端環境或 compose 檔案中）：

| 變數 | 使用者 | 備註 |
|---|---|---|
| `MONGO_URL` | 後端 | 遊玩紀錄資料庫（社群統計、排行榜、帳戶）。未設定時，後端會退回使用舊版 SQLite 路徑（`data/runs.db`）。 |
| `JWT_SECRET` | 後端 | 簽署使用者帳戶工作階段權杖。 |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | 後端 | Discord OAuth 登入。 |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | 後端 | OAuth 重新導向／返回 URL。 |
| `ENVIRONMENT` | 後端 | `production` 會切換安全 Cookie 行為。 |
| `NEXT_PUBLIC_API_URL` | 前端（建置） | API 基底；正式環境中為空，使圖片／資料以同源方式解析。 |
| `NEXT_PUBLIC_CDN_URL` | 前端（建置） | 設定時（例如 `https://cdn.spire-codex.com`），圖片會從 CDN 而非 `/static` 載入。 |
| `NEXT_PUBLIC_SITE_URL` | 前端（建置） | 中繼資料使用的標準網站 URL。 |

使用者帳戶與 CDN 預設關閉，因此即使不設定上述任何項目，專案仍可端對端執行。

## 更新管線

新遊戲版本發布時，跨平台 Python 指令碼會處理完整更新工作流程：

```bash
# 完整管線--擷取遊戲檔案、剖析資料、算繪圖像、複製圖片：
python3 tools/update.py

# 手動指定遊戲安裝路徑：
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# 跳過擷取（已有最新的 extraction/ 目錄）：
python3 tools/update.py --skip-extract

# 僅重新剖析資料（不擷取或算繪）：
python3 tools/update.py --parse-only

# 僅重新算繪 Spine 圖像：
python3 tools/update.py --render-only

# 更新後產生變更記錄：
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

指令碼會自動偵測作業系統並尋找 Steam 安裝目錄。各步驟需求如下：

| 步驟 | 工具 | 安裝 |
|---|---|---|
| PCK 擷取 | `gdre_tools` | [GDRE Tools 發行版本](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL 反編譯 | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| 資料剖析 | Python 3.10+ | 內建 |
| 圖片複製 | Python 3.10+ | 內建 |
| Spine 算繪 | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### 手動步驟

若偏好個別執行各步驟：

```bash
# 剖析所有資料（全部 15 種語言）
cd backend/app/parsers && python3 parse_all.py

# 剖析單一語言
cd backend/app/parsers && python3 parse_all.py --lang eng

# 將圖片從擷取目錄複製至 static（從相同來源產生 PNG + WebP--不會
# 經由現有後端 WebP 形成有損轉換鏈）。WebP quality=95、method=6。
python3 backend/scripts/copy_images.py

# 算繪 Spine 圖像（WebGL--無三角形接縫瑕疵）
cd tools/spine-renderer && npm install
npx playwright install chromium           # 僅第一次執行
node render_all_webgl.mjs                 # 透過無頭 Chrome 算繪全部 138 個骨架
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# 常見的個別怪物覆寫：
#   --skin=moss1,diamondeye   將變體外觀與預設外觀組合（cubex_construct）
#   --skin=skin1              將預設外觀替換為變體（scroll_of_biting）
#   --anim-time=0.5           擷取快照前將動畫推進 N 秒
#   --anim=attack             覆寫自動選取的待機動畫
#
# 煙霧預留位置替換：gas_bomb_2.png、the_forgotten_2.png 與
# living_smog_2.png 在原始檔中是洋紅色的「Smoke Placeholder」看板。
# render_webgl.mjs 會在 GL 上傳前，以程式產生且尺寸相同的深梅紅色雲霧
# 替換它們，接著在替換的插槽上強制設定 slot.color.a = 1.0
#（美術人員因預期會使用著色器而設定了低 alpha）。

# 重新調整過小怪物圖像的畫面範圍（後處理--裁切至實際 alpha
# 邊界方塊，縮放至填滿約 92% 的 512x512 畫面）：
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# 舊版 canvas 算繪器（有三角形接縫瑕疵--請避免使用）
# node render_all.mjs / node render.mjs
```

## 變更記錄系統

透過所有實體分類的欄位層級差異，追蹤遊戲更新之間的變更。

### 產生變更記錄

```bash
# 將目前資料與 git ref 比較：
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# 預覽為文字或 Markdown：
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### 變更記錄結構描述

每個變更記錄 JSON 檔案包含：

| 欄位 | 說明 |
|---|---|
| `app_id` | Steam App ID（2868840） |
| `game_version` | Steam 遊戲版本（例如 `"0.98.2"`） |
| `build_id` | Steam 組建 ID |
| `tag` | 唯一版本鍵值（例如 `"1.0.3"`） |
| `date` | 更新日期 |
| `title` | 易讀標題 |
| `summary` | 數量：`{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | 手動編寫的版本資訊。使用 `diff_data.py` 重新產生現有標籤時會予以保留--資料差異會被覆寫，但這些陣列會合併保留。 |
| `categories` | 各分類差異，含新增／移除／變更的實體。欄位變更會遞迴進入巢狀字典／清單，因此每個葉節點都會成為獨立資料列（例如 `vars.DamageVar: 8 → 10`），而不是不透明的 `vars: 2 fields → 2 fields`。 |

### 一次寫入保留政策

`data/changelogs/` 下的檔案是僅可寫入一次的歷史記錄。`.github/workflows/changelog-guard.yml` 會阻擋任何**修改或刪除**現有變更記錄的 PR。新檔案（`A`）一律允許；修改則要求 PR 具有 `changelog-edit-approved` 標籤。政策與覆寫工作流程請參閱 `CONTRIBUTING.md → Changelog Retention`。

### 個別實體歷程

`GET /api/history/{entity_type}/{entity_id}` 會走訪每份變更記錄，並以最新優先順序傳回涉及所要求實體的項目。每個詳細資料頁面（`/cards/{id}`、`/monsters/{id}` 等）的版本歷程側欄都由此端點提供資料。

## 部署

### CI/CD（GitHub Actions）

推送至 `main` 會在自架 Kubernetes 執行器上觸發 `.github/workflows/ci.yml`。工作流程會執行祕密掃描、ESLint 與 TypeScript 檢查、ruff lint 與格式檢查，接著以 `:latest` 建置並推送穩定版映像。它也仍會以 `:beta` 為 `docker-compose.beta.yml` 建置獨立測試版映像；這些映像在作業上仍予以保留，但公開測試版頁面由主要部署於 `/beta` 提供。

穩定版前端會接收 `UMAMI_WEBSITE_ID`。獨立測試版映像會接收 `UMAMI_BETA_WEBSITE_ID`，但公開 `/beta` 流量使用穩定版前端及其分析屬性。

CI **不會**部署。DigitalOcean 主機上每小時執行的自動部署工作負責部署。

> **注意：**`.forgejo/workflows/build.yml` 保留作為未啟用、以 buildah 為基礎的備援。

### 本機建置與推送

略過 CI，直接從本機推送：

```bash
# 建置並推送兩個映像：
python3 tools/deploy.py

# 僅前端：
python3 tools/deploy.py --frontend

# 僅後端：
python3 tools/deploy.py --backend

# 測試建置但不推送：
python3 tools/deploy.py --no-push

# 標記發行版本：
python3 tools/deploy.py --tag v0.98.2

# 建置並推送測試版映像（:beta 標籤，略過 IndexNow）：
python3 tools/deploy.py --beta
```

會自動偵測 Apple Silicon，並透過 `docker buildx` 交叉編譯為 `linux/amd64`。必須先執行 `docker login`。

### 正式環境

公開應用程式與保留的獨立測試版堆疊在同一台 DigitalOcean 主機上執行。公開流量使用 `spire-codex.com`；次要 Lightsail 主機則執行 MongoDB。

**自動部署**--DigitalOcean 主機上的每小時 cron 會在每小時 :03 執行 `/usr/local/bin/spire-codex-autodeploy`。當簽出的 commit 前進時，它會拉取並重建 `docker-compose.prod.yml` 與 `docker-compose.beta.yml`，但僅限於 `data/news/*` 的更新除外。之後會清除 Cloudflare 快取。記錄會寫入 `/var/log/spire-codex-autodeploy.log`。安裝與操作方式請參閱 [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md)。

**手動部署**：

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# 保留的獨立測試版堆疊
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

正式環境資料使用繫結掛載（前端為 `./data:/data:ro`，後端則可讀寫）。新聞與遊玩狀態會在請求時從掛載資料讀取，因此更新 `data/news/*.json` 不需要重新啟動容器。

### 測試頻道（spire-codex.com/beta）

公開應用程式會將穩定版與 Steam `public-beta` 資料作為兩個內容頻道提供。測試版頁面位於 [`spire-codex.com/beta`](https://spire-codex.com/beta)，本地化路由則位於 `/{lang}/beta/...`。主要 `/images` 頁面也會顯示封存的測試版素材版本。

`beta.spire-codex.com` 已停止公開使用。Cloudflare 目前會傳送保留路徑的 `302` 至頂層網域，但不會加入 `/beta` 或 `channel=beta`。因此，舊頁面連結會抵達對應的穩定版頁面，而舊 API 請求在跟隨重新導向後會收到穩定版資料。新的 API 用戶端必須使用主 API 並明確指定頻道，例如 `https://spire-codex.com/api/cards?channel=beta`。

**架構**：`get_channel` 會將 `?channel=beta|stable` 解析至 Python `ContextVar`；它也能辨識用於直接來源流量的 `beta.*` host 標頭。`data_service.py` 會從 `data-beta/<latest>/` 載入測試版請求，並逐檔退回穩定版。`GET /api/beta/diff` 與 `GET /api/beta/version` 會描述目前啟用的測試版，而前端會在 `/beta` 下算繪選取的頻道。

獨立的 `docker-compose.beta.yml` 堆疊與 `:beta` 映像仍會由部署自動化建置及重建。Cloudflare 重新導向啟用期間，它們並不是公開測試版網站。

**資料配置**：每個封存組建位於 `data-beta/<version>/` 下，而 `latest` 指標會選取目前啟用的組建。每個版本都有自己的 `changelogs/` 目錄。測試版圖片封存會在 `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/` 鏡像此配置。

**自動擷取**--`tools/beta-watch/` 在開發用 Mac 上以 launchd 工作執行，每週四 15:00 至 22:45 之間每 15 分鐘執行一次。當 SteamCMD 回報新的 `public-beta` 組建 ID 時，它會擷取並反編譯遊戲、剖析所有語言、產生差異、同步版本化圖片，並開啟 `auto/beta-<version>` PR。安裝與操作方式請參閱 [`tools/beta-watch/README.md`](tools/beta-watch/README.md)。

**手動擷取**：

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# 先擷取並反編譯測試版遊戲檔案，接著從儲存庫根目錄進行剖析。
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` 會更新 `latest` 圖片符號連結。擷取 PR 會包含版本化資料與圖片變更；合併後，自動部署會重新整理兩個保留的堆疊。

## Spine 算繪器

StS2 中的怪物圖像是 [Spine](http://esotericsoftware.com/) 骨架動畫--每隻怪物由 `.skel`（二進位骨架）+ `.atlas` + `.png` 精靈圖表組成，而非單一圖片。算繪器會將這些內容組合成靜態肖像 PNG。

### WebGL 算繪器（目前使用）

WebGL 算繪器（`render_webgl.mjs`、`render_all_webgl.mjs`）使用 **Playwright + spine-webgl**，透過無頭 Chrome 的 GPU 算繪骨架。這會產生乾淨且**沒有三角形接縫瑕疵**的算繪結果。

**運作方式：**
1. 透過 Playwright 啟動已啟用 WebGL 的無頭 Chrome
2. 將骨架資料、atlas 與紋理以 base64 載入瀏覽器頁面
3. 建立 WebGL canvas，設定 spine-webgl 著色器與多邊形批次處理器
4. 套用待機動畫，計算邊界（排除陰影／地面插槽）
5. 透過 GPU 三角形光柵化進行算繪--沒有 canvas 裁切路徑，也沒有接縫
6. 透過 `gl.readPixels` 讀取原始像素，並垂直翻轉（WebGL 為由下而上）
7. 透過 node-canvas 寫入 PNG，以保留透明度

**單一骨架：**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**批次處理所有骨架：**
```bash
node render_all_webgl.mjs  # 將 138 個骨架算繪至 backend/static/images/renders/
```

### 算繪涵蓋範圍

| 分類 | 已算繪 | 總數 | 備註 |
|---|---|---|---|
| 怪物 | 99 | 103 個目錄 | 全部 111 隻遊戲怪物皆有圖片（99 個算繪 + 別名／靜態圖片） |
| 角色 | 16 | 16 | 戰鬥、休息處與選擇姿勢 |
| 背景／NPC | 14 | 17 | Neow、Tezcatara、商人房間、主選單 |
| VFX／UI | 9 | 22 | 大多數 VFX 需要特定動畫影格 |
| **總計** | **138** | **158** | 略過 20 個（無 atlas、僅 VFX、空白） |

### 動畫算繪器

動畫算繪器（`render_gif.mjs`）會將 Spine 待機／攻擊動畫算繪為動態 WebP、GIF 或 APNG。支援外觀變體、動畫選擇，以及大型動畫的影格串流寫入磁碟。

**支援的輸出格式：**
- **`.webp`**（建議）--具完整 alpha 的無損動態 WebP，比 APNG 小約 33%。影格會串流至磁碟以避免 OOM。
- **`.gif`**--256 色、二元透明度。檔案最小，但品質最低。
- **`.apng`**--具有與 WebP 相同的完整 alpha，但檔案較大。

```bash
# 算繪無損動態 WebP（建議）
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# 使用外觀變體（適用於 bowlbug、cultists、cubex 等）
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# 特定動畫（預設：待機循環）
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# 白色剪影模式（用於 Boss 地圖節點圖示）
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**動畫庫：**209 個無損動態 WebP：
- 15 個 512×512 角色動畫（5 名角色各有戰鬥／選擇／休息）
- 103 個 256×256 怪物待機動畫
- 91 個 256×256 怪物攻擊動畫

**外觀變體：**13 隻怪物具有外觀變體（bowlbug、cubex_construct、cultists 等）。使用 `--skin=` 選取。預設外觀通常只顯示沒有身體的基礎骨架。

**Boss 地圖節點著色器：**遊戲使用 `boss_map_point.gdshader`，將 RGB 色彩通道視為遮罩：
- **紅色通道** × `map_color`（預設：米色 `0.671, 0.58, 0.478`）→ 填充顏色
- **藍色通道** × `black_layer_color`（預設：黑色 `0, 0, 0`）→ 外框顏色
- **綠色通道** × 白色 `1, 1, 1` → 高光

### 舊版 Canvas 算繪器

Canvas 算繪器（`render.mjs`、`render_all.mjs`）使用 `spine-canvas` 並設定 `triangleRendering = true`。由於相鄰三角形之間的 canvas `clip()` 路徑反鋸齒，這會產生**可見的線框網格瑕疵**。請改用 WebGL 算繪器。

### 相依套件

- `@esotericsoftware/spine-webgl` ^4.2.107--WebGL 的 Spine 執行階段（目前使用）
- `playwright`--用於 WebGL 算繪的無頭 Chrome
- `gif-encoder-2`--動畫算繪器的 GIF 編碼
- `canvas` ^3.1.0--Node.js Canvas 實作（動畫算繪器的影格緩衝區）
- `Pillow`（Python）--從已算繪的 PNG 影格組合 WebP／APNG
- `@esotericsoftware/spine-canvas` ^4.2.106--Canvas 的 Spine 執行階段（舊版）

## 擷取遊戲檔案

若需要從頭開始擷取：

```bash
# 擷取 PCK（GDRE Tools）
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# 反編譯 DLL（ILSpy CLI）
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam 安裝位置：
- **Windows**：`C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**：`~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**：`~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## 版本編號

Spire Codex 使用 **`1.X.Y`** 語意化版本：

| 區段 | 意義 |
|---------|---------|
| **1** | Spire Codex 主要版本（除非全面重寫，否則不變） |
| **X** | Mega Crit 發布遊戲修補程式時遞增 |
| **Y** | 我們自己的剖析器／前端修正與改進時遞增 |

範例：`v1.0.0` = 初始版本、`v1.0.1` = 我們的錯誤修正、`v1.1.0` = 已納入第一個 Mega Crit 修補程式。

## SEO

- **結構化資料（JSON-LD）**：WebSite + VideoGame（首頁）、CollectionPage + ItemList（清單頁面）、Article + BreadcrumbList + FAQPage（詳細資料頁面）、SoftwareApplication（開發人員）、NewsArticle（news/[gid]）
- **標題格式**：`"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"`--所有頁面統一使用。遊玩紀錄使用 `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`。將「(sts2)」放在標題內，讓跨語言地區的 `sts2 tier list`／`sts2 card list` 查詢可以匹配。
- **網站地圖**：位於 `/sitemap.xml` 的扁平 XML，使用 `force-dynamic`（在伺服器端算繪，而非建置時）。包含約 20,000 個以上 URL，涵蓋實體詳細資料頁面、瀏覽矩陣頁面、分級榜頁面、評分方法、runs/[hash] 詳細資料，以及所有實體類型的 i18n 鏡像
- **國際 SEO**：14 種非英語語言使用 `/{lang}/` 路由，並具有**雙向** hreflang 替代項--英文根頁面也會透過 `lib/seo.ts` 中的 `buildLanguageAlternates(path)`，為每個語系與 `x-default` 輸出替代項（修正 GSC 的「已檢索 - 尚未建立索引」重複內容叢集；Google 先前因缺乏反向參照而將本地化頁面視為重複內容）
- **程式化 SEO**：`/cards/browse/` 下的 41 個卡牌瀏覽頁面（rare-attacks、ironclad-skills 等）+ 3 個分級榜頁面（`/tier-list/{cards,relics,potions}`）
- **語系感知 EntityProse**：詳細資料頁面會算繪簡短的語系專屬段落，而不是在每個語系使用相同英文本文
- **內部連結**：能力 ↔ 卡牌、遭遇 → 怪物、卡牌關鍵字 → 關鍵字中心頁面、怪物招式 → 能力頁面（含工具提示）、章節頁面 → 遭遇／事件、分級榜列 → 實體詳細資料的「統計」分頁
- **Open Graph 與 Twitter Cards**：各實體 OG 圖片、`summary_large_image` Twitter Cards
- **標準 URL**：每個頁面皆宣告標準 URL

## 可嵌入式小工具

### 工具提示小工具
在任何網站中，為全部 13 種實體類型加入滑鼠懸停工具提示：
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### 變更記錄小工具
嵌入互動式變更記錄檢視器：
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

完整文件：[spire-codex.com/developers](https://spire-codex.com/developers)

## 路線圖

- ~~個別詳細資料頁面~~ ✅
- ~~全域搜尋~~ ✅
- ~~多語言支援（15 種語言）~~ ✅
- ~~SEO（JSON-LD、OG/Twitter、網站地圖、hreflang）~~ ✅
- ~~工具提示小工具（全部 13 種實體類型）~~ ✅
- ~~角色比較頁面（10 組配對）~~ ✅
- ~~關鍵字中心頁面~~ ✅
- ~~商人指南（定價來自反編譯的 C#）~~ ✅
- ~~開發人員文件 + 資料匯出~~ ✅
- ~~國際 SEO（13 個語言登陸頁面）~~ ✅
- ~~卡牌瀏覽矩陣（41 個程式化 SEO 頁面）~~ ✅
- ~~社群指南~~ ✅--含 YAML frontmatter 的 Markdown、提交表單、工具提示小工具、作者社群連結
- ~~遊戲機制頁面~~ ✅--27 個個別 SEO 頁面：掉落率、戰鬥、地圖、Boss、祕密與冷知識
- ~~社群遊玩紀錄~~ ✅--遊玩紀錄提交、瀏覽器、共用遊玩紀錄、即時統計
- ~~卡牌升級說明~~ ✅--全部 403 張可升級卡牌的 upgrade_description
- ~~怪物固有能力~~ ✅--42 隻怪物具有來自 AfterAddedToRoom 的能力
- ~~成就解鎖條件~~ ✅--來自 C# 原始碼的分類、角色、門檻
- ~~怪物攻擊模式~~ ✅--112 隻怪物具有來自 C# 狀態機的循環／隨機／條件式／混合 AI
- ~~事件前置條件~~ ✅--25 個事件具有從 C# 原始碼剖析的 IsAllowed() 條件
- ~~測試版封存保留~~ ✅--版本化測試版資料與圖片會持續保留；`/beta` 提供目前啟用的組建，`/images` 則可瀏覽封存素材
- ~~Discord 機器人~~ ✅--[Knowledge Demon](https://bot.spire-codex.com)：每種實體的斜線指令（`/card`、`/relic`、`/monster`、`/potion`、`/character`、`/event`、`/power`、`/enchantment`、`/lookup`、`/meta`）、Steam 新聞 RSS，以及從 [Kernel](https://github.com/ptrlrd/kernel) 分支而來的完整管理工具組
- ~~Codex Score 與分級榜~~ ✅--使用**貝葉斯收縮**，根據社群遊玩紀錄計算各實體評級：`shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`，接著縮放至 0–100 並對應至 S/A/B/C/D/F。這可防止小樣本雜訊（只出現 1 場且 1/1 的卡牌不會獲得 S--它會回歸先驗值）。在後端啟動時預先暖機。會以 `ScoreBadge` 顯示於詳細資料頁面的「統計」分頁、專用分級榜頁面，以及 `/leaderboards/scoring` 的方法頁面。
- ~~詳細資料頁面的「統計」分頁~~ ✅--分數主視覺徽章 + 文字摘要 + 透過 `EntityRunStats` 顯示的近期遊玩紀錄連結。
- **牌組建構器**--互動式牌組理論構築
- **資料庫後端**--以 PostgreSQL JSONB（或其他替代方案）取代各語言 JSON 載入。遊玩紀錄提交儲存已從 SQLite 移至 MongoDB（2026 年 5 月）。

## 致謝

感謝 **vesper-arch**、**terracubist**、**U77654**、**Purple Aspired Dreaming**、**Kobaru** 與 **Severi** 協助 QA 測試、錯誤回報與貢獻。完整支持者清單--包括協助維持服務運作的 Ko-fi 捐助者--位於 [spire-codex.com/thank-you](https://spire-codex.com/thank-you)。

## 技術堆疊

- **後端**：Python、FastAPI、Pydantic、slowapi、GZip 壓縮
- **遊玩紀錄資料庫**：MongoDB（社群統計、排行榜、使用者帳戶），包含具體化的 `stats_summary` 集合與由領導者選舉產生的背景重新整理器。舊版 SQLite 路徑保留作為離線備援。
- **帳戶**：Steam OpenID + Discord OAuth、JWT 工作階段 Cookie
- **前端**：Next.js 16（App Router）、TypeScript、Tailwind CSS、支援 15 種語言
- **圖片／CDN**：透過 `cdn.spire-codex.com` 提供的 Cloudflare R2（webp）
- **分析與可觀測性**：自架 Umami、Prometheus + node-exporter
- **Spine 算繪器**：Node.js、Playwright、@esotericsoftware/spine-webgl（透過無頭 Chrome 使用 WebGL）
- **基礎架構**：Docker、採用登錄檔支援之 BuildKit 快取的 GitHub Actions CI（自架執行器）、Ansible/SSH 部署
- **工具**：Python（更新管線、變更記錄差異比較、圖片複製）

## 授權

- **原始碼**：[PolyForm Noncommercial 1.0.0](LICENSE.md)--可免費用於非商業用途的使用、修改與再散布。不允許銷售本軟體。
- **託管 API**：[API_TERMS.md](API_TERMS.md)--在已公布的速率限制內，可免費用於任何用途；若需要更多額度，請透過 Discord 或 issue 聯絡我們。
- **遊戲資料**（卡牌、遺物、怪物等）：© Mega Crit Games。此處依合理使用／教育用途條款，作為社群參考資料提供。請勿使用此資料重新編譯、重新封裝或再散布遊戲。

貢獻內容依相同的 PolyForm Noncommercial 1.0.0 條款接受--請參閱 [CONTRIBUTING.md](CONTRIBUTING.md#license)。
