<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex 徽标" width="200" />
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

一个全面的 **Slay the Spire 2** 游戏数据数据库和 API，通过对游戏文件进行逆向工程构建。支持游戏自带的全部 **15 种语言**。

**在线网站**：[spire-codex.com](https://spire-codex.com)

**Steam App ID**：2868840

## 构建方式

Slay the Spire 2 使用 Godot 4 构建，但所有游戏逻辑都位于 C#/.NET 8 DLL（`sts2.dll`）中，而非 GDScript。数据流水线如下：

1. **PCK 提取** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) 提取 Godot `.pck` 文件，以恢复图像、Spine 动画和本地化数据（约 9,947 个文件）。

2. **DLL 反编译** - [ILSpy](https://github.com/icsharpcode/ILSpy) 将 `sts2.dll` 反编译为约 3,300 个可读的 C# 源文件，其中包含所有游戏模型。

3. **数据解析** - 22 个基于 Python 正则表达式的解析器从反编译后的 C# 源代码中提取结构化数据，并将各语言的 JSON 输出至 `data/{lang}/`：
   - **卡牌**：用于基础属性的 `base(cost, CardType, CardRarity, TargetType)` 构造函数，以及用于数值的 `DamageVar`、`BlockVar`、`PowerVar<T>`
   - **角色**：`StartingHp`、`StartingGold`、`MaxEnergy`、`StartingDeck`、`StartingRelics`
   - **遗物/药水**：稀有度、池，以及从 SmartFormat 模板解析出的描述
   - **怪物**：生命值范围、通过 `AscensionHelper` 实现的进阶缩放、包含逐招意图（Attack/Defend/Buff/Debuff/Status/Summon/Heal）的招式状态机、伤害值、多段攻击次数（包括 AscensionHelper 模式）、来自 `AfterAddedToRoom` 的固有能力（42 个怪物具有进阶变体）、每招施加的能力（从 `PowerCmd.Apply<T>` 获取目标和数值）、格挡、治疗、遭遇上下文（章节、房间类型），以及从 `GenerateMoveStateMachine()` 解析的**攻击模式**（112 个怪物--循环、随机、条件、混合）
   - **附魔**：卡牌类型限制、可叠加性、基于 Amount 的缩放
   - **遭遇**：怪物组成、房间类型（Boss/Elite/Monster）、所在章节、标签
   - **事件**：多页面决策树（66 个事件中的 56 个）、带结果的选项、所在章节、解析为显示名称的 `StringVar` 模型引用、运行时计算值（通过 `GetDecipherCost()` 递增的费用、通过使用 `NextInt`/`NextFloat` 的 `CalculateVars` 计算的金币范围、完全治疗模式），以及来自 `IsAllowed()` 的**前置条件**（25 个事件--金币、生命值、章节、牌组、遗物、药水条件）
   - **远古者**：8 个远古者 NPC，包括称号、角色专属对话、遗物馈赠和肖像图标
   - **能力**：PowerType（Buff/Debuff）、PowerStackType（Counter/Single）、DynamicVars、描述
   - **纪元/故事**：包含解锁要求的时间线进度数据
   - **充能球**：被动/激发数值、描述
   - **苦难**：可叠加性、额外卡牌文本、描述
   - **修改器**：游戏局修改器描述
   - **关键词**：卡牌关键词定义（Exhaust、Ethereal、Innate 等）
   - **意图**：带图标的怪物意图描述
   - **成就**：来自 C# 源代码的解锁条件、描述、类别、角色关联和阈值（33 项成就）
   - **章节**：Boss 发现顺序、遭遇、事件、远古者、房间数量
   - **进阶等级**：11 个等级（0–10），描述来自本地化数据
   - **药水池**：从池类和纪元引用中解析的角色专属池
   - **翻译**：供前端使用的各语言筛选映射（卡牌类型、稀有度、关键词 → 本地化名称）和 UI 字符串（分区标题、描述、角色名称）

4. **描述解析** - 共享的 `description_resolver.py` 模块将 SmartFormat 本地化模板（`{Damage:diff()}`、`{Energy:energyIcons()}`、`{Cards:plural:card|cards}`）解析为带有富文本标记、可供前端渲染的易读文本。运行时动态变量（例如 `{Card}`、`{Relic}`）会保留为易读的占位符。事件中的 `StringVar` 引用（例如 `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`）会通过本地化查找解析为显示名称。

5. **Spine 渲染** - 角色和怪物使用 Spine 骨骼动画，而非静态图像。无头 Node.js 渲染器将待机姿势组合成 512×512 的肖像 PNG。全部 111 个怪物均有图像：100 个由 Spine 骨骼渲染，6 个使用共享骨骼的别名（Flyconid→flying_mushrooms、Ovicopter→egg_layer、Crusher/Rocket→kaiser_crab），另有 5 个来自静态游戏资源（Doormaker）。此外还会渲染全部 5 个角色（战斗、休息点、角色选择姿势）、NPC 和背景。基于皮肤的变体（Cultists、Bowlbugs、Cubex）会单独渲染。请参阅下文的 [Spine 渲染器](#spine-渲染器)。

6. **图像** - 从游戏资源中提取卡牌插图、遗物/药水图标、角色美术、怪物图像、远古者肖像图标和 Boss 遭遇图标，并作为静态文件提供。

7. **更新日志差异比较** - 差异工具会比较游戏版本之间的 JSON 数据（通过 git 引用或目录），按类别跟踪新增、移除和变更的实体，并提供字段级差异。更新日志以 Steam 游戏版本加可选的 Codex 修订号为键。

## 项目结构

```
spire-codex/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口、CORS、GZip、速率限制、静态文件
│   │   ├── dependencies.py     # 共享依赖（语言验证、语言名称）
│   │   ├── routers/            # API 端点（25 个以上路由器）
│   │   ├── models/schemas.py   # Pydantic 模型
│   │   ├── services/           # JSON 数据加载（LRU 缓存、支持 14 种语言）
│   │   └── parsers/            # C# 源代码 → JSON 解析器
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # 关键词、意图、充能球、苦难、修改器、成就（含解锁条件）
│   │       ├── guide_parser.py          # 带 YAML 前置元数据的 Markdown 指南
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # 为药水添加角色池
│   │       ├── translation_parser.py    # 为每种语言生成 translations.json
│   │       ├── description_resolver.py   # 共享 SmartFormat 解析器
│   │       ├── parser_paths.py           # 共享路径配置（用于测试版的环境变量覆盖）
│   │       └── parse_all.py              # 编排所有解析器（15 种语言）
│   ├── static/images/          # 游戏图像（未提交）
│   ├── scripts/copy_images.py  # 将图像从提取目录复制到静态目录
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext、BetaVersionContext
│   │   ├── components/         # CardGrid、RichDescription、SearchFilter、
│   │   │                       #   GlobalSearch、Navbar、Footer、LanguageSelector、VersionSelector
│   │   └── ...                 # 页面：卡牌、角色、遗物、怪物、药水、
│   │                           #   附魔、遭遇、事件、能力、时间线、
│   │                           #   参考资料、图像、更新日志、关于、商人、比较、
│   │                           #   mechanics/[slug]、guides/[slug]、guides/submit、
│   │                           #   排行榜、leaderboards/submit、leaderboards/stats、
│   │                           #   runs/[hash]（共享游戏局视图）
│   │                           #   详情页：cards/[id]、characters/[id]、relics/[id]、
│   │                           #   monsters/[id]、potions/[id]、enchantments/[id]、
│   │                           #   encounters/[id]、events/[id]、powers/[id]、keywords/[id]、
│   │                           #   acts/[id]、ascensions/[id]、intents/[id]、orbs/[id]、
│   │                           #   afflictions/[id]、modifiers/[id]、achievements/[id]
│   │                           #   i18n：[lang]/... 为 14 种非英语语言镜像所有路由
│   ├── lib/
│   │   ├── api.ts              # API 客户端 + TypeScript 接口
│   │   ├── fetch-cache.ts      # 客户端内存请求缓存（5 分钟 TTL）
│   │   ├── seo.ts              # 共享 SEO 工具（stripTags、SITE_URL、SITE_NAME）
│   │   ├── jsonld.ts           # JSON-LD 架构构建器（BreadcrumbList、CollectionPage、Article、WebSite、FAQPage）
│   │   ├── ui-translations.ts # 14 种非英语语言的 UI 字符串翻译
│   │   ├── languages.ts       # i18n 配置--14 个语言代码、hreflang 映射
│   │   └── use-lang-prefix.ts # 用于构建语言感知 URL 的 Hook
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # 无头 Spine 骨骼渲染器
│   │   ├── render_webgl.mjs     # WebGL 渲染器（单个骨骼）--无接缝伪影
│   │   ├── render_all_webgl.mjs # WebGL 批量渲染器（所有 .skel 文件）
│   │   ├── render_gif.mjs      # 动画渲染器（支持皮肤和动画的 WebP/GIF/APNG）
│   │   ├── render.mjs           # 旧版 Canvas 渲染器（存在三角形接缝）
│   │   ├── render_all.mjs       # 旧版 Canvas 批量渲染器
│   │   ├── render_skins2.mjs    # 皮肤变体渲染器
│   │   ├── render_utils.mjs     # 共享 Canvas 渲染工具
│   │   └── package.json
│   ├── diff_data.py            # 更新日志差异生成器
│   ├── update.py               # 跨平台更新流水线
│   └── deploy.py               # 本地 Docker 构建并推送至 Docker Hub
├── data/                       # 解析后的 JSON 数据文件
│   ├── {lang}/                 # 各语言目录（eng、kor、jpn、fra 等）
│   ├── changelogs/             # 更新日志 JSON 文件（以游戏版本为键）
│   ├── guides/                 # 带 YAML 前置元数据的 Markdown 指南文件
│   ├── guides.json             # 解析后的指南数据
│   ├── runs/                   # 已提交的游戏局 JSON 文件（按玩家哈希）
│   └── runs.db                 # 旧版 SQLite（已由 MongoDB 取代；保留作为离线后备）
├── extraction/                 # 原始游戏文件（未提交）
│   ├── raw/                    # GDRE 提取的 Godot 项目（稳定版）
│   ├── decompiled/             # ILSpy 输出（稳定版）
│   └── beta/                   # Steam 测试分支（raw/ + decompiled/）
├── data-beta/                  # 解析后的测试版数据（版本化：v0.102.0/、v0.103.0/、latest → 符号链接）
├── docker-compose.yml          # 本地开发
├── docker-compose.prod.yml     # 生产环境
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI：lint、类型检查、密钥扫描、Docker 构建和推送、SSH 部署
└── .forgejo/workflows/
    └── build.yml               # 保留的 Forgejo CI 后备方案（基于 buildah，未启用）
```

## 公共服务

| 主机 | 用途 |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | 公共网站和同源 API。当前测试频道位于 `/beta` 下。 |
| `cdn.spire-codex.com` | 用于游戏美术、完整卡牌渲染、本地化渲染和归档测试版资源的 Cloudflare R2 对象主机。 |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon 落地页和经过 Discord 身份验证的工作人员仪表板。机器人使用主 Codex API。 |
| `analytics.spire-codex.com` | 自托管的 Umami 脚本和仪表板。其 PostgreSQL 数据库位于私有 Docker 网络中。 |
| `tierlists.spire-codex.com` | 用于生成的梯队榜预览图的专用 R2 对象主机。 |
| `beta.spire-codex.com` | 已停用的公共主机。Cloudflare 会将请求重定向到根域名上的相同路径。 |

CDN 和梯队榜主机是对象存储而非可浏览的网站，因此在任一根路径收到 `404` 都是预期行为。

## 网站页面

| 页面 | 路由 | 描述 |
|---|---|---|
| 首页 | `/` | 包含实体数量、类别卡片和角色链接的仪表板 |
| 卡牌 | `/cards` | 带模态详情视图的可筛选卡牌网格 |
| 卡牌详情 | `/cards/[id]` | 完整卡牌数值、升级信息和图像 |
| 角色 | `/characters` | 角色概览网格 |
| 角色详情 | `/characters/[id]` | 数值、初始牌组/遗物、台词、NPC 对话树 |
| 遗物 | `/relics` | 可筛选的遗物网格 |
| 遗物详情 | `/relics/[id]` | 带富文本风味文字的完整遗物信息 |
| 怪物 | `/monsters` | 包含生命值、招式和 Spine 渲染图的怪物网格 |
| 怪物详情 | `/monsters/[id]` | 生命值、带意图/伤害/能力/格挡的招式、遭遇链接、能力工具提示 |
| 药水 | `/potions` | 可筛选的药水网格（稀有度、角色池） |
| 药水详情 | `/potions/[id]` | 完整药水信息 |
| 附魔 | `/enchantments` | 带卡牌类型筛选器的附魔列表 |
| 附魔详情 | `/enchantments/[id]` | 完整附魔信息 |
| 遭遇 | `/encounters` | 按章节/房间类型显示的遭遇组成 |
| 遭遇详情 | `/encounters/[id]` | 怪物阵容、房间类型、标签 |
| 事件 | `/events` | 带可展开选项的多页面事件树 |
| 事件详情 | `/events/[id]` | 完整事件页面、选项、远古者对话 |
| 能力 | `/powers` | 增益、减益和中立能力 |
| 能力详情 | `/powers/[id]` | 能力信息，以及会施加该能力的卡牌 |
| 关键词 | `/keywords` | 卡牌关键词列表 |
| 关键词详情 | `/keywords/[id]` | 关键词描述和可筛选卡牌网格 |
| 商人 | `/merchant` | 卡牌/遗物/药水价格、移除卡牌费用、假商人 |
| 比较 | `/compare` | 角色比较中心（10 组） |
| 比较详情 | `/compare/[pair]` | 并排角色比较 |
| 开发者 | `/developers` | API 文档、小组件文档、数据导出 |
| 展示 | `/showcase` | 社区项目画廊 |
| 时间线 | `/timeline` | 按时代分组并包含解锁要求的纪元进度 |
| 章节详情 | `/acts/[id]` | 某章节的 Boss、遭遇、事件和远古者 |
| 进阶详情 | `/ascensions/[id]` | 进阶等级描述，带上一项/下一项导航 |
| 意图详情 | `/intents/[id]` | 意图图标和描述 |
| 充能球详情 | `/orbs/[id]` | 充能球图标、被动/激发描述 |
| 苦难详情 | `/afflictions/[id]` | 苦难描述、可叠加性 |
| 修改器详情 | `/modifiers/[id]` | 游戏局修改器描述 |
| 成就详情 | `/achievements/[id]` | 成就描述 |
| 徽章 | `/badges` | 全部 25 个游戏局结束徽章，按分级/单级/仅多人分类 |
| 徽章详情 | `/badges/[id]` | 各等级明细（Bronze / Silver / Gold）、必须获胜和多人标志、图标 |
| 机制 | `/mechanics` | 游戏机制中心--27 个可点击分区，各有独立 SEO 页面 |
| 机制详情 | `/mechanics/[slug]` | 卡牌概率、遗物分布、药水掉落、地图生成、Boss 池、战斗、秘密与趣闻 |
| 指南 | `/guides` | 支持搜索/筛选的社区策略指南 |
| 指南详情 | `/guides/[slug]` | 使用 Markdown 渲染和工具提示小组件的完整指南 |
| 提交指南 | `/guides/submit` | 指南提交表单（Discord webhook） |
| 排行榜 | `/leaderboards` | 最快胜利和最高进阶榜，支持单人/合作及游戏模式筛选（standard / daily / Today / custom）。所有筛选状态都位于 URL 中，因此任何视图均可共享 |
| 浏览游戏局 | `/runs` | 完整游戏局浏览器，提供表达式搜索栏（`user:`、`char:`、`asc:` 范围、`card:`/`relic:` 多值 AND、`version:` 范围、`mode:`、`result:`、`players:`）、下拉筛选器、排序和可共享 URL |
| 提交游戏局 | `/leaderboards/submit` | 支持拖放上传 `.run`、Overwolf 配套工具链接、通过 Steam/Discord 登录自动关联游戏局，以及查看近期游戏局 |
| 统计 | `/leaderboards/stats` | 卡牌、遗物、药水和遭遇的排名表（选取率、胜率、数量）。可按角色/进阶/结果筛选 |
| 个人资料 | `/profile` | 已登录用户的统计数据（常用卡牌/遗物/药水、角色细分）、个人最佳、竞技比较（今日每日排行榜、全球排名、与社区对比的胜率）和游戏局管理 |
| 设置 | `/settings` | 账户设置：用户名、电子邮件、已关联的 Steam/Discord |
| 共享游戏局 | `/runs/[hash]` | 仿游戏内风格的胜利/失败摘要，包含可点击的地图节点图标、遗物栏和小型卡牌网格 |
| 参考资料 | `/reference` | 所有项目均可点击--章节、进阶、关键词、充能球、苦难、意图、修改器、成就 |
| 图像 | `/images` | 可浏览的游戏资源，支持按类别下载 ZIP |
| 更新日志 | `/changelog` | 游戏更新之间的数据差异 |
| 关于 | `/about` | 项目信息、统计数据、流水线可视化 |
| 致谢 | `/thank-you` | Ko-fi 支持者和社区贡献者（从“关于”页面拆分，以便直接链接） |
| Knowledge Demon | `/knowledge-demon` | Discord 机器人信息页--斜杠命令、管理功能、安装行动号召 |
| 新闻 | `/news` | 镜像的 Steam 公告源；规范链接指回 Steam，因此是补充而非重复 |
| 新闻文章 | `/news/[gid]` | 单篇 Steam 公告，包含已净化的 BBCode 正文和 `NewsArticle` JSON-LD |
| 梯队榜 | `/tier-list` | 卡牌/遗物/药水的 Codex Score 梯队榜中心（S → F 级） |
| 梯队榜详情 | `/tier-list/[type]` | 某一实体类型的可视化 S/A/B/C/D/F 行，数据来自 `/api/runs/scores/{type}` |
| 评分 | `/leaderboards/scoring` | Codex Score 方法说明页--贝叶斯收缩、先验权重、量表范围、梯队阈值 |

## API 端点

所有数据端点都接受可选的 `?lang=` 查询参数（默认：`eng`）。响应会使用 **GZip 压缩**，并通过 `Cache-Control: public, max-age=300` 缓存。

| 端点 | 描述 | 筛选器 |
|---|---|---|
| `GET /api/cards` | 所有卡牌 | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | 单张卡牌 | `lang` |
| `GET /api/characters` | 所有角色 | `search`, `lang` |
| `GET /api/characters/{id}` | 单个角色（含台词、对话） | `lang` |
| `GET /api/relics` | 所有遗物 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | 单个遗物 | `lang` |
| `GET /api/monsters` | 所有怪物 | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | 单个怪物 | `lang` |
| `GET /api/potions` | 所有药水 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | 单个药水 | `lang` |
| `GET /api/enchantments` | 所有附魔 | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | 单个附魔 | `lang` |
| `GET /api/encounters` | 所有遭遇 | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | 单个遭遇 | `lang` |
| `GET /api/events` | 所有事件 | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | 单个事件 | `lang` |
| `GET /api/powers` | 所有能力 | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | 单个能力 | `lang` |
| `GET /api/keywords` | 卡牌关键词定义 | `lang` |
| `GET /api/keywords/{id}` | 单个关键词 | `lang` |
| `GET /api/intents` | 怪物意图类型 | `lang` |
| `GET /api/intents/{id}` | 单个意图 | `lang` |
| `GET /api/orbs` | 所有充能球 | `lang` |
| `GET /api/orbs/{id}` | 单个充能球 | `lang` |
| `GET /api/afflictions` | 卡牌苦难 | `lang` |
| `GET /api/afflictions/{id}` | 单个苦难 | `lang` |
| `GET /api/modifiers` | 游戏局修改器 | `lang` |
| `GET /api/modifiers/{id}` | 单个修改器 | `lang` |
| `GET /api/achievements` | 所有成就 | `lang` |
| `GET /api/achievements/{id}` | 单个成就 | `lang` |
| `GET /api/badges` | 所有游戏局结束徽章 | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | 含等级明细的单个徽章 | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | 各实体的版本历史（不区分大小写，最新优先） | - |
| `GET /api/epochs` | 时间线纪元 | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | 单个纪元 | `lang` |
| `GET /api/stories` | 故事条目 | `lang` |
| `GET /api/stories/{id}` | 单个故事 | `lang` |
| `GET /api/acts` | 所有章节 | `lang` |
| `GET /api/acts/{id}` | 单个章节 | `lang` |
| `GET /api/ascensions` | 进阶等级（0–10） | `lang` |
| `GET /api/ascensions/{id}` | 单个进阶等级 | `lang` |
| `GET /api/stats` | 所有类别的实体数量 | `lang` |
| `GET /api/languages` | 带显示名称的可用语言 | - |
| `GET /api/translations` | 筛选值和 UI 字符串的翻译映射 | `lang` |
| `GET /api/images` | 图像类别及文件列表。测试版前缀类别接受 `?version=`。 | - |
| `GET /api/images/beta/versions` | 可用的测试版图像归档版本及 `latest` 符号链接目标 | - |
| `GET /api/images/{category}/download` | 下载图像类别的 ZIP。测试版类别接受 `?version=`。 | - |
| `GET /api/changelogs` | 更新日志摘要（所有版本） | - |
| `GET /api/changelogs/{tag}` | 某版本标签的完整更新日志 | - |
| `GET /api/guides` | 社区指南 | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | 单篇指南（含 Markdown 内容） | - |
| `POST /api/guides` | 提交指南（代理至 Discord） | - |
| `POST /api/runs` | 提交游戏局（.run 文件 JSON） | `username` |
| `GET /api/runs/list` | 列出/浏览已提交的游戏局 | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | 按哈希获取完整游戏局数据（合并数据库中的 `username`） | - |
| `GET /api/runs/stats` | 聚合的社区统计 | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | 仅含胜利的排名榜 | `category`（`fastest`, `highest_ascension`）、`character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | 单个获胜游戏局在其榜单中的排名 | `category` |
| `GET /api/runs/scores/{type}` | 每个实体的 Codex Score（经贝叶斯收缩的胜率分数 + S/A/B/C/D/F 级） | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | 各遭遇的聚合数据（出现次数、致死率、平均伤害/回合数） | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | 按哈希将用户名附加到先前提交的游戏局 | - |
| `GET /api/runs/versions` | 已提交游戏局中的不同游戏版本 | - |
| `GET /api/exports/{lang}` | 某种语言全部实体 JSON 的 ZIP | `lang` |
| `GET /api/news` | Steam 公告和社区新闻（本地归档） | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | 单篇新闻文章（原始 HTML/BBCode 正文） | - |
| `GET /api/merchant/config` | 自动提取的商人定价配置 | - |
| `POST /api/feedback` | 提交反馈（代理至 Discord） | - |
| `GET /api/versions` | 当前数据根目录公开的版本元数据 | - |

**用户账户**（Cookie/JWT 会话；使用 Steam 或 Discord 登录）：

| 端点 | 描述 |
|---|---|
| `GET /api/auth/me` | 当前已登录用户 |
| `GET /api/auth/steam/redirect` | 开始 Steam OpenID 登录 |
| `GET /api/auth/discord/start` | 开始 Discord OAuth 登录 |
| `POST /api/auth/logout` | 清除会话 Cookie |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | 更新个人资料字段 |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | 列出、上传和移除用户的游戏局 |
| `GET /api/auth/stats` | 各用户的聚合统计（个人资料页） |
| `GET /api/auth/personal-bests` | 最快单人/合作、最高进阶、今日及历史每日最佳 |
| `GET /api/auth/competitive` | 今日每日排行榜、全球排名、与社区对比的胜率 |

每个 IP 的速率限制为**每分钟 60 次请求**。反馈和指南提交限制为每个 IP **每分钟 3–5 次**。交互式文档位于 `/docs`（Swagger UI）。

### 本地化

所有游戏数据均使用 Slay the Spire 2 自带的本地化文件，以 15 种语言提供。向任意数据端点传递 `?lang=`。使用 `?channel=beta` 获取当前公共测试版数据；归档的测试版图像集使用 `?version=`。

| 代码 | 语言 | 代码 | 语言 |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**已本地化的内容**：源自游戏的实体名称和描述、卡牌类型、稀有度、关键词、能力、遭遇、角色名称、分区标题、本地化路由以及大多数共享 UI 标签。

**保持英文的内容**：API 标识符和结构化筛选值，例如 `room_type`、能力的 `type`/`stack_type` 和 `pool`，以及产品品牌和部分编辑或社区创作内容。

无论使用哪种语言，筛选参数（`type=Attack`、`rarity=Rare`、`keyword=Exhaust`）始终使用英文值--后端会先将其翻译为本地化等效值，再进行匹配。

示例：`GET /api/cards?lang=kor&type=Attack` 会返回类型为“공격”的韩语卡牌数据；尽管参数使用英文，筛选仍能正确执行。

### 富文本格式

文本字段（`description`、`loss_text`、`flavor`、对话 `text`、选项 `title`/`description`）可能包含从游戏本地化数据中保留的 Godot BBCode 风格标签：

| 标签 | 类型 | 示例 | 渲染结果 |
|---|---|---|---|
| `[gold]...[/gold]` | 颜色 | `[gold]Enchant[/gold]` | 金色文本 |
| `[red]...[/red]` | 颜色 | `[red]blood[/red]` | 红色文本 |
| `[blue]...[/blue]` | 颜色 | `[blue]2[/blue]` | 蓝色文本 |
| `[green]...[/green]` | 颜色 | `[green]healed[/green]` | 绿色文本 |
| `[purple]...[/purple]` | 颜色 | `[purple]Sharp[/purple]` | 紫色文本 |
| `[orange]...[/orange]` | 颜色 | `[orange]hulking figure[/orange]` | 橙色文本 |
| `[pink]...[/pink]` | 颜色 | - | 粉色文本 |
| `[aqua]...[/aqua]` | 颜色 | `[aqua]Ascending Spirit[/aqua]` | 青色文本 |
| `[sine]...[/sine]` | 效果 | `[sine]swirling vortex[/sine]` | 波浪动画文本 |
| `[jitter]...[/jitter]` | 效果 | `[jitter]CLANG![/jitter]` | 抖动动画文本 |
| `[b]...[/b]` | 效果 | `[b]bold text[/b]` | 粗体文本 |
| `[i]...[/i]` | 效果 | `[i]whispers[/i]` | 斜体文本 |
| `[energy:N]` | 图标 | `[energy:2]` | 能量图标 |
| `[star:N]` | 图标 | `[star:1]` | 星星图标 |
| `[Card]`, `[Relic]` | 占位符 | `[Card]` | 运行时动态内容（斜体） |

标签可以嵌套：`[b][jitter]CLANG![/jitter][/b]`、`[gold][sine]swirling vortex[/sine][/gold]`。

如果直接使用 API，可以用类似 `\[/?[a-z]+(?::\d+)?\]` 的正则表达式移除这些标签，或在自己的前端中渲染它们。`description_raw` 字段（如有）包含尚未解析的 SmartFormat 模板。

## 本地运行

### 前置要求

- Python 3.10+
- Node.js 20+

### 后端

```bash
python -m venv venv
source venv/bin/activate      # Windows：venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

后端运行于 **http://localhost:8000**。

### 前端

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

前端运行于 **http://localhost:3000**。

### Docker

```bash
docker compose up --build
```

启动两个服务（后端使用 8000 端口，前端使用 3000 端口）。

### 环境变量

核心只读 API 无需配置。以下可选功能由环境变量启用（在后端环境或 compose 文件中设置）：

| 变量 | 使用方 | 说明 |
|---|---|---|
| `MONGO_URL` | 后端 | 游戏局数据库（社区统计、排行榜、账户）。未设置时，后端会回退到旧版 SQLite 路径（`data/runs.db`）。 |
| `JWT_SECRET` | 后端 | 为用户账户会话令牌签名。 |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | 后端 | Discord OAuth 登录。 |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | 后端 | OAuth 重定向/返回 URL。 |
| `ENVIRONMENT` | 后端 | `production` 会启用安全 Cookie 行为。 |
| `NEXT_PUBLIC_API_URL` | 前端（构建） | API 基础地址；生产环境中为空，使图像/数据通过同源解析。 |
| `NEXT_PUBLIC_CDN_URL` | 前端（构建） | 设置后（例如 `https://cdn.spire-codex.com`），图像将从 CDN 而非 `/static` 加载。 |
| `NEXT_PUBLIC_SITE_URL` | 前端（构建） | 用于元数据的规范网站 URL。 |

用户账户和 CDN 默认关闭，因此即使不设置任何这些变量，项目也能端到端运行。

## 更新流水线

新游戏版本发布时，一个跨平台 Python 脚本会处理完整更新工作流：

```bash
# 完整流水线--提取游戏文件、解析数据、渲染图像、复制图像：
python3 tools/update.py

# 手动指定游戏安装路径：
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# 跳过提取（已有最新的 extraction/ 目录）：
python3 tools/update.py --skip-extract

# 仅重新解析数据（不提取或渲染）：
python3 tools/update.py --parse-only

# 仅重新渲染 Spine 图像：
python3 tools/update.py --render-only

# 更新后生成更新日志：
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

该脚本会自动检测操作系统并查找 Steam 安装目录。各步骤要求如下：

| 步骤 | 工具 | 安装 |
|---|---|---|
| PCK 提取 | `gdre_tools` | [GDRE Tools 发布页](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL 反编译 | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| 数据解析 | Python 3.10+ | 内置 |
| 图像复制 | Python 3.10+ | 内置 |
| Spine 渲染 | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### 手动步骤

如果希望单独运行各步骤：

```bash
# 解析所有数据（全部 15 种语言）
cd backend/app/parsers && python3 parse_all.py

# 解析单种语言
cd backend/app/parsers && python3 parse_all.py --lang eng

# 将图像从提取目录复制到静态目录（从同一源生成 PNG + WebP--不经过
# 现有后端 WebP 的有损转换链）。WebP quality=95，method=6。
python3 backend/scripts/copy_images.py

# 渲染 Spine 图像（WebGL--无三角形接缝伪影）
cd tools/spine-renderer && npm install
npx playwright install chromium           # 仅首次需要
node render_all_webgl.mjs                 # 通过无头 Chrome 渲染全部 138 个骨骼
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# 常用的单怪物覆盖参数：
#   --skin=moss1,diamondeye   将变体皮肤与默认皮肤组合（cubex_construct）
#   --skin=skin1              将默认皮肤替换为变体（scroll_of_biting）
#   --anim-time=0.5           截图前将动画推进 N 秒
#   --anim=attack             覆盖自动选择的待机动画
#
# 烟雾占位图替换：gas_bomb_2.png、the_forgotten_2.png 和
# living_smog_2.png 在源文件中是洋红色的“Smoke Placeholder”板。
# render_webgl.mjs 会在 GL 上传前将它们替换为同尺寸、程序生成的
# 深梅色烟云，然后在替换后的槽位上强制设置 slot.color.a = 1.0
#（美术人员设置了低透明度，并预期由着色器处理）。

# 重新调整过小怪物图像的构图（后处理--裁剪到真实 alpha
# 边界框，并缩放以填满约 92% 的 512x512 画面）：
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# 旧版 Canvas 渲染器（存在三角形接缝伪影--避免使用）
# node render_all.mjs / node render.mjs
```

## 更新日志系统

通过所有实体类别的字段级差异，跟踪游戏更新之间的变化。

### 生成更新日志

```bash
# 将当前数据与 git 引用比较：
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# 以文本或 Markdown 形式预览：
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### 更新日志架构

每个更新日志 JSON 文件包含：

| 字段 | 描述 |
|---|---|
| `app_id` | Steam App ID（2868840） |
| `game_version` | Steam 游戏版本（例如 `"0.98.2"`） |
| `build_id` | Steam 构建 ID |
| `tag` | 唯一版本键（例如 `"1.0.3"`） |
| `date` | 更新日期 |
| `title` | 易读标题 |
| `summary` | 数量：`{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | 手工整理的发布说明。使用 `diff_data.py` 重新生成现有标签时会保留--数据差异会被覆盖，但这些数组会合并保留。 |
| `categories` | 各类别的差异，包括新增/移除/变更的实体。字段变化会递归进入嵌套字典/列表，因此每个叶节点都有独立的一行（例如 `vars.DamageVar: 8 → 10`），而不是不透明的 `vars: 2 fields → 2 fields`。 |

### 一次写入保留策略

`data/changelogs/` 下的文件是一次写入的历史记录。`.github/workflows/changelog-guard.yml` 会阻止任何**修改或删除**现有更新日志的 PR。始终允许新文件（`A`）；修改则需要为 PR 添加 `changelog-edit-approved` 标签。有关策略和覆盖工作流，请参阅 `CONTRIBUTING.md → Changelog Retention`。

### 各实体历史

`GET /api/history/{entity_type}/{entity_id}` 会遍历每个更新日志，并按最新优先的顺序返回涉及所请求实体的条目。每个详情页（`/cards/{id}`、`/monsters/{id}` 等）上的版本历史侧栏均由此端点提供支持。

## 部署

### CI/CD（GitHub Actions）

推送到 `main` 会在自托管 Kubernetes 运行器上触发 `.github/workflows/ci.yml`。工作流会执行密钥扫描、ESLint 和 TypeScript 检查、ruff lint 和格式检查，然后构建稳定版镜像并以 `:latest` 标签推送。它还会继续为 `docker-compose.beta.yml` 构建独立测试版镜像并使用 `:beta` 标签；这些镜像会保留用于运维，但公共测试版页面由主部署在 `/beta` 提供。

稳定版前端接收 `UMAMI_WEBSITE_ID`。独立测试版镜像接收 `UMAMI_BETA_WEBSITE_ID`，但公共 `/beta` 流量使用稳定版前端及其分析属性。

CI **不会**执行部署。DigitalOcean 主机上的每小时自动部署任务负责部署。

> **注意：**`.forgejo/workflows/build.yml` 被保留为未启用的、基于 buildah 的后备方案。

### 本地构建并推送

跳过 CI，直接从本机推送：

```bash
# 构建并推送两个镜像：
python3 tools/deploy.py

# 仅前端：
python3 tools/deploy.py --frontend

# 仅后端：
python3 tools/deploy.py --backend

# 测试构建但不推送：
python3 tools/deploy.py --no-push

# 为发布版本添加标签：
python3 tools/deploy.py --tag v0.98.2

# 构建并推送测试版镜像（:beta 标签，跳过 IndexNow）：
python3 tools/deploy.py --beta
```

脚本会自动检测 Apple Silicon，并通过 `docker buildx` 交叉编译为 `linux/amd64`。需要先执行 `docker login`。

### 生产环境

公共应用和保留的独立测试版栈运行在同一台 DigitalOcean 主机上。公共流量使用 `spire-codex.com`；辅助 Lightsail 主机运行 MongoDB。

**自动部署**--DigitalOcean 主机上的每小时 cron 会在每小时的 :03 运行 `/usr/local/bin/spire-codex-autodeploy`。当检出的提交发生变化时，它会拉取并重新创建 `docker-compose.prod.yml` 和 `docker-compose.beta.yml`，但仅涉及 `data/news/*` 的更新除外。随后会清除 Cloudflare 缓存。日志写入 `/var/log/spire-codex-autodeploy.log`。有关安装和运维，请参阅 [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md)。

**手动部署**：

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# 保留的独立测试版栈
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

生产数据通过绑定挂载提供（前端为 `./data:/data:ro`，后端为读写）。新闻和游戏局状态会在请求时从挂载数据中读取，因此更新 `data/news/*.json` 无需重启容器。

### 测试频道（spire-codex.com/beta）

公共应用将稳定版和 Steam `public-beta` 数据作为两个内容频道提供。测试版页面位于 [`spire-codex.com/beta`](https://spire-codex.com/beta)，本地化路由位于 `/{lang}/beta/...`。主 `/images` 页面也会公开归档的测试版资源版本。

`beta.spire-codex.com` 已不再供公众使用。Cloudflare 当前会发送保留路径的 `302` 到根域名，但不会添加 `/beta` 或 `channel=beta`。因此，旧页面链接会进入对应的稳定版页面，而旧 API 请求在跟随重定向后会收到稳定版数据。新的 API 客户端必须使用主 API 并明确指定频道，例如 `https://spire-codex.com/api/cards?channel=beta`。

**架构**：`get_channel` 将 `?channel=beta|stable` 解析到 Python `ContextVar` 中；它也能识别用于直接访问源站流量的 `beta.*` Host 标头。`data_service.py` 从 `data-beta/<latest>/` 加载测试版请求，并按文件回退到稳定版。`GET /api/beta/diff` 和 `GET /api/beta/version` 描述当前测试版，前端则在 `/beta` 下渲染所选频道。

独立的 `docker-compose.beta.yml` 栈和 `:beta` 镜像仍会由部署自动化构建和重新创建。Cloudflare 重定向启用期间，它们并非公共测试版网站。

**数据布局**：每个归档构建都位于 `data-beta/<version>/` 下，`latest` 指针选择当前构建。每个版本都有自己的 `changelogs/` 目录。测试版图像归档在 `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/` 中采用相同布局。

**自动摄取**--`tools/beta-watch/` 在开发用 Mac 上以 launchd 任务运行，每周四 15:00 至 22:45 每 15 分钟执行一次。当 SteamCMD 报告新的 `public-beta` 构建 ID 时，它会提取并反编译游戏、解析每种语言、生成差异、同步版本化图像，并创建 `auto/beta-<version>` PR。有关安装和运维，请参阅 [`tools/beta-watch/README.md`](tools/beta-watch/README.md)。

**手动摄取**：

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# 首先提取并反编译测试版游戏文件，然后从仓库根目录进行解析。
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` 会更新 `latest` 图像符号链接。摄取 PR 包含版本化数据和图像变更；合并后，自动部署会刷新两个保留的栈。

## Spine 渲染器

StS2 中的怪物图像是 [Spine](http://esotericsoftware.com/) 骨骼动画--每个怪物由 `.skel`（二进制骨骼）+ `.atlas` + `.png` 精灵图集组成，而非单张图像。渲染器会将它们组合为静态肖像 PNG。

### WebGL 渲染器（当前）

WebGL 渲染器（`render_webgl.mjs`、`render_all_webgl.mjs`）使用 **Playwright + spine-webgl**，通过无头 Chrome 的 GPU 渲染骨骼。由此可生成干净且**无三角形接缝伪影**的渲染图。

**工作原理：**
1. 通过 Playwright 启动启用 WebGL 的无头 Chrome
2. 将骨骼数据、图集和纹理以 base64 形式加载到浏览器页面中
3. 创建 WebGL Canvas，并设置 spine-webgl 着色器和多边形批处理器
4. 应用待机动画，计算边界（排除阴影/地面槽位）
5. 通过 GPU 三角形光栅化进行渲染--无 Canvas 裁剪路径，无接缝
6. 通过 `gl.readPixels` 读取原始像素并垂直翻转（WebGL 从底部向上）
7. 通过 node-canvas 写入 PNG，以保留透明度

**单个骨骼：**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**批量处理所有骨骼：**
```bash
node render_all_webgl.mjs  # 将 138 个骨骼渲染到 backend/static/images/renders/
```

### 渲染覆盖范围

| 类别 | 已渲染 | 总数 | 说明 |
|---|---|---|---|
| 怪物 | 99 | 103 个目录 | 全部 111 个游戏怪物都有图像（99 个渲染图 + 别名/静态图） |
| 角色 | 16 | 16 | 战斗、休息点和选择姿势 |
| 背景/NPC | 14 | 17 | Neow、Tezcatara、商人房间、主菜单 |
| VFX/UI | 9 | 22 | 大多数 VFX 需要特定动画帧 |
| **总计** | **138** | **158** | 跳过 20 个（无图集、仅 VFX、空白） |

### 动画渲染器

动画渲染器（`render_gif.mjs`）会将 Spine 待机/攻击动画渲染为动态 WebP、GIF 或 APNG。支持皮肤变体、动画选择，以及针对大型动画将帧流式写入磁盘。

**支持的输出格式：**
- **`.webp`**（推荐）--带完整 alpha 的无损动态 WebP，比 APNG 小约 33%。帧会流式写入磁盘，以避免内存不足。
- **`.gif`**--256 色、二值透明度。文件最小，但质量最低。
- **`.apng`**--与 WebP 一样支持完整 alpha，但文件更大。

```bash
# 渲染无损动态 WebP（推荐）
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# 使用皮肤变体（适用于 bowlbug、cultists、cubex 等）
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# 指定动画（默认：待机循环）
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# 白色剪影模式（用于 Boss 地图节点图标）
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**动画库：**209 个无损动态 WebP：
- 15 个 512×512 角色动画（战斗/选择/休息 × 5 个角色）
- 103 个 256×256 怪物待机动画
- 91 个 256×256 怪物攻击动画

**皮肤变体：**13 个怪物拥有皮肤变体（bowlbug、cubex_construct、cultists 等）。使用 `--skin=` 选择。默认皮肤通常只显示不含身体的基础骨骼。

**Boss 地图节点着色器：**游戏使用 `boss_map_point.gdshader`，它将 RGB 通道视为遮罩：
- **红色通道** × `map_color`（默认：米色 `0.671, 0.58, 0.478`）→ 填充颜色
- **蓝色通道** × `black_layer_color`（默认：黑色 `0, 0, 0`）→ 轮廓颜色
- **绿色通道** × 白色 `1, 1, 1` → 高光

### 旧版 Canvas 渲染器

Canvas 渲染器（`render.mjs`、`render_all.mjs`）使用启用了 `triangleRendering = true` 的 `spine-canvas`。由于相邻三角形之间 Canvas `clip()` 路径的抗锯齿，它会产生**可见的线框网格伪影**。请改用 WebGL 渲染器。

### 依赖项

- `@esotericsoftware/spine-webgl` ^4.2.107 - 用于 WebGL 的 Spine 运行时（当前）
- `playwright` - 用于 WebGL 渲染的无头 Chrome
- `gif-encoder-2` - 动画渲染器的 GIF 编码
- `canvas` ^3.1.0 - Node.js Canvas 实现（动画渲染器的帧缓冲区）
- `Pillow`（Python）- 从渲染后的 PNG 帧组合 WebP/APNG
- `@esotericsoftware/spine-canvas` ^4.2.106 - 用于 Canvas 的 Spine 运行时（旧版）

## 提取游戏文件

如果需要从头开始提取：

```bash
# 提取 PCK（GDRE Tools）
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# 反编译 DLL（ILSpy CLI）
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam 安装位置：
- **Windows**：`C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**：`~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**：`~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## 版本规则

Spire Codex 使用 **`1.X.Y`** 语义化版本：

| 段 | 含义 |
|---------|---------|
| **1** | Spire Codex 主版本（除非完全重写，否则保持不变） |
| **X** | Mega Crit 发布游戏补丁时递增 |
| **Y** | 我们修复和改进解析器/前端时递增 |

示例：`v1.0.0` = 首次发布，`v1.0.1` = 我们的错误修复，`v1.1.0` = 纳入 Mega Crit 的第一个补丁。

## SEO

- **结构化数据（JSON-LD）**：WebSite + VideoGame（首页）、CollectionPage + ItemList（列表页）、Article + BreadcrumbList + FAQPage（详情页）、SoftwareApplication（开发者）、NewsArticle（news/[gid]）
- **标题格式**：`"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"`--所有页面统一使用。游戏局使用 `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`。将“(sts2)”内联，以匹配跨语言区域的 `sts2 tier list` / `sts2 card list` 查询。
- **站点地图**：`/sitemap.xml` 上的扁平 XML，使用 `force-dynamic`（在服务器端而非构建时渲染）。包含约 20,000 多个 URL，包括实体详情页、浏览矩阵页、梯队榜页面、评分方法、runs/[hash] 详情，以及所有实体类型的 i18n 镜像
- **国际化 SEO**：为 14 种非英语语言提供 `/{lang}/` 路由，并使用**双向** hreflang 备用链接--英文根页面也会通过 `lib/seo.ts` 中的 `buildLanguageAlternates(path)` 为每个区域设置和 `x-default` 输出备用链接（修复 GSC 的“已抓取 - 尚未编入索引”重复内容集群；此前 Google 因缺少反向引用而将本地化页面视为重复页面）
- **程序化 SEO**：`/cards/browse/` 下的 41 个卡牌浏览页面（rare-attacks、ironclad-skills 等）+ 3 个梯队榜页面（`/tier-list/{cards,relics,potions}`）
- **语言区域感知的 EntityProse**：详情页会渲染一小段对应语言区域的文本，而不是在每个语言区域中使用完全相同的英文正文
- **内部链接**：能力 ↔ 卡牌、遭遇 → 怪物、卡牌关键词 → 关键词中心页面、怪物招式 → 能力页面（带工具提示）、章节页面 → 遭遇/事件、梯队榜行 → 实体详情的 Stats 标签页
- **Open Graph 和 Twitter Cards**：各实体 OG 图像、`summary_large_image` Twitter Cards
- **规范 URL**：每个页面都声明规范 URL

## 可嵌入小组件

### 工具提示小组件
为任意网站上的全部 13 种实体类型添加悬停工具提示：
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>从 [[Bash]] 和 [[relic:Burning Blood]] 开始。</p>
```

### 更新日志小组件
嵌入交互式更新日志查看器：
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

完整文档：[spire-codex.com/developers](https://spire-codex.com/developers)

## 路线图

- ~~独立详情页~~ ✅
- ~~全局搜索~~ ✅
- ~~多语言支持（15 种语言）~~ ✅
- ~~SEO（JSON-LD、OG/Twitter、站点地图、hreflang）~~ ✅
- ~~工具提示小组件（全部 13 种实体类型）~~ ✅
- ~~角色比较页面（10 组）~~ ✅
- ~~关键词中心页面~~ ✅
- ~~商人指南（价格来自反编译的 C#）~~ ✅
- ~~开发者文档 + 数据导出~~ ✅
- ~~国际化 SEO（13 个语言落地页）~~ ✅
- ~~卡牌浏览矩阵（41 个程序化 SEO 页面）~~ ✅
- ~~社区指南~~ ✅ - 带 YAML 前置元数据的 Markdown、提交表单、工具提示小组件、作者社交链接
- ~~游戏机制页面~~ ✅ - 27 个独立 SEO 页面：掉落率、战斗、地图、Boss、秘密与趣闻
- ~~社区游戏局~~ ✅ - 游戏局提交、浏览器、共享游戏局、实时统计
- ~~卡牌升级描述~~ ✅ - 全部 403 张可升级卡牌的 upgrade_description
- ~~怪物固有能力~~ ✅ - 42 个怪物具有来自 AfterAddedToRoom 的能力
- ~~成就解锁条件~~ ✅ - 来自 C# 源代码的类别、角色、阈值
- ~~怪物攻击模式~~ ✅ - 112 个怪物具有来自 C# 状态机的循环/随机/条件/混合 AI
- ~~事件前置条件~~ ✅ - 25 个事件具有从 C# 源代码解析的 IsAllowed() 条件
- ~~测试版归档保留~~ ✅ - 版本化测试版数据和图像会持续保留；`/beta` 提供当前构建，`/images` 可浏览归档资源
- ~~Discord 机器人~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com)：适用于每种实体的斜杠命令（`/card`、`/relic`、`/monster`、`/potion`、`/character`、`/event`、`/power`、`/enchantment`、`/lookup`、`/meta`）、Steam 新闻 RSS，以及从 [Kernel](https://github.com/ptrlrd/kernel) 分支而来的完整管理工具包
- ~~Codex Score 和梯队榜~~ ✅ - 使用**贝叶斯收缩**根据社区游戏局计算各实体等级：`shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`，随后缩放到 0–100 并映射为 S/A/B/C/D/F。可防止小样本噪声（只进行过 1 局且胜率为 1/1 的卡牌不会获得 S--它会向先验值回归）。后端启动时预热。在详情页 Stats 标签中的 `ScoreBadge`、专用梯队榜页面及 `/leaderboards/scoring` 的方法说明页中展示。
- ~~详情页 Stats 标签~~ ✅ - 通过 `EntityRunStats` 提供评分主徽章、文字摘要和近期游戏局链接。
- **牌组构建器** - 交互式牌组理论构筑
- **数据库后端** - 使用 PostgreSQL JSONB（或其他方案）替代各语言 JSON 加载。游戏局提交存储已从 SQLite 迁移至 MongoDB（2026 年 5 月）。

## 致谢

感谢 **vesper-arch**、**terracubist**、**U77654**、**Purple Aspired Dreaming**、**Kobaru** 和 **Severi** 参与 QA 测试、提交错误报告并作出贡献。完整支持者名单--包括帮助项目持续运行的 Ko-fi 捐助者--位于 [spire-codex.com/thank-you](https://spire-codex.com/thank-you)。

## 技术栈

- **后端**：Python、FastAPI、Pydantic、slowapi、GZip 压缩
- **游戏局数据库**：MongoDB（社区统计、排行榜、用户账户），包含物化的 `stats_summary` 集合和由选举出的领导者运行的后台刷新器。保留旧版 SQLite 路径作为离线后备。
- **账户**：Steam OpenID + Discord OAuth、JWT 会话 Cookie
- **前端**：Next.js 16（App Router）、TypeScript、Tailwind CSS、支持 15 种语言
- **图像/CDN**：通过 `cdn.spire-codex.com` 提供的 Cloudflare R2（webp）
- **分析和可观测性**：自托管 Umami、Prometheus + node-exporter
- **Spine 渲染器**：Node.js、Playwright、@esotericsoftware/spine-webgl（通过无头 Chrome 使用 WebGL）
- **基础设施**：Docker、使用注册表后端 BuildKit 缓存的 GitHub Actions CI（自托管运行器）、Ansible/SSH 部署
- **工具**：Python（更新流水线、更新日志差异比较、图像复制）

## 许可证

- **源代码**：[PolyForm Noncommercial 1.0.0](LICENSE.md)--可为非商业目的免费使用、修改和再分发。不允许销售本软件。
- **托管 API**：[API_TERMS.md](API_TERMS.md)--在公布的速率限制内可免费用于任何用途；如需更多配额，请通过 Discord 或 Issue 联系。
- **游戏数据**（卡牌、遗物、怪物等）：© Mega Crit Games。此处作为社区参考资料，依据合理使用/教育条款提供。请勿使用这些数据重新编译、重新打包或再分发游戏。

贡献将按照相同的 PolyForm Noncommercial 1.0.0 条款接受--请参阅 [CONTRIBUTING.md](CONTRIBUTING.md#license)。
